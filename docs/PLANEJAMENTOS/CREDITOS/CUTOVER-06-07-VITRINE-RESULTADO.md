# CUTOVER 06/07 — VITRINE — RESULTADO (worker Sonnet, front)

> Implementado LOCAL, sem publicar/commitar/branch, sem rodar o app. Checks: `npx tsc --noEmit`
> verde, `npm run build` verde, `node scripts/check-pele.mjs` verde (0 violações, catraca 495/495).

## Regra-mãe aplicada
Todas as 3 superfícies chamam `fetchCreditStorefront()` e branch em `sf.enabled`:
`true` → modelo GRÁTIS; `false`/ainda carregando → vitrine de PLANOS de hoje intacta
(fallback = estado inicial do `useState`, então zero flash errado antes do fetch resolver).

## Achado antes de codar (documentando pro Opus)
`frontend/src/lib/credits-storefront.ts` **não existia** — o brief assumia que já estava pronto
("data layer... JÁ FEITO"). Criei o arquivo do zero, espelhando exatamente o padrão de
`fetchPublicPlans()` em `plans.tsx` (cache de módulo + fallback silencioso). Contrato bate 100%
com `GET /credits/public-catalog` (`credits-public.controller.ts`): `{ enabled, packs[], welcomeCredits, welcomeExpiryDays }`.

Também os nomes de endpoint do brief para o F6 ("`/auth/whatsapp/confirm/start`+`/confirm/code`")
não existem — os reais são `POST /auth/onboarding/whatsapp/start` e `POST /auth/onboarding/whatsapp/confirm`
(`auth.controller.ts:45-58`). **Não foi preciso criar nada**: o F6 no front **já existia e está
completo** em `register/page.client.tsx` (estado `waStep: idle→phone→code`, linhas ~90-98 e
420-473 antes da minha edição) — só pré-preenchi o telefone quando o modelo é grátis (já foi
digitado no cadastro), pra não pedir de novo.

## Arquivos alterados

### 1. `frontend/src/lib/credits-storefront.ts` (NOVO)
Data layer único: `fetchCreditStorefront()` → `GET /credits/public-catalog`, cache de módulo,
fallback `{ enabled:false, packs:[], welcomeCredits:0, welcomeExpiryDays:0 }` em qualquer erro
(regressão zero garantida mesmo se o endpoint cair).

### 2. `frontend/src/lib/plans.tsx`
Removida toda linha "X leads/leads inteligentes por mês" de `PLAN_STATIC.*.points()` (as únicas
3 ocorrências, confirmadas por grep antes de editar):
- `hbx_lite.points` (era linha ~116): `${cards...} leads por mês` — removida.
- `hbx_padrao.points` (era linha ~144): `${cards...} leads inteligentes por mês` — removida.
- `hbx_pro.points` (era linha ~170): idem — removida.
Assinatura de `points` mantida (`(includedUsers, cardsPerMonth)`) — só o parâmetro `cards`
passou a `_cards` (não usado) pra não quebrar quem chama. **Não toquei** `plan-card.tsx` (linha
56, `allFeats` com `cardsPerMonth`): é componente COMPARTILHADO com Configurações → Plano e
cobrança (clientes pagos existentes, fora do escopo "propaganda pública"); com a chavinha ON a
landing não invoca mais esse card no modelo grátis, então a linha nunca aparece lá. Fora de
escopo mexer no card de billing dos clientes atuais.

### 3. `frontend/src/app/page.client.tsx`
- Import de `fetchCreditStorefront`; state `creditsEnabled`/`welcomeCredits` (fetch no mount).
- 2 states novos só do modelo grátis: `freeImplantacaoOpen` (card Company) e `freeRegisterOpen`
  (card Grátis) — resetados em `goView` junto com os states de plano existentes.
- View "planos" (~linha 858 em diante) virou 2 blocos irmãos:
  - `creditsEnabled === true`: pitch "Cadastre-se grátis" + card único (`.site-plan2` reaproveitado,
    SEM `PlanCard` pq não há preço/plano) com headline, 3 bullets e CTA "Cadastrar grátis"
    (abre `<RegisterPanel embedded />` sem `selectedPlanKey` — o próprio painel decide o form
    grátis) + card Company/Implantação (reusa `PlanCard planKey="hbx_melhor"` + `ImplantacaoContato`,
    igual ao fluxo de hoje, só que sem passar pela esteira animada de planos).
  - `creditsEnabled === false`: bloco ORIGINAL, byte a byte (esteira animada, `choosePlan`,
    `PlanCard` × 4, `PlanDetailCard`, ciclo mensal/anual) — intocado, é o fallback.
