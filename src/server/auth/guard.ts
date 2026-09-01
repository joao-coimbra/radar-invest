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
 * Token válido prova identidade, nunca prova propriedade.
 *
 * A distinção 401/403 é deliberada: 401 é "não sei quem você é", 403 é "sei
 * quem você é e não pode". Devolver 401 no segundo caso faria o cliente tentar
 * autenticar de novo à toa.
 */

/**
 * Extrai o token do header, direto do `request`.
 *
 * Não usa o `@elysiajs/bearer`, e a razão é concreta. O plugin registra um
 * `derive` global que, quando não encontra o header, cai num fallback de query
 * string (`?access_token=`, previsto na RFC 6750). No modo compilado — o de
 * produção — o Elysia decide por análise estática quais campos do contexto
 * montar, e `query` só é materializado nas rotas que declaram um schema para
 * ele. Nas demais, o fallback estourava `TypeError` e toda requisição sem
 * `Authorization` virava 500 em vez de 401. Foram seis das oito rotas.
 *
 * Ler do `request` não depende dessa análise, e de quebra fecha o caminho da
 * query string: token em URL vaza para log de acesso, histórico do navegador e
 * cabeçalho `Referer`. O contrato deste projeto especifica apenas o header.
 */
function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization")

  if (!header?.startsWith("Bearer ")) {
    return null
  }

  return header.slice("Bearer ".length).trim() || null
}

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
        const token = bearerToken(request)

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
