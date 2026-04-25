# syntax=docker/dockerfile:1.6

# ------------------------------------------------------------
# Stage 1: build the production website bundle
# ------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Install deps (cached when package*.json unchanged)
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Copy source needed for the website build
COPY source ./source
COPY website ./website
COPY tools ./tools

# Production build: minified, no sourcemap
# Note: build_website does not require update_engine_exports
RUN npx esbuild source/website/index.js \
    --bundle \
    --minify \
    --global-name=OV \
    --loader:.ttf=file \
    --loader:.woff=file \
    --loader:.svg=file \
    --outfile=build/website/o3dv.website.min.js

# Rewrite index.html to point at the production build dir
# (default points at build/website_dev/)
RUN sed -i 's|\.\./build/website_dev/|../build/website/|g' website/index.html

# ------------------------------------------------------------
# Stage 2: nginx serving the static bundle
# ------------------------------------------------------------
FROM nginx:1.27-alpine

# Drop default site config; we provide our own template
RUN rm /etc/nginx/conf.d/default.conf

# Copy the build artifacts and assets
COPY --from=builder /app/website /usr/share/nginx/html/website
COPY --from=builder /app/build   /usr/share/nginx/html/build

# nginx config template: ${PORT} is substituted at container start
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template

# Default port (overridable at runtime via -e PORT=...)
ENV PORT=8085

# Restrict envsubst to only the PORT variable so nginx's own $uri / $host
# variables in the template are NOT replaced by empty strings.
ENV NGINX_ENVSUBST_FILTER=PORT

EXPOSE 8085

# nginx:alpine image already runs envsubst on /etc/nginx/templates/*.template
# at startup and writes the result to /etc/nginx/conf.d/.
# See: https://hub.docker.com/_/nginx (Using environment variables in nginx configuration)
