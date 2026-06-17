# PR17062026046 — RADAR: a tela LIMPA do VPS SUBSTITUI a /leads (fusão + features)

> **Ordem do dono (17/06):** *"você criou uma /webscraping no lugar errado que chegou MUITO perto
> da perfeição, depois cagou limpando a cagada na /leads. A /webscraping tá no VPS, a /leads no
> localhost. Junte isso e encaminhe pro Sonnet máximo resolver bloco por bloco."*
>
> **A decisão final (mata a confusão dos chats anteriores):** a tela limpa que vive no VPS —
> `WebscrapingClient` (3 camadas: lago→prateleira→carteira) — é a CERTA. Ela vira a **/leads
> canônica**, **substituindo** a /leads atual (a do bolt-on KPIs+drawer). Não é barra colada na
> velha — é a velha que SAI inteira (no-legado). `/webscraping` continua `redirect("/leads")`.
>
> Cruza (NÃO duplicar): **041** (puxa→vê→escolhe), **042** (radar vivo), **013** (lagoa),
> **048-F3** (Caçador noturno = o motor por trás do "Automático"), **045-F** (prospecção no Vendas).

---

## DE ONDE VEM CADA LADO (o Sonnet precisa saber a fonte)

- **A tela CERTA (quase perfeita, está no VPS):** `WebscrapingClient` — recuperável do git em
  `git show HEAD:"frontend/src/app/(app)/webscraping/page.client.tsx"` (503 linhas). Modelo limpo:
  cabeçalho LAGO NACIONAL + rail de filtros + abas **Disponíveis pra você** / **Minha carteira** +
  checkbox por linha + **Puxar selecionados** + medidor único de cota. Contato mascarado na
  prateleira, revelado na carteira.
- **O CSS dela (`.radar2-*`)** foi removido só no working tree; **continua no HEAD** —
  `git show HEAD:frontend/src/app/hbx-theme/screens.css` tem 25 ocorrências `radar2-`. Recuperar
  esse bloco pra `screens.css`.
- **A /leads atual (a que vai MORRER)** = `frontend/src/app/(app)/leads/page.client.tsx`
  (`LeadsClient`): KPIs + tabela com chips de status + **drawer de distribuição automática** +
  **distribuir-para-vendedor**. O dono foi explícito: **"Admin não distribui nada"** → essa UI de
  distribuição manual morre junto (no-legado). O `PuxarLeadsPanel` (form→preview) também sai: a
  tela limpa já faz puxar em lote direto na lista.

## ✅ O que JÁ ficou bom e SE HERDA (não refazer)
- **C (contagem sem teto) LIVE** — `meta.totalAvailable = radarLeadPool.count({where})` real (dono
  confirmou 543→4.025 na VPS). A tela limpa já lê `totalAvailable` no badge da aba.
- **Anti-espertão** — contato mascarado + cota (`/vendas/usage` → `sellerActiveQuota`, padrão 20
  ativos/vendedor; pote mensal é da empresa, `perUserLimit: null`). **Não afrouxar.**
- **Search-on-miss (A)** — `POST /webscraping/radar/search-runs` + polling `/:id` e `/latest`. A
  tela limpa já tem o botão **Buscar** + barra "Varrendo {cidade}… N achados".

---

## A TELA IDEAL (a fala do dono, traduzida em layout)

```
┌────────────────────────────────────────────────────────────────────────┐
│  [Total no Brasil  +x últ. min]  [Filtrados]  [Com WhatsApp]  [Em atend.]│  ← Bloco 2 (4 botões/KPIs)
├──────────────┬───────────────────────────────────────────────────────────
│ FILTROS      │  ( Disponíveis pra você  N )   ( Minha carteira  M/20 )    │  ← Bloco 0 (abas)
│ Tipo cliente │  ┌───────────────────────────────────────────────────┐   │
│ Cidade       │  │ ▢ Empresa        Cidade     Contato     [Puxar]    │   │  ← Bloco 3 (lista seletiva)
│ Estado       │  │ ▢ …                                                │   │
│ Alcance      │  └───────────────────────────────────────────────────┘   │
│ Quantos      │  [Em mãos 3/20]              [Puxar selecionados (2)]     │
│ [Ver N]      │                                                            │
│ [Automático]◉│  ← Bloco 6 (toggle pulsante; persiste preferência)        │
└──────────────┴───────────────────────────────────────────────────────────
```
Regra de ouro herdada: **abundância na VISTA, escassez na AÇÃO.**

---

## BLOCOS (ordem = dependência + "mata a dor" primeiro). Cada bloco é aplicável e checável sozinho.

