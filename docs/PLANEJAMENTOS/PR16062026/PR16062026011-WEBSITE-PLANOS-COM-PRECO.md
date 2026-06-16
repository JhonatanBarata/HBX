# PR16062026011 — WEBSITE: /planos com preço real + acabamento

> Migrado de `PR15062026001-WEBSITE` (§B + §FALTA). A landing pública já existe; falta o
> carrossel COM preço no /planos (depende do catálogo do bloco **010**) e o acabamento.

## ✅ JÁ FEITO (15/06 — registro, não reabrir)
Landing refeita em `frontend/src/app/page.client.tsx` + `marketing.css`: hero
**"Do anúncio à cobrança."** + robô (`robo-hbx.png`) + esteira de 5 estações
(Acha → Organiza → Conecta → Automatiza → Cobra) + faixa de logos + 4 cards de plano
(VITRINE, **sem preço**, mandam pro /planos) + painel com as 5 frases + anual 20%.
Sem "a gente", zero hex/style inline. Lint 0 erros + check-pele 544/544 + build verde.

## ⛔ FALTA
1. **/planos: carrossel COM preço real** — 4 cards (List 49 · Lead 99 + 14 dias grátis ·
   Pro 249 · Company a partir de 445,90) lendo do catálogo via **006** (fonte única). **Depende
   do bloco 010** (criar `hbx_pro`, renomear Full→Company, preços) pra mostrar número certo.
2. **Acabamento opcional (quando o dono subir imagens):** print do form Meta Lead Ad + card
   🔥 caindo no sistema (mostra a esteira começando); foto do "painel de tudo".

## Heads-up de assets (/public — VPS é case-sensitive)
- Renomear `samkhya.png` → `sankhya.png` e `blind.png` → `bling.png` (grafia errada do arquivo).
- Faltam subir: `mercadopago`, `omie`, `contaazul`, `tiny` (tirados da faixa por enquanto).

## Regras (INEGOCIÁVEL — brief do dono)
- 5 Leis: token/classe central, **zero hex inline**, check-pele. Visual rico mora em `marketing.css`.
- **Nunca "a gente" → "Nós".** Pouco texto.
- Contenção (Linear/Stripe/Vercel): muito respiro, hero ~40–56px (NÃO 100px+), UM acento
  (azul cyber), motion sutil.
- **Preço só do catálogo** (nunca hardcode — PAGAMENTOS.md). Fotos: dono sobe em `frontend/public`.

## Arquivos
- `frontend/src/app/page.client.tsx`, `frontend/src/app/planos/page.client.tsx`, `marketing.css`.

## Checks
`cd frontend && npm run lint` → `npm run build`. Ao vivo: `/`, `/?ver=planos` e `/planos` mostram
o mesmo preço, vindo do `public-catalog`.

## Status
Landing FEITA; /planos com preço PLANEJADO (depende de **010** + **006**).
