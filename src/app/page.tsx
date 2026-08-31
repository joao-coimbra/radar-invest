import { redirect } from "next/navigation"
import { getSessionUser } from "@/server/auth/current-session"

export const dynamic = "force-dynamic"

/**
 * A raiz não é uma tela: é uma bifurcação.
 *
 * Quem já tem sessão quer o painel; quem não tem precisa entrar. Uma landing
 * no meio do caminho seria um clique a mais para os dois.
 */
export default async function RootPage() {
  redirect((await getSessionUser()) ? "/dashboard" : "/login")
}
