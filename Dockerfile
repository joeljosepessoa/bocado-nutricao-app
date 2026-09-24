# syntax=docker/dockerfile:1

# Imagem de produção do backend. Constrói a partir da raiz do monorepo
# (npm workspaces) porque o backend depende de caminhos relativos fora de
# backend/ (database/schema.prisma, STORAGE_LOCAL_DIR default ../storage) —
# a mesma estrutura relativa precisa existir dentro do container.

FROM node:22-bookworm-slim AS base
# Bibliotecas exigidas pelo Chromium baixado pelo pacote `puppeteer`
# (scripts/render-pdf.js) — lista oficial de troubleshooting do projeto:
# https://pptr.dev/troubleshooting#chrome-doesnt-launch-on-linux
# `unzip` é categoria diferente das demais: não é lib de runtime do
# Chromium, é a ferramenta que `npx puppeteer browsers install chrome`
# usa pra EXTRAIR o .zip baixado (ver estágio builder, abaixo) — sem ela,
# node:22-bookworm-slim não tem nenhum extrator de zip instalado por
# padrão, e o download "funciona" mas a instalação falha com "no zip
# archiver is available". Preferido a adicionar a dependência opcional
# `yauzl` do puppeteer: resolver via SO mantém a mesma superfície de
# dependências do Node (package.json/lockfile) intocada.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 \
      libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 \
      libfontconfig1 libgbm1 libglib2.0-0 libgtk-3-0 libnspr4 \
      libnss3 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 \
      libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 \
      libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 \
      openssl unzip wget xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Caminho fixo e explícito do cache de browsers do Puppeteer — lido
# nativamente por node_modules/puppeteer/lib/puppeteer/getConfiguration.js,
# tanto para ONDE baixar o Chrome (durante `npm ci` no estágio builder,
# via postinstall do pacote `puppeteer`) quanto para ONDE procurá-lo em
# runtime (`puppeteer.launch()` sem `executablePath`, no render-pdf.js).
# Sem isso o padrão é $HOME/.cache/puppeteer — /root/.cache/puppeteer só
# por coincidência dos dois estágios rodarem como root; fixar aqui (na
# imagem base, herdado pelos dois estágios) remove essa implicitude e é o
# que faz o `COPY --from=builder` abaixo ser determinístico.
ENV PUPPETEER_CACHE_DIR=/opt/puppeteer-cache

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
# `npm ci` já dispara o postinstall do pacote `puppeteer`, que tenta baixar
# o Chrome sozinho — só que esse postinstall (node_modules/puppeteer/install.mjs)
# envolve o download inteiro num try/catch que só faz `console.warn` e
# SEGUE EM FRENTE se a rede falhar, sem nunca derrubar o `npm ci`. Pior:
# quando a rede cai NO MEIO do download, ele deixa a pasta da versão
# criada mas sem o executável dentro — um estado "parcialmente instalado"
# que o instalador oficial se RECUSA a corrigir sozinho (erro real visto
# em produção: "An earlier install of this build probably did not
# finish"). Por isso limpamos o cache inteiro (nunca uma versão
# específica) antes de instalar de novo, do zero, sempre — garante que
# `browsers install` sempre parte de um estado limpo, nunca de um resto
# de tentativa anterior.
RUN rm -rf "$PUPPETEER_CACHE_DIR"
# Mesmo mecanismo oficial do Puppeteer (`puppeteer browsers install`, que
# resolve a MESMA versão pinada do postinstall — ver
# node_modules/puppeteer/lib/puppeteer/node/cli.js, nunca "latest" e nunca
# hardcoded aqui) — mas como um passo isolado que FALHA O BUILD de
# verdade se o Chrome não instalar, em vez do postinstall silencioso.
RUN npx puppeteer browsers install chrome
# Verificação real do binário — não apenas que a pasta existe (foi
# exatamente isso que passou batido da vez passada). Pede pro próprio
# pacote `puppeteer` resolver o caminho do executável (mesma função que
# `puppeteer.launch()` usa por baixo em runtime, nunca um caminho
# hardcoded aqui) e EXECUTA `chrome --version` de verdade, com timeout —
# um binário ausente, incompleto ou sem lib do sistema faz isso falhar e
# derruba o build aqui, não em produção na hora de gerar um relatório.
RUN node -e "(async () => { const puppeteer = require('puppeteer'); const { execFileSync } = require('child_process'); const execPath = await puppeteer.executablePath(); console.log('Chrome executable path:', execPath); const output = execFileSync(execPath, ['--version'], { timeout: 30000 }).toString().trim(); console.log('Chrome --version output:', output); })().catch((err) => { console.error('Chrome verification failed:', err); process.exit(1); });"

COPY . .
RUN npm run prisma:generate --workspace backend
RUN npm run build --workspace backend
RUN npm prune --omit=dev

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/scripts ./backend/scripts
COPY --from=builder /app/backend/package.json ./backend/package.json
COPY --from=builder /app/database ./database
# O Chrome baixado no builder (ver ENV PUPPETEER_CACHE_DIR acima) precisa
# ser copiado explicitamente — nada nos passos anteriores traz o cache de
# browsers do Puppeteer pro estágio final, então sem esta linha o
# `puppeteer.launch()` falha com "Could not find Chrome".
COPY --from=builder /opt/puppeteer-cache /opt/puppeteer-cache

WORKDIR /app/backend
EXPOSE 3000
# /health responde 200 só com o banco acessível (AppController.health).
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/health" > /dev/null || exit 1
CMD ["node", "dist/main.js"]
