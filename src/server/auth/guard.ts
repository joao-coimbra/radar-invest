import { bearer } from "@elysiajs/bearer"
import { Elysia } from "elysia"
import { ForbiddenError, UnauthenticatedError } from "@/server/lib/errors"
import { type AccessTokenClaims, verifyAccessToken } from "./jwt"
import type { Scope } from "./scopes"

/**
 * Macro `auth` para rotas protegidas.
 *
 * Aplica os dois primeiros passos da ordem obrigatória de verificação:
 *
 *   1. validar o token       → falha = 401
 *   2. extrair a identidade
 *   3. checar o escopo       → falha = 403
 *   4. **checar a posse do recurso** → falha = 403
 *   5. consultar os dados
 *   6. filtrar a resposta
 *
 * Os passos 4 a 6 ficam com cada rota, porque só ela sabe qual recurso está
 * sendo pedido. A macro não pode fazê-los, e é importante que isso esteja
 * escrito: um guard que valida token e escopo dá a sensação de que a rota está
 * protegida, quando o que falta — a posse — é justamente o buraco do BOLA.
 * Token válido prova identidade, nunca propriedade.
 *
 * A distinção 401/403 é deliberada: 401 é "não sei quem você é", 403 é "sei
 * quem você é e não pode". Devolver 401 no segundo caso faria o cliente tentar
 * autenticar de novo à toa.
 *
 * A extração do token fica com o `@elysiajs/bearer`, que registra um `derive`
 * global. Ler `headers` direto no `resolve` da macro não funciona em
 * produção: o Elysia decide por análise estática quais campos do contexto
 * montar, e no modo compilado não enxerga o uso ali dentro — `headers` chega
 * `undefined` e o 401 vira um TypeError disfarçado de 500. Em desenvolvimento
 * o modo é dinâmico e o problema não aparece.
 */
export const authGuard = new Elysia({ name: "auth-guard" })
  .use(bearer())
  .macro({
    auth(requiredScope: Scope | boolean) {
      if (!requiredScope) {
        return {}
      }

      return {
        async resolve({
          bearer: token,
        }: {
          bearer?: string
        }): Promise<{ auth: AccessTokenClaims }> {
          if (!token) {
            throw new UnauthenticatedError()
          }

          const claims = await verifyAccessToken(token)

          if (
            typeof requiredScope === "string" &&
            !claims.scopes.includes(requiredScope)
          ) {
            throw new ForbiddenError()
          }

          return { auth: claims }
        },
        detail: {
          security: [{ bearerAuth: [] }],
          ...(typeof requiredScope === "string"
            ? { "x-required-scope": requiredScope }
            : {}),
        },
      }
    },
  })
