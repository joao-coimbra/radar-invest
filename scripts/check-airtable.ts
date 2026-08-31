/**
 * Diagnóstico somente-leitura da configuração do Airtable.
 *
 *   bun run check:airtable
 *
 * Roda antes do `setup:airtable` para separar os três erros que se parecem:
 * token errado, escopo faltando e base ID errado. Não escreve nada.
 */
export {}

const TOKEN = process.env.AIRTABLE_TOKEN
const BASE_ID = process.env.AIRTABLE_BASE_ID

const ok = (m: string) => console.log(`  ✓ ${m}`)
const fail = (m: string) => console.log(`  ✗ ${m}`)

function abort(message: string, hint: string): never {
  fail(message)
  console.log(`\n    ${hint}\n`)
  process.exit(1)
}

if (!TOKEN) {
  abort(
    "AIRTABLE_TOKEN não está no .env.local",
    "Crie o token em https://airtable.com/create/tokens"
  )
}

if (!BASE_ID) {
  abort(
    "AIRTABLE_BASE_ID não está no .env.local",
    "É o trecho que começa com 'app' na URL da sua base."
  )
}

if (!BASE_ID.startsWith("app")) {
  abort(
    `AIRTABLE_BASE_ID = "${BASE_ID}" não parece um ID de base`,
    "Deve começar com 'app'. Você pode ter copiado o ID da tabela (tbl...) ou da view (viw...)."
  )
}

console.log(`\nToken: ${TOKEN.slice(0, 7)}…${TOKEN.slice(-4)}`)
console.log(`Base:  ${BASE_ID}\n`)

const headers = { Authorization: `Bearer ${TOKEN}` }

// 1. O token é válido?
const whoami = await fetch("https://api.airtable.com/v0/meta/whoami", { headers })

if (whoami.status === 401) {
  abort(
    "O token foi rejeitado (401)",
    "Ele foi revogado ou copiado incompleto. Gere outro em https://airtable.com/create/tokens"
  )
}

if (!whoami.ok) {
  abort(`whoami respondeu ${whoami.status}`, await whoami.text())
}

const me = (await whoami.json()) as { id: string; scopes?: string[] }
ok(`token válido (usuário ${me.id})`)

// 2. Tem os escopos necessários?
const REQUIRED = [
  "data.records:read",
  "data.records:write",
  "schema.bases:read",
  "schema.bases:write",
]

if (me.scopes) {
  const missing = REQUIRED.filter((scope) => !me.scopes?.includes(scope))

  if (missing.length > 0) {
    abort(
      `faltam escopos: ${missing.join(", ")}`,
      "O Airtable não deixa editar escopos de um token existente. Crie um novo com os quatro."
    )
  }

  ok(`escopos completos (${REQUIRED.length}/${REQUIRED.length})`)
}

// 3. O token alcança esta base?
const schema = await fetch(
  `https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables`,
  { headers }
)

if (schema.status === 403) {
  abort(
    "o token não tem acesso a esta base (403)",
    "Em https://airtable.com/create/tokens, edite o token e adicione a base em 'Access'."
  )
}

if (schema.status === 404) {
  abort(
    "base não encontrada (404)",
    "O AIRTABLE_BASE_ID está errado. Abra a base e copie o trecho 'app…' da URL."
  )
}

if (!schema.ok) {
  abort(`leitura do schema respondeu ${schema.status}`, await schema.text())
}

const { tables } = (await schema.json()) as {
  tables: { name: string; fields: { name: string }[] }[]
}

ok(`base acessível (${tables.length} tabela(s))`)

for (const table of tables) {
  console.log(`      · ${table.name} — ${table.fields.length} campos`)
}

const EXPECTED = ["Users", "Sessions", "Assets", "Quotes", "Alerts"]
const present = new Set(tables.map((table) => table.name))
const missing = EXPECTED.filter((name) => !present.has(name))

console.log("")

if (missing.length === 0) {
  console.log("Tudo pronto. As cinco tabelas existem.\n")
} else {
  console.log(`Faltam: ${missing.join(", ")}`)
  console.log("Rode:  bun run setup:airtable\n")
}
