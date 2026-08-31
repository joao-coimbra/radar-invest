import { randomUUID } from "node:crypto"
import { airtable } from "@/server/integrations/airtable"
import { fetchQuotes } from "@/server/integrations/brapi"
import { fetchIndicators } from "@/server/integrations/brasilapi"
import { cache } from "@/server/lib/cache"
import { env } from "@/server/lib/env"
import { AppError } from "@/server/lib/errors"
import {
  type AlertState,
  assetsRepository,
} from "@/server/repositories/assets.repository"
import {
  type CreateAlertInput,
  alertsRepository,
} from "@/server/repositories/alerts.repository"
import { quotesRepository } from "@/server/repositories/quotes.repository"
import { thresholdBreached } from "./market.service"

/**
 * O ciclo de coleta, tratamento, persistência e alerta.
 *
 * É a automação exigida pelo trabalho: roda por agendador ou por disparo
 * manual de um ADMIN, e é onde as quatro regras do `CLAUDE.md` viram código.
 */

export interface SyncRunResult {
  id: string
  startedAt: string
  finishedAt: string
  assetsProcessed: number
  recordsPersisted: number
  alertsGenerated: number
  externalCalls: number
  upstreamFailures: number
  /** Fora do pregão o ciclo encerra sem tocar em nenhuma API externa. */
  skippedReason?: string
}

/**
 * O pregão da B3 roda em dia útil, no horário de Brasília.
 *
 * A checagem usa `Intl` com fuso explícito em vez de aritmética sobre UTC: o
 * horário de verão brasileiro acabou, mas a regra pode voltar, e o servidor
 * roda em UTC na Vercel. Deixar o fuso implícito é como esse tipo de bug
 * nasce.
 */
export function isMarketOpen(now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(now)

  const weekday = parts.find((part) => part.type === "weekday")?.value
  const hour = Number(parts.find((part) => part.type === "hour")?.value)

  if (weekday === "Sat" || weekday === "Sun") {
    return false
  }

  return hour >= env.MARKET_OPEN_HOUR && hour < env.MARKET_CLOSE_HOUR
}

/** Teto do Discord para `content`; o Slack aceita bem mais. */
const MAX_MESSAGE_LENGTH = 1800

/**
 * Monta o resumo legível por humano.
 *
 * Quem recebe o alerta está no celular, fora do sistema. Precisa saber o que
 * aconteceu sem abrir nada — por isso o texto traz ticker, direção, variação
 * e o limite que foi rompido, e não um "você tem 2 novos alertas".
 */
function summarize(alerts: CreateAlertInput[]): string {
  const header =
    alerts.length === 1
      ? "RadarInvest — 1 ativo rompeu o limite"
      : `RadarInvest — ${alerts.length} ativos romperam o limite`

  const lines = alerts.map((alert) => {
    const direction = alert.direction === "UP" ? "subiu" : "caiu"
    const change = Math.abs(alert.changePercent).toFixed(2).replace(".", ",")
    const threshold = alert.configuredThreshold.toFixed(2).replace(".", ",")

    return `• ${alert.ticker} ${direction} ${change}% (limite ${threshold}%)`
  })

  return [header, ...lines].join("\n").slice(0, MAX_MESSAGE_LENGTH)
}

/**
 * Notifica o canal externo. Falha aqui não derruba o ciclo.
 *
 * O alerta já está gravado e já aparece no painel quando esta função é
 * chamada; o webhook é o canal, não o alerta. Deixar a sincronização inteira
 * falhar porque um endpoint de terceiro caiu perderia as cotações coletadas.
 *
 * O corpo carrega três representações do mesmo evento, de propósito: `content`
 * é o campo que o Discord renderiza, `text` é o do Slack, e `alerts` é o dado
 * estruturado para qualquer consumidor programático. Assim o mesmo endpoint
 * serve aos três sem o servidor precisar saber para onde está mandando —
 * detectar o destino pela URL seria adivinhação que quebra no primeiro
 * self-hosted.
 */
async function notify(
  alerts: CreateAlertInput[]
): Promise<{ attempted: boolean; delivered: boolean }> {
  // Sem webhook configurado nada é enviado, e `notified` precisa refletir
  // isso. Marcar como notificado um alerta que não saiu de lugar nenhum
  // colocaria uma afirmação falsa no banco — e é justamente essa coluna que
  // alguém consultaria para saber por que o cliente não foi avisado.
  if (!env.ALERTS_WEBHOOK_URL || alerts.length === 0) {
    return { attempted: false, delivered: false }
  }

  try {
    const response = await fetch(env.ALERTS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: summarize(alerts),
        text: summarize(alerts),
        source: "radar-invest",
        generatedAt: new Date().toISOString(),
        alerts,
      }),
      signal: AbortSignal.timeout(5000),
    })

    if (!response.ok) {
      // O corpo da resposta diz o que o canal recusou — sem ele, um webhook
      // mal configurado vira só "não entregou".
      const body = await response.text().catch(() => "")
      console.error(
        `[radar-invest] webhook recusou o alerta: HTTP ${response.status} ${body.slice(0, 200)}`
      )
    }

    return { attempted: true, delivered: response.ok }
  } catch (error) {
    console.error("[radar-invest] webhook de alerta falhou:", error)
    return { attempted: true, delivered: false }
  }
}

