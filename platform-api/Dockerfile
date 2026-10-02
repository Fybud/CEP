FROM node:20-bookworm-slim AS base
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run db:generate
RUN npm run build
RUN cp -r src/generated dist/

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/public ./public
COPY package.json ./
EXPOSE 4100
# On boot: server.ts applies pending SQL migrations only (never DROPs tables).
CMD ["node", "dist/server.js"]
