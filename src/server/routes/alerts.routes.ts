import { Elysia, t } from "elysia"
import { authGuard } from "@/server/auth/guard"
import { alertsRepository } from "@/server/repositories/alerts.repository"
import { alertSchema, envelope, protectedErrors, tickerSchema } from "./models"

/**
 * Alertas gerados pelas regras de negócio.
 *
 * A listagem filtra por `ownerId` dentro da consulta ao banco. O `ownerId` não
 * aparece na resposta: quem pergunta já sabe quem é, e devolvê-lo só ampliaria
 * a superfície sem servir a nada.
 */
export const alertsRoutes = new Elysia({ prefix: "/alerts", tags: ["Alerts"] })
  .use(authGuard)
  .get(
    "",
    async ({ auth, query }) => {
      const alerts = await alertsRepository.listByOwner(auth.sub, {
        ticker: query.ticker,
        since: query.desde,
      })

      return {
        success: true as const,
        message: "Alertas consultados com sucesso.",
        data: alerts.map(({ ownerId: _owner, ...alert }) => alert),
      }
    },
    {
      auth: "alerts.read",
      query: t.Object({
        ticker: t.Optional(tickerSchema),
        desde: t.Optional(
          t.String({
            format: "date",
            description: "Data inicial do período consultado",
            examples: ["2026-08-01"],
          })
        ),
      }),
      response: { 200: envelope(t.Array(alertSchema)), ...protectedErrors },
      detail: {
        summary: "Listar alertas gerados",
        description:
          "Apenas os alertas dos ativos da carteira de quem chamou, do mais " +
          "recente para o mais antigo.",
      },
    }
  )
