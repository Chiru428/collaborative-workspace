# ---- build: compile TypeScript ----
FROM node:22-alpine AS build
WORKDIR /app
# Dev-only test tooling tries to download a MongoDB binary on install; not needed (or supported on Alpine) here.
ENV MONGOMS_DISABLE_POSTINSTALL=1
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runtime: production dependencies + compiled output only ----
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# Uploaded images are written here (mount a volume to keep them across restarts).
RUN mkdir -p /app/uploads && chown -R node:node /app
USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-5000}/api/health" || exit 1
CMD ["node", "dist/server.js"]
