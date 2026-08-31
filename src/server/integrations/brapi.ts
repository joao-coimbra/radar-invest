import { cache } from "@/server/lib/cache"
import { env } from "@/server/lib/env"
import {
  NotFoundError,
  UpstreamQuotaExceededError,
  UpstreamUnauthenticatedError,
  UpstreamUnavailableError,
} from "@/server/lib/errors"
import { fetchWithRetry } from "@/server/lib/http"

/**
 * Adaptador da brapi.dev — API privada de cotações da B3, autenticada por
 * Bearer Token.
 *
 * Devolve o modelo interno `Quote` do contrato, nunca o JSON cru da origem. Se
 * a brapi renomear um campo, só este arquivo muda.
 */

const SOURCE = "brapi.dev"
const SOURCE_LABEL = "A API de cotações"

/** Modelo interno. Espelha `components.schemas.Quote` do contrato. */
export interface Quote {
  ticker: string
  companyName: string | null
  currentPrice: number
  changePercent: number
  currency: string
  source: string
  collectedAt: string
  fromCache: boolean
}

export interface QuotesResult {
  quotes: Quote[]
  /** Requisições efetivamente feitas à origem neste ciclo: 0 ou 1. */
  externalCalls: number
  /** Tickers servidos do cache, sem ida à origem. */
  callsAvoidedByCache: number
}

/** Recorte do JSON da origem que este adaptador consome. */
interface BrapiResponse {
  results?: {
    requestedSymbol?: string
    symbol?: string
    changed?: boolean
    data?: {
      longName?: string | null
      shortName?: string | null
      currency?: string | null
      regularMarketPrice?: number | null
      regularMarketChangePercent?: number | null
    } | null
  }[]
}

type CachedQuote = Omit<Quote, "fromCache">

const cacheKey = (ticker: string) => `quotes:${ticker}`

function normalizeTickers(tickers: string[]): string[] {
  const seen = new Set<string>()

  for (const raw of tickers) {
    const ticker = raw.trim().toUpperCase()
    if (ticker) {
      seen.add(ticker)
    }
  }

  return [...seen]
}

/**
 * Traduz o status da origem para o erro da aplicação.
 *
 * O 402 ganha código próprio porque a correção é outra: não é esperar, é
 * trocar de plano.
 */
function raiseForStatus(status: number, tickers: string[]): never {
  if (status === 401) {
    throw new UpstreamUnauthenticatedError()
  }

  if (status === 402) {
    throw new UpstreamQuotaExceededError()
  }

  if (status === 404) {
    throw new NotFoundError(
      `Ticker não encontrado na origem: ${tickers.join(", ")}.`
    )
  }

  throw new UpstreamUnavailableError(
    `${SOURCE_LABEL} respondeu ${status} e a cotação não pôde ser obtida.`
  )
}

/**
 * Busca cotações para uma lista de tickers.
 *
 * Faz **uma única** requisição, com todos os tickers que faltarem no cache
 * agrupados no parâmetro `symbols`. Doze ativos custam uma chamada, não doze —
 * é o que mantém o ciclo dentro das 15.000 requisições mensais do plano.
 *
 * O cache é por ticker, não pelo conjunto: assim um ativo novo na carteira não
 * invalida os onze que já estavam quentes.
 */
export async function fetchQuotes(tickers: string[]): Promise<QuotesResult> {
  const wanted = normalizeTickers(tickers)

  if (wanted.length === 0) {
    return { quotes: [], externalCalls: 0, callsAvoidedByCache: 0 }
  }

  const resolved = new Map<string, Quote>()
  const missing: string[] = []

  for (const ticker of wanted) {
    const cached = cache.get<CachedQuote>(cacheKey(ticker))

    if (cached) {
      // `collectedAt` continua sendo o instante da coleta original: é isso que
      // permite ao painel mostrar a idade real do dado.
      resolved.set(ticker, { ...cached, fromCache: true })
    } else {
      missing.push(ticker)
    }
  }

  const callsAvoidedByCache = wanted.length - missing.length

  if (missing.length === 0) {
    return {
      quotes: wanted.map((ticker) => resolved.get(ticker)).filter(isQuote),
      externalCalls: 0,
      callsAvoidedByCache,
    }
  }

  const url = `${env.BRAPI_BASE_URL}/stocks/quote?symbols=${encodeURIComponent(
    missing.join(",")
  )}`

  const response = await fetchWithRetry(
    url,
    {
      headers: {
        Authorization: `Bearer ${env.BRAPI_TOKEN}`,
        Accept: "application/json",
      },
    },
    { sourceName: SOURCE_LABEL }
  )

  if (!response.ok) {
    raiseForStatus(response.status, missing)
  }

  const payload = (await response.json()) as BrapiResponse
  const collectedAt = new Date().toISOString()

  for (const result of payload.results ?? []) {
    // `requestedSymbol` é o que foi pedido; `symbol` é como a origem chama
    // hoje. Quando `changed` é true os dois divergem, e é o pedido que casa
    // com a tabela Assets.
    const ticker = (result.requestedSymbol ?? result.symbol)
      ?.trim()
      .toUpperCase()

    const data = result.data

    if (!(ticker && data)) {
      continue
    }

    const currentPrice = Number(data.regularMarketPrice)
    const changePercent = Number(data.regularMarketChangePercent)

    // Ativo sem preço não é cotação: fica de fora em vez de virar NaN no
    // ranking. A camada de serviço decide o que fazer com a ausência.
    if (!(Number.isFinite(currentPrice) && Number.isFinite(changePercent))) {
      continue
    }

    const quote: CachedQuote = {
      ticker,
      companyName: data.longName ?? data.shortName ?? null,
      currentPrice,
      changePercent,
      currency: data.currency ?? "BRL",
      source: SOURCE,
      collectedAt,
    }

    cache.set(cacheKey(ticker), quote, env.CACHE_TTL_QUOTES_SECONDS)
    resolved.set(ticker, { ...quote, fromCache: false })
  }

  return {
    // Preserva a ordem pedida; tickers sem cotação simplesmente não aparecem.
    quotes: wanted.map((ticker) => resolved.get(ticker)).filter(isQuote),
    externalCalls: 1,
    callsAvoidedByCache,
  }
}

function isQuote(quote: Quote | undefined): quote is Quote {
  return quote !== undefined
}
