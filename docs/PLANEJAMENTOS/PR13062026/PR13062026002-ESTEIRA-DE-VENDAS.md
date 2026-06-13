# PR13062026002 — A Esteira de Vendas (visão + análise fria)

> Visão do dono (13/06/2026): uma esteira que pega lead frio do webscraping, aquece por
> e-mail → WhatsApp humanizado, e entrega **lead morno/quente** com a linha do tempo
> inteira pra vendedora ligar. Posicionamento: **Full+ = lead quente + "quantos vendedores
> você quer?"**; Lead/List = listinha de webscraping com e-mails de lambuja.
>
> Este doc é o **esqueleto** que destrava as decisões paradas do `/atendimento` (os botões
> mortos = controles desta esteira) e contém a **análise honesta** (sem cheerleading) que
> o dono pediu. Cold water está dentro do doc de propósito.

## 1. A esteira — 5 estágios

| # | Estágio | Estado | Dono |
|---|---|---|---|
| 1 | Webscraping acha o lead + e-mail | ✅ feito | Radar / RadarLeadPool |
| 2 | E-mail dispara automático (com cautela) | 🟡 parcial | CompanyMailer (PR-005) + cadência (PR13062026001) |
| 3 | WhatsApp pós-e-mail, humanizado ("te mandei e-mail dia X") | 🟡 quase | cadência passo 2 — **gargalo: qual WhatsApp** (§3) |
| 4 | **Vendedora recebe lead morno/quente + linha do tempo + inteligência → liga** | ❌ a fazer | `/atendimento` + Vendas — **o coração** |
| 5 | Vitrine: visual "mapa/kanban" na página principal vendendo a esteira | ❌ a fazer | marketing/landing — **o último** |

O estágio 4 é onde o dinheiro acontece: a vendedora não liga no escuro, liga com um
**dossiê** — "e-mail enviado dia X (não abriu / abriu) · WhatsApp dia Y (sem resposta /
'tô ocupado, falo depois' / 'vou pensar')". A "inteligência" classifica esse comportamento
em **temperatura** (frio→morno→quente) e prioriza a fila de ligação.

## 2. Como isto destrava o `/atendimento` (os botões mortos são os controles da esteira)

Do transcript "Atendimento screen backend integration", sobraram 6 botões mortos. Eles não
eram CRM genérico — são a esteira:

- **"Mover etapa"** = mover o lead entre estágios da esteira (`frio → aquecendo → respondeu → ligar → proposta → fechado/perdido`). Backend pronto (`PATCH /conversations/:id/status`); faltava saber **quais etapas** — agora são as da esteira.
- **"Criar tarefa"** = gerar a **tarefa de ligação** pra vendedora quando o lead esquenta (já vinculável a `status-card.returnAt`). É o gatilho do estágio 4.
- **"Enviar proposta"** = ação de fechamento (abre o card no Vendas / manda texto pronto). Estágio "proposta".
- **KPIs "Tempo de resposta / Conversões"** = a métrica da esteira (quantos frios viraram quentes, quantos quentes fecharam). Hoje "—" porque não existe contrato; passa a existir quando a esteira existir.
- **Abas "Contexto/Histórico" + "Ver todas"** = o **dossiê/linha do tempo** que a vendedora lê antes de ligar. É literalmente o que o dono descreveu no estágio 4.

Conclusão: **a resposta que o dono não conseguia dar no `/atendimento` é esta tabela.** Os
botões se ligam quando o modelo de estágios da esteira existir (§5 do PR13062026001 + um
campo de temperatura no lead).

## 3. WhatsApp Meta — NÃO é "feature pra implantar", é uma PAREDE de compliance

A peça mais perigosa de toda a visão. Hoje o código usa **Evolution/Webwhats (não-oficial,
via Baileys)**. A "parte Meta" seria a **WhatsApp Cloud API oficial**. Os dois têm teto:

- **Cloud API oficial (Meta):** mensagem iniciada por empresa exige **template pré-aprovado**
  pela Meta; só há janela livre de 24h **depois que o cliente te responde primeiro**;
  marketing template exige **opt-in**; taxa alta de bloqueio derruba o *quality rating* do
  número → limite cai → número suspenso. **Disparo frio pra número raspado sem opt-in
  VIOLA a Business Messaging Policy** e mata a conta. Não é "às vezes" — é a regra.
- **Evolution/Webwhats (o que roda hoje):** funciona até a Meta banir o número, e em
  **volume de disparo frio isso é rápido**. É contra o ToS. Serve pra operar pequeno /
  número-queimável, não pra escalar disparo cego.

**O que isto significa pra esteira (sem dourar):** o sonho "WhatsApp dispara automático pro
lead frio" é, no nível oficial, proibido; no não-oficial, autodestrutivo em escala. O jeito
que **funciona e não quebra**:
- WhatsApp do estágio 3 só dispara por **sinal de engajamento** (abriu/clicou o e-mail, ou
  já interagiu), **não** blast cego. A frase "te mandei e-mail dia X" é boa porque pressupõe
  contato prévio — mas ainda é frio aos olhos da Meta sem opt-in.
