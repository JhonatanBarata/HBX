# RBAC / Hierarquia de Papéis — Sprint 4
## `PermissionsGuard` + `@RequirePermission('chave')` — uma decisão, um lugar

> Depende dos sprints 1 (enforcement valendo) e 3 (`AccessContext` + `resolveActorKind`).

## Contexto verificado

- Hoje o gate por handler é papel-grosso: `RolesGuard` + `@Roles`/`@Admin`
  (`backend/src/auth/roles.guard.ts`, `roles.decorator.ts`, `admin.decorator.ts`), com
  **duplicatas** `AdminGuard` e `MasterGuard` (`backend/src/auth/guards/`) de semântica
  quase igual e erros diferentes (403 seco vs `ForbiddenException` com mensagem).
- A permissão fina fica dentro do service (sprint 1) — o handler não declara o que exige.
  Consequência: pra saber o que um endpoint pede, é preciso ler o service inteiro.

## Por quê ($)

Auditabilidade e velocidade: com `@RequirePermission` no handler, a pergunta do Dono
("quem pode fazer X?") vira grep no controller + tela do Gerencial, e endpoint novo já
nasce ligado ao catálogo. Menos horas de auditoria manual, menos brecha entre "o que o
painel mostra" e "o que o backend faz".

## Escopo

1. Criar `@RequirePermission(...chaves: TeamAccessKey[])` (metadata) em `backend/src/access/`.
2. Criar `PermissionsGuard` global (APP_GUARD, depois do JwtAuthGuard do sprint 2):
   - Sem metadata → passa (rota só-autenticada continua possível).
   - Com metadata → resolve o `AccessContext` cacheado (sprint 3) e exige TODAS as chaves.
   - Master: passa sempre (mesma regra do `ModuleAccessGuard:35`), MAS respeitando o
     contexto assumido quando ativo (empresa efetiva do `masterContext`).
3. Migrar módulo a módulo, nesta ordem (menor risco → maior): `team` → `gerencial` →
   `users` → `webscraping` → `vendas`. Em cada um: anotar handlers com as chaves que o
   sprint 1 passou a exigir no service. O assert do service FICA (defesa em profundidade);
   o guard vira a 1ª linha.
4. `AdminGuard`/`MasterGuard`: marcar `@deprecated` apontando para
   `@RequirePermission`/`@RequireKind`. NÃO apagar neste sprint.
5. `@RequireKind('master')` como açúcar para os casos que são de papel puro
   (superfície master), substituindo `MasterGuard` gradualmente.

## Fora de escopo
- Remover RolesGuard/@Admin dos 39 controllers de uma vez — migração é POR MÓDULO, cada
  módulo num publish separado.
- Frontend (as chaves já chegam via team policy — nada muda no contrato).

## Riscos e guardrails
- Dupla checagem (guard + service) pode divergir na mensagem de erro — padronizar o corpo
  `{ code: 'PERMISSION_DENIED', key }` no guard; o front do Gerencial já entende bloqueio.
- Handler anotado com chave errada = 403 indevido. Regra: a chave do handler é a MESMA do
  assert no service (copiar, não interpretar).

## Aceite
- 5 módulos migrados, cada um com publish próprio e smoke dos 4 papéis.
- Grep de `AdminGuard|MasterGuard` fora de `auth/guards` não cresce (só diminui).
- Para 3 endpoints de amostra, o 403 vem do guard (1ª linha) e o assert do service segue
  cobrindo chamada interna (teste unitário chamando o service direto).

## Checks
- `cd backend && npm run build`
- Testes dos módulos tocados + smoke localhost:3001 por módulo migrado
