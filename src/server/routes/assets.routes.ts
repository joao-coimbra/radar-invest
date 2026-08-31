import { Elysia, t } from "elysia"
import { authGuard } from "@/server/auth/guard"
import { ValidationError } from "@/server/lib/errors"
import {
  createAsset,
  deleteAsset,
  getAsset,
  listAssets,
} from "@/server/services/assets.service"
import {
  assetSchema,
  assetTypeSchema,
  consentSchema,
  envelope,
  errorResponse,
  monitoringStatusSchema,
  protectedErrors,
  tickerSchema,
} from "./models"

/**
 * Ativos monitorados.
 *
 * Toda rota daqui aplica a ordem completa: token (401) → escopo (403) →
 * **posse** → dados → resposta filtrada. A posse é o passo que a macro `auth`
 * não pode fazer, e é o que separa esta API do BOLA: o `ownerId` do token
 * entra na consulta ao banco, nunca num filtro em memória depois.
 */
export const assetsRoutes = new Elysia({ prefix: "/assets", tags: ["Assets"] })
  .use(authGuard)
  .get(
    "",
    async ({ auth, query }) => ({
      success: true as const,
      message: "Ativos consultados com sucesso.",
      data: await listAssets(auth.sub, {
        status: query.status,
        type: query.type,
      }),
    }),
    {
      auth: "assets.read",
      query: t.Object({
        status: t.Optional(monitoringStatusSchema),
        type: t.Optional(assetTypeSchema),
      }),
      response: { 200: envelope(t.Array(assetSchema)), ...protectedErrors },
      detail: {
        summary: "Listar ativos monitorados",
        description:
          "Cada usuário recebe apenas os ativos da própria carteira, com o " +
          "e-mail do responsável mascarado.",
      },
    }
  )
  .post(
    "",
    async ({ auth, body, set }) => {
      if (!body.consent.accepted) {
        throw new ValidationError(
          "É necessário o consentimento do responsável para cadastrar o ativo.",
          [{ field: "consent.accepted", message: "Deve ser verdadeiro." }]
        )
      }

      const asset = await createAsset(auth.sub, body)

      set.status = 201
      set.headers.location = `/api/v1/assets/${asset.ticker}`

      return {
        success: true as const,
        message: "Ativo cadastrado com sucesso.",
        data: asset,
      }
    },
    {
      auth: "assets.write",
      body: t.Object({
        ticker: tickerSchema,
        type: assetTypeSchema,
        alertThresholdPercent: t.Number({
          minimum: 0.1,
          maximum: 50,
          description:
            "Variação absoluta, em pontos percentuais, que dispara o alerta",
        }),
        ownerEmail: t.String({ format: "email", maxLength: 254 }),
        status: t.Optional(monitoringStatusSchema),
        consent: consentSchema,
      }),
      response: {
        201: envelope(assetSchema),
        400: errorResponse,
        409: errorResponse,
        ...protectedErrors,
      },
      detail: {
        summary: "Cadastrar ativo para monitoramento",
        description:
          "Registra o ativo na carteira de quem chamou e define o limite de " +
          "variação percentual que dispara alerta.",
      },
    }
  )
  .get(
    "/:ticker",
    async ({ auth, params }) => ({
      success: true as const,
      message: "Ativo consultado com sucesso.",
      data: await getAsset(auth.sub, params.ticker),
    }),
    {
      auth: "assets.read",
      params: t.Object({ ticker: tickerSchema }),
      response: {
        200: envelope(assetSchema),
        404: errorResponse,
        ...protectedErrors,
      },
      detail: {
        summary: "Consultar ativo monitorado",
        description:
          "A busca já filtra por dono, então ativo de outra carteira é " +
          "indistinguível de inexistente: ambos devolvem 404. Devolver 403 " +
          "confirmaria que o ticker existe na carteira de alguém.",
      },
    }
  )
  .delete(
    "/:ticker",
    async ({ auth, params }) => {
      await deleteAsset(auth.sub, params.ticker)

      return {
        success: true as const,
        message: "Ativo removido com sucesso.",
        data: null,
      }
    },
    {
      auth: "assets.write",
      params: t.Object({ ticker: tickerSchema }),
      response: {
        200: envelope(t.Null()),
        404: errorResponse,
        ...protectedErrors,
      },
      detail: { summary: "Remover ativo do monitoramento" },
    }
  )
