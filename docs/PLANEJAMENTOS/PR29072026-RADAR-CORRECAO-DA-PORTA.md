# PR29072026 — CORREÇÃO DA PORTA (repasse para execução)

> **STATUS 29/07 (execução):** C1+C2+C3+C4+C5 + migração-em-leitura do D3 **COMMITADOS no
> master local** (`e4e03f5c`), **NÃO publicados** (aguardando ordem do dono).
> Bateria: 880/898 webscraping (10 falhas pré-existentes, provadas idênticas na árvore HEAD
> via `git archive`) + 251/251 vendas + `tsc --noEmit` limpo.
> Decisões de execução que refinaram o plano:
> - Evidência positiva = conflito de vertical + mapa de exclusão (relaxar VERTICAL_TOKEN_GROUPS
>   recriaria falso negativo: "Auto Posto" cai em "oficina" pelo token `auto`). Caso EDR coberto
>   por regra `imobiliaria` NOVA no mapa de exclusão de `distribuidora`.
> - C4: telefone NÃO é âncora do anti-menu (o caso Mirão veio COM o telefone do site);
>   âncora forte = CNPJ; sufixo jurídico já escapava sozinho.
> - D3 ganhou migração EM LEITURA: carimbo velho `segment_mismatch` + "Sem evidencia…"
>   é lido como `segment_unconfirmed` (sem tocar o banco).
> - Suíte anti-perda (C5) reescrita: a antiga passava pelo caminho vazio (enriquecimento
>   devolvia [] e o merge injetado nunca rodava) — teste verde que não provava nada.
> **C6 ENTREGUE (29/07, decisão do dono: opção completa):**
> - C6a: morte por segmento (evidência positiva) vira ESTOQUE global no pool sob a categoria
>   da EVIDÊNCIA (`storeMismatchAsRealSegmentStock`, delivery mixin) — nunca o texto buscado
>   (D9); linha existente nunca é sobrescrita; memória por telefone/placeId faz o merge quando
>   a busca do ramo certo re-descobrir a empresa.
> - C6b: response do run ganha `foraDoSegmento[]` (mascarado, mesmo contrato dos bons) +
>   rota `POST radar/search-runs/:id/items/:itemId/rescue` — resgate em 1 clique materializa
>   o card na vitrine da empresa sob o segmento buscado (quality aprovada com motivo honesto).
> - C6c: bloco recolhido "Fora do segmento (N)" na tela /leads (classes `radar2-fora` em
>   hbx-theme/screens.css), botão "É do meu segmento".
> **PENDENTE:** C7 completo (replay coleta→apresentação como suíte golden; as vacinas
> D2/D3/D4/C6 cobrem parte) · conferir na tela pós-publish (D3: filtrar vitrine por
> "marmorarias").

> **Documento de REPASSE.** Tudo que é preciso saber está aqui — não é preciso reler a sessão
> anterior. Auditoria feita por worker + verificação manual no código e no VPS (29/07/2026).
>
> **Estado: os defeitos abaixo estão EM PRODUÇÃO.** Commits da frente, todos em `origin/master`:
> `348651c3` (E1 front) · `d5d914e1` (E2+E4) · `1eeaf9ca` (E3.1) · `cf932610` (E3.2) ·
> `f456d844` (4 fixes da busca advocacia). Publishes: `d25b2f4b` (15:46 UTC) e `9780849a`
> (18:17 UTC). Plano original: [PR29072026-RADAR-ESTABILIZACAO.md](PR29072026-RADAR-ESTABILIZACAO.md).

---

## O ERRO-RAIZ, em uma frase

**Transformei "não sei" em "não presta".** A porta de segmento que liguei trata **ausência de
evidência** como se fosse **prova de outro segmento** — e mata o card. O plano E2 mandava
explicitamente o contrário: sem evidência, o lead segue vivo marcado como "não confirmado".

Um erro de sequência agravou: liguei a porta **antes** de entregar a rede de segurança (o bloco
visível "Fora do segmento (N)"), que era a justificativa para a porta poder ser dura.

---

## D1 · 🔴 BLOQUEADOR — a porta mata "sem evidência"

