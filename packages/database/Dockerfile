FROM node:24-alpine
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/database/package.json packages/database/package.json
RUN --mount=type=secret,id=host_ca,required=true \
    NODE_EXTRA_CA_CERTS=/run/secrets/host_ca pnpm install --frozen-lockfile
COPY packages/database packages/database
COPY tests/spec/seed-layers/g1-foundation.json tests/spec/seed-layers/g1-foundation.json
CMD ["sh", "-c", "pnpm --filter @fleet/database prisma:migrate && pnpm --filter @fleet/database seed:g1"]
