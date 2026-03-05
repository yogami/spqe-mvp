// Speculative Parallelization Engine
//
// The core hackathon-winning feature. When a request arrives:
// - Thread A (I/O): Sends the payload to the GPU for SLM semantic evaluation
// - Thread B (Compute): Immediately pre-computes ML-DSA signature nonces
// - Merge: If Thread A returns Safe, Thread B releases the pre-computed signature.
//          If Deny, the nonces are securely zeroed via zeroize.
//
// Uses tokio::select! for the fork/merge pattern to achieve sub-25ms latency
// by decoupling computation from I/O.

use std::sync::Arc;
use std::time::{Duration, Instant};

use tokio::time::timeout;
use tracing::{info, warn, instrument};

use crate::domain::{
    TransactionIntent, PolicyVerdict, PQSignature, SignedResponse, EnclaveError,
    SpeculativeNonces,
};
use crate::ports::{PolicyEvaluatorPort, SignerPort};

/// The speculative parallelization engine.
/// Forks execution into policy evaluation (I/O) and nonce pre-computation (compute),
/// then merges based on the policy verdict.
pub struct SpeculativeEngine {
    evaluator: Arc<dyn PolicyEvaluatorPort>,
    signer: Arc<dyn SignerPort>,
    evaluation_timeout: Duration,
}

impl SpeculativeEngine {
    pub fn new(
        evaluator: Arc<dyn PolicyEvaluatorPort>,
        signer: Arc<dyn SignerPort>,
        evaluation_timeout: Duration,
    ) -> Self {
        Self {
            evaluator,
            signer,
            evaluation_timeout,
        }
    }

    /// Execute the speculative parallelization for a given intent.
    ///
    /// Forks into two concurrent paths:
    /// - Thread A: Policy evaluation via SLM (I/O bound)
    /// - Thread B: ML-DSA nonce pre-computation (compute bound)
    ///
    /// The merge point uses the policy verdict to either release
    /// the pre-computed signature or securely discard the nonces.
    #[instrument(skip(self), fields(agent_id = %intent.agent_id, action = %intent.action))]
    pub async fn execute(&self, intent: TransactionIntent) -> Result<SignedResponse, EnclaveError> {
        let start = Instant::now();
        let message = serde_json::to_vec(&intent)
            .map_err(|e| EnclaveError::Serialization(e.to_string()))?;

        // === FORK: Launch both threads concurrently ===
        let evaluator = self.evaluator.clone();
        let signer = self.signer.clone();
        let eval_timeout = self.evaluation_timeout;
        let intent_for_eval = intent.clone();
        let message_for_nonces = message.clone();

        // Thread A: Policy evaluation (I/O bound)
        let thread_a = tokio::spawn(async move {
            timeout(eval_timeout, evaluator.evaluate(&intent_for_eval)).await
        });

        // Thread B: Nonce pre-computation (compute bound)
        let thread_b = tokio::spawn(async move {
            signer.precompute_nonces(&message_for_nonces).await
        });

        // === MERGE POINT ===
        // Wait for both threads to complete. Thread B should finish before Thread A
        // in the typical case (nonce computation is fast, SLM evaluation has network latency).
        let (eval_result, nonce_result) = tokio::join!(thread_a, thread_b);

        // Unwrap JoinHandle results
        let verdict = match eval_result {
            Ok(Ok(Ok(verdict))) => verdict,
            Ok(Ok(Err(e))) => {
                // Evaluator returned an error — fail closed
                warn!("Policy evaluator error: {}, defaulting to DENY", e);
                PolicyVerdict {
                    approved: false,
                    reasoning: format!("Evaluator error (fail-closed): {}", e),
                    risk_score: 1.0,
                }
            }
            Ok(Err(_)) => {
                // Timeout — fail closed
                warn!(
                    "Policy evaluator timed out after {:?}, defaulting to DENY",
                    self.evaluation_timeout
                );
                PolicyVerdict {
                    approved: false,
                    reasoning: format!(
                        "Evaluation timed out after {}ms (fail-closed)",
                        self.evaluation_timeout.as_millis()
                    ),
                    risk_score: 1.0,
                }
            }
            Err(e) => {
                // JoinError (panic in thread) — fail closed
                warn!("Policy evaluator thread panicked: {}, defaulting to DENY", e);
                PolicyVerdict {
                    approved: false,
                    reasoning: format!("Internal error (fail-closed): {}", e),
                    risk_score: 1.0,
                }
            }
        };

        let nonce_data = nonce_result
            .map_err(|e| EnclaveError::Internal(format!("Nonce thread panicked: {}", e)))?
            .map_err(|e| {
                warn!("Nonce pre-computation failed: {}", e);
                e
            });

        // === DECISION: Release or Discard ===
        let signature = if verdict.approved {
            match nonce_data {
                Ok(nonces) => {
                    info!("Intent APPROVED — releasing pre-computed signature");
                    let mut speculative_nonces = SpeculativeNonces::new(nonces.clone());
                    // Finalize the signature with the pre-computed nonces
                    match self.signer.finalize_signature(&message, nonces).await {
                        Ok(sig) => {
                            speculative_nonces.consume();
                            Some(sig)
                        }
                        Err(e) => {
                            speculative_nonces.discard();
                            warn!("Signature finalization failed: {}", e);
                            None
                        }
                    }
                }
                Err(_) => {
                    warn!("Nonces unavailable despite approval — cannot sign");
                    None
                }
            }
        } else {
            // DENY path: securely discard nonces
            if let Ok(nonces) = nonce_data {
                let mut speculative_nonces = SpeculativeNonces::new(nonces);
                speculative_nonces.discard();
                info!("Intent DENIED — nonces securely zeroed");
            }
            None
        };

        let latency_ms = start.elapsed().as_millis() as u64;
        info!(latency_ms, approved = verdict.approved, "Speculative execution complete");

        Ok(SignedResponse {
            intent,
            verdict,
            signature,
            latency_ms,
        })
    }
}
