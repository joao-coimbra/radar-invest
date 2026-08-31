import Link from "next/link"
import { redirect } from "next/navigation"
import { getSessionUser } from "@/server/auth/current-session"
import { RegisterForm } from "./register-form"

export const dynamic = "force-dynamic"

export const metadata = { title: "Criar conta — RadarInvest" }

export default async function RegisterPage() {
  if (await getSessionUser()) {
    redirect("/dashboard")
  }

  return (
    <>
      <h1 className="font-display text-2xl font-bold tracking-tight [font-stretch:110%]">
        Criar conta
      </h1>
      <p className="mt-1.5 mb-8 text-sm text-muted-foreground">
        Contas novas entram como assessor.
      </p>

      <RegisterForm />

      <p className="mt-7 text-sm text-muted-foreground">
        Já tem conta?{" "}
        <Link
          href="/login"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Entrar
        </Link>
      </p>
    </>
  )
}
