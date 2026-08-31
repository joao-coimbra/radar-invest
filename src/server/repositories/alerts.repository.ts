import {
  airtable,
  type AirtableRecord,
  escapeFormulaValue,
  TABLES,
} from "@/server/integrations/airtable"

/**
 * Alertas gerados quando um ativo rompeu o limite configurado.
 *
 * A tabela carrega `ownerId` mesmo sem estar na descrição original do schema:
 * sem ele, `GET /alerts` não teria como devolver só os alertas da carteira de
 * quem pergunta, e a rota ficaria exposta ao BOLA — token válido provaria
 * identidade, nunca propriedade.
 */

export type AlertDirection = "UP" | "DOWN"

export interface AlertRecord {
  id: string
  ticker: string
  ownerId: string
  direction: AlertDirection
  changePercent: number
  configuredThreshold: number
  notified: boolean
  createdAt: string
}

interface AlertFields {
  ticker?: string
  ownerId?: string
  direction?: string
  changePercent?: number
  configuredThreshold?: number
  notified?: boolean
  createdAt?: string
}

function toAlert(record: AirtableRecord<AlertFields>): AlertRecord {
  const { fields } = record

  return {
    id: record.id,
    ticker: fields.ticker ?? "",
    ownerId: fields.ownerId ?? "",
    direction: fields.direction === "UP" ? "UP" : "DOWN",
    changePercent: fields.changePercent ?? 0,
    configuredThreshold: fields.configuredThreshold ?? 0,
    notified: fields.notified === true,
    createdAt: fields.createdAt ?? "",
  }
}

export interface CreateAlertInput {
  ticker: string
  ownerId: string
  direction: AlertDirection
  changePercent: number
  configuredThreshold: number
  notified: boolean
}

export const alertsRepository = {
  async listByOwner(
    ownerId: string,
    filters: { ticker?: string; since?: string } = {}
  ): Promise<AlertRecord[]> {
    const clauses = [`{ownerId} = '${escapeFormulaValue(ownerId)}'`]

    if (filters.ticker) {
      clauses.push(`{ticker} = '${escapeFormulaValue(filters.ticker.toUpperCase())}'`)
    }

    if (filters.since) {
      clauses.push(
        `IS_AFTER({createdAt}, '${escapeFormulaValue(filters.since)}')`
      )
    }

    const records = await airtable.list<AlertFields>(TABLES.alerts, {
      filterByFormula: `AND(${clauses.join(", ")})`,
      sort: [{ field: "createdAt", direction: "desc" }],
    })

    return records.map(toAlert)
  },

  /** Grava os alertas do ciclo em lotes de 10. */
  async createMany(inputs: CreateAlertInput[]): Promise<AlertRecord[]> {
    if (inputs.length === 0) {
      return []
    }

    const createdAt = new Date().toISOString()

    const records = await airtable.create<AlertFields>(
      TABLES.alerts,
      inputs.map((input) => ({ ...input, createdAt }))
    )

    return records.map(toAlert)
  },

  /** Eliminação do Art. 18, VI. */
  async removeByOwner(ownerId: string): Promise<number> {
    const records = await airtable.list<AlertFields>(TABLES.alerts, {
      filterByFormula: `{ownerId} = '${escapeFormulaValue(ownerId)}'`,
      fields: ["ownerId"],
    })

    if (records.length === 0) {
      return 0
    }

    return airtable.destroy(
      TABLES.alerts,
      records.map((record) => record.id)
    )
  },
}