### Bloco 0 — ESPINHA: a tela limpa SUBSTITUI a /leads · front · **1º, base de tudo**
**Objetivo:** /leads passa a renderizar a tela limpa de 3 camadas; a velha sai inteira.
**Arquivos:**
- `frontend/src/app/(app)/leads/page.client.tsx` — **substituir** o `LeadsClient` pelo corpo do
  `WebscrapingClient` (recuperar de `git show HEAD:"frontend/src/app/(app)/webscraping/page.client.tsx"`).
  Renomear o componente para `LeadsClient` e manter o export que a `leads/page.tsx` espera.
- `frontend/src/app/hbx-theme/screens.css` — **recuperar o bloco `.radar2-*`** de
  `git show HEAD:frontend/src/app/hbx-theme/screens.css` (25 regras). Sem ele a tela fica sem layout.
- `frontend/src/app/(app)/webscraping/page.tsx` — **deixar como está** (`redirect("/leads")`).
- **Apagar** `frontend/src/components/hbx/puxar-leads-panel.tsx` se nada mais o importa (grep antes),
  e remover do `LeadsClient` velho: drawer de distribuição, `distribute-to-vendedores`,
  `auto-distribution` UI, `KpiRow` antigo. (Admin **não distribui** — ordem do dono.)
**Não fazer:** não criar tela nova do zero — é recuperar a que já existe. Não tocar nos endpoints.
**Check:** `cd frontend && npm run lint` (check-pele 0 violação) → `npm run build`. Abrir /leads e
/webscraping (redireciona) e ver as 3 camadas.

### Bloco 1 — CONSERTAR OS 3 BUGS DOS FILTROS + centralizar o dropdown · front/CSS
**Os 3 bugs do dono (no VPS hoje):** cada filtro com um tipo de clique diferente — "um é branco,
outro é preto, outro clicou e não dá pra clicar de novo, uma zona" + o dropdown de Estado
desalinhado (o "print 2").
**Objetivo:** rail de filtros com **um só padrão visual e de interação**, todos reclicáveis.
**Arquivos:** `screens.css` (`.radar2-rail .f`, `select-dark`, `field-dark`) + o rail no
`page.client.tsx`.
**Passos:**
1. Padronizar TODOS os campos do rail na MESMA classe (`select-dark` pros selects, `field-dark`
   pros inputs com datalist) — nada de cores soltas; cor/borda/fundo só por token (5 Leis).
2. **Estado**: corrigir o `<select>` (o "print 2") — centralizar/alinhar dentro do rail, mesma
   altura/raio dos demais; garantir que abre e fecha e dá pra reabrir (sem estado travado).
3. Acrescentar ao rail os campos que faltam da fala do dono: **Alcance** (Só a cidade / +25 / +50 /
   +100 km, desabilitado sem cidade) e **Quantos** (1/3/5/10/20, default 5). O botão vira
   **"Ver {Quantos} leads disponíveis"**.
**Check:** clicar cada filtro 2x seguidas; trocar Estado e ver Cidade resetar; lint+build.

### Bloco 2 — OS 4 BOTÕES/KPIs DO TOPO · front (dados 2 e 3 vêm do Bloco 5)
**Objetivo:** a fileira que o dono desenhou. Cada um é um painelzinho:
1. **Total no Brasil** — `GET /night-factory/leads-bank` (`total` + `deltaToday`); mostrar
   *"+N nos últimos minutos"* com animação de subida (B2 já existe: `hbx-pool-rise`). Se o banco
   não expõe delta por minuto, usar `deltaToday` e animar — honesto, sem inventar número.
2. **Filtrados** — quantos o motor REMOVEU por não passar (rejected/duplicate/hidden). Placeholder
   "—" até o Bloco 5 ligar o count real no `meta`.
3. **Com WhatsApp** — quantos têm WhatsApp confirmado. Placeholder até o Bloco 5 (é onde mora o
   conserto do "motor não está filtrando").
4. **Em atendimento** — os que estão no Vendas do vendedor atual (`/vendas/usage` →
   `sellerActiveQuota.activeCount`, ou contagem `in_attendance`). Já tem dado.
**Check:** KPIs 1 e 4 com número real; 2 e 3 com "—" + tooltip "ligando o motor"; lint+build.

### Bloco 3 — LISTA SELETIVA + PUXAR + cota 20 compartilhada · front
**Objetivo:** "qualquer lugar que clicar seleciona, ou tem selecionar todos"; nenhum vendedor passa
de 20; os 20 são compartilhados com o Vendas.
**Passos (a tela limpa já tem 80% — completar):**
1. **Linha inteira clicável** seleciona (não só o checkbox) — `role="button"` + `onClick` na `<tr>`,
   igual o `.vlead` fazia. Manter o checkbox visível.
