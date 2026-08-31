import type { Quote } from "@/server/integrations/brapi"
import { airtable, TABLES } from "@/server/integrations/airtable"

/**
 * Histórico de cotações.
 *
 * Grava em lote e **só o que mudou de forma relevante**. Persistir as doze
 * cotações a cada ciclo encheria a cota mensal do plano gratuito com linhas
 * idênticas, e um histórico onde tudo se repete não responde nenhuma pergunta
 * melhor do que um histórico enxuto.
 */

interface QuoteFields {
  ticker?: string
  currentPrice?: number
  changePercent?: number
  currency?: string
  source?: string
  collectedAt?: string
}

/**
 * Variação mínima, em pontos percentuais, para considerar que a cotação mudou.
 *
 * Abaixo disto o movimento é ruído de mercado e não muda nenhuma decisão do
 * assessor — não vale uma linha no banco.
 */
const RELEVANT_CHANGE_THRESHOLD = 0.01

export const quotesRepository = {
  /**
   * Última cotação gravada de cada ticker informado.
   *
   * Uma leitura só para todos os tickers, ordenada da mais recente para a mais
   * antiga; o primeiro registro de cada ticker é o que interessa.
   */
  async latestByTicker(tickers: string[]): Promise<Map<string, number>> {
    if (tickers.length === 0) {
      return new Map()
    }

    const inList = tickers
      .map((ticker) => `{ticker} = '${ticker.toUpperCase()}'`)
      .join(", ")

    const records = await airtable.list<QuoteFields>(TABLES.quotes, {
      filterByFormula: `OR(${inList})`,
      sort: [{ field: "collectedAt", direction: "desc" }],
      fields: ["ticker", "currentPrice", "collectedAt"],
    })

    const latest = new Map<string, number>()

    for (const record of records) {
      const ticker = record.fields.ticker

      if (ticker && !latest.has(ticker)) {
        latest.set(ticker, record.fields.currentPrice ?? 0)
      }
    }

    return latest
  },

  /**
   * Grava apenas as cotações cujo preço se moveu além do limiar.
   *
   * Devolve quantas linhas foram gravadas e quantas foram descartadas, para o
   * ciclo poder mostrar a economia no painel.
   */
  async persistChanged(
    quotes: Quote[],
    lastPrices: Map<string, number>
  ): Promise<{ persisted: number; skipped: number }> {
    const changed = quotes.filter((quote) => {
      const previous = lastPrices.get(quote.ticker)

      if (previous === undefined) {
        return true
      }

      return Math.abs(quote.currentPrice - previous) >= RELEVANT_CHANGE_THRESHOLD
    })

    if (changed.length === 0) {
      return { persisted: 0, skipped: quotes.length }
    }

    await airtable.create<QuoteFields>(
      TABLES.quotes,
      changed.map((quote) => ({
        ticker: quote.ticker,
        currentPrice: quote.currentPrice,
        changePercent: quote.changePercent,
        currency: quote.currency,
        source: quote.source,
        collectedAt: quote.collectedAt,
      }))
    )

    return { persisted: changed.length, skipped: quotes.length - changed.length }
  },
}
