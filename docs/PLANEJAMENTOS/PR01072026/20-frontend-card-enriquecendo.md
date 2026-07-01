# W2 — Card "enriquecendo agora" (DetalhesNegocio)

> LOCAL / working tree / reversível (`git checkout`). SEM publish, SEM VPS.
> Objetivo: dar o **MEIO** entre `loading` (card inteiro carregando do backend) e a
> coroa `enriched` (motor terminou). Hoje era tudo-ou-nada; faltava "estou
> enriquecendo este lead AGORA".

## O que mudou (UX entregue)
1. **Selo pulsante no header** — `✨ Enriquecendo…` (badge âmbar, pulse + spark
   twinkle) ao lado do nome, só enquanto o motor trabalha. Some ao terminar; a
   coroa `dn-crown` assume. Os 3 estados (loading · enriquecendo · enriquecido)
   **nunca aparecem juntos** (mutuamente exclusivos por código).
2. **Shimmer por CAMPO pendente** — quando um campo que o motor busca ainda não
   chegou (telefone, e-mail, segmento, CNPJ, razão social, sócio), aparece um
   placeholder pulsante **no lugar do valor**, não a nota "Sem telefone neste
   card.". Quando o dado chega, o campo assenta sozinho (reusa `TypedText`).
3. **3 estados por campo:** (a) chegou → valor via `TypedText`; (b) enriquecendo
   → `dn-field-skel`/`dn-contact-skel`; (c) confirmado-ausente (terminou e não
   achou) → nota muted atual. **Nunca mostra "ausente" enquanto ainda enriquece.**
4. **Coerência garantida:** `isEnriching = enriching && !loading && !n.enriched`.
   O badge exige `!enriched` (não briga com a coroa); os placeholders exigem
   `!loading` (não brigam com o skeleton inicial).

## Arquivos tocados
| Arquivo | O quê |
|---|---|
| `frontend/src/components/hbx/detalhes-negocio.tsx` | prop `enriching`; helper `FieldSkel`; `isEnriching`/`fieldPending`; badge no header; shimmer em telefone/segmento/e-mail/empresa |
| `frontend/src/app/hbx-theme/kit.css` | classes novas `.dn-enriching-badge` (+`__spark`), `.dn-field-skel` (+`--wide`/`--full`), `.dn-contact-skel` + keyframes `dn-enriching-pulse`/`dn-spark-twinkle` |
| `frontend/src/app/hbx-theme/transitions.css` | `prefers-reduced-motion`: novas classes entram no guard que zera animação |
| `frontend/src/app/(app)/leads/page.client.tsx` | tipo `RadarLead.enrichmentStatus?` + call-site passa `enriching` (default OFF) |

## Classes / tokens novos (todos via token — zero hex/inline)
- `.dn-enriching-badge` — tom âmbar (`--hbx-warning`, mesma família da coroa),
  esqueleto do `.dn-status-chip`. `dn-enriching-pulse` (borda/halo) +
  `.dn-enriching-badge__spark` com `dn-spark-twinkle`.
- `.dn-field-skel` (`--wide` 60% / `--full` 100%) — placeholder de VALOR inline,
  reusa o shimmer neutro do `.dn-skel` (`@keyframes dn-shimmer` já existia).
- `.dn-contact-skel` — placeholder na altura do `.ctx-phone` (linha não "pula"
  quando o número chega); borda tracejada âmbar discreta.
- **Nenhum valor visual solto**: cor via `color-mix(... var(--hbx-warning) ...)`,
  radius/superfície via tokens. `check-pele` catraca inline **não subiu** (0
  props visuais inline novas no TSX — verificado no diff).

## Prop de entrada (o sinal — nome + como ligar no pai)
- **Prop nova:** `enriching?: boolean` em `DetalhesNegocioProps`. Default `false`
  → **card sem a prop é IDÊNTICO a hoje** (comportamento 100% preservado).
