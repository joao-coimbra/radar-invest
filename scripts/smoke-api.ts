/**
 * Verificação de fumaça da superfície HTTP.
 *
 *   bun --env-file=.env.local scripts/smoke-api.ts
 *   bun --env-file=.env.local scripts/smoke-api.ts https://radar-invest.joaocoimbra.dev
 *
 * Existe por causa de um bug real: o plugin de bearer token estourava
 * `TypeError` nas rotas sem schema de query, e **seis das oito** rotas
 * protegidas passaram a devolver 500 no lugar de 401 — só em produção, porque
 * o modo compilado do Elysia é que dispara o problema.
 *
 * A verificação da época testou duas rotas e uma delas com header válido, o
 * que tomava o caminho de saída antecipada. Passou. Este script cobre todas as
 * rotas, sem header e com header inválido, para que a próxima regressão dessa
 * família apareça antes do deploy.
 *
 * Contra produção, roda com o build de produção local:
 *   bun run build && bun run start
 */
export {}

const BASE = process.argv[2] ?? "http://localhost:3000"
const API = `${BASE}/api/v1`

interface Check {
  label: string
  method: string
  path: string
  headers?: Record<string, string>
  expect: number
}

const CRON = process.env.CRON_SECRET ?? ""

/** Toda rota protegida, sem credencial e com credencial inválida. */
const PROTECTED = [
  ["GET", "/assets"],
  ["GET", "/assets/PETR4"],
  ["GET", "/indicators"],
  ["GET", "/market-overview"],
  ["GET", "/alerts"],
  ["POST", "/sync-runs"],
  ["GET", "/users/recInexistente/export"],
  ["DELETE", "/users/recInexistente"],
] as const

const checks: Check[] = [
  { label: "sonda de liveness", method: "HEAD", path: "", expect: 200 },

  ...PROTECTED.map<Check>(([method, path]) => ({
    label: `sem credencial ${method} ${path}`,
    method,
    path,
    expect: 401,
  })),

  ...PROTECTED.map<Check>(([method, path]) => ({
    label: `token inválido ${method} ${path}`,
    method,
    path,
    headers: { Authorization: "Bearer nao-e-um-token" },
    expect: 401,
  })),

  // O plugin removido aceitava o token por query string, o que colocaria
  // credencial em log de acesso e histórico. Deve continuar fechado.
  {
    label: "token por query string continua recusado",
    method: "GET",
    path: "/indicators?access_token=qualquer-coisa",
    expect: 401,
  },

  {
    label: "agendador com segredo errado",
    method: "POST",
    path: "/sync-runs",
    headers: { "x-cron-secret": "errado" },
    expect: 401,
  },
  {
    label: "agendador com segredo correto",
    method: "POST",
    path: "/sync-runs",
    headers: { "x-cron-secret": CRON },
    expect: 202,
  },

  { label: "corpo inválido no cadastro", method: "POST", path: "/auth/register", expect: 400 },
  { label: "credenciais inexistentes", method: "POST", path: "/auth/login", expect: 400 },
  { label: "refresh sem cookie", method: "POST", path: "/auth/refresh", expect: 401 },
  { label: "rota inexistente", method: "GET", path: "/nao-existe", expect: 404 },
]

console.log(`\nAlvo: ${BASE}\n`)

let failed = 0

for (const check of checks) {
  const url = check.path === "" ? `${BASE}/api/health` : `${API}${check.path}`

  let status: number | string

  try {
    const response = await fetch(url, {
      method: check.method,
      headers: check.headers,
      signal: AbortSignal.timeout(60_000),
    })
    status = response.status
  } catch (error) {
    status = error instanceof Error ? error.name : "erro"
  }

  const ok = status === check.expect

  if (!ok) {
    failed++
  }

  console.log(
    `  ${ok ? "ok  " : "FALHA"} ${String(status).padEnd(5)} esperado ${String(check.expect).padEnd(4)} ${check.label}`
  )
}

// A documentação viva é entregável: se ela cair, o contrato deixa de ser
// verificável por quem consome a API.
const spec = await fetch(`${BASE}/api/docs/json`).then((r) => r.json())
const paths = Object.keys(spec.paths ?? {}).length
const expectedPaths = 12

if (paths !== expectedPaths) {
  failed++
  console.log(`  FALHA ${paths} caminhos na spec, esperado ${expectedPaths}`)
} else {
  console.log(`  ok    ${paths} caminhos publicados em /api/docs`)
}

console.log(
  failed === 0
    ? "\nTudo certo.\n"
    : `\n${failed} verificação(ões) falharam.\n`
)

process.exit(failed === 0 ? 0 : 1)
