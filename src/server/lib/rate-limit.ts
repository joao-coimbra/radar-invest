import { env, isProduction } from "./env"
import { RateLimitExceededError } from "./errors"

/**
 * Limite de requisições por janela fixa.
 *
 * A política está declarada em `x-rate-limit-policy` no contrato, e um
 * contrato que promete 429 sem nada que o produza é um contrato que mente.
 *
 * A janela fixa foi escolhida por ser explicável: a contagem zera em instantes
 * previsíveis, e o cliente sabe exatamente quanto falta pela resposta. Uma
 * janela deslizante distribui melhor a carga na virada, mas exige guardar o
 * horário de cada requisição, o que troca simplicidade por memória sem ganho
 * proporcional no volume deste projeto.
 *
 * A contagem vive em memória e vale por instância do processo. Em serverless,
 * duas instâncias somam o dobro do limite. Para o volume aqui é suficiente, e
 * a alternativa exigiria um armazenamento compartilhado que este projeto não
 * tem.
 */

interface Janela {
  contagem: number
  expiraEm: number
}

/** Acima disto, expurga as janelas vencidas antes de aceitar chaves novas. */
const LIMITE_DE_CHAVES = 5000

class LimitadorJanelaFixa {
  private readonly janelas = new Map<string, Janela>()

  /**
   * Conta a requisição e lança quando o teto é atingido.
   *
   * A exceção carrega quantos segundos faltam para a janela virar, e a camada
   * HTTP transforma isso no header `Retry-After`. Recusar sem dizer quando
   * tentar de novo empurra o cliente para uma repetição imediata.
   */
  registrar(chave: string): void {
    const agora = Date.now()
    const janela = this.janelas.get(chave)

    if (!janela || janela.expiraEm <= agora) {
      if (this.janelas.size >= LIMITE_DE_CHAVES) {
        this.expurgar(agora)
      }

      this.janelas.set(chave, {
        contagem: 1,
        expiraEm: agora + env.RATE_LIMIT_WINDOW_SECONDS * 1000,
      })

      return
    }

    janela.contagem++

    if (janela.contagem > env.RATE_LIMIT_MAX_REQUESTS) {
      throw new RateLimitExceededError(
        Math.max(Math.ceil((janela.expiraEm - agora) / 1000), 1)
      )
    }
  }

  private expurgar(agora: number): void {
    for (const [chave, janela] of this.janelas) {
      if (janela.expiraEm <= agora) {
        this.janelas.delete(chave)
      }
    }
  }

  /** Serve a teste. Zerar em produção abriria uma forma de burlar o limite. */
  reset(): void {
    this.janelas.clear()
  }

  get tamanho(): number {
    return this.janelas.size
  }
}

const globalForLimiter = globalThis as typeof globalThis & {
  __radarInvestRateLimit?: LimitadorJanelaFixa
}

export const rateLimiter =
  globalForLimiter.__radarInvestRateLimit ?? new LimitadorJanelaFixa()

if (!isProduction) {
  globalForLimiter.__radarInvestRateLimit = rateLimiter
}

/**
 * Rotas autenticadas: a chave é o usuário, como o contrato declara.
 *
 * O limite acompanha a identidade e não o endereço de rede, então trocar de
 * rede não devolve cota, e vários assessores atrás do mesmo IP do escritório
 * não disputam entre si.
 */
export function limitarPorUsuario(userId: string): void {
  rateLimiter.registrar(`user:${userId}`)
}

/**
 * Rotas de credencial: a chave é o e-mail tentado.
 *
 * Aqui ainda não existe identidade, e o alvo do ataque é uma conta específica.
 * Contar por e-mail limita o quanto uma conta pode ser martelada sem recorrer
 * ao endereço IP, que este projeto decidiu não coletar.
 */
export function limitarPorEmail(email: string): void {
  rateLimiter.registrar(`auth:${email.trim().toLowerCase()}`)
}
