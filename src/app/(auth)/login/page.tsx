import Link from "next/link"
import { redirect } from "next/navigation"
import { getSessionUser } from "@/server/auth/current-session"
import { LoginForm } from "./login-form"

export const dynamic = "force-dynamic"

export const metadata = { title: "Entrar — RadarInvest" }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ eliminado?: string }>
}) {
  if (await getSessionUser()) {
    redirect("/dashboard")
  }

  const { eliminado } = await searchParams

  return (
    <>
      <h1 className="font-display text-2xl font-bold tracking-tight [font-stretch:110%]">
        Entrar
      </h1>
      <p className="mt-1.5 mb-8 text-sm text-muted-foreground">
        Acesse o painel da sua carteira monitorada.
      </p>

      <LoginForm eliminado={eliminado === "1"} />

      <p className="mt-7 text-sm text-muted-foreground">
        Ainda não tem conta?{" "}
        <Link
          href="/register"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Criar uma agora
        </Link>
      </p>
    </>
  )
}
