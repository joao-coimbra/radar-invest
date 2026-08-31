import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import type { UserRecord } from "@/server/repositories/users.repository"
import { currentUser, REFRESH_COOKIE_NAME } from "./session"

/**
 * Identidade para Server Components e Server Actions.
 *
 * Resolve o usuário direto pela camada de sessão, sem passar pela API HTTP —
 * uma página do servidor chamando a própria API pela rede pagaria uma volta
 * inteira de serialização para conversar consigo mesma.
 *
 * Não rotaciona o refresh token. Renderizar uma tela não deve consumir uma
 * rotação: duas requisições paralelas do navegador rotacionariam duas vezes, a
 * segunda veria a primeira como usada, e a família cairia por um falso
 * positivo de reuso.
 */
export async function getSessionUser(): Promise<UserRecord | null> {
  const jar = await cookies()

  return currentUser(jar.get(REFRESH_COOKIE_NAME)?.value)
}

/** Para páginas que não existem sem identidade. */
export async function requireSessionUser(): Promise<UserRecord> {
  const user = await getSessionUser()

  if (!user) {
    redirect("/login")
  }

  return user
}
