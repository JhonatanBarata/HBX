# W2 — OOBE POR CATEGORIA DE MÓDULO + TUTORIAL DESCASCADO (front + backend)

Decisões do dono (10/07, chat): 1º acesso pergunta QUAIS CATEGORIAS DE MÓDULOS o cliente quer (ex.:
cliente só-logística no celular pula toda a dor de cabeça); OOBE/tutorial vestem a MESMA CASCA do front
(a folha dark isolada `oobe.css` vira legado e MORRE — decisão de 10/07 que supersede a de 07/07);
tutorial hoje está chato (texto typewriter que segura o botão) e tem passo travado — descascar.

## Regras duras
- Trabalhar DIRETO na branch atual. NÃO criar branch/worktree. NÃO commitar. NÃO publicar.
- 5 Leis do Design System (docs/Rules/FRONTEND.md); check-pele verde (remover a exceção do oobe.css
  do check-pele.mjs quando a folha morrer).
- UI copy: SÓ label + campo, zero textão inventado. 1 tela, sem scroll (regra do dono 08/07).
- Migration Prisma: ADITIVA e nullable (boot em prod não pode quebrar — "build verde ≠ boot ok").
- NÃO tocar em: `public-entry.tsx`, `login/*`, `api.ts`, `register/page.client.tsx`, `shell.tsx`
  (a troca das chaves NAV null→própria é do W3, fase 2), bloco `.site-*`.
- Ao final: `cd frontend && npm run typecheck` + `cd backend && npm run typecheck` (ou tsc) verdes;
  testes backend do que tocou (auth/profile/modules) verdes.

## Fatos já mapeados (não re-explorar do zero)
- OOBE: `components/hbx/oobe-gate.tsx` (overlay z-80 sobre rota autenticada, montado no
  `auth-gate.tsx` → `(app)/layout.tsx`). Visual: folha PRÓPRIA `hbx-theme/oobe.css` (dark `--oobe-*`).
  Etapas: SENHA (`mustChangePassword`) → RAMO "Comece pelo alvo" (`ramoPending` = dono + canUse +
  `prospectingSegmentsJson` vazio; POST /profile/prospecting-segments; trava: ≥1 ramo) → MODO
  (`admin_mode:solo|team` via POST /onboarding/event) → CAMINHO (Passo a Passo | Direto;
  POST /profile/tutorial-done). Há um 5º painel MORTO no código (remover).
- Flags calculados em `sanitizeUser` (`backend/src/auth/profile.controller.ts:33-124`); persistência do
  ramo em `users.service.ts:873`. Padrão a copiar pro novo campo: `Company.prospectingSegmentsJson`
  (schema.prisma:136) + endpoint irmão + flag no sanitizeUser.
- Módulos: catálogo `SystemModule` (semeado de `bootstrap/structural-defaults.json`, 16 chaves);
  exceção por empresa `CompanyModule` (unique companyId+moduleId, enabled) — guard `@ModuleAccess` e
  `GET /modules/me` JÁ respeitam (fail-closed). Hoje só o master escreve CompanyModule.
- Tutorial: caseiro — `components/hbx/tutorial-coach.tsx` (+host), passos em `lib/tutorial-coach-steps.ts`,
  store em `lib/tutorial-coach-store.ts`, CSS `.tut-*` screens.css ~214-311. NÃO bloqueia clique
  (pointer-events:none); o chato é o TYPEWRITER no texto. 2 âncoras órfãs confirmadas:
  `[data-tut="leads-cota"]` (steps :249) e `[data-tut="atend-whatsapp"]` (steps :273) — elementos não
  existem mais. Tour já se adapta a módulo visível (`isModuleVisible`).
- Boot cinematográfico do /tutorial (`OobeBoot`): tela dark "Bem-vindo ao HBX" com checklist fake de
  carregamento — vive no mesmo mundo oobe.css.

## Entregas
1. **Backend — categorias por empresa:**
   - Campo novo `Company.moduleCategoriesJson Json?` (migration aditiva).
   - Endpoint `POST /profile/module-categories` (dono da empresa; molde do prospecting-segments):
     recebe lista de categorias, grava o JSON e faz upsert de `CompanyModule enabled=false` pros módulos
     das categorias NÃO escolhidas (e `enabled=true`/remove exceção pros escolhidos).
   - Mapa categoria→módulos (fonte única no backend, exportado pro front via resposta do endpoint ou
     constante espelhada): Radar/Empresas→`webscraping`; Vendas+Agenda→`vendas`; WhatsApp+IA→
     `atendimento`,`bot`; Logística→`logistica`; Website→`website`. Cadastros básicos (empresas/contatos/
     produtos/config/dash) NUNCA são desligados por aqui.
   - Flag `modulesPending` no `sanitizeUser` (molde `ramoPending`: dono + canUse + moduleCategoriesJson
     vazio). `ramoPending` passa a valer SÓ se a categoria Radar/Empresas foi escolhida (cliente
     só-logística não vê pergunta de ramo).
2. **OOBE na casca modern:** painéis do oobe-gate reescritos com tokens/classes do app (mesma casca,
   claro/escuro seguindo o tema). `hbx-theme/oobe.css` DELETADA (+ import no globals.css + exceção no
   check-pele.mjs). `OobeBoot` idem — versão enxuta na casca (sem checklist fake demorado; loading real
   e curto). Ordem dos painéis: SENHA (se pendente) → **CATEGORIAS (novo, 1º de conteúdo)** → RAMO (só
   se Radar escolhido) → MODO → CAMINHO. Painel morto removido.
   Painel CATEGORIAS: cards das 5 categorias (multi-select, ≥1), labels curtos, 1 tela sem scroll.
3. **Tutorial descascado:** matar o efeito typewriter (texto instantâneo); remover os 2 passos órfãos ou
   reancorar em elemento que existe (leads: âncora da barra de comando do redesign; atendimento: âncora
   real da tela atual — verificar no código o que existe); "Pular tour" sempre visível. Não reescrever
   copy dos passos em massa.
4. **Efeito cascata conferido:** com categorias gravadas, sidebar/tour/topbar encolhem sozinhos pros
   módulos com chave (`NAV_MODULE_KEY`) — conferir que nada quebra pra módulo `null` (a troca null→chave
   é do W3; não fazer aqui).

## Prova
Typechecks + testes verdes. Relatar: shape do endpoint, mapa categoria→módulo final, screenshot mental
do fluxo novo (ordem de painéis por perfil: completo × só-logística). NÃO deletar este .md.
