FROM node:20-bookworm-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

FROM deps AS build
# Leave VITE_* empty at build — docker-entrypoint writes /env.js from Deploy paste at runtime.
ARG VITE_API_BASE_URL=
ARG VITE_GOOGLE_CLIENT_ID=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
COPY . .
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN npm install -g serve \
  && chmod +x /docker-entrypoint.sh \
  && printf '%s\n' 'window.__ENV__ = window.__ENV__ || {};' > /app/dist/env.js
EXPOSE 5173
ENTRYPOINT ["/docker-entrypoint.sh"]
