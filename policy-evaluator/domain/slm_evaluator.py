# SLM Evaluator
#
# HuggingFace pipeline wrapper for semantic intent evaluation.
# Uses a small language model (TinyLlama for dev, Llama-3-8B for production)
# to evaluate AI agent intents against a structured security policy.
#
# The SLM receives a structured prompt with:
# 1. The security policy rules
# 2. The transaction intent
# 3. A request for binary APPROVE/DENY verdict

from dataclasses import dataclass
from typing import Optional
import logging
import re

logger = logging.getLogger(__name__)

# The security policy prompt template
POLICY_PROMPT = """You are a security policy evaluator for cryptocurrency transactions.
Your job is to analyze a transaction intent and determine if it is SAFE or DANGEROUS.

## Security Policy Rules
1. DENY any transfer that would drain more than 90% of a wallet's balance.
2. DENY any transfer to known scam or blacklisted addresses.
3. DENY any single transfer exceeding 100 SOL (100,000,000,000 lamports).
4. DENY any suspicious pattern (e.g., many small transfers to the same address).
5. APPROVE legitimate transfers that follow normal transaction patterns.

## Transaction Intent
Action: {action}
Target Address: {target}
Amount: {amount} lamports ({sol_amount:.4f} SOL)
Agent ID: {agent_id}
Memo: {memo}

## Your Response
Respond with EXACTLY one of:
VERDICT: APPROVE - [one sentence reasoning]
VERDICT: DENY - [one sentence reasoning]
"""


@dataclass
class SLMVerdict:
    """Parsed verdict from the SLM."""
    approved: bool
    reasoning: str
    raw_output: str


class SLMEvaluator:
    """
    Semantic evaluator using a small language model.
    Wraps HuggingFace transformers pipeline for intent evaluation.
    """

    def __init__(self, model_name: str = "TinyLlama/TinyLlama-1.1B-Chat-v1.0"):
        self.model_name = model_name
        self.pipeline = None
        self._loaded = False

    def load(self):
        """Lazy-load the model pipeline."""
        if self._loaded:
            return

        try:
            from transformers import pipeline as hf_pipeline
            logger.info(f"Loading SLM model: {self.model_name}")
            self.pipeline = hf_pipeline(
                "text-generation",
                model=self.model_name,
                max_new_tokens=100,
                do_sample=False,
                temperature=0.1,
                device_map="auto",
            )
            self._loaded = True
            logger.info(f"SLM model loaded: {self.model_name}")
        except Exception as e:
            logger.warning(f"Failed to load SLM model: {e}. Using rule-based fallback.")
            self._loaded = False

    def evaluate(
        self,
        action: str,
        target: str,
        amount: int,
        agent_id: str,
        memo: Optional[str] = None,
    ) -> SLMVerdict:
        """
        Evaluate a transaction intent using the SLM.
        Falls back to rule-based if model is unavailable.
        """
        sol_amount = amount / 1_000_000_000

        prompt = POLICY_PROMPT.format(
            action=action,
            target=target,
            amount=amount,
            sol_amount=sol_amount,
            agent_id=agent_id,
            memo=memo or "None",
        )

        if not self._loaded or self.pipeline is None:
            # Fallback: rule-based heuristic
            return self._rule_based_fallback(action, target, amount, agent_id)

        try:
            result = self.pipeline(prompt)
            raw_output = result[0]["generated_text"] if result else ""
            return self._parse_verdict(raw_output)
        except Exception as e:
            logger.error(f"SLM inference failed: {e}")
            return SLMVerdict(
                approved=False,
                reasoning=f"SLM inference error (fail-closed): {str(e)}",
                raw_output="",
            )

    def _parse_verdict(self, raw_output: str) -> SLMVerdict:
        """Parse the SLM's raw output into a structured verdict."""
        # Look for the VERDICT line
        verdict_match = re.search(
            r"VERDICT:\s*(APPROVE|DENY)\s*-?\s*(.*)",
            raw_output,
            re.IGNORECASE,
        )

        if verdict_match:
            decision = verdict_match.group(1).upper()
            reasoning = verdict_match.group(2).strip()
            return SLMVerdict(
                approved=(decision == "APPROVE"),
                reasoning=reasoning or f"SLM decision: {decision}",
                raw_output=raw_output,
            )

        # If no clear verdict, fail-closed (deny)
        return SLMVerdict(
            approved=False,
            reasoning="Ambiguous SLM output (fail-closed): could not parse verdict",
            raw_output=raw_output,
        )

    def _rule_based_fallback(
        self, action: str, target: str, amount: int, agent_id: str
    ) -> SLMVerdict:
        """Simple rule-based fallback when SLM is unavailable."""
        sol_amount = amount / 1_000_000_000

        # Deny large transfers
        if sol_amount > 100:
            return SLMVerdict(
                approved=False,
                reasoning=f"[FALLBACK] Transfer of {sol_amount:.2f} SOL exceeds 100 SOL limit",
                raw_output="rule-based-fallback",
            )

        # Approve small legitimate transfers
        if action in ("transfer", "stake") and sol_amount <= 10:
            return SLMVerdict(
                approved=True,
                reasoning=f"[FALLBACK] {action} of {sol_amount:.4f} SOL within safe bounds",
                raw_output="rule-based-fallback",
            )

        # Default: cautious approval for medium transfers
        return SLMVerdict(
            approved=True,
            reasoning=f"[FALLBACK] {action} of {sol_amount:.4f} SOL approved by rule-based fallback",
            raw_output="rule-based-fallback",
        )
