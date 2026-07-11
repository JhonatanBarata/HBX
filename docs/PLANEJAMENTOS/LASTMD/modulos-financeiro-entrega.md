# PR10072026 — Módulos (teto master×uso admin) + Financeiro cliente + mobile só-logística

Contexto/contratos: `docs/PLANEJAMENTOS/PR10072026/CONTRATOS.md` + W1-W4.md. Auditoria-base: memória `modulos-auditoria-10-07.md`.

## Estado
- **W1-W3 JÁ EM PROD** (publishes do dono `1501bd42`/`3ddb9765` 10/07 20:51/20:57 varreram trabalho parcial).
- **W4 (/entrega) + fix dos 4 graves = LOCAL na working tree, NÃO commitado/publicado.** Typecheck back+front VERDE; testes 158 pass (dist/modules 66 + dist/logistica 92 + module-categories.test novos). check-pele 514/514.
- ⚠️ Working tree tem MUITO trabalho de OUTRAS sessões em paralelo (PR11072026 comissão, RELEASE-20X, GOLIVE-DELTA, MULTILOCAL, S8, VOZ, Android/Play). NÃO reverter o que não é meu. Meu pacote = módulos/financeiro/entrega.

## 🔴 URGENTE — bug VIVO em prod (fix pronto local, falta publicar)
Ciclo options→POST de categorias **desliga módulo VIVO**: company 40 (Vander) tem atendimento=t/bot=f → categoria whatsapp reporta enabled=false → se o admin togglar QUALQUER outra categoria em /configuracoes ou /entrega/ajustes, o POST omite 'whatsapp' e grava atendimento=false → **WhatsApp de atendimento morre sem aviso**. Companies 38/39 no mesmo estado-armadilha. **Fix já aplicado local** (semântica ANY em options + escrita por INTENÇÃO `planCategoryModuleWrites` em users.service.ts; `resolveModuleDefaultWithoutOverride` em modules.service.ts p/ o 403). Reparo de DADO de quem já foi afetado: conferir MasterSupportAuditLog evento MODULE_CATEGORIES_TOGGLED (código não repara retroativo).

## Falta fazer (ordem)
1. **PUBLICAR o fix dos 4 graves + os 2 gates de segurança** (decisão do dono — tudo LOCAL, verde). Sem isso o Vander perde atendimento ao mexer no toggle.
2. ✅ **FEITO (11/07, Opus edita direto — frente financeira):** os 2 furos de regra DURA fechados e testados:
   - `GET /logistica/financeiro/saldos` → **@Admin** (LEI DO VENDEDOR). Vendedor USER não puxa mais a carteira.
   - `GET /logistica/clientes/:id/entregas` → **@Admin** + gate **M4** (`moduloFinanceiroAtivo` OFF → valor/valorUnit/cobrancaStatus null; data/itens/whatsapp ficam). Front: `ClienteEntrega.valor` agora `number|null`, `fmtMoney` aceita null. Duplicidade (admin-only, allSettled) degrada sem crash. Typecheck back+front verde; testes logística 51/51 (novo teste M4) + módulos 33/33. Extrato pré-existente `/clientes/:id/extrato` NÃO gateia (mesmo furo antigo) — decisão do dono se entra junto.
3. **TESTAR E2E** (dono cobra teste, não só verde técnico): Chrome localhost:3001, login `teste`/`teste123`. Backend local Docker NÃO vê watch no Windows → precisa `restart`/rebuild pra pegar backend novo. Cenários: (a) só-logística mobile cai em /entrega sem HBX; (b) toggle de módulo em Ajustes liga Radar e reflete na tab bar; (c) Financeiro na ficha do cliente → extrato+Marcar pago; (d) company 40 → togglar Website mantém atendimento ON (prova do fix); (e) vendedor USER → GET /logistica/financeiro/saldos = 403.
4. **Commit local** do pacote (só depois do E2E). NÃO commitei: árvore tem MUITO trabalho de sessões paralelas (migrations untracked, S8, VOZ, Android, P0.3) — commit amplo varreria tudo junto. Publish/commit fica com o dono, como vem fazendo.

