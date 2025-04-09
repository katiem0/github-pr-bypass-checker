FROM node:18-slim AS builder

# Create app directory
WORKDIR /app

# Copy package files for more efficient caching
COPY package*.json ./

# Install dependencies including dev dependencies for possible build steps
RUN npm ci --no-optional && npm cache clean --force

# Copy app source
COPY . .

# --------- Production image -----------
FROM node:18-slim

# Set environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    LOG_LEVEL=info

# Create app directory with proper permissions
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies with no optional packages
RUN npm ci --only=production --no-optional && npm cache clean --force

# Copy only application files from builder
COPY --from=builder /app/src ./src

# Expose the port the app runs on
EXPOSE 3000

# Create a non-root user and switch to it
RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

# Health check with shorter initial delay
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Run the application
CMD [ "node", "src/app.js" ]