import { airtable } from "@/server/integrations/airtable"
import { fetchQuotes, type Quote } from "@/server/integrations/brapi"
import { fetchIndicators, type Indicator } from "@/server/integrations/brasilapi"
import { cache } from "@/server/lib/cache"
import {
  type AssetRecord,
  assetsRepository,
} from "@/server/repositories/assets.repository"

/**
 * Regras de negócio do painel — onde consumir vira integrar.
 *
 * Os dados brutos das duas APIs não respondem nada sozinhos: a brapi diz que
 * PETR4 caiu 4,17%, a BrasilAPI diz que o CDI está em 10,2% ao ano. Nenhuma
 * das duas responde *quais dos meus ativos precisam de atenção agora, e por
 * quê* — que é a pergunta do assessor. É esse cruzamento que este arquivo faz.
 */

export type AttentionLevel = "NORMAL" | "WATCH" | "CRITICAL"

export interface OverviewItem {
  rank: number
  ticker: string
  quote: Quote
  alertThresholdPercent: number
  thresholdBreached: boolean
  attentionLevel: AttentionLevel
  returnVsCdi: number | null
}

export interface MarketOverview {
  generatedAt: string
  indicators: Indicator[]
  items: OverviewItem[]
  summary: {
    totalMonitored: number
    totalCritical: number
    externalCalls: number
    callsAvoidedByCache: number
  }
}

/**
 * Fração do limite a partir da qual o ativo entra em observação.
 *
 * Sessenta por cento do limite configurado. O nível intermediário existe
 * porque um painel binário — rompeu ou não rompeu — avisa tarde demais: o
 * assessor quer ver o ativo se aproximando, não só o estouro consumado.
 */
const WATCH_RATIO = 0.6

/** Dias úteis num ano, para converter CDI anual em CDI do período. */
const MONTHS_IN_YEAR = 12

export function thresholdBreached(
  changePercent: number,
  threshold: number
): boolean {
  // Valor absoluto: queda de 4% com limite de 3% importa tanto quanto alta de
  // 4%. O que dispara é a magnitude do movimento, não a direção.
  return Math.abs(changePercent) >= threshold
}

function attentionLevelFor(
  changePercent: number,
  threshold: number
): AttentionLevel {
  const magnitude = Math.abs(changePercent)

  if (magnitude >= threshold) {
    return "CRITICAL"
  }

  return magnitude >= threshold * WATCH_RATIO ? "WATCH" : "NORMAL"
}

/**
 * Variação do ativo comparada ao CDI do período.
 *
 * Métrica derivada: nenhuma das duas APIs entrega isso pronto. O CDI vem
 * anualizado da BrasilAPI e é convertido para o mês, que é o horizonte em que
 * o assessor compara — comparar a variação do dia com o CDI do ano inteiro não
 * diria nada, e com o CDI do dia (dividido por 252) a diferença sumiria no
 * arredondamento.
 *
 * Devolve `null` quando o CDI não veio: métrica sem base é pior que métrica
 * ausente, porque parece informação.
 */
export function returnVsCdi(
  changePercent: number,
  indicators: Indicator[]
): number | null {
  const cdi = indicators.find((indicator) => indicator.name === "CDI")

  if (!cdi) {
    return null
  }

  const monthly = cdi.value / MONTHS_IN_YEAR

  return Number((changePercent - monthly).toFixed(2))
}

const LEVEL_ORDER: Record<AttentionLevel, number> = {
  CRITICAL: 0,
  WATCH: 1,
  NORMAL: 2,
}

/**
 * Cruza ativos, cotações e indicadores e ordena por prioridade de atenção.
 *
 * A ordenação é o produto: primeiro o nível, depois a magnitude do movimento
 * dentro do nível. O assessor lê de cima para baixo e para quando quiser.
 */
function buildOverviewItems(
  assets: AssetRecord[],
  quotes: Quote[],
  indicators: Indicator[]
): OverviewItem[] {
  const quoteByTicker = new Map(quotes.map((quote) => [quote.ticker, quote]))

  const items = assets
    .map((asset) => {
      const quote = quoteByTicker.get(asset.ticker)

      if (!quote) {
        // Ativo sem cotação nesta rodada simplesmente não entra no painel. É
        // melhor omitir do que exibir com preço zerado.
        return null
      }

      return {
        rank: 0,
        ticker: asset.ticker,
        quote,
        alertThresholdPercent: asset.alertThresholdPercent,
        thresholdBreached: thresholdBreached(
          quote.changePercent,
          asset.alertThresholdPercent
        ),
        attentionLevel: attentionLevelFor(
          quote.changePercent,
          asset.alertThresholdPercent
        ),
        returnVsCdi: returnVsCdi(quote.changePercent, indicators),
      } satisfies OverviewItem
    })
    .filter((item): item is OverviewItem => item !== null)

  items.sort((a, b) => {
    const byLevel =
      LEVEL_ORDER[a.attentionLevel] - LEVEL_ORDER[b.attentionLevel]

    return byLevel !== 0
      ? byLevel
      : Math.abs(b.quote.changePercent) - Math.abs(a.quote.changePercent)
  })

  return items.map((item, index) => ({ ...item, rank: index + 1 }))
}

/**
 * Monta o panorama da carteira de um usuário.
 *
 * As duas APIs externas são consultadas em paralelo porque não dependem uma da
 * outra; o cruzamento acontece depois. Os tickers vão todos numa chamada só à
 * brapi.
 */
export async function getMarketOverview(
  ownerId: string
): Promise<MarketOverview> {
  const cacheBefore = cache.stats()
  const callsBefore = airtable.stats().calls

  const assets = await assetsRepository.listByOwner(ownerId, {
    status: "MONITORING",
  })

  const tickers = assets.map((asset) => asset.ticker)

  const [quotesResult, indicatorsResult] = await Promise.all([
    fetchQuotes(tickers),
    fetchIndicators(),
  ])

  const items = buildOverviewItems(
    assets,
    quotesResult.quotes,
    indicatorsResult.indicators
  )

  return {
    generatedAt: new Date().toISOString(),
    indicators: indicatorsResult.indicators,
    items,
    summary: {
      totalMonitored: assets.length,
      totalCritical: items.filter((item) => item.attentionLevel === "CRITICAL")
        .length,
      // Conta as três origens: cotações, indicadores e banco. É a medida de
      // quanto este painel custou ao mundo lá fora.
      externalCalls:
        quotesResult.externalCalls +
        indicatorsResult.externalCalls +
        (airtable.stats().calls - callsBefore),
      callsAvoidedByCache: cache.stats().hits - cacheBefore.hits,
    },
  }
}
