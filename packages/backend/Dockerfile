FROM oven/bun:1.4.3-alpine

WORKDIR /app

COPY package.json bun.lock bunfig.toml ./
COPY packages/backend/package.json ./packages/backend/package.json
COPY packages/frontend/package.json ./packages/frontend/package.json
COPY packages/shared-types/package.json ./packages/shared-types/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/sdk/package.json ./packages/sdk/package.json
RUN bun install --frozen-lockfile --ignore-scripts

COPY packages/backend ./packages/backend
COPY packages/contracts ./packages/contracts
COPY packages/sdk ./packages/sdk
RUN bun run build:publishing

ENV NODE_ENV=production
EXPOSE 8080
CMD ["bun", "packages/backend/server.ts"]
