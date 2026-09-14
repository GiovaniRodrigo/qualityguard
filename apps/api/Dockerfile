FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY integrations/github/package.json integrations/github/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/analyzer/package.json packages/analyzer/package.json
RUN pnpm install --no-frozen-lockfile
COPY . .
RUN pnpm --filter @qualityguard/api build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S qualityguard && adduser -S qualityguard -G qualityguard
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/migrations ./migrations
RUN chown -R qualityguard:qualityguard /app
USER qualityguard
EXPOSE 8787
CMD ["node", "dist/server.js"]
