FROM node:22-slim AS builder

# Create app directory
WORKDIR /app

# Copy package files for more efficient caching
COPY package*.json ./

# Install dependencies including dev dependencies for possible build steps
RUN npm ci

# Copy app source
COPY . .

# If you have a build step (uncomment if needed)
# RUN npm run build

# --------- Production image -----------
FROM node:16-slim

# Create app directory
WORKDIR /app

# Set to production environment
ENV NODE_ENV=production

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy built app from builder stage
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts

# Expose the port the app runs on
EXPOSE 3000

# Set proper user for security
USER node

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Run the application
CMD [ "node", "src/app.js" ]