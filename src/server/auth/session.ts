import { randomUUID } from "node:crypto"
import { env } from "@/server/lib/env"
import { UnauthenticatedError } from "@/server/lib/errors"
import { sessionsRepository } from "@/server/repositories/sessions.repository"
import {
  usersRepository,
  type UserRecord,
} from "@/server/repositories/users.repository"
import { signAccessToken } from "./jwt"
import { generateRefreshToken, hashRefreshToken } from "./refresh-token"
import type { Scope } from "./scopes"

/**
 * Ciclo de vida da sessão: abertura, rotação e encerramento.
 *
 * O par é assimétrico de propósito. O access token é um JWT de quinze minutos
 * que ninguém consegue revogar — por isso é curto. O refresh token é um valor
 * opaco de sete dias que existe justamente para ser revogável — por isso vive
 * no banco.
 */

export const REFRESH_COOKIE_NAME = "radar_refresh"

export interface SessionPayload {
  accessToken: string
  tokenType: "Bearer"
  expiresIn: number
  scopes: Scope[]
  user: {
    id: string
    name: string
    email: string
    role: UserRecord["role"]
    createdAt: string
  }
}

/** O refresh token em claro só existe aqui e no cookie. Nunca no banco. */
export interface IssuedSession extends SessionPayload {
  refreshToken: string
  refreshTokenMaxAge: number
}

function toSessionUser(user: UserRecord): SessionPayload["user"] {
  return {
    id: user.id,
    name: user.name,
    // O e-mail vai sem máscara aqui porque o destinatário é o próprio dono da
    // sessão, olhando os próprios dados.
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  }
}

async function issue(
  user: UserRecord,
  family: { familyId: string; expiresAt: string }
): Promise<IssuedSession> {
  const { token, tokenHash } = generateRefreshToken()

  await sessionsRepository.create({
    userId: user.id,
    familyId: family.familyId,
    tokenHash,
    expiresAt: family.expiresAt,
  })

  const access = await signAccessToken({ userId: user.id, role: user.role })

  const maxAge = Math.max(
    Math.floor((Date.parse(family.expiresAt) - Date.now()) / 1000),
    0
  )

  return {
    accessToken: access.token,
    tokenType: "Bearer",
    expiresIn: access.expiresIn,
    scopes: access.scopes,
    user: toSessionUser(user),
    refreshToken: token,
    refreshTokenMaxAge: maxAge,
  }
}

/** Abre uma família nova. Chamado no cadastro e no login. */
export function createSession(user: UserRecord): Promise<IssuedSession> {
  const expiresAt = new Date(
    Date.now() + env.REFRESH_TOKEN_TTL_SECONDS * 1000
  ).toISOString()

  return issue(user, { familyId: randomUUID(), expiresAt })
}

/**
 * Troca o refresh token por um par novo, detectando reuso.
 *
 * Cada refresh emite token novo e marca o anterior como usado. Se um token já
 * usado reaparecer, só há duas explicações: ou ele vazou e o atacante está
 * usando, ou vazou e o dono está usando depois do atacante. Nos dois casos a
 * cadeia está comprometida, e a resposta correta é derrubar a família inteira
 * — não apenas recusar aquele token, que deixaria a outra ponta viva.
 *
 * A família expira sete dias depois do login e a rotação **não** estende esse
 * prazo: o `expiresAt` original é copiado para cada token novo. Caso
 * contrário, uma sessão que rotacionasse a cada quinze minutos seria eterna.
 */
export async function rotateSession(
  refreshToken: string | undefined
): Promise<IssuedSession> {
  if (!refreshToken) {
    throw new UnauthenticatedError()
  }

  const session = await sessionsRepository.findByTokenHash(
    hashRefreshToken(refreshToken)
  )

  if (!session) {
    throw new UnauthenticatedError()
  }

  if (session.usedAt) {
    // Reuso. A família toda cai, inclusive a sessão que o atacante possa ter
    // acabado de abrir.
    await sessionsRepository.revokeFamily(session.familyId)
    console.warn(
      `[radar-invest] reuso de refresh token detectado; família ${session.familyId} revogada`
    )
    throw new UnauthenticatedError()
  }

  if (session.revokedAt || Date.parse(session.expiresAt) <= Date.now()) {
    throw new UnauthenticatedError()
  }

  const user = await usersRepository.findById(session.userId)

  if (!user) {
    throw new UnauthenticatedError()
  }

  await sessionsRepository.markUsed(session.id)

  return issue(user, {
    familyId: session.familyId,
    expiresAt: session.expiresAt,
  })
}

/**
 * Encerra a sessão revogando a família inteira.
 *
 * Idempotente: token ausente, desconhecido ou já revogado devolve sucesso.
 * Sair de uma conta em que já não se está é o estado desejado, não um erro.
 */
export async function revokeSession(
  refreshToken: string | undefined
): Promise<void> {
  if (!refreshToken) {
    return
  }

  const session = await sessionsRepository.findByTokenHash(
    hashRefreshToken(refreshToken)
  )

  if (session) {
    await sessionsRepository.revokeFamily(session.familyId)
  }
}

/**
 * Resolve o usuário a partir do cookie, **sem** rotacionar.
 *
 * É o que os Server Components usam para saber quem está na página. Renderizar
 * uma tela não deve consumir um refresh token: duas requisições paralelas do
 * navegador rotacionariam duas vezes, a segunda veria a primeira como usada e
 * derrubaria a família inteira por um falso positivo de reuso.
 */
export async function currentUser(
  refreshToken: string | undefined
): Promise<UserRecord | null> {
  if (!refreshToken) {
    return null
  }

  const session = await sessionsRepository.findByTokenHash(
    hashRefreshToken(refreshToken)
  )

  if (
    !session ||
    session.revokedAt ||
    Date.parse(session.expiresAt) <= Date.now()
  ) {
    return null
  }

  return usersRepository.findById(session.userId)
}
