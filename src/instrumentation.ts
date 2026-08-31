/**
 * Hook de inicialização do Next. Roda uma vez por instância do servidor e
 * precisa terminar antes de a primeira requisição ser atendida.
 *
 * É aqui que a validação do ambiente vira falha de boot de verdade. Sem este
 * arquivo o `env.ts` só seria avaliado quando alguma rota importasse um
 * adaptador — ou seja, a credencial faltando apareceria como erro 500 no meio
 * de um ciclo de sincronização, e não na subida do processo.
 */
export async function register() {
  // O Next também executa este hook no runtime edge, onde não há servidor
  // nosso para derrubar.
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return
  }

  // Chamada explícita: o `env` valida no primeiro acesso, então importar o
  // módulo já não basta para disparar a checagem. A preguiça existe para o
  // `next build` não exigir segredo de runtime; aqui, no boot, queremos
  // exatamente o contrário.
  const { validateEnv } = await import("@/server/lib/env")

  validateEnv()
}
