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
COPY apps/worker apps/worker
COPY packages/database packages/database
RUN pnpm --filter @fleet/database build && pnpm --filter @fleet/worker build

FROM node:24-alpine
WORKDIR /workspace
ENV NODE_ENV=production
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=build /workspace/packages/database ./packages/database
COPY --from=build /workspace/apps/worker/dist ./apps/worker/dist
CMD ["node", "apps/worker/dist/main.js"]
