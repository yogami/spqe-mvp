#!/bin/bash
# =============================================================================
# SPQE AWS Spin-Down Script — BUDGET PROTECTION
# =============================================================================
# Terminates ALL instances tagged with "spqe-hackathon" to prevent cost overrun.
# Run this after every dev session!
#
# Usage: ./scripts/aws-spin-down.sh [region]
# =============================================================================

set -euo pipefail

REGION="${1:-us-east-1}"
TAG_KEY="Project"
TAG_VALUE="spqe-hackathon"

echo "============================================"
echo "  🛑 SPQE AWS Spin-Down (Budget Protection)"
echo "  Region: ${REGION}"
echo "============================================"

# Load saved instance details if available
ENV_FILE="${BASH_SOURCE[0]%/*}/.aws-instances.env"
if [ -f "$ENV_FILE" ]; then
    source "$ENV_FILE"
    echo "  Loaded instance details from .aws-instances.env"
fi

# Find all running instances with our tag
echo ""
echo "🔍 Finding SPQE instances..."

INSTANCE_IDS=$(aws ec2 describe-instances --region "$REGION" \
    --filters "Name=tag:${TAG_KEY},Values=${TAG_VALUE}" \
              "Name=instance-state-name,Values=running,stopped,pending" \
    --query "Reservations[*].Instances[*].[InstanceId,InstanceType,State.Name,Tags[?Key=='Name'].Value|[0]]" \
    --output text)

if [ -z "$INSTANCE_IDS" ]; then
    echo "   ✅ No running SPQE instances found. Nothing to terminate."
    exit 0
fi

echo "   Found instances:"
echo "$INSTANCE_IDS" | while read -r line; do
    echo "     $line"
done

# Estimate cost since launch
echo ""
echo "💰 Estimating current session cost..."

RUNNING_IDS=$(aws ec2 describe-instances --region "$REGION" \
    --filters "Name=tag:${TAG_KEY},Values=${TAG_VALUE}" \
              "Name=instance-state-name,Values=running,stopped,pending" \
    --query "Reservations[*].Instances[*].InstanceId" --output text)

for ID in $RUNNING_IDS; do
    LAUNCH_TIME=$(aws ec2 describe-instances --region "$REGION" \
        --instance-ids "$ID" \
        --query "Reservations[0].Instances[0].LaunchTime" --output text)
    INSTANCE_TYPE=$(aws ec2 describe-instances --region "$REGION" \
        --instance-ids "$ID" \
        --query "Reservations[0].Instances[0].InstanceType" --output text)
    
    echo "   ${ID} (${INSTANCE_TYPE}): launched at ${LAUNCH_TIME}"
done

# Terminate instances
echo ""
echo "🗑️  Terminating all SPQE instances..."

aws ec2 terminate-instances --region "$REGION" \
    --instance-ids $RUNNING_IDS \
    --query "TerminatingInstances[*].[InstanceId,CurrentState.Name]" --output table

echo ""
echo "⏳ Waiting for termination..."
aws ec2 wait instance-terminated --region "$REGION" --instance-ids $RUNNING_IDS 2>/dev/null || true

# Clean up security group (optional — might fail if instances not fully terminated)
echo ""
echo "🧹 Cleaning up security group..."
SG_ID=$(aws ec2 describe-security-groups --region "$REGION" \
    --filters "Name=group-name,Values=spqe-hackathon-sg" \
    --query "SecurityGroups[0].GroupId" --output text 2>/dev/null || echo "")

if [ -n "$SG_ID" ] && [ "$SG_ID" != "None" ]; then
    aws ec2 delete-security-group --region "$REGION" --group-id "$SG_ID" 2>/dev/null && \
        echo "   ✅ Security group deleted" || \
        echo "   ⚠️  Could not delete SG yet (instances may still be terminating)"
fi

# Clean up env file
rm -f "$ENV_FILE"

echo ""
echo "============================================"
echo "  ✅ All SPQE instances terminated!"
echo "  💸 Remember to check your AWS billing"
echo "     dashboard for the final cost."
echo "============================================"
