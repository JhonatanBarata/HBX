# G4 — Quality gate local que trava o publish (P1.6)

## Contexto
Não há CI e o dono publica por `npm run publish`. Decisão: **gate local** (`npm run gate`) que
roda todos os checks e **aborta o publish** se algo estiver vermelho. Sem GitHub Actions (não faz
parte do fluxo do dono).

## Arquivos
- Localizar primeiro como o publish funciona: `grep -rn "\"publish\"\|\"new\"\|\"up\"" package.json`
  na raiz e em `backend/`, `frontend/`; achar o script real (provável `scripts/` ou raiz).
- `package.json` (raiz) — adicionar `gate` e encaixar no `publish`.
- Referência dos checks: `backend/package.json` (`test:credits`, `build`),
  `frontend/package.json` (`lint`, `build`), `Webwhats/` (`typecheck`), `hbx-scraping-engine`
  (`pytest`).

## Escopo
1. Entender o encadeamento atual do `npm run publish`.
2. Criar **`npm run gate`** (raiz) que roda EM SEQUÊNCIA e **falha no primeiro vermelho**,
   imprimindo qual etapa quebrou:
   - `backend`: `npm run build` + testes-chave (`test:credits` + tenant isolation + reversal)
   - `frontend`: `npm run lint` (0 errors) + `npm run build`
   - `Webwhats`: `npm run typecheck`
   - `hbx-scraping-engine`: `python -m pytest -q`
3. **Encaixar no publish**: `publish` roda `gate` ANTES e aborta se falhar. Prever escape
   explícito `--skip-gate` (ou env `HBX_SKIP_GATE=1`) para emergência, documentado.
4. Validar que `test:credits` está de fato verde (foi corrigido em `c6863102`).

## Fora de escopo
- NÃO criar GitHub Actions / GitLab / Azure.
- NÃO alterar a lógica de deploy/VPS em si — só adicionar o gate na frente.
- NÃO publicar nada.

## Guardrails
- O gate **só roda checks**, nunca publica nem toca a VPS/credenciais.
- Tem de rodar em máquina limpa. Cross-platform: o dono está em Windows/PowerShell + Git Bash —
  o script precisa funcionar nos dois (preferir Node script orquestrador a bash puro).
- Enquanto G2 (lint) e G3 (motor) não fecharem, o gate vai (corretamente) falhar nessas etapas —
  isso é esperado, não é bug do gate.

## Pronto quando
- `npm run gate` roda todos os checks e retorna **não-zero** se qualquer um falhar, com mensagem
  clara da etapa.
- `npm run publish` chama o gate antes e aborta em vermelho (salvo `--skip-gate`).
- Documentado (README curto ou no próprio doc).

## Implementado (10/07)

**Como o `npm run publish` encadeia hoje** (raiz `package.json` → `scripts/ops/publish.js` →
`scripts/ops/deploy-hostinger.js`): Publish ASAP (resumo) → Git status (`ensureMasterBranch` — só
roda em `master`) → Diff resumido → **Quality Gate (novo)** → Deploy Hostinger (que já fazia seu
próprio preflight: `prisma generate/validate`, `backend build`, `frontend build`,
`Webwhats typecheck/build/lint:check` se configurado → commit final → push → SSH Hostinger →
deploy Webwhats). O gate roda **antes** desse preflight — não substitui nem altera nada dele
(por isso backend/frontend build acabam rodando 2x num publish real: 1x no gate, 1x no preflight
do deploy-hostinger.js já existente; aceito pelo Fora de Escopo "não alterar lógica de deploy").

**Arquivos novos/alterados:**
- `scripts/ops/gate.js` (novo) — orquestrador Node puro (reusa `run()`/`runStep()` de
  `scripts/lib/runtime.js` e `scripts/ops/common.js`, o mesmo mecanismo cross-platform que já
  resolve `npm` → `npm.cmd` no Windows). Roda 8 checks em sequência, para no primeiro vermelho:
  1. `backend`: `npm run build`
  2. `backend`: `npm run test:credits` (créditos, carteira, débito master, **estorno** já incluído
     desde `c6863102`)
  3. `backend`: `npm run test:tenant-guard` (unit — trava de tenant sem banco)
  4. `backend`: `node --test dist/prisma/tenant-isolation.integration.test.js` (integration — o
     próprio teste pula sozinho com `t.skip(...)` se o Postgres local não estiver acessível;
     não quebra o gate numa máquina sem banco)
  5. `frontend`: `npm run lint` (eslint + `check-pele.mjs`; hoje sai vermelho — G2 aberto)
  6. `frontend`: `npm run build`
  7. `Webwhats`: `npm run typecheck`
  8. `hbx-scraping-engine`: `python -m pytest -q` (hoje sai vermelho — G3 aberto, 8 falhas em
     `test_social_signals.py`)
- `package.json` (raiz) — nova entry `"gate": "node ./scripts/ops/gate.js"`.
- `scripts/ops/publish.js` — nova stage `Quality Gate (G4)` entre "Diff resumido" e "Deploy
  Hostinger": roda `npm run gate` (via `runStep`, mesmo helper usado pro resto do publish) e
  deixa a exceção propagar pro `try/catch` do `main()` já existente → publish aborta com
  exit code != 0 se o gate falhar. Escape de emergência: `npm run publish -- --skip-gate` OU
  `HBX_SKIP_GATE=1 npm run publish` (reaproveita o `isTruthy` de
  `scripts/lib/webwhats-release.js`, mesmo helper que já lê `PUBLISH_VERBOSE_DRY_RUN` etc.).

**Validado nesta sessão:** `test:credits` roda verde (confirma o fix de `c6863102`). `npm run gate`
de ponta a ponta para corretamente na primeira etapa vermelha real do estado atual do repo
(frontend lint — G2 ainda aberto, 57 errors) sem chegar nas etapas seguintes; isso é o
comportamento esperado e correto do gate, não um bug dele. Quando G2/G3 fecharem, o gate chega
até o fim e fica verde sem precisar de nenhuma mudança neste arquivo.
