#!/usr/bin/env bash
# Falha (exit 1) se o repositório tiver um arquivo sensível versionado ou uma credencial real
# aparente. Roda igual localmente e no CI (.github/workflows/ci.yml, job "secrets"):
#
#   bash scripts/check-secrets.sh
#
# Só olha arquivos versionados (git ls-files / git grep) e NUNCA imprime o trecho encontrado —
# apenas o arquivo e o tipo de padrão —, para o log do CI não vazar o que ele mesmo detectou.
# É uma rede de segurança contra deslizes (chave colada num arquivo, .env commitado), não um
# substituto para não versionar segredos. Placeholders dos exemplos (host, smtp.exemplo.com,
# localhost, db) são ignorados de propósito.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
status=0

# 1) Arquivos que nunca devem estar no repositório (o modelo .env.example é permitido).
sensitive_files="$(git ls-files | grep -E '(^|/)\.env($|\.)|\.(pem|key|p12|pfx|jks|keystore|dump)$|(^|/)id_(rsa|ed25519)$|google-services\.json$|GoogleService-Info\.plist$' | grep -v -E '(^|/)\.env\.example$' || true)"
if [ -n "$sensitive_files" ]; then
  echo "ERRO: arquivo(s) sensível(is) versionado(s):" >&2
  echo "$sensitive_files" | sed 's/^/  - /' >&2
  status=1
fi

# 2) Padrões de credencial real (nome do padrão => regex PCRE).
check() {
  local label="$1" pattern="$2" files rc
  # git grep: 0 = achou, 1 = não achou, >1 = erro (regex inválida, sem suporte a PCRE...). Um erro
  # do próprio verificador NUNCA pode passar como "sem segredos".
  set +e
  files="$(git grep -I -l -P -e "$pattern" -- . ':!package-lock.json' ':!scripts/check-secrets.sh')"
  rc=$?
  set -e
  if [ "$rc" -gt 1 ]; then
    echo "ERRO INTERNO: git grep falhou (código $rc) no padrão \"$label\"; verificação inconclusiva." >&2
    exit 2
  fi
  if [ -n "$files" ]; then
    echo "ERRO: possível $label em:" >&2
    echo "$files" | sed 's/^/  - /' >&2
    status=1
  fi
}

check "chave privada"                 '-----BEGIN [A-Z ]*PRIVATE KEY-----'
check "AWS access key id"             '\bAKIA[0-9A-Z]{16}\b'
check "token do GitHub"               '\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}'
check "token do Slack"                '\bxox[baprs]-[A-Za-z0-9-]{10,}'
check "chave de API do Google"        '\bAIza[0-9A-Za-z_-]{35}\b'
check "chave secreta Stripe/OpenAI"   '\b(sk_live_[0-9A-Za-z]{16,}|sk-(proj-)?[A-Za-z0-9_-]{32,})'
check "credencial do Mercado Pago"    '\b(APP_USR|TEST)-[0-9a-f]{8,}-[0-9a-f-]{8,}|\bAPP_USR-[0-9]{10,}'
check "JWT completo (3 segmentos)"    '\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'
check "URL de banco com senha (host real)" '\b(postgres(ql)?|mysql|mongodb(\+srv)?|redis|amqps?)://[^:@\s/]+:[^@\s]+@(?!localhost\b|127\.0\.0\.1\b|db[:/]|host[:/]|[a-z0-9.-]*(exemplo|example)\.)[A-Za-z0-9.-]+'
check "URL SMTP com senha (host real)"     '\bsmtps?://[^:@\s/]+:[^@\s]+@(?!host[:/]|localhost\b|127\.0\.0\.1\b|[a-z0-9.-]*(exemplo|example)\.)[A-Za-z0-9.-]+'

if [ "$status" -ne 0 ]; then
  echo "Verificação de secrets FALHOU. Remova o segredo, troque-o (ele deve ser considerado vazado) e, se já estiver no histórico, reescreva-o com o time." >&2
  exit 1
fi
echo "Verificação de secrets OK: nenhum arquivo sensível versionado e nenhum padrão de credencial real."
