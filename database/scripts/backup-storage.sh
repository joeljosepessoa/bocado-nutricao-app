#!/usr/bin/env bash
# Backup do storage local (fotos de avaliação, PDFs de relatório e GIFs de exercício).
# Complementa backup.sh (que cobre só o PostgreSQL): banco e storage precisam ser
# copiados JUNTOS, senão há linhas no banco sem arquivo (ou arquivos sem linha).
#
# - Só LÊ o diretório de storage; nunca altera nem apaga nada dele.
# - Escreve num destino SEPARADO (recusa um destino dentro do storage).
# - Ignora temporários de escrita em andamento (.tmp-*, .write-check-*): a API grava
#   de forma atômica (arquivo temporário + rename), então o backup nunca contém um
#   arquivo pela metade.
# - Gera bocado-storage-<UTC>.tar.gz + .sha256, confere a integridade do tar e só
#   então publica o arquivo final (nunca deixa um backup parcial com nome definitivo).
# - Não agenda nada: rode manualmente ou aponte o cron/scheduler do provedor para cá,
#   e depois copie o resultado PARA FORA do servidor.
#
# Uso:
#   STORAGE_LOCAL_DIR=/caminho/do/storage ./backup-storage.sh [diretório-destino]
#   ./backup-storage.sh [diretório-destino] [diretório-do-storage]
# Com Docker Compose o storage vive no volume "bocado-storage" (/data/storage): ver a seção
# de backup em docs/OPERACAO.md para o comando que roda este mesmo tar contra o volume.
set -euo pipefail

DEST_DIR="${1:-./backups}"
STORAGE_DIR="${2:-${STORAGE_LOCAL_DIR:-}}"

if [ -z "$STORAGE_DIR" ]; then
  echo "Erro: informe o diretório do storage (STORAGE_LOCAL_DIR ou 2º argumento)." >&2
  exit 1
fi
if [ ! -d "$STORAGE_DIR" ]; then
  echo "Erro: diretório de storage não encontrado: $STORAGE_DIR" >&2
  exit 1
fi

# Resolve o caminho absoluto SEM criar nada (o destino pode ainda não existir): sobe até o
# ancestral existente, resolve links/".." e reanexa o resto.
resolve_path() {
  local path="$1" rest=""
  while [ ! -d "$path" ]; do
    rest="/$(basename "$path")$rest"
    path="$(dirname "$path")"
  done
  echo "$(cd "$path" && pwd -P)$rest"
}

STORAGE_ABS="$(cd "$STORAGE_DIR" && pwd -P)"
DEST_ABS="$(resolve_path "$DEST_DIR")"

case "$DEST_ABS/" in
  "$STORAGE_ABS"/*)
    echo "Erro: o destino do backup ($DEST_ABS) está dentro do storage ($STORAGE_ABS)." >&2
    echo "O backup precisa ficar fora do volume que ele protege." >&2
    exit 1
    ;;
esac

mkdir -p "$DEST_ABS"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FINAL="$DEST_ABS/bocado-storage-$TIMESTAMP.tar.gz"
PARTIAL="$FINAL.partial"
trap 'rm -f "$PARTIAL"' EXIT

echo "Gerando backup de $STORAGE_ABS em $FINAL ..."
# Código 1 do GNU tar = "arquivo mudou/sumiu durante a leitura" (ex.: um arquivo removido pela API
# no meio do backup): aviso, não falha. Qualquer código >= 2 é erro real.
set +e
tar --exclude='.tmp-*' --exclude='.write-check-*' -C "$STORAGE_ABS" -czf "$PARTIAL" .
TAR_STATUS=$?
set -e
if [ "$TAR_STATUS" -ge 2 ]; then
  echo "Erro: tar falhou (código $TAR_STATUS); backup descartado." >&2
  exit 1
fi
if [ "$TAR_STATUS" -eq 1 ]; then
  echo "Aviso: algum arquivo mudou durante o backup; rode de novo se precisar de um retrato consistente." >&2
fi

# Confere que o arquivo é um tar.gz legível de ponta a ponta antes de publicá-lo.
if ! tar -tzf "$PARTIAL" >/dev/null; then
  echo "Erro: o backup gerado está corrompido; descartado." >&2
  exit 1
fi

mv "$PARTIAL" "$FINAL"
trap - EXIT
(cd "$DEST_ABS" && sha256sum "$(basename "$FINAL")" > "$(basename "$FINAL").sha256")

FILES="$(tar -tzf "$FINAL" | grep -vc '/$' || true)"
echo "Backup concluído: $FINAL ($(du -h "$FINAL" | cut -f1), $FILES arquivo(s))"
echo "Checksum: $FINAL.sha256"
