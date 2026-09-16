FROM node:26-alpine AS build
WORKDIR /app
# corepack is no longer bundled with recent node images, so install it explicitly
RUN npm install -g corepack@latest && corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/cli/package.json apps/cli/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/analyzer/package.json packages/analyzer/package.json
COPY packages/architecture/package.json packages/architecture/package.json
COPY packages/ai/package.json packages/ai/package.json
COPY integrations/github/package.json integrations/github/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @qualityguard/web... build

FROM node:26-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup -S qualityguard && adduser -S qualityguard -G qualityguard
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
RUN chown -R qualityguard:qualityguard /app
USER qualityguard
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
