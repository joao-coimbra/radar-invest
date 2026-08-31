# Envia as variáveis do .env.local para a Vercel, em Production e Preview.
#
#   .\scripts\vercel-env-push.ps1
#
# Rode você mesmo: o script lê tokens do seu .env.local e os manda para a sua
# conta na Vercel.
#
# Os valores vão por stdin, nunca em argumento de linha de comando —
# argumento fica visível na lista de processos e no histórico do shell. O
# caminho é um arquivo temporário lido por `cmd /c ... < arquivo`, e não o
# operador de pipe do PowerShell, porque o pipe acrescenta uma quebra de linha
# ao valor e um token com \n no fim seria rejeitado pela origem.
#
# Grava como NÃO sensível de propósito. Variável marcada como Sensitive na
# Vercel existe apenas em runtime, e foi isso que quebrou o primeiro build:
# ele não enxergava nenhuma delas.

$ErrorActionPreference = 'Stop'

$envFile = if ($args.Count -gt 0) { $args[0] } else { '.env.local' }
$targets = @('production', 'preview')

# Definidas pela própria plataforma ou pela CLI. Enviá-las sobrescreveria
# valores que a Vercel gerencia sozinha.
$skip = @('NODE_ENV', 'VERCEL_OIDC_TOKEN', 'VERCEL', 'VERCEL_ENV', 'VERCEL_URL')

if (-not (Test-Path $envFile)) {
  Write-Error "Arquivo $envFile nao encontrado."
  exit 1
}

if (-not (Test-Path '.vercel')) {
  Write-Error "Projeto nao vinculado. Rode primeiro: vercel link"
  exit 1
}

$sent = 0
$skipped = 0
$stdinFile = Join-Path $env:TEMP "radar-env-$PID.tmp"

foreach ($line in Get-Content $envFile) {
  if ($line -match '^\s*#' -or $line -match '^\s*$') { continue }

  $index = $line.IndexOf('=')
  if ($index -lt 1) { continue }

  $key = $line.Substring(0, $index).Trim()
  if ($key -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') { continue }

  $value = $line.Substring($index + 1).Trim().Trim('"')

  if ($skip -contains $key) {
    Write-Host ("  ignorada  {0} (gerenciada pela Vercel)" -f $key)
    $skipped++
    continue
  }

  # Valor vazio: remove o que estiver na Vercel em vez de deixar como está.
  # Opcional ausente deixa o schema aplicar o default; opcional com valor
  # inválido quebraria a validação no boot.
  if ([string]::IsNullOrEmpty($value)) {
    foreach ($target in $targets) {
      cmd /c "vercel.cmd env rm $key $target --yes" 2>&1 | Out-Null
    }
    Write-Host ("  removida  {0} (vazia no arquivo)" -f $key)
    $skipped++
    continue
  }

  # WriteAllText nao acrescenta quebra de linha no fim.
  [System.IO.File]::WriteAllText($stdinFile, $value)

  foreach ($target in $targets) {
    # Remove antes de adicionar: `--force` nao sobrescreve variavel ja gravada
    # como sensivel, que e exatamente o caso aqui.
    cmd /c "vercel.cmd env rm $key $target --yes" 2>&1 | Out-Null
    cmd /c "vercel.cmd env add $key $target --no-sensitive --force --yes < `"$stdinFile`"" 2>&1 | Out-Null
  }

  Write-Host ("  enviada   {0,-30} ({1} chars)" -f $key, $value.Length)
  $sent++
}

if (Test-Path $stdinFile) { Remove-Item $stdinFile -Force }

Write-Host ""
Write-Host "$sent variavel(is) enviada(s), $skipped pulada(s)."
Write-Host "Agora publique com os valores novos:  vercel deploy --prod --yes"
