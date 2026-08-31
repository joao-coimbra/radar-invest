import {
  airtable,
  type AirtableRecord,
  escapeFormulaValue,
  TABLES,
} from "@/server/integrations/airtable"

/** Tipos do contrato (`AssetType`, `MonitoringStatus`). */
export type AssetType = "STOCK" | "FII" | "INDEX"
export type MonitoringStatus = "MONITORING" | "PAUSED"

/**
 * Estado do alerta para o ativo.
 *
 * Existe para que o alerta dispare na **transição** `NORMAL → BREACHED`, e não
 * a cada ciclo em que o limite continua rompido. Sem esta coluna o mesmo ativo
 * alertaria de cinco em cinco minutos e o assessor silenciaria o canal — o
 * alerta que grita sempre deixa de ser alerta.
 */
export type AlertState = "NORMAL" | "BREACHED"

export interface AssetRecord {
  id: string
  ticker: string
  type: AssetType
  alertThresholdPercent: number
  ownerId: string
  ownerEmail: string
  status: MonitoringStatus
  alertState: AlertState
  consentAccepted: boolean
  consentTermsVersion: string
  consentRecordedAt: string | null
  createdAt: string
  updatedAt: string | null
}

interface AssetFields {
  ticker?: string
  type?: string
  alertThresholdPercent?: number
  ownerId?: string
  ownerEmail?: string
  status?: string
  alertState?: string
  consentAccepted?: boolean
  consentTermsVersion?: string
  consentRecordedAt?: string
  createdAt?: string
  updatedAt?: string
}

const ASSET_TYPES: AssetType[] = ["STOCK", "FII", "INDEX"]

function toAsset(record: AirtableRecord<AssetFields>): AssetRecord {
  const { fields } = record

  return {
    id: record.id,
    ticker: fields.ticker ?? "",
    type: ASSET_TYPES.includes(fields.type as AssetType)
      ? (fields.type as AssetType)
      : "STOCK",
    alertThresholdPercent: fields.alertThresholdPercent ?? 0,
    ownerId: fields.ownerId ?? "",
    ownerEmail: fields.ownerEmail ?? "",
    status: fields.status === "PAUSED" ? "PAUSED" : "MONITORING",
    alertState: fields.alertState === "BREACHED" ? "BREACHED" : "NORMAL",
    consentAccepted: fields.consentAccepted === true,
    consentTermsVersion: fields.consentTermsVersion ?? "",
    consentRecordedAt: fields.consentRecordedAt ?? null,
    createdAt: fields.createdAt ?? "",
    updatedAt: fields.updatedAt ?? null,
  }
}

export interface CreateAssetInput {
  ticker: string
  type: AssetType
  alertThresholdPercent: number
  ownerId: string
  ownerEmail: string
  status: MonitoringStatus
  consentTermsVersion: string
}

export const assetsRepository = {
  /**
   * Ativos de um dono, com filtros opcionais.
   *
   * O `ownerId` entra na fórmula, não numa filtragem em memória depois: trazer
   * a carteira inteira do escritório para descartar o que não é do usuário
   * gastaria cota e deixaria o dado do outro passar pela aplicação sem
   * necessidade.
   */
  async listByOwner(
    ownerId: string,
    filters: { status?: MonitoringStatus; type?: AssetType } = {}
  ): Promise<AssetRecord[]> {
    const clauses = [`{ownerId} = '${escapeFormulaValue(ownerId)}'`]

    if (filters.status) {
      clauses.push(`{status} = '${escapeFormulaValue(filters.status)}'`)
    }

    if (filters.type) {
      clauses.push(`{type} = '${escapeFormulaValue(filters.type)}'`)
    }

    const records = await airtable.list<AssetFields>(TABLES.assets, {
      filterByFormula: `AND(${clauses.join(", ")})`,
      sort: [{ field: "ticker" }],
    })

    return records.map(toAsset)
  },

  /**
   * Todos os ativos em monitoramento, de todos os donos.
   *
   * É o que o ciclo de sincronização usa: uma leitura só, para agrupar todos
   * os tickers numa única chamada à brapi. Ler carteira por carteira faria N
   * requisições ao banco e N à API de cotações.
   */
  async listMonitored(): Promise<AssetRecord[]> {
    const records = await airtable.list<AssetFields>(TABLES.assets, {
      filterByFormula: "{status} = 'MONITORING'",
    })

    return records.map(toAsset)
  },

  async findByOwnerAndTicker(
    ownerId: string,
    ticker: string
  ): Promise<AssetRecord | null> {
    const record = await airtable.findOne<AssetFields>(
      TABLES.assets,
      `AND({ownerId} = '${escapeFormulaValue(ownerId)}', {ticker} = '${escapeFormulaValue(ticker.toUpperCase())}')`
    )

    return record ? toAsset(record) : null
  },

  async create(input: CreateAssetInput): Promise<AssetRecord> {
    const now = new Date().toISOString()

    const [record] = await airtable.create<AssetFields>(TABLES.assets, [
      {
        ticker: input.ticker.toUpperCase(),
        type: input.type,
        alertThresholdPercent: input.alertThresholdPercent,
        ownerId: input.ownerId,
        ownerEmail: input.ownerEmail.trim().toLowerCase(),
        status: input.status,
        alertState: "NORMAL",
        consentAccepted: true,
        consentTermsVersion: input.consentTermsVersion,
        consentRecordedAt: now,
        createdAt: now,
      },
    ])

    return toAsset(record)
  },

  /** Atualiza o estado de alerta de vários ativos num lote só. */
  async updateAlertStates(
    updates: { id: string; alertState: AlertState }[]
  ): Promise<void> {
    if (updates.length === 0) {
      return
    }

    const updatedAt = new Date().toISOString()

    await airtable.update<AssetFields>(
      TABLES.assets,
      updates.map(({ id, alertState }) => ({
        id,
        fields: { alertState, updatedAt },
      }))
    )
  },

  async remove(id: string): Promise<void> {
    await airtable.destroy(TABLES.assets, [id])
  },

  /** Eliminação do Art. 18, VI. */
  async removeByOwner(ownerId: string): Promise<number> {
    const records = await airtable.list<AssetFields>(TABLES.assets, {
      filterByFormula: `{ownerId} = '${escapeFormulaValue(ownerId)}'`,
      fields: ["ownerId"],
    })

    if (records.length === 0) {
      return 0
    }

    return airtable.destroy(
      TABLES.assets,
      records.map((record) => record.id)
    )
  },
}
