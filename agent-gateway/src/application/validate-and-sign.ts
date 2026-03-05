// Validate and Sign Use Case
//
// Application-layer orchestration:
// 1. Receives intent from AI agent
// 2. Routes to enclave for speculative parallel evaluation + PQ signing
// 3. If approved, builds Squads V4 multisig proposal
// 4. Returns the final response with transaction signature

import { Keypair } from "@solana/web3.js";

import type {
    TransactionIntent,
    ValidateResponse,
    EnclaveSignResponse,
} from "../domain/intent.js";
import { SquadsBuilder } from "../domain/squads-builder.js";
import type { EnclaveClientPort } from "../ports/enclave-client.js";

export class ValidateAndSignUseCase {
    private enclaveClient: EnclaveClientPort;
    private squadsBuilder: SquadsBuilder | null;
    private enclaveKeypair: Keypair | null;
    private agentKeypair: Keypair | null;

    constructor(
        enclaveClient: EnclaveClientPort,
        squadsBuilder: SquadsBuilder | null = null,
        enclaveKeypair: Keypair | null = null,
        agentKeypair: Keypair | null = null
    ) {
        this.enclaveClient = enclaveClient;
        this.squadsBuilder = squadsBuilder;
        this.enclaveKeypair = enclaveKeypair;
        this.agentKeypair = agentKeypair;
    }

    /**
     * Execute the full SPQE validation pipeline:
     *
     * 1. Forward intent to Nitro Enclave (speculative parallelization happens there)
     * 2. If approved: build Squads V4 proposal, approve as enclave, execute
     * 3. Return unified response
     */
    async execute(intent: TransactionIntent): Promise<ValidateResponse> {
        const start = performance.now();

        // Step 1: Route to enclave for speculative evaluation + PQ signing
        let enclaveResponse: EnclaveSignResponse | null = null;
        let degradedMode = false;
        try {
            enclaveResponse = await this.enclaveClient.sign(intent);
        } catch (error) {
            // DEGRADED MODE (Allowance Vault Fallback)
            console.warn(`[Liveness Deadlock Fix] Enclave unreachable: ${error}. Evaluating degraded mode...`);
            // Only allow micro-transactions (< 0.1 SOL) to route through the Allowance Vault
            if (intent.amount <= 100_000_000 && this.squadsBuilder && this.agentKeypair) {
                console.log("[Liveness Deadlock Fix] Intent qualifies for Allowance Vault. Defeating deadlock.");
                degradedMode = true;
            } else {
                return {
                    approved: false,
                    pq_signature: null,
                    proposal_index: null,
                    transaction_signature: null,
                    reasoning: `Enclave unreachable and intent exceeds allowance (fail-closed): ${error instanceof Error ? error.message : String(error)}`,
                    latency_ms: Math.round(performance.now() - start),
                };
            }
        }

        // Step 2: If denied, return early
        // Step 2: If denied by enclave, return early
        if (!degradedMode && enclaveResponse && (!enclaveResponse.verdict.approved || !enclaveResponse.signature)) {
            return {
                approved: false,
                pq_signature: enclaveResponse.signature,
                proposal_index: null,
                transaction_signature: null,
                reasoning: enclaveResponse.verdict.reasoning,
                latency_ms: Math.round(performance.now() - start),
            };
        }

        // Step 3: If approved (or in Degraded Mode) and Squads is configured, build the multisig transaction
        let proposalIndex: number | null = null;
        let transactionSignature: string | null = null;

        if (this.squadsBuilder && this.agentKeypair) {
            try {
                // Get next transaction index
                const currentIndex = await this.squadsBuilder.getTransactionIndex();
                const nextIndex = currentIndex + 1n;

                if (degradedMode) {
                    // DEGRADED MODE: Use vaultIndex 1 (Allowance Vault)
                    // We only propose and self-approve. Human must co-sign if threshold is 2, 
                    // or it executes immediately if threshold is 1 for the allowance vault.
                    await this.squadsBuilder.buildProposal(intent, this.agentKeypair, nextIndex, 1);

                    transactionSignature = await this.squadsBuilder.executeTransaction(this.agentKeypair, nextIndex);
                    proposalIndex = Number(nextIndex);
                } else if (this.enclaveKeypair) {
                    // STANDARD ENCLAVE MODE: Use vaultIndex 0 (Main Treasury)
                    await this.squadsBuilder.buildProposal(intent, this.agentKeypair, nextIndex, 0);

                    await this.squadsBuilder.approveAsEnclave(this.enclaveKeypair, nextIndex);

                    transactionSignature = await this.squadsBuilder.executeTransaction(this.agentKeypair, nextIndex);
                    proposalIndex = Number(nextIndex);
                }
            } catch (error) {
                console.error("Squads V4 transaction failed:", error);
            }
        }

        return {
            approved: true,
            pq_signature: enclaveResponse?.signature ?? null,
            proposal_index: proposalIndex,
            transaction_signature: transactionSignature,
            reasoning: degradedMode ? "Approved via Degraded Mode (Allowance Vault)" : (enclaveResponse?.verdict.reasoning ?? "Approved"),
            latency_ms: Math.round(performance.now() - start),
        };
    }
}
