import { UpstreamUnavailableError } from "./errors"

/**
 * Cliente HTTP para as APIs externas, com timeout e espera exponencial.
 *
 * O contrato manda, em `x-rate-limit-policy.upstreamBehavior`: ao receber 429
 * da origem, aplicar espera exponencial e devolver 502 se as tentativas se
 * esgotarem. Como brapi e BrasilAPI precisam da mesma política, ela mora aqui
 * e não duplicada nos dois adaptadores.
 *
 * A divisão de responsabilidade é deliberada: este módulo cuida do transporte
 * e só decide o que é transitório. O significado de cada status de negócio —
 * 402 é cota, 404 é ticker inexistente — é do adaptador, que conhece a origem.
 */

const DEFAULT_MAX_ATTEMPTS = 3
const DEFAULT_TIMEOUT_MS = 8000
const DEFAULT_BASE_DELAY_MS = 300

export interface FetchWithRetryOptions {
  /** Nome da origem, usado na mensagem de erro. Ex.: "API de cotações". */
  sourceName: string
  maxAttempts?: number
  timeoutMs?: number
  baseDelayMs?: number
  /**
   * Espera fixa após 429, quando a origem impõe penalidade conhecida.
   *
   * O Airtable bloqueia a base por 30 segundos depois de estourar as 5
   * requisições por segundo. Voltar em 300ms só renova a punição.
   */
  quotaDelayMs?: number
}

/** Teto para o `Retry-After` da origem, para não travar a requisição do usuário. */
const MAX_RETRY_AFTER_MS = 35_000

function retryAfterFromHeader(response: Response): number | null {
  const header = response.headers.get("Retry-After")

  if (!header) {
    return null
  }

  const seconds = Number(header)

  return Number.isFinite(seconds)
    ? Math.min(seconds * 1000, MAX_RETRY_AFTER_MS)
    : null
}

/**
 * Só o que pode mudar de resultado se tentarmos de novo.
 *
 * 408 e 429 são explicitamente temporários; 5xx é falha do servidor da origem.
 * 401, 402 e 404 ficam de fora de propósito: repetir não muda a resposta e só
 * queima cota.
 */
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Executa a requisição, repetindo apenas as falhas transitórias.
 *
 * Devolve a `Response` sempre que ela for definitiva — inclusive com status de
 * erro, para o adaptador traduzir. Lança `UpstreamUnavailableError` quando as
 * tentativas acabam ou a rede falha.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: FetchWithRetryOptions
): Promise<Response> {
  const {
    sourceName,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    quotaDelayMs,
  } = options

  let lastReason = "sem resposta"
  let nextDelayMs: number | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      })

      if (!isRetryableStatus(response.status)) {
        return response
      }

      lastReason = `HTTP ${response.status}`

      // A origem sabe melhor do que nós quanto tempo falta. Só quando ela não
      // diz é que caímos na espera exponencial.
      nextDelayMs =
        retryAfterFromHeader(response) ??
        (response.status === 429 ? (quotaDelayMs ?? null) : null)
    } catch (error) {
      // Rede fora, DNS, ou o timeout acima disparando: tudo transitório.
      lastReason = error instanceof Error ? error.message : String(error)
      nextDelayMs = null
    }

    if (attempt < maxAttempts) {
      // Espera exponencial com jitter. O jitter evita que todos os tickers de
      // um ciclo voltem a bater na origem no mesmo milissegundo.
      const delay = nextDelayMs ?? baseDelayMs * 2 ** (attempt - 1)
      await sleep(delay + Math.random() * baseDelayMs)
    }
  }

  throw new UpstreamUnavailableError(
    `${sourceName} não respondeu após ${maxAttempts} tentativas (${lastReason}).`
  )
}
