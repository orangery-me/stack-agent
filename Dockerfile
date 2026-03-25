# Build stage
FROM node:22-alpine AS builder
WORKDIR /app

# Add build tools
RUN apk add --no-cache python3 make g++

RUN corepack enable
RUN corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# Production stage
FROM node:22-alpine AS production
WORKDIR /app

RUN apk add --no-cache dumb-init \
    && addgroup -g 1001 -S nodejs \
    && adduser -S nestjs -u 1001

RUN corepack enable
RUN corepack prepare pnpm@latest --activate

COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/public ./public
COPY --from=builder --chown=nestjs:nodejs /app/src/i18n ./src/i18n
COPY --from=builder --chown=nestjs:nodejs /app/proto ./proto

USER nestjs

EXPOSE 8105
ENV NODE_ENV=production
ENV PORT=8105

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