- **Não criei fetch/endpoint novo** (fora de escopo). Reusei o vocabulário do
  pipeline que já existe no backend: `RadarPipelineEnrichmentStatus`
  (`backend/src/webscraping/radar/shared/radar-stage.types.ts`:
  `pending | partial | completed | error | skipped`). O "em progresso" = `pending`
  ou `partial`.
- **Onde o pai liga (já wired em Leads, forward-compatible):**
  - Adicionei `enrichmentStatus?: string | null` ao tipo `RadarLead`.
  - `renderLeadDetail` calcula
    `enriching = (status === 'pending' || 'partial') && !detail.enriched` e passa
    `enriching={enriching}` ao `<DetalhesNegocio>`.
  - **Hoje a API de leads NÃO envia `enrichmentStatus`** → fica `undefined` →
    `enriching=false` → **nenhuma mudança visual em produção agora**. Quando o
    backend surfacer esse campo (1 linha no mapeamento do endpoint de leads), o
    selo + shimmer acendem sozinhos, sem mais mexer no card.
  - Vendas/Atendimento (`page.client.tsx` respectivos) ainda **não** passam
    `enriching` — herdam o default `false`. Ligar lá é o mesmo 1-liner quando
    fizer sentido.

## Checks
- **typecheck** (`tsc -p tsconfig.json --noEmit`): **VERDE** — 0 erros.
- **build** (`node ./scripts/run-next-build.js`): **VERDE** — exit 0, `/leads`
  e todas as rotas compilaram.
- **check-pele** (`node scripts/check-pele.mjs`): **VERMELHO — porém PRÉ-EXISTENTE
  e FORA do meu escopo.** As 14 violações (R1) são todas em `bot-builder.css`,
  `screens.css`, `whatsapp.css` — arquivos que **NÃO toquei** (`git diff --stat`
  neles = vazio). Meus 4 arquivos (`kit.css`, `transitions.css`,
  `detalhes-negocio.tsx`, `leads/page.client.tsx`) **não aparecem** na lista de
  violações. O check aborta na 1ª barreira dura (pré-existente) antes de avaliar a
  catraca; meu diff não adiciona prop visual inline (verificado).
  - **Nota p/ o dono:** essas 14 violações já estavam no repo antes desta rodada —
    é dívida de pele legada (sombras/rgba em telas de bot/whatsapp), não desta
    entrega. Se quiser, dá pra tokenizar num passe separado.

## Como o dono testa (ver o estado enriquecendo)
Rota: **localhost:3001/leads** (Chrome, `npm run up`).

Como o sinal ainda não vem da API, para **ver na hora** force o estado por um
destes caminhos (todos reversíveis):

**Opção A (mais rápida, sem backend) — forçar no call-site:**
Em `frontend/src/app/(app)/leads/page.client.tsx`, na função `renderLeadDetail`,
troque temporariamente:
```ts
const enriching = (enrichStatus === "pending" || enrichStatus === "partial") && !detail.enriched;
```
por
```ts
const enriching = !detail.enriched; // DEMO: acende em todo lead ainda não enriquecido
```
Abra um lead **não enriquecido** (sem coroa) na aba **Prateleira (shelf)** — que
já vem com contato oculto/campos vazios: vai ver o selo `✨ Enriquecendo…` e os
placeholders shimmer no telefone/segmento/e-mail/empresa. Desfaça a linha depois
(ou `git checkout`).

**Opção B (real, quando o backend ligar):** fazer o endpoint de leads devolver
`enrichmentStatus: 'pending' | 'partial'` no lead que está na fila do motor — o
card acende sozinho, zero mudança de front.

Detalhe: o selo NÃO aparece em lead com coroa (enriquecido) nem durante o
`loading` inicial — é só o MEIO, por design.

## Reversível
`git checkout -- frontend/src/components/hbx/detalhes-negocio.tsx frontend/src/app/hbx-theme/kit.css frontend/src/app/hbx-theme/transitions.css "frontend/src/app/(app)/leads/page.client.tsx"`
