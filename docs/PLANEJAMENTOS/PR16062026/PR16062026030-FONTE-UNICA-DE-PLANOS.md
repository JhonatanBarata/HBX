# PR16062026030 — FONTE ÚNICA DE PLANOS (todo NÚMERO nasce no backend)

> **Ordem do dono (16/06):** depois de eu confirmar o conserto, ele perguntou "tem como puxar
> mais coisa? sei lá acessos, assim quando mudar já muda de uma vez?". Decisão: **não é só o
> preço — todo o NÚMERO de plano puxa do backend** (preço, desconto anual, volume, usuários).
> "Acessos/módulos na vitrine" ele deixou de fora (ver §FORA DE ESCOPO). Pediu pra **salvar o
> plano e finalizar — não aplicar agora.** Liga o verde no "go".
>
> **Este doc SUBSTITUI o antigo `PR16062026006-FONTE-UNICA-DE-PLANOS.md`** (mesmo assunto,
> escopo ampliado). O 006 foi apagado (dono já tinha autorizado removê-lo).

## DE ONDE VEM (não reanalisar do zero)
O front migrou pra "casca única" (15/06) mas a migração ficou **pela metade**: telas foram
**copiadas** em vez de virarem **um componente + uma fonte**. O register fez certo (um
`RegisterPanel` montado em 2 lugares); o login e os **dados de plano** furaram o padrão.

- **Conserto 1 (login fora da casca) — ✅ FEITO e verificado ao vivo (16/06).** A view `entrar`
  (login por CPF, que o backend nunca aceitou) foi removida da casca; "Entrar" abre `/login`
  (tela única, por e-mail); `/?ver=entrar` legado redireciona. Arquivos: `page.client.tsx`,
  `hbx-scene.tsx`. (Histórico — não precisa refazer.)
- **Conserto 2 (este doc) — PLANEJADO, não aplicado.**
- Fonte da verdade de plano/preço = **`backend/src/commercial-plans/commercial-plan-catalog.ts`**
  (regra do dono: fonte única; "não mentir" — site nunca contradiz a cobrança).

## O PROBLEMA (por que "as telas estão diferentes")
Dado de plano está **escrito à mão em vários lugares** do front → o mesmo plano lê valores/copy
diferentes dependendo de qual arquivo desenhou. Mapa real (lido no código, não no antigo .md):

| Dado | Onde está hoje (hardcoded) | Verdade no backend |
|---|---|---|
| **Preço mensal** (string `"R$ 49,00"`) | `frontend/src/app/page.client.tsx:82` (`PLANS`) | `COMMERCIAL_PRICING` / `monthlyPrice` |
| **Preço mensal** (number `49`) | `frontend/src/components/hbx/checkout-panel.tsx:15` (`PRICE`) | idem |
| **Desconto anual** (`* 0.8`) | `checkout-panel.tsx:81` | `annualDiscountPercent: 20` |
| **Desconto anual** (`-20%` / `2 meses grátis`) | `checkout-panel.tsx:143`, `page.client.tsx:418` | idem |
| **Volume** (`880/2.200/3.500 leads`) | copy de `PLANS` + `PLAN_INFO` | `COMMERCIAL_PLAN_QUOTAS.cardsPerMonth` |
| **Usuários inclusos** (texto livre) | `DETAILS.points` (`page.client.tsx`) | `COMMERCIAL_PLAN_INCLUDED_USERS` |
| **Copy compartilhada** (`tag`, `feats`) | **DUPLICADA**: `PLANS` (casca) ≡ `PLAN_INFO` (register), palavra por palavra | — (é copy, fica no front) |

> **O register NÃO mostra preço** (`PLAN_INFO`/`PLANO_COPY` não têm valor) — então o preço
> hardcoded vive em **2 lugares** (casca + checkout), não 3. O .md antigo errava aqui.

## ACHADO QUE JÁ ESTÁ MENTINDO (motivo concreto pra puxar do backend)
O detalhe do **Pro** diz *"administrador + 5 funcionários"* (`page.client.tsx:139`), mas o
backend libera **3** usuários inclusos no Pro (`COMMERCIAL_PLAN_INCLUDED_USERS[hbx_pro] = 3`).
A tela já contradiz a regra. Puxar do backend **conserta isso de graça.**

## ESCOPO = o "balde de NÚMERO" (decisão do dono 16/06)
Tudo que é número e **pode mentir** passa a nascer no catálogo e a tela só lê:
1. **Preço mensal** (mata o hardcode da casca + checkout).
2. **Desconto anual** (mata o `* 0.8` e os "−20%"/"2 meses grátis").
3. **Volume** — cards/leads por mês.
4. **Usuários inclusos** (conserta a mentira do Pro).
5. **Trial** — `trialDays` (o público já entrega; só consumir de lá).

