# PLAN — Onboarding / Self-Checkout: funil contínuo + tapa no visual

> Origem: ordem do dono 19/06 ("chamado: tapa no visual"). Assunto = **a experiência do
> funil público** `/?ver=planos` (cadastro → confirmação → pagamento), continuidade e visual.
> **NÃO confundir** com `PLAN-PLANOS-COBRANCA-ACESSO-MASTER.md`: aquele é o organograma
> comercial do backend (F2 catálogo editável do master, F8 gate de acesso do **logado**).
> Fronteira: **lá** = estados comerciais + gate de quem já entrou; **aqui** = o anônimo no
> funil, a ordem dos passos e a sensação de continuidade. Cross-link nos dois sentidos.

## A dor (o que o dono está sentindo)
> "Falta de continuidade. Estou no cadastro, alguém me chama, eu me perco. Em outros sites
> nunca senti isso; no meu não pode. Pra ser self-checkout, tem que ser bem feito."

São 4 furos confirmados lendo o código + 1 redesenho de visual:

1. **Cobra antes de confirmar (ordem invertida).** `register/page.client.tsx:202-211` já abre o
   `CheckoutPanel` assim que o signup volta `checkout_token`, com a copy errada *"Finalize o
   pagamento agora — você confirma depois"*. O backend gera essa sessão de checkout no próprio
   signup (`auth.service.ts:1648-1665`), **antes** de e-mail/telefone confirmado. Pede confirmação
   e já enfia o cartão na cara — exatamente o que o dono xingou.
2. **Sem continuidade / beco sem saída (anexo2).** Login de e-mail não confirmado lança
   `EMAIL_CONFIRMATION_REQUIRED` (`auth.service.ts:1175-1182`); o `login/page.client.tsx` só pinta
   a string *"Confirme seu e-mail antes de entrar"* e morre ali. Re-cadastrar o mesmo e-mail bate
   `ConflictException` (`auth.service.ts:1469-1470`) e também morre. Nenhum caminho devolve a pessoa
   pro funil no passo onde ela parou.
3. **Form pesado / assimetria com o Google.** O signup exige **WhatsApp** (obrigatório:
   `validateSignupTrialProfile` em `auth.service.ts:170-173`) **e CPF** (`register/page.client.tsx:287-291`),
   enquanto "Inscrever-se no Google" entrega só e-mail+nome. Entrar pela porta da frente do HBX é
   mais difícil que pelo Google — invertido.
4. **"Lista Fria" rebaixa o cliente.** `plans.tsx:106` crava `temp: "Lista Fria"` no List; a escada
   Fria→Morna→Quente (List/Lead/Pro/Implantação) posiciona o plano barato como "inferior/frio" antes
   de a pessoa ver o produto.
5. **Tela do cartão sem vida.** `CheckoutPanel` é um form seco — sem cartão mock, sem preencher na
   digitação, sem brilho. É a hora de pedir dinheiro e é a tela mais pobre do funil.

---

## A espinha dorsal: máquina de estados de onboarding (server-authoritative)

A continuidade não nasce de "salvar no localStorage" — nasce de **uma fonte de verdade no backend**
que diz **onde a pessoa está**, e de **todas as superfícies** (funil, login, re-cadastro, reload)
lerem esse mesmo estado. Nada de derivar em dois lugares.

**Não precisa de coluna nova** — o estado já está cravado:

| Passo (`onboardingStep`) | Como deriva (já existe) |
|---|---|
| `awaiting_email`   | usuário existe, `user.emailConfirmedAt == null` (token vivo) |
| `awaiting_payment` | `emailConfirmedAt != null` **e** `company.status == 'pending_checkout'` |
| `done`             | empresa com acesso (`trial`/`active`/`courtesy` via `resolveCompanyAccessState`) |

> A confirmação por WhatsApp (F6) é só **outro jeito** de satisfazer `awaiting_email` — preenche o
> mesmo `emailConfirmedAt` (renomear o conceito pra "identidade confirmada" na cabeça, não no schema).

