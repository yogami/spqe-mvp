#!/bin/bash
# =============================================================================
# SPQE GPU Deploy Script
# =============================================================================
# Run this ON the g5.xlarge EC2 instance.
# Deploys the policy evaluator with the SLM model.
#
# Usage: ./scripts/deploy-gpu.sh [model_name]
# =============================================================================

set -euo pipefail

MODEL_NAME="${1:-meta-llama/Meta-Llama-3-8B-Instruct}"
PORT=8080

echo "============================================"
echo "  🧠 Deploying SPQE Policy Evaluator"
echo "  Model: ${MODEL_NAME}"
echo "  Port:  ${PORT}"
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

# Verify GPU is available
echo ""
echo "🔍 Checking GPU..."
nvidia-smi || echo "⚠️  nvidia-smi not found — GPU might not be ready yet"

# Stop existing container
echo ""
echo "🔄 Stopping existing policy-evaluator container..."
docker stop spqe-policy-evaluator 2>/dev/null || true
docker rm spqe-policy-evaluator 2>/dev/null || true

# Build the Docker image
echo ""
echo "🐳 Building Policy Evaluator Docker image..."
cd policy-evaluator
docker build -t spqe-policy-evaluator:latest .

# Run with GPU support
echo ""
echo "🚀 Starting Policy Evaluator with GPU..."
docker run -d \
    --name spqe-policy-evaluator \
    --gpus all \
    -p ${PORT}:${PORT} \
    -e PORT=${PORT} \
    -e MODEL_NAME="${MODEL_NAME}" \
    -e PRELOAD_MODEL=true \
    -e HF_TOKEN="${HF_TOKEN:-}" \
    --restart unless-stopped \
    spqe-policy-evaluator:latest

# Wait for the model to load
echo ""
echo "⏳ Waiting for model to load (this may take 2-5 minutes)..."
for i in $(seq 1 60); do
    if curl -s http://localhost:${PORT}/health | grep -q '"status":"ok"'; then
        echo ""
        echo "   ✅ Model loaded successfully!"
        break
    fi
    echo -n "."
    sleep 5
done

echo ""
echo "🔍 Container status:"
docker ps --filter "name=spqe-policy-evaluator"

echo ""
echo "============================================"
echo "  ✅ Policy Evaluator is running!"
echo "  Port: ${PORT}"
echo "  Model: ${MODEL_NAME}"
echo ""
echo "  Test: curl http://localhost:${PORT}/health"
echo "  Evaluate: curl -X POST http://localhost:${PORT}/evaluate \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"action\":\"transfer\",\"target\":\"...\",\"amount\":1000000,\"agent_id\":\"test\"}'"
echo "============================================"