**Onde:**
- [radar-core-quality-enrichment.mixin.ts:527](../../backend/src/webscraping/radar/03-enrichment/radar-core-quality-enrichment.mixin.ts) —
  `if (input.targetType === 'pj' && segmentMatchScore < 55) status = 'segment_mismatch';`
- [radar-core-quality-enrichment.mixin.ts:366-435](../../backend/src/webscraping/radar/03-enrichment/radar-core-quality-enrichment.mixin.ts) —
  `scoreSegmentMatch` devolve **25** com `"Sem evidencia suficiente de aderencia ao segmento."`
  (linha 433) e **45** com `"Evidencia parcial…"` (linha 429). Ambos < 55 → viram mismatch.
- [radar-quality-gate.service.ts:292-296](../../backend/src/webscraping/radar/02-filter/radar-quality-gate.service.ts) —
  `blockedQualityStatuses` inclui `segment_mismatch` na lane web → `buildReject`.

**A cadeia:** sem evidência → score 25 → `status='segment_mismatch'` → gate rejeita → card morre.

**Prova em produção** (motivo gravado em `WebscrapingSearchRunItem.duplicateReason`, 29/07):

| Janela UTC | "Sem evidencia suficiente…" | "Evidencia parcial…" |
|---|---|---|
| antes de 15:46 (pré-E2) | 0 | 0 |
| 16:00 | 36 | 9 |
| 17:00 | 24 | 0 |
| 18:00 (pós-`f456d844`) | 21 | 0 |

Dos 90 bloqueados hoje: **81 "sem evidência" + 9 "parcial" — ZERO por evidência de outro
segmento.** Volume da classe que passou a morrer: ~146 cards em 28/07, 165 em 23/07 →
**~150 leads/dia** que antes eram entregues.

---

## D2 · 🔴 BLOQUEADOR — falso negativo estrutural (consequência de D1)

A lei exige a **frase completa do pedido** no texto do candidato. Nome comercial brasileiro
quase nunca contém a frase do segmento. Medido rodando `scoreSegmentMatch` real contra o
catálogo `frontend/src/lib/radar-segments.ts`:

| Segmento pedido | Nome real | score | hoje |
|---|---|---|---|
| hotéis | `HOTEL GAUCHO` | 25 | BLOQUEADO |
| postos de combustível | `Auto Posto Ariella Ltda` | 45 | BLOQUEADO |
| depósitos de bebidas | `Distribuidora De Bebidas 3m Ltda` | 45 | BLOQUEADO |
| agências de marketing | `Lamego Propaganda Ltda` | 25 | BLOQUEADO |
| autoescolas | `Centro De Formacao De Condutores Interlagos` | 25 | BLOQUEADO |
| cartórios | `Tabelionato De Protesto De Titulos` | 25 | BLOQUEADO |
| clínicas odontológicas | `Sorridents` | 25 | BLOQUEADO |
| açougues | `Maturo Boutique de Carnes` | 25 | BLOQUEADO |
| mecânicas diesel | `Forte Diesel Araraquara` | 45 | BLOQUEADO |
| imobiliárias | `F S Administradora De Bens Ltda` | 25 | BLOQUEADO |
| casas de ração | `Agropecuaria Sao Jorge` | 25 | BLOQUEADO |

Segmentos onde ≥50% do pool REAL reprova: postos 46/49 · açougues 40/44 · cartórios 36/48 ·
fonoaudiólogos 32/35 · malharias 30/33 · mecânicas diesel 26/30 · depósitos de bebidas 27/31 ·
hotéis 24/28 · empreiteiras 23/26. Snippet neutro **não** salva (testado).

**Caso mais duro (busca advocacia/Rio Claro, pós-publish das 18:17):**
`Escher, Moraes E Biscaro Sociedade De Advogados` **passa** ×
`JOSÉ ANTONIO ESCHER, MARIA FERNANDA BISCARO` (mesma banca) **morre**.
Também mortos: `Dr. Jouber Turolla`, `Thais Nayara Da Costa Lima`, `JULIA CAMARGO`,
`Gabriel Ladeira`, `Caroline Filier Beloto`, `Pesce Amoedo`, `FR & MA`.
O fix de plural do `f456d844` salvou as "Sociedade De Advogados"; **advogado autônomo e banca
nomeada pelos sócios continuam morrendo** (~50% de falso negativo na janela).

---

