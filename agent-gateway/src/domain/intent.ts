// Domain entities for the SPQE Agent Gateway.
// Pure domain objects — no I/O or framework dependencies.

/**
 * Transaction intent submitted by an autonomous AI agent.
 * This is the primary input to the SPQE validation pipeline.
 */
export interface TransactionIntent {
    /** The action the agent wants to perform (e.g., "transfer", "swap", "stake") */
    action: string;
    /** Target Solana address (base58 public key) */
    target: string;
    /** Amount in lamports */
    amount: number;
    /** Unique identifier for the AI agent */
    agent_id: string;
    /** Optional memo/description */
    memo?: string;
}

/**
 * Post-quantum signature from the Nitro Enclave.
 */
export interface PQSignature {
    /** ML-DSA signature bytes (base64) */
    signature: number[];
    /** Algorithm identifier (e.g., "ML-DSA-65") */
    algorithm: string;
    /** Public key that produced this signature (base64) */
    public_key: number[];
}

/**
 * Policy verdict from the SLM evaluator.
 */
export interface PolicyVerdict {
    /** true = approved, false = denied */
    approved: boolean;
    /** Human-readable reasoning */
    reasoning: string;
    /** Risk score 0.0 (safe) to 1.0 (critical) */
    risk_score: number;
}

/**
 * Response from the enclave signer after speculative parallelization.
 */
export interface EnclaveSignResponse {
    /** The evaluated intent */
    intent: TransactionIntent;
    /** The policy verdict */
    verdict: PolicyVerdict;
    /** PQ signature (only present if approved) */
    signature: PQSignature | null;
    /** Processing latency in milliseconds */
    latency_ms: number;
}

/**
 * Squads V4 multisig configuration for the 2-of-3 setup.
 * Key 1: Human operator
 * Key 2: AI Agent
 * Key 3: SPQE Enclave (PQ-signed)
 */
export interface MultisigConfig {
    /** The multisig account address */
    multisigAddress: string;
    /** Human operator's public key */
    humanKey: string;
    /** AI agent's public key */
    agentKey: string;
    /** SPQE enclave's public key */
    enclaveKey: string;
    /** Required number of approvals (2 of 3) */
    threshold: number;
}

/**
 * Final response to the AI agent after the full pipeline completes.
 */
export interface ValidateResponse {
    /** Whether the intent was approved and signed */
    approved: boolean;
    /** The PQ signature if approved */
    pq_signature: PQSignature | null;
    /** Squads V4 proposal index (if multisig transaction was built) */
    proposal_index: number | null;
    /** Solana transaction signature (if executed) */
    transaction_signature: string | null;
    /** Policy verdict reasoning */
    reasoning: string;
    /** End-to-end latency in milliseconds */
    latency_ms: number;
}
