import type { Role } from "@/server/auth/scopes"
import {
  airtable,
  type AirtableRecord,
  escapeFormulaValue,
  TABLES,
} from "@/server/integrations/airtable"

/**
 * Acesso à tabela `Users`.
 *
 * A identidade do usuário é o **record id do Airtable** (`rec…`), não um UUID
 * gerado por nós. Manter um UUID próprio obrigaria a buscar por
 * `filterByFormula` a cada consulta por id, enquanto o record id permite
 * chamada direta — e com 5 requisições por segundo e cota mensal contada,
 * cada ida evitada importa.
 */

export interface UserRecord {
  id: string
  name: string
  email: string
  passwordHash: string
  role: Role
  consentAccepted: boolean
  consentTermsVersion: string
  consentRecordedAt: string | null
  createdAt: string
}

/** O Airtable omite campos vazios; todo mapeamento precisa de valor padrão. */
interface UserFields {
  name?: string
  email?: string
  passwordHash?: string
  role?: string
  consentAccepted?: boolean
  consentTermsVersion?: string
  consentRecordedAt?: string
  createdAt?: string
}

function toUser(record: AirtableRecord<UserFields>): UserRecord {
  const { fields } = record

  return {
    id: record.id,
    name: fields.name ?? "",
    email: fields.email ?? "",
    passwordHash: fields.passwordHash ?? "",
    role: fields.role === "ADMIN" ? "ADMIN" : "ASSESSOR",
    consentAccepted: fields.consentAccepted === true,
    consentTermsVersion: fields.consentTermsVersion ?? "",
    consentRecordedAt: fields.consentRecordedAt ?? null,
    createdAt: fields.createdAt ?? "",
  }
}

export interface CreateUserInput {
  name: string
  email: string
  passwordHash: string
  role: Role
  consentTermsVersion: string
}

export const usersRepository = {
  /**
   * O e-mail é normalizado para minúsculas na gravação e na busca. Sem isso,
   * `Ana@x.com` e `ana@x.com` virariam duas contas para a mesma pessoa e a
   * checagem de duplicidade no cadastro passaria batido.
   */
  async findByEmail(email: string): Promise<UserRecord | null> {
    const record = await airtable.findOne<UserFields>(
      TABLES.users,
      `LOWER({email}) = '${escapeFormulaValue(email.trim().toLowerCase())}'`
    )

    return record ? toUser(record) : null
  },

  async findById(id: string): Promise<UserRecord | null> {
    const record = await airtable.findOne<UserFields>(
      TABLES.users,
      `RECORD_ID() = '${escapeFormulaValue(id)}'`
    )

    return record ? toUser(record) : null
  },

  async create(input: CreateUserInput): Promise<UserRecord> {
    const now = new Date().toISOString()

    const [record] = await airtable.create<UserFields>(TABLES.users, [
      {
        name: input.name.trim(),
        email: input.email.trim().toLowerCase(),
        passwordHash: input.passwordHash,
        role: input.role,
        // O consentimento é gravado no ato do cadastro, com aceite, versão do
        // termo e data — Art. 8º, §1º. É esse registro que dá sentido aos
        // direitos de portabilidade e eliminação.
        consentAccepted: true,
        consentTermsVersion: input.consentTermsVersion,
        consentRecordedAt: now,
        createdAt: now,
      },
    ])

    return toUser(record)
  },

  /** Eliminação do Art. 18, VI. Remove a conta em si. */
  async remove(id: string): Promise<void> {
    await airtable.destroy(TABLES.users, [id])
  },
}
