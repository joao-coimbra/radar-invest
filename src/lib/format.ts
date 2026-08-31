/**
 * Formatação para leitor brasileiro.
 *
 * Vírgula decimal e ponto de milhar não são preferência estética: um assessor
 * que lê "38.42" como trinta e oito mil erra a ordem de grandeza do próprio
 * cliente.
 */

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
})

const percent = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
})

const timeOnly = new Intl.DateTimeFormat("pt-BR", {
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
})

export function formatMoney(value: number, code = "BRL"): string {
  return code === "BRL"
    ? currency.format(value)
    : new Intl.NumberFormat("pt-BR", { style: "currency", currency: code }).format(
        value
      )
}

/** Sempre com sinal explícito: `+0,84%` diz mais que `0,84%`. */
export function formatPercent(value: number): string {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${percent.format(Math.abs(value))}%`
}

export function formatThreshold(value: number): string {
  return `${percent.format(value)}%`
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) {
    return "—"
  }

  const parsed = Date.parse(iso)

  return Number.isNaN(parsed) ? "—" : dateTime.format(parsed)
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) {
    return "—"
  }

  const parsed = Date.parse(iso)

  return Number.isNaN(parsed) ? "—" : timeOnly.format(parsed)
}

/** "1 ativo" / "3 ativos" — plural correto sem gambiarra no JSX. */
export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

const SPELLED = [
  "Nenhum",
  "Um",
  "Dois",
  "Três",
  "Quatro",
  "Cinco",
  "Seis",
  "Sete",
  "Oito",
  "Nove",
]

/** Números pequenos por extenso, para a manchete do painel soar como frase. */
export function spell(count: number): string {
  return SPELLED[count] ?? String(count)
}
