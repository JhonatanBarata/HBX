# CUTOVER 06/07 — modelo GRÁTIS estilo CNPJ.biz (chavinha `HBX_CREDITS_ENABLED`)

## ARQUITETURA DE MONETIZAÇÃO — 3 CAMADAS (fechada com o dono 06/07)
Uma só moeda: a carteira de crédito. `1 crédito = 1 lead ENTREGUE e validado` (busca grátis, leads-only D1).
1. **GRÁTIS (aquisição):** cadastro → email+telefone confirmados → **50 créditos**, sem cartão. Este doc.
2. **RECARGA self-service (SMB):** compra pacote de crédito no CARTÃO (MercadoPago), SEM contrato. É o degrau
   pra quem estoura o grátis e não quer falar com vendedor. Pacotes Starter/Growth/Scale (placeholder de preço,
   pausados até o dono cravar no /master). Endpoint público `GET /credits/public-catalog` já pronto; falta a
   UI in-app (quando o saldo acaba → "recarregar") + fio de checkout MP. Surfície LOGADA, não a landing.
3. **EMPRESARIAL (escala, alto-toque):** CONTRATO negociado, contactOnly ("falar com especialista"). O master
   estuda a empresa, monta o BUNDLE (N chips WhatsApp gerenciados + ERP/Recovery + implantação/treinamento/
   suporte) e **credita a carteira na mão** (`grant` do master, S3a — JÁ EXISTE). Sem self-checkout. Preço
   "a partir de", sob medida. **Raciocínio diferente do self-service: vende OPERAÇÃO, não lead avulso.**
   Cobra nos 3 COGS reais (lead, chip, hora humana); dá de graça o que o CNPJ.biz capa (assento/IA/CRM sem teto).
   Tiers sugeridos (mockup 06/07): Operação ~R$297 · Operação Plus ~R$697 · Sob Medida (negociado). Evolui o
   card Implantação/Company que já existe — NÃO é feature nova, é dar a cara/copy certa.
> Regressão zero: layer 2/3 não entram na landing pública agora. A landing (com a chavinha ON) = pitch do
> GRÁTIS + o card Empresarial "falar com especialista". Recarga (layer 2) é upgrade LOGADO, fase seguinte.

---


> Virada de direção do dono (06/07): **tirar os planos**. Cadastro direto → **email + telefone
> confirmados** → **50 créditos grátis**, SEM cartão. Igual CNPJ.biz deixa conhecer o sistema todo.
> Pacotes PAGOS de recarga ficam pra depois ("vai ser muito diferente"). A chavinha é `HBX_CREDITS_ENABLED`:
> ON = modelo grátis/crédito; OFF = modelo de planos de hoje (regressão zero).

## Regras fechadas com o dono
- **50 créditos** (não 30), liberados **só com email confirmado** (Google = já confirmado; ou nosso confirm-email).
- Cadastro **exige telefone** (verificável por código/F6). CPF opcional. Sem seleção de plano, sem cartão.
- **Dedup anti-farra:** telefone OU CPF repetido em outra conta → cria a conta mas **NÃO dá os 50** (não bloqueia).
- Modelo: `1 crédito = 1 lead ENTREGUE e validado. A busca é grátis.` (leads-only, D1 — os outros módulos NÃO
  consomem crédito; o dono confirmou que "combinamos nada disso" sobre cobrar todo módulo).

## JÁ FEITO por Opus (backend, verificado por tsc) — NÃO refazer
- Chavinha local ON (`backend/.env`: `HBX_CREDITS_ENABLED=true`, `SHADOW=true`, `ENFORCE` OFF).
- `GET /credits/public-catalog` (`credits-public.controller.ts`) → `{ enabled, packs[], welcomeCredits, welcomeExpiryDays }`.
  Pro modelo grátis o front usa só `enabled` + `welcomeCredits` (packs ficam pra fase paga).
- Data layer `frontend/src/lib/credits-storefront.ts` (`fetchCreditStorefront()`).
- Welcome default **50** créditos / 30 dias (`credit-pack-catalog.ts`; editável no /master).
- Grant movido do signup → **`finalizeConfirmedIdentity`** (email/F6) com **dedup por telefone/CPF**
  (`maybeGrantWelcomeAfterConfirm` em `auth.service.ts`). Signup grátis EXIGE + captura telefone/CPF.

## FALTA — backend Opus (fatia grande, faço com cuidado — NÃO é do worker)
**Religar a máquina de acesso.** Hoje o cadastro nasce `pending_checkout` e a confirmação diz
"Finalize o pagamento pra liberar o plano". No modelo grátis: confirmar email = **conta ATIVA usável
com 50 créditos, sem cartão**. Mexe em `activateConfirmedTrialTx`/`status`/`next`/`requiresCheckout`/
mensagem do `finalizeConfirmedIdentity`. É a máquina de estado — quebra login/signup se errar. Slice
própria, verificada, atrás da chavinha. (R2 do PLANO de créditos: acesso deixa de derivar de plano.)

## WORKER SONNET — front (propaganda + cadastro). LOCAL, não publica.
Regra-mãe: chamar `fetchCreditStorefront()`; `enabled===true` → renderizar o modelo GRÁTIS; `false` →
manter a vitrine de PLANOS de hoje intacta (fallback, regressão zero). NÃO apagar o caminho dos planos.

1. **Landing `frontend/src/app/page.client.tsx`** (`/?ver=planos`): quando `enabled`, **remover a vitrine de
   planos** e pôr a pitch grátis: "Cadastre-se grátis. Confirme email e telefone e ganhe **`welcomeCredits`
   créditos**. 1 crédito = 1 lead entregue e validado. A busca é grátis. Sem cartão." CTA → `/register`.
   O card **Company/Implantação** (contactOnly) pode continuar como "Falar com especialista".
2. **`frontend/src/lib/plans.tsx`**: matar toda linha "X leads por mês"/"por mês" da copy `PLAN_STATIC`
   (linhas ~116,144,170). Nada de tier List/Lead/Pro como driver na propaganda.
3. **`frontend/src/app/register/page.client.tsx`**: quando `enabled`, remover seleção de plano; campos =
   email, senha, **telefone (obrigatório)**, CPF (opcional). Após signup, a tela de espera de confirmação
   já existe — texto: "Confirme seu email e telefone para liberar seus 50 créditos". **Verificação de
   telefone por código:** reusar o fluxo F6 que já existe no backend (`POST /auth/whatsapp/confirm/start`
   + `/confirm/code` — confira os nomes reais no `auth.controller.ts`); se o fio F6 no front não existir,
   deixe o campo telefone indo no signup e reporte que a etapa de código ficou pro Opus.
4. Não tocar preço/checkout/saldo (não há venda no modelo grátis). Não tocar backend.

## Design System (Leis — duro) + checks
Zero hex/cor/inline novo (só token/classe de `frontend/src/app/hbx-theme/`); `node frontend/check-pele.mjs`
verde; `cd frontend && npm run build` (ou tsc) verde. NÃO publicar/commitar/criar branch. Ao fim, escrever
`CUTOVER-06-07-VITRINE-RESULTADO.md` aqui (mudanças por arquivo:linha + o que sobrou pro Opus) e resumo curto.
