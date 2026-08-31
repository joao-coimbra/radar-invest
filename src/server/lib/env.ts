import { z } from "zod"

/**
 * Contrato das variáveis de ambiente do servidor.
 *
 * Nenhuma chave usa o prefixo `NEXT_PUBLIC_`. Esse prefixo embute o valor no
 * bundle do navegador, e este módulo carrega token da brapi, token do Airtable
 * e segredo do JWT — o único lugar que pode importá-lo é código de servidor.
 *
 * A validação roda no `src/instrumentation.ts`, hook que o Next executa uma
 * vez antes de aceitar a primeira requisição. Chave faltando derruba o boot,
 * não uma requisição no meio do ciclo de sincronização.
 */
const obrigatoria = (o: string) => ({ error: `obrigatória. ${o}` })

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  // ------------------------------------------------- brapi.dev (privada)
  // Sem default: é a credencial que o projeto existe para demonstrar, e um
  // fallback transformaria deploy mal configurado em 401 silencioso da origem.
  BRAPI_TOKEN: z
    .string(obrigatoria("Gere um token em https://brapi.dev."))
    .min(1, "obrigatória. Gere um token em https://brapi.dev."),
  BRAPI_BASE_URL: z
    .url({ error: "precisa ser uma URL válida." })
    .default("https://brapi.dev/api/v2"),

  // ------------------------------------------------ BrasilAPI (pública)
  // Pública, sem credencial. Por isso só a URL base.
  BRASILAPI_BASE_URL: z
    .url({ error: "precisa ser uma URL válida." })
    .default("https://brasilapi.com.br/api"),

  // ---------------------------------------------------- Airtable (banco)
  AIRTABLE_TOKEN: z
    .string(obrigatoria("Personal Access Token do Airtable."))
    .min(1, "obrigatória. Personal Access Token do Airtable."),
  AIRTABLE_BASE_ID: z
    .string(obrigatoria("ID da base, começa com 'app'."))
    .startsWith("app", "precisa ser um ID de base do Airtable (começa com 'app')."),
  AIRTABLE_BASE_URL: z.url().default("https://api.airtable.com/v0"),
  AIRTABLE_TABLE_USERS: z.string().default("Users"),
  AIRTABLE_TABLE_SESSIONS: z.string().default("Sessions"),
  AIRTABLE_TABLE_ASSETS: z.string().default("Assets"),
  AIRTABLE_TABLE_QUOTES: z.string().default("Quotes"),
  AIRTABLE_TABLE_ALERTS: z.string().default("Alerts"),

  // ------------------------------------------------------- Autenticação
  // 32 caracteres é o mínimo razoável para HS256: a chave não deve ter menos
  // entropia que o hash que ela assina.
  JWT_SECRET: z
    .string(obrigatoria("Gere com: openssl rand -base64 48"))
    .min(32, "precisa ter ao menos 32 caracteres. Gere com: openssl rand -base64 48"),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(604_800),

  // ---------------------------------------------------------- Automação
  CRON_SECRET: z
    .string(obrigatoria("Gere com: openssl rand -hex 32"))
    .min(16, "precisa ter ao menos 16 caracteres."),
  // Opcional de propósito: sem webhook o alerta ainda é gravado e exibido no
  // painel. A notificação é o canal, não o alerta.
  ALERTS_WEBHOOK_URL: z.url().optional().or(z.literal("")).transform((v) => v || undefined),

  // ------------------------------------------------ Cache e tráfego
  CACHE_TTL_QUOTES_SECONDS: z.coerce.number().int().positive().default(300),
  CACHE_TTL_INDICATORS_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(86_400),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(60),

  // -------------------------------------------- Janela de pregão (B3, BRT)
  MARKET_OPEN_HOUR: z.coerce.number().int().min(0).max(23).default(10),
  MARKET_CLOSE_HOUR: z.coerce.number().int().min(0).max(23).default(18),
})

export type Env = z.infer<typeof envSchema>

let cached: Env | null = null

/**
 * Valida e devolve o ambiente, uma vez por processo.
 *
 * A validação é **preguiçosa**, e isso não é detalhe. O `next build` percorre
 * o grafo de módulos para coletar dados das páginas; se validar no topo do
 * arquivo, o build passa a exigir os segredos de runtime. Na Vercel isso
 * quebra de vez com variáveis marcadas como Sensitive, que por desenho só
 * existem em runtime — o build falha mesmo com tudo corretamente configurado.
 *
 * Compilar não deveria precisar da credencial do Airtable de qualquer forma.
 */
export function validateEnv(): Env {
  if (cached) {
    return cached
  }

  const parsed = envSchema.safeParse(process.env)

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(raiz)"}: ${issue.message}`)
      .join("\n")

    throw new Error(
      `Variáveis de ambiente inválidas ou ausentes:\n${issues}\n\n` +
        "Copie o .env.example para .env.local e preencha as chaves acima."
    )
  }

  cached = parsed.data

  return cached
}

/**
 * O ambiente, validado no primeiro acesso a qualquer chave.
 *
 * A falha continua acontecendo no boot, não numa requisição: o
 * `src/instrumentation.ts` chama `validateEnv()` antes de o servidor aceitar
 * a primeira requisição.
 */
export const env = new Proxy({} as Env, {
  get: (_target, key: string) => validateEnv()[key as keyof Env],
  has: (_target, key: string) => key in validateEnv(),
  ownKeys: () => Reflect.ownKeys(validateEnv()),
  getOwnPropertyDescriptor: (_target, key) =>
    Reflect.getOwnPropertyDescriptor(validateEnv(), key),
})

/**
 * Lidas direto do `process.env`, sem passar pelo schema.
 *
 * `NODE_ENV` é definida pelo próprio Next e nunca é segredo, então consultá-la
 * não precisa arrastar a validação inteira — o que permite usá-la em topo de
 * módulo sem reintroduzir a dependência de build.
 */
export const isProduction = process.env.NODE_ENV === "production"
export const isTest = process.env.NODE_ENV === "test"
export const isDevelopment = !(isProduction || isTest)
