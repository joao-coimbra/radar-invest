import Link from "next/link"
import { AttentionRow } from "@/components/attention-row"
import { buttonVariants } from "@/components/ui/button"
import { formatTime, plural, spell } from "@/lib/format"
import { cn } from "@/lib/utils"
import { requireSessionUser } from "@/server/auth/current-session"
import { AppError } from "@/server/lib/errors"
import {
  getMarketOverview,
  type MarketOverview,
} from "@/server/services/market.service"
import { SyncButton } from "./sync-button"

export const dynamic = "force-dynamic"

export const metadata = { title: "Painel — RadarInvest" }

/**
 * A manchete é a resposta, não um número.
 *
 * O painel existe para responder "quais dos meus ativos precisam de atenção
 * agora". Abrir com um contador grande e um rótulo pequeno faria o assessor
 * ter que traduzir o número de volta para a pergunta. A frase já é a tradução.
 */
function headline(overview: MarketOverview): string {
  const { totalCritical, totalMonitored } = overview.summary

  if (totalMonitored === 0) {
    return "Nenhum ativo monitorado ainda."
  }

  if (totalCritical === 0) {
    return "Nenhum ativo rompeu o limite configurado."
  }

  return totalCritical === 1
    ? "Um ativo pede atenção agora."
    : `${spell(totalCritical)} ativos pedem atenção agora.`
}

export default async function DashboardPage() {
  const user = await requireSessionUser()

  let overview: MarketOverview | null = null
  let failure: string | null = null

  try {
    overview = await getMarketOverview(user.id)
  } catch (error) {
    // A falha de uma API externa não pode derrubar a página inteira. O
    // assessor precisa saber o que não carregou e por quê, e continuar
    // navegando para as outras telas.
    failure =
      error instanceof AppError
        ? error.message
        : "Não foi possível montar o panorama agora."
  }

  return (
    <div className="grid gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[0.6875rem] tracking-[0.18em] text-muted-foreground uppercase">
            Painel · {user.name.split(" ")[0]}
          </p>
          <h1 className="mt-2 max-w-xl font-display text-[1.75rem] leading-tight font-bold tracking-tight text-balance [font-stretch:105%] sm:text-[2rem]">
            {overview ? headline(overview) : "Panorama indisponível."}
          </h1>
        </div>

        {overview ? (
          <p className="tabular font-mono text-xs text-muted-foreground">
            {formatTime(overview.generatedAt)} · horário de Brasília
          </p>
        ) : null}
      </header>

      {failure ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm text-destructive"
        >
          {failure}
        </p>
      ) : null}

      {overview && overview.items.length > 0 ? (
        <ul className="overflow-hidden rounded-lg border border-border bg-card">
          {overview.items.map((item) => (
            <AttentionRow key={item.ticker} item={item} />
          ))}
        </ul>
      ) : null}

      {overview && overview.summary.totalMonitored === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            Cadastre um ativo e defina a variação que você considera relevante.
            O painel passa a acompanhá-lo a cada ciclo.
          </p>
          {/* Link com a aparência de botão, não um Button "renderizado como"
              link: navegar é âncora, e trocar o elemento nativo custaria o
              comportamento de teclado e o menu de contexto que o usuário
              espera de um link. */}
          <Link
            href="/assets"
            className={cn(
              buttonVariants({ variant: "default" }),
              "mt-5 h-10 px-4"
            )}
          >
            Cadastrar primeiro ativo
          </Link>
        </div>
      ) : null}

      {overview && overview.summary.totalMonitored > 0 && overview.items.length === 0 ? (
        <p className="rounded-lg border border-border bg-card px-5 py-8 text-center text-sm text-muted-foreground">
          Os {plural(overview.summary.totalMonitored, "ativo", "ativos")} da sua
          carteira estão cadastrados, mas nenhuma cotação voltou da origem nesta
          consulta.
        </p>
      ) : null}

      {overview ? (
        <footer className="grid gap-5 border-t border-border pt-6 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <h2 className="font-mono text-[0.6875rem] tracking-[0.18em] text-muted-foreground uppercase">
              Indicadores do período
            </h2>
            <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2">
              {overview.indicators.map((indicator) => (
                <div key={indicator.name} className="flex items-baseline gap-2">
                  <dt className="font-mono text-xs tracking-wider text-muted-foreground">
                    {indicator.name}
                  </dt>
                  <dd className="tabular font-mono text-sm font-medium">
                    {indicator.value.toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                    })}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      {indicator.unit}
                    </span>
                  </dd>
                </div>
              ))}
              {overview.indicators.length === 0 ? (
                <span className="text-sm text-muted-foreground">
                  Indicadores indisponíveis nesta consulta.
                </span>
              ) : null}
            </dl>

            {/* Contabilidade honesta do custo da tela. Toda requisição consome
                energia e cota; medir é o que transforma o discurso de
                sustentabilidade em número verificável. */}
            <p className="tabular mt-4 font-mono text-xs text-muted-foreground">
              {overview.summary.externalCalls} chamada(s) externa(s) ·{" "}
              {overview.summary.callsAvoidedByCache} evitada(s) por cache
            </p>
          </div>

          {user.role === "ADMIN" ? <SyncButton /> : null}
        </footer>
      ) : null}
    </div>
  )
}
