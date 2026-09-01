import { env, isProduction } from "@/server/lib/env"
import {
  InternalError,
  UpstreamUnauthenticatedError,
  UpstreamUnavailableError,
} from "@/server/lib/errors"
import { fetchWithRetry } from "@/server/lib/http"

/**
 * Adaptador do Airtable — o banco do projeto.
 *
 * As restrições da plataforma não são detalhe de implementação, elas moldam
 * este arquivo inteiro:
 *
 * - **5 requisições por segundo por base.** Estourar devolve 429 e bloqueia a
 *   base por 30 segundos. Por isso as requisições são serializadas por uma
 *   fila com intervalo mínimo, em vez de disparadas em paralelo.
 * - **10 registros por requisição de escrita.** Por isso `create` e `update`
 *   fatiam a entrada em lotes, e nunca gravam um registro por vez.
 * - **100 registros por página na leitura**, com `offset`. Por isso `list`
 *   pagina até o fim.
 * - **Cota mensal baixa no plano gratuito.** Por isso cada chamada é contada
 *   e exposta ao painel.
 */

const SOURCE_LABEL = "O banco de dados"

/** 5 req/s = 200ms. Os 10ms extras absorvem a imprecisão do relógio. */
const MIN_INTERVAL_MS = 210

/** Penalidade documentada do Airtable ao estourar a taxa. */
const QUOTA_DELAY_MS = 30_000

/** Teto de escrita por requisição, imposto pela API. */
const BATCH_SIZE = 10

/** Teto de leitura por página, imposto pela API. */
const PAGE_SIZE = 100

/** Trava de segurança: impede que um `filterByFormula` errado varra a base. */
const MAX_PAGES = 50

export interface AirtableRecord<T> {
  id: string
  fields: T
}

export interface ListOptions {
  filterByFormula?: string
  maxRecords?: number
  sort?: { field: string; direction?: "asc" | "desc" }[]
  fields?: string[]
}

/**
 * Escapa um valor para interpolação em `filterByFormula`.
 *
 * Sem isto, um e-mail contendo aspa simples quebraria a fórmula — e, pior,
 * permitiria alterar o predicado de filtragem, que é o que separa a carteira
 * de um usuário da de outro.
 */
export function escapeFormulaValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = []

  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size))
  }

  return batches
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

class AirtableClient {
  /**
   * Fila serial. Cada requisição espera a anterior e mais o intervalo mínimo.
   *
   * Vale por instância do processo: em serverless, duas instâncias podem
   * somar taxa. Para o volume deste projeto — dezenas de ativos num ciclo —
   * é suficiente, e o retry de 429 cobre a corrida residual.
   */
  private tail: Promise<unknown> = Promise.resolve()
  private lastRequestAt = 0
  private calls = 0

  /** Chamadas feitas ao banco. Alimenta o `summary` do painel. */
  stats(): { calls: number } {
    return { calls: this.calls }
  }

  private schedule<T>(task: () => Promise<T>): Promise<T> {
    const run = this.tail.then(async () => {
      const waitFor = this.lastRequestAt + MIN_INTERVAL_MS - Date.now()

      if (waitFor > 0) {
        await sleep(waitFor)
      }

      this.lastRequestAt = Date.now()
      this.calls++

      return task()
    })

    // A cauda ignora a rejeição para que uma falha não trave a fila inteira;
    // o erro continua sendo propagado a quem chamou, por `run`.
    this.tail = run.catch(() => undefined)

    return run
  }

  private async request<T>(
    table: string,
    init: RequestInit & { searchParams?: URLSearchParams; path?: string }
  ): Promise<T> {
    const { searchParams, path = "", ...requestInit } = init

    const url =
      `${env.AIRTABLE_BASE_URL}/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(table)}${path}` +
      (searchParams?.size ? `?${searchParams}` : "")

    const response = await this.schedule(() =>
      fetchWithRetry(
        url,
        {
          ...requestInit,
          headers: {
            Authorization: `Bearer ${env.AIRTABLE_TOKEN}`,
            "Content-Type": "application/json",
            ...requestInit.headers,
          },
        },
        {
          sourceName: SOURCE_LABEL,
          quotaDelayMs: QUOTA_DELAY_MS,
          // Uma tentativa a menos que o padrão: cada retry aqui custa 30s de
          // espera, e a requisição do usuário tem de terminar em algum momento.
          maxAttempts: 2,
          timeoutMs: 15_000,
        }
      )
    )

    if (!response.ok) {
      await this.raiseForStatus(response, table)
    }

    return (await response.json()) as T
  }

