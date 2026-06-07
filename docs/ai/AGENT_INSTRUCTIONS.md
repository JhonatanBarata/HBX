# HBX Agent Instructions Archive

Esta e uma copia documental das instrucoes importantes para agentes. Os arquivos oficiais continuam sendo:

- `AGENTS.md` na raiz.
- `Webwhats/AGENTS.md` dentro da area Webwhats.
- Skills locais do Codex fora do repo, quando disponiveis.

Nao mover os `AGENTS.md` oficiais para fora desses locais; agentes leem esses caminhos automaticamente.

## Instrucao raiz resumida

HBX e uma esteira:

```text
Radar -> Vendas -> WhatsApp -> Retorno
```

Radar e memoria de leads e oportunidades. Resultados negativos protegem contra trabalho repetido e nao devem ser descartados casualmente.

Nao alterar sem pedido explicito:

- pricing, planos, paywalls, quotas, entitlements, billing, tax, refunds ou acesso comercial;
- pagamentos, checkout, webhooks, refunds, assinaturas ou dados reais de pagamento;
- auth/autorizacao;
- secrets, keys, tokens, envs reais ou rotacao de credenciais;
- migrations ou operacoes destrutivas;
- deploy/publish/release/restart de producao;
- refatoracoes grandes fora do escopo.

Backend e fonte de verdade para autorizacao comercial.

Repo map curto:

- `frontend`: Next.js, React, TypeScript, Tailwind.
- `backend`: NestJS, Prisma, TypeScript.
- `Webwhats`: area WhatsApp separada com instrucoes proprias.
- `docs`: notas operacionais, smoke results, reports e runbooks.

Checks padrao:

- Frontend: `cd frontend && npm run lint`; `cd frontend && npm run build`.
- Backend: `cd backend && npm run prisma:validate`; `cd backend && npm run build`; testes especificos quando houver.
- Raiz: `npm run test:e2e` apenas quando caminho e2e mudou e ambiente esta pronto.

UI:

- Texto publico em PT-BR.
- Paginas operacionais desktop devem comecar pelo guia operacional, nao por hero.
- Usar `HbxGuide1`/`hbx-guide1`, `HbxGuide4`/`hbx-guide4`, `hbx-guide5` quando cabivel.
- Light e dark precisam continuar legiveis.

Review: riscos altos incluem feature paga sem autorizacao, guards enfraquecidos, pagamentos/webhooks sem teste, cards Radar sem empresa real, negativos apagados, secrets/PII/logs sensiveis.

## Webwhats resumido

Webwhats e uma API WhatsApp multi-tenant baseada em Evolution API, Node.js, TypeScript e Express.

Pontos principais:

- `src/api/controllers`: handlers HTTP finos.
- `src/api/services`: logica de negocio.
- `src/api/routes`: RouterBroker pattern.
- `src/api/integrations`: canais, chatbots, eventos e storage.
- `src/api/guards`: auth/autorizacao.
- `src/api/repository`: Prisma.
- `src/validate`: JSONSchema7.
- `prisma`: schemas e migrations por provider.

Regras criticas:

- toda operacao deve ser escopada por instancia;
- validar ownership antes de operar;
- nao usar decorators `class-validator` em DTOs Webwhats quando o padrao local e JSONSchema7;
- comandos DB dependem de `DATABASE_PROVIDER`;
- comunicacao com usuario em PT-BR.

