FROM node:20-alpine

WORKDIR /app

# Copy package descriptors from apps/api-gateway
COPY apps/api-gateway/package*.json ./

# Install production dependencies only
RUN npm install --only=production --force

# Copy root protos directory into container
COPY protos /protos
COPY protos ./protos

# Copy API Gateway application source code
COPY apps/api-gateway/ .

# Expose API Gateway port
EXPOSE 5000

# Healthcheck endpoint
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/health || exit 1

# Start API Gateway
CMD ["npm", "start"]