**Regra de ouro da continuidade:** qualquer entrada (reload do funil, login bloqueado, re-cadastro
do mesmo e-mail, link velho) → backend resolve `onboardingStep` → o funil renderiza **aquele** passo.
A tela de "aguardando confirmação" **persiste**: mesmo e-mail sempre cai nela enquanto não confirmar.

---

## Decisões travadas (extraídas da ordem do dono — não re-perguntar)

1. **Ordem certa:** cadastro preenchido → envia confirmação → **espera** → confirmou (e-mail OU
   WhatsApp) → **só então** a tela do cartão. Cartão **nunca** antes da confirmação.
2. **CPF sai do signup e vai pra tela do cartão** (é lá que se pede documento do pagador).
3. **WhatsApp sai do signup como obrigatório.** O HBX pede telefone **depois**, como as grandes:
   confirmação por telefone só quando o risco aparece (IP repetido, abuso de free-trial) — F8.
4. **Paridade com o Google:** o cadastro direto pede ~o que o Google entrega (e-mail + nome + senha).
   Só o **e-mail** é inegociável, porque a confirmação precisa acontecer (no Google ela já vem pronta).
5. **"Lista Fria" morre** → List vira **"Lista Unitária"**; a escada de temperatura que rebaixa o
   plano barato é reescrita (F1).
6. **Tela do cartão ganha vida:** cartão mock que preenche ao digitar; CPF aqui.
7. **Confirmação por WhatsApp** usando o **WhatsApp do Master** (chip que o master já tem).
8. **anexo2 (continue seu cadastro) é UMA tela só** que devolve pro `/?ver=planos` no estado real
   (aguardando e-mail **ou** confirmado-aguardando-pagamento).

## Decisões a confirmar (NÃO travam o build — sigo no melhor critério e marco em RISCOS)

- **A. Campo "Empresa" no signup direto.** O Google não pergunta empresa — deriva do nome e deixa
  renomear depois (`signupWithGoogle` já cria empresa sem perguntar). **Recomendo** remover "Empresa"
  do form direto também (paridade real): cria a empresa com o nome da pessoa, renomeia no 1º acesso.
  Se o dono quiser manter, fica como **único** campo extra além de nome/e-mail/senha.
- **B. E-mail vs WhatsApp como confirmação primária.** Recomendo **e-mail como padrão** + "confirmar
  por WhatsApp" como atalho (1 toque), porque o WhatsApp do Master é ação live e custa (guardrail).
- **C. Telefone na confirmação por WhatsApp.** Como o telefone saiu do signup, ele é pedido **na hora**
  de escolher "confirmar por WhatsApp" (um campo só, ali). 

---

## Status da aplicação (19/06 — orquestrador)

**Slice 1 FEITO e verificado** (worker Sonnet no F1 + Opus no resto):
- **F1 ✅** — `plans.tsx`: "Lista Fria" → **"Lista Unitária"**; escada de temperatura reescrita
  (Lead "Lista Enriquecida", Pro "Operação no Painel", Implantação "Sob Medida"). Lint verde.
- **F2 ✅** — cadastro enxuto: WhatsApp e CPF saíram do form (`register/page.client.tsx`); backend
  `validateSignupTrialProfile` com telefone/CPF **opcionais**; reserva anti-abuso guardada por
  presença de telefone (relocada pro checkout/F6). DTO já era opcional.
- **F3 (parte) ✅** — matou o "cobra antes de confirmar": removida a copy *"Finalize o pagamento
  agora — você confirma depois"* e o `showCheckout` agora exige `access_token` (e-mail confirmado).
  Produção pré-confirmação cai na tela "aguardando confirmação" (versão rudimentar do F5).
- **F7-CPF ✅** — CPF/CNPJ do pagador agora é pedido **no `CheckoutPanel`** (campo central, sem hex),
  não mais no cadastro.
- **Checks verdes:** front `lint` (0 errors, check-pele 510/510) + `build`; back `prisma:validate` +
  `build` + `auth.service.test.ts` **16/16**.

