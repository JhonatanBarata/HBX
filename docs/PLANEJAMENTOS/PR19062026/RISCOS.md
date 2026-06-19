# RISCOS — trabalho noturno 19/06/2026

Branch isolada: **`trabalho-noturno`** (revisar de manhã; gostou segue, não gostou `git revert <hash>`).
Assunto único da noite: **fechar o Slice 3 do Onboarding/Self-Checkout** — as frentes financeiras/auth
(Opus direto, exceção do dono) + a parte de pele via worker Sonnet.

> Nada live foi disparado: sem push/deploy, sem cobrança live, sem WhatsApp real, sem DB de prod.
> Tudo é localhost reversível. Backend buildando + 38/38 testes verdes; frontend lint 0 erros
> (check-pele 437/437, catraca intacta) + build verde.

## O que mudou — por bloco (cada um é 1 commit, revert isolado)

### 1. F4-deep — resume server-side + login/re-cadastro sem beco  `e9b1895d`
**Por quê:** era o NÚCLEO da continuidade do funil ("estou no cadastro, alguém me chama, eu me perco").
**O que fiz (backend `auth.service.ts`/controller/dto):**
- `deriveOnboardingStep`/`buildOnboardingResume`: **fonte única** do passo (`awaiting_email | awaiting_payment | done`),
  derivado de `emailConfirmedAt` + `resolveCompanyAccessState`. Nunca recalcula em coluna.
- `POST /auth/onboarding/resume` (body `{ pollToken }`): devolve onde a pessoa parou. Identifica pelo
  token de acompanhamento já emitido (prova posse). **Anti-enumeração:** sem token válido → erro genérico.
- **Login não é mais beco:** e-mail pendente + senha CORRETA → `next:'/?ver=planos&resume=1'` + `resume` + `confirmationPollToken`
  (só DEPOIS do `bcrypt`); senha errada → mensagem genérica, sem vazar plano/token.
- **Re-cadastro do mesmo e-mail pendente** (senha prova posse) → renova o link e devolve a tela de espera,
  em vez de `ConflictException` seca.
- **Signup PARA de emitir `checkout_token`** (cartão só depois de confirmar — ordem do dono).
- `refreshEmailConfirmationToken`: dedup da renovação de token (resend + re-cadastro).
**Frontend (`login`, `register`, casca `page.client.tsx`):**
- login persiste a dica (`hbx:onboarding-poll/plan/email`) e manda "Continuar cadastro" pro passo exato.
- register reidrata a tela de espera no `?resume=1` (reload não perde o lugar); persiste/limpa a dica.
- casca lê `?resume=1` e posiciona a cena no plano/cadastro guardado.
**Risco:** mexe no contrato do login (payload de erro agora carrega `next`/`resume`). Os 21 testes de
`auth.service.test.ts` seguem verdes (5 novos cobrem resume + login no-beco). O front degrada são se o
token expirar (cai no form normal). **Decisão de desenho:** o endpoint virou `POST` (token no body, mais
seguro que `GET` com token na URL) — o plano sugeria `GET`; documentado aqui.
**Reverter:** `git revert e9b1895d`.

### 2. F4 dívida — religa o anti-abuso de trial no checkout  `bcd56af3`
**Por quê:** telefone/CPF saíram do cadastro (paridade Google) e agora chegam no **checkout** — o
anti-abuso de trial tinha que migrar pra lá, senão abre brecha de free-trial.
**O que fiz:**
- `commercial-plans/trial-usage.ts`: **fonte única** (`ensureTrialPhoneAvailableTx`, `ensureTrialDocumentAvailableTx`,
  `reserveTrialUsageTx`). Tirei a regra de dentro do `auth.service` (privates viraram wrappers finos).
- `financeiro.createSubscriptionForUser`: `reserveTrialUsageTx` roda no **nascimento do trial** (planos com trial),
  ANTES do provider (mock e live) — falha cedo, sem assinatura órfã. Mesma empresa = idempotente (retry ok);
  reuso cross-empresa viva → 409 (`TRIAL_PHONE/TAX_DOCUMENT_ALREADY_USED`).
**Risco:** poderia bloquear retry legítimo — mas a função trata "mesma empresa" (não bloqueia) e só barra
reuso em OUTRA empresa viva. **Caveat de normalização:** o checkout normaliza telefone com `normalizeContactPhone`
(financeiro) e o signup usava `normalizeBrazilPhone` (auth) — chaves podem divergir entre as duas origens.
Como o telefone saiu do signup, a fonte que importa hoje é checkout↔checkout (consistente). Vale unificar a
normalização num passo futuro.
**Testar:** 2 empresas, mesmo CPF no checkout do trial → a 2ª deve receber 409. Mesma empresa refazendo
checkout → passa. **Reverter:** `git revert bcd56af3`.

