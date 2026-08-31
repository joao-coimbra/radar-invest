import { formatDateTime, formatPercent, formatThreshold, plural } from "@/lib/format"
import { cn } from "@/lib/utils"
import { requireSessionUser } from "@/server/auth/current-session"
import { alertsRepository } from "@/server/repositories/alerts.repository"

export const dynamic = "force-dynamic"

export const metadata = { title: "Alertas — RadarInvest" }

export default async function AlertsPage() {
  const user = await requireSessionUser()
  const alerts = await alertsRepository.listByOwner(user.id)

  return (
    <div className="grid gap-8">
      <header>
        <p className="font-mono text-[0.6875rem] tracking-[0.18em] text-muted-foreground uppercase">
          Alertas
        </p>
        <h1 className="mt-2 font-display text-[1.75rem] leading-tight font-bold tracking-tight [font-stretch:105%]">
          Histórico de rompimentos
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Um alerta nasce quando o ativo <em>passa</em> a romper o limite, não
          enquanto continua rompido. Sem essa distinção o mesmo ativo apareceria
          aqui a cada ciclo e a lista deixaria de significar alguma coisa.
        </p>
      </header>

      {alerts.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
          Nenhum limite foi rompido até agora.
        </p>
      ) : (
        <>
          <p className="tabular font-mono text-xs text-muted-foreground">
            {plural(alerts.length, "alerta", "alertas")}
          </p>

          <ul className="overflow-hidden rounded-lg border border-border bg-card">
            {alerts.map((alert) => {
              const up = alert.direction === "UP"

              return (
                <li
                  key={alert.id}
                  className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5 border-b border-border/60 px-4 py-4 last:border-b-0 sm:px-5"
                >
                  <span className="font-mono text-[0.9375rem] font-medium tracking-wide">
                    {alert.ticker}
                  </span>

                  <span
                    className={cn(
                      "tabular font-mono text-sm font-medium",
                      up ? "text-signal-up" : "text-signal-down"
                    )}
                  >
                    {formatPercent(alert.changePercent)}
                  </span>

                  <span className="tabular text-xs text-muted-foreground">
                    limite {formatThreshold(alert.configuredThreshold)}
                  </span>

                  <span className="ml-auto flex items-baseline gap-3">
                    <span
                      className={cn(
                        "rounded border px-1.5 py-0.5 font-mono text-[0.625rem] tracking-widest uppercase",
                        alert.notified
                          ? "border-border text-muted-foreground"
                          : "border-signal-watch/30 bg-signal-watch/8 text-signal-watch"
                      )}
                      title={
                        alert.notified
                          ? "Enviado ao webhook configurado"
                          : "Nenhum canal de notificação configurado — o alerta só existe aqui"
                      }
                    >
                      {alert.notified ? "notificado" : "só no painel"}
                    </span>
                    <time
                      dateTime={alert.createdAt}
                      className="tabular font-mono text-xs text-muted-foreground"
                    >
                      {formatDateTime(alert.createdAt)}
                    </time>
                  </span>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