**Slice 2 FEITO e verificado** (Opus + worker Sonnet no F7):
- **F5 ✅** (tela) — tela de espera virou **"HBX {plano} — Aguardando confirmação"** + **reenviar com
  cooldown de 60s** (`register/page.client.tsx`). *(Falta a coreografia detalhe-retrai — Slice 3.)*
- **F4 (beco/anexo2) ✅** — login não confirmado deixou de ser string morta: vira **"continue seu
  cadastro"** com **reenviar** + **voltar pro funil** (`login/page.client.tsx`). *(Falta o resume
  server-side pro passo EXATO — Slice 3.)*
- **F7 + F7.1 ✅** (worker) — `CheckoutPanel` ganhou **cartão mock que preenche ao digitar** (bandeira
  por BIN, vira no CVV) + **o momento da aprovação**: fases `paying/approved/declined`, cartão herói,
  **wash verde que respira / vermelho que treme**, **"V" que se desenha** (reusa `hbx-spark-draw`),
  anéis expandindo — tudo em `kit.css` por token, `prefers-reduced-motion` tratado.
- **Prévia dev `/dev/checkout` ✅** — harness removível (gancho `demoOutcome` dev-only no painel) pra
  ver o cartão mock + o efeito verde/vermelho **sem backend e sem andar o funil**.
- **Checks verdes:** front `lint` (0 errors, check-pele **437/437** inalterado) + `build` (todas as rotas).

**Aberto (Slice 3 — fechar):** **F4-deep** (resume server-side: `GET /auth/onboarding/resume` + login
devolve destino do passo exato + parar de emitir `checkout_token` no signup; ~4 testes a ajustar) →
**F6** (confirmação por WhatsApp do Master, live **gated** como `LIVE_*_TODO`) → **F5-animação**
(detalhe-retrai) → **F8** (telefone por risco: hook + doc). **Dívida ainda aberta:** religar
`ensureTrialPhoneAvailable`/`...Document` no `/financeiro/subscription/create`.
**Dívida rastreada:** religar `ensureTrialPhoneAvailable`/`ensureTrialDocumentAvailable` no
`/financeiro/subscription/create` (onde o trial nasce) quando F6/F7 trouxerem telefone/CPF — hoje o
cartão obrigatório é a trava primária na janela entre slices.

## Frentes (ordem de build)

### F1 — Matar a escada de temperatura (copy) — **rápido, Opus direto**
- `frontend/src/lib/plans.tsx`: `hbx_lite.temp` `"Lista Fria"` → **`"Lista Unitária"`**. Reescrever os
  outros `temp` pra não venderem "grau de calor" onde barato = frio (hoje: `"Lista Fria enriquecida"`,
  `"Lista Morna"`, `"Lista Quente"`). Cada plano é um **momento da operação**, não um degrau de
  desprezo. Manter o tom de cada `pitch`/`forWho` (já são bons), só trocar o rótulo `temp` que aparece
  no detalhe (`page.client.tsx:397` — `HBX {accent} · {temp}`).
- **Sem mexer em preço/feature/quota** (vem do backend, `PAGAMENTOS.md`). Só rótulo narrativo.
- **Check:** `cd frontend && npm run lint && npm run build`.

### F2 — Form enxuto (paridade Google) — **Opus direto (toca auth)**
- **Frontend** `register/page.client.tsx`: remover os campos **WhatsApp** e **CPF/CNPJ** do form de
  cadastro. Ficam: E-mail, Nome ("como deseja ser chamado"), Senha, Confirmar (+ Empresa, pendente
  decisão A). Tirar `whats`/`doc` do `POST /auth/signup`.
