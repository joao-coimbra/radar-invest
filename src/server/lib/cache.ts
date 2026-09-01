import { isProduction } from "./env"

/**
 * Cache em memória com TTL, estratégia cache-aside.
 *
 * Existe por sustentabilidade digital e por cota: toda requisição consome
 * energia, e o plano gratuito da brapi dá 15.000 chamadas por mês. Cotação do
 * mesmo ativo pedida duas vezes dentro da janela não justifica ida à origem.
 *
 * Os contadores não são diagnóstico opcional: `hits` é exatamente o
 * `summary.callsAvoidedByCache` que o `MarketOverview` do contrato precisa
 * devolver. Economia que ninguém mede é economia que ninguém acredita.
 */

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

export interface CacheStats {
  hits: number
  misses: number
  size: number
}

class TtlCache {
  private readonly store = new Map<string, CacheEntry<unknown>>()

  private hits = 0
  private misses = 0

  /**
   * Devolve o valor ainda dentro do TTL, ou `null`.
   *
   * Entrada vencida é removida e contada como erro de cache — do ponto de
   * vista de quem chama, vencida e ausente são a mesma coisa.
   */
  get<T>(key: string): T | null {
    const entry = this.store.get(key)

    if (!entry) {
      this.misses++
      return null
    }

    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key)
      this.misses++
      return null
    }

    this.hits++
    return entry.value as T
  }

  set<T>(key: string, value: T, ttlSeconds: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 })
  }

  stats(): CacheStats {
    return { hits: this.hits, misses: this.misses, size: this.store.size }
  }
}

/**
 * Instância única presa ao `globalThis`.
 *
 * O hot reload do `next dev` reavalia o módulo a cada salvamento. Sem isto o
 * cache e os contadores zerariam a cada edição, e o painel mostraria economia
 * zero durante todo o desenvolvimento.
 */
const globalForCache = globalThis as typeof globalThis & {
  __radarInvestCache?: TtlCache
}

export const cache = globalForCache.__radarInvestCache ?? new TtlCache()

if (!isProduction) {
  globalForCache.__radarInvestCache = cache
}
