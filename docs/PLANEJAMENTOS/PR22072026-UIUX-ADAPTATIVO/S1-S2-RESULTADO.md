# S1+S2 — RESULTADO (22/07) — ficha do lead adaptativa, sem corte

## A causa REAL do corte (não era o tamanho do modal)

A hipótese do plano (`650px` de altura fixa) era só metade. Medido ao vivo em
`localhost:3001`, com a ficha aberta:

```
.app-page  →  transform: matrix(1,0,0,1,0,0)   filter: blur(0px)
.hbx-veil  →  position: fixed, mas top=75 height=594  (viewport = 685)
.lead-cockpit → 1300x672 dentro de um véu de 594 → 78px pra fora, CLIPADO
```

`.hbx-page`/`.app-page` animavam a entrada com `animation-fill-mode: both`. Com
`both` o navegador CONGELA o estado final como valor animado — e `transform:
none` preenchido computa **matriz identidade**, `filter: none` computa
**blur(0px)**. Identidade ainda é transform: o slot de conteúdo virava
**containing-block eterno de `position: fixed`**. Consequência: `.hbx-veil`
(`fixed; inset:0`) parava de valer a TELA e passava a valer a ÁREA DE CONTEÚDO.
A ficha nascia maior que o véu, era cortada embaixo e — como o véu é
`overflow:hidden` — não dava nem pra rolar até a conversa.

Isso valia pra **todo modal do app**, não só a ficha. O comentário antigo em
`transitions.css` afirmava justamente o contrário ("voltam a none (fill: both)")
— estava errado.

## O que foi feito

| # | Arquivo | Mudança |
|---|---|---|
| 1 | `transitions.css` | `both` → `backwards` em `.hbx-page`, `.app-page`, `.hbx-veil`, `.hbx-modal/.hbx-pop`, `.hbx-drawer` + **LEI DO FILL** documentada. Mesmo visual, zero resíduo de transform/filter. |
| 2 | `vendas-details2.css` | Véu com trilhas explícitas `minmax(0,1fr)` (a trilha implícita `auto` do `.hbx-veil` inflava até o max-content da moldura, e o `100%` media a trilha inflada, não a tela). |
| 3 | `vendas-details2.css` | Moldura adaptativa: `width: min(clamp(1300px,76vw,2200px),100%)`, `height: min(clamp(650px,84vh,1500px),100%)`. Nenhum px de altura fixo. |
| 4 | `vendas-details2.css` | Linhas de grade `62px/42px/35px/24px/20px/126px/150px/92px/84px` → `auto`. Cabeçalho, rodapé de chips e card de INTELIGÊNCIA pediam mais do que o cravado e perdiam 4–16px. |
| 5 | `vendas-details2.css` + `-legibility.css` | Anel de score virou token `--lead-cockpit-ring-size`. O passe de legibilidade crescia o anel 62→68px e esquecia a coluna que o segura em 62px — o anel vazava 6px sobre o texto (o "desalinhado" da INTELIGÊNCIA DO LEAD). |
| 6 | `-legibility.css` | Moldura (largura/altura/linhas) REMOVIDA daqui — recravava 690px e desfazia a escada. Ficou só legibilidade. |
| 7 | `base.css` | Escada de alta resolução: raiz 14px até Full HD (densidade aprovada, intocada); 15px ≥2000, 16.5px ≥2560, 18.5px ≥3300. Lê px de CSS, então quem usa escala do Windows não leva aumento em dobro. |

**Backend: nada.** O dono suspeitou que precisaria — não precisou, é 100% casca.

## Prova (medido, ficha aberta, 3 guias em cada resolução)

| Tela | Véu cobre? | Moldura | Corta? | Rola página? | Clipes internos |
|---|---|---|---|---|---|
| 1368x649 (a da vendedora) | 0/649 ✅ | 1300x630 | não | não | 0 |
| 1280x600 (HD) | ✅ | 1263x583 | não | não | 0 |
| 1921x960 (Full HD) | ✅ | 1460x807 | não | não | 0 |
| 3841x2041 (4K) | ✅ | 2200x1500 (raiz 18.5px) | não | não | 0 |
| 1442x511 (extremo) | ✅ | cabe inteira | não | não | 0 |

Antes: Full HD dava 1300x690 fixo. Agora 1460x807 (+31% de área) e 4K dá
2200x1500 (**3,7× a área**) com letra 32% maior — fim do "selo no meio da tela".

Regressão conferida: modal "Novo lead" agora nasce centralizado na TELA
(véu 0/649) — antes centralizava na área de conteúdo.

## Checks

- `npm run build` → **verde** (`✓ Compiled successfully`).
- `check-pele` → **0 violações nos arquivos tocados**. Os 30 achados são
  PRÉ-EXISTENTES (`kit.css` hex do radar-ai + `impersonation-banner.tsx`), já
  conhecidos desde 20/07.
- `eslint` → 1 erro PRÉ-EXISTENTE (`lead-cockpit-modal.tsx:383`
  `set-state-in-effect`), não tocado nesta frente.

## Fora de escopo (anotado, não consertado)

- Erro de lint pré-existente acima.
- `check-pele` vermelho pré-existente no `kit.css`.
- S3–S7 do plano (grade Excel de /vendas, toolbar, /automacao) não iniciadas.
- Sobraram `animation: ... both` em telas isoladas (bot-*, casca, entrega). Não
  criam problema hoje porque não envolvem ancestral de `.hbx-veil`, mas valem
  uma varredura se aparecer pop-up fora do lugar.