- **Backend** `auth.service.ts`:
  - `validateSignupTrialProfile` deixa de **exigir** telefone (170-173) — telefone vira opcional/nulo
    no signup. CPF idem. Nenhum dado de pagador é coletado no cadastro.
  - O anti-abuso por telefone/CPF (`reserveSignupTrialPhoneTx`, `ensureTrialPhoneAvailableTx`) **migra**
    para o momento em que o dado existe: telefone na confirmação-WhatsApp (F6) / no checkout; CPF no
    checkout. Não pode sumir — só muda de lugar (senão abre brecha de free-trial). **Teste obrigatório.**
  - `auth.dto.ts`: `trialContactPhone`/`trialTaxDocument` viram opcionais.
- **Risco:** mexe em auth + anti-abuso de trial. Worker NÃO; Opus edita (fronteira sensível) com teste
  do caminho de signup (`auth.service.test.ts`).
- **Checks:** `cd backend && npm run prisma:validate && npm run build` + `auth.service.test.ts`;
  `cd frontend && npm run lint && npm run build`.

### F3 — Reordenar: confirmar ANTES de cobrar — **Opus direto (financeiro)**
- **Frontend** `register/page.client.tsx`:
  - Apagar a copy *"Finalize o pagamento agora — você confirma depois"* (204) e o bloco que abre o
    `CheckoutPanel` direto no `done.checkout_token` (202-221).
  - `showCheckout` deixa de ligar com `checkout_token`. O CheckoutPanel **só** aparece quando o
    backend disser `onboardingStep === 'awaiting_payment'` (confirmado). Antes disso → **tela de
    aguardando confirmação** (F5).
- **Backend** `auth.service.ts:1648-1665`: o signup **para de emitir `checkout_token`**. A sessão
  restrita de checkout passa a nascer **na confirmação** (`confirmEmail` / confirmação-WhatsApp),
  não no cadastro. O signup volta só `pendingEmailConfirmation` + dados pra tela de espera.
- **Guardrail:** é trilha financeira → Opus, teste obrigatório, nada de afrouxar paywall. `pending_checkout`
  segue sem acesso a módulo (o gate do logado é do outro plano, F8 de lá).
- **Checks:** back `prisma:validate`+`build`+`auth.service.test.ts`; front `lint`+`build`.

### F4 — Máquina de estados + continuidade (o NÚCLEO) — **Opus direto**
1. **Endpoint de resume** (público com sessão restrita OU pós-login bloqueado):
   `GET /auth/onboarding/resume` (ou estender o payload do login) devolve
   `{ step: 'awaiting_email'|'awaiting_payment'|'done', planKey, email, resendAvailableAt }`.
   Deriva de `emailConfirmedAt` + `company.status` (nunca recalcula em coluna).
2. **Login deixa de ser beco.** `auth.service.ts:1175-1182`: hoje lança `EMAIL_CONFIRMATION_REQUIRED`
   **antes** do `bcrypt.compare` (1193) — vaza "esse e-mail existe e está pendente" sem provar senha.
   Novo desenho:
   - **Antes** de validar a senha: resposta genérica ("confirme seu cadastro") — não vaza plano nem
     dá token.
   - **Depois** que a senha bate: devolve `next: '/?ver=planos?resume=1'` + (se `awaiting_payment`) o
     `checkout_token` restrito, pra cair direto no passo certo. (`login/page.client.tsx` cataloga o
     code e faz `router.replace(next)` em vez de pintar string morta.)
3. **Re-cadastro do mesmo e-mail volta pra tela de espera** (não joga `ConflictException` seco):
   se o e-mail existe e está **não confirmado**, pede a senha pra provar posse → cai no passo atual.
   Se confirmado, manda pro login. Mantém anti-enumeração (sem senha, mensagem genérica).
4. **Funil lê o estado no mount.** `page.client.tsx`: com `?resume=1` (ou sessão restrita viva),
   chama o resume e seta `selectedPlan` + um novo `planMode` que pula direto pra "aguardando" ou
   "cartão". O reload no meio do cadastro **não perde o lugar**.
5. **Persistência leve no cliente** (querystring/`sessionStorage` `hbx:onboarding`) é só **dica** pra
   reidratar rápido; a **verdade** é sempre o backend (fail-safe se o storage sumir).
