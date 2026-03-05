// SLM Client: HTTP client for the policy evaluator (GPU instance)
//
// Implements PolicyEvaluatorPort. Sends TransactionIntent to the Python
// FastAPI service running on the GPU instance for semantic evaluation.

use reqwest::Client;
use std::time::Duration;
use tracing::{info, instrument};

use crate::domain::{TransactionIntent, PolicyVerdict, EnclaveError};
use crate::ports::PolicyEvaluatorPort;

/// HTTP client for the semantic policy evaluator (SLM on GPU).
pub struct SLMClient {
    client: Client,
    base_url: String,
}

impl SLMClient {
    pub fn new(base_url: String, timeout: Duration) -> Self {
        let client = Client::builder()
            .timeout(timeout)
            .pool_max_idle_per_host(10)
            .build()
            .expect("HTTP client should build");

        Self { client, base_url }
    }
}

#[async_trait::async_trait]
impl PolicyEvaluatorPort for SLMClient {
    #[instrument(skip(self), fields(url = %self.base_url))]
    async fn evaluate(&self, intent: &TransactionIntent) -> Result<PolicyVerdict, EnclaveError> {
        let url = format!("{}/evaluate", self.base_url);

        let response = self
            .client
            .post(&url)
            .json(intent)
            .send()
            .await
            .map_err(|e| EnclaveError::Network(format!("SLM request failed: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(EnclaveError::Network(format!(
                "SLM returned {}: {}",
                status, body
            )));
        }

        let verdict: PolicyVerdict = response
            .json()
            .await
            .map_err(|e| EnclaveError::Serialization(format!("Failed to parse verdict: {}", e)))?;

        info!(
            approved = verdict.approved,
            risk_score = verdict.risk_score,
            "SLM evaluation complete"
        );

        Ok(verdict)
    }
}
