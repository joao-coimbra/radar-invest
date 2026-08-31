import type { Metadata } from "next"
import { Archivo, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google"
import { cn } from "@/lib/utils"
import "./globals.css"

/**
 * Três papéis tipográficos, cada um com uma razão.
 *
 * IBM Plex Sans na interface: foi desenhada para contexto técnico e não é
 * mais um grotesco neutro de produto. IBM Plex Mono em todo dado numérico,
 * ticker e horário — cotação é tabela, e tabela precisa de largura fixa.
 * Archivo, em largura expandida, só no wordmark e nos títulos de página: é o
 * gesto de sinalização, e usar em mais lugares gastaria o efeito.
 */
const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
})

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
})

const display = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-display",
})

export const metadata: Metadata = {
  title: "RadarInvest — central de monitoramento de mercado",
  description:
    "Consolida cotações da B3 e indicadores macroeconômicos, aplica os limites " +
    "configurados pelo assessor e aponta quais ativos precisam de atenção agora.",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={cn(
        "h-full antialiased",
        sans.variable,
        mono.variable,
        display.variable
      )}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  )
}