- **Checks:** back `prisma:validate`+`build`+`auth.service.test.ts` (login resume + re-cadastro);
  front `lint`+`build`. **Teste e2e** do caminho cadastro→reload→retoma.

### F5 — Tela "Aguardando confirmação" (visual + a animação que o dono pediu) — **Opus/worker**
Sequência visual (o dono descreveu exatamente):
1. Cards → clica no plano → os outros saem, o card escolhido desliza (**já existe**: `choosePlan`,
   `planMode` em `page.client.tsx:200-215`).
2. **Novo:** o "Detalhes" (`.site-plan-intruder`) **retrai pra dentro** do "Criar sua conta", e o form
   **desliza pro lado do card do plano** escolhido (form compacto colado no card). Hoje detalhe e form
   coexistem largos; o pedido é o detalhe recolher e o form encostar no plano.
3. Form preenchido → submit → **transforma** na tela de espera (mesma moldura, sem trocar de cena):
   **"{Plano escolhido} · Aguardando confirmação"** + "Enviamos pra {email}" + **"Reenviar
   confirmação"** com **cooldown/contagem regressiva** (ex.: 60s) + **"Confirmar pelo WhatsApp"** (F6).
4. Essa tela **persiste** via F4: reload/relogin/re-cadastro com o mesmo e-mail volta nela.
- **Implementação:** estados em `page.client.tsx` (`planMode: 'awaiting' | 'paying'`), animação via
  **classe central** (`screens.css` — o detalhe que retrai, o form que encosta), **nada** de hex/cor
  solta (Lei 4/5 + `check-pele.mjs`). A contagem é estado React; o `resendAvailableAt` vem do backend
  (`/auth/resend-confirmation` já existe — só expor o "próximo permitido em").
- **Zero-scroll** mantido (FRONTEND.md): a tela de espera tem que caber em 1366×768.
- **Check:** `lint`+`build` + olho no Chrome 100% zoom (sem rolar) + mobile (`mobile-no-overflow`).

### F6 — Confirmação por WhatsApp (Master) — **Opus direto; LIVE gated (guardrail)**
- **Fluxo:** na tela de espera, "Confirmar pelo WhatsApp" → pede o telefone (é aqui que o telefone
  entra, já que saiu do signup) → backend gera código de 6 dígitos, envia pela **instância de
  automação do Master** (Webwhats `company-{master}`, ver WHATSAPP.md "automação usa `company-{id}`")
  → pessoa digita → backend valida → preenche `emailConfirmedAt` (identidade confirmada) → vira
  `awaiting_payment`.
- **Anti-abuso:** o telefone confirmado aqui passa pelo mesmo `ensureTrialPhoneAvailable` que migrou no
  F2 (um telefone não reusa trial). Rate-limit no envio do código.
- **GUARDRAIL (CLAUDE.md):** disparar WhatsApp real pra número de verdade é **ação live**. Então:
  **código livre**, mock-first (em dev o código vai pro log/preview, igual o `previewUrl` do e-mail),
  e o **envio live fica gated** (`*_TODO` até validar na VPS com o chip do Master conectado) — mesmo
  padrão de `LIVE_SEAT_CHARGE_TODO` do F6 do outro plano. Eu **não disparo** sozinho em número real.
- **Reuso:** o master já tem chip + a mensageria (`backend/` Outbox / Webwhats). Não criar mecanismo
  novo — pendurar no que existe.
- **Checks:** back `prisma:validate`+`build`+teste do gerar/validar código (puro, sem disparo real);
  front `lint`+`build`.

### F7 — Tela do cartão com vida (mock card) — **Opus direto (financeiro/visual)**
- `CheckoutPanel`: acima do form, um **cartão mock** (frente/verso) que **preenche ao digitar** —
  número formatado, nome do titular, validade, bandeira detectada pelo BIN (Visa/Master/Elo/Amex),
  CVV vira o cartão. Estado já existe (`card` state) — falta o componente visual.
