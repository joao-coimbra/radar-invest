import { t } from "elysia"

/**
 * Schemas TypeBox das rotas.
 *
 * São a tradução executável de `docs/openapi.yaml`: o contrato descreve o
 * combinado, estes schemas fazem cumprir em runtime e alimentam a
 * documentação viva em `/api/docs`. Divergir daqui é divergir do contrato.
 */

/** Envelope de sucesso: `{ success, message, data }`. */
export const envelope = <T extends ReturnType<typeof t.Object> | ReturnType<typeof t.Array> | ReturnType<typeof t.Null>>(
  data: T
) =>
  t.Object({
    success: t.Literal(true),
    message: t.String(),
    data,
  })

/** Envelope de erro: `{ success, code, message }`. */
export const errorResponse = t.Object({
  success: t.Literal(false),
  code: t.String({ description: "Código estável, legível por máquina" }),
  message: t.String(),
  details: t.Optional(
    t.Array(t.Object({ field: t.String(), message: t.String() }))
  ),
})

/** Erros que praticamente toda rota protegida pode devolver. */
export const protectedErrors = {
  401: errorResponse,
  403: errorResponse,
  429: errorResponse,
  500: errorResponse,
}

const TICKER_PATTERN = "^[A-Z]{4}\\d{1,2}$"

export const tickerSchema = t.String({
  pattern: TICKER_PATTERN,
  description: "Código de negociação do ativo na B3",
  examples: ["PETR4"],
})

export const roleSchema = t.Union([t.Literal("ASSESSOR"), t.Literal("ADMIN")], {
  description: "Função geral do usuário no sistema",
})

export const assetTypeSchema = t.Union([
  t.Literal("STOCK"),
  t.Literal("FII"),
  t.Literal("INDEX"),
])

export const monitoringStatusSchema = t.Union([
  t.Literal("MONITORING"),
  t.Literal("PAUSED"),
])

export const attentionLevelSchema = t.Union([
  t.Literal("NORMAL"),
  t.Literal("WATCH"),
  t.Literal("CRITICAL"),
])

/** Registro de consentimento — Art. 8º da LGPD. */
export const consentSchema = t.Object({
  accepted: t.Boolean({ examples: [true] }),
  termsVersion: t.String({ examples: ["2026-01"] }),
})

export const userSchema = t.Object({
  id: t.String(),
  name: t.String({ examples: ["Ana Ribeiro"] }),
  email: t.String({ format: "email" }),
  role: roleSchema,
  createdAt: t.String(),
})

export const sessionSchema = t.Object({
  accessToken: t.String({
    description: "JWT enviado no header Authorization, no formato Bearer {token}",
  }),
  tokenType: t.Literal("Bearer"),
  expiresIn: t.Integer({ description: "Validade em segundos", examples: [900] }),
  scopes: t.Array(t.String(), {
    description: "Escopos derivados do papel, resolvidos na autenticação",
  }),
  user: userSchema,
})

export const quoteSchema = t.Object({
  ticker: t.String(),
  companyName: t.Union([t.String(), t.Null()]),
  currentPrice: t.Number(),
  changePercent: t.Number(),
  currency: t.String(),
  source: t.String(),
  collectedAt: t.String(),
  fromCache: t.Boolean({
    description: "Indica que o dado veio do cache, sem nova chamada externa",
  }),
})

export const indicatorSchema = t.Object({
  name: t.Union([t.Literal("SELIC"), t.Literal("CDI"), t.Literal("IPCA")]),
  value: t.Number(),
  unit: t.String({ examples: ["% a.a."] }),
  source: t.String({ examples: ["BrasilAPI"] }),
  referenceDate: t.Optional(t.String()),
})

export const assetSchema = t.Object({
  ticker: t.String(),
  type: assetTypeSchema,
  alertThresholdPercent: t.Number(),
  ownerId: t.String(),
  ownerEmail: t.String({
    description: "Parcialmente mascarado, por minimização",
    examples: ["a******@escritorio.com.br"],
  }),
  status: monitoringStatusSchema,
  createdAt: t.String(),
  updatedAt: t.Union([t.String(), t.Null()]),
})

export const overviewItemSchema = t.Object({
  rank: t.Integer({ minimum: 1 }),
  ticker: t.String(),
  quote: quoteSchema,
  alertThresholdPercent: t.Number(),
  thresholdBreached: t.Boolean(),
  attentionLevel: attentionLevelSchema,
  returnVsCdi: t.Union([t.Number(), t.Null()], {
    description: "Variação do ativo comparada ao CDI do período",
  }),
})

export const marketOverviewSchema = t.Object({
  generatedAt: t.String(),
  indicators: t.Array(indicatorSchema),
  items: t.Array(overviewItemSchema, {
    description: "Ordenado por prioridade de atenção, do mais crítico ao normal",
  }),
  summary: t.Object({
    totalMonitored: t.Integer(),
    totalCritical: t.Integer(),
    externalCalls: t.Integer({
      description: "Chamadas efetivamente feitas às APIs externas neste ciclo",
    }),
    callsAvoidedByCache: t.Integer(),
  }),
})

export const alertSchema = t.Object({
  id: t.String(),
  ticker: t.String(),
  direction: t.Union([t.Literal("UP"), t.Literal("DOWN")]),
  changePercent: t.Number(),
  configuredThreshold: t.Number(),
  notified: t.Boolean(),
  createdAt: t.String(),
})

export const syncRunSchema = t.Object({
  id: t.String(),
  startedAt: t.String(),
  finishedAt: t.String(),
  assetsProcessed: t.Integer(),
  recordsPersisted: t.Integer({ description: "Registros gravados no banco" }),
  alertsGenerated: t.Integer(),
  externalCalls: t.Integer(),
  upstreamFailures: t.Integer(),
  skippedReason: t.Optional(t.String()),
})