### 3. F8 — gancho de verificação por telefone baseada em risco  `7884ea4b`
**Por quê:** ordem do dono ("planejar isso"). Telefone vira DESAFIO quando o risco acende, não pedágio.
**O que fiz:** `auth/signup-risk.ts` — ponto de decisão único (`evaluateSignupRisk`) + a regra documentada
no topo. Flag `SIGNUP_RISK_CHALLENGE_ENABLED` (**default false → nunca desafia**). Sinal barato hoje =
e-mail descartável; IP/velocity/fingerprint ficam TODO até haver telemetria. `signup` chama o gancho e só
anexa `riskChallenge` quando dispara (flag on).
**Risco:** ZERO em produção (flag off → resposta inalterada). **Reverter:** `git revert 7884ea4b`.

### 4. F6 backend — confirmação por WhatsApp do Master (mock-first, **live GATED**)  `68d96f34`
**Por quê:** outro jeito de confirmar identidade (código de 6 dígitos via WhatsApp do Master) em vez do link.
**O que fiz:** sem coluna nova — desafio em **JWT efêmero** que carrega só o HASH do código (10min).
`finalizeConfirmedIdentity` extraído de `confirmEmail` (fonte única da conclusão; reusado por e-mail e WhatsApp).
`POST /auth/onboarding/whatsapp/{start,confirm}`. Anti-abuso de telefone roda no start.
**⚠ GUARDRAIL (o ponto sensível):** disparar WhatsApp real é **ação LIVE**. Em dev/mock o código vai pro
**log/preview** (igual `previewUrl` do e-mail). Em **produção NÃO dispara** — devolve `LIVE_WHATSAPP_CONFIRM_TODO`.
**Pendurar no Webwhats do Master (Outbox, instância de automação `company-{master}`) é PASSO DO DONO na VPS** —
eu não disparo sozinho. O seam está pronto em `dispatchWhatsappConfirmationCode` (tem o `TODO(F6 live / VPS)`).
**Risco:** o caminho de confirmação-sucesso compartilha `finalizeConfirmedIdentity` (mesma lógica do e-mail,
já exercida). 5 testes novos cobrem gating dev/prod + código errado/expirado. O envio LIVE é **intencionalmente
não-testado-live** (gated). **Reverter:** `git revert 68d96f34`.

### 5. F6 ui — botão "Confirmar pelo WhatsApp" na tela de espera  `c8b4b0d4` (worker Sonnet)
**O que fiz (orquestrei worker Sonnet):** 3 estados (idle→phone→code) na tela de espera do `RegisterPanel`,
consumindo o backend do bloco 4. Só classes centrais (`btn-ghost`/`btn-teal`/`field-dark`/`ok show[ bad]`);
catraca do check-pele intacta (437/437); lint 0 erros; build verde.
**Reverter:** `git revert c8b4b0d4`.

## Pendente (de propósito — não forcei)
- **F5-animação (detalhe-retrai + form encosta):** PURA PELE. O worker avaliou e **não forçou** sem olho no
  Chrome — risco de quebrar o zero-scroll e as animações `is-exiting`/`is-choosing`/`is-returning` existentes
  em `screens.css`. Fica pra um passo com preview no navegador. Não bloqueia nada do que entrou.
- **F6 live na VPS:** ligar o envio real do código pelo chip do Master (remover o gate `LIVE_WHATSAPP_CONFIRM_TODO`)
  — ação live, só o dono.
- **Unificar normalização de telefone** (auth `normalizeBrazilPhone` × financeiro `normalizeContactPhone`)
  pra o anti-abuso casar entre origens. Baixo impacto hoje (telefone saiu do signup).

## Observação (não é meu)
- `PLAN-ONBOARDING-SELF-CHECKOUT-FUNIL.md` está com **1 alteração no working tree que NÃO é minha** (descrição
  de label no F1: "Lista Morna" → "Lista Completa!"). Deixei **sem commitar** (é WIP seu). Se foi intencional,
  commite à parte; se quer refletir no código, o rótulo `temp` vive em `frontend/src/lib/plans.tsx`.

## Como testar de manhã (resumo — detalhe em `testar.md`)
1. Funil: cadastrar → recarregar a página → cair de volta na **tela de espera** (não perde o lugar).
2. Login com e-mail não confirmado + senha certa → "continue seu cadastro" → "Continuar cadastro" cai no funil
   no passo exato. Senha errada → mensagem genérica.
3. Tela de espera → "Confirmar pelo WhatsApp" → telefone → **código aparece no preview (dev)** → confirma → entra.
4. (anti-abuso) 2 empresas, mesmo CPF no checkout do trial → a 2ª toma 409.
