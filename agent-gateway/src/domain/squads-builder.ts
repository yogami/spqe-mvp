// Squads V4 Multisig Builder
//
// Builds 2-of-3 multisig proposals on Solana devnet using @sqds/multisig.
// Key setup: Human (Key 1) + AI Agent (Key 2) + SPQE Enclave (Key 3)
// The enclave's PQ signature serves as the 3rd approval in the multisig.

import {
    Connection,
    PublicKey,
    Keypair,
    TransactionMessage,
    VersionedTransaction,
    SystemProgram,
    LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import * as multisig from "@sqds/multisig";

import type { MultisigConfig, TransactionIntent } from "./intent.js";

const { Multisig, Proposal } = multisig.accounts;
/**
 * Squads V4 multisig builder for the SPQE 2-of-3 co-signing protocol.
 *
 * Architecture:
 * - Key 1 (Human): The human operator's key — always trusted
 * - Key 2 (AI Agent): The autonomous agent's key — submits intents
 * - Key 3 (SPQE Enclave): The enclave's key — validates and co-signs
 *
 * A transaction executes when any 2 of 3 keys approve (threshold = 2).
 */
export class SquadsBuilder {
    private connection: Connection;
    private config: MultisigConfig;

    constructor(rpcUrl: string, config: MultisigConfig) {
        this.connection = new Connection(rpcUrl, "confirmed");
        this.config = config;
    }

    /**
     * Create the 2-of-3 multisig smart account on Solana.
     * This is a one-time setup operation.
     */
    async createMultisig(
        creator: Keypair,
        createKey: Keypair
    ): Promise<{ multisigPda: PublicKey; signature: string }> {
        const [multisigPda] = multisig.getMultisigPda({
            createKey: createKey.publicKey,
        });

        const members: multisig.types.Member[] = [
            {
                key: new PublicKey(this.config.humanKey),
                permissions: multisig.types.Permissions.all(),
            },
            {
                key: new PublicKey(this.config.agentKey),
                permissions: multisig.types.Permissions.fromPermissions([
                    multisig.types.Permission.Initiate,
                    multisig.types.Permission.Vote,
                ]),
            },
            {
                key: new PublicKey(this.config.enclaveKey),
                permissions: multisig.types.Permissions.fromPermissions([
                    multisig.types.Permission.Vote,
                ]),
            },
        ];

        const createIx = multisig.instructions.multisigCreateV2({
            createKey: createKey.publicKey,
            creator: creator.publicKey,
            multisigPda,
            configAuthority: null,
            threshold: this.config.threshold,
            members,
            timeLock: 0,
            rentCollector: null,
            treasury: creator.publicKey,
        });

        const latestBlockhash = await this.connection.getLatestBlockhash();
        const message = new TransactionMessage({
            payerKey: creator.publicKey,
            recentBlockhash: latestBlockhash.blockhash,
            instructions: [createIx],
        }).compileToV0Message();

        const tx = new VersionedTransaction(message);
        tx.sign([creator, createKey]);

        const signature = await this.connection.sendTransaction(tx, {
            skipPreflight: false,
        });
        await this.connection.confirmTransaction({
            signature,
            ...latestBlockhash,
        });

        return { multisigPda, signature };
    }

    /**
     * Build a Squads V4 vault transaction proposal for a given intent.
     * The AI agent initiates the proposal, then the enclave approves it.
     */
    async buildProposal(
        intent: TransactionIntent,
        proposer: Keypair,
        transactionIndex: bigint
    ): Promise<{ proposalPda: PublicKey; signatures: string[] }> {
        const multisigPda = new PublicKey(this.config.multisigAddress);

        // Get the vault PDA (index 0 = default vault)
        const [vaultPda] = multisig.getVaultPda({
            multisigPda,
            index: 0,
        });

        // Build the inner instruction (the actual transfer)
        const transferIx = SystemProgram.transfer({
            fromPubkey: vaultPda,
            toPubkey: new PublicKey(intent.target),
            lamports: intent.amount,
        });

        // Create the vault transaction
        const createVaultTxIx = multisig.instructions.vaultTransactionCreate({
            multisigPda,
            transactionIndex,
            creator: proposer.publicKey,
            vaultIndex: 0,
            ephemeralSigners: 0,
            transactionMessage: new TransactionMessage({
                payerKey: vaultPda,
                recentBlockhash: (await this.connection.getLatestBlockhash()).blockhash,
                instructions: [transferIx],
            }),
            memo: intent.memo ?? `SPQE: ${intent.action} by ${intent.agent_id}`,
        });

        // Create the proposal
        const createProposalIx = multisig.instructions.proposalCreate({
            multisigPda,
            transactionIndex,
            creator: proposer.publicKey,
        });

        // Agent approves the proposal (1st approval)
        const approveIx = multisig.instructions.proposalApprove({
            multisigPda,
            transactionIndex,
            member: proposer.publicKey,
        });

        // Send all three instructions in one transaction
        const latestBlockhash = await this.connection.getLatestBlockhash();
        const message = new TransactionMessage({
            payerKey: proposer.publicKey,
            recentBlockhash: latestBlockhash.blockhash,
            instructions: [createVaultTxIx, createProposalIx, approveIx],
        }).compileToV0Message();

        const tx = new VersionedTransaction(message);
        tx.sign([proposer]);

        const signature = await this.connection.sendTransaction(tx, {
            skipPreflight: false,
        });
        await this.connection.confirmTransaction({
            signature,
            ...latestBlockhash,
        });

        const [proposalPda] = multisig.getProposalPda({
            multisigPda,
            transactionIndex,
        });

        return { proposalPda, signatures: [signature] };
    }

    /**
     * Approve a proposal as the SPQE enclave (2nd approval, reaching threshold).
     * This is called after the enclave validates and PQ-signs the intent.
     */
    async approveAsEnclave(
        enclaveKeypair: Keypair,
        transactionIndex: bigint
    ): Promise<string> {
        const multisigPda = new PublicKey(this.config.multisigAddress);

        const approveIx = multisig.instructions.proposalApprove({
            multisigPda,
            transactionIndex,
            member: enclaveKeypair.publicKey,
        });

        const latestBlockhash = await this.connection.getLatestBlockhash();
        const message = new TransactionMessage({
            payerKey: enclaveKeypair.publicKey,
            recentBlockhash: latestBlockhash.blockhash,
            instructions: [approveIx],
        }).compileToV0Message();

        const tx = new VersionedTransaction(message);
        tx.sign([enclaveKeypair]);

        const signature = await this.connection.sendTransaction(tx, {
            skipPreflight: false,
        });
        await this.connection.confirmTransaction({
            signature,
            ...latestBlockhash,
        });

        return signature;
    }

    /**
     * Execute a fully-approved vault transaction.
     * Can be called by any member once threshold is met.
     */
    async executeTransaction(
        executor: Keypair,
        transactionIndex: bigint
    ): Promise<string> {
        const multisigPda = new PublicKey(this.config.multisigAddress);

        const executeData = await multisig.instructions.vaultTransactionExecute({
            connection: this.connection,
            multisigPda,
            transactionIndex,
            member: executor.publicKey,
        });

        const latestBlockhash = await this.connection.getLatestBlockhash();
        const message = new TransactionMessage({
            payerKey: executor.publicKey,
            recentBlockhash: latestBlockhash.blockhash,
            instructions: [executeData.instruction],
        }).compileToV0Message();

        const tx = new VersionedTransaction(message);
        tx.sign([executor]);

        const signature = await this.connection.sendTransaction(tx, {
            skipPreflight: false,
        });
        await this.connection.confirmTransaction({
            signature,
            ...latestBlockhash,
        });

        return signature;
    }

    /**
     * Get the current transaction index for the multisig.
     */
    async getTransactionIndex(): Promise<bigint> {
        const multisigPda = new PublicKey(this.config.multisigAddress);
        const multisigAccount = await Multisig.fromAccountAddress(
            this.connection,
            multisigPda
        );
        return BigInt(multisigAccount.transactionIndex.toString());
    }
}
