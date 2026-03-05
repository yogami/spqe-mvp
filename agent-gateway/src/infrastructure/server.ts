// SPQE Agent Gateway — Fastify Server
//
// The routing plane deployed on Railway.app.
// Receives AI agent intents, routes to the Nitro Enclave,
// and handles Squads V4 transaction building.
//
// Routes:
//   POST /api/validate  — main endpoint for intent validation + signing
//   GET  /api/health    — health check
//   GET  /api/docs      — Swagger UI (via @fastify/swagger-ui)

import Fastify from "fastify";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import "dotenv/config";

import type { TransactionIntent, ValidateResponse } from "../domain/intent.js";
import { ValidateAndSignUseCase } from "../application/validate-and-sign.js";
import { HttpEnclaveClient } from "../ports/enclave-client.js";

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const ENCLAVE_URL = process.env.ENCLAVE_URL ?? "http://localhost:5000";
const ENCLAVE_TIMEOUT_MS = parseInt(process.env.ENCLAVE_TIMEOUT_MS ?? "25000", 10);

async function buildServer() {
    const app = Fastify({
        logger: {
            level: process.env.LOG_LEVEL ?? "info",
            transport:
                process.env.NODE_ENV !== "production"
                    ? { target: "pino-pretty" }
                    : undefined,
        },
    });

    // === Swagger/OpenAPI ===
    await app.register(fastifySwagger, {
        openapi: {
            info: {
                title: "SPQE Agent Gateway",
                description:
                    "Sub-25ms post-quantum cryptographic co-signer for Solana AI agents",
                version: "0.1.0",
            },
            servers: [{ url: `http://localhost:${PORT}` }],
            tags: [
                { name: "validation", description: "Intent validation and signing" },
                { name: "system", description: "System health and diagnostics" },
            ],
        },
    });

    await app.register(fastifySwaggerUi, {
        routePrefix: "/api/docs",
    });

    // === Wire Dependencies ===
    const enclaveClient = new HttpEnclaveClient(ENCLAVE_URL, ENCLAVE_TIMEOUT_MS);
    // Squads builder is optional — only configured if MULTISIG_ADDRESS is set
    const useCase = new ValidateAndSignUseCase(enclaveClient);

    // === Routes ===

    // POST /api/validate — Main endpoint
    app.post<{ Body: TransactionIntent; Reply: ValidateResponse }>(
        "/api/validate",
        {
            schema: {
                tags: ["validation"],
                summary: "Validate and sign an AI agent transaction intent",
                description:
                    "Forwards the intent to the Nitro Enclave for speculative parallel evaluation. " +
                    "If approved, builds a Squads V4 multisig proposal and returns the PQ signature.",
                body: {
                    type: "object",
                    required: ["action", "target", "amount", "agent_id", "nonce", "timestamp_ms"],
                    properties: {
                        action: {
                            type: "string",
                            description: 'Action type (e.g., "transfer", "swap", "stake")',
                        },
                        target: {
                            type: "string",
                            description: "Target Solana address (base58)",
                        },
                        amount: {
                            type: "number",
                            description: "Amount in lamports",
                        },
                        agent_id: {
                            type: "string",
                            description: "Unique AI agent identifier",
                        },
                        memo: {
                            type: "string",
                            description: "Optional memo/description",
                        },
                        nonce: {
                            type: "string",
                            description: "Cryptographic nonce to prevent replay attacks",
                        },
                        timestamp_ms: {
                            type: "number",
                            description: "UNIX timestamp in milliseconds for expiration",
                        },
                    },
                },
                response: {
                    200: {
                        type: "object",
                        properties: {
                            approved: { type: "boolean" },
                            pq_signature: {
                                type: "object",
                                nullable: true,
                                properties: {
                                    signature: { type: "array", items: { type: "number" } },
                                    algorithm: { type: "string" },
                                    public_key: { type: "array", items: { type: "number" } },
                                },
                            },
                            proposal_index: { type: "number", nullable: true },
                            transaction_signature: { type: "string", nullable: true },
                            reasoning: { type: "string" },
                            latency_ms: { type: "number" },
                        },
                    },
                },
            },
        },
        async (request, reply) => {
            const intent = request.body;
            const result = await useCase.execute(intent);
            return reply.send(result);
        }
    );

    // GET /api/health — Health check
    app.get(
        "/api/health",
        {
            schema: {
                tags: ["system"],
                summary: "Health check",
                response: {
                    200: {
                        type: "object",
                        properties: {
                            status: { type: "string" },
                            version: { type: "string" },
                            enclave_url: { type: "string" },
                        },
                    },
                },
            },
        },
        async () => ({
            status: "ok",
            version: "0.1.0",
            enclave_url: ENCLAVE_URL,
        })
    );

    // GET /api/openapi.json — OpenAPI manifest (Agent-Ready requirement)
    app.get("/api/openapi.json", async () => {
        return app.swagger();
    });

    return app;
}

// === Start Server ===
async function main() {
    const app = await buildServer();

    try {
        await app.listen({ port: PORT, host: "0.0.0.0" });
        console.log(`🔐 SPQE Agent Gateway listening on port ${PORT}`);
        console.log(`📋 Swagger UI: http://localhost:${PORT}/api/docs`);
        console.log(`🔗 Enclave: ${ENCLAVE_URL}`);
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
}

main();

export { buildServer };
