# Agent Gateway — Dockerfile
# Node.js 20 Alpine image for Railway deployment.

FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json ./
RUN npm install
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

# === Stage 2: Runtime ===
FROM node:20-alpine

WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

ENV PORT=3000
ENV ENCLAVE_URL=http://enclave-signer:5000
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/infrastructure/server.js"]
