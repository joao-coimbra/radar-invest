import { cn } from "@/lib/utils"
import { formatMoney, formatPercent, formatThreshold } from "@/lib/format"
import type { OverviewItem } from "@/server/services/market.service"

/**
 * Uma linha da fila de prioridade.
 *
 * Dois eixos de sinal, deliberadamente separados. A **régua à esquerda** e o
 * rótulo codificam o nível de atenção; a **cor do número** codifica a direção,
 * seguindo a convenção que o assessor já lê no home broker — sobe verde, cai
 * vermelho. Se o nível pintasse o número, uma alta de 5% apareceria em
 * vermelho por ser crítica, e a leitura de um segundo iria por água abaixo.
 */

const RULE = {
  CRITICAL: "rule-critical",
  WATCH: "rule-watch",
  NORMAL: "rule-normal",
} as const

const LABEL = {
  CRITICAL: "rompeu",
  WATCH: "atenção",
  NORMAL: "normal",
} as const

const LABEL_TONE = {
  CRITICAL: "text-signal-critical border-signal-critical/30 bg-signal-critical/8",
  WATCH: "text-signal-watch border-signal-watch/30 bg-signal-watch/8",
  NORMAL: "text-muted-foreground border-border bg-muted",
} as const

export function AttentionRow({ item }: { item: OverviewItem }) {
  const up = item.quote.changePercent > 0
  const flat = item.quote.changePercent === 0

  return (
    <li
      className={cn(
        RULE[item.attentionLevel],
        "grid grid-cols-[2rem_1fr_auto] items-baseline gap-x-4 gap-y-1 rounded-md",
        "border-b border-border/60 bg-card px-4 py-4 last:border-b-0 sm:px-5"
      )}
    >
      <span className="tabular font-mono text-sm text-muted-foreground/70">
        {String(item.rank).padStart(2, "0")}
      </span>

      <div className="min-w-0">
        <span className="font-mono text-[0.9375rem] font-medium tracking-wide">
          {item.ticker}
        </span>
        {item.quote.companyName ? (
          <span className="ml-2.5 text-sm text-muted-foreground">
            {item.quote.companyName}
          </span>
        ) : null}
      </div>

      <div className="text-right">
        <span
          className={cn(
            "tabular font-mono text-[0.9375rem] font-medium",
            flat
              ? "text-muted-foreground"
              : up
                ? "text-signal-up"
                : "text-signal-down"
          )}
        >
          {formatPercent(item.quote.changePercent)}
        </span>
      </div>

      <div className="col-start-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span
          className={cn(
            "rounded border px-1.5 py-0.5 font-mono text-[0.625rem] tracking-widest uppercase",
            LABEL_TONE[item.attentionLevel]
          )}
        >
          {LABEL[item.attentionLevel]}
        </span>
        <span className="tabular">
          limite {formatThreshold(item.alertThresholdPercent)}
        </span>
        {item.returnVsCdi !== null ? (
          <span className="tabular">
            vs CDI {formatPercent(item.returnVsCdi)}
          </span>
        ) : null}
        {item.quote.fromCache ? (
          <span title="Servido do cache, sem nova chamada à API de cotações">
            do cache
          </span>
        ) : null}
      </div>

      <div className="col-start-3 row-start-2 text-right">
        <span className="tabular font-mono text-xs text-muted-foreground">
          {formatMoney(item.quote.currentPrice, item.quote.currency)}
        </span>
      </div>
    </li>
  )
}
