FROM node:20-bookworm-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

FROM deps AS build
ARG VITE_API_BASE_URL=http://localhost:4100
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
COPY . .
# Vite only loads mode-specific files when the matching mode is selected.
# Use the deployment-specific public settings for this production build.
RUN if [ -f .env.svasthyaa ]; then cp .env.svasthyaa .env.production.local; fi
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
RUN npm install -g serve
EXPOSE 5173
# serve -s: SPA fallback; real files under /embed/webchat.js are still served
CMD ["serve", "-s", "dist", "-l", "5173"]