- **CPF aqui** (movido do signup, F2): campo "CPF/CNPJ do pagador" no checkout, alimenta a
  tokenização (`identificationType` já é inferido em `checkout-panel.tsx:109`).
- **Visual 100% central:** cartão mock nasce em `kit.css`/`screens.css` (classe `.hbx-mockcard…`),
  **zero** hex/inline na TSX (`check-pele.mjs` reprova). Gradiente/brilho = token de pele.
- **Sem tocar na lógica de cobrança** (mock/live, tokenização MP) — é só pele + o campo CPF. A
  validação live do MP segue como o outro plano (F6 lá): VPS + chaves de teste.
- **Checks:** `lint`+`build` (check-pele verde) + zero-scroll + mobile.

#### F7.1 — O MOMENTO DA APROVAÇÃO (o efeito "fresco" — ordem do dono 19/06)
> "Quero efeito de fresco mesmo. Seja muito, MUITO mais criativo." O cartão que a pessoa digitou
> é o herói; quando aprova, ele sobe e o mundo atrás reage. Verde dá certo, vermelho não dá.

Estados novos no `CheckoutPanel`: `idle → paying → approved | declined`. O cenário é **uma cena só**
(não troca de tela) — o cartão mock do F7 é o ator central o tempo todo.

1. **`paying` (suspense):** ao confirmar, o **form recolhe** (campos dissolvem) e **o cartão mock
   centraliza e flutua** — um anel girando em volta (processando), leve tilt 3D. Tira o "spinner seco".
2. **`approved` (VERDE):** o cartão **sobe pro centro como herói**; todo o resto — resumo, ciclo,
   campos, e até os **cards de plano atrás** — **voa/dissolve** (reusa a saída `is-exiting` que o funil
   já usa em `page.client.tsx:379`). **Atrás do cartão acende um wash VERDE que respira**
   (`--hbx-success`) + **anéis expandindo** a partir dele. Sobre o cartão, dentro de um disco, um
   **"V" que se desenha sozinho** (traço por `stroke-dashoffset`). Microcopy **"Aprovado ✓"**.
   Segura ~1,2s saboreando e funde pro app (`onSuccess`).
3. **`declined` (VERMELHO):** mesmo palco, **wash VERMELHO** (`--hbx-danger`), o cartão **treme**
   (shake curto) e o disco vira **"✕"** em vez do "V". Mensagem real do MP (já temos `readMpError`).
   Botão **"Tentar outro cartão"** — **não volta pro zero**, fica no cartão preenchido (continuidade,
   F4). Nunca trava num erro seco.

**Reaproveitar (o "perdido por aí" que o dono mandou achar — elevar e combinar, NÃO recriar):**
- **`@keyframes hbx-spark-draw`** (`kit.css:316`) — desenha o traço do **"V"** (stroke-dashoffset 96→0).
- **`@keyframes trial-glow`** (`screens.css:949`) — o **respiro do halo**, recolorido pra `--hbx-success`
  (aprovado) / `--hbx-danger` (recusado).
- **`@keyframes bot-ring-expand` / `bot-ring-expand2`** (`screens.css:408/412`) — os **anéis expandindo**
  atrás do cartão (vibe radar/connect).
- **`@keyframes hbx-celebrate`** (`kit.css:410`) + **`.badge-win`** (`kit.css:140`) — o pop e o selo de êxito.
- **O gesto `✓ Conectado`** do `whatsapp-connect-modal.tsx:292` (`badge-win`) — é o "efeito do QR" que o
  dono lembrou; agora em **escala de tela**, com o cartão real no lugar do QR.

**Disciplina:** novas classes `.hbx-approve…` / `.hbx-mockcard--hero` em `kit.css`/`screens.css`; cor só
por token (`--hbx-success`/`--hbx-danger`), **zero hex/inline** na TSX (check-pele). Respeitar
`prefers-reduced-motion`: sem trigger, corta a animação e mostra direto o estado final (✓/✕ + cor).
- **Checks:** `lint`+`build` (check-pele verde) + testar a cena nos 3 estados (paying/approved/declined)
  em mock (o provider mock aprova; pra ver o vermelho, forçar erro) + zero-scroll + mobile.

