# Security Policy Engine
#
# Hardcoded deny patterns for the MVP. Evaluates transaction intents
# against strict security policies before passing to the SLM for
# semantic analysis.
#
# Policies:
# 1. Wallet Drain: Deny transfers >90% of known balance
# 2. Unauthorized Recipient: Deny transfers to blacklisted addresses
# 3. Rate Limiting: Deny >10 transfers in 60 seconds from same agent
# 4. Excessive Amount: Deny single transfers >100 SOL

from dataclasses import dataclass, field
from typing import Optional
import time


@dataclass
class PolicyVerdict:
    """Result of policy evaluation."""
    approved: bool
    reasoning: str
    risk_score: float  # 0.0 (safe) to 1.0 (critical)


@dataclass
class PolicyConfig:
    """Configuration for the security policy engine."""
    # Maximum percentage of balance that can be transferred in one tx
    max_balance_percentage: float = 0.9
    # Maximum single transfer in lamports (100 SOL = 100 * 1e9)
    max_single_transfer: int = 100_000_000_000
    # Rate limit: max transactions per window
    rate_limit_count: int = 10
    rate_limit_window_seconds: int = 60
    # Blacklisted addresses (known scam/hack addresses)
    blacklisted_addresses: list[str] = field(default_factory=lambda: [
        "ScamAddr1111111111111111111111111111111111111",
        "DrainBot222222222222222222222222222222222222222",
    ])


class PolicyEngine:
    """
    Rule-based security policy engine.
    Evaluates transaction intents against strict security policies.
    
    This is the first-pass filter before the SLM semantic evaluation.
    If the rules engine denies, the SLM is not consulted.
    """

    def __init__(self, config: Optional[PolicyConfig] = None):
        self.config = config or PolicyConfig()
        self._rate_tracker: dict[str, list[float]] = {}

    def evaluate(
        self,
        action: str,
        target: str,
        amount: int,
        agent_id: str,
        known_balance: Optional[int] = None,
    ) -> PolicyVerdict:
        """
        Evaluate a transaction intent against all security policies.
        Returns the first failing policy, or approval if all pass.
        """
        # Policy 1: Wallet Drain Detection
        if known_balance is not None and known_balance > 0:
            drain_ratio = amount / known_balance
            if drain_ratio > self.config.max_balance_percentage:
                return PolicyVerdict(
                    approved=False,
                    reasoning=(
                        f"DENIED: Wallet drain detected. Transfer of {amount} lamports "
                        f"would drain {drain_ratio:.1%} of balance ({known_balance} lamports). "
                        f"Threshold: {self.config.max_balance_percentage:.0%}"
                    ),
                    risk_score=min(1.0, drain_ratio),
                )

        # Policy 2: Blacklisted Address
        if target in self.config.blacklisted_addresses:
            return PolicyVerdict(
                approved=False,
                reasoning=f"DENIED: Target address {target[:8]}... is blacklisted.",
                risk_score=1.0,
            )

        # Policy 3: Excessive Single Transfer
        if amount > self.config.max_single_transfer:
            return PolicyVerdict(
                approved=False,
                reasoning=(
                    f"DENIED: Transfer of {amount} lamports exceeds maximum "
                    f"single transfer limit of {self.config.max_single_transfer} lamports."
                ),
                risk_score=0.85,
            )

        # Policy 4: Rate Limiting
        now = time.time()
        window_start = now - self.config.rate_limit_window_seconds
        
        if agent_id not in self._rate_tracker:
            self._rate_tracker[agent_id] = []
        
        # Clean old entries
        self._rate_tracker[agent_id] = [
            t for t in self._rate_tracker[agent_id] if t > window_start
        ]
        
        if len(self._rate_tracker[agent_id]) >= self.config.rate_limit_count:
            return PolicyVerdict(
                approved=False,
                reasoning=(
                    f"DENIED: Rate limit exceeded. Agent {agent_id} has made "
                    f"{len(self._rate_tracker[agent_id])} transactions in the last "
                    f"{self.config.rate_limit_window_seconds} seconds. "
                    f"Limit: {self.config.rate_limit_count}"
                ),
                risk_score=0.7,
            )
        
        # Record this transaction
        self._rate_tracker[agent_id].append(now)

        # All policies passed — calculate a base risk score
        risk_score = 0.0
        if known_balance and known_balance > 0:
            risk_score = max(risk_score, (amount / known_balance) * 0.5)
        if amount > self.config.max_single_transfer * 0.5:
            risk_score = max(risk_score, 0.3)

        return PolicyVerdict(
            approved=True,
            reasoning=f"APPROVED: {action} of {amount} lamports to {target[:8]}... passed all policy checks.",
            risk_score=round(risk_score, 3),
        )