## D3 · 🔴 BLOQUEADOR (SUSPEITA — não reproduzido ponta a ponta) — lead que JÁ está na prateleira some

**Onde:** [radar-core-presentation.mixin.ts:1845-1850](../../backend/src/webscraping/radar/06-presentation/radar-core-presentation.mixin.ts) —
`filterRowsByLeadQuality` → `isListDeliverableCard` → **o mesmo gate novo**, rodando em tempo de
LEITURA sobre linhas do `RadarLeadPool`.

Freio parcial: `getCandidateQuality` prefere a quality já gravada; 4.944 das 7.073 linhas web do
pool têm `segmentMatchScore` salvo e mantêm o veredito antigo. **Mas 2.129 linhas não têm** e são
recalculadas com a lei nova. Rodando a lei sobre as 4.589 linhas sem `businessCategory`:
**3.221 (70%) dão `segment_mismatch`.**

Exemplos que sumiriam: buscando "marmorarias" → `Olochove E Silva Marmores Ltda`,
`Edp Marmores E Granitos Ltda`; "casas de ração" → `Soldado Racoes`,
`Norte Racoes Distribuidora Ltda`; "locadoras de veículos" → `Video Pato Locadora Ltda`.

**Confirmar antes de agir:** logar na vitrine e filtrar por um desses segmentos.

---

## D4 · 🟠 SÉRIO — a máscara do card ao vivo foi para o array errado (fix 3 do `f456d844` NÃO pegou)

**Onde:** [radar-run-presenter.service.ts](../../backend/src/webscraping/radar/06-presentation/radar-run-presenter.service.ts)
- `maskRunContactForShowcase` definida na **linha 53**, aplicada na **linha 329** — dentro de
  `results.map(...)`, que vira o campo **`results`** (linha 518).
- O campo **`items`** é montado SEPARADAMENTE na **linha 451**, com `phone`/`phoneDigits`
  (linhas 460-461) e `email` (467) **CRUS**, e **sem** `channelPresence`/`hasPhone`.

**Quem lê o quê:** o front lê **`items`** — `leads/page.client.tsx` (re-hidratação/poll usam
`s.currentRun?.items` e `latest.items`) e `casca/screens/vendas-buscar.tsx`. O tipo `RunResponse`
do front **nem tem campo `results`**; `grep` por `res.results|run.results|latest.results` no
frontend = **zero ocorrências**.

**Consequência dupla — os DOIS defeitos que o commit dizia ter corrigido seguem abertos:**
1. **Vazamento de contato**: telefone e e-mail vão crus no payload da busca ao vivo, antes de
   puxar/pagar. Visível no DevTools durante uma busca.
2. **"sem contato" mentiroso**: `contatoMascarado()` (`leads/page.client.tsx`, ~linha 2201) chama
   `resolveRadarChannelPresence(row)` sobre o item de `items[]`, que não tem `channelPresence`
   → fallback `false` → todo card ao vivo continua dizendo "sem contato".

**Teste verde falso:** `radar-run-presenter-mask.test.ts` afirma sobre `response.results[0]` —
prova a máscara num campo que ninguém consome, enquanto `response.items[0].phone` ao lado
carrega o telefone cru. **Este é o erro de método que o plano existe para eliminar (teste por
estágio, pipeline furado) e que eu repeti.**

---

## D5 · 🟠 SÉRIO — a poda de endereço mutila razão social onde a cidade É a identidade

**Onde:** [radar-core-shared.ts:819](../../backend/src/webscraping/radar/shared/radar-core-shared.ts)
(`stripLocationTailFromName`, teto `NAME_TAIL_MIN_WORDS = 7` na linha 807), chamada em
[radar-core-provider.mixin.ts:479](../../backend/src/webscraping/radar/providers/hbx-engine/radar-core-provider.mixin.ts).

Verificado rodando o código real:

| Entrada | Saída (errada) |
|---|---|
| `Santa Casa de Misericordia de Rio Claro SP` | `Santa Casa de Misericordia de` |
| `Sindicato dos Trabalhadores Rurais de Rio Claro` | `Sindicato dos Trabalhadores Rurais de` |
| `Cooperativa Dos Transportadores De Carga Da Regiao De Tangara` | `… Da Regiao De` |
| `Soroca Atacadão das Embalagens em Jardim Vera Cruz` | `… em Jardim` (cortou o bairro no meio) |

