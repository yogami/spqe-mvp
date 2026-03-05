// SPQE: Speculative Post-Quantum Enclave Signer
//
// Entry point for the Nitro Enclave signer service.
// Initializes the PQ keypair, wires the speculative engine,
// and starts the HTTP server on vsock (or TCP for local dev).

mod domain;
mod ports;
mod application;
mod infrastructure;

use std::sync::Arc;
use std::time::Duration;

use tracing_subscriber::EnvFilter;

use crate::domain::policy_engine::PolicyEngine;
use crate::domain::pq_signer::{PQSigner, AsyncPQSigner};
use crate::domain::speculative_engine::SpeculativeEngine;
use crate::infrastructure::slm_client::SLMClient;
use crate::application::sign_intent::SignIntentUseCase;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize structured logging
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .json()
        .init();

    tracing::info!("SPQE Enclave Signer starting...");

    // Configuration from environment
    let slm_url = std::env::var("SLM_URL")
        .unwrap_or_else(|_| "http://localhost:8080".to_string());
    let port: u16 = std::env::var("PORT")
        .unwrap_or_else(|_| "5000".to_string())
        .parse()
        .expect("PORT must be a valid u16");
    let eval_timeout_ms: u64 = std::env::var("EVAL_TIMEOUT_MS")
        .unwrap_or_else(|_| "20".to_string())
        .parse()
        .expect("EVAL_TIMEOUT_MS must be a valid u64");

    // Initialize ML-DSA-65 keypair
    tracing::info!("Generating ML-DSA-65 keypair...");
    let pq_signer = PQSigner::new()?;
    let (pk, _) = pq_signer.keypair();
    tracing::info!(
        pk_len = pk.len(),
        "ML-DSA-65 keypair ready (public key: {} bytes)",
        pk.len()
    );

    // Wire dependencies
    // 2. Initialize Infrastructure & Ports
    let slm_client = Arc::new(SLMClient::new(slm_url.clone(), Duration::from_millis(eval_timeout_ms)));
    let signer = Arc::new(AsyncPQSigner::new(pq_signer));
    let local_policy = Arc::new(PolicyEngine::new());

    // 3. Setup Application Use Case
    let use_case = Arc::new(SignIntentUseCase::new(
        slm_client,
        signer,
        local_policy,
        Duration::from_millis(eval_timeout_ms),
    ));

    tracing::info!(
        slm_url = %slm_url,
        port = port,
        eval_timeout_ms = eval_timeout_ms,
        "SPQE Enclave Signer ready — speculative parallelization active"
    );

    // Start HTTP server
    infrastructure::vsock_server::start_server(use_case, port).await?;

    Ok(())
}
