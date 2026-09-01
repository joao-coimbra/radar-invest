# RadarInvest — contexto para o Claude Code

Central de monitoramento de mercado para escritórios de assessoria de
investimentos. Trabalho final da disciplina de Integração de APIs.

O contrato completo da API está em `docs/openapi.yaml`. Ele foi escrito antes
da implementação e é a fonte da verdade: endpoints, schemas, códigos de erro e
regras de negócio estão especificados lá. Consulte-o antes de criar qualquer
rota. Se algo faltar no contrato, proponha a alteração antes de implementar.

A aplicação está publicada em `radar-invest.joaocoimbra.dev`, com a
documentação viva em `/api/docs`.

## Convenções inegociáveis

**Idioma.** Identificadores, pathnames, nomes de schema, campos de payload,
códigos de erro e chaves de ambiente em **inglês**. Descrições da API,
mensagens de erro exibidas ao usuário, textos de interface, comentários e
documentação em **português**. Nunca misture dentro da mesma categoria.

**Segredos.** Nenhuma variável de ambiente usa o prefixo `NEXT_PUBLIC_`. Esse
prefixo embute o valor no bundle do navegador. Toda credencial é lida apenas
em código de servidor.

**Server Components não passam pela API HTTP.** Eles chamam a camada de
serviço diretamente, em função. A API HTTP existe para Client Components,
para o agendador e para consumidores externos.

**O build não pode depender de segredo de runtime.** O `env` valida sob
demanda, no primeiro acesso a uma chave, e o `src/instrumentation.ts` força a
validação no boot. Validar no topo do módulo faz o `next build` exigir as
credenciais, e quebra de vez na Vercel com variáveis marcadas como Sensitive,
que por desenho só existem em runtime.

## Stack

- Next.js 16 App Router, TypeScript, Tailwind 4, shadcn sobre Base UI
- Elysia montado em `src/app/api/[[...slugs]]/route.ts` com prefixo `/api`
- `@elysiajs/openapi` gerando a documentação viva em `/api/docs`
- TypeBox (`t` do Elysia) para validação das rotas em runtime
- Zod para validação das variáveis de ambiente
- `jose` para assinar e verificar o JWT
- Bun como runtime e gerenciador de pacotes
- Airtable como banco (não há ORM, não há SQL, não há Prisma/Drizzle)

A interface usa **Server Actions**, não cliente HTTP tipado. O `@elysiajs/eden`
foi removido por não ter uso.

`lucide-react` e `tw-animate-css` continuam nas dependências mesmo sem uso
direto hoje: fazem parte da cadeia do shadcn, e o próximo `shadcn add` que
trouxer ícone ou transição depende das duas. Não as remova por parecerem
órfãs numa varredura.

## Estrutura

```
src/
├── app/
│   ├── (auth)/login  (auth)/register     ← telas públicas
│   ├── (app)/dashboard  assets  alerts  account
│   ├── actions.ts                        ← Server Actions
│   └── api/[[...slugs]]/route.ts         ← ponto de entrada do Elysia
├── server/
│   ├── routes/          ← rotas Elysia, uma por recurso, e models.ts
│   ├── services/        ← normalização, regras de negócio, orquestração
│   ├── repositories/    ← acesso às tabelas do Airtable
│   ├── integrations/    ← um adaptador por API externa
│   ├── auth/            ← JWT, senha, sessões, escopos, guard
│   └── lib/             ← env, cache, http, erros, máscara, rate limit
└── instrumentation.ts   ← valida o ambiente no boot
```

O grupo `(app)` não aparece na URL: as rotas continuam sendo `/dashboard`,
`/assets`, `/alerts` e `/account`. Ele existe para que a checagem de sessão e
a barra superior morem num lugar só.

Adaptadores devolvem o modelo interno, nunca o JSON cru da origem. Se a API
externa mudar um nome de campo, só o adaptador muda.

## APIs externas

### brapi.dev — privada, Bearer Token

`GET /api/v2/stocks/quote?symbols=PETR4,VALE3` com header
`Authorization: Bearer {token}`.

Resposta aninhada em `results[]`, com os dados em `.data`:

```json
{ "results": [ { "requestedSymbol": "PETR4", "symbol": "PETR4",
  "changed": false,
  "data": { "longName": "Petróleo Brasileiro S.A. - Petrobras",
            "currency": "BRL", "regularMarketPrice": 41.18,
            "regularMarketChangePercent": -1.39,
            "regularMarketTime": "2026-06-14T05:15:42.000Z",
            "marketCap": null } } ] }
```