Classe afetada: **cartório, sindicato, cooperativa, associação, santa casa** — onde a cidade faz
parte do nome. Sobra **preposição pendurada** (`de`/`em`/`do`): o `replace(/[\s,;-]+$/)` não
limpa palavra funcional. Agrava: o nome é chave de dedup e de busca social, então o corte troca
a identidade usada rio abaixo. Contra 4.000 nomes reais do pool: **59 seriam alterados**.

---

## D6 · 🟠 SÉRIO — a mesma poda virou PORTA DE ENTRADA de lixo

A poda roda **antes** de `looksLikeNonBusinessName`, e o teto de ">9 palavras" era justamente o
que segurava título de página. Verificado:

```
"As 10 melhores lojas de moveis e decoracao de Rio Claro"  (11 palavras) → nonBusiness = true
  poda → "As 10 melhores lojas de moveis e decoracao de"    (9 palavras) → nonBusiness = FALSE
```

Título de portal com 10-11 palavras terminando em cidade passou a entrar.

---

## D7 · 🟠 SÉRIO (latente) — anti-menu derruba nome-fantasia real

**Onde:** [radar-core-shared.ts:874](../../backend/src/webscraping/radar/shared/radar-core-shared.ts)
(`looksLikeCategoryMenuName`), usada em `looksLikeNonBusinessName` (linha 915) → **hard blocker,
sem resgate**.

Verificado: `Celulares e Acessórios`, `Móveis e Decoração`, `Joias e Relógios`,
`Roupas e Calçados`, `Livros e Papelaria`, `Cosméticos e Perfumaria`, `Brinquedos e Games`,
`Cama, Mesa e Banho` → **BLOQUEADOS**. Só escapam com sufixo jurídico:
`Cama Mesa e Banho Ltda` passa, `M & M Distribuidora` passa.

**Ainda não deu dano** (0 casos nos 4.000 nomes do pool atual) — é bomba armada.

---

## D8 · 🟠 SÉRIO (não observado em prod) — o "anti-perda" desfaz o dedup do merge

**Onde:** [radar-core-quality-enrichment.mixin.ts:1150-1173](../../backend/src/webscraping/radar/03-enrichment/radar-core-quality-enrichment.mixin.ts)
(`identityOf` na linha 1158, `lost` na 1166).

`mergeSources` dedupa **dentro do grupo de entrada** — é o trabalho dele. `identityOf` usa
`placeId` como chave primária; quando o merge colapsa dois cards da MESMA empresa com `placeId`
diferente (ex.: `cnpj_public:1234` × `hbx:pj:A`), o perdedor não aparece em `survivors`, é
classificado como "perdido" e **volta cru**. Pior: quem volta costuma ser a linha `cnpj_public`
(a que carrega CNPJ/razão social), **sem enriquecimento**.

`grep 'merge perdeu'` no log do container: **0 ocorrências** desde 18:19 (os lotes de hoje deram
`fused=0`). Bomba armada, não estourada.

---

## D9 · ⚪ ARQUITETURAL — `businessCategory` é cópia do texto digitado em 98% das linhas

Das 2.484 linhas web do pool com `businessCategory` preenchido, **2.432 (98%) têm
`businessCategory` idêntico ao `segment` da busca**. O campo que o contrato F3
(`docs/Rules/MOTOR.md`) define como FATO é carimbo. Efeito: a mesma lei é **letal** para lead sem
categoria e **inerte** para lead com categoria carimbada — duas leis para o mesmo assunto, que é
exatamente a doença "D2" que o plano de estabilização diz estar curando.

---

## O QUE ESTÁ CERTO — não mexer

- **E4 (cidade na URL fora do sinal local)**: medido antes × depois, `web_gate:no_local_signal`
  caiu de 35/98 (35,7%) para 57/433 (13,2%) e a taxa de `found` subiu de 15,3% → 50,1%.
- **Nenhum consumidor quebrou**: IA/concierge, `radar-post-delivery-ai-saneamento` (lê
  `prisma.radarLeadPool`), enriquecimento em 2º plano, automação/bot, WhatsApp, XLSX
  (`exportContactsForUser` usa outro builder), casca mobile/APK e `/vendas` — **nenhum lê
  `results[]`**. A entrega pra Vendas usa `mapRunItemToContact` direto.
