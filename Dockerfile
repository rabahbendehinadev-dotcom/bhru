# Build from the repository root, not artifacts/bhru.
# Debian/glibc on amd64 matches the native build packages in pnpm-workspace.yaml.
FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

# Cache dependency installation independently from application source changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY artifacts/bhru/package.json ./artifacts/bhru/package.json
COPY lib/api-client-react/package.json ./lib/api-client-react/package.json
RUN pnpm --filter @workspace/bhru... install --frozen-lockfile

COPY artifacts/bhru/ ./artifacts/bhru/
COPY lib/api-client-react/ ./lib/api-client-react/
COPY tsconfig.base.json ./
ENV NODE_ENV=production BASE_PATH=/
RUN pnpm --filter @workspace/bhru run build

# No package manager, node_modules, source, credentials, or Replit runtime needed.
FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build --chown=node:node /app/artifacts/bhru/dist/public ./dist/public
COPY --chown=node:node artifacts/bhru/server.mjs ./server.mjs
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]