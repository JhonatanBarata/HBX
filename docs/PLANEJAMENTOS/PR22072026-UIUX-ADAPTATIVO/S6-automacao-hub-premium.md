# S6 — /automacao: hero enxuto + 4 cards-objetivo PREMIUM

## Evidência

- Foto 2 do dono = o header atual (`automacao/page.client.tsx:397-411`, `.auto-hero`):
  badge grande + "Automação" + chip "WhatsApp conectado" ocupando uma faixa inteira.
  Ordem: "remova esse troço gigante".
- Os 4 cards já existem (`ObjetivoCard`, `:465-504`, classes `.aut-obj-card*` em
  `hbx-theme/automacao.css`) mas estão "de painel" — o dono quer **4 cards clicáveis,
  muito premium, impressionantes**.

## Tarefas

1. **Matar a faixa hero.** O título da tela já existe no shell; a identidade vira uma
   linha discreta (ou some). O chip WhatsApp conectado/Sem chip PERMANECE (é informação
   viva) mas encolhe pra canto do grid, sem faixa própria. Deletar JUNTO o CSS que só o
   hero usava (regra "sem legado": `.auto-hero*`/`.auto-engine*` que sobrar sem uso).
2. **Cards premium.** Elevar `.aut-obj-card` em `automacao.css` (100% token/color-mix,
   check-pele passa):
   - **Card inteiro clicável** (hoje só o botão "Abrir" — vira o card todo, com
     affordance de hover; manter acessível: `role`/teclado). Botão "Abrir" some.
   - Profundidade real: vidro da casca modern (blur + brilho derivado de token), borda
     luminosa no hover, sombra em 2 camadas, leve lift + tilt no hover
     (respeitando `prefers-reduced-motion`).
   - Ilustração (`kit/ilustracoes.tsx`) maior, como herói do card; MiniFluxo embaixo;
     StatusChip + métrica-chave com hierarquia clara (número grande, label pequena).
   - Grid 2x2 em FHD/4K, 2x2 ou 1x4 em 1368 (sem corte, zero-scroll).
3. **Estados**: skeleton de loading no MESMO formato premium (o `.auto-skel` atual fica
   genérico demais pro card novo); "Indisponível" continua fail-soft.
4. **Faixa "Começar por um modelo"** (`aut-tpl-grid`): alinhar à nova linguagem (mesma
   família de card, menor) — sem mudar a lógica de quando aparece.

## NÃO-fazer

- NÃO mexer nas seções internas (S7) nem nos gates de módulo/`secaoGateOk`.
- NÃO adicionar frase/copy nova (Lei ≤70 chars já vigiada nas sprints anteriores).
- NÃO hex solto / gradiente literal em tela — tudo token/color-mix em `automacao.css`.

## Checks

- `npm run lint && npm run build` verdes.
- Chrome localhost `/automacao`: 4 cards (login com empresa full), hover/teclado ok,
  4 resoluções sem corte, dark e light ok (casca modern deriva de token — conferir os 4
  temas Mod por amostragem em 2).
- Nenhum resto do hero antigo no DOM nem no CSS.

## Pronto-quando

Primeira dobra = grid de 4 cards premium clicáveis + chip discreto, hero morto sem
legado, lint/build verdes e prova visual anexada.
