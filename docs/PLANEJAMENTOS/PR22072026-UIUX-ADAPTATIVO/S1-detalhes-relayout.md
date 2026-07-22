# S1 — Refazer a tela Detalhes (LeadCockpitModal): estrutura fluida, fim do corte

## Evidência (por que corta)

- `frontend/src/app/hbx-theme/vendas-details2.css:61-62` — a moldura do cockpit é
  `width: min(1180px, 100%); height: min(650px, 100%)`. Em 1368x768, a viewport útil do
  Chrome fica ~620-660px: 650px de altura fixa + padding do `.hbx-veil` = corte do rodapé
  (foto 1 da vendedora: MENSAGEM SUGERIDA cortada embaixo).
- `lead-cockpit-modal.tsx:941` — monta em `.hbx-veil lead-cockpit__veil` (correto, mantém).
- Grid interno usa colunas com larguras semifixas (ex. `max-width:155px`, coluna direita
  de inteligência) que não cedem em viewport estreita.

## Tarefas

1. **Moldura 100% relativa à viewport.** Trocar as dimensões fixas por
   `width: min(1400px, calc(100vw - 40px)); height: min(880px, calc(100dvh - 40px))`
   (valores finais a calibrar ao vivo). NUNCA mais px fixo de altura na moldura.
   Medidas estruturais novas nascem em token (`skeleton.css`) se forem reutilizáveis.
2. **Reorganizar o layout interno em 3 zonas com scroll próprio onde precisa:**
   - Header (identidade + score + ações Ligar/Copiar CNPJ/Buscar parecidos) — altura
     automática, 1 linha em FHD, quebra elegante em 1368.
   - Corpo = grid `minmax(0,1fr)` para a guia ativa (Atendimento/Cadastro/Financeiro) +
     coluna direita (Contato rápido / Agenda / Inteligência / Mensagem sugerida). A coluna
     direita vira `overflow-y:auto` interno; o corpo da conversa idem. A MOLDURA nunca
     estoura.
   - Em viewport estreita (<1440px de largura), a coluna direita estreita via
     `minmax(280px, 340px)`; nada some, nada corta.
3. **Guias com Glass Pill** — se as 3 guias ainda trocam destaque instantâneo, migrar para
   `useGlassPill`/`<GlassPill>` (Lei nº2). Não recriar o efeito.
4. **Hierarquia refinada** (a "zona" que o dono reclamou): espaçamentos em escala única
   (tokens de spacing), painéis da direita com o MESMO componente de panel do kit, títulos
   de seção uniformes. Zero estilo visual inline novo; layout inline ok.
5. **Sem mexer em copy nem em comportamento** (endpoints, guias, ações) — é re-layout.

## NÃO-fazer

- NÃO tocar no painel lateral `detalhes-negocio.tsx` (é da S2 se precisar).
- NÃO criar CSS novo fora de `vendas-details2.css` (estrutura) — cor/borda/sombra vem de
  token/classe existente.
- NÃO adicionar `overflow` na página/veil — scroll é interno por painel.
- NÃO mudar gating por tier nem os dados exibidos.

## Checks

- `cd frontend && npm run lint && npm run build` verdes.
- Chrome localhost:3001, abrir um lead no cockpit (duplo clique na lista de /vendas) e
  conferir nas 4 resoluções (DevTools): 1368x768, 1280x720, 1920x1080, 3840x2160 —
  header, 3 guias, coluna direita INTEIRA e rodapé visíveis, sem scroll da página.
- `document.documentElement.scrollHeight <= window.innerHeight` → true com o modal aberto.

## Pronto-quando

O cockpit abre inteiro nas 4 resoluções, a estrutura interna é fluida (nenhum px fixo de
altura/largura de moldura), guias com glass pill, e lint/build verdes.
