import { AssetAlreadyExistsError, NotFoundError } from "@/server/lib/errors"
import { maskEmail } from "@/server/lib/mask"
import {
  type AssetRecord,
  type AssetType,
  assetsRepository,
  type MonitoringStatus,
} from "@/server/repositories/assets.repository"

/** Representação pública do ativo, conforme `components.schemas.Asset`. */
export interface AssetView {
  ticker: string
  type: AssetType
  alertThresholdPercent: number
  ownerId: string
  ownerEmail: string
  status: MonitoringStatus
  createdAt: string
  updatedAt: string | null
}

/**
 * Converte o registro em resposta.
 *
 * O e-mail sai mascarado. O assessor precisa saber de quem é o ativo, e para
 * isso a primeira letra e o domínio bastam — o endereço inteiro seria dado
 * além da finalidade.
 */
function toView(asset: AssetRecord): AssetView {
  return {
    ticker: asset.ticker,
    type: asset.type,
    alertThresholdPercent: asset.alertThresholdPercent,
    ownerId: asset.ownerId,
    ownerEmail: maskEmail(asset.ownerEmail),
    status: asset.status,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
  }
}

export async function listAssets(
  ownerId: string,
  filters: { status?: MonitoringStatus; type?: AssetType } = {}
): Promise<AssetView[]> {
  const assets = await assetsRepository.listByOwner(ownerId, filters)

  return assets.map(toView)
}

/**
 * Consulta um ativo da carteira de quem pediu.
 *
 * A busca já filtra por `ownerId`, então ativo de outro dono é indistinguível
 * de ativo inexistente — e ambos devolvem 404. Devolver 403 aqui confirmaria
 * que o ticker existe na carteira de alguém, que é informação que o
 * solicitante não deveria conseguir extrair.
 */
export async function getAsset(
  ownerId: string,
  ticker: string
): Promise<AssetView> {
  const asset = await assetsRepository.findByOwnerAndTicker(ownerId, ticker)

  if (!asset) {
    throw new NotFoundError("Ativo não encontrado na sua carteira.")
  }

  return toView(asset)
}

export interface CreateAssetCommand {
  ticker: string
  type: AssetType
  alertThresholdPercent: number
  ownerEmail: string
  status?: MonitoringStatus
  consent: { accepted: boolean; termsVersion: string }
}

export async function createAsset(
  ownerId: string,
  input: CreateAssetCommand
): Promise<AssetView> {
  const ticker = input.ticker.toUpperCase()

  const existing = await assetsRepository.findByOwnerAndTicker(ownerId, ticker)

  if (existing) {
    throw new AssetAlreadyExistsError()
  }

  const asset = await assetsRepository.create({
    ticker,
    type: input.type,
    alertThresholdPercent: input.alertThresholdPercent,
    ownerId,
    ownerEmail: input.ownerEmail,
    status: input.status ?? "MONITORING",
    consentTermsVersion: input.consent.termsVersion,
  })

  return toView(asset)
}

export async function deleteAsset(
  ownerId: string,
  ticker: string
): Promise<void> {
  const asset = await assetsRepository.findByOwnerAndTicker(ownerId, ticker)

  if (!asset) {
    throw new NotFoundError("Ativo não encontrado na sua carteira.")
  }

  await assetsRepository.remove(asset.id)
}
