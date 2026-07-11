# PR10072026 — Módulos (teto master×uso admin) + Financeiro cliente + mobile só-logística

Contexto/contratos: `docs/PLANEJAMENTOS/PR10072026/CONTRATOS.md` + W1-W4.md. Auditoria-base: memória `modulos-auditoria-10-07.md`.

## Estado
- **W1-W3 JÁ EM PROD** (publishes do dono `1501bd42`/`3ddb9765` 10/07 20:51/20:57 varreram trabalho parcial).
- **W4 (/entrega) + fix dos 4 graves = LOCAL na working tree, NÃO commitado/publicado.** Typecheck back+front VERDE; testes 158 pass (dist/modules 66 + dist/logistica 92 + module-categories.test novos). check-pele 514/514.
- ⚠️ Working tree tem MUITO trabalho de OUTRAS sessões em paralelo (PR11072026 comissão, RELEASE-20X, GOLIVE-DELTA, MULTILOCAL, S8, VOZ, Android/Play). NÃO reverter o que não é meu. Meu pacote = módulos/financeiro/entrega.

## 🔴 URGENTE — bug VIVO em prod (fix pronto local, falta publicar)
Ciclo options→POST de categorias **desliga módulo VIVO**: company 40 (Vander) tem atendimento=t/bot=f → categoria whatsapp reporta enabled=false → se o admin togglar QUALQUER outra categoria em /configuracoes ou /entrega/ajustes, o POST omite 'whatsapp' e grava atendimento=false → **WhatsApp de atendimento morre sem aviso**. Companies 38/39 no mesmo estado-armadilha. **Fix já aplicado local** (semântica ANY em options + escrita por INTENÇÃO `planCategoryModuleWrites` em users.service.ts; `resolveModuleDefaultWithoutOverride` em modules.service.ts p/ o 403). Reparo de DADO de quem já foi afetado: conferir MasterSupportAuditLog evento MODULE_CATEGORIES_TOGGLED (código não repara retroativo).

## Falta fazer (ordem)
1. **PUBLICAR o fix dos 4 graves** (é decisão do dono — está local). Sem isso o Vander perde atendimento ao mexer no toggle.
2. **2 furos de regra DURA do MEU pacote, NÃO corrigidos** (frente financeira = Opus edita direto):
   - `GET /logistica/financeiro/saldos` sem gate de role → vendedor USER vê carteira de devedores. **LEI DO VENDEDOR** (só Admin vê valores). Add gate Admin no controller/service.
   - `GET /logistica/clientes/:id/entregas` devolve valor/valorUnit/cobrancaStatus sem checar `moduloFinanceiroAtivo` nem role → **regra M4** ("financeiro OFF = dinheiro não aparece"). Alinhar fail-closed com `saldosFinanceiro`. (Extrato pré-existente `/clientes/:id/extrato` tem o mesmo furo — decidir se entra junto.)
3. **TESTAR E2E** (dono cobra teste, não só verde técnico): Chrome localhost:3001, login `teste`/`teste123`. Backend local Docker NÃO vê watch no Windows → precisa `restart`/rebuild pra pegar backend novo. Cenários: (a) só-logística mobile cai em /entrega sem HBX; (b) toggle de módulo em Ajustes liga Radar e reflete na tab bar; (c) Financeiro na ficha do cliente → extrato+Marcar pago; (d) company 40 → togglar Website mantém atendimento ON (prova do fix).
4. **Commit local** do pacote (só depois do E2E). Publish só por ordem do dono.

## Decisões ABERTAS pro dono (achados médios, não corrigidos)
- **Master perdeu alavanca de LIGAR módulo**: PUT /modules/master/company/:id agora só escreve teto (masterEnabled); linha enabled=false (inclusive OFFs do próprio master pré-migração, backfill masterEnabled=true) não religa pelo painel. Company 5 tem 4 linhas nesse estado. Fix: ação na ficha p/ escrever camada empresa OU PUT aceitar 2º campo companyEnabled.
- **Suspensão** (W1 removeu wipe de CompanyModule): leitores DIRETOS sem checar status — messaging.service.ts:509, inbox.service.ts:2609 (hbx_recovery), vendas.service.ts:359 (bot) — veem módulo ON p/ empresa suspensa. Rotas HTTP OK (policy cobre); esses pipelines não passam por canUserAccessModule.
- **quitarCharge** não fecha DebtCase do hbx-recovery → cliente que pagou continua recebendo cobrança no WhatsApp (risco ban de chip).
- **Paginação histórico**: keyset por scheduledAt mas exibe por deliveredAt — desordem só visual entre páginas (raro).
- Re-ligar categoria toda-desligada liga TODOS os módulos dela (bot junto do atendimento) — residual da UI por categoria; mix por-módulo só o master edita.

## ⚠️ Achados de OUTRAS sessões (avisar dono, NÃO é meu pacote — não corrigir sem pedir)
- **VOZ-ENTREGUE (commit e1da20f7, EM PROD):** `voz.ts:60` matcher por substring — 'não foi entregue' casa 'entregue' → **confirma entrega + dispara WhatsApp real + lança cobrança**; mic armado por default, folha abre sozinha por geofence. AÇÃO LIVE irreversível sem confirmação. PERIGOSO. (também: erro 'network' religa em loop → dreno de bateria.)
- **Android APK (d24d5074?, MainActivity.kt:80):** onPermissionRequest concede mic pela URL atual do WebView, não pela origem do request → iframe estranho ganha mic.
- **P0.3 chargeback (credit-wallet.service.ts, LOCAL):** settleChargebackDebtFromBalance não-atômico → dupla quitação concorrente consome 2× a dívida do saldo. E hold só quita com crédito NOVO → empresa com saldo sobrando trava recebimento de lead.
- **G1 prisma (prisma.service.ts, LOCAL):** advisory lock re-lança timeout 30s → boot cai (repete o 502 de 04/07) se ensures demorarem.
- **Migration untracked:** schema.prisma (tracked) depende de `20260710140000_credit_chargeback_debt` + `20260710150000_local_entrega_multi` (UNTRACKED). Commit de schema sem as pastas = P2022 em prod (Entrega/ClienteProduto/CreditWallet). Commitar schema+migrations JUNTOS.

## Sujeira p/ limpar
- CSS morto em HEAD (kit.css): `.ctx-msg.warn`, `.txt-muted` + comentário — varridos p/ commit 9fc053da da sessão paralela, sem uso.
- 2 erros eslint pré-existentes em entrega/ajustes/page.client.tsx (set-state-in-effect ~227/660) — pré-datam W4.