### F8 — Verificação por telefone baseada em risco (PLANEJAR; gancho agora, regra depois)
- **Conceito (como as grandes):** o telefone não é pedágio de entrada — é **desafio quando o risco
  acende**. Triggers a cravar: muitas contas do **mesmo IP** numa janela; **e-mail descartável**
  (domínio temporário); **velocity** de free-trial pelo mesmo fingerprint; reincidência de CPF/telefone.
- **Onde mora:** um `riskSignals` no signup/confirm que, ao estourar, força "confirme por telefone/
  WhatsApp pra continuar" (reusa F6). Sem trigger → e-mail basta.
- **Entrega desta frente:** documentar a regra + deixar o **gancho** (ponto de decisão no fluxo) com
  default desligado. Ligar os triggers é passo seguinte (precisa de telemetria de IP/fingerprint).
- **Não construir o detector inteiro agora** — o dono pediu pra "planejar isso".

---

## Guardrails desta trilha (o que eu NÃO disparo sozinho)
- **WhatsApp real pro cliente** (F6 live): ação live irreversível — fica `*_TODO`/mock até o dono.
- **Cobrança live no MP** (F7): já gated no outro plano; aqui só mexo em pele + CPF, não na cobrança.
- Tudo o mais (copy, form, reorder, máquina de estados, telas, mock card) é **código reversível** —
  faço de qualquer jeito, dono testa de manhã, `git revert` se não gostar.

## Fronteira com `PLAN-PLANOS-COBRANCA-ACESSO-MASTER.md` (sem duplicar regra)
- **Catálogo/preço/quota/entitlement** = lá (F2/F2.1). Aqui **só consumo** via API; nenhum número no front.
- **Gate de acesso do logado** ("sem cartão sem app", `bloqueio-gate`) = lá (F8). Aqui é o **anônimo no
  funil** — antes de existir sessão plena.
- **Estados comerciais canônicos** (`Company.status` + `resolveCompanyAccessState`) = fonte única lá;
  aqui eu só **derivo o `onboardingStep` de leitura** em cima deles, nunca crio estado novo.

## Execução (orquestração)
- **F2/F3/F4/F6/F7** tocam auth/financeiro/anti-abuso → **Opus edita direto** (exceção financeira do dono).
- **F1/F5** (copy + pele/animação) podem ir a **worker Sonnet** ("aplique com o orquestrador"), 1 .md/bloco.
- Ordem por dependência: **F1 → F2 → F3 → F4 → F5 → F6 → F7 → F8** (F4 é o núcleo; F5 depende dele).
- Push/deploy/disparo live = passo **explícito** do dono.

## Checks padrão
- Backend: `cd backend && npm run prisma:validate && npm run build` + `auth.service.test.ts` (signup,
  login-resume, re-cadastro, confirmação-WhatsApp) — caminho de acesso/checkout = **teste obrigatório**.
- Frontend: `cd frontend && npm run lint && npm run build` (check-pele verde — mock card sem hex solto).
- E2E: `mobile-no-overflow` + (novo) cadastro→reload→retoma no passo certo.

## Riscos / como reverter (preencher no RISCOS.md ao aplicar)
- **F2/F3** mexem em auth + anti-abuso de trial: risco de abrir brecha de free-trial se o
  `ensureTrialPhoneAvailable` não for bem realocado. Mitigação: teste do caminho + manter o bloqueio,
  só mudando QUANDO o dado chega. Reverte por bloco (commit por frente).
- **F4** muda o contrato do login (payload de erro → resume): conferir os callers do `login`
  (`login/page.client.tsx`, `auth.service.test.ts`) — 4 testes a ajustar, como no F8 do outro plano.
- **F6** live: nunca dispara em número real sem o dono; mock-first não toca em ninguém.
