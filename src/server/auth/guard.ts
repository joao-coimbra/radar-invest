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
 */
export const authGuard = new Elysia({ name: "auth-guard" }).macro({
  auth(requiredScope: Scope | boolean) {
    if (!requiredScope) {
      return {}
    }

    return {
      async resolve({
        request,
      }: {
        request: Request
      }): Promise<{ auth: AccessTokenClaims }> {
        // Lido do `request`, não do `headers` desestruturado do contexto.
        // O Elysia decide por análise estática quais campos do contexto montar,
        // e no modo compilado — o de produção — ele não enxerga o uso aqui
        // dentro do `resolve` de uma macro: `headers` chega `undefined` e o
        // 401 vira um TypeError disfarçado de 500. Em dev não aparece, porque
        // lá o modo é dinâmico e o contexto vem inteiro.
        const header = request.headers.get("authorization")

        if (!header?.startsWith("Bearer ")) {
          throw new UnauthenticatedError()
        }

        const claims = await verifyAccessToken(header.slice("Bearer ".length))

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