- **E1 (front: sessão terminal, filtro não apaga, botão "Mostrar leads disponíveis")**: sem
  achado.
- **E3.1 (âncora RFB por telefone exige nome compatível)**: sem achado.
- **Testes**: `tsc --noEmit` exit 0; bateria 616/621. As 4 falhas
  `runRadarSocialLookupForSavedLead` (`itemDelegate.updateMany is not a function`) são
  **pré-existentes** — confirmado extraindo a árvore `de42a67f` com `git archive` e rodando a
  mesma bateria (589/594, mesmas 4).

## NÃO PERSEGUIR — já investigado e descartado

- **Erro 500 em `/webscraping/radar/leads?scope=vitrine`**: **pré-existente, não é desta frente.**
  Mesma rota deu 500 em 15/07, 20/07, 21/07, 23/07 e 28/07 (nginx `access.log*`, corpo de 32
  bytes). Os dois de hoje (16:57 e 18:23 UTC, ambos `city=Campinas`) cercam o publish das 18:17 —
  um antes, um depois. O proxy do Next loga `socket hang up / ECONNRESET`; **não há stack trace no
  backend** e o controller ([webscraping.controller.ts:566](../../backend/src/webscraping/webscraping.controller.ts))
  embrulha em try/catch — bug de gate sairia como JSON tratado, nunca 500. Consulta do pool para
  Campinas medida no banco: 79 linhas, **17 ms**. Causa provável: conexão derrubada com o backend
  saturado pela busca (`connection_limit=10` + event loop), família da dívida já conhecida
  ("cockpit 500 = proxy 30s × RFB 28M"). **Frente separada, não abrir junto.**
- As linhas `automacao?_rsc=… 200 500` do nginx **não são erro** — é status 200 com 500 bytes.

---

## SOLUÇÃO PROPOSTA

### Princípio
**"Não sei" ≠ "não presta".** A porta só mata com **evidência POSITIVA de outro segmento**.
Ausência de evidência mantém o lead vivo e honestamente marcado.

### C1 — Porta só com evidência positiva (resolve D1, D2 e a maior parte de D3)
Separar os três estados em vez de derivar tudo de um score:
- **aderente**: CNAE real casa o pedido, OU matcher completo/alias casa nome/categoria/snippet;
- **não confirmado**: sem evidência (o atual score 25/45) → **NÃO bloqueia**, card entregue com
  rótulo honesto;
- **mismatch**: evidência positiva de OUTRO segmento — CNAE conflitante, `findRadarSegmentExclusionMatch`
  (já existe, `radar-segment-exclusion.util.ts`), ou nome/categoria de outro ramo.

Só o terceiro entra em `blockedQualityStatuses`
([radar-quality-gate.service.ts:292](../../backend/src/webscraping/radar/02-filter/radar-quality-gate.service.ts)).
Sugestão de forma: novo status `segment_unconfirmed` (não bloqueante) separado de
`segment_mismatch` (bloqueante), ajustando
[mixin:527](../../backend/src/webscraping/radar/03-enrichment/radar-core-quality-enrichment.mixin.ts).

**Aceite:** rodar a lei contra a tabela de D2 — os 11 nomes reais passam a NÃO ser bloqueados; e
o lixo (GitHub, Zillow, StarWars.com, Cosco Tracking, eBay, Climatempo) continua morrendo (ele já
morre por `web_gate:global_portal`, `generic_directory` e `non_business_name`, portas independentes).

### C2 — Máscara e presença no array que o front lê (resolve D4)
Aplicar `maskRunContactForShowcase` também no `items.map` da
[linha 451](../../backend/src/webscraping/radar/06-presentation/radar-run-presenter.service.ts)
(ou montar `items` a partir do mesmo objeto já mascarado). **Reescrever o teste para afirmar
sobre `response.items[0]`** — serializar e falhar se o telefone/e-mail cru aparecer.
Conferir antes se algum consumidor interno depende de `items[].phone` cru (a entrega pra Vendas
usa `mapRunItemToContact` direto, fora deste caminho — mas confirmar).

**Aceite:** `JSON.stringify(response.items[0])` não contém `19997516677` nem o e-mail; e
`items[0].channelPresence.telefone === true`.

