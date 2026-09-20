#!/usr/bin/env bash
# Restaura um backup gerado por backup-storage.sh (ou lista o conteúdo dele).
#
# É NÃO destrutivo: nunca apaga arquivos do diretório de destino e, por padrão, não
# sobrescreve arquivos que já existem lá (as chaves são UUID/sha256, então um mesmo
# nome é o mesmo conteúdo). Antes de extrair, confere o checksum (.sha256 ao lado do
# arquivo, se existir), a integridade do tar e recusa entradas com ".." ou caminho absoluto.
#
# Uso:
#   ./restore-storage.sh --list  bocado-storage-<UTC>.tar.gz
#   ./restore-storage.sh         bocado-storage-<UTC>.tar.gz  <diretório-de-destino>
#
# Variáveis:
#   OVERWRITE=1        também substitui arquivos que já existem no destino
#   RESTORE_CONFIRM=sim  dispensa a pergunta (uso em automação); a pergunta só aparece
#                        quando o destino já tem arquivos
#
# Para validar um backup sem risco, restaure num diretório vazio e compare com o original.
# Restaurar EM CIMA do storage de produção só faz sentido depois de parar a API.
set -euo pipefail

usage() {
  echo "Uso: $0 --list <backup.tar.gz>" >&2
  echo "     $0 <backup.tar.gz> <diretório-de-destino>" >&2
  exit 1
}

MODE="restore"
if [ "${1:-}" = "--list" ]; then
  MODE="list"
  shift
fi

ARCHIVE="${1:-}"
[ -n "$ARCHIVE" ] && [ -f "$ARCHIVE" ] || { echo "Erro: informe um arquivo de backup existente." >&2; usage; }

if [ -f "$ARCHIVE.sha256" ]; then
  (cd "$(dirname "$ARCHIVE")" && sha256sum -c "$(basename "$ARCHIVE").sha256" >/dev/null) \
    || { echo "Erro: checksum do backup não confere — arquivo corrompido ou alterado." >&2; exit 1; }
  echo "Checksum OK."
else
  echo "Aviso: $ARCHIVE.sha256 não encontrado; checksum não conferido." >&2
fi

tar -tzf "$ARCHIVE" >/dev/null || { echo "Erro: o arquivo não é um tar.gz íntegro." >&2; exit 1; }

if tar -tzf "$ARCHIVE" | grep -Eq '(^|/)\.\.(/|$)|^/'; then
  echo "Erro: o backup contém caminhos com '..' ou absolutos; recusado." >&2
  exit 1
fi

if [ "$MODE" = "list" ]; then
  tar -tzf "$ARCHIVE" | grep -v '/$' | sed 's|^\./||'
  echo "$(tar -tzf "$ARCHIVE" | grep -vc '/$' || true) arquivo(s)."
  exit 0
fi

TARGET="${2:-}"
[ -n "$TARGET" ] || usage
mkdir -p "$TARGET"

if [ -n "$(ls -A "$TARGET" 2>/dev/null)" ] && [ "${RESTORE_CONFIRM:-}" != "sim" ]; then
  echo "O destino $TARGET já tem arquivos. Nada será apagado;" \
    "$( [ "${OVERWRITE:-}" = "1" ] && echo 'arquivos com o mesmo nome SERÃO substituídos' || echo 'arquivos com o mesmo nome serão mantidos' )."
  read -r -p "Continuar? (digite 'sim') " CONFIRM
  [ "$CONFIRM" = "sim" ] || { echo "Cancelado."; exit 1; }
fi

if [ "${OVERWRITE:-}" = "1" ]; then
  tar --no-same-owner -xzf "$ARCHIVE" -C "$TARGET"
else
  tar --no-same-owner --skip-old-files -xzf "$ARCHIVE" -C "$TARGET"
fi

echo "Restauração concluída em $TARGET ($(find "$TARGET" -type f | wc -l | tr -d ' ') arquivo(s) no destino)."
