# syntax=docker/dockerfile:1

# Imagem de produção do backend. Constrói a partir da raiz do monorepo
# (npm workspaces) porque o backend depende de caminhos relativos fora de
# backend/ (database/schema.prisma, STORAGE_LOCAL_DIR default ../storage) —
# a mesma estrutura relativa precisa existir dentro do container.

FROM node:20-bookworm-slim AS base
# Bibliotecas exigidas pelo Chromium baixado pelo pacote `puppeteer`
# (scripts/render-pdf.js) — lista oficial de troubleshooting do projeto:
# https://pptr.dev/troubleshooting#chrome-doesnt-launch-on-linux
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 \
      libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 \
      libfontconfig1 libgbm1 libglib2.0-0 libgtk-3-0 libnspr4 \
      libnss3 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 \
      libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 \
      libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 \
      openssl wget xdg-utils \
    && rm -rf /var/lib/apt/lists/*

FROM base AS builder
WORKDIR /app
# Só os manifestos primeiro (cache de camada do `npm ci` sobrevive a
# mudanças de código-fonte que não mexem em dependências).
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY professional-web/package.json professional-web/package.json
COPY mobile/package.json mobile/package.json
COPY professional-mobile/package.json professional-mobile/package.json
COPY shared/package.json shared/package.json
# --workspace backend: resolve o lockfile do monorepo inteiro, mas só
# instala as dependências do backend (+ raiz) — não baixa a árvore de
# dependências de Expo/React Native dos outros workspaces.
RUN npm ci --workspace backend --include-workspace-root

COPY database ./database
COPY backend ./backend
RUN npm run prisma:generate --workspace backend
RUN npm run build --workspace backend
RUN npm prune --omit=dev

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/backend/node_modules ./backend/node_modules
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/scripts ./backend/scripts
COPY --from=builder /app/backend/package.json ./backend/package.json
COPY --from=builder /app/database ./database

WORKDIR /app/backend
EXPOSE 3000
# /health responde 200 só com o banco acessível (AppController.health).
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/health" > /dev/null || exit 1
CMD ["node", "dist/main.js"]
