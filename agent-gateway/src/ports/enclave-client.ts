// Enclave Client
//
// HTTP client that forwards TransactionIntent to the Nitro Enclave signer.
// In production, the enclave listens on vsock via an EC2 proxy.
// In local dev, it connects directly via TCP.

import type { TransactionIntent, EnclaveSignResponse } from "../domain/intent.js";

/**
 * Port interface for communicating with the Nitro Enclave signer.
 */
export interface EnclaveClientPort {
    sign(intent: TransactionIntent): Promise<EnclaveSignResponse>;
    health(): Promise<{ status: string; algorithm: string }>;
}

/**
 * HTTP-based enclave client.
 * Forwards requests to the enclave signer's HTTP endpoint.
 */
export class HttpEnclaveClient implements EnclaveClientPort {
    private baseUrl: string;
    private timeoutMs: number;

    constructor(baseUrl: string, timeoutMs: number = 25000) {
        this.baseUrl = baseUrl;
        this.timeoutMs = timeoutMs;
    }

    async sign(intent: TransactionIntent): Promise<EnclaveSignResponse> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

        try {
            const response = await fetch(`${this.baseUrl}/sign`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(intent),
                signal: controller.signal,
            });

            if (!response.ok) {
                const body = await response.text();
                throw new Error(`Enclave returned ${response.status}: ${body}`);
            }

            return (await response.json()) as EnclaveSignResponse;
        } finally {
            clearTimeout(timeout);
        }
    }

    async health(): Promise<{ status: string; algorithm: string }> {
        const response = await fetch(`${this.baseUrl}/health`);
        if (!response.ok) {
            throw new Error(`Enclave health check failed: ${response.status}`);
        }
        return (await response.json()) as { status: string; algorithm: string };
    }
}
