# syntax=docker/dockerfile:1

FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production --ignore-scripts

# Production image
FROM base AS runner

# Create non-root user
RUN groupadd --system --gid 1001 memory && \
    useradd --system --uid 1001 --gid memory memory

# Copy dependencies and source
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Create data directory
RUN mkdir -p /data && chown -R memory:memory /data /app

USER memory

# Environment defaults
ENV MEMORY_PORT=8765
ENV MEMORY_HOST=0.0.0.0
ENV MEMORY_STORAGE_PATH=/data

EXPOSE 8765

ENTRYPOINT ["bun", "src/cli/index.ts"]
CMD ["serve"]
