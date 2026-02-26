# ==============================================================================
# Devabase Backend Dockerfile
# Multi-stage build for optimized production image
# ==============================================================================

# Stage 1: Build
FROM rust:latest AS builder

WORKDIR /app

# Install dependencies for pdf-extract and other native libs
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    libpq-dev \
    cmake \
    && rm -rf /var/lib/apt/lists/*

# Copy all source code and build
COPY Cargo.toml Cargo.lock ./
COPY src ./src
COPY migrations ./migrations

# Build the application
RUN cargo build --release

# Stage 2: Runtime (use same base as builder for GLIBC compatibility)
FROM debian:trixie-slim AS runtime

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    libpq5 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy binary from builder
COPY --from=builder /app/target/release/devabase /usr/local/bin/devabase

# Copy migrations
COPY --from=builder /app/migrations /app/migrations

# Create data directory
RUN mkdir -p /app/data && chown -R 1000:1000 /app/data

# Create non-root user
RUN useradd -r -u 1000 -s /bin/false devabase
USER devabase

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/v1/health || exit 1

# Run the application
CMD ["devabase", "serve"]