## FORA DE ESCOPO (o dono tirou — é OUTRA tarefa)
**Exibir a lista de módulos/acessos (Vendas, Bot IA, Recovery…) dentro dos cards** NÃO entra.
Motivo: isso **já é fonte única no backend pro runtime** (`module-access-policy` decide o que a
empresa usa ao entrar). Trazer essa lista técnica pra vitrine = **mudar o que o card escreve/
mostra** (decisão de produto/copy), não é mais "não divergir". Se um dia quiser, abre bloco
próprio. **Aqui não.**

## DISTINÇÃO QUE GUIA TUDO: número x copy
- **Número/estrutura → backend** (preço, desconto, volume, usuários, trial). Tela nunca crava.
- **Copy narrativa → front, UM módulo só** (`accent`, ícone SVG, `tag`, `feats` curtas, `cta`,
  `score`, `DETAILS`, `PLANO_COPY`, `badge`, prefixo "A partir de" do Company). É marketing —
  o backend não inventa texto. Hoje a copy está **duplicada** entre `PLANS` e `PLAN_INFO`; vira
  uma fonte só.

> As `features[]` longas do backend (10+ itens) **não** substituem as `feats` curtas do front —
> são listas diferentes de propósito (marketing). Não trocar; do backend vem só o número.

## DESENHO
1. **Backend — ampliar o endpoint público (leve, read-only, NÃO toca cobrança/auth):**
   `GET /commercial-plans/public-catalog` (`commercial-plans.controller.ts:13`) hoje devolve
   `key, title, monthlyPrice, trialDays, includedUsers, headline, description, badge,
   recommended, features[]`. **Adicionar:** `annualDiscountPercent` e
   `cardsPerMonth` (de `COMMERCIAL_PLAN_QUOTAS`). (`includedUsers` e `trialDays` já vêm.)
   > Muda o "backend: nenhum" do .md antigo — agora há uma adição segura de campos de leitura.
2. **Front — novo `frontend/src/lib/plans.ts`:** tipo `PublicPlan` (espelha o endpoint),
   `fetchPublicPlans()` (1 fetch + **cache em memória** + **fallback** com os números conhecidos,
   pra casca/checkout não piscarem branco pré-login), helper `formatBRL`. A **copy compartilhada**
   (`accent`, `ic`, `tag`, `feats`, `cta`, `score`, `DETAILS`, `PLANO_COPY`) migra pra cá UMA vez.
3. **Consumir e apagar as cópias:**
   - `page.client.tsx`: apaga `PLANS`/`DETAILS`; preço/desconto/volume/usuários vêm do fetch,
     copy do módulo. Skeleton suave enquanto carrega.
   - `register/page.client.tsx`: apaga `PLAN_INFO`/`PLANO_COPY`; importa do módulo.
   - `checkout-panel.tsx`: apaga `PRICE`; preço + desconto anual vêm do fetch (com fallback).

## ARQUIVOS
- **Novo:** `frontend/src/lib/plans.ts` (fetch + tipos + número + copy compartilhada).
- **Edita:** `page.client.tsx` (−`PLANS`/`DETAILS`), `register/page.client.tsx`
  (−`PLAN_INFO`/`PLANO_COPY`), `checkout-panel.tsx` (−`PRICE`).
- **Backend:** `commercial-plans.controller.ts` — +2 campos no `public-catalog` (read-only).

## RISCO / CUIDADO
- **Pré-login não pode piscar branco:** `fetchPublicPlans()` PRECISA de fallback/cache (último
  catálogo conhecido) — a casca e o checkout são pré-login.
- **Preço só do catálogo** (PAGAMENTOS.md). Nenhum número à mão sobrevive no front.
- **CSS trava a estrutura do preço:** `screens.css:814` espera `<b>` = número, `<small>` =
  prefixo, `<em>` = "/mês". Formatar o number do backend como `R$ X,XX` mantendo esse markup.
- **5 Leis / check-pele:** `plans.ts` é dado (`.ts`), não visual — sem hex/inline em TSX.
- **Não tocar** no funil de checkout/cobrança em si (blocos 001–002 do INDEX). Aqui é só
  **de onde a tela lê o número**.

## CHECKS
`cd backend && npm run build` (catálogo público) → `cd frontend && npm run lint` → `npm run build`.
Ao vivo: casca `/?ver=planos`, `/register?plan=...` e o checkout mostram **o mesmo** preço/
desconto/volume, vindo do `public-catalog`.

## STATUS
Planejado (16/06). **Não aplicado** — dono pediu pra salvar e finalizar. Conserto 1 já no ar
(local). Liga o verde quando der o "go". Na ordem do INDEX, este 030 ocupa o lugar do antigo 006
(vem antes do 010 catálogo / 011 website-planos).
