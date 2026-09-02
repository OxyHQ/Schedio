FROM oven/bun:1.3.14-alpine

WORKDIR /app

COPY package.json bun.lock bunfig.toml ./
COPY packages/backend/package.json ./packages/backend/package.json
COPY packages/frontend/package.json ./packages/frontend/package.json
COPY packages/shared-types/package.json ./packages/shared-types/package.json
RUN bun install --frozen-lockfile --ignore-scripts

COPY packages/backend ./packages/backend

ENV NODE_ENV=production
EXPOSE 8080
CMD ["bun", "packages/backend/server.ts"]
