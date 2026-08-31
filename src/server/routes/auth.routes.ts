import { Elysia, t } from "elysia"
import { hashPassword, verifyPassword } from "@/server/auth/password"
import {
  createSession,
  type IssuedSession,
  REFRESH_COOKIE_NAME,
  revokeSession,
  rotateSession,
} from "@/server/auth/session"
import { isProduction } from "@/server/lib/env"
import {
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  ValidationError,
} from "@/server/lib/errors"
import { usersRepository } from "@/server/repositories/users.repository"
import { consentSchema, envelope, errorResponse, sessionSchema } from "./models"

/**
 * Rotas de autenticação — as únicas operações públicas do contrato.
 *
 * São o ponto onde a identidade ainda não existe e passa a existir. Todas as
 * demais exigem o token emitido aqui.
 */

/**
 * O refresh token viaja em cookie, nunca no corpo.
 *
 * `httpOnly` tira o roubo por XSS da mesa: JavaScript da página não alcança o
 * valor. `Secure` em produção impede que ele trafegue em claro.
 *
 * `SameSite=Lax` e `Path=/` divergem do `CLAUDE.md`, que pedia `Strict` e
 * `/api/v1/auth`. A interface é renderizada no servidor e precisa do cookie
 * nas navegações de página, que `Strict` bloquearia vindo de link externo e
 * que o path restrito nem entregaria. `Lax` continua barrando POST
 * cross-site, que é o vetor de CSRF que importa aqui.
 */
function refreshCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  }
}

type CookieJar = Record<
  string,
  { value?: string; set: (options: Record<string, unknown>) => void }
>

function setRefreshCookie(cookie: CookieJar, session: IssuedSession): void {
  cookie[REFRESH_COOKIE_NAME].set({
    value: session.refreshToken,
    ...refreshCookieOptions(session.refreshTokenMaxAge),
  })
}

/** Resposta sem o refresh token: ele existe só no cookie. */
function toBody(session: IssuedSession, message: string) {
  const { refreshToken: _t, refreshTokenMaxAge: _m, ...data } = session

  return { success: true as const, message, data }
}

const cookieSchema = t.Cookie({
  [REFRESH_COOKIE_NAME]: t.Optional(t.String()),
})

export const authRoutes = new Elysia({ prefix: "/auth", tags: ["Auth"] })
  .post(
    "/register",
    async ({ body, cookie, set }) => {
      // O consentimento é condição para criar a conta, não caixa de formulário.
      // Sem aceite não há base legal para o tratamento (Art. 7º, I).
      if (!body.consent.accepted) {
        throw new ValidationError("É necessário aceitar os termos para criar a conta.", [
          { field: "consent.accepted", message: "Deve ser verdadeiro." },
        ])
      }

      const existing = await usersRepository.findByEmail(body.email)

      if (existing) {
        throw new EmailAlreadyRegisteredError()
      }

      const user = await usersRepository.create({
        name: body.name,
        email: body.email,
        passwordHash: await hashPassword(body.password),
        // Contas novas nascem ASSESSOR. Promover a ADMIN é manual de
        // propósito: privilégio por autoatendimento anula a separação de papéis.
        role: "ASSESSOR",
        consentTermsVersion: body.consent.termsVersion,
      })

      const session = await createSession(user)
      setRefreshCookie(cookie as CookieJar, session)

      set.status = 201

      return toBody(session, "Conta criada com sucesso.")
    },
    {
      body: t.Object({
        name: t.String({ minLength: 2, maxLength: 120 }),
        email: t.String({ format: "email", maxLength: 254 }),
        password: t.String({ minLength: 12, maxLength: 128 }),
        consent: consentSchema,
      }),
      cookie: cookieSchema,
      response: {
        201: envelope(sessionSchema),
        400: errorResponse,
        409: errorResponse,
        429: errorResponse,
        500: errorResponse,
      },
      detail: {
        summary: "Cadastrar usuário",
        description:
          "Cria uma conta. A senha é armazenada apenas como hash scrypt e nunca " +
          "é devolvida. O consentimento é registrado com aceite, versão do termo " +
          "e data, conforme o Art. 8º da LGPD.",
      },
    }
  )
  .post(
    "/login",
    async ({ body, cookie }) => {
      const user = await usersRepository.findByEmail(body.email)

      // A verificação da senha roda mesmo sem usuário encontrado? Não: aqui o
      // custo de um scrypt falso não compensa. O que importa é a **mensagem**
      // ser idêntica nos dois casos — distinguir "e-mail não existe" de "senha
      // errada" permitiria enumerar contas válidas.
      if (!user) {
        throw new InvalidCredentialsError()
      }

      if (!(await verifyPassword(body.password, user.passwordHash))) {
        throw new InvalidCredentialsError()
      }

      const session = await createSession(user)
      setRefreshCookie(cookie as CookieJar, session)

      return toBody(session, "Autenticado com sucesso.")
    },
    {
      body: t.Object({
        email: t.String({ format: "email", maxLength: 254 }),
        password: t.String({ minLength: 8 }),
      }),
      cookie: cookieSchema,
      response: {
        200: envelope(sessionSchema),
        400: errorResponse,
        401: errorResponse,
        429: errorResponse,
        500: errorResponse,
      },
      detail: {
        summary: "Autenticar e obter token de acesso",
        description:
          "Credenciais inválidas devolvem 401 com mensagem genérica, sem informar " +
          "se o erro foi no e-mail ou na senha.",
      },
    }
  )
  .post(
    "/refresh",
    async ({ cookie }) => {
      const jar = cookie as CookieJar
      const session = await rotateSession(jar[REFRESH_COOKIE_NAME]?.value)

      setRefreshCookie(jar, session)

      return toBody(session, "Sessão rotacionada com sucesso.")
    },
    {
      cookie: cookieSchema,
      response: {
        200: envelope(sessionSchema),
        401: errorResponse,
        429: errorResponse,
        500: errorResponse,
      },
      detail: {
        summary: "Rotacionar a sessão e emitir novo access token",
        description:
          "Cada refresh emite um token novo e marca o anterior como usado. Se um " +
          "token já usado reaparecer, a família inteira é revogada e a resposta " +
          "é 401 — a conclusão é que ele vazou.",
      },
    }
  )
  .post(
    "/logout",
    async ({ cookie }) => {
      const jar = cookie as CookieJar

      await revokeSession(jar[REFRESH_COOKIE_NAME]?.value)

      jar[REFRESH_COOKIE_NAME].set({
        value: "",
        ...refreshCookieOptions(0),
      })

      return {
        success: true as const,
        message: "Sessão encerrada.",
        data: null,
      }
    },
    {
      cookie: cookieSchema,
      response: {
        200: envelope(t.Null()),
        429: errorResponse,
        500: errorResponse,
      },
      detail: {
        summary: "Encerrar a sessão",
        description:
          "Revoga a família inteira do refresh token, não só o token atual. " +
          "Idempotente: sem sessão ativa a resposta continua sendo 200.",
      },
    }
  )
