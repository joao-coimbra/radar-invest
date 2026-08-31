import Link from "next/link"

/**
 * Moldura das telas de credencial.
 *
 * O painel da esquerda não é ilustração: é o próprio artefato do produto, uma
 * fila de prioridade em miniatura. Quem chega no login vê, antes de digitar
 * qualquer coisa, exatamente o que vai receber depois de entrar.
 */

const SAMPLE = [
  { rank: "01", ticker: "PETR4", change: "−4,17%", level: "rompeu", rule: "critical" },
  { rank: "02", ticker: "VALE3", change: "−2,40%", level: "atenção", rule: "watch" },
  { rank: "03", ticker: "ITUB4", change: "+0,84%", level: "normal", rule: "normal" },
] as const

const RULE: Record<string, string> = {
  critical: "rule-critical",
  watch: "rule-watch",
  normal: "rule-normal",
}

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-foreground p-10 text-background lg:flex xl:p-14">
        <Link
          href="/"
          className="font-display text-[1.35rem] font-bold tracking-[0.16em] uppercase [font-stretch:125%]"
        >
          Radar<span className="opacity-55">Invest</span>
        </Link>

        <div className="max-w-md">
          <p className="text-[1.75rem] leading-[1.28] font-medium text-balance xl:text-[2.05rem]">
            As cotações já existem. A pergunta que ninguém responde é qual ativo
            precisa de você agora.
          </p>

          <div
            aria-hidden
            className="mt-10 rounded-lg border border-background/12 bg-background/6 p-1.5"
          >
            {SAMPLE.map((item) => (
              <div
                key={item.ticker}
                className={`${RULE[item.rule]} flex items-baseline gap-3 rounded-[3px] px-3.5 py-2.5 font-mono text-[0.8125rem]`}
              >
                <span className="tabular opacity-40">{item.rank}</span>
                <span className="font-medium tracking-wide">{item.ticker}</span>
                <span className="tabular ml-auto">{item.change}</span>
                <span className="w-16 text-right text-[0.6875rem] tracking-wider uppercase opacity-55">
                  {item.level}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-background/45">
            Exemplo. Sua carteira aparece aqui depois de entrar.
          </p>
        </div>

        <p className="max-w-md text-[0.8125rem] leading-relaxed text-background/50">
          Cotações da B3 pela brapi.dev, indicadores macroeconômicos pela
          BrasilAPI, histórico no Airtable.
        </p>
      </aside>

      <main className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          <Link
            href="/"
            className="mb-9 inline-block font-display text-lg font-bold tracking-[0.16em] uppercase [font-stretch:125%] lg:hidden"
          >
            Radar<span className="text-muted-foreground">Invest</span>
          </Link>
          {children}
        </div>
      </main>
    </div>
  )
}
