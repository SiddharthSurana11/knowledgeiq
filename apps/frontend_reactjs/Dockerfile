FROM nginx:alpine

# Copy pre-built production static assets directly into Nginx html root
COPY dist /usr/share/nginx/html

# Copy custom Nginx proxy configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose HTTP port
EXPOSE 80

# Healthcheck
HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
