# hub-web: the Next.js standalone server. Built from the repo root by .github/workflows/deploy.yml.
FROM node:22-alpine AS build
WORKDIR /repo
RUN npm install -g pnpm@10.28.0
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @hub/web build

FROM node:22-alpine
WORKDIR /app
# HOSTNAME=0.0.0.0 so Next listens on every interface, not just the container hostname.
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
