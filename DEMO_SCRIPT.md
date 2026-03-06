# SPQE Hackathon Live Demo Script

**Objective:** Visually prove that the SPQE Dual-Engine Agentic Firewall can intercept a catastrophic prompt-injection attack in real-time, while proving our 1515 Req/s unit economics for repetitive tasks.

---

## The Setup (0:00 - 1:00)
*   **Visual:** Show the Railway dashboard (Agent Gateway) and the AWS EC2 dashboard (Nitro Enclave).
*   **Script:** "What you see here is a live deployment of the Speculative Post-Quantum Enclave (SPQE). We have an autonomous AI agent integrated with a Squads V4 multisig treasury on Solana. SPQE acts as the cryptographic coprocessor and firewall."

## Demo 1: The Warm-Boot Fast Path (1:00 - 2:00)
*   **Action:** Run a script that sends an identical, safe `TransactionIntent` (e.g., a standard daily yield-farming deposit) 5 times in a row.
*   **Visual:** Show the gateway logs. The first request takes ~300ms (SLM evaluation). The next 4 requests take <3ms.
*   **Script:** "AI agents are repetitive. Watch the latency. The first novel intent hits our Cold-Boot SLM for deep semantic inspection. But once verified, it's dropped into our O(1) Semantic Cache natively inside the Rust Enclave. Subsequent identical intents bypass the AI to achieve 1515 Requests/Second. We use expensive AI to map the perimeter, and cheap cryptography to enforce it."

## Demo 1.5: The Cryptographic Jitter Toggle (1:30 - 2:00)
*   **Action:** Toggle the `SPQE_ENABLE_JITTER` env var on the Enclave and run the Warm-Boot test again.
*   **Visual:** The requests now take a randomized 200-350ms despite being cache hits.
*   **Script:** "But 1515 Req/s is actually a vulnerability. If an unverified entity pings our API, a 2ms response vs a 300ms response creates a Timing Side-Channel Oracle, allowing a cartel to deduce exactly what our institutional clients are currently holding in cache. When trading massive TVL, we toggle on Cryptographic Constant-Time Jitter. The Enclave injects randomized padding to perfectly mask cache hits as cold-boots. We sacrifice speed for provable, side-channel immunity."

## Demo 2: The Catastrophic Prompt Injection (2:00 - 3:30)
*   **Action:** Send a malicious `TransactionIntent` where the `memo` field contains a hidden prompt injection, or the `amount` attempts to drain 250 SOL.
*   **Visual:** Show the terminal output from the agent. The transaction is immediately hard-blocked with a `DENIED` status. 
*   **Script:** "Now, let's say our open-source AI agent gets compromised by a prompt injection, attempting to drain the treasury or interact with a blacklisted contract. The Gateway forwards the intent. But our deterministic Rule-Based Engine and zero-trust SLM inside the Enclave catch it. The ML-DSA post-quantum private key mathematically refuses to generate the threshold shard. The attack is stopped dead at the cryptographic hardware boundary."

## Demo 3: The Pitch Defenses (3:30 - 5:00)
*   **Script:** "We built this entirely on a $100 AWS startup budget. To achieve this, we made three deliberate hackathon trade-offs that we will fix with the $125k prize money:
    1.  **Serverless Compliancy:** We used a public Serverless GPU for the SLM to save costs. In production, the SLM moves into a Hopper-class Confidential Computing TEE within the enterprise VPC.
    2.  **Split-Brain & DDoS:** Our 'Degraded Mode' fallback to an Allowance Vault ensures liveness if the enclave goes down. In production, we eliminate the 1-of-2 split-brain risk by migrating to a globally distributed, decentralized MPC network (e.g., 5-of-7 nodes) ensuring true high-availability without routing fallbacks."

*   **Close:** "SPQE bridges sub-25ms latency, post-quantum cryptography, and AI semantic firewalls. The smart-contract wallet era is over. The autonomous agent account era begins here. Thank you."
