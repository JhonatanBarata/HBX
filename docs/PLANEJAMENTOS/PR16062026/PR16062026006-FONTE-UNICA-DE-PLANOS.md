# PR16062026006 — FONTE ÚNICA DE PLANOS (matar o "telas diferentes")

> **Ordem do dono (16/06):** depois de pedir análise do porquê "tem 2 de tudo" (login, planos,
> telas diferentes), pediu um plano melhor e decidiu: **Conserto 2 = puxar a verdade do plano do
> backend.** Este `.md` é o Conserto 2. Trilha SEPARADA da "Checkout sem parede" (000-INDEX) —
> mesmo tema de planos, mas o problema aqui é **duplicação de dado de apresentação**, não o funil
> de pagamento.

## CONTEXTO / DE ONDE VEM (não reanalisar do zero)
O front migrou pra "casca única" (15/06) mas a migração ficou **pela metade**: telas foram
**copiadas** em vez de virarem **um componente + uma fonte**. O register fez certo (um
`RegisterPanel` montado em 2 lugares); o login e os **dados de plano** furaram o padrão.

- **Conserto 1 (login fora da casca) — ✅ FEITO e verificado ao vivo (16/06).** A view `entrar`
  (login por CPF, que o backend nunca aceitou) foi **removida da casca**; "Entrar" agora abre
  `/login` (tela única, por e-mail); `/?ver=entrar` legado redireciona pra `/login`. Lint 0 erros,
  check-pele catraca 544→541, build 28 rotas, 0 erro de console.
  Arquivos tocados: `frontend/src/app/page.client.tsx`, `frontend/src/components/hbx/hbx-scene.tsx`.
- **Conserto 2 (este doc) — PLANEJADO, não aplicado.** Liga o verde só no "go".

## O PROBLEMA (por que "as telas estão diferentes")
A lista/preço/feature de plano está **escrita à mão em 3 lugares** → o mesmo plano lê textos
diferentes dependendo de qual arquivo desenhou:

| Fonte | Arquivo | O que define |
|---|---|---|
| Casca / vitrine | `frontend/src/app/page.client.tsx` | `PLANS` + `DETAILS` (cards + painel "Como funciona") |
| Cadastro | `frontend/src/app/register/page.client.tsx` | `PLAN_INFO` + `PLANO_COPY` (resumo do plano + copy do form) |
| Checkout | `frontend/src/components/hbx/checkout-panel.tsx` | preço/feature de novo |

Verdade real de plano/preço = **`backend/src/commercial-plans/commercial-plan-catalog.ts`**
(regra do dono: fonte única; "não mentir" — site nunca contradiz a cobrança).

## ACHADO QUE MUDA O ESCOPO (constraint real, não é detalhe)
O endpoint público **já existe**: `GET /commercial-plans/public-catalog`
(`backend/src/commercial-plans/commercial-plans.controller.ts:13`, sem auth, throttle 30/min).
Ele devolve **número/estrutura**, mas **NÃO** a copy narrativa rica do front:

- **Catálogo TEM:** `key, title, monthlyPrice, trialDays, includedUsers, headline, description,
  badge, recommended, features[]`.
- **Catálogo NÃO TEM:** o `DETAILS` da casca (`temp`, `pitch`, `how[]`, `points[]`, `forWho`,
  `foot`) nem o `PLANO_COPY` do register (`formTitle`, `formSub`, `doneSub`).

→ Conclusão: **número = backend (fonte única); copy narrativa = UM módulo de apresentação no
front.** Não inventar texto de marketing no backend.

## DESENHO (a regra única, igual o RegisterPanel já provou)
Cada dado de plano tem **uma** dona:

1. **Números/estrutura → backend.** Criar `frontend/src/lib/plans.ts`:
   - tipo `PublicPlan` (espelha o `public-catalog`);
   - `fetchPublicPlans()` (1 fetch, com fallback se a API cair — a casca é pré-login, não pode
     ficar em branco);
   - mapa de ordem/accent/ícone por `key` (apresentação pura, sem preço).
2. **Copy narrativa → um módulo só.** `frontend/src/lib/plan-copy.ts` (ou dentro de `plans.ts`):
   `DETAILS` e `PLANO_COPY` migram pra cá, **uma vez**. Casca e register importam daqui.
3. **Consumir nos 3 lugares:**
   - `page.client.tsx`: apaga `PLANS`/`DETAILS` locais; lê número de `fetchPublicPlans()` + copy
     do módulo. Estado de loading suave (skeleton) pra não piscar.
   - `register/page.client.tsx`: apaga `PLAN_INFO`/`PLANO_COPY` locais; importa do módulo.
   - `checkout-panel.tsx`: preço/feature vêm de `fetchPublicPlans()`.
4. **Apagar as 3 cópias hardcoded.** Fim do "telas diferentes".

## ARQUIVOS
- **Novo:** `frontend/src/lib/plans.ts` (fetch + tipos + ordem/ícone), e a copy narrativa
  (mesmo arquivo ou `plan-copy.ts`).
- **Edita:** `frontend/src/app/page.client.tsx` (remove `PLANS`/`DETAILS`),
  `frontend/src/app/register/page.client.tsx` (remove `PLAN_INFO`/`PLANO_COPY`),
  `frontend/src/components/hbx/checkout-panel.tsx` (preço/feature do fetch).
- **Backend:** nenhum (endpoint público já serve). Só LER.

## RISCO / CUIDADO
- **Pré-login não pode ficar branco:** `fetchPublicPlans()` precisa de fallback/cache local
  (último catálogo) pra casca e register renderizarem mesmo com API lenta/fora.
- **Preço só do catálogo** (PAGAMENTOS.md). Nada de número à mão sobrevivendo no front.
- **5 Leis / check-pele:** novo módulo é dado, não visual — sem hex/inline em TSX.
- **Não tocar** no funil de checkout/cobrança (isso é a trilha 000-INDEX, blocos 001–002).
  Aqui é só **de onde o card lê o número**.

## CHECKS
`cd frontend && npm run lint` → `npm run build`. Verificar ao vivo: casca `/?ver=planos`,
`/register?plan=...` e o checkout mostram **o mesmo** preço/feature, vindo do `public-catalog`.

## STATUS
Planejado (16/06). Não aplicado — dono pediu pra salvar o plano. Conserto 1 já está no ar
(local). Liga o verde do Conserto 2 quando der o "go".
