# RELEASE-20X — CONTRATOS (barreira da Onda 0)

Data: 11/07/2026 · Orquestrador: Fable · Onda 0 completa: 6 auditorias em `docs/PLANEJAMENTOS/RELEASE-20X/`
(AUDITORIA-PLAY, AUDITORIA-FUROS, CONTRATO-COMERCIAL, MATRIZ-LOGISTICA, CODEX-GIGANTE-REBASE, IA-CONCIERGE-CONTRATO).

## 1. Decisões batidas pelo dono (11/07) — ninguém reabre

| # | Decisão | Implicação |
|---|---|---|
| D1 | **applicationId definitivo `br.com.hbxsystem`** (recomendação aceita) | Package novo = app novo na Play; sideload antigo (`.entrega`) segue vivo em paralelo até os motoristas migrarem. Imutável após o 1º upload. |
| D2 | **App ÚNICO do HBX** (WebView na raiz; nativo de GPS/rota ativa só na logística) | O APK **não pode expor compra de créditos** (Payments Policy). Modo-shell esconde as 5 superfícies mapeadas na AUDITORIA-PLAY. Saldo/extrato podem aparecer; venda/preço/link de compra, não. |
| D3 | **Testers = vendedores do dono; kit 100% pronto pra ele enviar** | PLAY-GUIA-DONO.md passo-a-passo + STORE-LISTING.md + /excluir-conta pública + declarações pré-escritas. 12 contas Google × 14 dias corridos (conta pessoal). |
| D4 | **Comissão = % sobre receita REAL cobrada** (recomendação aceita) | Base = charges pagas (recarga de crédito + manual-payment enterprise). Nunca preço de tabela; sem pagamento = `pending`. Mata os 2 furos restantes (`resolvePlanAmount` L138-141; `updateLeadFromCompany` L405/414 esmagando valor negociado). Freio 8a134730 já publicado é a 1ª metade. |

Reafirmadas: modelo **2 tipos** (`credit` | `enterprise`), **track-first** (enforce OFF até ~09/08, flip = decisão explícita do dono), guardrails anti-scraper valem pra enterprise (S8 não abre bypass).

## 2. Fontes únicas de verdade (prova no CONTRATO-COMERCIAL.md)

- **Tipo de conta**: `Company.accountType` (`credit` default; `enterprise` só via master/S8).
- **Precedência de acesso**: master bypass → financeiro (escapa suspensão) → estado da empresa → kill-switch módulo (`masterEnabled×enabled`) → caixa do plano (legado intencional) → cargo (RBAC) → caps. **Saldo nunca bloqueia módulo** — só a entrega, no choke (`assertAndDebitLeadDelivery`: cap diário → hold chargeback → teto vendedor → débito FIFO fail-closed).
- **Débito real hoje**: conta credit com `HBX_CREDITS_ENABLED` já debita lead (welcome 50). Enterprise: só no cutover 2 chaves (OFF).
- **Mensalidade enterprise**: `monthlyValueOverride` (**Float em REAIS** — legado, documentado; campos NOVOS de dinheiro nascem em centavos) + cobrança = `manual-payment`. S8 (`9fc053da`, LOCAL) é o gesto único.
- **Módulo por empresa**: `CompanyModule.masterEnabled × enabled` (teto W1). Régua pública = kill-switch `SystemModule.defaultEnabled`.
- **Comissão**: contrato D4 acima. Especificação da mudança mínima no CONTRATO-COMERCIAL.md §7.
- **Motor WhatsApp**: fonte = motor ao vivo, nunca o banco do app (pendência conhecida: painel Equipe).

## 3. GATE DE PUBLISH — estado do repo agora (o maior risco da release)

O working tree tem **3+ frentes em voo simultâneo** (MULTILOCAL, GOLIVE-DELTA G1/G4, W4 /entrega, P0.3 fechado, RELEASE-20X Sprint 1). Commits locais não publicados: `9fc053da` (S8), `e1da20f7`/`f344a294` (voz), + o que as frentes commitarem.

**Antes do próximo `npm run publish` (na ordem):**
1. Frentes paralelas fecham e COMMITAM (nada de tree sujo indo de carona — publish commita o tree inteiro).
2. Migrations pendentes conferidas: `20260710140000_credit_chargeback_debt` (aditiva, DEFAULT 0, segura) e `20260710150000_local_entrega_multi` (untracked — precisa estar commitada JUNTO com o código que a usa). Deploy aplica no boot; **conferir `docker ps` + logs pós-publish** (build verde ≠ boot ok).
3. Nada de flag nova precisa ir no VPS (inventário AUDITORIA-FUROS §3: nenhum enforcement liga sozinho). Armadilha inversa: flags só-no-`.env`-do-VPS somem em recreate de container.
4. G4: gate roda no `publish.js`, **não** no `npm run new` — não usar `new` até encaixar, e nunca `HBX_SKIP_GATE=1`.

## 4. O que a Onda 0 mudou no plano da diretiva 20X

