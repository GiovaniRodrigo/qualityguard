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
RUN pnpm --filter @qualityguard/api... build

FROM node:26-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache git ca-certificates
RUN addgroup -S qualityguard && adduser -S qualityguard -G qualityguard
COPY --from=build /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/integrations ./integrations
COPY --from=build /app/apps/api ./apps/api
WORKDIR /app/apps/api
RUN chown -R qualityguard:qualityguard /app
USER qualityguard
EXPOSE 8787
CMD ["node", "dist/server.js"]
