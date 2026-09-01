/**
 * Gera o PDF da parte teórica a partir de docs/parte-teorica.html.
 *
 *   node scripts/build-pdf.mjs
 *
 * A geração acontece em duas passagens. A primeira produz um PDF de trabalho e
 * descobre em que página cada seção começou; a segunda regenera o documento com
 * o sumário preenchido com esses números. Sumário com página errada é pior que
 * sumário nenhum, e manter os números à mão quebra no primeiro parágrafo novo.
 *
 * A NBR 14724 pede que as folhas pré-textuais sejam contadas mas não numeradas.
 * O Chromium não executa scripts dentro do template de cabeçalho, então não há
 * como suprimir o número condicionalmente ali. A saída é renderizar duas
 * versões, uma com cabeçalho e outra sem, e montar o documento final tomando as
 * folhas pré-textuais da versão sem numeração.
 *
 * Roda sob Node pelo mesmo motivo do script de capturas: o Playwright conversa
 * com o navegador por `--remote-debugging-pipe`, e essa conexão não se
 * estabelece sob Bun no Windows.
 */
import { execFileSync } from "node:child_process"
import { readFileSync, unlinkSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { PDFDocument } from "pdf-lib"
import { chromium } from "playwright"

const SOURCE = resolve("docs/parte-teorica.html")
const OUTPUT = resolve("docs/RadarInvest-parte-teorica.pdf")
const TEMP_NUMERADO = resolve("docs/.numerado.pdf")
const TEMP_LIMPO = resolve("docs/.limpo.pdf")
const TEMP_TEXTO = resolve("docs/.passagem.txt")

/** Título da primeira seção textual. É a partir dela que a numeração aparece. */
const PRIMEIRA_SECAO = "1 INTRODUÇÃO"

const headerTemplate = `
  <div style="width:100%;font-family:Arial,sans-serif;font-size:10pt;color:#000;padding:0 2cm 0 3cm;text-align:right;">
    <span class="pageNumber"></span>
  </div>
`

async function render(html, path, { comCabecalho }) {
  const browser = await chromium.launch()
  const page = await browser.newPage()

  // Carregar o arquivo antes de trocar o conteúdo preserva a base das imagens.
  await page.goto(pathToFileURL(SOURCE).href, { waitUntil: "networkidle" })
  await page.setContent(html, { waitUntil: "networkidle" })
  await page.evaluate(() => {
    const base = document.createElement("base")
    base.href = "."
    document.head.prepend(base)
  })
  await page.waitForTimeout(500)

  await page.pdf({
    path,
    format: "A4",
    printBackground: true,
    displayHeaderFooter: comCabecalho,
    margin: { top: "2cm", right: "2cm", bottom: "2cm", left: "3cm" },
    ...(comCabecalho
      ? { headerTemplate, footerTemplate: "<div></div>" }
      : {}),
  })

  await browser.close()
}

/** Normaliza para comparar sem depender de acento nem de caixa. */
const chave = (texto) =>
  texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()

/** Cada página vira a lista de suas linhas, normalizadas. */
function paginasDe(pdf) {
  execFileSync("pdftotext", ["-layout", "-enc", "UTF-8", pdf, TEMP_TEXTO])

  return readFileSync(TEMP_TEXTO, "utf8")
    .split("\f")
    .map((pagina) => pagina.split("\n").map(chave).filter(Boolean))
}

const original = readFileSync(SOURCE, "utf8")

// ------------------------------------------------------------- passagem 1
console.log("  passagem 1: descobrindo as páginas")
await render(original, TEMP_NUMERADO, { comCabecalho: true })

const paginas = paginasDe(TEMP_NUMERADO)

/**
 * Procura a página em que um título aparece como título.
 *
 * A comparação exige que a linha inteira seja igual ao título. É isso que
 * separa o cabeçalho de seção da entrada correspondente no sumário, onde a
 * mesma linha termina com o número da página. Filtrar por "a partir da página
 * N" não bastava: o sumário passou a ocupar duas folhas, e as últimas entradas
 * acabavam apontando para a própria folha do sumário.
 */
function paginaDe(titulo) {
  const alvo = chave(titulo)

  for (let i = 0; i < paginas.length; i++) {
    if (paginas[i].some((linha) => linha === alvo)) {
      return i + 1
    }
  }

  return null
}

const primeiraNumerada = paginaDe(PRIMEIRA_SECAO)

if (!primeiraNumerada) {
  console.error(`Não encontrei "${PRIMEIRA_SECAO}" no documento.`)
  process.exit(1)
}

let html = original
let resolvidos = 0
let faltando = 0

html = html.replace(
  /(<li[^>]*>\s*<span class="num">([^<]*)<\/span><span class="txt">([^<]+)<\/span><span class="pontos"><\/span><span>)(\d+)(<\/span>)/g,
  (match, prefixo, numero, texto, _antigo, sufixo) => {
    const busca = numero.trim() ? `${numero.trim()} ${texto}` : texto
    const pagina = paginaDe(busca) ?? paginaDe(texto)

    if (pagina) {
      resolvidos++
      return `${prefixo}${pagina}${sufixo}`
    }

    faltando++
    console.warn(`  não localizei no PDF: ${texto}`)
    return match
  }
)

// ------------------------------------------------------------- passagem 2
console.log("  passagem 2: gerando as duas versões")
await render(html, TEMP_NUMERADO, { comCabecalho: true })
await render(html, TEMP_LIMPO, { comCabecalho: false })

// ------------------------------------------------------------- montagem
const numerado = await PDFDocument.load(readFileSync(TEMP_NUMERADO))
const limpo = await PDFDocument.load(readFileSync(TEMP_LIMPO))
const final = await PDFDocument.create()

const total = numerado.getPageCount()
const preTextuais = primeiraNumerada - 1

// Folhas pré-textuais sem número, textuais com número.
const daVersaoLimpa = await final.copyPages(
  limpo,
  Array.from({ length: preTextuais }, (_, i) => i)
)
const daVersaoNumerada = await final.copyPages(
  numerado,
  Array.from({ length: total - preTextuais }, (_, i) => i + preTextuais)
)

for (const page of [...daVersaoLimpa, ...daVersaoNumerada]) {
  final.addPage(page)
}

final.setTitle("RadarInvest: central inteligente de monitoramento de mercado")
final.setAuthor("João Henrique Benatti Coimbra")
final.setSubject("Integração de APIs")
final.setLanguage("pt-BR")

writeFileSync(OUTPUT, await final.save())

for (const temp of [TEMP_NUMERADO, TEMP_LIMPO, TEMP_TEXTO]) {
  unlinkSync(temp)
}

console.log(
  `\n  ${resolvidos} entrada(s) do sumário numeradas${faltando ? `, ${faltando} sem correspondência` : ""}`
)
console.log(`  ${preTextuais} folha(s) pré-textual(is) sem numeração`)
console.log(`  ${total} páginas no total`)
console.log(`\nPDF gerado: ${OUTPUT}`)