- **Usar o `whatsapp-consent-ledger.service.ts` que JÁ existe** como **porteiro do passo 3**:
  sem consentimento registrado, não dispara WhatsApp automático — vira tarefa de ligação
  humana (estágio 4) direto. Isso já está meio construído e é exatamente o primitivo certo.
- Decisão do dono necessária: (a) operar Evolution com números-queimáveis aceitando churn de
  número como custo, ou (b) ir pra Cloud API oficial com opt-in/templates (mais lento, mais
  caro, mas não morre). **Recomendação: (a) pra os ~20 primeiros clientes provarem o
  conceito; (b) só quando a esteira já provou que fecha venda.**

## 4. E-mail (estágio 2) — deliverability queima calado

Disparo frio pra e-mail **raspado** = bounce alto + reclamação de spam → reputação do
domínio do tenant afunda → blocklist. SMTP por tenant **sem** warmup, SPF/DKIM/DMARC e
higiene de lista faz o estágio 1 render pouco **e** pode torrar o domínio real do cliente.
"Com cautela" = exatamente isto: warmup, volume rampado, validação MX (já existe no motor),
remover bounce na hora. Sem isso, a esteira parece quebrada sem ninguém ver por quê.

## 5. Posicionamento e modelo de negócio (honesto)

- Full+ = **lead quente + braço humano** ("quantos vendedores você quer") é uma proposta
  real e vendável no SMB brasileiro. Gente paga por "me traga cliente".
- **Mas é negócio de SERVIÇO vestido de SaaS.** Implantação manual de WhatsApp (cap ~20
  clientes do dono hoje) + acompanhamento = economia de agência, limitada pelo **tempo dele**,
  não pela margem de software. Isso **não é** ruim — agência ganha dinheiro — mas o dono
  precisa **saber** que escala por contratação de gente, não por servidor. A vitrine bonita
  (§6) vende um sonho SaaS que a operação ainda não entrega em escala.
- Lead/List como "listinha limitada" é coerente e protege o Full. Ok.

## 6. A vitrine "impressionante" (mapa/kanban) — é a ÚLTIMA coisa, não a primeira

O visual de 12 segundos que faz a pessoa entender "Full = lead quente" é **vitrine**: alto
valor de conversão da landing, **zero** valor se os estágios 2–4 não produzirem lead quente
de verdade. É o pedaço mais dopaminérgico de construir e o **menos** estrutural. Risco real
de inversão: gastar a energia no mapa lindo enquanto o estágio 4 (o que ganha dinheiro)
fica pela metade.

## 7. Análise fria — dá pra ganhar dinheiro? Qual a chance?

**Dá pra ganhar dinheiro?** Sim. O núcleo (lead aquecido + contexto + fechador humano,
nativo de WhatsApp, SMB BR) é proposta legítima e já tem ~70% da fundação construída.

**Onde quebra (registro de risco, do mais letal pro menos):**
1. **Sequenciamento / foco (o maior).** Está-se desenhando o estágio 5 (vitrine) com o 2
   parcial, o 3 "quase" e os controles do 4 mortos. O negócio não morre de mapa feio; morre
   de 2–4 nunca fecharem direito e **zero cliente fechando venda pela esteira**.
2. **WhatsApp compliance (§3).** Teto duro no disparo automático. Sem desenhar pra
   opt-in/engajamento, queima conta e queima cliente.
3. **E-mail deliverability (§4).** Falha silenciosa que parece bug e é reputação.
4. **Sem prova de fechamento.** "Lead quente" só vale se converte. Não há dado de conversão
   ainda. Vender "lead quente" que não fecha = churn brutal em mercado pequeno = boca-a-boca
   te mata.
5. **Teto operacional (§5).** Cresce por gente, não por software.

**Chance de sucesso, sem enrolar:**
- Como **"viro um negócio de verdade que paga minha vida e a de algumas vendedoras"**:
  **boa** — provavelmente alcançável SE finalizar 2→4 e fechar 5–10 clientes Full que vejam
  venda acontecer. A tecnologia já está quase lá.
- Como **"vira SaaS escalável grande"**: **baixa no desenho atual** — por causa do gargalo
  de serviço + teto do WhatsApp, **não** por causa da ideia ou da inteligência de quem fez.
- A variável que decide **não é a ideia (boa) nem o QI (suficiente)** — é **terminar em vez
  de redesenhar**, e provar 1 fechamento real antes de construir a vitrine.

## 8. Sequenciamento recomendado (a ordem que não te deixa quebrar)

1. **Provar o loop com 1 cliente real** — use as **próprias 2 vendedoras** vendendo o HBX
   como o primeiro caso: e-mail → WhatsApp (consent ledger) → tarefa de ligação → fechou?
   Mede conversão real.
2. **Ligar o estágio 4 no `/atendimento`** (os 6 botões → estágios da esteira + temperatura
   do lead + dossiê pra vendedora). É o que ganha dinheiro **e** o que as vendedoras precisam.
