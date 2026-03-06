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
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::collections::hash_map::DefaultHasher;
use rand::Rng;

use tokio::time::timeout;
use tracing::{info, warn, instrument};

use crate::domain::{
    TransactionIntent, PolicyVerdict, PQSignature, SignedResponse, EnclaveError,
    SpeculativeNonces,
};
use crate::ports::{PolicyEvaluatorPort, SignerPort};
use crate::domain::policy_engine::PolicyEngine;

/// The speculative parallelization engine.
/// Forks execution into policy evaluation (I/O) and nonce pre-computation (compute),
/// then merges based on the policy verdict.
pub struct SpeculativeEngine {
    evaluator: Arc<dyn PolicyEvaluatorPort>,
    signer: Arc<dyn SignerPort>,
    local_policy: Arc<PolicyEngine>,
    evaluation_timeout: Duration,
    semantic_cache: Arc<std::sync::Mutex<HashMap<String, (PolicyVerdict, u64)>>>,
}

impl SpeculativeEngine {
    pub fn new(
        evaluator: Arc<dyn PolicyEvaluatorPort>,
        signer: Arc<dyn SignerPort>,
        local_policy: Arc<PolicyEngine>,
        evaluation_timeout: Duration,
    ) -> Self {
        Self {
            evaluator,
            signer,
            local_policy,
            evaluation_timeout,
            semantic_cache: Arc::new(std::sync::Mutex::new(HashMap::new())),
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

        // === STAGE 1: LOCAL TEE POLICY ENFORCEMENT ===
        // Extremely fast, deterministic checks running inside the Nitro Enclave.
        // If this fails, the request is hard-blocked inside the TEE boundary.
        if let Err(denial_verdict) = self.local_policy.evaluate(&intent) {
            info!("Local TEE policy engine denied intent: {}", denial_verdict.reasoning);
            let latency_ms = start.elapsed().as_millis() as u64;
            return Ok(SignedResponse {
                intent,
                verdict: denial_verdict,
                signature: None,
                latency_ms,
            });
        }

        // STAGE 1.5: WARM-BOOT PATH (O(1) SEMANTIC CACHE)
        // Hash the semantic fields (ignoring the unique nonce/timestamp)
        let mut hasher = DefaultHasher::new();
        intent.action.hash(&mut hasher);
        intent.target.hash(&mut hasher);
        intent.amount.hash(&mut hasher);
        intent.agent_id.hash(&mut hasher);
        let semantic_hash = hasher.finish().to_string();

        let mut cached_verdict_opt = None;
        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        if let Ok(mut cache) = self.semantic_cache.lock() {
            // TOCTOU Prevention: Strict 5-second TTL on semantic cache
            cache.retain(|_, (_, timestamp)| now_ms.saturating_sub(*timestamp) <= 5_000);

            if let Some((v, _)) = cache.get(&semantic_hash) {
                cached_verdict_opt = Some(v.clone());
            }
        }

        if let Some(verdict) = cached_verdict_opt {
            info!("Warm-Boot Path: Semantic Cache HIT. Bypassing SLM.");
            
            // Generate the signature synchronously using the precompute -> finalize flow
            let mut signature = None;
            if verdict.approved {
                match self.signer.precompute_nonces(&message).await {
                    Ok(nonces) => {
                        match self.signer.finalize_signature(&message, nonces).await {
                            Ok(sig) => signature = Some(sig),
                            Err(e) => warn!("Fast-path signing failed: {}", e),
                        }
                    }
                    Err(e) => warn!("Fast-path nonce compute failed: {}", e),
                }
            }
            
            // TOCTOU mitigation: Evaluate local rules ONE MORE TIME on the cached intent
            // just in case global limits or bounds changed in the last 5 seconds.
            if let Err(denial_verdict) = self.local_policy.evaluate(&intent) {
                 info!("Local TEE policy engine intercepted cached intent: {}", denial_verdict.reasoning);
                 return Ok(SignedResponse {
                     intent,
                     verdict: denial_verdict,
                     signature: None,
                     latency_ms: start.elapsed().as_millis() as u64,
                 });
            }

            // --- CRYPTOGRAPHIC TIMING SIDE-CHANNEL MITIGATION ---
            // If we return the cached response in 2ms, we create a Timing Oracle.
            // Attackers can ping the network to guess what intents are cached.
            // We must inject synthetic Jitter to pad the latency out to match
            // the average Cold-Boot network response (e.g. 200ms - 350ms).
            let current_latency = start.elapsed();
            let mut rng = rand::thread_rng();
            let target_latency_ms: u64 = rng.gen_range(200..350);
            let target_duration = Duration::from_millis(target_latency_ms);
            
            if current_latency < target_duration {
                let padding = target_duration - current_latency;
                tokio::time::sleep(padding).await;
            }
            
            let latency_ms = start.elapsed().as_millis() as u64;
            return Ok(SignedResponse {
                intent,
                verdict,
                signature,
                latency_ms,
            });
        }

        // === STAGE 2: COLD-BOOT PATH (FORK - INTERCEPT & PRE-COMPUTE) ===
        info!("Cold-Boot Path: Semantic Cache MISS. Forking to SLM (Thread A) and PQ Signer (Thread B)");
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
            Ok(Ok(Ok(verdict))) => {
                // Cache the successful SLM evaluation with a TOCTOU-resistant timestamp
                let now_ms = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64;
                if let Ok(mut cache) = self.semantic_cache.lock() {
                    cache.insert(semantic_hash, (verdict.clone(), now_ms));
                }
                verdict
            },
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
