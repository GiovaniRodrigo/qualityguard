FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY . .
COPY package.json ./apps/api/package.json
RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @qualityguard/api build
FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/apps/api/dist ./dist
EXPOSE 8787
CMD ["node","dist/server.js"]
