#!/bin/bash
# =============================================================================
# SPQE AWS Spin-Up Script
# =============================================================================
# Creates the AWS infrastructure for the SPQE hackathon:
# 1. c7g.large (ARM/Graviton) — Nitro Enclave for the cryptographic signer
# (The SLM now runs on Serverless GPU to prevent exorbitant Hackathon EC2 costs)
#
# Budget: c7g.large @ $0.0725/hr
# 72hr worst case: $5.22 (well under the $100 budget limit)
#
# Usage: ./scripts/aws-spin-up.sh [region]
# =============================================================================

set -euo pipefail

REGION="${1:-us-east-1}"
TAG_KEY="Project"
TAG_VALUE="spqe-hackathon"
SECURITY_GROUP_NAME="spqe-hackathon-sg"

# AMI IDs (Amazon Linux 2023 — update as needed)
# These are for us-east-1. Change for other regions.
AL2023_ARM_AMI="ami-0c101f26f147fa7fd"  # Amazon Linux 2023 ARM

echo "============================================"
echo "  SPQE AWS Infrastructure Spin-Up"
echo "  Region: ${REGION}"
echo "  Budget: ~\$50 for 72-hour hackathon"
echo "============================================"

# --- Step 1: Create Security Group ---
echo ""
echo "📦 Creating security group: ${SECURITY_GROUP_NAME}..."

VPC_ID=$(aws ec2 describe-vpcs --region "$REGION" \
    --filters "Name=isDefault,Values=true" \
    --query "Vpcs[0].VpcId" --output text)

SG_ID=$(aws ec2 create-security-group --region "$REGION" \
    --group-name "$SECURITY_GROUP_NAME" \
    --description "SPQE Hackathon - Enclave instances" \
    --vpc-id "$VPC_ID" \
    --query "GroupId" --output text 2>/dev/null || \
    aws ec2 describe-security-groups --region "$REGION" \
    --filters "Name=group-name,Values=${SECURITY_GROUP_NAME}" \
    --query "SecurityGroups[0].GroupId" --output text)

echo "   Security Group: ${SG_ID}"

# Open required ports
aws ec2 authorize-security-group-ingress --region "$REGION" \
    --group-id "$SG_ID" --protocol tcp --port 22 --cidr 0.0.0.0/0 2>/dev/null || true
aws ec2 authorize-security-group-ingress --region "$REGION" \
    --group-id "$SG_ID" --protocol tcp --port 5000 --cidr 0.0.0.0/0 2>/dev/null || true
aws ec2 authorize-security-group-ingress --region "$REGION" \
    --group-id "$SG_ID" --protocol tcp --port 8080 --cidr 0.0.0.0/0 2>/dev/null || true
# Allow all traffic within the SG
aws ec2 authorize-security-group-ingress --region "$REGION" \
    --group-id "$SG_ID" --protocol -1 --source-group "$SG_ID" 2>/dev/null || true

echo "   ✅ Ports 22, 5000, 8080 opened"

# --- Step 2: Launch Nitro Enclave Instance (c7g.large ARM) ---
echo ""
echo "🔒 Launching Nitro Enclave instance (c7g.large)..."
echo "   Cost: \$0.0725/hr (~\$5.22/72hr)"

ENCLAVE_INSTANCE_ID=$(aws ec2 run-instances --region "$REGION" \
    --instance-type c7g.large \
    --image-id "$AL2023_ARM_AMI" \
    --security-group-ids "$SG_ID" \
    --enclave-options "Enabled=true" \
    --tag-specifications "ResourceType=instance,Tags=[{Key=${TAG_KEY},Value=${TAG_VALUE}},{Key=Name,Value=spqe-enclave-signer}]" \
    --block-device-mappings "DeviceName=/dev/xvda,Ebs={VolumeSize=30,VolumeType=gp3}" \
    --user-data "$(cat <<'USERDATA'
#!/bin/bash
yum update -y
yum install -y docker git aws-nitro-enclaves-cli aws-nitro-enclaves-cli-devel
systemctl enable --now docker
systemctl enable --now nitro-enclaves-allocator
usermod -aG docker ec2-user
usermod -aG ne ec2-user
# Allocate memory for enclave (512MB)
echo "memory_mib: 512" > /etc/nitro_enclaves/allocator.yaml
echo "cpu_count: 2" >> /etc/nitro_enclaves/allocator.yaml
systemctl restart nitro-enclaves-allocator
USERDATA
)" \
    --query "Instances[0].InstanceId" --output text)

echo "   Instance ID: ${ENCLAVE_INSTANCE_ID}"

# --- Step 3: Wait for instances to be running ---
echo ""
echo "⏳ Waiting for instances to reach 'running' state..."

aws ec2 wait instance-running --region "$REGION" \
    --instance-ids "$ENCLAVE_INSTANCE_ID"

# Get public IPs
ENCLAVE_IP=$(aws ec2 describe-instances --region "$REGION" \
    --instance-ids "$ENCLAVE_INSTANCE_ID" \
    --query "Reservations[0].Instances[0].PublicIpAddress" --output text)

# --- Output ---
echo ""
echo "============================================"
echo "  ✅ SPQE Infrastructure Ready!"
echo "============================================"
echo ""
echo "  Enclave Signer (c7g.large ARM):"
echo "    Instance ID: ${ENCLAVE_INSTANCE_ID}"
echo "    Public IP:   ${ENCLAVE_IP}"
echo "    SSH:         ssh ec2-user@${ENCLAVE_IP}"
echo ""
echo "  ⚠️  Budget Alert:"
echo "    c7g.large: \$0.0725/hr"
echo "    Run aws-spin-down.sh when not actively developing!"
echo ""
echo "  📝 Next Steps:"
echo "    1. SSH into enclave instance and run: scripts/build-enclave.sh"
echo "    2. Update ENCLAVE_URL in Railway with: http://${ENCLAVE_IP}:5000"
echo "============================================"

# Save IPs to a config file for other scripts
cat > "${BASH_SOURCE[0]%/*}/.aws-instances.env" <<EOF
ENCLAVE_INSTANCE_ID=${ENCLAVE_INSTANCE_ID}
ENCLAVE_IP=${ENCLAVE_IP}
REGION=${REGION}
SG_ID=${SG_ID}
EOF

echo "Instance details saved to scripts/.aws-instances.env"
