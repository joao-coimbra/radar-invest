/**
 * Papéis e escopos.
 *
 * Papel é a função geral no sistema; escopo é o limite de acesso concreto. A
 * conversão acontece uma vez, na autenticação, e o token carrega o resultado.
 * Guardar escopo no token evita consultar o banco a cada requisição — e deixa
 * explícito que promover alguém a ADMIN só vale a partir do próximo login.
 */

const ROLES = ["ASSESSOR", "ADMIN"] as const
export type Role = (typeof ROLES)[number]

export const SCOPES = [
  "assets.read",
  "assets.write",
  "market.read",
  "alerts.read",
  "users.manage",
  "syncs.execute",
] as const
export type Scope = (typeof SCOPES)[number]

const ASSESSOR_SCOPES: Scope[] = [
  "assets.read",
  "assets.write",
  "market.read",
  "alerts.read",
  "users.manage",
]

const ROLE_SCOPES: Record<Role, Scope[]> = {
  ASSESSOR: ASSESSOR_SCOPES,
  // ADMIN é ASSESSOR mais o direito de disparar sincronização. A promoção é
  // manual de propósito: conceder privilégio por autoatendimento anularia a
  // separação de papéis.
  ADMIN: [...ASSESSOR_SCOPES, "syncs.execute"],
}

export function scopesForRole(role: Role): Scope[] {
  return ROLE_SCOPES[role]
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && ROLES.includes(value as Role)
}