2. Botão **"Selecionar todos / Desmarcar todos"** acima da lista.
3. **Puxar selecionados** já existe (`puxarSelecionados` → loop `send-to-vendas`, para na cota).
   Garantir que o medidor único (`sellerActiveQuota`: `Em mãos X/20`) bloqueia o botão ao chegar no
   teto e mostra "carteira cheia — feche ou agende um retorno".
4. Deixar explícito na copy que **os 20 são compartilhados com o Vendas** ("seus cards estão no
   Vendas; aqui você só completa a carteira").
**Não fazer:** não relaxar a cota; o pote mensal continua da empresa, a trava por-vendedor é só os
ativos na mão.
**Check:** selecionar por clique na linha + selecionar todos; puxar até bater 20 e ver travar; lint+build.

### Bloco 4 — REAVIVAR AGENDA: retorno em 7 dias libera vaga · back+front
**Fala do dono:** *"nenhum vendedor passa de 20. Porém, se um cliente pediu pra retornar daqui 7
dias, esse cliente SAI da carteira e VOLTA depois de 7 dias."* A agenda já existe.
**O que já existe:** `backend/src/vendas/vendas.service.ts` — campo `returnAt`, "agenda viva",
buckets `today/overdue/scheduled`, evento "Retorno agendado".
**Objetivo:** card com `returnAt` no FUTURO **não conta** no teto de 20 ativos (sai da carteira
visível) e **reaparece** quando a data chega.
**Passos:**
1. Backend: na conta de `sellerActiveQuota.activeCount` (a trava dos 20), **excluir** cards cujo
   `returnAt > agora` (agendados pra frente). Confirmar onde a contagem é feita
   (`vendas.service.ts` ~2759/2778 já distingue `overdue`/`scheduled` — usar isso).
2. Backend: quando `returnAt` chega/passa, o card volta a contar (sweep ou lazy no load — seguir o
   padrão de "espelhamento de cards de hoje" já existente, ~6359).
3. Front (/leads + /vendas): na carteira, mostrar os agendados num grupo "Volta em {data}" que não
   ocupa vaga; ação "Agendar retorno (7 dias)" no card.
**Check:** agendar um card pra +7d → ele sai da contagem de 20 → consigo puxar +1; lint + `prisma:validate` + build.

### Bloco 5 — KPI "Filtrados" + "Com WhatsApp" REAIS + CONSERTO "o motor não filtra" · back · **cuidado**
**Fala do dono:** *"com whatsapp (motor ativo ou não) — CORRIGIR pois o motor não está filtrando!!"*
**Contexto (memória + bloco 033):** o filtro "esse número existe no WhatsApp?" roda **só no
master**; sem engine ativo o lead fica `unverified` → o count "Com WhatsApp" sai zerado/errado e a
prateleira mostra gente sem WhatsApp.
**Objetivo:** (a) `meta` da `/webscraping/radar/leads` devolve `filteredOut` (removidos pelo motor)
e `whatsappVerified` (confirmados); (b) garantir que o filtro de WhatsApp roda de fato e a
prateleira honra "com WhatsApp".
**Passos:**
1. Backend: expor no `meta` os dois counts (reusar o `enrichmentSummary.whatsappVerified` que a
   /leads velha já consumia; somar os `rejected/duplicate/hidden` em `filteredOut`).
2. Investigar por que o filtro não roda nesta empresa (engine do master desligado? lead entra
   `unverified` e a tela não respeita?). Se for o gate do master, **não reescrever o motor**
   (memória: motor = 8/10) — ligar/respeitar o estado e, na prateleira, ou esconder os sem-WhatsApp
   ou marcá-los honestamente.
3. Front: KPIs 2 e 3 do Bloco 2 passam a ler os counts reais.
**Não fazer:** não reescrever o motor; não relaxar a regra de número real (WHATSAPP.md).
**Check:** `prisma:validate` + build; numa empresa com engine, "Com WhatsApp" bate com a lista.

### Bloco 6 — "AUTOMÁTICO": preferência permanente + auto-pull · back+front · **maior, por último**
**Fala do dono:** segundo botão ao lado de "Ver N leads": clicou → fica **pulsando "Automático"**;
ativo = busca e **vai jogando no Vendas sem parar**; desativado = para de pulsar e para. **Esse
botão vai também no Vendas.** Ideal: preservar a preferência do vendedor — ele não precisa clicar
"Buscar" toda hora; o motor já recebe a necessidade, prioriza no **agendador**, e amanhã tem mais
resultado. "A pessoa some dali, só clicou no filtro, já acha os 20 e **reserva no estoque** a
preferência que deixou."
**NÃO criar motor novo** — pluga no que existe:
- `POST/PUT /webscraping/radar/auto-distribution` (a regra/agendador que **fica** — não some com a
  distribuição manual do admin) + `scheduleSearchRunPump` (motor assíncrono) + Caçador noturno do
  **048-F3**.
**Passos:**
1. Backend: persistir a **preferência ativa do vendedor** (tipo de cliente + cidade/estado/alcance +
   quantos) como uma "standing order". Quando ligada, o agendador/pump existente trata como
   PRIORIDADE: varre o segmento, reabastece a prateleira e auto-puxa até o teto de 20 (respeitando
   Bloco 3/4). Desligar para.
2. Front: o botão **Automático** ao lado de "Ver N" — pulsa quando ativo (`@keyframes`, token,
   `prefers-reduced-motion`), para quando desativado. Mesmo botão/estado plugado também em
   `frontend/src/app/(app)/vendas/page.client.tsx`.
3. Persistir a preferência mesmo se o vendedor sair (é o "reserva no estoque" — amanhã já tem
   resultado esperando).
**Cruza:** 048-F3 (Caçador) e 045-F (prospecção no Vendas) — é o mesmo motor noturno; reusar, não
clonar.
**Check:** ligar Automático, sair e voltar → preferência preservada + carteira reabastecida até 20;
lint + `prisma:validate` + build.

### Bloco 7 — NICHO do admin alimenta o PUSH (admin não distribui) · cross-ref 048
**Fala do dono:** *"Admin escolhe o nicho da empresa na implantação; esse nicho conversa direto com
os motores e o push. Admin não distribui nada, só escolhe o nicho pra alimentar os avisos depois
que entende a preferência da empresa."*
**O que já existe:** `Company.prospectingSegmentsJson` + `saveCompanyProspectingSegments`
(`backend/src/auth/profile.controller.ts:268`); o front já lê `me.company.prospectingSegments`.
**Objetivo:** garantir o **lugar do admin** escolher o nicho (na implantação/onboarding) e que esse
nicho seja o que alimenta o push — **sem** UI de distribuição manual.
**Passos:**
1. Confirmar/expor a tela do admin pra setar `prospectingSegments` (onboarding/configurações).
2. Ligar o nicho ao push: cross-ref **PR17062026048** (HBX Sinais / F1 push) — o nicho vira a base
   dos avisos "oportunidade com motivo+hora". **Não duplicar 048 aqui**; só garantir o fio.
**Check:** admin salva o nicho → /leads do vendedor já abre pré-filtrada nesse nicho; lint+build.

---

## POR QUE TELA NOVA — a teia que a /leads velha cruzava (a tela limpa já resolve, não repetir)
1. Dois números sem aviso (4.148 cru vs 543 prateleira) → agora: LAGO (nacional) em cima, separado
   da prateleira (pra você).
2. Mesmo endpoint, duas telas (`scope=vitrine` vs sem scope) → agora explícito em **abas**.
3. Mesma tela, duas realidades por papel → agora vendedor e admin veem a MESMA estrutura.
4. "Puxar" consultava, não buscava → **Buscar** dispara o motor (search-on-miss).
5. Disponíveis só atrás de contador → agora **lista navegável** com checkbox.
6. Três cotas empilhadas → **medidor único** (`/vendas/usage`).
7. Teto de 1.000 → `count` real (já LIVE).
8. Zoo de status → a tela limpa só mostra prateleira/carteira; status fica no Vendas.

## Anti-espertão (NÃO relaxar)
Contato mascarado até puxar + `limite/dia` + cota de cards ativos (20) + quota do `search-run`.
Tudo já existe — a tela limpa herda, não reinventa nem afrouxa.

## NÃO fazer (PAGAMENTOS.md / WHATSAPP.md / MOTOR.md / segurança)
Não tocar preço/plano/paywall/checkout. Não relaxar cota. Não reescrever o motor (é 8/10) nem a
regra de número real. Não apagar histórico negativo. Visual só em token/classe central (5 Leis).
Tela não nasce do zero — recupera a que existe ([[contrato-de-telas-fixas]]).

## Checks por bloco
- Front: `cd frontend && npm run lint` (check-pele 0 violação dura) → `npm run build`.
- Back (blocos 4/5/6): `cd backend && npm run prisma:validate` → `npm run build`.
- E2E só se validar puxar→buscar→importar ponta-a-ponta com ambiente pronto.
