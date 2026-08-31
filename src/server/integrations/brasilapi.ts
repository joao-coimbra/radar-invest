import { cache } from "@/server/lib/cache"
import { env } from "@/server/lib/env"
import { UpstreamUnavailableError } from "@/server/lib/errors"
import { fetchWithRetry } from "@/server/lib/http"

/**
 * Adaptador da BrasilAPI — indicadores macroeconômicos oficiais.
 *
 * Contraponto deliberado à brapi: a origem é pública e **nenhum header de
 * autorização é enviado**. Mandar credencial para uma API que não pede é
 * vazar segredo sem ganhar nada.
 *
 * Devolve o modelo interno `Indicator` do contrato.
 */

const SOURCE = "BrasilAPI"
const SOURCE_LABEL = "A API de indicadores"
const CACHE_KEY = "indicators:all"

/** Indicadores previstos em `components.schemas.Indicator`. */
const SUPPORTED = new Set(["SELIC", "CDI", "IPCA"])

export type IndicatorName = "SELIC" | "CDI" | "IPCA"

export interface Indicator {
  name: IndicatorName
  value: number
  unit: string
  source: string
  referenceDate?: string
}

export interface IndicatorsResult {
  indicators: Indicator[]
  externalCalls: number
  callsAvoidedByCache: number
}

/** Recorte do JSON de `/taxas/v1`. */
interface BrasilApiTaxa {
  nome?: string
  valor?: number | string
}

/**
 * Busca SELIC, CDI e IPCA já normalizados.
 *
 * TTL de um dia: taxa oficial não muda de hora em hora, e cada chamada evitada
 * é energia poupada por um dado que seria idêntico.
 */
export async function fetchIndicators(): Promise<IndicatorsResult> {
  const cached = cache.get<Indicator[]>(CACHE_KEY)

  if (cached) {
    return { indicators: cached, externalCalls: 0, callsAvoidedByCache: 1 }
  }

  const response = await fetchWithRetry(
    `${env.BRASILAPI_BASE_URL}/taxas/v1`,
    { headers: { Accept: "application/json" } },
    { sourceName: SOURCE_LABEL }
  )

  if (!response.ok) {
    throw new UpstreamUnavailableError(
      `${SOURCE_LABEL} respondeu ${response.status} e os indicadores não puderam ser obtidos.`
    )
  }

  const payload = (await response.json()) as BrasilApiTaxa[]
  const referenceDate = new Date().toISOString().slice(0, 10)

  const indicators: Indicator[] = []

  for (const taxa of payload ?? []) {
    const name = taxa.nome?.trim().toUpperCase()

    if (!(name && SUPPORTED.has(name))) {
      continue
    }

    // A origem já devolve número, mas a conversão explícita protege contra a
    // variação de tipo que a README documenta entre as duas fontes.
    const value = Number(taxa.valor)

    if (!Number.isFinite(value)) {
      continue
    }

    indicators.push({
      name: name as IndicatorName,
      value,
      unit: "% a.a.",
      source: SOURCE,
      referenceDate,
    })
  }

  cache.set(CACHE_KEY, indicators, env.CACHE_TTL_INDICATORS_SECONDS)

  return { indicators, externalCalls: 1, callsAvoidedByCache: 0 }
}
