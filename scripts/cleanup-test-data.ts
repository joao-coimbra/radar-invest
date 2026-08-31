/**
 * Remove as contas de teste (`@radar-invest.test`) e tudo que pende delas.
 *
 *   bun --env-file=.env.local scripts/cleanup-test-data.ts
 *
 * Só toca em e-mails do domínio reservado de teste. Contas reais não são
 * afetadas — o filtro é por sufixo exato, não por padrão amplo.
 */
import { airtable, TABLES } from "@/server/integrations/airtable"
import { alertsRepository } from "@/server/repositories/alerts.repository"
import { assetsRepository } from "@/server/repositories/assets.repository"
import { sessionsRepository } from "@/server/repositories/sessions.repository"
import { usersRepository } from "@/server/repositories/users.repository"

const SUFFIX = "@radar-invest.test"

const users = await airtable.list<{ email?: string }>(TABLES.users, {
  filterByFormula: `RIGHT({email}, ${SUFFIX.length}) = '${SUFFIX}'`,
  fields: ["email"],
})

if (users.length === 0) {
  console.log("Nenhuma conta de teste encontrada.")
} else {
  for (const user of users) {
    const sessions = await sessionsRepository.removeByUserId(user.id)
    const alerts = await alertsRepository.removeByOwner(user.id)
    const assets = await assetsRepository.removeByOwner(user.id)
    await usersRepository.remove(user.id)
    console.log(
      `  removida ${user.fields.email} (${assets} ativos, ${alerts} alertas, ${sessions} sessões)`
    )
  }
}

console.log(`\n${airtable.stats().calls} chamadas ao Airtable.`)
