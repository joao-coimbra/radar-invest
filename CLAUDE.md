# RadarInvest — contexto para o Claude Code

Central de monitoramento de mercado para escritórios de assessoria de
investimentos. Trabalho final da disciplina de Integração de APIs.

O contrato completo da API está em `docs/openapi.yaml`. Ele foi escrito antes
da implementação e é a fonte da verdade: endpoints, schemas, códigos de erro e
regras de negócio já estão especificados lá. Consulte-o antes de criar
qualquer rota.

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
para o scheduler e para consumidores externos.

## Stack

- Next.js 15 App Router, TypeScript, Tailwind 4, shadcn/ui
- Elysia montado em `src/app/api/[[...slugs]]/route.ts` com prefixo `/api`
- `@elysiajs/openapi` gerando a documentação viva em `/api/docs`
- TypeBox para validação em runtime (`t.Object`, etc.)
- Eden Treaty para consumo tipado no frontend
- Bun como runtime e gerenciador de pacotes
- Airtable como banco (não há ORM, não há SQL, não há Prisma/Drizzle)

## Estrutura

```
src/
├── app/
│   ├── (auth)/login/  (auth)/register/
│   ├── dashboard/  assets/  alerts/  account/
│   └── api/[[...slugs]]/route.ts     ← ponto de entrada do Elysia
└── server/
    ├── routes/          ← rotas Elysia, uma por recurso
    ├── services/        ← normalização, regras de negócio, orquestração
    ├── integrations/    ← um adaptador por API externa
    ├── auth/            ← JWT, hash, sessões, escopos
    └── lib/             ← env, cache, mask, logger, erros
```

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
- `marketCap` pode vir `null`. `changed: true` indica ticker renomeado.
- Erros: `401` token inválido ou ausente, `402` limite do plano excedido,
  `404` ticker inexistente, `429` excesso de requisições.
- PETR4, MGLU3, VALE3 e ITUB4 respondem sem token — úteis em teste. Misturar
  um deles com outro ticker faz a chamada inteira exigir token.
- Plano gratuito: 15.000 requisições por mês.

### BrasilAPI — pública, sem autenticação

Indicadores macroeconômicos. Não envie header de autorização. Serve de
contraponto deliberado à API privada.

### Airtable — privada, Personal Access Token

Restrições que **moldam o desenho**, não são detalhe:

- 5 requisições por segundo por base. Estouro devolve `429` e exige esperar 30s.
- Plano gratuito com cota mensal baixa. Cada chamada conta.
- Batch de até 10 registros por requisição — use sempre nas escritas.
- Listagem pagina de 100 em 100, com `offset`.

Consequências obrigatórias: agrupar escritas em batch, não persistir cotação
que não mudou de forma relevante, e contar as chamadas em cada ciclo para
expor no painel.

## Tabelas

`Users` — name, email, passwordHash, role, consentAccepted, consentTermsVersion, consentRecordedAt, createdAt

`Sessions` — userId, familyId, tokenHash, usedAt, revokedAt, expiresAt, createdAt

`Assets` — ticker, type, alertThresholdPercent, ownerId, status, alertState, createdAt

`Quotes` — ticker, currentPrice, changePercent, currency, source, collectedAt

`Alerts` — ticker, direction, changePercent, configuredThreshold, notified, createdAt

Não guarde IP nem user-agent em `Sessions`. Se o dado não é usado, não é
coletado — princípio da minimização.

## Autenticação

**Access token**: JWT HS256, 15 minutos, claims `sub`, `role`, `jti`.
Devolvido no corpo da resposta, mantido apenas em memória pelo cliente.

**Refresh token**: 32 bytes aleatórios opacos, **não é JWT**. Guardado como
hash SHA-256 — e não bcrypt, porque hash lento existe para senhas de baixa
entropia; um token aleatório de 256 bits não é passível de força bruta.

Cookie: `httpOnly`, `Secure`, `SameSite=Strict`, `Path=/api/v1/auth`.

**Rotação com detecção de reuso**: cada login abre uma `familyId`; cada
refresh emite token novo e marca o anterior como usado; se um token já usado
reaparecer, revogue a família inteira e devolva 401. A família expira 7 dias
após o login, independente de quantas rotações houve.

**Senha do usuário**: `Bun.password.hash()`, que usa argon2id por padrão.

**Papéis e escopos**: `ASSESSOR` recebe `assets.read`, `assets.write`,
`market.read`, `alerts.read`, `users.manage`. `ADMIN` recebe os mesmos mais
`syncs.execute`.

**Ordem de verificação em toda rota protegida**: validar token (falha = 401)
→ extrair identidade → checar escopo (falha = 403) → **checar posse do
recurso** (falha = 403) → consultar dados → filtrar resposta.

A checagem de posse não é opcional. Sem ela a API fica vulnerável a BOLA: um
usuário autenticado acessando recurso de outro. Token válido prova identidade,
nunca prova propriedade.

## Automação

`POST /api/v1/sync-runs` aceita dois modos de autenticação: JWT de usuário com
escopo `syncs.execute`, ou header com o `CRON_SECRET` para o scheduler.

Regras do ciclo:

1. Fora do horário de pregão, encerre sem chamar nenhuma API externa.
2. Busque todas as cotações numa única chamada à brapi.
3. Alerte **na transição de estado**, nunca no estado. Se `alertState` já era
   `BREACHED`, apenas atualize; não dispare alerta de novo. Sem isso o mesmo
   ativo alerta a cada ciclo e o usuário silencia o canal.
4. Registre chamadas externas feitas e evitadas por cache.

## O que não fazer

- Não use `NEXT_PUBLIC_` em nada sensível.
- Não instale ORM, Prisma, Drizzle ou banco relacional. O banco é o Airtable.
- Não instale Better-Auth, NextAuth ou Clerk. A autenticação é artesanal de
  propósito: ela precisa ser explicável linha a linha.
- Não faça uma chamada à brapi por ticker.
- Não devolva `passwordHash`, `tokenHash` ou e-mail sem máscara em resposta de
  leitura. A exceção é a exportação LGPD, onde o destinatário é o titular.
- Não invente rotas fora do `docs/openapi.yaml`. Se algo faltar no contrato,
  proponha a alteração antes de implementar.
