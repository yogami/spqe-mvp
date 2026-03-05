// Domain entities for SPQE enclave signer
// Pure business logic — no I/O dependencies

pub mod speculative_engine;
pub mod pq_signer;

use serde::{Deserialize, Serialize};
use zeroize::Zeroize;

/// Represents an AI agent's transaction intent submitted for validation and signing.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionIntent {
    /// The action the agent wants to perform (e.g., "transfer", "swap", "stake")
    pub action: String,
    /// Target address (Solana base58 public key)
    pub target: String,
    /// Amount in lamports
    pub amount: u64,
    /// Unique identifier for the AI agent
    pub agent_id: String,
    /// Optional memo/description of the intent
    #[serde(default)]
    pub memo: Option<String>,
}

/// The semantic evaluation verdict from the SLM policy evaluator.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PolicyVerdict {
    /// true = Safe, false = Denied
    pub approved: bool,
    /// Human-readable reasoning from the SLM
    pub reasoning: String,
    /// Risk score 0.0 (safe) to 1.0 (critical threat)
    pub risk_score: f64,
}

/// A post-quantum signature produced by the ML-DSA algorithm.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PQSignature {
    /// The ML-DSA signature bytes (base64 encoded for transport)
    pub signature: Vec<u8>,
    /// The algorithm identifier (e.g., "ML-DSA-65")
    pub algorithm: String,
    /// The public key that can verify this signature (base64)
    pub public_key: Vec<u8>,
}

/// Pre-computed nonces for speculative signing. Zeroized on drop for security.
#[derive(Debug, Zeroize)]
#[zeroize(drop)]
pub struct SpeculativeNonces {
    /// Internal nonce state for ML-DSA pre-computation
    pub nonce_data: Vec<u8>,
    /// Whether the nonces have been consumed (released as a signature)
    #[zeroize(skip)]
    pub consumed: bool,
}

impl SpeculativeNonces {
    pub fn new(nonce_data: Vec<u8>) -> Self {
        Self {
            nonce_data,
            consumed: false,
        }
    }

    /// Consume the nonces, returning the data and marking as consumed.
    /// Returns None if already consumed.
    pub fn consume(&mut self) -> Option<Vec<u8>> {
        if self.consumed {
            return None;
        }
        self.consumed = true;
        Some(self.nonce_data.clone())
    }

    /// Securely discard the nonces without consuming them.
    pub fn discard(&mut self) {
        self.consumed = true;
        // Zeroize will handle the actual zeroing on drop
    }
}

/// The result of the speculative parallelization merge.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignedResponse {
    /// The intent that was evaluated
    pub intent: TransactionIntent,
    /// The policy verdict
    pub verdict: PolicyVerdict,
    /// The PQ signature (only present if approved)
    pub signature: Option<PQSignature>,
    /// Processing time in milliseconds
    pub latency_ms: u64,
}

/// Error types for the enclave domain.
#[derive(Debug, thiserror::Error)]
pub enum EnclaveError {
    #[error("Policy evaluation denied the intent: {0}")]
    PolicyDenied(String),

    #[error("Policy evaluator timeout after {0}ms")]
    EvaluatorTimeout(u64),

    #[error("ML-DSA signing failed: {0}")]
    SigningFailed(String),

    #[error("Nonces already consumed or discarded")]
    NoncesExpired,

    #[error("Serialization error: {0}")]
    Serialization(String),

    #[error("Network error: {0}")]
    Network(String),

    #[error("Internal enclave error: {0}")]
    Internal(String),
}
