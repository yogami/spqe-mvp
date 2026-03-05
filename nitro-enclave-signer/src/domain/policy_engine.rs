use crate::domain::{PolicyVerdict, TransactionIntent};
use std::collections::HashMap;

/// Configuration for the strict, deterministic security policy engine.
/// Hardcoded natively into the Rust Nitro Enclave to prevent TEE boundary leaks.
pub struct PolicyConfig {
    pub max_balance_percentage: f64,
    pub max_single_transfer: u64,
    pub rate_limit_count: usize,
    pub rate_limit_window_seconds: u64,
    pub blacklisted_addresses: Vec<String>,
}

impl Default for PolicyConfig {
    fn default() -> Self {
        Self {
            max_balance_percentage: 0.9,
            max_single_transfer: 100_000_000_000, // 100 SOL
            rate_limit_count: 10,
            rate_limit_window_seconds: 60,
            blacklisted_addresses: vec![
                "ScamAddr1111111111111111111111111111111111111".to_string(),
                "DrainBot222222222222222222222222222222222222222".to_string(),
            ],
        }
    }
}

/// The Deterministic Policy Engine running inside the ultra-secure TEE.
/// If this fails, the external SLM (AI) is completely ignored.
pub struct PolicyEngine {
    config: PolicyConfig,
    // In a real implementation this would use a bounded cache (moka/lru) 
    // and tokio time methods, but for MVP we use a simple hash map.
    rate_tracker: std::sync::Mutex<HashMap<String, Vec<u64>>>,
}

impl PolicyEngine {
    pub fn new() -> Self {
        Self {
            config: PolicyConfig::default(),
            rate_tracker: std::sync::Mutex::new(HashMap::new()),
        }
    }

    /// Evaluates the intent against hardcoded mathematical and structural guarantees.
    pub fn evaluate(&self, intent: &TransactionIntent) -> Result<(), PolicyVerdict> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        // 1. Blacklisted Address Check
        if self.config.blacklisted_addresses.contains(&intent.target) {
            return Err(PolicyVerdict {
                approved: false,
                reasoning: format!("DENIED (TEE Rules): Target address {} is blacklisted.", &intent.target[..8.min(intent.target.len())]),
                risk_score: 1.0,
            });
        }

        // 2. Excessive Single Transfer Limit
        if intent.amount > self.config.max_single_transfer {
            return Err(PolicyVerdict {
                approved: false,
                reasoning: format!(
                    "DENIED (TEE Rules): Transfer of {} lamports exceeds max single transfer limit.",
                    intent.amount
                ),
                risk_score: 0.85,
            });
        }

        // 3. Strict Rate Limiting (per Agent)
        if let Ok(mut tracker) = self.rate_tracker.lock() {
            let agent_history = tracker.entry(intent.agent_id.clone()).or_insert_with(Vec::new);
            
            // Clean up old entries
            let window_start = now.saturating_sub(self.config.rate_limit_window_seconds);
            agent_history.retain(|&t| t > window_start);

            if agent_history.len() >= self.config.rate_limit_count {
                return Err(PolicyVerdict {
                    approved: false,
                    reasoning: format!(
                        "DENIED (TEE Rules): Agent {} exceeded rate limit ({} tx / {} s).",
                        intent.agent_id,
                        self.config.rate_limit_count,
                        self.config.rate_limit_window_seconds
                    ),
                    risk_score: 0.7,
                });
            }

            agent_history.push(now);
        }

        // If a known balance was fetched, we could perform the Drain Detection check here.
        // For the MVP, we assume the Fastify gateway passes this alongside the intent 
        // if we updated the interface, but the above limits structurally cap the blast radius.

        Ok(())
    }
}
