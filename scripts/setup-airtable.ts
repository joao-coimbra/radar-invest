/**
 * Cria as cinco tabelas do RadarInvest na sua base do Airtable.
 *
 * Roda com o seu `.env.local`; o token nunca sai da sua máquina:
 *
 *   bun --env-file=.env.local scripts/setup-airtable.ts
 *
 * O Personal Access Token precisa do escopo `schema.bases:write` além dos de
 * dados. É idempotente: tabela que já existe é pulada, e campo que falta numa
 * tabela existente é criado.
 */
export {}

const TOKEN = process.env.AIRTABLE_TOKEN
const BASE_ID = process.env.AIRTABLE_BASE_ID
const META_URL = "https://api.airtable.com/v0/meta/bases"

if (!TOKEN) {
  console.error("AIRTABLE_TOKEN ausente. Preencha o .env.local.")
  process.exit(1)
}

if (!BASE_ID?.startsWith("app")) {
  console.error(
    "AIRTABLE_BASE_ID ausente ou inválido. É o trecho que começa com 'app' na URL da base."
  )
  process.exit(1)
}

// Datas em UTC e formato ISO: o servidor grava `toISOString()` e precisa ler
// de volta o mesmo instante, independente do fuso de quem abrir o painel.
const dateTime = {
  type: "dateTime",
  options: {
    dateFormat: { name: "iso" },
    timeFormat: { name: "24hour" },
    timeZone: "utc",
  },
}

const number = { type: "number", options: { precision: 2 } }
const checkbox = { type: "checkbox", options: { icon: "check", color: "greenBright" } }
const text = { type: "singleLineText" }
const email = { type: "email" }

const select = (...choices: string[]) => ({
  type: "singleSelect",
  options: { choices: choices.map((name) => ({ name })) },
})

interface FieldSpec {
  name: string
  type: string
  options?: unknown
  description?: string
}

interface TableSpec {
  name: string
  description: string
  fields: FieldSpec[]
}

/**
 * O primeiro campo vira o campo primário da tabela no Airtable e não pode ser
 * checkbox nem data — por isso todas começam por um texto identificador.
 */
const TABLES: TableSpec[] = [
  {
    name: process.env.AIRTABLE_TABLE_USERS ?? "Users",
    description: "Contas de acesso. A senha existe só como hash.",
    fields: [
      { name: "name", ...text },
      { name: "email", ...email },
      {
        name: "passwordHash",
        type: "multilineText",
        description: "scrypt. Nunca é devolvido em resposta de leitura.",
      },
      { name: "role", ...select("ASSESSOR", "ADMIN") },
      { name: "consentAccepted", ...checkbox },
      { name: "consentTermsVersion", ...text },
      { name: "consentRecordedAt", ...dateTime },
      { name: "createdAt", ...dateTime },
    ],
  },
  {
    name: process.env.AIRTABLE_TABLE_SESSIONS ?? "Sessions",
    description:
      "Refresh tokens por família, para rotação com detecção de reuso. " +
      "Sem IP e sem user-agent: dado que não é usado não é coletado.",
    fields: [
      {
        name: "tokenHash",
        ...text,
        description: "SHA-256 do token opaco. O token em claro nunca é gravado.",
      },
      { name: "userId", ...text },
      {
        name: "familyId",
        ...text,
        description: "Cadeia aberta por um login. Revogada inteira se houver reuso.",
      },
      { name: "usedAt", ...dateTime },
      { name: "revokedAt", ...dateTime },
      { name: "expiresAt", ...dateTime },
      { name: "createdAt", ...dateTime },
    ],
  },
  {
    name: process.env.AIRTABLE_TABLE_ASSETS ?? "Assets",
    description: "Ativos monitorados e o limite de variação que dispara alerta.",
    fields: [
      { name: "ticker", ...text },
      { name: "type", ...select("STOCK", "FII", "INDEX") },
      { name: "alertThresholdPercent", ...number },
      {
        name: "ownerId",
        ...text,
        description: "Dono do registro. É contra este campo que a posse é checada.",
      },
      { name: "ownerEmail", ...email },
      { name: "status", ...select("MONITORING", "PAUSED") },
      {
        name: "alertState",
        ...select("NORMAL", "BREACHED"),
        description: "Estado atual. O alerta dispara na transição, não no estado.",
      },
      { name: "consentAccepted", ...checkbox },
      { name: "consentTermsVersion", ...text },
      { name: "consentRecordedAt", ...dateTime },
      { name: "createdAt", ...dateTime },
      { name: "updatedAt", ...dateTime },
    ],
  },
  {
    name: process.env.AIRTABLE_TABLE_QUOTES ?? "Quotes",
    description: "Histórico de cotações. Só grava quando a variação é relevante.",
    fields: [
      { name: "ticker", ...text },
      { name: "currentPrice", ...number },
      { name: "changePercent", ...number },
      { name: "currency", ...text },
      { name: "source", ...text },
      { name: "collectedAt", ...dateTime },
    ],
  },
  {
    name: process.env.AIRTABLE_TABLE_ALERTS ?? "Alerts",
    description: "Alertas gerados quando o limite configurado foi rompido.",
    fields: [
      { name: "ticker", ...text },
      { name: "ownerId", ...text },
      { name: "direction", ...select("UP", "DOWN") },
      { name: "changePercent", ...number },
      { name: "configuredThreshold", ...number },
      { name: "notified", ...checkbox },
      { name: "createdAt", ...dateTime },
    ],
  },
]

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  "Content-Type": "application/json",
}

async function call(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers })
  const body = await response.text()

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} em ${url}\n${body}`)
  }

  return JSON.parse(body)
}

async function main() {
  console.log(`Base: ${BASE_ID}\n`)

  const existing = (await call(`${META_URL}/${BASE_ID}/tables`)) as {
    tables: { id: string; name: string; fields: { name: string }[] }[]
  }

  const byName = new Map(existing.tables.map((table) => [table.name, table]))

  for (const spec of TABLES) {
    const found = byName.get(spec.name)

    if (!found) {
      await call(`${META_URL}/${BASE_ID}/tables`, {
        method: "POST",
        body: JSON.stringify(spec),
      })
      console.log(`  criada   ${spec.name} (${spec.fields.length} campos)`)
      continue
    }

    const present = new Set(found.fields.map((field) => field.name))
    const missing = spec.fields.filter((field) => !present.has(field.name))

    if (missing.length === 0) {
      console.log(`  ok       ${spec.name}`)
      continue
    }

    for (const field of missing) {
      await call(`${META_URL}/${BASE_ID}/tables/${found.id}/fields`, {
        method: "POST",
        body: JSON.stringify(field),
      })
    }

    console.log(
      `  ajustada ${spec.name} (+${missing.length}: ${missing.map((f) => f.name).join(", ")})`
    )
  }

  console.log("\nPronto. As cinco tabelas estão de acordo com o contrato.")
}

main().catch((error: unknown) => {
  console.error(`\nFalhou: ${error instanceof Error ? error.message : error}`)
  console.error(
    "\nSe for 403, o token não tem o escopo schema.bases:write.\n" +
      "Se for 404, o AIRTABLE_BASE_ID está errado ou o token não dá acesso a essa base."
  )
  process.exit(1)
})
