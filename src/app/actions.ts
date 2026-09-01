"use server"

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { hashPassword, verifyPassword } from "@/server/auth/password"
import { requireSessionUser } from "@/server/auth/current-session"
import {
  createSession,
  type IssuedSession,
  REFRESH_COOKIE_NAME,
  revokeSession,
} from "@/server/auth/session"
import { isProduction } from "@/server/lib/env"
import { AppError } from "@/server/lib/errors"
import type { AssetType } from "@/server/repositories/assets.repository"
import { usersRepository } from "@/server/repositories/users.repository"
import { createAsset, deleteAsset } from "@/server/services/assets.service"
import { eraseUserData } from "@/server/services/privacy.service"
import { runSync } from "@/server/services/sync.service"

/**
 * Server Actions da interface.
 *
 * Chamam a camada de serviço em função, não a API HTTP. A API existe para
 * Client Components, para o agendador e para consumidores externos; o servidor
 * falando consigo mesmo pela rede pagaria uma volta de serialização à toa.
 */

export interface FormState {
  error?: string
  ok?: string
}

const TERMS_VERSION = "2026-01"

/** Traduz qualquer falha na mensagem que o usuário deve ler. */
function toFormError(error: unknown): FormState {
  if (error instanceof AppError) {
    return { error: error.message }
  }

  console.error("[radar-invest] falha em server action:", error)

  return { error: "Não foi possível concluir a operação. Tente novamente." }
}

async function persistSession(session: IssuedSession): Promise<void> {
  const jar = await cookies()

  jar.set(REFRESH_COOKIE_NAME, session.refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: session.refreshTokenMaxAge,
  })
}

export async function registerAction(
  _previous: FormState,
  formData: FormData
): Promise<FormState> {
  const name = String(formData.get("name") ?? "").trim()
  const email = String(formData.get("email") ?? "").trim()
  const password = String(formData.get("password") ?? "")
  const accepted = formData.get("consent") === "on"

  if (name.length < 2) {
    return { error: "Informe seu nome completo." }
  }

  if (password.length < 12) {
    return { error: "A senha precisa ter ao menos 12 caracteres." }
  }

  if (!accepted) {
    return {
      error:
        "É preciso aceitar os termos para criar a conta. Sem consentimento não há base legal para tratar seus dados.",
    }
  }

  try {
    if (await usersRepository.findByEmail(email)) {
      return { error: "Já existe uma conta com este e-mail." }
    }

    const user = await usersRepository.create({
      name,
      email,
      passwordHash: await hashPassword(password),
      role: "ASSESSOR",
      consentTermsVersion: TERMS_VERSION,
    })

    await persistSession(await createSession(user))
  } catch (error) {
    return toFormError(error)
  }

  redirect("/dashboard")
}

export async function loginAction(
  _previous: FormState,
  formData: FormData
): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim()
  const password = String(formData.get("password") ?? "")

  try {
    const user = await usersRepository.findByEmail(email)

    // Mensagem idêntica nos dois casos. Distinguir "e-mail não cadastrado" de
    // "senha errada" transformaria a tela de login em ferramenta de
    // enumeração de contas.
    if (!(user && (await verifyPassword(password, user.passwordHash)))) {
      return { error: "E-mail ou senha inválidos." }
    }

    await persistSession(await createSession(user))
  } catch (error) {
    return toFormError(error)
  }

  redirect("/dashboard")
}

export async function logoutAction(): Promise<void> {
  const jar = await cookies()

  await revokeSession(jar.get(REFRESH_COOKIE_NAME)?.value)
  jar.delete(REFRESH_COOKIE_NAME)

  redirect("/login")
}

export async function createAssetAction(
  _previous: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requireSessionUser()
  const ticker = String(formData.get("ticker") ?? "").trim().toUpperCase()

  if (!/^[A-Z]{4}\d{1,2}$/.test(ticker)) {
    return {
      error: "O código deve ter quatro letras e um ou dois dígitos, como PETR4.",
    }
  }

  const threshold = Number(formData.get("alertThresholdPercent"))

  if (!Number.isFinite(threshold) || threshold < 0.1 || threshold > 50) {
    return { error: "O limite deve ficar entre 0,1% e 50%." }
  }

  try {
    await createAsset(user.id, {
      ticker,
      type: (formData.get("type") as AssetType) ?? "STOCK",
      alertThresholdPercent: threshold,
      ownerEmail: String(formData.get("ownerEmail") ?? user.email).trim(),
      consent: { accepted: true, termsVersion: TERMS_VERSION },
    })
  } catch (error) {
    return toFormError(error)
  }

  revalidatePath("/assets")
  revalidatePath("/dashboard")

  return { ok: `${ticker} entrou no monitoramento.` }
}

export async function deleteAssetAction(formData: FormData): Promise<void> {
  const user = await requireSessionUser()

  await deleteAsset(user.id, String(formData.get("ticker") ?? ""))

  revalidatePath("/assets")
  revalidatePath("/dashboard")
}

/** Disparo manual do ciclo. Só ADMIN — o mesmo escopo `syncs.execute`. */
export async function runSyncAction(
  _previous: FormState,
  _formData: FormData
): Promise<FormState> {
  const user = await requireSessionUser()

  if (user.role !== "ADMIN") {
    return { error: "Apenas ADMIN pode disparar a sincronização." }
  }

  try {
    const result = await runSync()

    revalidatePath("/dashboard")
    revalidatePath("/alerts")

    if (result.skippedReason) {
      return { ok: result.skippedReason }
    }

    return {
      ok:
        `${result.assetsProcessed} ativo(s) processado(s), ` +
        `${result.recordsPersisted} cotação(ões) gravada(s), ` +
        `${result.alertsGenerated} alerta(s) gerado(s).`,
    }
  } catch (error) {
    return toFormError(error)
  }
}

/**
 * Define o canal pessoal de alertas.
 *
 * É por titular, e não uma URL única da aplicação: um canal global entregaria
 * os alertas de todo mundo no mesmo lugar, e um assessor descobriria quais
 * ativos o outro acompanha.
 */
export async function saveWebhookAction(
  _previous: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requireSessionUser()
  const url = String(formData.get("alertsWebhookUrl") ?? "").trim()

  if (url && !/^https:\/\/\S+$/i.test(url)) {
    return {
      error:
        "Informe uma URL https válida, ou deixe em branco para não receber notificações.",
    }
  }

  try {
    await usersRepository.setAlertsWebhook(user.id, url)
  } catch (error) {
    return toFormError(error)
  }

  revalidatePath("/account")

  return {
    ok: url
      ? "Canal salvo. Os próximos alertas da sua carteira serão enviados para lá."
      : "Canal removido. Seus alertas continuam aparecendo no painel.",
  }
}

/** Eliminação — Art. 18, VI. Encerra a sessão junto: a conta deixou de existir. */
export async function eraseAccountAction(): Promise<void> {
  const user = await requireSessionUser()

  await eraseUserData(user.id, user.id)

  const jar = await cookies()
  jar.delete(REFRESH_COOKIE_NAME)

  redirect("/login?eliminado=1")
}
