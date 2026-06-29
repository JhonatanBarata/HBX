# PR29062026 — Entrada mobile de respeito (sem zona)

Orquestração: Opus inspeciona/planeja/verifica; 1 subagente Sonnet por `.md`; o `.md` some ao concluir.
Levantamento mobile (390×844, Playwright/Chromium real) feito 29/06 — prints em
`…/scratchpad/mobile-shots/` (A*=site público, B*=casca, C*=Mais+limpas, D*=profundo/dark/sub-abas).

## Veredito
A camada mobile JÁ é robusta (`hbx-theme/mobile.css`, ~1543 linhas, tratamento por tela). A "zona" é
concentrada em poucos pontos. Zero overflow horizontal em todas as telas (fiscal anti-corte segura).

## Streams (ordem = impacto; rodar SEQUENCIAL p/ não colidir em mobile.css)
1. **01-casca-onboarding** — 🔴 ofensor nº1. Painel "Primeiros passos" cobre TODA tela + tampa o menu Mais.
2. **02-bot-mobile** — 🔴 Bot renderiza branco no celular (altura 0 da view mobile).
3. **03-radar-mobile** — 🟠 "Buscar empresas" sem filtro mobile → não dá pra escolher cidade+segmento no celular.
4. **04-gerencial-mobile** — 🟠 sem seção mobile → abas quebram + tabelas transbordam.

## Regras duras (todos os streams)
- 5 Leis (FRONTEND.md): em `mobile.css` só ESTRUTURA dentro de `@media (max-width:…)`; ZERO cor/sombra/fonte
  literal (só token/var); desktop NÃO pode mudar 1 byte. Pop-up sempre central via `.hbx-veil`.
- Checks: `cd frontend && npm run lint` (eslint + check-pele) TEM que passar; `npm run build` se der tempo.
- Login de teste: `jhonatan@hbxsystem.com.br` / `Monkey123` (conta empresa full-access).
- Verificar AO VIVO em viewport mobile real (Playwright — resize de janela NÃO funciona neste Windows
  multi-monitor). Padrão de captura: ver `02`/qualquer brief. NÃO usar preview Claude (bugado).
- O dono edita em paralelo: antes de mexer confira `git status`; nunca reverter/sobrescrever o que não criou.
