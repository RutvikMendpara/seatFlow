# Build context is the repo root so the workspace lockfile is available.
FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter api

FROM deps AS dev
COPY apps/api apps/api
WORKDIR /repo/apps/api
EXPOSE 4000
CMD ["pnpm", "start:dev"]
