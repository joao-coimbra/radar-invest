/**
 * Catálogo de erros da aplicação.
 *
 * Cada classe carrega o código estável e o status HTTP definidos em
 * `docs/openapi.yaml`. O código é o que o consumidor lê para decidir o
 * tratamento; a mensagem é para humanos e nunca expõe detalhe interno.
 */

/** Item de `ErrorResponse.details` — um campo inválido por entrada. */
export interface ErrorDetail {
  field: string
  message: string
}

/** Envelope de erro do contrato: `{ success, code, message }`. */
export interface ErrorResponseBody {
  success: false
  code: string
  message: string
  details?: ErrorDetail[]
}

export abstract class AppError extends Error {
  abstract readonly status: number
  abstract readonly code: string

  readonly details?: ErrorDetail[]

  constructor(message: string, details?: ErrorDetail[]) {
    super(message)
    this.name = new.target.name
    this.details = details
  }

  toBody(): ErrorResponseBody {
    return {
      success: false,
      code: this.code,
      message: this.message,
      ...(this.details ? { details: this.details } : {}),
    }
  }

  toResponse(): Response {
    return Response.json(this.toBody(), { status: this.status })
  }
}

// --------------------------------------------------------------- 4xx cliente

export class ValidationError extends AppError {
  readonly status = 400
  readonly code = "VALIDATION_ERROR"

  constructor(
    message = "Um ou mais campos são inválidos.",
    details?: ErrorDetail[]
  ) {
    super(message, details)
  }
}

export class InvalidCredentialsError extends AppError {
  readonly status = 401
  readonly code = "INVALID_CREDENTIALS"

  // Mensagem deliberadamente genérica: distinguir "e-mail não existe" de
  // "senha errada" permitiria enumerar usuários válidos.
  constructor(message = "E-mail ou senha inválidos.") {
    super(message)
  }
}

export class UnauthenticatedError extends AppError {
  readonly status = 401
  readonly code = "UNAUTHENTICATED"

  constructor(message = "Não foi possível confirmar sua identidade.") {
    super(message)
  }
}

export class ForbiddenError extends AppError {
  readonly status = 403
  readonly code = "FORBIDDEN"

  constructor(message = "Você não tem permissão para acessar este recurso.") {
    super(message)
  }
}

export class NotFoundError extends AppError {
  readonly status = 404
  readonly code = "NOT_FOUND"

  constructor(message = "Recurso não encontrado.") {
    super(message)
  }
}

export class AssetAlreadyExistsError extends AppError {
  readonly status = 409
  readonly code = "ASSET_ALREADY_EXISTS"

  constructor(message = "Este ativo já está sendo monitorado.") {
    super(message)
  }
}

export class EmailAlreadyRegisteredError extends AppError {
  readonly status = 409
  readonly code = "EMAIL_ALREADY_REGISTERED"

  constructor(message = "Já existe uma conta com este e-mail.") {
    super(message)
  }
}

export class RateLimitExceededError extends AppError {
  readonly status = 429
  readonly code = "RATE_LIMIT_EXCEEDED"

  /** Segundos a aguardar, devolvidos no header `Retry-After`. */
  readonly retryAfterSeconds: number

  constructor(
    retryAfterSeconds = 60,
    message = "Limite de requisições excedido. Tente novamente mais tarde."
  ) {
    super(message)
    this.retryAfterSeconds = retryAfterSeconds
  }
}

// ------------------------------------------------------------- 5xx servidor

export class InternalError extends AppError {
  readonly status = 500
  readonly code = "INTERNAL_ERROR"

  constructor(message = "Não foi possível concluir a operação.") {
    super(message)
  }
}

/** A API externa rejeitou a credencial que o servidor tem configurada. */
export class UpstreamUnauthenticatedError extends AppError {
  readonly status = 502
  readonly code = "UPSTREAM_UNAUTHENTICATED"

  constructor(message = "A API de cotações rejeitou a credencial configurada.") {
    super(message)
  }
}

/**
 * A cota do plano na API externa acabou (402 na brapi).
 *
 * Existe separado de UPSTREAM_UNAVAILABLE porque a causa e a correção são
 * outras: não adianta tentar de novo, é preciso trocar de plano. Reportar as
 * duas como "não respondeu" transformaria o fim das 15.000 requisições
 * mensais do plano gratuito numa caça ao fantasma.
 */
export class UpstreamQuotaExceededError extends AppError {
  readonly status = 502
  readonly code = "UPSTREAM_QUOTA_EXCEEDED"

  constructor(message = "A cota do plano na API de cotações foi excedida.") {
    super(message)
  }
}

/** A API externa não respondeu depois de todas as tentativas. */
export class UpstreamUnavailableError extends AppError {
  readonly status = 502
  readonly code = "UPSTREAM_UNAVAILABLE"

  constructor(message = "A API externa não respondeu após as tentativas.") {
    super(message)
  }
}

// ------------------------------------------------------------------ formatador

/**
 * Converte qualquer erro no envelope do contrato.
 *
 * Erro desconhecido vira INTERNAL_ERROR com mensagem genérica, e o original
 * é registrado no servidor. Um stack trace devolvido ao cliente é um mapa da
 * aplicação entregue a quem estiver sondando.
 */
export function toErrorResponse(error: unknown): {
  status: number
  body: ErrorResponseBody
  headers?: Record<string, string>
} {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: error.toBody(),
      ...(error instanceof RateLimitExceededError
        ? { headers: { "Retry-After": String(error.retryAfterSeconds) } }
        : {}),
    }
  }

  console.error("[radar-invest] erro não tratado:", error)

  const fallback = new InternalError()

  return { status: fallback.status, body: fallback.toBody() }
}
