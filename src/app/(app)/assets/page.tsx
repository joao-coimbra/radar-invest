import { deleteAssetAction } from "@/app/actions"
import { formatDateTime, formatThreshold, plural } from "@/lib/format"
import { requireSessionUser } from "@/server/auth/current-session"
import { listAssets } from "@/server/services/assets.service"
import { AssetForm } from "./asset-form"

export const dynamic = "force-dynamic"

export const metadata = { title: "Ativos — RadarInvest" }

const TYPE_LABEL = {
  STOCK: "Ação",
  FII: "Fundo imobiliário",
  INDEX: "Índice",
} as const

const STATUS_LABEL = {
  MONITORING: "monitorando",
  PAUSED: "pausado",
} as const

export default async function AssetsPage() {
  const user = await requireSessionUser()
  const assets = await listAssets(user.id)

  return (
    <div className="grid gap-8">
      <header>
        <p className="font-mono text-[0.6875rem] tracking-[0.18em] text-muted-foreground uppercase">
          Ativos
        </p>
        <h1 className="mt-2 font-display text-[1.75rem] leading-tight font-bold tracking-tight [font-stretch:105%]">
          Carteira monitorada
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          {assets.length === 0
            ? "Nada sendo acompanhado ainda."
            : `${plural(assets.length, "ativo", "ativos")} na sua carteira. Só você enxerga esta lista.`}
        </p>
      </header>

      <AssetForm defaultEmail={user.email} />

      {assets.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[38rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                {["Código", "Tipo", "Limite", "Responsável", "Desde", ""].map(
                  (heading) => (
                    <th
                      key={heading}
                      scope="col"
                      className="px-4 py-3 font-mono text-[0.6875rem] font-normal tracking-[0.14em] text-muted-foreground uppercase"
                    >
                      {heading}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {assets.map((asset) => (
                <tr
                  key={asset.ticker}
                  className="border-b border-border/60 last:border-b-0"
                >
                  <td className="px-4 py-3">
                    <span className="font-mono font-medium tracking-wide">
                      {asset.ticker}
                    </span>
                    <span className="ml-2 font-mono text-[0.625rem] tracking-widest text-muted-foreground uppercase">
                      {STATUS_LABEL[asset.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {TYPE_LABEL[asset.type]}
                  </td>
                  <td className="tabular px-4 py-3 font-mono">
                    {formatThreshold(asset.alertThresholdPercent)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {asset.ownerEmail}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {formatDateTime(asset.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <form action={deleteAssetAction}>
                      <input type="hidden" name="ticker" value={asset.ticker} />
                      <button
                        type="submit"
                        className="rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-destructive focus-visible:ring-[3px] focus-visible:ring-ring/30 focus-visible:outline-none"
                      >
                        Remover
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
