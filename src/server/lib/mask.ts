/**
 * Mascaramento aplicado na leitura, por minimização (LGPD, Art. 6º, III).
 *
 * O e-mail do responsável aparece em tela para o assessor saber de quem é o
 * ativo. Para isso, a primeira letra e o domínio bastam — o endereço completo
 * seria dado além da finalidade.
 *
 * A exceção é a exportação do Art. 18, V, onde o destinatário é o próprio
 * titular e o dado sai sem máscara.
 */

/** `ana@escritorio.com.br` → `a******@escritorio.com.br` */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@")

  if (at <= 0) {
    return "***"
  }

  const local = email.slice(0, at)
  const domain = email.slice(at)

  // Mínimo de seis asteriscos: com um local de uma letra só, `a@dominio` não
  // revelaria que houve mascaramento, e o comprimento real do endereço é ele
  // mesmo uma pista.
  return `${local[0]}${"*".repeat(Math.max(local.length - 1, 6))}${domain}`
}