Pontos de atenção:

- **Sempre agrupe tickers numa única chamada.** Doze ativos = uma requisição.
- `marketCap` pode vir `null`. `changed: true` indica ticker renomeado, e o
  adaptador usa `requestedSymbol` como chave, que é o que casa com `Assets`.
- Erros mapeados: `401` → `UPSTREAM_UNAUTHENTICATED`, `402` →
  `UPSTREAM_QUOTA_EXCEEDED`, `404` → `NOT_FOUND`, `429` e `5xx` → retry e,
  esgotadas as tentativas, `UPSTREAM_UNAVAILABLE`.
- PETR4, MGLU3, VALE3 e ITUB4 respondem sem token — úteis em teste. Misturar
  um deles com outro ticker faz a chamada inteira exigir token.
- Plano gratuito: 15.000 requisições por mês.

### BrasilAPI — pública, sem autenticação

`GET /taxas/v1` devolve SELIC, CDI e IPCA. **Não envie header de autorização.**
Serve de contraponto deliberado à API privada, e essa ausência está comentada
no adaptador.

### Airtable — privada, Personal Access Token

Restrições que **moldam o desenho**, não são detalhe:

- 5 requisições por segundo por base. Estouro devolve `429` e exige esperar 30s.
- Plano gratuito com cota mensal baixa. Cada chamada conta.
- Batch de até 10 registros por requisição — use sempre nas escritas.
- Listagem pagina de 100 em 100, com `offset`.

Consequências obrigatórias: fila serial com intervalo mínimo de 210ms, escritas
em lote, não persistir cotação que não mudou de forma relevante, e contar as
chamadas em cada ciclo para expor no painel.

**A identidade é o id de registro do Airtable** (`rec…`), não um UUID gerado
por nós. Manter uma chave própria exigiria buscar por fórmula a cada consulta
por id, em vez de filtrar direto.

## Tabelas

`Users` — name, email, passwordHash, role, alertsWebhookUrl, consentAccepted,
consentTermsVersion, consentRecordedAt, createdAt

`Sessions` — tokenHash, userId, familyId, usedAt, revokedAt, expiresAt,
createdAt

`Assets` — ticker, type, alertThresholdPercent, ownerId, ownerEmail, status,
alertState, consentAccepted, consentTermsVersion, consentRecordedAt, createdAt,
updatedAt

`Quotes` — ticker, currentPrice, changePercent, currency, source, collectedAt

`Alerts` — ticker, ownerId, direction, changePercent, configuredThreshold,
notified, createdAt

Não guarde IP nem user-agent em `Sessions`. Se o dado não é usado, não é
coletado — princípio da minimização.

O `alertState` em `Assets` e o `ownerId` em `Alerts` não estavam no desenho
original. O primeiro é o que permite alertar na transição; o segundo é o que
permite filtrar alertas por dono.

`bun run setup:airtable` cria as cinco tabelas com os tipos corretos pela
Metadata API, e é idempotente. `bun run check:airtable` diagnostica a
configuração antes de escrever.

## Autenticação

**Access token**: JWT HS256, 15 minutos, claims `sub`, `role`, `scopes`, `jti`.
Devolvido no corpo da resposta, mantido apenas em memória pelo cliente.

**Refresh token**: 32 bytes aleatórios opacos, **não é JWT**. Guardado como
hash SHA-256 — e não bcrypt, porque hash lento existe para senhas de baixa
entropia; um token aleatório de 256 bits não é passível de força bruta.

Cookie: `httpOnly`, `Secure` em produção, `SameSite=Lax`, `Path=/`.

O escopo do cookie é `/` e não `/api/v1/auth`, e `Lax` e não `Strict`, porque a
interface é renderizada no servidor e precisa do cookie nas navegações de
página. `Lax` continua barrando POST cross-site, que é o vetor de CSRF que
importa aqui.

**Rotação com detecção de reuso**: cada login abre uma `familyId`; cada
refresh emite token novo e marca o anterior como usado; se um token já usado
reaparecer, revogue a família inteira e devolva 401. A família expira 7 dias
após o login, independente de quantas rotações houve.

**Renderizar uma tela não consome uma rotação.** Os Server Components resolvem
a identidade pelo cookie sem rotacionar. Duas requisições paralelas do
navegador rotacionariam duas vezes, a segunda veria a primeira como usada, e a
família cairia por falso positivo de reuso.

