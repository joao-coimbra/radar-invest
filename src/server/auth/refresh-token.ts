import { createHash, randomBytes } from "node:crypto"

/**
 * Refresh token: 32 bytes aleatórios, opaco. **Não é um JWT.**
 *
 * Um JWT carrega estado assinado e vale enquanto não expirar — exatamente o
 * oposto do que um refresh token precisa ser, já que ele tem de poder ser
 * revogado no instante em que se descobre que vazou. O valor opaco não
 * significa nada sozinho: só vale contra a linha correspondente em `Sessions`.
 *
 * Guardado como **SHA-256**, não bcrypt ou argon2. Hash lento existe para
 * compensar a baixa entropia de senha escolhida por humano; 256 bits de
 * `randomBytes` não são passíveis de força bruta, e um KDF caro aqui só
 * adicionaria latência a cada rotação. O hash serve para que um vazamento da
 * tabela não entregue tokens utilizáveis.
 */

const TOKEN_BYTES = 32

export function generateRefreshToken(): { token: string; tokenHash: string } {
  // base64url para caber em cookie sem escaping.
  const token = randomBytes(TOKEN_BYTES).toString("base64url")

  return { token, tokenHash: hashRefreshToken(token) }
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}
