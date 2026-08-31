import Link from "next/link"
import { logoutAction } from "@/app/actions"
import { MainNav } from "@/components/main-nav"
import { requireSessionUser } from "@/server/auth/current-session"

/**
 * Moldura das telas autenticadas.
 *
 * O grupo `(app)` não aparece na URL: as rotas continuam sendo /dashboard,
 * /assets, /alerts e /account, como descrito no CLAUDE.md. Ele existe só para
 * que a checagem de sessão e a barra superior morem num lugar só — repetir a
 * verificação em cada página seria uma chance de esquecer numa delas.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireSessionUser()

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Duas linhas no celular, uma no desktop. Numa linha só, a navegação
          empurrava "Conta" e o botão de sair para fora da tela — e sair da
          conta não pode depender da largura do aparelho. */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 px-5 py-2.5 sm:h-14 sm:flex-nowrap sm:py-0 sm:px-8">
          <Link
            href="/dashboard"
            className="font-display text-[0.9375rem] font-bold tracking-[0.16em] uppercase [font-stretch:125%]"
          >
            Radar<span className="text-muted-foreground">Invest</span>
          </Link>

          <div className="order-last -mx-5 w-[calc(100%+2.5rem)] overflow-x-auto px-5 sm:order-none sm:mx-0 sm:w-auto sm:overflow-visible sm:px-0">
            <MainNav />
          </div>

          <div className="ml-auto flex items-center gap-3">
            {/* `nowrap` e só a partir de `md`: entre 640 e 768 a navegação já
                ocupa a linha, e o nome quebrava em duas. */}
            <span className="hidden max-w-40 truncate whitespace-nowrap text-sm text-muted-foreground md:inline">
              {user.name}
            </span>
            {user.role === "ADMIN" ? (
              <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[0.625rem] tracking-widest text-muted-foreground uppercase">
                admin
              </span>
            ) : null}
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/30 focus-visible:outline-none"
              >
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-9 sm:px-8 sm:py-12">
        {children}
      </main>
    </div>
  )
}
