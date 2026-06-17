# PR17062026046 — RADAR: TELA NOVA, MODELO LIMPO (carrega A/B/C que conversamos)

> **Decisão do dono (17/06):** a tela de Leads/Radar atual está **com regra demais cruzando** —
> vai **recomeçar o Radar numa tela nova**, modelo limpo, em vez de remendar a velha. Este doc
> guarda o **A/B/C que conversamos** como REQUISITOS da tela nova (não como patch da antiga) + o
> mapa das regras que cruzam hoje (pra a tela nova NÃO repetir a teia).
>
> Cruza com (NÃO duplicar): **041** (vendedor puxa → vê → escolhe), **042** (radar vivo), **013**
> (lagoa compartilhada). A tela nova é o lugar onde 041/042/046 finalmente moram juntos, limpos.

---

## ✅ STATUS — APLICADO EM CÓDIGO 17/06 (dono: "vc mesmo implante, seguir o mockup")

Tela `/webscraping` REESCRITA inteira no modelo limpo. **Falta só deploy.**
- **Arquivo:** `frontend/src/app/(app)/webscraping/page.client.tsx` (a vitrine tangida foi substituída).
- **CSS central:** bloco `.radar2-*` em `frontend/src/app/hbx-theme/screens.css` (só tokens; 5 Leis ok).
- **A (search-on-miss) ✅** — rail Estado/Cidade/Segmento + botão **Buscar** dispara `POST /webscraping/
  radar/search-runs` (exige cidade+segmento; sem cidade → pede a cidade, não diz "vazio") + polling 4s
  + banner vivo "Varrendo {cidade} · N achados"; ao terminar recarrega a prateleira.
- **B (número nacional) ✅** — barra do topo lê `GET /night-factory/leads-bank` (`total`+`deltaToday`),
  copy "X empresas no Brasil · +N hoje" + legenda separando vaidade (Brasil) de ação (de baixo).
- **D (prateleira LISTADA) ✅** — aba **Disponíveis pra você** = `radar/leads?scope=vitrine` (mascarado,
  contato vira pills de canal + "revela no Puxar"), **Puxar por linha** = `send-to-vendas`, checkbox +
  **Puxar selecionados**. Aba **Minha carteira** = `radar/leads` sem scope (revelado) → "Abrir" leva a Vendas.
