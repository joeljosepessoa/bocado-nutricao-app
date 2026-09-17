#!/usr/bin/env bash
# Restaura um dump gerado por backup.sh. DESTRÓI o conteúdo atual do banco
# de destino (--clean) — confirme o DATABASE_URL antes de rodar.
#
# Uso:
#   DATABASE_URL="postgresql://user:pass@host:5432/db" ./restore.sh caminho/para/o.dump
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Erro: defina DATABASE_URL." >&2
  exit 1
fi

DUMP_FILE="${1:-}"
if [ -z "$DUMP_FILE" ] || [ ! -f "$DUMP_FILE" ]; then
  echo "Erro: informe o caminho de um arquivo de dump existente." >&2
  echo "Uso: DATABASE_URL=... ./restore.sh caminho/para/o.dump" >&2
  exit 1
fi

echo "Restaurando $DUMP_FILE em $DATABASE_URL"
echo "Isso substitui todo o conteúdo atual do banco de destino."
read -r -p "Confirma? (digite 'sim' para continuar) " CONFIRM
if [ "$CONFIRM" != "sim" ]; then
  echo "Cancelado."
  exit 1
fi

pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$DATABASE_URL" "$DUMP_FILE"

echo "Restauração concluída."
