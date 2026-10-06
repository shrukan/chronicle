# --------------------------------------------------------------------------- #
# Node Build Image
# Description: Build environment for the TypeScript workspaces (engine, tools,
# frontend). Runs the same Taskfile tasks as local development.
# --------------------------------------------------------------------------- #
ARG NODE_VERSION=24.15.0
ARG NGINX_VERSION=1.29

FROM node:${NODE_VERSION}-trixie AS node-toolchain

RUN npm install -g @go-task/cli@3.50.0

WORKDIR /src

# --------------------------------------------------------------------------- #
# Frontend Build Image
# Description: Installs dependencies and builds the PWA (incl. the content the
# app serves) into /out.
# --------------------------------------------------------------------------- #
FROM node-toolchain AS build-frontend

# Workspace manifests first, so dependency installation is cached separately.
COPY package.json package-lock.json Taskfile.yml tsconfig.base.json ./
COPY engine/package.json engine/
COPY tools/converter/package.json tools/converter/
COPY tools/story-cli/package.json tools/story-cli/
COPY tools/story-tester/package.json tools/story-tester/
COPY frontend/package.json frontend/
RUN --mount=type=cache,target=/root/.npm \
  task deps:install CI=true

COPY engine engine
COPY frontend frontend
COPY content content
RUN task frontend:build CI=true OUTPUT_DIR=/out

# --------------------------------------------------------------------------- #
# Runtime Image
# Description: Static files served by unprivileged nginx on port 8080. HTTPS is
# expected to be terminated by a reverse proxy (needed for the service worker).
# --------------------------------------------------------------------------- #
FROM nginxinc/nginx-unprivileged:${NGINX_VERSION}-alpine AS runtime

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build-frontend /out/browser /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
