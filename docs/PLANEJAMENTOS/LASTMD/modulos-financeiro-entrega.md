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

## Perigos — RESOLVIDOS 11/07 (dono pediu "resolva os perigos")
- ✅ **VOZ-ENTREGUE (voz.ts):** matcher por substring reescrito → `classificarComandoVoz()`+`normalizarTranscript()` puros (NFD+`\p{Diacritic}`): negação explícita → nao_entregue; QUALQUER negação solta ("nao"/"nunca") mata o positivo; positivo só por frase deliberada ("confirmar entrega"/"entrega confirmada") OU palavra inteira "entregue"/"entreguei" em fala ≤3 palavras. "confirma"/"confirmar" sozinhos NÃO confirmam mais. Viés de segurança (na dúvida NÃO dispara ação live). Validado 15/15 casos (inclui "não foi entregue"→nao_entregue e "confirma aí o pedido de amanhã"→null). Front tsc verde.
- ✅ **P0.3 chargeback (credit-wallet.service.ts):** JÁ estava corrigido pela sessão paralela (go-live 11/07) — reserva atômica da dívida (updateMany condicional optimistic-lock) + refund do (claim-consumed) no `finally`. Reconferi: correto e completo. Teste de concorrência "não queimam crédito em dobro" passa (29/29).
- ✅ **G1 prisma (prisma.service.ts):** timeout da tx do advisory lock 30s→**300s** (os ensures são awaitados dentro da tx, então o timeout limita a duração TOTAL deles; 30s derrubava boot sob disputa de lock). NÃO fiz fail-open pós-adquirir (risco de DDL 2× na conexão própria) — comentários reescritos honestos. Boot só falha se DB travado >5min (orquestrador reinicia).
- ✅ **Migration untracked (verificado):** `prisma validate` 🚀; as 3 pastas untracked (`20260710140000_credit_chargeback_debt`, `20260710150000_local_entrega_multi`, `20260711020000_credit_action_config`) são TODAS aditivas/IF-NOT-EXISTS e consistentes com o schema. **AÇÃO DO DONO no commit:** `git add` das 3 pastas JUNTO com schema.prisma — schema sem elas = P2022 em prod (Entrega/ClienteProduto/CreditWallet/CreditActionConfig).
- ⚠️ **Android APK (MainActivity.kt:80) — NÃO resolvido (fora do repo web, é Kotlin/EntregaShell):** onPermissionRequest concede mic pela URL atual do WebView, não pela origem do request. Baixo risco hoje (WebView só carrega o próprio host). Corrigir comparando `request.origin`. Decisão do dono.

## Sujeira p/ limpar
- CSS morto em HEAD (kit.css): `.ctx-msg.warn`, `.txt-muted` + comentário — varridos p/ commit 9fc053da da sessão paralela, sem uso.
- 2 erros eslint pré-existentes em entrega/ajustes/page.client.tsx (set-state-in-effect ~227/660) — pré-datam W4.
