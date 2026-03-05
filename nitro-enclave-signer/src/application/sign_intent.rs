// Sign Intent Use Case
//
// Application-layer orchestration that wires together the speculative engine,
// PQ signer, and SLM client into a single entry point.

use std::sync::Arc;

use crate::domain::speculative_engine::SpeculativeEngine;
use crate::domain::{TransactionIntent, SignedResponse, EnclaveError};

/// Use case: Validate and sign a transaction intent using speculative parallelization.
pub struct SignIntentUseCase {
    engine: Arc<SpeculativeEngine>,
}

impl SignIntentUseCase {
    pub fn new(engine: Arc<SpeculativeEngine>) -> Self {
        Self { engine }
    }

    /// Execute the sign intent flow:
    /// 1. Fork into policy evaluation (Thread A) and nonce pre-computation (Thread B)
    /// 2. Merge based on verdict
    /// 3. Return signed response (or denial)
    pub async fn execute(&self, intent: TransactionIntent) -> Result<SignedResponse, EnclaveError> {
        self.engine.execute(intent).await
    }
}
