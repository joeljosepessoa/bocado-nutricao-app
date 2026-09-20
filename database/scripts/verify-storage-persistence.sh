#!/usr/bin/env bash
# Teste operacional de persistência do storage em Docker Compose: prova que fotos e PDFs
# sobrevivem a "docker compose restart" e à RECRIAÇÃO do container da API (o volume nomeado
# "bocado-storage" é o que guarda os arquivos).
#
#   1. sobe a stack (db + migrate + api) e espera /health;
#   2. cria um profissional descartável, envia uma foto, gera um PDF e guarda os hashes;
#   3. docker compose restart api      -> relê foto e PDF e confere os hashes;
#   4. docker compose up --force-recreate api  (container NOVO, mesmo volume) -> confere de novo.
#
# ATENÇÃO — deixa resíduo no banco: 1 profissional + 1 cliente + 1 avaliação de teste
# (e-mail @example.com). Rode em stack de homologação/limpa, não em produção com dados reais.
# Nunca executa "down -v" nem remove volumes.
#
# Requisitos: Docker + Docker Compose v2, Node >= 18 no host (para storage-smoke.js) e um
# .env na raiz com POSTGRES_PASSWORD, JWT_ACCESS_SECRET e CORS_ORIGIN (ver .env.example).
#
# Uso:  SMOKE_CONFIRM=sim ./database/scripts/verify-storage-persistence.sh
#       (SKIP_BUILD=1 reaproveita a imagem já construída; API_URL muda a URL, padrão http://127.0.0.1:3000)
#
# STATUS: escrito e revisado, mas NUNCA executado — a máquina de desenvolvimento não tem Docker.
# A primeira execução real é a validação de persistência em container.
set -euo pipefail

cd "$(dirname "$0")/../.."

if [ "${SMOKE_CONFIRM:-}" != "sim" ]; then
  echo "Este teste cria dados descartáveis (profissional/cliente/avaliação/foto/PDF) no banco da stack." >&2
  echo "Confirme com: SMOKE_CONFIRM=sim $0" >&2
  exit 1
fi
command -v docker >/dev/null 2>&1 || { echo "Docker não disponível para validação real." >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Docker Compose v2 não disponível para validação real." >&2; exit 1; }

export API_URL="${API_URL:-http://127.0.0.1:3000}"
STATE="$(mktemp)"
trap 'rm -f "$STATE"' EXIT

wait_healthy() {
  for _ in $(seq 1 90); do
    if node -e "fetch(process.env.API_URL+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"; then
      return 0
    fi
    sleep 2
  done
  echo "A API não ficou saudável em 180 s. Últimos logs:" >&2
  docker compose logs --tail=40 api >&2
  exit 1
}

echo "== 1/4 subindo a stack"
if [ "${SKIP_BUILD:-}" = "1" ]; then docker compose up -d; else docker compose up -d --build; fi
wait_healthy

echo "== 2/4 gravando foto e PDF"
node backend/scripts/storage-smoke.js write "$STATE"
docker compose exec -T api ls -A /data/storage

echo "== 3/4 docker compose restart api"
docker compose restart api
wait_healthy
node backend/scripts/storage-smoke.js verify "$STATE"

echo "== 4/4 recriando o container da API (novo container, mesmo volume)"
OLD_ID="$(docker compose ps -q api)"
docker compose up -d --force-recreate --no-deps api
NEW_ID="$(docker compose ps -q api)"
[ "$OLD_ID" != "$NEW_ID" ] || { echo "O container não foi recriado (mesmo id)." >&2; exit 1; }
wait_healthy
node backend/scripts/storage-smoke.js verify "$STATE"

echo "PERSISTÊNCIA OK: os arquivos sobreviveram a restart e à recriação do container."
