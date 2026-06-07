# HBX AI Context

## Produto

HBX e uma esteira de prospeccao e operacao comercial.

Fluxo principal:

```text
Radar -> Vendas -> WhatsApp -> Retorno
```

- `Radar`: memoria de leads, oportunidades, fontes, enriquecimento, historico, negativos e distribuicao.
- `Vendas`: cockpit comercial onde leads viram cards operaveis, campanhas, automacoes, comissoes e timeline.
- `WhatsApp`: canal operacional para contato, atendimento, automacao e handoff.
- `Retorno`: fechamento do ciclo via respostas, conversas, inbox, cobranca, recovery, financeiro e historico.

O Radar nao deve virar um buscador generico. O Radar deve entregar oportunidade real, preferencialmente empresa real com canal publico verificavel. Resultado negativo nao e lixo; e protecao contra retrabalho, card duplicado e abordagem repetida.

## Stack

- Frontend: `frontend`, Next.js App Router, React, TypeScript, Tailwind 4, CSS modules em varias paginas operacionais.
- Backend: `backend`, NestJS, Prisma, TypeScript, PostgreSQL.
- WhatsApp isolado: `Webwhats`, Evolution API adaptada, Express, TypeScript, Prisma multi-provider, Baileys.
- Motor moderno de scraping: `hbx-scraping-engine`, FastAPI/Python, discovery web, parsing, cache SQLite e ranking.
- Motor legado/demonstração: `webscraping`, Streamlit/Python com Google Places ou mock.
- E2E: `tests`, Playwright.
- Operacao local/producao: scripts raiz e `OPS.md`.

## Fonte de verdade

- Autorizacao comercial, plano, quota, assinatura, entitlement e status comercial: backend.
- Modelos persistidos: `backend/prisma/schema.prisma`.
- Bootstrap estrutural: `backend/src/bootstrap/structural-defaults.json`.
- Modulos carregados no backend: `backend/src/app.module.ts`.
- Entrada do backend e proxy de webscraping: `backend/src/main.ts`.
- Layout global, tema e providers frontend: `frontend/src/app/layout.tsx`.
- Regras locais do Webwhats: `Webwhats/AGENTS.md`.

## Regras de seguranca

Nao alterar sem pedido explicito do dono:

- pricing, planos, paywalls, quotas, entitlements, billing, impostos, refunds ou acesso comercial;
- checkout, pagamentos, webhooks, refunds, assinaturas ou dados reais de pagamento;
- auth/autorizacao;
- secrets, tokens, chaves, envs reais ou rotacao de credenciais;
- migrations ou operacoes destrutivas de dados;
- deploy, publish, release ou restart de producao;
- refatoracao ampla fora do escopo.

Nunca expor segredo ou liberar acesso pago pelo frontend. O backend e a fonte de verdade.

## UI

Texto publico em PT-BR.

Paginas operacionais desktop devem evitar hero/landing page. Usar o padrao HBX:

- `guia1`: componente `HbxGuide1`, `hbx-guide1-slot`, `hbx-guide1`, `hbx-tab-glide`.
- `guiaesquerdovertical`: componente `HbxGuide4`, `hbx-guide4-slot`, `hbx-guide4`.
- `subguia`: `hbx-guide5` para trilho horizontal de status/data/etapa.

Mudanca visual nova deve funcionar em tema claro e escuro. Preferir tokens globais e componentes existentes antes de CSS local.

## Estado do repo

O repositorio pode estar sujo. Antes de editar, rode `git status --short`. Nao reverta mudancas existentes que voce nao fez.

Arquivos e pastas normalmente volumosos ou pouco uteis para leitura inicial:

- `node_modules`
- `.git`
- `.worktrees`
- `postgres-data`
- `storage`
- `backups`
- imagens de `docs/ICONES`, `docs/TUTORIAL`, `frontend/cards` e assets gerados
- sites gerados em `backend/website-kit/companies/*/site`

Abra esses locais apenas quando a tarefa apontar diretamente para eles.

