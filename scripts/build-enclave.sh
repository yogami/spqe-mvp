#!/bin/bash
# =============================================================================
# SPQE Enclave Build Script
# =============================================================================
# Run this ON the c7g.large EC2 instance.
# Builds the Rust binary, creates the Enclave Image File (EIF),
# and starts the Nitro Enclave.
#
# Usage: ./scripts/build-enclave.sh
# =============================================================================

set -euo pipefail

echo "============================================"
echo "  🔒 Building SPQE Nitro Enclave"
echo "============================================"

# Clone the repo if not already present
if [ ! -d "/home/ec2-user/spqe-mvp" ]; then
    echo "📦 Cloning SPQE repository..."
    cd /home/ec2-user
    git clone https://github.com/$(git config user.name)/spqe-mvp.git || \
    git clone https://github.com/YOUR_GITHUB_USER/spqe-mvp.git
    cd spqe-mvp
else
    cd /home/ec2-user/spqe-mvp
    git pull
fi

# Step 1: Build the Docker image for the enclave
echo ""
echo "🐳 Building Docker image for enclave..."
cd nitro-enclave-signer
docker build -t spqe-enclave-signer:latest .

# Step 2: Convert Docker image to Nitro Enclave Image (EIF)
echo ""
echo "🔐 Building Enclave Image File (EIF)..."
nitro-cli build-enclave \
    --docker-uri spqe-enclave-signer:latest \
    --output-file /home/ec2-user/spqe-enclave.eif

echo "   EIF built successfully!"

# Step 3: Terminate any existing enclave
echo ""
echo "🔄 Stopping any existing enclave..."
nitro-cli terminate-enclave --all 2>/dev/null || true

# Step 4: Start the Nitro Enclave
echo ""
echo "🚀 Starting Nitro Enclave..."
ENCLAVE_ID=$(nitro-cli run-enclave \
    --cpu-count 2 \
    --memory 512 \
    --eif-path /home/ec2-user/spqe-enclave.eif \
    --enclave-cid 16 \
    --debug-mode \
    | jq -r '.EnclaveID')

echo "   Enclave ID: ${ENCLAVE_ID}"

# Step 5: Set up vsock proxy (bridges vsock to TCP for external access)
echo ""
echo "🌐 Starting vsock proxy (vsock:16:5000 → tcp:0.0.0.0:5000)..."

# Install vsock-proxy if not present
if ! command -v vsock-proxy &>/dev/null; then
    echo "   Installing vsock-proxy..."
    # The vsock-proxy is part of the Nitro Enclaves CLI
fi

# Create a simple socat-based proxy
nohup socat TCP-LISTEN:5000,fork,reuseaddr VSOCK-CONNECT:16:5000 &
echo "   ✅ Proxy running on port 5000"

# Step 6: Verify
echo ""
echo "⏳ Waiting for enclave to start (10s)..."
sleep 10

echo ""
echo "🔍 Enclave status:"
nitro-cli describe-enclaves

echo ""
echo "============================================"
echo "  ✅ SPQE Enclave is running!"
echo "  CID:  16"
echo "  Port: 5000 (proxied via TCP)"
echo ""
echo "  Test: curl http://localhost:5000/health"
echo "============================================"
