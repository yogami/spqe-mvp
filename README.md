# SPQE: Speculative Post-Quantum Enclaves

> Sub-25ms, zero-gas, post-quantum cryptographic co-signer for autonomous AI agents on Solana.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│  AI Agent        │────▶│  Agent Gateway    │────▶│  Nitro Enclave      │
│  (External)      │     │  (Railway/TS)     │     │  Signer (Rust)      │
└─────────────────┘     └──────────────────┘     │                     │
                               │                  │  Thread A ──▶ SLM   │
                               │                  │  Thread B ──▶ ML-DSA│
                               │                  │  Merge ──▶ Sign     │
                               ▼                  └─────────────────────┘
                        ┌──────────────────┐              │
                        │  Squads V4       │              ▼
                        │  2-of-3 Multisig │     ┌─────────────────────┐
                        │  (Solana Devnet) │     │  Policy Evaluator   │
                        └──────────────────┘     │  (GPU/Python/vLLM)  │
                                                 └─────────────────────┘
```

## Components

| Component | Language | Host | Purpose |
|-----------|----------|------|---------|
| `nitro-enclave-signer` | Rust | AWS Nitro Enclave (c7g.large) | PQ crypto, speculative signing |
| `agent-gateway` | TypeScript | Railway.app | API routing, Squads V4 integration |
| `policy-evaluator` | Python | AWS GPU (g5.xlarge) | SLM semantic intent evaluation |

## Quick Start (Local)

```bash
docker compose up --build
curl -X POST http://localhost:3000/api/validate \
  -H "Content-Type: application/json" \
  -d '{"action":"transfer","target":"9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin","amount":100,"agent_id":"agent-alpha-1"}'
```

## Rules

See [RULES.md](../RULES.md) for governance standards.
