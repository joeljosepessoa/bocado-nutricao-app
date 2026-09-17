#!/usr/bin/env bash
# Gera um dump completo do banco via pg_dump, a partir de DATABASE_URL.
# Funcional de verdade, mas não fica agendado em lugar nenhum — não há
# nenhum orquestrador/cron de produção neste projeto ainda (isso é decisão
# de infra do provedor de hosting escolhido, Fase 20). Rode manualmente ou
# aponte um cron/scheduled job do seu provedor para este script.
#
# Uso:
#   DATABASE_URL="postgresql://user:pass@host:5432/db" ./backup.sh [diretório-destino]
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Erro: defina DATABASE_URL." >&2
  exit 1
fi

DEST_DIR="${1:-./backups}"
mkdir -p "$DEST_DIR"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_FILE="$DEST_DIR/bocado-backup-$TIMESTAMP.dump"

echo "Gerando backup em $OUT_FILE ..."
pg_dump --format=custom --no-owner --no-privileges --file="$OUT_FILE" "$DATABASE_URL"

echo "Backup concluído: $OUT_FILE ($(du -h "$OUT_FILE" | cut -f1))"
