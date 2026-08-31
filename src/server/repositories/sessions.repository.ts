import {
  airtable,
  type AirtableRecord,
  escapeFormulaValue,
  TABLES,
} from "@/server/integrations/airtable"

/**
 * Acesso à tabela `Sessions` — as famílias de refresh token.
 *
 * Não há coluna de IP nem de user-agent. Seriam úteis para um painel de
 * "dispositivos conectados" que este projeto não tem; sem uso definido, o
 * dado não é coletado. Minimização (Art. 6º, III) é decisão de schema, não
 * de tela.
 */

export interface SessionRecord {
  id: string
  userId: string
  familyId: string
  tokenHash: string
  usedAt: string | null
  revokedAt: string | null
  expiresAt: string
  createdAt: string
}

interface SessionFields {
  userId?: string
  familyId?: string
  tokenHash?: string
  usedAt?: string
  revokedAt?: string
  expiresAt?: string
  createdAt?: string
}

function toSession(record: AirtableRecord<SessionFields>): SessionRecord {
  const { fields } = record

  return {
    id: record.id,
    userId: fields.userId ?? "",
    familyId: fields.familyId ?? "",
    tokenHash: fields.tokenHash ?? "",
    usedAt: fields.usedAt ?? null,
    revokedAt: fields.revokedAt ?? null,
    expiresAt: fields.expiresAt ?? "",
    createdAt: fields.createdAt ?? "",
  }
}

export interface CreateSessionInput {
  userId: string
  familyId: string
  tokenHash: string
  expiresAt: string
}

export const sessionsRepository = {
  /**
   * Busca pelo hash, nunca pelo token.
   *
   * Devolve inclusive sessões já usadas ou revogadas: é justamente encontrar
   * uma dessas que caracteriza reuso, e quem decide o que fazer é a camada de
   * sessão.
   */
  async findByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const record = await airtable.findOne<SessionFields>(
      TABLES.sessions,
      `{tokenHash} = '${escapeFormulaValue(tokenHash)}'`
    )

    return record ? toSession(record) : null
  },

  async create(input: CreateSessionInput): Promise<SessionRecord> {
    const [record] = await airtable.create<SessionFields>(TABLES.sessions, [
      { ...input, createdAt: new Date().toISOString() },
    ])

    return toSession(record)
  },

  /** Marca o token como consumido. Reaparecer depois disto é reuso. */
  async markUsed(id: string): Promise<void> {
    await airtable.update<SessionFields>(TABLES.sessions, [
      { id, fields: { usedAt: new Date().toISOString() } },
    ])
  },

  /**
   * Revoga a família inteira de uma vez.
   *
   * Chamado tanto no logout quanto na detecção de reuso. No segundo caso, é o
   * que impede que um token roubado continue valendo em paralelo ao do dono —
   * revogar só o token apresentado deixaria a outra ponta da cadeia viva.
   *
   * A escrita vai em lote de 10, que é o teto do Airtable.
   */
  async revokeFamily(familyId: string): Promise<number> {
    const records = await airtable.list<SessionFields>(TABLES.sessions, {
      filterByFormula: `AND({familyId} = '${escapeFormulaValue(familyId)}', {revokedAt} = BLANK())`,
    })

    if (records.length === 0) {
      return 0
    }

    const revokedAt = new Date().toISOString()

    await airtable.update<SessionFields>(
      TABLES.sessions,
      records.map((record) => ({ id: record.id, fields: { revokedAt } }))
    )

    return records.length
  },

  /** Eliminação do Art. 18, VI: apaga toda a trilha de sessões do titular. */
  async removeByUserId(userId: string): Promise<number> {
    const records = await airtable.list<SessionFields>(TABLES.sessions, {
      filterByFormula: `{userId} = '${escapeFormulaValue(userId)}'`,
      fields: ["userId"],
    })

    if (records.length === 0) {
      return 0
    }

    return airtable.destroy(
      TABLES.sessions,
      records.map((record) => record.id)
    )
  },
}
