import { Elysia } from "elysia"
import { alertsRoutes } from "./alerts.routes"
import { assetsRoutes } from "./assets.routes"
import { authRoutes } from "./auth.routes"
import { marketRoutes } from "./market.routes"
import { privacyRoutes } from "./privacy.routes"
import { syncRunsRoutes } from "./sync-runs.routes"

/**
 * Composição das rotas sob `/v1`.
 *
 * O prefixo de versão está aqui, e não em cada arquivo, para que subir para
 * `/v2` no futuro seja uma linha — e para que nenhum recurso possa esquecer
 * de versionar.
 */
export const v1Routes = new Elysia({ prefix: "/v1" })
  .use(authRoutes)
  .use(assetsRoutes)
  .use(marketRoutes)
  .use(alertsRoutes)
  .use(syncRunsRoutes)
  .use(privacyRoutes)
