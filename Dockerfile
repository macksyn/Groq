# Use Node.js 18 LTS
FROM node:18-slim

# Install essential system dependencies only
RUN apt-get update && apt-get install -y \
    ffmpeg \
    wget \
    curl \
    git \
    python3 \
    make \
    g++ \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Create non-root user
RUN useradd -m -u 1001 whatsappbot

# Copy package files first for better caching
COPY --chown=whatsappbot:whatsappbot package*.json ./

# Install dependencies with legacy peer deps flag
RUN npm install --omit=dev --legacy-peer-deps && \
    npm cache clean --force

# Copy application files
COPY --chown=whatsappbot:whatsappbot . .

# Create necessary directories
RUN mkdir -p session temp logs && \
    chown -R whatsappbot:whatsappbot /app

# Switch to non-root user
USER whatsappbot

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=15s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start application
CMD ["node", "index.js"]
