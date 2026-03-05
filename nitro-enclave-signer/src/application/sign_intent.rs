// Sign Intent Use Case
//
// Application-layer orchestration that wires together the speculative engine,
// PQ signer, and SLM client into a single entry point.

use std::sync::Arc;
use std::time::Duration;

use crate::domain::{
    policy_engine::PolicyEngine, speculative_engine::SpeculativeEngine, EnclaveError, SignedResponse, TransactionIntent,
};
use crate::ports::{PolicyEvaluatorPort, SignerPort};

/// Use case: Validate and sign a transaction intent using speculative parallelization.
pub struct SignIntentUseCase {
    engine: SpeculativeEngine,
}

impl SignIntentUseCase {
    pub fn new(
        evaluator: Arc<dyn PolicyEvaluatorPort>,
        signer: Arc<dyn SignerPort>,
        local_policy: Arc<PolicyEngine>,
        evaluation_timeout: Duration,
    ) -> Self {
        Self {
            engine: SpeculativeEngine::new(evaluator, signer, local_policy, evaluation_timeout),
        }
    }

    /// Execute the sign intent flow:
    /// 1. Fork into policy evaluation (Thread A) and nonce pre-computation (Thread B)
    /// 2. Merge based on verdict
    /// 3. Return signed response (or denial)
    pub async fn execute(&self, intent: TransactionIntent) -> Result<SignedResponse, EnclaveError> {
        self.engine.execute(intent).await
    }
}
```
