// Port interfaces for the enclave signer.
// These define the boundaries between domain logic and infrastructure.

use async_trait::async_trait;
use crate::domain::{TransactionIntent, PolicyVerdict, PQSignature, EnclaveError};

/// Port for semantic policy evaluation (Thread A target).
/// Implemented by the SLM HTTP client in infrastructure.
#[async_trait]
pub trait PolicyEvaluatorPort: Send + Sync {
    /// Evaluate a transaction intent against security policies.
    /// Returns the SLM's verdict (approve/deny with reasoning).
    async fn evaluate(&self, intent: &TransactionIntent) -> Result<PolicyVerdict, EnclaveError>;
}

/// Port for post-quantum signing operations.
/// Implemented by the ML-DSA signer in domain.
#[async_trait]
pub trait SignerPort: Send + Sync {
    /// Pre-compute ML-DSA nonces for speculative signing (Thread B).
    /// Returns opaque nonce data that can be finalized later.
    async fn precompute_nonces(&self, message: &[u8]) -> Result<Vec<u8>, EnclaveError>;

    /// Finalize a signature using pre-computed nonces.
    /// Only called if the policy verdict is approved.
    async fn finalize_signature(
        &self,
        message: &[u8],
        nonces: Vec<u8>,
    ) -> Result<PQSignature, EnclaveError>;
}
