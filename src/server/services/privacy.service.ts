import { ForbiddenError, NotFoundError } from "@/server/lib/errors"
import { alertsRepository } from "@/server/repositories/alerts.repository"
import { assetsRepository } from "@/server/repositories/assets.repository"
import { sessionsRepository } from "@/server/repositories/sessions.repository"
import { usersRepository } from "@/server/repositories/users.repository"

/**
 * Direitos do titular previstos na LGPD.
 *
 * Um direito só existe de fato quando vira funcionalidade. Política de
 * privacidade que promete portabilidade sem endpoint que a execute é texto,
 * não garantia.
 */

/**
 * Só o próprio titular exerce estes direitos.
 *
 * O escopo `users.manage` autoriza a operação; esta checagem confirma a posse.
 * Sem ela, qualquer conta autenticada poderia exportar ou apagar os dados de
 * outra — token válido prova identidade, nunca propriedade.
 */
function assertSelf(authenticatedId: string, targetId: string): void {
  if (authenticatedId !== targetId) {
    throw new ForbiddenError(
      "Você só pode acessar os dados do próprio titular."
    )
  }
}

/**
 * Portabilidade — Art. 18, V.
 *
 * Devolve tudo o que a aplicação armazena sobre o titular, **sem máscara**:
 * aqui o destinatário é o próprio dono do dado, e mascarar o e-mail dele para
 * ele mesmo esvaziaria o direito.
 *
 * O `passwordHash` fica de fora. Não é dado pessoal do titular no sentido
 * útil, e exportá-lo só criaria uma cópia de credencial circulando.
 */
export async function exportUserData(
  authenticatedId: string,
  targetId: string
) {
  assertSelf(authenticatedId, targetId)

  const user = await usersRepository.findById(targetId)

  if (!user) {
    throw new NotFoundError("Titular não encontrado.")
  }

  const [assets, alerts] = await Promise.all([
    assetsRepository.listByOwner(targetId),
    alertsRepository.listByOwner(targetId),
  ])

  return {
    subject: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      consent: {
        accepted: user.consentAccepted,
        termsVersion: user.consentTermsVersion,
        recordedAt: user.consentRecordedAt,
      },
    },
    assets: assets.map((asset) => ({
      ticker: asset.ticker,
      type: asset.type,
      alertThresholdPercent: asset.alertThresholdPercent,
      ownerEmail: asset.ownerEmail,
      status: asset.status,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
    })),
    alerts: alerts.map((alert) => ({
      id: alert.id,
      ticker: alert.ticker,
      direction: alert.direction,
      changePercent: alert.changePercent,
      configuredThreshold: alert.configuredThreshold,
      notified: alert.notified,
      createdAt: alert.createdAt,
    })),
    generatedAt: new Date().toISOString(),
  }
}

/**
 * Eliminação — Art. 18, VI.
 *
 * A ordem importa. As sessões caem primeiro para que nenhuma credencial
 * sobreviva ao registro que ela autenticava; a conta cai por último, para que
 * uma falha no meio não deixe ativos órfãos apontando para um `ownerId` que
 * não existe mais.
 */
export async function eraseUserData(
  authenticatedId: string,
  targetId: string
): Promise<{ assets: number; alerts: number; sessions: number }> {
  assertSelf(authenticatedId, targetId)

  const user = await usersRepository.findById(targetId)

  if (!user) {
    throw new NotFoundError("Titular não encontrado.")
  }

  const sessions = await sessionsRepository.removeByUserId(targetId)
  const alerts = await alertsRepository.removeByOwner(targetId)
  const assets = await assetsRepository.removeByOwner(targetId)

  await usersRepository.remove(targetId)

  return { assets, alerts, sessions }
}
