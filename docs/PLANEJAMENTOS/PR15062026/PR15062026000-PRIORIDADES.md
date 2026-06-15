# PR15062026 — PRIORIDADES da refatoração noturna (14→15/06, 23:41)

> **Fechamento do dono.** Ele vai apagar os chats; este doc + os irmãos são a fonte.
> Refatoração noturna grande. Regra do dono: **no meio da noite NÃO perguntar nada** —
> decidir pelo recomendado que está escrito aqui e seguir.

## REGRA DE OURO DA NOITE (anti-atropelo — o dono se perde em multitarefa, eu não)

1. **Backend é SERIAL.** Um workstream de cada vez, especialmente cobrança/catálogo
   (tudo encosta em `commercial-plan-catalog.ts` + `financeiro` + `modules`). Nunca dois
   PRs de backend de cobrança abertos ao mesmo tempo — é onde "se confunde".
2. **Front isolado é PARALELO, mas SOB MIM** (o dono NÃO quer Codex — prefere meu front, e
   notou que o plano é todo amarrado; front proporcional/consistente, feito por mim).
3. **Verde antes de empacotar.** `prisma:validate`+`build` no backend; `lint`+`build` no front.
4. **NÃO empacotar checkout meio-pronto.** Cobrança só fecha quando bate ponta a ponta.
5. **NÃO fazer deploy/publish/cobrança REAL sem o dono** (item 7 = ao vivo, com o cartão
   dele, na VPS — não é tarefa de madrugada).
6. **Preço/nomes TRAVADOS pelo dono (15/06, mandam sobre qualquer rascunho antigo):**
   List **49** · Lead Plus **99** · **HBX Pro 249** (novo self-service) · **HBX Company a
   partir de 445,90/mês + implantação a partir de R$300** (= o atual Full RENOMEADO). O "a
   partir de" aparece SÓ no Company (mensalidade negociada: o dono conversa com a empresa;
   ex.: Meta oficial = pouca manutenção, pode baixar; WhatsApp não-oficial = manutenção alta,
   sobe). 3 self-services (List, Lead, Pro) + 1 Company. (499/545,90 anteriores SUPERADOS.)

## Task 0 — consolidar a pasta do dia (regra do CLAUDE.md)

Migrar pra cá os docs sobreviventes do PR14062026 e apagar a pasta antiga. Sobrevivem
(detalhe vivo que estes itens usam): `website-magnifico.md`, `PR14062026012` (checkout),
`PR14062026013` (gasto/preços), `tutorial-interativo.md`, `PR14062026007` (régua),
`PR14062026008` (radar/leads), `PR14062026001` (cadência diferida), `PLAN14062026001`
(fila backend). Renomear pro prefixo PR15. Apagar os concluídos. **Fazer isso como
1º passo da execução, não durante o planejamento.**

## Ordem de batalha (reorganizada por dependência, não pela ordem 1→10 do dono)

### FASE A — bugs rápidos e isolados (autônomo, baixo risco) — FRONT
- **#4 Bug do clique no login.** Remover o hack que escondia o "digitador"/teclado ao
  clicar fora (o dono pediu e bugou o clique na caixa). Só remover e seguir. → front.
- **#8a Bug do tutorial no clique do tema.** Ao clicar em "tema" ele já pula o passo —
  não dá tempo de trocar/clicar fora. Tirar o auto-avanço no clique de tema (avançar só
  no "próximo"). → front. (#8b master whatsapp vai na Fase C.)

### FASE B — Website público (autônomo, isolado) — FRONT (eu)
- **#1 Website com o visual TOTAL do /login + tema + robôs + transitions.** Porta o visual
  do login (peles, robôs, cross-fade) pro site público e a transição contínua site→/login.
  Base: `website-magnifico.md` (já planejado). Seguir as 5 Leis (token/classe central,
  nada de hex inline; check-pele).

### FASE C — COLUNA DA COBRANÇA (SERIAL, cuidado máximo, **CLAUDE**) — #2 #6 #9 #3 #8b
> Estes 5 são UM só workstream: todos tocam catálogo+checkout+master. Fazer em ordem,
> um commit por etapa, verde a cada etapa. Doc detalhado: `PR14062026012` + `PR14062026013`.
- **#2 Preço/nomes do catálogo = propaganda.** Modelo do dono (NÃO converter Full em
  self-service — risco zero de cascata). Em `commercial-plan-catalog.ts`:
  - `hbx_lite` (List): 45→**49**. Self-service.
  - `hbx_padrao` (Lead Plus): **99** (mantém). Self-service.
  - **CRIAR +1 plano self-service** — key nova `hbx_pro` "HBX Pro", **~249**: Lead Plus
    turbinado (mais cards/assentos/relatórios/recovery), **SEM bot/IA e SEM implantação**
    (esses ficam no Company). Self-service.
  - `hbx_melhor` (atual Full): **RENOMEAR** título "HBX Full — Bot e IA" → **"HBX Company"**,
    preço 349,90→**a partir de 445,90/mês + implantação a partir de R$300** (`setupFeeMode:
    'negotiated'`, piso 300; **mensalidade também "a partir de"** — varia com o custo de
    manutenção do cliente, decidido na conversa). **MANTÉM `requiresAssistedSetup` e TODO o
    gating** (bot/cadência/WhatsApp já apontam pra `melhor`) — só muda nome+preço+copy. **NÃO
    é key nova.** O "a partir de" é EXCLUSIVO do Company; os 3 self-services têm preço fixo.
  - **Tirar "assistido"/"assistida" da copy pública** (jargão; usar só "implantação").
  - Resultado: **3 self-services (List, Lead, Pro) + 1 implantação (Company)** → bate com #3.
