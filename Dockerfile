FROM node:26.10.0-bookworm-slim AS dependencies
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts && npm rebuild better-sqlite3 esbuild

FROM dependencies AS build
COPY . .
RUN npm run build

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev --ignore-scripts

FROM node:26.10.0-bookworm-slim AS runtime
LABEL org.opencontainers.image.source="https://github.com/Sniphs98/kenny"
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 \
    DATABASE_URL=/app/data/kenny.db ATTACHMENTS_DIR=/app/data/attachments \
    MIGRATIONS_DIR=/app/drizzle BODY_SIZE_LIMIT=30M
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/drizzle ./drizzle
COPY package.json ./
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "build"]
