import { requireSessionUser } from "@/server/auth/current-session"
import { exportUserData } from "@/server/services/privacy.service"

/**
 * Portabilidade — Art. 18, V — servida como download.
 *
 * Existe além do `GET /api/v1/users/{id}/export` porque os dois consumidores
 * são diferentes: a rota da API é autenticada por Bearer, e o navegador numa
 * navegação de página não tem como anexar esse header. Aqui a identidade vem
 * do cookie de sessão, que é o que o navegador já envia sozinho.
 *
 * O serviço é o mesmo nos dois caminhos, então a regra de posse e a decisão de
 * não exportar o hash da senha valem igual.
 */
export async function GET() {
  const user = await requireSessionUser()
  const data = await exportUserData(user.id, user.id)

  const stamp = new Date().toISOString().slice(0, 10)

  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="radar-invest-dados-${stamp}.json"`,
      // Dado pessoal não fica em cache de proxy nem de navegador.
      "Cache-Control": "no-store",
    },
  })
}
