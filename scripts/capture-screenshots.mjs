/**
 * Captura as telas usadas no README.
 *
 *   node scripts/capture-screenshots.mjs
 *
 * Sobe uma conta de demonstração, cadastra três ativos com limites diferentes
 * — para as três faixas de atenção aparecerem — dispara um ciclo, fotografa e
 * apaga a conta no fim, pela própria tela de eliminação. Os prints saem sempre
 * com o mesmo roteiro, e nenhuma conta real vai parar na documentação.
 *
 * Roda sob Node, não Bun: o Playwright conversa com o navegador por
 * `--remote-debugging-pipe`, e essa conexão não se estabelece sob Bun no
 * Windows — o processo sobe e o launch estoura o timeout.
 *
 * Precisa do servidor rodando com a janela de pregão aberta, senão o ciclo
 * encerra sem gerar alerta:
 *   MARKET_OPEN_HOUR=0 MARKET_CLOSE_HOUR=24 bun run dev
 */
import { mkdirSync, readFileSync } from "node:fs"
import { chromium } from "playwright"

const BASE = process.env.CAPTURE_BASE_URL ?? "http://localhost:3000"
const OUT = "docs/images"

const DEMO = {
  name: "Ana Ribeiro",
  email: "ana.ribeiro@escritorio.com.br",
  password: "carteira-monitorada-2026",
}

/** Limites escolhidos para render as três faixas: rompeu, atenção e normal. */
const ASSETS = [
  { ticker: "PETR4", threshold: "1" },
  { ticker: "VALE3", threshold: "1.5" },
  { ticker: "ITUB4", threshold: "5" },
]

function cronSecret() {
  const line = readFileSync(".env.local", "utf8")
    .split("\n")
    .find((l) => l.startsWith("CRON_SECRET="))

  return line?.slice("CRON_SECRET=".length).trim() ?? ""
}

mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  locale: "pt-BR",
})

const shot = async (name, fullPage = false) => {
  // O botão de ferramentas do `next dev` fica fixo no canto e apareceria em
  // toda foto. Ele não faz parte da aplicação.
  await page.addStyleTag({
    content: "nextjs-portal, [data-nextjs-dev-tools-button] { display: none !important }",
  })
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage })
  console.log(`  ${name}.png`)
}

// Telas públicas primeiro, antes de existir sessão.
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" })
await shot("01-login")

await page.goto(`${BASE}/register`, { waitUntil: "networkidle" })
await page.fill("#name", DEMO.name)
await page.fill("#email", DEMO.email)
await page.fill("#password", DEMO.password)
await page.check("#consent")
await shot("02-cadastro")

await page.click('button[type="submit"]')
await page.waitForURL("**/dashboard", { timeout: 60_000 })
await shot("03-painel-vazio")

// Carteira. `networkidle` não basta: em desenvolvimento o Turbopack compila a
// rota na primeira visita, e a página do servidor ainda espera o Airtable.
// Esperar pelo campo é a condição real de "pronto".
await page.goto(`${BASE}/assets`, { waitUntil: "domcontentloaded" })
await page.waitForSelector("#ticker", { timeout: 120_000 })

for (const asset of ASSETS) {
  await page.fill("#ticker", asset.ticker)
  await page.fill("#alertThresholdPercent", asset.threshold)
  // Pelo texto, não por `form button[type=submit]`: o botão "Sair" do
  // cabeçalho também é o submit de um form, e vem antes no DOM.
  await page.click('button:has-text("Monitorar ativo")')
  // Espera a confirmação do servidor, e não o campo esvaziar: o formulário é
  // não controlado, e o React nem sempre o limpa depois da Server Action.
  await page
    .getByText(`${asset.ticker} entrou no monitoramento`)
    .waitFor({ timeout: 90_000 })
  await page.waitForTimeout(800)
}

await shot("05-ativos", true)

// Um ciclo pelo endpoint, autenticado como o agendador — é o mesmo caminho
// que o GitHub Actions percorre.
const sync = await fetch(`${BASE}/api/v1/sync-runs`, {
  method: "POST",
  headers: { "x-cron-secret": cronSecret() },
})

const result = await sync.json()
console.log(`  ciclo: ${result.message} (${result.data?.alertsGenerated ?? 0} alerta(s))`)

await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" })
await shot("04-painel")

await page.goto(`${BASE}/alerts`, { waitUntil: "networkidle" })
await shot("06-alertas")

await page.goto(`${BASE}/account`, { waitUntil: "networkidle" })
await shot("07-conta", true)

// Documentação viva. O Scalar monta a página no cliente, então precisa de mais
// tempo que `networkidle` garante.
await page.goto(`${BASE}/api/docs`, { waitUntil: "networkidle" })
await page.waitForTimeout(4000)
await shot("08-documentacao")

// Painel no celular: a régua de atenção precisa sobreviver à largura.
await page.setViewportSize({ width: 390, height: 844 })
await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" })
await shot("09-painel-mobile")

// Limpeza pela própria tela de eliminação — de quebra, exercita o Art. 18, VI.
await page.setViewportSize({ width: 1440, height: 900 })
await page.goto(`${BASE}/account`, { waitUntil: "networkidle" })
await page.fill("#confirm", "ELIMINAR")
await page.click('button:has-text("Eliminar minha conta")')
await page.waitForURL("**/login**", { timeout: 60_000 })
console.log("\nconta de demonstração eliminada pela própria interface")

await browser.close()
