# RELEASE-20X — o que falta (handoff 11/07)

Diretiva "ORQUESTRAÇÃO FINAL 20X" aprovada. Decisões batidas **D1** package `br.com.hbxsystem` ·
**D2** app único, APK não vende crédito · **D3** testers = vendedores, kit pronto · **D4** comissão =
% receita real. Detalhe completo: `docs/PLANEJAMENTOS/RELEASE-20X/CONTRATOS.md` + 6 auditorias na
mesma pasta.

## ✅ Feito e COMMITADO (local, não publicado)
- **Onda 0** (6 auditorias só-leitura) + **CONTRATOS.md** (barreira).
- **Sprint 1 COMPLETA (3 commits):**
  - `97c37757` **modo-shell** — app da Play não expõe compra (detector `frontend/src/lib/hbx-shell.ts`
    por bridge/UA; esconde vitrine+checkout em `credits-wallet-section` e `bloqueio-gate`; saldo/extrato
    ficam). tsc+lint+build+check-pele verdes.
  - `faad6d84` **kit Play** — `/excluir-conta` pública + política completada + `PLAY-GUIA-DONO.md` +
    `STORE-LISTING.md`.
  - `d24d5074` **Android** — SDK 35 / AGP 8.7.3 / Gradle 8.9, `applicationId br.com.hbxsystem`, WebView
    na raiz, offline/upload/insets, fix permissões + RotaService zumbi, ícone HBX.
    **`.aab` BUILDADO E VERIFICADO**: `EntregaShell/app/build/outputs/bundle/release/app-release.aab`
    (2,4 MB, jarsigner "jar verified", cert CN=HBX System). Upload key nova fora do git; keystore antigo
    tirado do índice (segue no disco pro sideload legado).

## 🔴 Antes de subir o .aab (ordem)
1. **BACKUP da upload key FORA DO PC** — `EntregaShell/keystore-release/hbx-upload.jks` +
   `keystore.properties` (senha dentro). Perdeu depois do 1º upload = só reset via Play App Signing.
2. **VALIDAR EM APARELHO** (não testado — só build): voz Web Speech funciona no WebView? (senão tirar
   RECORD_AUDIO antes do Data safety) · insets edge-to-edge Android 15 · upload de arquivo · ícone
   renderizado · no APK, Configurações→Créditos e bloqueio-de-acesso mostram ZERO R$/CTA (é o que o
   revisor vê).
3. **Publicar o backlog local** (ver gate abaixo) pra `www.hbxsystem.com.br` servir o front do modo-shell
   e a página `/excluir-conta` — as URLs que a Play Console exige.

## ⏳ Sprints em fila (1 por vez)
- **S2 comercial (delta, dinheiro — Fable direto):** invariantes I-1/I-2 nos toggles S6/S8 (limpar campo
  do tipo oposto), reconciliador `credit-reconciler.service.ts` (11 invariantes no CONTRATO-COMERCIAL),
  welcome 50×30 (schema=30 × código=50), `expireLots` sem chamador (job), e-mail do convite master
  aponta rota 410. **Comissão D4 NÃO entra aqui — já é `PR11072026/W3` da outra sessão.**
- **S3 logística:** 2 endpoints sem gate financeiro-OFF (`resumo-dia`, `extrato`), testes faltantes
  (fila offline, cancelar/softDelete, iniciarRota) + checklist de campo (12 passos, MATRIZ-LOGISTICA) =
  dono no aparelho.
- **S4 furos:** P1 `GET /vendas/handoff/:leadId/prefill` vaza PII+CPF sem sessão/expiry; preparar
  `withoutTenantScope` no pool global ANTES de `enforce`; `MP_WEBHOOK_SIGNATURE_MODE=enforce` após 48h.
- **S5 Concierge IA:** contrato pronto (IA-CONCIERGE-CONTRATO.md, dataset 100 frases). Só implementar.
- **S6 Codex #1:** decompor `janela-empresas.tsx` (116KB) + `janela-contabil.tsx` (62KB). UNKNOWN: texto
  da issue (colar ou instalar `gh`).
- **S7 gate:** G4 já existe no tree (`scripts/ops/gate.js` + hook no `publish.js`); falta cobrir
  `npm run new` + artefatos de release.

## 🔴 Gate de publish (CONTRATOS.md §3)
Tree tem **3+ frentes AO VIVO** (MULTILOCAL, GOLIVE-DELTA, W4, PR11072026, RELEASE-20X) — 68 arquivos
modificados + migrations untracked (`credit_chargeback_debt`, `local_entrega_multi`,
`credit_action_config`). Antes do `npm run publish`: frentes fecham e commitam → migrations commitadas
COM o código que as usa → pós-publish `docker ps` + logs (build verde ≠ boot ok) → nunca
`HBX_SKIP_GATE=1`, não usar `npm run new` (G4 não cobre).
⚠️ **Lição do Sprint 1:** commit sem pathspec varre o index compartilhado de outra sessão — commitar
SEMPRE com `git commit -m ... -- <paths>` (um worker fez isso, varreu o staging alheio e teve que
reverter; ficou OK, mas é a regra).

## 🙋 Só o dono
Conta Play (US$25 + ID; ou organização c/ CNPJ+DUNS dispensa 12 testers/14d) · 12 vendedores c/ conta
Google · publicar backlog + QA · aparelho físico · e-mail de suporte oficial (a página usa placeholder) ·
decisões abertas: pool global P3, flip enforce (~09/08), preço dos packs, RBAC nº5 entra? · texto da
Issue #1 · arte da ficha fora do APK (ícone 512², feature graphic, screenshots).
