# RadarInvest

**Central Inteligente de Monitoramento de Mercado**
Trabalho final — Integração de APIs

> Status: contrato definido, implementação em andamento.

---

## Descrição da solução

Um escritório de assessoria de investimentos acompanha dezenas de ativos para
diferentes clientes. Hoje esse acompanhamento é manual: o assessor abre o
home broker para ver cotações, consulta outro site para saber a taxa SELIC
vigente, anota o que achou relevante em uma planilha e avisa o cliente por
mensagem quando lembra. As informações existem, mas estão espalhadas — e o
tempo gasto reunindo esses dados é tempo que não foi gasto atendendo.

O RadarInvest consolida essas fontes em uma única aplicação. O assessor
cadastra os ativos que quer monitorar e o limite de variação que considera
relevante. A partir daí o sistema coleta cotações e indicadores
macroeconômicos, cruza as duas informações, calcula quais ativos merecem
atenção prioritária, grava o histórico em um banco no-code visível para o
time não técnico e dispara um alerta automático quando algum limite é
rompido.

O ganho não está em exibir dados que já existem, e sim em transformá-los em
uma resposta: *quais dos meus ativos precisam de atenção agora, e por quê?*

## APIs utilizadas e justificativa

| API | Natureza | Autenticação | Papel no projeto |
|---|---|---|---|
| [brapi.dev](https://brapi.dev/docs) | Privada | Bearer Token | Cotações de ativos da B3 |
| [BrasilAPI](https://brasilapi.com.br/docs) | Pública | Nenhuma | SELIC, CDI e IPCA |
| [Airtable](https://airtable.com/developers/web/api/introduction) | Privada | Personal Access Token | Persistência no-code |

A escolha foi deliberada. A brapi exige credencial, o que obriga o projeto a
tratar proteção de chave, cabeçalho `Authorization` e resposta 401 do
provedor. A BrasilAPI não exige nada, o que a torna adequada para dados
abertos mas insuficiente sozinha para sustentar uma aplicação de negócio.
Ter as duas lado a lado torna a diferença entre API pública e privada
visível no próprio código, e não apenas na documentação.

O Airtable entra como banco no-code porque expõe API REST com o mesmo padrão
Bearer das outras duas, com escopo por base e tabela e token revogável pelo
painel. Trocar o banco não muda o conceito de autenticação.

## Fluxo de integração

```
┌──────────────┐   POST /sync-runs   ┌──────────────────────┐
│  Interface   │ ───────────────────────► │   API Elysia sobre   │
│   Next.js    │ ◄─────────────────────── │  Next Route Handler  │
└──────────────┘   market-overview JSON  └──────────┬───────────┘
                                                     │
                        ┌────────────────────────────┼────────────────────┐
                        ▼                            ▼                    ▼
                ┌───────────────┐          ┌─────────────────┐   ┌────────────────┐
                │   brapi.dev   │          │    BrasilAPI    │   │    Airtable    │
                │   (Bearer)    │          │    (pública)    │   │     (PAT)      │
                └───────────────┘          └─────────────────┘   └────────────────┘
                        │                            │                    ▲
                        └──────────┬─────────────────┘                    │
                                   ▼                                      │
                    normalização → regras de negócio → ranking ───────────┘
                                   │
                                   ▼
                          limite rompido? → webhook de alerta
```

Etapas do ciclo:

1. **Coleta** — o backend consulta as duas APIs externas, servindo do cache o
   que ainda estiver dentro do TTL.
2. **Normalização** — os dois JSONs chegam com estruturas e tipos diferentes
   (a variação percentual vem como texto em uma das fontes) e são convertidos
   para um modelo interno único.
3. **Regras de negócio** — a variação de cada ativo é comparada ao limite
   configurado e ao CDI do período, produzindo um nível de atenção.
4. **Geração de informação** — os ativos são ordenados por prioridade, criando
   um ranking que nenhuma das APIs entrega pronto.
5. **Persistência** — o resultado é gravado no Airtable.
6. **Automação** — ativos com limite rompido geram alerta e disparam webhook.

## Estratégia de autenticação e segurança

- **Autenticação da própria API**: JWT via `Authorization: Bearer {token}`.
  Token ausente, inválido ou expirado devolve `401`.
- **Autorização**: cada operação declara o escopo necessário no contrato
  (`assets.read`, `assets.write`, `market.read`, `alerts.read`,
  `syncs.execute`, `users.manage`). Identidade confirmada sem
  o escopo devido devolve `403`.
- **Proteção contra BOLA**: além de validar o escopo, o código verifica se o
  recurso pertence ao usuário autenticado. Um token válido prova quem você é,
  não que o dado seja seu.
- **Credenciais**: todas em `.env`, listado no `.gitignore`. Nenhuma chave
  aparece no código, no repositório ou no bundle do frontend.
- **HTTPS** obrigatório em todas as comunicações em produção.
- **Rate limiting** por usuário autenticado, com `429` e `Retry-After`.
- **Mensagens de erro** com código estável para máquina e texto genérico para
  humanos, sem vazar detalhes internos.

## Armazenamento e manipulação dos dados

Três tabelas no Airtable: `Assets`, `Quotes` e `Alerts`.

Antes da gravação os dados passam por transformação (seleção dos campos
relevantes, descarte do que a API devolve e o projeto não usa) e normalização
(conversão de tipos, padronização de nomes). O modelo interno não depende do
formato externo — se a brapi mudar o nome de um campo, só o adaptador daquela
integração muda.

## LGPD, ética e governança

- **Minimização** (Art. 6º, III): as respostas devolvem apenas o necessário à
  tela. O e-mail do responsável é mascarado na leitura.
- **Consentimento** (Art. 8º): registrado com aceite, versão do termo e data.
- **Portabilidade** (Art. 18, V): `GET /users/{id}/export`.
- **Eliminação** (Art. 18, VI): `DELETE /users/{id}`.

Direito do titular que não vira endpoint é promessa, não conformidade.

**Cadeia de responsabilidade**: os dados do assessor foram fornecidos por ele,
integrados por este projeto e hospedados no Airtable. A escolha do fornecedor
é do desenvolvedor, o que torna o projeto corresponsável pelo que deposita lá.

**Sustentabilidade**: cotações são cacheadas por 60 segundos e indicadores por
24 horas. O painel informa quantas chamadas externas foram feitas e quantas
foram evitadas pelo cache — menos requisições é boa prática de engenharia que
também reduz consumo de energia.

## Prints da aplicação

<!-- TODO: inserir após a interface estar pronta -->

## Como executar

```bash
git clone https://github.com/SEU-USUARIO/radar-invest.git
cd radar-invest
npm install
cp .env.example .env   # preencha as credenciais
npm run dev            # http://localhost:8080/v1
```

Requisitos: Node.js 20.6+ e contas gratuitas na brapi.dev e no Airtable.

## Estrutura do repositório

```
radar-invest/
├── openapi.yaml              # contrato — definido antes do código
├── .env.example              # modelo de credenciais (sem valores reais)
├── src/
│   ├── config/               # leitura e validação das variáveis de ambiente
│   ├── middlewares/          # autenticação, autorização, rate limit, erros
│   ├── integrations/         # adaptadores: brapi, brasilapi, airtable, webhook
│   ├── services/             # normalização, regras de negócio, sincronização
│   ├── routes/               # rotas REST conforme o contrato
│   └── utils/                # cache, mascaramento, logger
└── web/                      # interface Next.js
```
