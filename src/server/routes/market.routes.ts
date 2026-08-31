import { Elysia, t } from "elysia"
import { authGuard } from "@/server/auth/guard"
import { fetchIndicators } from "@/server/integrations/brasilapi"
import { getMarketOverview } from "@/server/services/market.service"
import {
  envelope,
  errorResponse,
  indicatorSchema,
  marketOverviewSchema,
  protectedErrors,
} from "./models"

/**
 * Dados consolidados de mercado.
 *
 * `/market-overview` é o recurso central: é a diferença entre consumir e
 * integrar. Os dados brutos das duas APIs não respondem nada sozinhos; o
 * panorama cruza cotação com indicador, aplica o limite configurado e devolve
 * uma ordem de prioridade — informação acionável, não JSON repassado.
 */
export const marketRoutes = new Elysia({ tags: ["Market"] })
  .use(authGuard)
  .get(
    "/indicators",
    async () => {
      const { indicators } = await fetchIndicators()

      return {
        success: true as const,
        message: "Indicadores consultados com sucesso.",
        data: indicators,
      }
    },
    {
      auth: "market.read",
      response: {
        200: envelope(t.Array(indicatorSchema)),
        502: errorResponse,
        ...protectedErrors,
      },
      detail: {
        summary: "Consultar indicadores macroeconômicos",
        description:
          "SELIC, CDI e IPCA normalizados. Vêm da BrasilAPI, que não exige " +
          "autenticação, e são servidos do cache dentro do TTL de 24 horas.",
      },
    }
  )
  .get(
    "/market-overview",
    async ({ auth }) => ({
      success: true as const,
      message: "Panorama gerado com sucesso.",
      data: await getMarketOverview(auth.sub),
    }),
    {
      auth: "market.read",
      response: {
        200: envelope(marketOverviewSchema),
        502: errorResponse,
        ...protectedErrors,
      },
      detail: {
        summary: "Gerar panorama consolidado da carteira",
        description:
          "Combina cotações da API privada com indicadores da API pública, " +
          "aplica as regras de negócio e devolve a carteira ordenada por " +
          "prioridade de atenção. O `summary` expõe quantas chamadas externas " +
          "o ciclo custou e quantas o cache evitou.",
      },
    }
  )
