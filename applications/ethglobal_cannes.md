# ETHGlobal Cannes 2026: Project Submission

**Project Name:** SPQE (Agentic Security Enclave)
**GitHub Repo:** https://github.com/yogami/spqe-mvp 
**Target Tracks:** Trusted Execution Environments (TEEs), Security & Privacy, AI x Crypto

---

### Application Summary & Humanized Demo Narrative

**1. Project Description (Short):**
SPQE is a Post-Quantum Hardware Firewall for Autonomous AI Agents. It runs an isolated Rust engine inside an AWS Nitro Enclave to intercept, evaluate, and mathematically block prompt-injected LLMs from draining crypto treasuries.

**2. How it works (The Architecture):**
We noticed that giving AI agents write-access to smart contracts is a massive security hazard. You can't trust the model, so we built a trustless hardware layer.

Here's the flow:
1. An AI agent proposes a transaction (e.g., swapping tokens).
2. The transaction is instantly routed to our AWS Nitro Enclave.
3. Inside the TEE, a Rust process kicks off a speculative parallel thread (`tokio::select!`).
4. We evaluate the semantic output of the agent and apply deterministic rules (e.g., "Don't send 90% of the wallet to an unknown address").
5. Because we use speculative threading, we evaluate the intent and generate an ML-DSA-65 post-quantum signature in under 25ms (1515 Requests/Second).
6. If the intent is safe, the enclave co-signs the transaction. If it's malicious, the signature is zeroized from memory.

**3. Partner Bounties Targeted:**
*(Note: When you submit on the Hacker Dashboard, exclusively select the sponsors that provide TEEs, Oracles, or Account Abstraction tooling. E.g., Safe Global, Chainlink, or AWS if present).*
- "We used [Sponsor X]'s smart accounts to deploy the 2-of-3 multisig, using our AWS Nitro Enclave as the ultimate algorithmic co-signer protecting the funds."

**4. The Demo Video Script (What you record right now):**
*(Record a 2-minute Loom for the ETHGlobal submission).*

> **[0:00 - 0:15] The Hook:** "Hey ETHGlobal. The agentic internet is here, but giving AI write-access to smart contracts is a security nightmare. Meet SPQE: a hardware execution firewall for AI agents."
>
> **[0:15 - 0:45] The Tech:** "Instead of trusting an LLM, we use an AWS Nitro Enclave. Our Rust engine uses speculative threading to intercept AI transactions, evaluate their semantic intent, and either mathematically block a prompt-injection attack or co-sign the safe transaction. And we do it in 20 milliseconds."
>
> **[0:45 - 1:30] The Live Demo:** "(Show your screen). Here is an AI agent running. I send a malicious prompt injection attempting to drain a treasury via a zero-day CPI attack. You can see the request hit our TypeScript Gateway, route instantly into the AWS Enclave, and BAM—our Rust engine returns 'Access Denied', physically refusing to output a signature. The funds stay safe."
>
> **[1:30 - 2:00] The Close:** "We built SPQE integrating ML-DSA-65 post-quantum cryptography natively. It's a 3-line SDK drop-in for EVM developers. Thank you."

---

### What you need to do now:
1. When ETHGlobal Cannes submissions open on the Hacker Dashboard, copy/paste the short descriptions.
2. Select up to 3 Partner Prizes that relate to wallets, EVM compatibility, or TEEs.
3. Record the 2-minute Loom video using the exact script provided above. Don't add fluff, just show the terminal output blocking the attack.
4. Hit submit before Sunday, April 5th.
