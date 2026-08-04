FROM node:24-alpine AS build
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/database/package.json packages/database/package.json
RUN --mount=type=secret,id=host_ca,required=true \
    NODE_EXTRA_CA_CERTS=/run/secrets/host_ca pnpm install --frozen-lockfile
COPY apps/web apps/web
RUN pnpm --filter @fleet/web build

FROM node:24-alpine
WORKDIR /workspace
ENV NODE_ENV=production
ENV PORT=3001
COPY --from=build /workspace/apps/web/.next/standalone ./
COPY --from=build /workspace/apps/web/.next/static ./apps/web/.next/static
CMD ["node", "apps/web/server.js"]
