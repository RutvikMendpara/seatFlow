# Build context is the repo root so the workspace lockfile is available.
FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter web

FROM deps AS dev
COPY apps/web apps/web
WORKDIR /repo/apps/web
ENV NEXT_TELEMETRY_DISABLED=1
EXPOSE 3000
CMD ["pnpm", "dev", "--hostname", "0.0.0.0"]
