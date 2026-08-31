import { randomBytes, scrypt, timingSafeEqual } from "node:crypto"
import { promisify } from "node:util"

/**
 * Hash de senha com scrypt.
 *
 * O `CLAUDE.md` pede `Bun.password.hash()`, que usa argon2id. Não dá: a
 * aplicação roda dentro do Next, e o `next dev` sobe **Node**, não Bun —
 * mesmo invocado por `bun run dev`, porque respeita o shebang do binário do
 * Next. Medido nesta máquina: `typeof Bun === "undefined"` dentro de um route
 * handler, `process.versions.node === "24.13.0"`, `process.versions.bun` nulo.
 * Na Vercel seria Node de qualquer jeito.
 *
 * scrypt é a substituição certa: é KDF de senha de verdade, memory-hard como
 * o argon2, está no `node:crypto` e não adiciona dependência nativa — que na
 * Vercel seria outro problema. Instalar `bcrypt` ou `argon2` traria binário
 * compilado; `bcryptjs` seria JS puro mas mais fraco que scrypt.
 *
 * O hash guarda os parâmetros junto. Sem isso, endurecer o custo no futuro
 * invalidaria todas as senhas já cadastradas.
 */

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number }
) => Promise<Buffer>

// N=2^14 usa ~16 MB e leva dezenas de milissegundos. Custa pouco para o
// usuário legítimo, que autentica uma vez, e muito para quem tenta força
// bruta em escala.
const PARAMS = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
const KEY_LENGTH = 64
const SALT_LENGTH = 16
const PREFIX = "scrypt"

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH)
  const derived = await scryptAsync(plain, salt, KEY_LENGTH, PARAMS)

  return [
    PREFIX,
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$")
}

export async function verifyPassword(
  plain: string,
  stored: string
): Promise<boolean> {
  const parts = stored.split("$")

  if (parts.length !== 6 || parts[0] !== PREFIX) {
    return false
  }

  const [, n, r, p, saltB64, hashB64] = parts

  const salt = Buffer.from(saltB64, "base64")
  const expected = Buffer.from(hashB64, "base64")

  const derived = await scryptAsync(plain, salt, expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: PARAMS.maxmem,
  })

  // Comparação em tempo constante: `===` vazaria, pelo tempo de resposta,
  // quantos bytes iniciais o atacante já acertou.
  return derived.length === expected.length && timingSafeEqual(derived, expected)
}
