# syntax=docker/dockerfile:1
# Web frontend (Next.js). The API lives in backend/Dockerfile.
FROM node:22-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY scripts/copy-vendor.mjs ./scripts/copy-vendor.mjs
RUN npm ci

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* values are inlined at build time.
ARG NEXT_PUBLIC_APP_NAME
ARG NEXT_PUBLIC_TILE_URL
ARG NEXT_PUBLIC_ANALYTICS_SRC
ENV NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME NEXT_PUBLIC_TILE_URL=$NEXT_PUBLIC_TILE_URL NEXT_PUBLIC_ANALYTICS_SRC=$NEXT_PUBLIC_ANALYTICS_SRC
# API_URL is read when the server starts (rewrites are evaluated at build time, so pass the same value here).
ARG API_URL=http://api:8000
ENV API_URL=$API_URL
RUN npm run build

FROM base AS run
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
COPY --from=build /app ./
EXPOSE 3000
CMD ["npm", "start"]
