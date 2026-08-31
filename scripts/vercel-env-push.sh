#!/usr/bin/env bash
#
# Envia as variáveis do .env.local para a Vercel, em Production e Preview.
#
#   bash scripts/vercel-env-push.sh
#
# Rode você mesmo: o script lê tokens do seu .env.local e os manda para a sua
# conta na Vercel. Os valores vão por stdin, nunca aparecem em argumento de
# linha de comando — argumento fica visível na lista de processos e no
# histórico do shell.
#
# As variáveis são gravadas como NÃO sensíveis, de propósito. Variável marcada
# como Sensitive na Vercel existe só em runtime; se um dia o build precisar de
# alguma, com Sensitive ele quebraria sem explicação óbvia.

set -euo pipefail

ENV_FILE="${1:-.env.local}"
ENVIRONMENTS=(production preview)

# Definidas pela própria plataforma ou pela CLI. Enviá-las sobrescreveria
# valores que a Vercel gerencia sozinha.
SKIP="NODE_ENV VERCEL_OIDC_TOKEN VERCEL VERCEL_ENV VERCEL_URL"

if [ ! -f "$ENV_FILE" ]; then
  echo "Arquivo $ENV_FILE não encontrado." >&2
  exit 1
fi

if [ ! -d .vercel ]; then
  echo "Projeto não vinculado. Rode primeiro: vercel link" >&2
  exit 1
fi

sent=0
skipped=0

while IFS= read -r line || [ -n "$line" ]; do
  # Ignora comentários e linhas em branco.
  case "$line" in
    ''|'#'*) continue ;;
  esac

  key="${line%%=*}"
  value="${line#*=}"

  # Só linhas no formato CHAVE=valor.
  case "$key" in
    *[!A-Za-z0-9_]*|'') continue ;;
  esac

  # Remove aspas e o \r que o Windows deixa no fim da linha.
  value="${value%$'\r'}"
  value="${value%\"}"
  value="${value#\"}"

  if [[ " $SKIP " == *" $key "* ]]; then
    printf '  ignorada  %s (gerenciada pela Vercel)\n' "$key"
    skipped=$((skipped + 1))
    continue
  fi

  # Valor vazio no arquivo: remove o que estiver na Vercel em vez de deixar
  # como está. Uma variável opcional com valor inválido lá quebraria a
  # validação; ausente, o schema aplica o default ou trata como opcional.
  if [ -z "$value" ]; then
    for target in "${ENVIRONMENTS[@]}"; do
      vercel env rm "$key" "$target" --yes >/dev/null 2>&1 || true
    done
    printf '  removida  %s (vazia no arquivo)\n' "$key"
    skipped=$((skipped + 1))
    continue
  fi

  for target in "${ENVIRONMENTS[@]}"; do
    # Remove antes de adicionar: `--force` não sobrescreve variável que já
    # existe marcada como sensível, e é justamente esse o caso aqui.
    vercel env rm "$key" "$target" --yes >/dev/null 2>&1 || true
    printf '%s' "$value" | vercel env add "$key" "$target" --no-sensitive --force --yes >/dev/null 2>&1
  done

  printf '  enviada   %-30s %s\n' "$key" "(${#value} chars)"
  sent=$((sent + 1))
done < "$ENV_FILE"

echo
echo "$sent variável(is) enviada(s), $skipped pulada(s)."
echo "Agora publique com os valores novos:  vercel deploy --prod --yes"
