import { Elysia, t } from "elysia"
import { authGuard } from "@/server/auth/guard"
import { eraseUserData, exportUserData } from "@/server/services/privacy.service"
import {
  envelope,
  errorResponse,
  protectedErrors,
  roleSchema,
} from "./models"

/**
 * Direitos do titular previstos na LGPD.
 *
 * Um direito só existe de fato quando vira endpoint. Política que promete
 * portabilidade sem rota que a execute é texto, não garantia.
 */

const exportSchema = t.Object({
  subject: t.Object({
    id: t.String(),
    name: t.String(),
    email: t.String({
      description: "Sem mascaramento: o destinatário é o próprio titular",
    }),
    role: roleSchema,
    consent: t.Object({
      accepted: t.Boolean(),
      termsVersion: t.String(),
      recordedAt: t.Union([t.String(), t.Null()]),
    }),
  }),
  assets: t.Array(t.Record(t.String(), t.Unknown())),
  alerts: t.Array(t.Record(t.String(), t.Unknown())),
  generatedAt: t.String(),
})

export const privacyRoutes = new Elysia({ prefix: "/users", tags: ["Privacy"] })
  .use(authGuard)
  .delete(
    "/:id",
    async ({ auth, params }) => {
      const removed = await eraseUserData(auth.sub, params.id)

      return {
        success: true as const,
        message:
          `Dados eliminados: ${removed.assets} ativo(s), ` +
          `${removed.alerts} alerta(s) e ${removed.sessions} sessão(ões).`,
        data: null,
      }
    },
    {
      auth: "users.manage",
      params: t.Object({ id: t.String() }),
      response: {
        200: envelope(t.Null()),
        404: errorResponse,
        ...protectedErrors,
      },
      detail: {
        summary: "Eliminar dados do titular",
        description:
          "Direito à eliminação, Art. 18, VI. Remove ativos, alertas, sessões " +
          "e a conta. O escopo `users.manage` autoriza a operação; a checagem " +
          "de posse confirma que o titular é quem está pedindo.",
      },
    }
  )
  .get(
    "/:id/export",
    async ({ auth, params }) => ({
      success: true as const,
      message: "Dados exportados com sucesso.",
      data: await exportUserData(auth.sub, params.id),
    }),
    {
      auth: "users.manage",
      params: t.Object({ id: t.String() }),
      response: {
        200: envelope(exportSchema),
        404: errorResponse,
        ...protectedErrors,
      },
      detail: {
        summary: "Exportar dados do titular",
        description:
          "Direito à portabilidade, Art. 18, V. Devolve em JSON tudo o que a " +
          "aplicação armazena sobre o titular, sem mascaramento — aqui o " +
          "destinatário é o próprio dono do dado. O hash da senha fica de fora.",
      },
    }
  )
