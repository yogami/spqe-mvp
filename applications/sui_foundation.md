# Sui Foundation: Infrastructure RFP Application

**Project Name:** SPQE (High-Performance AI Agent TEE Co-Processor for Nautilus)
**GitHub Repo:** https://github.com/yogami/spqe-mvp 
**Category:** Decentralized Infrastructure / Applied Cryptography

---

### Application Questions & Humanized Answers

**1. Provide a brief overview of your project.**
We have built SPQE (Sub-25ms Post-Quantum Enclave). It is a mathematically deterministic hardware execution firewall designed to secure on-chain transactions initiated by autonomous AI agents. Right now, if an agent uses a protocol's treasury and getting prompt-injected, the TVL is drained. We stop that. 

The agent builds the transaction, and our AWS Nitro Enclave evaluates the semantic intent. If it's a zero-day exploit or a hallucinated wallet drain, our enclave mathematically blocks the signature. We built the engine in Rust with `tokio::select!` speculative parallelization, so we can verify intent and co-sign in under 25ms (1515 Requests/Second). We never bottleneck the execution layer. 

**2. How does this project benefit the Sui Ecosystem?**
This is a massive, immediate synergy with Sui's newly announced Nautilus verifiable compute framework. Sui is natively utilizing AWS Nitro Enclaves to bring verifiable off-chain compute to the network. 

Because SPQE is already built from the ground up in Rust specific to the AWS Nitro Enclave architecture, the technical bridging is almost zero. We aren't just giving Sui an oracle; we are giving Sui the ability to safely host high-frequency AI agent workflows that settle securely on-chain without exposing the network to off-chain LLM vulnerabilities. Providing this primitive to Sui developers gives Sui the safest AI-agent infrastructure in Web3.

**3. What is the current state of the project?**
The core MVP is entirely built and deployed. The Rust vsock server running in the AWS Enclave, the policy engine, and the TypeScript gateway are live. We have an end-to-end Playwright test suite that actively proves the enclave intercepting and mathematically blocking 5 different complex zero-day DeFi attacks (MEV slippage, recursive CPI drains). 

**4. How will the Sui Foundation grant be used?**
We need direct technical integration support from the Mysten Labs core development team to seamlessly bridge our AWS Nitro vsock output directly into Sui's Nautilus state layer. The financial grant will be used exclusively to continuously run and auto-scale the global AWS TEE and serverless GPU clusters required to evaluate real-time agent intent for the Sui developer ecosystem, offsetting the high cloud infrastructure costs.

**5. Tell us about your team.**
We are a Berlin-based team specializing in the intersection of Web3 security and AI. We build institutional-grade, deep-tech infrastructure and focus intensely on mitigating the adversarial reality of LLMs interacting with deterministic financial smart contracts.

---

### What you need to do now:
1. Go to the Sui Foundation Request for Proposals (RFP) portal `sui.io/request-for-proposals`.
2. Select the "Data, Oracles & TEEs" or general "Infrastructure" bucket.
3. Paste these humanized answers. 
4. Emphasize that you are directly integrating with **Nautilus**, which will immediately flag your application as highly informed and strategic to the reviewers.