### C3 — Poda de endereço restrita (resolve D5 e D6)
- Só podar quando a cauda for **exclusivamente** localidade e o que sobra **não terminar em
  preposição** (`de`, `da`, `do`, `dos`, `das`, `em`, `no`, `na`).
- **Não podar** quando o nome contém marcador institucional onde a cidade é identidade:
  `cartório`, `tabelionato`, `ofício`, `sindicato`, `cooperativa`, `associação`, `santa casa`,
  `câmara`, `prefeitura`, `foro`, `comarca`.
- Fechar D6: aplicar `looksLikeNonBusinessName` **no nome ORIGINAL também** — se o original era
  título de página, a poda não pode absolvê-lo.

**Aceite:** os 4 casos de D5 ficam intactos; o caso de D6 continua sendo barrado; e
`Advocacia Marilene Jardim e Erika Habermann Centro Rio Claro SP` continua sendo podado
corretamente (era o motivo do fix original).

### C4 — Anti-menu com segundo sinal (resolve D7)
`looksLikeCategoryMenuName` deixa de ser hard blocker sozinha: só marca quando **não houver**
sinal de empresa (sem CNPJ/CNAE, sem telefone próprio, sem sufixo jurídico), ou vira apenas
rebaixamento de score.

**Aceite:** `Celulares e Acessórios` **com telefone próprio** passa; o caso original
`Informática & Eletrônicos` (menu do site, sem âncora) continua morrendo.

### C5 — Anti-perda casando identidade na ordem certa (resolve D8)
Em `identityOf` ([mixin:1158](../../backend/src/webscraping/radar/03-enrichment/radar-core-quality-enrichment.mixin.ts)),
casar **telefone primeiro** (e CNPJ, quando houver) e só então `placeId`; ou comparar contra
todas as identidades de cada card de saída, não só a primária.

**Aceite:** o teste existente (`radar-pre-save-enrichment-no-loss.test.ts`) continua verde E um
caso novo prova que duplicata legitimamente colapsada **não** ressuscita.

### C6 — A rede de segurança que faltou (dívida do E2, faz a porta ser aceitável)
Bloco visível e recolhido **"Fora do segmento (N)"** na vitrine, com os reprovados por segmento —
auditável e resgatável, nunca misturado com os bons. Exige decidir a persistência do reprovado
(hoje ele não é gravado). **Enquanto isso não existir, a porta deve ser conservadora** (é o que
C1 garante).

### C7 — Prova de pipeline (E5 do plano original, ainda não entregue)
Suíte golden que roda coleta→gate→enriquecimento→**apresentação** e afirma sobre a **lista final
que o front consome** (`items`), com fixtures das buscas reais: advocacia/Rio Claro (incluindo
`JOSÉ ANTONIO ESCHER…` e `Dr. Jouber Turolla`), distribuidora de água/Analândia, Zacarias/eBay,
padaria/SC, e os 11 segmentos da tabela D2.

---

## ORDEM DE EXECUÇÃO SUGERIDA

1. **C1** (para o sangramento: ~150 leads/dia) — sozinho já resolve D1, D2 e a maior parte de D3.
2. **C2** (vazamento de contato aberto em produção + card mentindo "sem contato").
3. **C3** + **C4** + **C5** (mesmo lote de shared/provider/enrichment).
4. **C7** acompanhando cada etapa; **C6** quando o dono decidir a persistência do reprovado.
5. Confirmar **D3** na tela antes/depois (filtrar a vitrine por "marmorarias" ou "casas de ração").

## REGRAS DE TRABALHO PARA QUEM EXECUTAR

- Sem `git add -A` — commitar por caminho explícito (há sessão paralela mexendo em
  `EntregaShell/` e `backend/src/logistica/`; **não tocar nesses**).
- Não criar branch; trabalhar no `master`; publicar só com ordem explícita do dono.
- Rodar `cd backend && npx tsc --noEmit` e a bateria do radar. **As 4 falhas
  `runRadarSocialLookupForSavedLead` são pré-existentes** — qualquer falha ALÉM dessas 4 é
  regressão sua.
- **Teste tem de afirmar sobre o que o consumidor real lê.** Foi exatamente assim que D4 passou
  batido com o teste verde.
