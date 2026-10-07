# Build from the repository root, not artifacts/bhru.
# Debian/glibc on amd64 matches the native build packages in pnpm-workspace.yaml.
FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

# Cache dependency installation independently from application source changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY artifacts/bhru/package.json ./artifacts/bhru/package.json
COPY artifacts/api-server/package.json ./artifacts/api-server/package.json
COPY lib/api-client-react/package.json ./lib/api-client-react/package.json
COPY lib/api-zod/package.json ./lib/api-zod/package.json
COPY lib/db/package.json ./lib/db/package.json
COPY lib/currency-presentation/package.json ./lib/currency-presentation/package.json
RUN pnpm --filter @workspace/bhru... --filter @workspace/api-server... install --frozen-lockfile

COPY artifacts/bhru/ ./artifacts/bhru/
COPY artifacts/api-server/ ./artifacts/api-server/
COPY lib/api-client-react/ ./lib/api-client-react/
COPY lib/api-zod/ ./lib/api-zod/
COPY lib/db/ ./lib/db/
COPY lib/currency-presentation/ ./lib/currency-presentation/
COPY scripts/prepare-production.mjs ./scripts/prepare-production.mjs
COPY tsconfig.base.json ./
ENV NODE_ENV=production BASE_PATH=/
RUN pnpm run build:bhru

# No package manager, node_modules, source, credentials, or Replit runtime needed.
FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build --chown=node:node /app/artifacts/api-server/dist/ ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Serialize/apply pending migrations before exposing the application.
# Failure stops startup; exec makes the server PID 1 for Swarm shutdown signals.
CMD ["sh", "-c", "node migrate.mjs && exec node index.mjs"]