# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
# --omit=optional: typeorm's optional peer ts-node (and typescript) is marked devOptional and survives --omit=dev.
RUN npm run build && npm prune --omit=dev --omit=optional

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
# Files stay root-owned so the unprivileged runtime user cannot modify the application.
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY config ./config
COPY --chmod=755 docker/entrypoint.sh ./docker/entrypoint.sh
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT:-3000}/api/v1/health" || exit 1
ENTRYPOINT ["./docker/entrypoint.sh"]
