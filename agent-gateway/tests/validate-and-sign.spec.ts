// ATDD Spec: Validate and Sign Use Case
//
// Tests the full pipeline:
// - Approved intent returns PQ signature
// - Denied intent returns no signature
// - Enclave timeout triggers fail-closed denial
// - Error handling for unreachable enclave

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ValidateAndSignUseCase } from "../src/application/validate-and-sign.js";
import type {
    TransactionIntent,
    EnclaveSignResponse,
} from "../src/domain/intent.js";
import type { EnclaveClientPort } from "../src/ports/enclave-client.js";

// === Mock Enclave Client ===

class MockEnclaveClient implements EnclaveClientPort {
    private response: EnclaveSignResponse;

    constructor(response: EnclaveSignResponse) {
        this.response = response;
    }

    async sign(_intent: TransactionIntent): Promise<EnclaveSignResponse> {
        return this.response;
    }

    async health() {
        return { status: "ok", algorithm: "ML-DSA-65-MOCK" };
    }
}

class ErrorEnclaveClient implements EnclaveClientPort {
    async sign(_intent: TransactionIntent): Promise<EnclaveSignResponse> {
        throw new Error("Connection refused");
    }

    async health() {
        throw new Error("Connection refused");
    }
}

const testIntent: TransactionIntent = {
    action: "transfer",
    target: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin",
    amount: 1_000_000,
    agent_id: "agent-alpha-1",
};

const approvedResponse: EnclaveSignResponse = {
    intent: testIntent,
    verdict: {
        approved: true,
        reasoning: "Transfer within safe bounds",
        risk_score: 0.1,
    },
    signature: {
        signature: [0xde, 0xad, 0xbe, 0xef],
        algorithm: "ML-DSA-65",
        public_key: [0x01, 0x02, 0x03],
    },
    latency_ms: 12,
};

const deniedResponse: EnclaveSignResponse = {
    intent: testIntent,
    verdict: {
        approved: false,
        reasoning: "Wallet drain detected",
        risk_score: 0.95,
    },
    signature: null,
    latency_ms: 8,
};

describe("ValidateAndSignUseCase", () => {
    // AC-1: Approved intent returns PQ signature and approval
    it("should return PQ signature for approved intent", async () => {
        const client = new MockEnclaveClient(approvedResponse);
        const useCase = new ValidateAndSignUseCase(client);

        const result = await useCase.execute(testIntent);

        expect(result.approved).toBe(true);
        expect(result.pq_signature).not.toBeNull();
        expect(result.pq_signature?.algorithm).toBe("ML-DSA-65");
        expect(result.reasoning).toBe("Transfer within safe bounds");
        expect(result.latency_ms).toBeGreaterThanOrEqual(0);
    });

    // AC-2: Denied intent returns no signature
    it("should return no signature for denied intent", async () => {
        const client = new MockEnclaveClient(deniedResponse);
        const useCase = new ValidateAndSignUseCase(client);

        const result = await useCase.execute(testIntent);

        expect(result.approved).toBe(false);
        expect(result.pq_signature).toBeNull();
        expect(result.reasoning).toContain("Wallet drain");
    });

    // AC-3: Unreachable enclave triggers fail-closed denial
    it("should fail closed when enclave is unreachable", async () => {
        const client = new ErrorEnclaveClient();
        const useCase = new ValidateAndSignUseCase(client);

        const result = await useCase.execute(testIntent);

        expect(result.approved).toBe(false);
        expect(result.pq_signature).toBeNull();
        expect(result.reasoning).toContain("fail-closed");
        expect(result.reasoning).toContain("Connection refused");
    });

    // AC-4: Latency is tracked end-to-end
    it("should track end-to-end latency", async () => {
        const client = new MockEnclaveClient(approvedResponse);
        const useCase = new ValidateAndSignUseCase(client);

        const result = await useCase.execute(testIntent);

        expect(result.latency_ms).toBeGreaterThanOrEqual(0);
        expect(result.latency_ms).toBeLessThan(1000); // Should be fast with mocks
    });

    // AC-5: Without Squads config, still returns PQ signature
    it("should return PQ signature without Squads integration", async () => {
        const client = new MockEnclaveClient(approvedResponse);
        const useCase = new ValidateAndSignUseCase(client); // No squads builder

        const result = await useCase.execute(testIntent);

        expect(result.approved).toBe(true);
        expect(result.pq_signature).not.toBeNull();
        expect(result.proposal_index).toBeNull();
        expect(result.transaction_signature).toBeNull();
    });
});
