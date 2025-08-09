# Use official Node.js LTS image
FROM node:18-alpine

# Install system dependencies for WhatsApp and crypto
RUN apk add --no-cache \
    ffmpeg \
    wget \
    curl \
    git \
    python3 \
    make \
    g++ \
    libc6-compat \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    librsvg-dev \
    pixman-dev \
    pkgconfig \
    vips-dev \
    openssl-dev

# Set environment variables for crypto support
ENV NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=512"

# Create app directory
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S whatsappbot -u 1001

# Copy package files
COPY --chown=whatsappbot:nodejs package*.json ./

# Install dependencies
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

# Copy application files
COPY --chown=whatsappbot:nodejs . .

# Create necessary directories with proper permissions
RUN mkdir -p session plugins temp logs public && \
    chown -R whatsappbot:nodejs /app

# Switch to non-root user
USER whatsappbot

# Expose port
EXPOSE 3000

# Add health check
HEALTHCHECK --interval=30s --timeout=15s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start the application
CMD ["node", "index.js"]
