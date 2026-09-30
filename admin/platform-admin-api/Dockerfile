FROM node:20-alpine
# openssl: Prisma; python3/make/g++: bcrypt native build when GitHub prebuilds fail (504 / musl)
RUN apk add --no-cache openssl python3 make g++

WORKDIR /app

# Client API setup (for generated Prisma client)
WORKDIR /app/client/platform-api
COPY client/platform-api/package*.json ./
RUN npm install --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000
COPY client/platform-api/prisma ./prisma
RUN npx prisma generate
COPY client/platform-api/ ./

# Admin API setup
WORKDIR /app/admin/platform-admin-api
COPY admin/platform-admin-api/package*.json ./
RUN npm install --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000
COPY admin/platform-admin-api/prisma ./prisma
RUN npx prisma generate
COPY admin/platform-admin-api/ ./

EXPOSE 4200
CMD ["sh", "-c", "npm run db:deploy && npx tsx src/server.ts"]