- **Cota colapsada (regra #6) ✅** — **um** medidor: `GET /vendas/usage` → `sellerActiveQuota`
  ("Em mãos {activeCount}/{effectiveLimit}", bloqueia quando esgota/pausa); admin vê o pote da empresa.
- **C (count sem teto) ✅ FEITO** — diagnóstico: "Disponíveis" travava porque `queryRadarRowsForCompany`
  lê no MÁX **1000** linhas (`take: Math.min(readLimit*4,1000)`, `radar-core-presentation.mixin.ts:1864/1876`)
  ordenadas por score e depois filtra em memória (dedup/qualidade/targetType) → `total: filteredRows.length`
  NÃO é count real e não sobe com import. Conserto aditivo: `listRadarLeadsForUser` agora também devolve
  `meta.totalAvailable` = `radarLeadPool.count({ where })` REAL (sem teto, só quando não há filtro
  só-em-memória); o `total` da paginação fica igual (sem páginas vazias). Front lê `meta.totalAvailable`
  no número "Disponíveis": `/leads`, `/vendas` e a tela nova `/webscraping` (badge real, paginador no lido).
  **Ressalva:** o count é "disponível pra você na lagoa" (pré-qualidade/dedup), pode ficar ACIMA do
  deliverable; e ainda depende de o import ter entrado como `ownerCompanyId:null` do `targetType` certo.
- **Checks:** `npm run lint` (0 erros; check-pele 0 violações duras, catraca 537→533) + `npm run build` ✅.
- **Anti-espertão MANTIDO:** mascarar contato + cota. CRÉDITO confirmado no código: pote mensal JÁ é da
  empresa (`commercial-usage-limits.service.ts`, `perUserLimit` null por padrão); única trava por-vendedor
  = **cards ativos na mão (padrão 20)**, que o dono mandou manter.

---

## POR QUE TELA NOVA — as regras que CRUZAM hoje (a teia a evitar)

Mapeado no código nesta conversa. É isso que está confundindo:

1. **Dois números, dois significados, sem aviso:** VPS 4.148 = `COUNT(*)` cru (almoxarifado, com
   lixo) vs Radar 543 = prateleira (com contato/disponível). Honestos, mas ninguém entende sem aula.
2. **Mesmo endpoint, duas telas:** `GET /webscraping/radar/leads` com `scope=vitrine` (lagoa
   mascarada, todos) vs **sem** scope (carteira do vendedor OU lagoa do admin). Um parâmetro vira tudo.
3. **Mesma tela, duas realidades por papel** (`radar-core-presentation.mixin.ts:2676`):
   vendedor → `assignedUserId = ele` (só a carteira dele, vazia se novo); admin → `null` (lagoa toda).
4. **"Puxar" CONSULTA, não BUSCA:** olha o pool existente, nunca dispara o motor → tela parece morta
   quando o filtro é estreito (odonto/Girau).
5. **Disponíveis só atrás do "Puxar" mascarado** pro vendedor — não há lista navegável; só um contador.
6. **Três cotas empilhadas:** `limite/dia` + `cota de cards ativos` + quota do `search-run`. Difícil
   saber qual barrou.
7. **Teto silencioso de 1.000 linhas** no read (`queryRadarRowsForCompany`).
8. **Zoo de status** cruzando filtro: rejected/duplicate/hidden/sent_to_vendas/imported_to_vendas/
   in_attendance/blocked/opt_out/discarded/complaint…

## O MODELO LIMPO da tela nova — 3 camadas, uma história só

```
LAGO NACIONAL        →   PRATELEIRA (minha)        →   CARTEIRA (puxei)
Banco HBX, motor 24/7    disponível p/ mim, mascarado    o que virou meu (Vendas)
"enche o olho"           LISTADO + filtro + buscar       GATE: limite/dia + cota ativa
número nacional          (não só contador)               (a trava anti-espertão)
```

Regra de ouro da tela nova: **abundância na VISTA, escassez na AÇÃO.** Mesma trava de hoje
(mascarado + cotas) — só que o modelo fica óbvio em vez de cruzado. Vendedor e admin veem a MESMA
estrutura (lago→prateleira→carteira); muda só o que cada um pode na carteira.

---

## REQUISITOS = o A/B/C que conversamos (a tela nova precisa entregar os três)

### A — A busca BUSCA (search-on-miss) · o que mata a dor
Prateleira fina + tem cidade → **dispara o motor** em vez de dizer "vazio". Reusa o que já existe:
- `POST /webscraping/radar/search-runs` → `startRadarSearchRunForUser`
  (`backend/src/webscraping/radar/05-delivery/radar-core-delivery.mixin.ts:1123`): checa quota,
  tenta cache do banco, senão `scheduleSearchRunPump` (motor assíncrono), devolve `id`. **Exige
  cidade+segmento** (`:1127`). Grava o achado de volta na lagoa.
- Polling: `GET /webscraping/radar/search-runs/:id` e `/latest`. **Padrão pronto pra copiar:**
  `frontend/src/app/(app)/webscraping/page.client.tsx:258-275`.
- UX: estado VIVO "varrendo {cidade}… {foundCount} achados" → no terminal, lista os fresquinhos
  (mascarados). Sem cidade: pede a cidade (motor não varre sem ela), não diz "vazio seco".

### B — Encher o olho com número NACIONAL · quase free
- Vitrine mostra o **lago** (`GET /night-factory/leads-bank` → `total`+`deltaToday`, visível a
  qualquer usuário — `night-factory-public.controller.ts:26`): "X mil empresas no Brasil · +N hoje".
- Copy honesta e separada: número grande = **"no Brasil"** (vaidade/contexto); número de ação =
  **"pra você agora"** (gated). Nunca promete puxar tudo. Não toca preço/plano.

### C — Contar certo (sem teto de 1.000) · por último, com cuidado
- Hoje `total = filteredRows.length` de um read capado em `take: Math.min(readLimit*4, 1000)`
  (`radar-core-presentation.mixin.ts:~1876` e `~2717`) → contador nunca passa de ~1000.
- Conserto: `total` via `radarLeadPool.count({ where })` real (empurrar pro SQL o que é
  SQL-expressável; rotular pelo que de fato conta). Página de exibição segue lida; só o total vira count.

### (novo, da última dúvida) D — Prateleira LISTADA pro vendedor, não só contador
Na tela nova, o vendedor **vê a lista** dos disponíveis (mascarados, com "puxar" por linha) — não só
o número solto. Mantém a cota (anti-cherry-picking). Resolve o "parece morto" de raiz, em vez de
patch. (Era a tensão que a última conversa expôs: hoje vendedor só vê carteira+contador.)

---

## Anti-espertão (NÃO relaxar — é o que o dono quer)
Contato mascarado até importar + `limite/dia` + `cota de cards ativos` + quota do `search-run`.
Tudo isso **já existe e funciona** — a tela nova herda, não reinventa nem afrouxa.

## Checks (quando for aplicar)
- Front: `cd frontend && npm run lint` → `npm run build`.
- Back (só se mexer em A-campo-additive ou C): `cd backend && npm run prisma:validate` → `npm run build`.
- E2E só se validar o caminho ponta-a-ponta puxar→buscar→importar com ambiente pronto.

## NÃO fazer (PAGAMENTOS.md / segurança)
Não tocar preço/plano/paywall/checkout. Não relaxar cota/cota-de-ativos. Não apagar histórico
negativo (MOTOR.md). Visual só em token/classe central (5 Leis). Tela nova = kit fechado, não nasce
do zero solta ([[contrato-de-telas-fixas]]).
