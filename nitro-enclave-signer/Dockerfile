# Nitro Enclave Signer — Dockerfile
# Multi-stage build for the Rust enclave application.
# Stage 1: Build with liboqs
# Stage 2: Minimal runtime image

FROM rust:1.83-bookworm AS builder

# Install liboqs dependencies
RUN apt-get update && apt-get install -y \
    cmake \
    ninja-build \
    libssl-dev \
    pkg-config \
    git \
    && rm -rf /var/lib/apt/lists/*

# Build liboqs from source
RUN git clone --depth 1 --branch 0.11.0 https://github.com/open-quantum-safe/liboqs.git /tmp/liboqs \
    && cd /tmp/liboqs \
    && mkdir build && cd build \
    && cmake -GNinja \
    -DCMAKE_INSTALL_PREFIX=/usr/local \
    -DOQS_USE_OPENSSL=OFF \
    -DBUILD_SHARED_LIBS=OFF \
    .. \
    && ninja \
    && ninja install \
    && rm -rf /tmp/liboqs

WORKDIR /app
COPY Cargo.toml ./
COPY src/ ./src/

# Set liboqs paths for the oqs crate
ENV OQS_DIR=/usr/local
ENV PKG_CONFIG_PATH=/usr/local/lib/pkgconfig

RUN cargo build --release

# === Stage 2: Runtime ===
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/nitro-enclave-signer /usr/local/bin/
COPY --from=builder /usr/local/lib/liboqs* /usr/local/lib/

ENV PORT=5000
ENV SLM_URL=http://policy-evaluator:8080
ENV EVAL_TIMEOUT_MS=20
ENV RUST_LOG=info

EXPOSE 5000

CMD ["nitro-enclave-signer"]