- CSS nova: `.site-plans--free` em `hbx-theme/screens.css` (grid de 2 colunas, ~360px cada,
  1 coluna em mobile) — só `grid-template-columns`/`width`, zero cor/token novo.
- Deep-link: `/register` e `/planos` redirecionam pra `/?ver=planos` (rotas existentes,
  `register/page.tsx` e `planos/page.tsx`, não alterei). Sem `?plan=`, com a chavinha ON, o
  efeito de mount agora chama `fetchCreditStorefront()` e abre `freeRegisterOpen` direto —
  **decisão**: como o modelo grátis não tem plano pra "escolher", `/register` e `/?ver=planos`
  colapsam na mesma ação (form direto). Se o dono quiser um passo intermediário (pitch antes do
  form) especificamente pra quem chega por link cru, é 1 linha pra tirar (readicionar `return`
  antes do `fetchCreditStorefront` bloco).

### 4. `frontend/src/app/register/page.client.tsx`
- Import de `fetchCreditStorefront`; states `creditsEnabled`/`welcomeCredits` (fetch no mount),
  `freeTelefone`/`freeCpf` (novos campos do form grátis).
- `onSubmit`: valida telefone obrigatório quando `creditsEnabled` (mensagem amigável antes de
  bater no backend); body do POST `/auth/signup` bifurca — modo grátis manda
  `trialContactPhone`/`trialTaxDocument` (nomes EXATOS que `auth.service.ts:1604,1609` espera:
  `data.trialContactPhone`/`data.trialTaxDocument`) e **não manda `selectedPlanKey`**; modo
  planos inalterado.
- `needsCheckout`: ganhou `!creditsEnabled &&` na frente — modelo grátis nunca abre `CheckoutPanel`
  (não há venda no cadastro).
- Tela "aguardando confirmação": título/subtítulo bifurcam pra `creditsEnabled` — texto exato do
  brief: "Confirme seu email e telefone para liberar seus {welcomeCredits} créditos." Título
  "Falta pouco — confirme sua conta".
- Form de cadastro: título "Criar sua conta grátis", subtítulo com a pitch completa (`welcomeCredits`
  créditos, "1 crédito = 1 lead entregue e validado. A busca é grátis. Sem cartão."). Campo
  "Empresa" some (`!creditsEnabled`); campo telefone (obrigatório, `type="tel"`) e CPF (opcional,
  só dígitos) aparecem quando `creditsEnabled`. Botão Google segue disponível (backend permite
  Google-signup sem telefone hoje — `signupWithGoogle` em `auth.service.ts:1445-1522` não exige
  telefone, é caminho legítimo separado do `signup` normal; não mexi nisso, é contrato de backend).
- CTA "Confirmar pelo WhatsApp" pré-preenche `waPhone` com o telefone já digitado no cadastro
  (`freeTelefone`) — não obriga digitar 2×.

## Design System
Zero hex/cor/inline/sombra/radius novo. `.site-plans--free` só mexe em grid/width (tokens
existentes intocados). `check-pele.mjs`: 0 violações duras, catraca não subiu (495/495 — igual
ao baseline antes da minha mudança).

## O que sobrou pro Opus
1. **Máquina de acesso** (já marcado como dele no brief): `activateConfirmedTrialTx`/`status`/
   `next`/`requiresCheckout` — hoje `signupWithGoogle` cria a empresa com `status: pending_checkout`
   e `isActive: false`; no modelo grátis confirmar email deveria ativar direto com os créditos,
   sem checkout. Não toquei backend.
2. **Ambiguidade de UX documentada acima**: `/register` e `/planos` (mesma URL final
   `/?ver=planos` sem `?plan=`) agora pulam direto pro form no modo grátis — se o dono quiser a
   pitch como passo intermediário obrigatório mesmo vindo de link cru, é decisão de produto, não
   bug (é 1 linha pra ajustar, comentário no código explica onde).
3. Não criei/editei nada em `credits-master.controller.ts`, `credit-pack-catalog.ts`, ou qualquer
   preço/checkout/saldo — fora de escopo do brief e não mexido.

## Como testar (quando o dono mandar rodar)
Com `HBX_CREDITS_ENABLED=true` no `backend/.env` (já está, conferido): abrir `/` → escolher lado
(empresa/autônomo) → "Ver planos"/"Falar com especialista" → deve cair na pitch grátis com
50 créditos (valor vem do backend, `getWelcomeCreditsDefault()`). Clicar "Cadastrar grátis" abre
o form sem campo Empresa, com telefone obrigatório e CPF opcional. Com a chavinha OFF, tudo
volta ao funil de 4 planos de hoje sem nenhuma diferença visual.