- **Sprint 2 (comercial)** encolheu pra um DELTA: (a) ~~fix comissão D4~~ → **JÁ TEM DONO: `PR11072026/03-COMISSOES-FUROS-2-3.md`** (outra sessão, aprovado 11/07, mesma decisão: base = receita real, recarga comissiona desarmada % 0) — RELEASE-20X não duplica; (b) invariantes I-1/I-2 no toggle S6/S8 (limpar campos do tipo oposto); (c) reconciliador `credit-reconciler.service.ts` (11 invariantes especificadas no CONTRATO-COMERCIAL); (d) welcome 50×30 (schema default 30 × código 50 — unificar); (e) `expireLots` sem chamador (agendar job); (f) e-mail do convite master aponta rota 410. Sem redesign — o S6/S7/S8 está coerente.
- **Sprint 3 (logística)**: cross-tenant ZERO furo (varredura ~90 chamadas). Resta: 2 endpoints sem gate financeiro-OFF (`resumo-dia`, `extrato`), testes faltantes listados (fila offline, cancelar/softDelete, iniciarRota), e o **checklist de campo de 12 passos** (MATRIZ-LOGISTICA) que só o dono executa em aparelho.
- **Sprint 4 (furos)**: sem P0. P1 único: `GET /vendas/handoff/:leadId/prefill` vaza PII+**CPF** sem sessão/expiração (fix mínimo especificado). P2: preparar `withoutTenantScope` no pool global ANTES de qualquer `enforce` do tenant-guard. P3 config: `MP_WEBHOOK_SIGNATURE_MODE=enforce` após 48h de logs limpos. P3 decisão do dono: pool global entrega e-mail enriquecido pago por outro tenant (commons ou esconder?).
- **Sprint 5 (Concierge)**: contrato pronto (IA-CONCIERGE-CONTRATO.md) com dataset de 100 frases. Infra toda publicada; `/assistente` JÁ está em prod (memória corrigida). Busca exige cidade+segmento. 4B único no caminho crítico; 30B nunca.
- **Sprint 6 (Codex #1)**: plano/trial/self-checkout SUPERSEDED (prova 410); governança/quota/dedupe DONE. REMAINING real: decompor `janela-empresas.tsx` (116KB) e `janela-contabil.tsx` (62KB), painel Equipe ler motor ao vivo, RBAC nº5 (27 chaves), Cockpit nº8. Rascunho do comentário de fechamento pronto no relatório. UNKNOWN residual: precisa do texto da issue (dono cola ou instala `gh`).
- **Sprint 7 (gate)**: G4 já EXISTE no tree (`scripts/ops/gate.js` + hook no publish). Evolução: cobrir `npm run new`, agregar suites P0 restantes e artefatos de release.

## 5. Ownership (arquivos reservados por frente ativa)

| Frente | Território | Status |
|---|---|---|
| RELEASE-20X S1-A | `EntregaShell/**` | Worker em voo |
| RELEASE-20X S1-B | `frontend/src/lib/hbx-shell.ts` + 5 superfícies de compra (wallet/checkout/bloqueio-gate/configuracoes§créditos/shell:913/public-entry packs) | Worker em voo |
| RELEASE-20X S1-C | `frontend/src/app/excluir-conta/**` + página políticas (texto) + docs RELEASE-20X | Worker em voo |
| MULTILOCAL + GOLIVE-DELTA + W4 | `backend/src/logistica|financeiro|credits`, `schema.prisma`, `frontend/src/app/entrega/**`, vários `page.client` | **OUTRA SESSÃO — não tocar** |
| PR11072026 (W1 overlay catálogo, W3 comissão furos 2+3) | `backend/src/commissions/**`, `credit-action-*` | **OUTRA SESSÃO — não tocar** |
| Sprint 2 delta (dinheiro) | `credits/credit-reconciler.service.ts` (novo), `modules.service.ts` (toggles I-1/I-2), welcome 50×30, expireLots job | Fila — Fable edita direto (regra dinheiro), APÓS PR11072026 fechar |

## 6. Só-o-dono (nada disso um worker resolve)

1. **Conta Play** (US$25, verificação de identidade) — ou avaliar conta de ORGANIZAÇÃO (CNPJ+DUNS: dispensa 12 testers/14d, verificação mais lenta).
2. **12 testers** = vendedores com conta Google (lista de e-mails).
3. **Publicar** o backlog local (ordem do §3) e aplicar QA pós-publish.
4. **Aparelho físico**: checklist de campo (MATRIZ-LOGISTICA §12) + validar voz no WebView.
5. **E-mail de suporte** oficial (página /excluir-conta usa placeholder se não houver).
6. Decisões abertas: pool global (P3), flip enforce (~09/08 com dado do track), preço dos packs (copy "placeholder" em prod), RBAC nº5 entra na release?
7. Texto da Issue #1 (colar) ou instalar `gh` — pra zerar os UNKNOWN do Sprint 6.