3. **Endurecer 2 e 3** (deliverability de e-mail; WhatsApp por engajamento + consent).
4. **SÓ ENTÃO a vitrine (§6)** — quando a promessa do mapa for verdade.

## 9. Decisões que dependem do dono

- **WhatsApp:** Evolution queimável (rápido, prova conceito) **ou** Cloud API oficial
  (lento, sobrevive)? Recomendo Evolution agora, Cloud depois de provar fechamento.
- **`/atendimento`:** confirmar os estágios da esteira como as etapas do "Mover etapa".
- **Estágio 4:** "Criar tarefa" = tarefa de ligação na agenda do Vendas (sim?).
- **Cadência só-e-mail no Lead+?** (herdado do PR13062026001 — decisão de preço dele).
- **Aceitar a ordem do §8** (provar fechamento antes da vitrine) ou priorizar a vitrine
  mesmo sabendo do risco de inversão — decisão dele, registrada aqui.

## 10. Decisões travadas (13/06, pós-confirmação do dono)

- **Objetivo #1 absoluto:** o HBX **nunca fechou** venda ponta a ponta pela esteira. Logo,
  toda prioridade vira **fazer as 2 vendedoras fecharem UMA venda, medindo cada passo**.
  Nenhum build elaborado (mapa, automação) antes disso. Loop provado primeiro.
- **Estágios:** o dono escolheu **estágios próprios da esteira** (não reusar o funil cru).
  Implementação que **não quebra o futuro** (obrigação registrada): novo campo
  `VendasLead.esteiraStage` = **fonte de verdade operacional**, com **mapeamento 1:1
  determinístico** pro `VendasLead.status` legado (comissão/relatório leem `status`):

  | esteiraStage | significado | → VendasLead.status |
  |---|---|---|
  | `frio` | raspado, sem toque | `novo` |
  | `aquecendo` | e-mail/WhatsApp enviado, sem resposta | `contato` |
  | `respondeu` | engajou (abriu/respondeu) = morno/quente | `retorno` |
  | `ligar` | na fila de ligação da vendedora | `retorno` |
  | `proposta` | proposta enviada | `qualificado` |
  | `fechado` | venda fechada | `encerrado` (+ `saleStatus=sale_confirmed`) |
  | `perdido` | perdido | `encerrado` |

  `status` é DERIVADO de `esteiraStage` (nunca editado à mão em paralelo) — é assim que se
  evita os dois eixos divergirem.
- **Canal:** telefone é o motor (sem porteiro). WhatsApp só follow-up consent-gated
  (`whatsapp-consent-ledger`). E-mail = toque frio macio com cautela de deliverability.

## 11. Próximo passo (ordem de execução — começa aqui)

0. **Verificar (não construir) o loop mínimo de ligação** — a vendedora abre o lead, vê
   telefone, marca resultado da ligação, agenda retorno. Se já funciona, elas caçam o 1º
   fechamento JÁ; eu construo o resto em volta delas. (Caminho crítico que já estava mapeado.)
1. **Estágios da esteira** — campo `esteiraStage` + mapa acima → liga o "Mover etapa".
2. **Dossiê na tela** — linha do tempo que a vendedora lê antes de ligar (dado já existe).
3. **"Criar tarefa" = tarefa de ligação** (agenda do Vendas, `returnAt`).
4. **WhatsApp consent-gated** como follow-up dos que engajaram.

## 12. VERIFICADO 13/06 — o que já existe e está ligado (nada a construir pra começar)

Varredura de código confirmou que o caminho do 1º fechamento **já está pronto**:

- **Loop de ligação (tela Vendas):** registrar resultado (`POST /vendas/lead/:id/attempt`),
  mover etapa (`PATCH /vendas/lead/:id {status}`), agendar retorno (`{returnAt}`), fechar
  venda (modal + `hbx-handoff`). Telefone visível. Board por vendedora (`assignedUserId`).
- **Distribuição (tela /leads):** manual (`POST /webscraping/radar/leads/distribute-to-vendedores`),
  regra automática (`/webscraping/radar/auto-distribution` + run), enviar p/ Vendas.
- **Auditoria de vendedora (`GET /vendas/seller-audit`, consumida em Relatórios+Dashboard):**
  recebidos/trabalhados/idle/atrasados/interessados/fechados, `workRate`, classificação
  forte/fraco (`performing|learning|needs_followup|active`) com recomendação, top
  cidade/segmento, governança por vendedora, relatório de conversão + PDF.
- **Caveat honesto:** sem venda fechada ainda, a auditoria mede ESFORÇO (quem trabalha vs
  quem senta), não DINHEIRO. Vira ranking de faturamento quando os fechamentos começarem.

**Gargalo do 1º fechamento = operacional (distribuir leads + discar), NÃO código.**
Não consegui verificar o render logado (preview travado por login) — teste final é um
dry-run do dono: distribuir ~5 leads → logar como vendedora → board + auditoria populam.
Decisão do dono (13/06): **soltar as vendedoras pra vender**; estágios da esteira ficam
pra depois, informados pelo que elas baterem na vida real.