**Senha do usuário**: `scrypt` do `node:crypto`, com os parâmetros gravados
junto do hash. Não use `Bun.password.hash()`: o `next dev` respeita o shebang
do binário do Next e sobe **Node**, mesmo invocado por `bun run dev`. Medido:
`typeof Bun === "undefined"` dentro de um route handler. Na Vercel seria Node
de qualquer forma.

**Papéis e escopos**: `ASSESSOR` recebe `assets.read`, `assets.write`,
`market.read`, `alerts.read`, `users.manage`. `ADMIN` recebe os mesmos mais
`syncs.execute`.

**Ordem de verificação em toda rota protegida**: validar token (falha = 401)
→ extrair identidade → **contar no rate limit** → checar escopo (falha = 403)
→ **checar posse do recurso** (falha = 403 ou 404) → consultar dados →
filtrar resposta.

A checagem de posse não é opcional. Sem ela a API fica vulnerável a BOLA: um
usuário autenticado acessando recurso de outro. Token válido prova identidade,
nunca prova propriedade. Na prática, o `ownerId` do token entra na consulta ao
banco, nunca num filtro em memória depois.

**Leia os headers do `request`, não do contexto do Elysia.** No modo compilado
o Elysia decide por análise estática quais campos do contexto montar, e não
enxerga o uso dentro do `resolve` de uma macro: `headers` chega `undefined` e o
401 vira `TypeError`. Em desenvolvimento o modo é dinâmico e o problema não
aparece.

## Limite de requisições

Janela fixa em memória, 60 requisições por minuto, com duas chaves. Rotas
autenticadas contam pelo id do usuário; cadastro e login contam pelo e-mail
informado, porque ali ainda não existe identidade e o alvo de um ataque é uma
conta específica.

A contagem vale por instância do processo. Em serverless, duas instâncias
somam o dobro do limite.

## Automação

`POST /api/v1/sync-runs` aceita dois modos de autenticação: JWT de usuário com
escopo `syncs.execute`, ou o header `x-cron-secret` para o agendador.

O agendador é um workflow do GitHub Actions em `.github/workflows/`, e não o
cron da Vercel, cujo plano gratuito executa uma vez por dia. Ele precisa dos
secrets `APP_URL` e `CRON_SECRET` no repositório.

Regras do ciclo:

1. Fora do horário de pregão, encerre sem chamar nenhuma API externa.
2. Busque todas as cotações numa única chamada à brapi.
3. Alerte **na transição de estado**, nunca no estado. Se `alertState` já era
   `BREACHED`, apenas atualize; não dispare alerta de novo. Sem isso o mesmo
   ativo alerta a cada ciclo e o usuário silencia o canal.
4. Registre chamadas externas feitas e evitadas por cache.

**O canal de alerta é por titular**, gravado em `Users.alertsWebhookUrl`. Um
canal global entregaria os alertas de todos no mesmo lugar, anulando no último
passo do fluxo o mesmo isolamento que a API defende em toda rota.

O `ALERTS_WEBHOOK_URL` do ambiente sobreviveu com outro papel: canal de
operação, que recebe apenas contagens, sem ticker e sem titular.

## Verificação

- `bun run smoke:api` — percorre as oito rotas protegidas sem credencial e com
  credencial inválida, testa os dois modos do agendador e confere os caminhos
  publicados. Aceita uma URL como argumento para rodar contra produção.
- `bun run build:pdf` — regenera a parte teórica.
- `node scripts/capture-screenshots.mjs` — regenera os prints do README.

Os dois últimos rodam sob Node, não Bun: o Playwright conversa com o navegador
por `--remote-debugging-pipe`, e essa conexão não se estabelece sob Bun no
Windows.

**Reproduza bugs de produção com `bun run build && bun run start`.** Vários
defeitos deste projeto só existiram no modo compilado.

## O que não fazer

- Não use `NEXT_PUBLIC_` em nada sensível.
- Não instale ORM, Prisma, Drizzle ou banco relacional. O banco é o Airtable.
- Não instale Better-Auth, NextAuth ou Clerk. A autenticação é artesanal de
  propósito: ela precisa ser explicável linha a linha.
- Não use o `@elysiajs/bearer`. Ele cai num fallback de query string quando não
  encontra o header, e no modo compilado `query` nem sempre é materializado:
  seis das oito rotas passaram a devolver 500 no lugar de 401. Além disso,
  token em URL vaza para log de acesso e histórico.
- Não faça uma chamada à brapi por ticker.
- Não devolva `passwordHash`, `tokenHash` ou e-mail sem máscara em resposta de
  leitura. A exceção é a exportação LGPD, onde o destinatário é o titular.
- Não invente rotas fora do `docs/openapi.yaml`.
