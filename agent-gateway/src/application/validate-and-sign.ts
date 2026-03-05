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
        let enclaveResponse: EnclaveSignResponse;
        try {
            enclaveResponse = await this.enclaveClient.sign(intent);
        } catch (error) {
            // Fail-closed: if enclave is unreachable, deny
            return {
                approved: false,
                pq_signature: null,
                proposal_index: null,
                transaction_signature: null,
                reasoning: `Enclave unreachable (fail-closed): ${error instanceof Error ? error.message : String(error)}`,
                latency_ms: Math.round(performance.now() - start),
            };
        }

        // Step 2: If denied, return early
        if (!enclaveResponse.verdict.approved || !enclaveResponse.signature) {
            return {
                approved: false,
                pq_signature: enclaveResponse.signature,
                proposal_index: null,
                transaction_signature: null,
                reasoning: enclaveResponse.verdict.reasoning,
                latency_ms: Math.round(performance.now() - start),
            };
        }

        // Step 3: If approved and Squads is configured, build the multisig transaction
        let proposalIndex: number | null = null;
        let transactionSignature: string | null = null;

        if (this.squadsBuilder && this.enclaveKeypair && this.agentKeypair) {
            try {
                // Get next transaction index
                const currentIndex = await this.squadsBuilder.getTransactionIndex();
                const nextIndex = currentIndex + 1n;

                // Agent proposes and self-approves (1st approval)
                await this.squadsBuilder.buildProposal(
                    intent,
                    this.agentKeypair,
                    nextIndex
                );

                // Enclave approves (2nd approval — reaches threshold)
                await this.squadsBuilder.approveAsEnclave(
                    this.enclaveKeypair,
                    nextIndex
                );

                // Execute the transaction
                transactionSignature = await this.squadsBuilder.executeTransaction(
                    this.agentKeypair,
                    nextIndex
                );

                proposalIndex = Number(nextIndex);
            } catch (error) {
                console.error("Squads V4 transaction failed:", error);
                // Intent was approved by enclave, but Solana tx failed
                // Still return the PQ signature — the agent can retry the Squads part
            }
        }

        return {
            approved: true,
            pq_signature: enclaveResponse.signature,
            proposal_index: proposalIndex,
            transaction_signature: transactionSignature,
            reasoning: enclaveResponse.verdict.reasoning,
            latency_ms: Math.round(performance.now() - start),
        };
    }
}