  private async raiseForStatus(
    response: Response,
    table: string
  ): Promise<never> {
    const body = await response.text().catch(() => "")

    if (response.status === 401 || response.status === 403) {
      throw new UpstreamUnauthenticatedError(
        "O banco de dados rejeitou a credencial configurada."
      )
    }

    if (response.status === 404) {
      // Base ou tabela inexistente é erro de configuração nosso, não falha da
      // origem — mas o usuário final não pode fazer nada a respeito, então a
      // resposta é genérica e o detalhe vai para o log.
      console.error(
        `[radar-invest] tabela "${table}" não encontrada no Airtable: ${body}`
      )
      throw new UpstreamUnavailableError(
        "O banco de dados não está configurado corretamente."
      )
    }

    if (response.status === 422) {
      console.error(`[radar-invest] payload rejeitado pelo Airtable: ${body}`)
      throw new InternalError()
    }

    throw new UpstreamUnavailableError(
      `${SOURCE_LABEL} respondeu ${response.status}.`
    )
  }

  /** Lê todos os registros que casam com o filtro, paginando de 100 em 100. */
  async list<T>(
    table: string,
    options: ListOptions = {}
  ): Promise<AirtableRecord<T>[]> {
    const records: AirtableRecord<T>[] = []
    let offset: string | undefined
    let page = 0

    do {
      const searchParams = new URLSearchParams({ pageSize: String(PAGE_SIZE) })

      if (options.filterByFormula) {
        searchParams.set("filterByFormula", options.filterByFormula)
      }

      if (options.maxRecords) {
        searchParams.set("maxRecords", String(options.maxRecords))
      }

      for (const field of options.fields ?? []) {
        searchParams.append("fields[]", field)
      }

      options.sort?.forEach((sort, index) => {
        searchParams.set(`sort[${index}][field]`, sort.field)
        searchParams.set(`sort[${index}][direction]`, sort.direction ?? "asc")
      })

      if (offset) {
        searchParams.set("offset", offset)
      }

      const payload = await this.request<{
        records: AirtableRecord<T>[]
        offset?: string
      }>(table, { method: "GET", searchParams })

      records.push(...payload.records)
      offset = payload.offset
      page++
    } while (offset && page < MAX_PAGES)

    return records
  }

  /** Primeiro registro que casa com o filtro, ou `null`. */
  async findOne<T>(
    table: string,
    filterByFormula: string
  ): Promise<AirtableRecord<T> | null> {
    const records = await this.list<T>(table, {
      filterByFormula,
      maxRecords: 1,
    })

    return records[0] ?? null
  }

  /** Cria registros em lotes de 10. `typecast` deixa o Airtable coagir tipos. */
  async create<T extends object>(
    table: string,
    records: T[]
  ): Promise<AirtableRecord<T>[]> {
    const created: AirtableRecord<T>[] = []

    for (const batch of chunk(records, BATCH_SIZE)) {
      const payload = await this.request<{ records: AirtableRecord<T>[] }>(
        table,
        {
          method: "POST",
          body: JSON.stringify({
            records: batch.map((fields) => ({ fields })),
            typecast: true,
          }),
        }
      )

      created.push(...payload.records)
    }

    return created
  }

  /** Atualiza registros em lotes de 10, mexendo só nos campos enviados. */
  async update<T extends object>(
    table: string,
    records: { id: string; fields: Partial<T> }[]
  ): Promise<AirtableRecord<T>[]> {
    const updated: AirtableRecord<T>[] = []

    for (const batch of chunk(records, BATCH_SIZE)) {
      const payload = await this.request<{ records: AirtableRecord<T>[] }>(
        table,
        {
          method: "PATCH",
          body: JSON.stringify({ records: batch, typecast: true }),
        }
      )

      updated.push(...payload.records)
    }

    return updated
  }

  /** Remove registros em lotes de 10. */
  async destroy(table: string, ids: string[]): Promise<number> {
    let deleted = 0

    for (const batch of chunk(ids, BATCH_SIZE)) {
      const searchParams = new URLSearchParams()

      for (const id of batch) {
        searchParams.append("records[]", id)
      }

      const payload = await this.request<{ records: { deleted: boolean }[] }>(
        table,
        { method: "DELETE", searchParams }
      )

      deleted += payload.records.filter((record) => record.deleted).length
    }

    return deleted
  }
}

/** Instância única, presa ao `globalThis` para sobreviver ao HMR do `next dev`. */
const globalForAirtable = globalThis as typeof globalThis & {
  __radarInvestAirtable?: AirtableClient
}

export const airtable =
  globalForAirtable.__radarInvestAirtable ?? new AirtableClient()

if (!isProduction) {
  globalForAirtable.__radarInvestAirtable = airtable
}

/**
 * Nomes das tabelas, resolvidos no primeiro uso.
 *
 * Getters e não valores literais: ler `env` no topo do módulo faria o
 * `next build` exigir as credenciais de runtime só para percorrer o grafo de
 * módulos.
 */
export const TABLES = {
  get users() {
    return env.AIRTABLE_TABLE_USERS
  },
  get sessions() {
    return env.AIRTABLE_TABLE_SESSIONS
  },
  get assets() {
    return env.AIRTABLE_TABLE_ASSETS
  },
  get quotes() {
    return env.AIRTABLE_TABLE_QUOTES
  },
  get alerts() {
    return env.AIRTABLE_TABLE_ALERTS
  },
}