## Decisões ABERTAS pro dono (achados médios, não corrigidos)
- **Master perdeu alavanca de LIGAR módulo**: PUT /modules/master/company/:id agora só escreve teto (masterEnabled); linha enabled=false (inclusive OFFs do próprio master pré-migração, backfill masterEnabled=true) não religa pelo painel. Company 5 tem 4 linhas nesse estado. Fix: ação na ficha p/ escrever camada empresa OU PUT aceitar 2º campo companyEnabled.
- **Suspensão** (W1 removeu wipe de CompanyModule): leitores DIRETOS sem checar status — messaging.service.ts:509, inbox.service.ts:2609 (hbx_recovery), vendas.service.ts:359 (bot) — veem módulo ON p/ empresa suspensa. Rotas HTTP OK (policy cobre); esses pipelines não passam por canUserAccessModule.
- **quitarCharge** não fecha DebtCase do hbx-recovery → cliente que pagou continua recebendo cobrança no WhatsApp (risco ban de chip).
- **Paginação histórico**: keyset por scheduledAt mas exibe por deliveredAt — desordem só visual entre páginas (raro).
- Re-ligar categoria toda-desligada liga TODOS os módulos dela (bot junto do atendimento) — residual da UI por categoria; mix por-módulo só o master edita.

## Perigos — TODOS RESOLVIDOS 11/07 ("resolva os perigos" + "corrija tudo sem pendências")
Validação final: backend build OK, **114/114** (logística+credits+módulos), recovery 21/22 (só o vermelho PRÉ-EXISTENTE [[ledger-test-vermelho-prod]]), frontend tsc 0, check-pele 514/514 0 violações. Tudo LOCAL, não publicado.
- ✅ **VOZ-ENTREGUE (voz.ts) — REFEITO após revisão adversarial furar a 1ª versão** ("nem/num foi entregue" e "foi entregue?" ainda confirmavam). Agora exige **comando DELIBERADO de 2 partes**: verbo de confirmação (confirmar/confirma/confirmado…) + palavra de entrega, SEM negação. Palavra solta "entregue" NÃO confirma. Negação inclui coloquiais BR (nao/num/nem/nunca); "?" suprime o positivo. Revalidado **18/18** (todos os casos críticos do revisor fechados). aria-label/comentário ensinam "confirmar entrega".
- ✅ **P0.3 chargeback:** já corrigido pela sessão paralela (reserva atômica + refund no `finally`); reconferido correto. ⚠️ Revisor achou 1 ressalva **PRÉ-EXISTENTE não-minha**: se `consumeOpenLots` lançar DEPOIS de committar lote(s), `consumed`=0 e o finally restaura dívida inteira → some crédito sem baixar dívida. É buraco antigo do design append-only (idêntico ao código velho), NÃO regressão. **Flag pro dono/go-live.**
- ✅ **G1 prisma:** timeout do lock 30s→300s (limita duração total dos ensures); sem fail-open pós-adquirir (evita DDL 2×). Revisor: SEGURO.
- ✅ **Migration untracked:** validado consistente. **AÇÃO DO DONO:** `git add` das pastas de migration JUNTO com schema.prisma — agora são **4** (as 3 + a NOVA `20260711120000_recovery_customer_source_module`).
- ✅ **Android APK (MainActivity.kt):** mic agora concede por `request.origin` host == ALLOWED_HOST (não mais webView.url); iframe estranho negado. (Kotlin não compila aqui — QA Gradle é do dono.)
- ✅ **Extrato pré-existente `/clientes/:id/extrato`:** ganhou @Admin (LEI DO VENDEDOR) + M4 (financeiro OFF → charges [] + saldos null, fail-closed). Tipo front espelhado (number|null + moduloFinanceiroAtivo) + guardas `?? 0`.
- ✅ **Guarda de suspensão:** 3 leitores diretos de CompanyModule (messaging/inbox recovery, vendas bot) agora gate por `resolveCompanyAccessState(company).canUse` — empresa suspensa/overdue/pending_checkout não roda mais automação; liberada inalterada.
- ✅ **Quitar-fiado → recovery:** baixa de fiado fecha o caso no funil (para a cobrança WhatsApp de quem pagou), best-effort (nunca quebra a baixa). **Escopado por origem** (fix do bug MEDIA que a revisão pegou): coluna nova `HbxRecoveryCustomer.sourceModule` — só casos `'logistica'` (injetados pelo varrer) são auto-quitáveis; caso MANUAL/externo NUNCA é tocado (não zera dívida manual de mesmo cliente). Existentes = null = seguros.

## Cosmético (NÃO é pendência funcional — deixado de propósito)
- `.ctx-msg.warn`/`.txt-muted` no kit.css: são variantes de design-system válidas (irmãs de .ok/.err + utilitário de cor por token), não código morto errado. Removê-las mexeria em arquivo de sessão paralela por valor nulo.
- 2 eslint pré-existentes em entrega/ajustes (set-state-in-effect): pré-datam W4, arquivo de outra frente. Warnings, não erros.