- **#9 Master recebe HBX Company.** O painel /master tem que enxergar/atribuir/cobrar o plano
  novo (catálogo, status, Central de Implantação). Ver `PR14062026007` (Central de Implantação).
- **#6 Fluxo /planos → /register desordenado.** Hoje clicar no **List** já pula pro register
  falando "14 dias grátis" — ERRADO: só o **Lead Plus** tem trial (catálogo já diz
  `trialDays`: só Lead Plus = 14; List/Pro/Company = 0). Cada plano roteia certo; List/Pro
  vão pro checkout self-service; Company vai pra contato/implantação, não pro trial.
  **Front /register e /planos fora das 5 Leis** → alinhar.
- **#3 Os 3 self-services funcionando.** **List + Lead Plus + HBX Pro** fecham checkout ponta
  a ponta (Company NÃO é self — é implantação/contato). É o teste de aceite de #2/#6. **Item de
  PAREAR com o dono** se travar (ele topa fazer junto, sem eu abrir card pra bobagem).
- **#8b "Falar com suporte" do tutorial.** O botão no fim do tutorial tem que acionar o
  **master WhatsApp** (motor compartilhado) de verdade. → backend.

### FASE D — Radar (Radar + Leads viram 1, nome "Radar") — build, eu (pareio se travar)
- **#5** O item forte ("a vendedora tem que começar a trabalhar"). Radar+Leads viram **uma
  tela só chamada "Radar"** (achar+puxar no mesmo lugar; some a "Base de leads" vazia);
  Vendas fica igual. **Direção TRAVADA** (ver decisões). Doc próprio:
  `PR15062026005-CACA-RADAR-LEADS.md`.

### FASE E — Pagamento ao vivo na VPS (COM O DONO, não autônomo) — #7
- **#7** Acompanhar o pagamento até o fim **na VPS, com o cartão de teste do dono**. É a
  verificação ao vivo da Fase C. Mercado Pago real → exige o dono + ambiente VPS. **NÃO é
  tarefa de madrugada.** Pré-requisito: Fase C verde em dev. Ver `PR14062026012` S4-live/S5.

### FASE F — Mobile (verificação, baixo risco, por último) — #10
- **#10** Auditar o mobile ponta a ponta (o dono achou OK; só confirmar com o preview em
  375px que nada quebrou depois das mudanças de cobrança/website/Caça).

## Execução: TUDO sob mim (dono dispensou o Codex — 15/06)

Sem Codex. O dono prefere meu front e percebeu que **o plano é todo amarrado**
(cobrança ↔ planos ↔ /register ↔ Radar ↔ website) — paralelizar em outro agente arrisca
inconsistência. Então: **front e backend, todos por mim**, na mesma fila serial-aware
(backend de cobrança um de cada vez; front proporcional/consistente entre as telas).

## Decisões TRAVADAS pelo dono (15/06) — não reabrir de madrugada

1. **#5 nome da tela:** **"Radar"** ✅ (sidebar: uma entrada só "Radar"; some "Leads").
2. **#5 endpoint "puxar ESTE card" (1 card):** **criar** ✅ (o de massa já existe; aditivo).
   Distribuição/regra automática viram **seção só-do-admin** no Radar (vendedor não vê).
3. **HBX Company** = o atual **`hbx_melhor` (Full) RENOMEADO** (NÃO key nova): título →
   "HBX Company", **a partir de R$ 445,90/mês + implantação a partir de R$300** (mensalidade
   E implantação negociadas; "a partir de" só aqui), gating intacto. Copy pública SEM "assistido".
4. **+1 self-service novo** `hbx_pro` "HBX Pro" **~249** (Lead Plus turbinado, sem bot/
   implantação). Os **3 self-services = List + Lead + Pro**. NÃO converter Full em self-service.

## Riscos

- **Cobrança meio-pronta** empacotada junto = proibido (regra do dono + PAGAMENTOS.md).
- **Modelo do dono evita o risco de cascata:** `hbx_melhor` só é RENOMEADO (não vira
  self-service), então o gating de bot/cadência/WhatsApp fica intacto. O novo `hbx_pro`
  nasce SEM bot/implantação. Não mexer no gating de `melhor`.
- **Deploy/publish/cobrança real** sem ordem = não. #7 é com o dono.
- Mass-move da Task 0 — fazer com cuidado (renomear, não perder doc vivo).

## Checks por fase
- Front: `cd frontend && npm run lint` → `npm run build` (catraca check-pele).
- Backend: `cd backend && npm run prisma:validate` → `npm run build` + teste da área.