export async function runSync(): Promise<SyncRunResult> {
  const id = randomUUID()
  const startedAt = new Date().toISOString()
  const cacheBefore = cache.stats().hits
  const callsBefore = airtable.stats().calls

  const finish = (
    partial: Partial<SyncRunResult> & { assetsProcessed: number }
  ): SyncRunResult => ({
    id,
    startedAt,
    finishedAt: new Date().toISOString(),
    recordsPersisted: 0,
    alertsGenerated: 0,
    externalCalls: airtable.stats().calls - callsBefore,
    upstreamFailures: 0,
    ...partial,
  })

  // Regra 1: fora do pregão, encerre sem chamar nenhuma API externa. Cotação
  // com o mercado fechado é a mesma da última coleta — pagar por ela é
  // desperdício de cota e de energia.
  if (!isMarketOpen()) {
    return finish({
      assetsProcessed: 0,
      skippedReason: "Fora do horário de pregão da B3.",
    })
  }

  const assets = await assetsRepository.listMonitored()

  if (assets.length === 0) {
    return finish({ assetsProcessed: 0, skippedReason: "Nenhum ativo monitorado." })
  }

  // Regra 2: todos os tickers numa única chamada. Doze ativos = uma requisição.
  const tickers = [...new Set(assets.map((asset) => asset.ticker))]

  let upstreamFailures = 0
  let externalCalls = 0

  const quotesResult = await fetchQuotes(tickers).catch((error: unknown) => {
    if (error instanceof AppError) {
      upstreamFailures++
      console.error(`[radar-invest] cotações falharam: ${error.code}`)
      return null
    }
    throw error
  })

  // Indicadores são complemento: sem eles o ciclo ainda coleta e alerta.
  const indicatorsResult = await fetchIndicators().catch(() => {
    upstreamFailures++
    return null
  })

  externalCalls +=
    (quotesResult?.externalCalls ?? 0) + (indicatorsResult?.externalCalls ?? 0)

  if (!quotesResult) {
    return finish({
      assetsProcessed: assets.length,
      externalCalls: externalCalls + (airtable.stats().calls - callsBefore),
      upstreamFailures,
      skippedReason: "A API de cotações não respondeu.",
    })
  }

  const quoteByTicker = new Map(
    quotesResult.quotes.map((quote) => [quote.ticker, quote])
  )

  const newAlerts: CreateAlertInput[] = []
  const stateChanges: { id: string; alertState: AlertState }[] = []

  for (const asset of assets) {
    const quote = quoteByTicker.get(asset.ticker)

    if (!quote) {
      continue
    }

    const breached = thresholdBreached(
      quote.changePercent,
      asset.alertThresholdPercent
    )
    const nextState: AlertState = breached ? "BREACHED" : "NORMAL"

    if (nextState === asset.alertState) {
      continue
    }

    stateChanges.push({ id: asset.id, alertState: nextState })

    // Regra 3: alerte na **transição**, nunca no estado. Se o ativo já estava
    // BREACHED, o limite continua rompido mas isso não é notícia nova — só o
    // estado é atualizado. Sem esta condição o mesmo ativo alertaria a cada
    // ciclo e o assessor silenciaria o canal, perdendo também os alertas que
    // importam.
    if (nextState === "BREACHED") {
      newAlerts.push({
        ticker: asset.ticker,
        ownerId: asset.ownerId,
        direction: quote.changePercent >= 0 ? "UP" : "DOWN",
        changePercent: quote.changePercent,
        configuredThreshold: asset.alertThresholdPercent,
        notified: false,
      })
    }
  }

  const lastPrices = await quotesRepository.latestByTicker(tickers)
  const persisted = await quotesRepository.persistChanged(
    quotesResult.quotes,
    lastPrices
  )

  await assetsRepository.updateAlertStates(stateChanges)

  const notification = await notify(newAlerts)

  // Só conta como falha se houve tentativa. Webhook não configurado é
  // configuração ausente, não indisponibilidade de terceiro.
  if (notification.attempted && !notification.delivered) {
    upstreamFailures++
  }

  await alertsRepository.createMany(
    newAlerts.map((alert) => ({ ...alert, notified: notification.delivered }))
  )

  // Regra 4: registre chamadas feitas e evitadas por cache.
  console.info(
    `[radar-invest] ciclo ${id}: ${assets.length} ativos, ` +
      `${externalCalls} chamadas externas, ` +
      `${cache.stats().hits - cacheBefore} evitadas por cache, ` +
      `${persisted.skipped} cotações inalteradas não gravadas`
  )

  return finish({
    assetsProcessed: assets.length,
    recordsPersisted: persisted.persisted,
    alertsGenerated: newAlerts.length,
    externalCalls: externalCalls + (airtable.stats().calls - callsBefore),
    upstreamFailures,
  })
}
