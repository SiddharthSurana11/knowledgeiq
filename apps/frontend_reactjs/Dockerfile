# Stage 1: Build production React static bundle using Node.js
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci || npm install --force

# Copy source code and build production static bundle into /app/dist
COPY . .
RUN npm run build

# Stage 2: Serve compiled static assets via Nginx
FROM nginx:alpine

# Copy compiled dist from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom Nginx proxy configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose HTTP port
EXPOSE 80

# Healthcheck endpoint
HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
