import { randomUUID } from "node:crypto"
import { jwtVerify, SignJWT } from "jose"
import { env } from "@/server/lib/env"
import { UnauthenticatedError } from "@/server/lib/errors"
import { isRole, type Role, type Scope, scopesForRole } from "./scopes"

/**
 * Access token: JWT HS256, curta duração, guardado apenas em memória pelo
 * cliente.
 *
 * HS256 e não RS256 porque quem assina e quem verifica são o mesmo processo.
 * Chave assimétrica só compensa quando um terceiro precisa validar sem poder
 * emitir, o que não é o caso aqui.
 *
 * Os quinze minutos existem porque o token não é revogável: uma vez emitido,
 * vale até expirar. A janela curta é o que limita o estrago de um vazamento —
 * e é o refresh token, esse sim revogável, que sustenta a sessão longa.
 */

const ISSUER = "radar-invest"
const AUDIENCE = "radar-invest-api"

let cachedSecret: Uint8Array | null = null

/** Preguiçoso pelo mesmo motivo do `env`: o build não deve exigir o segredo. */
function secret(): Uint8Array {
  cachedSecret ??= new TextEncoder().encode(env.JWT_SECRET)

  return cachedSecret
}

export interface AccessTokenClaims {
  sub: string
  role: Role
  scopes: Scope[]
  jti: string
}

export async function signAccessToken(input: {
  userId: string
  role: Role
}): Promise<{ token: string; expiresIn: number; scopes: Scope[] }> {
  const scopes = scopesForRole(input.role)
  const expiresIn = env.ACCESS_TOKEN_TTL_SECONDS

  const token = await new SignJWT({ role: input.role, scopes })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(input.userId)
    // `jti` identifica a emissão. Não é usado para revogar — o access token
    // não é revogável — mas é o que permite correlacionar requisições ao
    // login que as originou, em auditoria.
    .setJti(randomUUID())
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${expiresIn}s`)
    .sign(secret())

  return { token, expiresIn, scopes }
}

/**
 * Verifica assinatura, emissor, audiência e expiração.
 *
 * Qualquer falha vira 401 com a mesma mensagem. Distinguir "assinatura
 * inválida" de "token expirado" na resposta ajuda mais quem sonda do que quem
 * usa.
 */
export async function verifyAccessToken(
  token: string
): Promise<AccessTokenClaims> {
  try {
    const { payload } = await jwtVerify(token, secret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["HS256"],
    })

    const { sub, role, scopes, jti } = payload as Record<string, unknown>

    if (!(typeof sub === "string" && isRole(role) && Array.isArray(scopes))) {
      throw new UnauthenticatedError()
    }

    return {
      sub,
      role,
      scopes: scopes as Scope[],
      jti: typeof jti === "string" ? jti : "",
    }
  } catch {
    throw new UnauthenticatedError()
  }
}
