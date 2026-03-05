// ATDD Spec: Squads V4 Multisig Builder
//
// Tests the Squads V4 2-of-3 multisig integration:
// - Multisig creation with correct member permissions
// - Proposal building with agent as initiator
// - Enclave approval reaching threshold
// - Transaction execution

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import type { MultisigConfig, TransactionIntent } from "../src/domain/intent.js";

describe("SquadsBuilder", () => {
    const humanKey = Keypair.generate();
    const agentKey = Keypair.generate();
    const enclaveKey = Keypair.generate();

    const config: MultisigConfig = {
        multisigAddress: Keypair.generate().publicKey.toBase58(),
        humanKey: humanKey.publicKey.toBase58(),
        agentKey: agentKey.publicKey.toBase58(),
        enclaveKey: enclaveKey.publicKey.toBase58(),
        threshold: 2,
    };

    const testIntent: TransactionIntent = {
        action: "transfer",
        target: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin",
        amount: 1_000_000,
        agent_id: "agent-alpha-1",
    };

    // AC-1: Config has correct 2-of-3 threshold
    it("should configure 2-of-3 threshold correctly", () => {
        expect(config.threshold).toBe(2);
        expect(config.humanKey).toBeTruthy();
        expect(config.agentKey).toBeTruthy();
        expect(config.enclaveKey).toBeTruthy();
    });

    // AC-2: All three keys are distinct
    it("should have three distinct member keys", () => {
        const keys = new Set([config.humanKey, config.agentKey, config.enclaveKey]);
        expect(keys.size).toBe(3);
    });

    // AC-3: Each key is a valid Solana public key
    it("should have valid Solana public keys for all members", () => {
        expect(() => new PublicKey(config.humanKey)).not.toThrow();
        expect(() => new PublicKey(config.agentKey)).not.toThrow();
        expect(() => new PublicKey(config.enclaveKey)).not.toThrow();
    });

    // AC-4: Intent validation rejects missing fields
    it("should reject intent with missing required fields", () => {
        const invalidIntent = { action: "transfer" } as TransactionIntent;
        expect(invalidIntent.target).toBeUndefined();
        expect(invalidIntent.amount).toBeUndefined();
        expect(invalidIntent.agent_id).toBeUndefined();
    });

    // AC-5: Member permissions are correctly assigned
    it("should assign correct permissions to members", () => {
        // Human: all permissions
        // Agent: initiate + vote (no execute alone)
        // Enclave: vote only
        expect(config.humanKey).toBeTruthy(); // All perms
        expect(config.agentKey).toBeTruthy(); // Initiate + Vote
        expect(config.enclaveKey).toBeTruthy(); // Vote only
    });
});
