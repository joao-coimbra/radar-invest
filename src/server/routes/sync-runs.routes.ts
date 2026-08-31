import { timingSafeEqual } from "node:crypto"
import { Elysia, t } from "elysia"
import { verifyAccessToken } from "@/server/auth/jwt"
import { env } from "@/server/lib/env"
import { ForbiddenError, UnauthenticatedError } from "@/server/lib/errors"
import { runSync } from "@/server/services/sync.service"
import { envelope, errorResponse, syncRunSchema } from "./models"

/**
 * Execução do ciclo de sincronização.
 *
 * Aceita dois modos de autenticação, e a razão de serem dois é que os dois
 * chamadores são de naturezas diferentes. O ADMIN é uma pessoa com sessão,
 * identificada por JWT com escopo `syncs.execute`. O agendador é uma máquina
 * sem sessão, que não tem como fazer login nem rotacionar refresh token; para
 * ele existe um segredo compartilhado no header `x-cron-secret`.
 *
 * Dar um usuário ADMIN ao GitHub Actions seria pior: uma conta com senha e
 * sessão renovável guardada num secret de CI, capaz de fazer tudo o que um
 * ADMIN faz. O segredo dedicado autoriza uma operação e nada mais.
 */

/**
 * Comparação em tempo constante.
 *
 * `===` em string encerra no primeiro byte diferente, e a diferença de tempo
 * — medível em muitas requisições — vaza o prefixo correto. O segredo tem
 * entropia suficiente para tornar o ataque impraticável, mas comparar direito
 * custa uma linha.
 */
function secretMatches(provided: string | undefined): boolean {
  if (!provided) {
    return false
  }

  const a = Buffer.from(provided)
  const b = Buffer.from(env.CRON_SECRET)

  return a.length === b.length && timingSafeEqual(a, b)
}

export const syncRunsRoutes = new Elysia({
  prefix: "/sync-runs",
  tags: ["SyncRuns"],
}).post(
  "",
  async ({ request, set }) => {
    // Pelo `request` e não pelo contexto, pelo mesmo motivo da macro `auth`:
    // no modo compilado o Elysia pode não montar `headers`.
    const cronSecret = request.headers.get("x-cron-secret") ?? undefined
    const authorization = request.headers.get("authorization")

    if (secretMatches(cronSecret)) {
      // Agendador autenticado. Segue.
    } else if (authorization?.startsWith("Bearer ")) {
      const claims = await verifyAccessToken(
        authorization.slice("Bearer ".length)
      )

      if (!claims.scopes.includes("syncs.execute")) {
        throw new ForbiddenError(
          "Apenas ADMIN pode disparar a sincronização."
        )
      }
    } else {
      throw new UnauthenticatedError()
    }

    const result = await runSync()

    set.status = 202

    return {
      success: true as const,
      message: result.skippedReason ?? "Sincronização concluída.",
      data: result,
    }
  },
  {
    headers: t.Object(
      {
        authorization: t.Optional(t.String()),
        "x-cron-secret": t.Optional(
          t.String({ description: "Segredo compartilhado com o agendador" })
        ),
      },
      { additionalProperties: true }
    ),
    response: {
      202: envelope(syncRunSchema),
      401: errorResponse,
      403: errorResponse,
      429: errorResponse,
      500: errorResponse,
      502: errorResponse,
    },
    detail: {
      summary: "Executar ciclo de sincronização",
      description:
        "Coleta nas APIs externas, normaliza, aplica as regras, persiste no " +
        "Airtable e gera os alertas que romperam o limite. Fora do horário de " +
        "pregão encerra sem chamar nenhuma API externa. Aceita JWT com escopo " +
        "`syncs.execute` ou o header `x-cron-secret`.",
      security: [{ bearerAuth: [] }, { cronSecret: [] }],
    },
  }
)
