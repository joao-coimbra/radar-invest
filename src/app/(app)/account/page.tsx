import { formatDateTime } from "@/lib/format"
import { requireSessionUser } from "@/server/auth/current-session"
import { EraseForm } from "./erase-form"

export const dynamic = "force-dynamic"

export const metadata = { title: "Conta — RadarInvest" }

const ROLE_LABEL = {
  ASSESSOR: "Assessor",
  ADMIN: "Administrador",
} as const

const SCOPES = {
  ASSESSOR: "Cadastrar e consultar ativos, ver mercado e alertas, gerir a própria conta.",
  ADMIN: "Tudo o que um assessor faz, mais disparar a sincronização manualmente.",
} as const

export default async function AccountPage() {
  const user = await requireSessionUser()

  return (
    <div className="grid max-w-2xl gap-10">
      <header>
        <p className="font-mono text-[0.6875rem] tracking-[0.18em] text-muted-foreground uppercase">
          Conta
        </p>
        <h1 className="mt-2 font-display text-[1.75rem] leading-tight font-bold tracking-tight [font-stretch:105%]">
          Seus dados
        </h1>
      </header>

      <section className="rounded-lg border border-border bg-card">
        <dl className="divide-y divide-border/60">
          {[
            ["Nome", user.name],
            ["E-mail", user.email],
            ["Papel", ROLE_LABEL[user.role]],
            ["Permissões", SCOPES[user.role]],
            ["Conta criada em", formatDateTime(user.createdAt)],
            [
              "Consentimento",
              user.consentAccepted
                ? `Aceito na versão ${user.consentTermsVersion}, em ${formatDateTime(user.consentRecordedAt)}`
                : "Não registrado",
            ],
          ].map(([label, value]) => (
            <div
              key={label}
              className="grid gap-1 px-5 py-3.5 sm:grid-cols-[11rem_1fr] sm:gap-4"
            >
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="text-sm">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="grid gap-3">
        <h2 className="font-display text-lg font-bold tracking-tight">
          Levar seus dados embora
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Direito à portabilidade, Art. 18, V da LGPD. Baixa um JSON com tudo o
          que guardamos sobre você: cadastro, consentimento datado, ativos e
          alertas. Aqui o e-mail vai sem máscara, porque quem recebe é você. O
          hash da senha não entra — ele não te diz nada e circular com uma cópia
          dele só cria risco.
        </p>
        <a
          href="/account/export"
          download
          className="inline-flex h-10 w-fit items-center rounded-md border border-border bg-card px-4 text-sm font-medium transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/30 focus-visible:outline-none"
        >
          Baixar meus dados
        </a>
      </section>

      <section className="grid gap-3 rounded-lg border border-destructive/25 bg-destructive/4 p-5">
        <h2 className="font-display text-lg font-bold tracking-tight text-destructive">
          Eliminar a conta
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Direito à eliminação, Art. 18, VI. Apaga a conta, os ativos que você
          monitora, os alertas gerados e as sessões abertas. Não há desfazer, e
          não guardamos cópia.
        </p>
        <EraseForm />
      </section>
    </div>
  )
}
