# ── Build stage ───────────────────────────────────────────────────────────
# Node 18 reached end-of-life (no security fixes); 22 is the current LTS.
FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; \
    else npm install --no-audit --no-fund; fi

COPY . .

# CRA reads REACT_APP_* env vars at build time, not container runtime
ARG REACT_APP_API_URL=""
ENV REACT_APP_API_URL=$REACT_APP_API_URL
# No source maps in the shipped bundle (they expose the full source code)
ENV GENERATE_SOURCEMAP=false

RUN npm run build

# ── Runtime stage: static files only, no source / node_modules / toolchain ─
FROM node:22-alpine

WORKDIR /app
RUN npm install -g serve@14.2.4 --no-audit --no-fund
COPY --from=build --chown=node:node /app/build ./build

USER node

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000 || exit 1

CMD ["serve", "-s", "build", "-l", "3000"]
