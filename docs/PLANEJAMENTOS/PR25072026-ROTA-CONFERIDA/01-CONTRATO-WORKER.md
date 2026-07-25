# CONTRATO DO WORKER — vale pra TODAS as sprints desta pasta

Leia isto ANTES da sua sprint. Violar qualquer item = sprint reprovada.

## Git
- **NUNCA criar branch nem worktree.** Trabalhar na branch atual (`master`).
- **NÃO commitar, NÃO push, NÃO publicar** (`npm run publish`/`new` PROIBIDOS).
  O orquestrador revisa e commita. Deploy só com ordem explícita do dono.
- **`git stash`, `git checkout -- <arquivo>`, `git reset`, `git clean`:
  PROIBIDOS SEM EXCEÇÃO** (incidente 25/07: stash sem escopo engoliu edição
  paralela do dono e do orquestrador; o drop perdeu conteúdo não-commitado).
  O dono edita o repo AO MESMO TEMPO que você — qualquer comando que mexa no
  working tree além dos SEUS edits de arquivo pode destruir trabalho alheio.
  Precisa comparar antes/depois? `git diff` e leitura, nunca mutação.
- O working tree tem edições NÃO commitadas do dono (ex.:
  `EntregaShell/app/src/logistica/assets/app/app.js`,
  `EntregaShell/app/src/main/assets/app/native.js`). **Não reverter nem
  sobrescrever nada que você não escreveu** — edite POR CIMA do estado atual.

## Execução
- **Zero teste ao vivo**: não subir servidor, não chamar VPS, não tocar WhatsApp,
  não instalar APK. Testes = unitários herméticos + typecheck, só.
- Escopo = SÓ o que a sua sprint manda. Achou problema fora do escopo? Reporte no
  final, não conserte.
- Comentários e nomes em PT-BR, no estilo dos arquivos vizinhos (comentário
  explica POR QUÊ/constraint, nunca "o que a linha faz").

## Verificação obrigatória (rodar e colar resultado no relatório)
- Backend tocado → `cd backend && npm run build` (typecheck estrito) + os testes
  da sprint via `node --test dist/...` (padrão dos scripts `test:*` do
  package.json).
- Frontend web tocado → `cd frontend && npm run lint` (inclui `check-pele.mjs`).
  Violações PRÉ-existentes não são suas; NENHUMA violação nova sua.
- APK (`EntregaShell/.../app.js`) → sem build; seguir a CONSTITUIÇÃO do APK em
  `docs/PLANEJAMENTOS/PR21072026-APK-PADRAO/` (10 Leis + catálogo de
  componentes) antes de qualquer UI. Zero hex solto (lint do APK trava).

## Leituras por domínio (obrigatórias quando tocar)
- Backend → `docs/Rules/BACKEND.md`
- Frontend web → `docs/Rules/FRONTEND.md` (5 Leis: todo visual nasce em token)
- APK → `docs/PLANEJAMENTOS/PR21072026-APK-PADRAO/`

## Leis do produto (desta frente — `00-PLANO.md`)
1. Pino errado é PIOR que pino vazio.
2. Zero lentidão artificial — mostrar trabalho real.
3. **Conferir NUNCA debita crédito** — nenhum caminho novo pode chamar
   `prepareRoute`/`wallet.debit`.
4. Degradação nunca é silenciosa (`engine` sempre visível).
5. Gate 100% local — nenhuma regra de reprovação depende de rede externa.
6. A rota iniciada é a rota aprovada (via `ordemManual`).
7. Vermelho NUNCA bloqueia a saída (decisão do dono 25/07) — 1 toque consciente
   por pendência.

## Relatório final (obrigatório)
- Arquivos tocados (lista) · o que mudou em 1 linha cada.
- Saída do typecheck/lint/testes (colar o resultado real).
- Pendências/descobertas fora do escopo.
