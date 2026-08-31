import { openapi } from "@elysiajs/openapi"
import { Elysia } from "elysia"
import {
  AppError,
  type ErrorDetail,
  NotFoundError,
  toErrorResponse,
  ValidationError,
} from "@/server/lib/errors"
import { v1Routes } from "@/server/routes"

/**
 * Ponto de entrada do Elysia dentro do App Router.
 *
 * O catch-all opcional `[[...slugs]]` entrega ao Elysia tudo sob `/api`, que
 * faz o roteamento a partir daí. Server Components não passam por aqui: eles
 * chamam a camada de serviço direto, em função. Esta superfície HTTP existe
 * para Client Components, para o scheduler e para consumidores externos.
 */

/** Erro de validação do Elysia, do qual só precisamos da lista de campos. */
interface ElysiaValidationError {
  all?: { path?: string; message?: string }[]
}

function toValidationDetails(error: unknown): ErrorDetail[] | undefined {
  const all = (error as ElysiaValidationError)?.all

  if (!Array.isArray(all)) {
    return undefined
  }

  return all.map((issue) => ({
    field: issue.path?.replace(/^\//, "") ?? "(corpo)",
    message: issue.message ?? "Valor inválido.",
  }))
}

const app = new Elysia({ prefix: "/api" })
  /**
   * Traduz os erros do próprio Elysia para o catálogo do contrato antes de
   * formatar. Sem isto, uma falha de validação sairia no formato do framework
   * e o consumidor teria dois envelopes de erro para tratar.
   */
  .onError(({ code, error, set }) => {
    let normalized: unknown = error

    // Um AppError passa intacto: ele já carrega código, status e a mensagem
    // que a camada de serviço escolheu. Normalizá-lo de novo trocaria
    // "Ativo não encontrado na sua carteira" pelo genérico do framework.
    if (!(error instanceof AppError)) {
      if (code === "VALIDATION") {
        normalized = new ValidationError(undefined, toValidationDetails(error))
      } else if (code === "NOT_FOUND") {
        normalized = new NotFoundError()
      }
    }

    const { status, body, headers } = toErrorResponse(normalized)

    set.status = status

    if (headers) {
      set.headers = { ...set.headers, ...headers }
    }

    return body
  })
  .use(
    openapi({
      path: "/docs",
      scalar: { url: "/api/docs/json" },
      documentation: {
        info: {
          title: "RadarInvest API",
          version: "1.0.0",
          description:
            "Central de monitoramento de mercado para escritórios de assessoria " +
            "de investimentos. O contrato aprovado está em `docs/openapi.yaml`; " +
            "esta é a documentação viva, gerada a partir das rotas implementadas.",
        },
        servers: [
          {
            url: "https://radar-invest.joaocoimbra.dev/api/v1",
            description: "Produção",
          },
          {
            url: "http://localhost:3000/api/v1",
            description: "Desenvolvimento",
          },
        ],
        tags: [
          { name: "Auth", description: "Emissão de credencial de acesso" },
          { name: "Assets", description: "Ativos monitorados pelo escritório" },
          { name: "Market", description: "Dados consolidados de mercado" },
          { name: "Alerts", description: "Alertas gerados pelas regras" },
          { name: "SyncRuns", description: "Ciclo de coleta e persistência" },
          { name: "Privacy", description: "Direitos do titular na LGPD" },
        ],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: "http",
              scheme: "bearer",
              bearerFormat: "JWT",
              description:
                "JWT no header Authorization. Ausência ou invalidez resulta em " +
                "401; falta de escopo resulta em 403.",
            },
            cronSecret: {
              type: "apiKey",
              in: "header",
              name: "x-cron-secret",
              description:
                "Segredo compartilhado com o agendador. Autoriza apenas o " +
                "disparo do ciclo de sincronização.",
            },
          },
        },
      },
      // Sonda de liveness fora da documentação: devolve constante, não expõe
      // dado nenhum e não faz parte do contrato oferecido ao consumidor.
      exclude: { paths: ["/api/health", "/health"] },
    })
  )
  /**
   * Sonda de liveness. HEAD porque não há corpo a transportar — o orquestrador
   * só precisa saber se o processo responde.
   */
  .head("/health", "OK")
  .use(v1Routes)

const handler = (request: Request) => app.handle(request)

export const GET = handler
export const POST = handler
export const PUT = handler
export const PATCH = handler
export const DELETE = handler
export const HEAD = handler
export const OPTIONS = handler

// O roteamento é do Elysia, em tempo de requisição. Sem isto o Next poderia
// tentar avaliar as rotas GET em build.
export const dynamic = "force-dynamic"
