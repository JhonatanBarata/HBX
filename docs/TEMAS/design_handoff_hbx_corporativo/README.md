# Handoff: HBX System — Redesign Corporativo (+ tema Friendly)

> **Para o agente/dev no Claude Code:** este pacote contém as referências de design
> (HTML + CSS funcionais) e as instruções para recriar o novo visual do HBX no
> codebase real (`JhonatanBarata/HBX` → `frontend/`, Next.js 16 + React 19 + Tailwind v4).

## Overview

O HBX System está sendo redesenhado do zero com **dois temas** que compartilham a mesma
estrutura de tokens semânticos:

1. **Corporativo** *(tema principal do app)* — flat, sóbrio, near-black com acento teal.
   Dark é o padrão; light derivado. **9 telas completas** neste pacote.
2. **Friendly** *(marketing/onboarding)* — "liquid glass": gradientes translúcidos,
   inset highlight, blur pesado. Light é o padrão; dark derivado.

A navegação oficial do app (IA) passa a ser **8 seções**:
`Dashboard · Leads · Webscraping · Vendas · Atendimento · Bot · Relatórios · Configurações`
— as ~20 rotas legadas (`mobile-*`, `night-factory`, `boasvindas`, `hbx-recovery`, etc.)
devem ser absorvidas ou descontinuadas dentro dessas 8 **gradualmente** (não deletar nada
antes de cada tela nova estar no ar).

## Sobre os arquivos de design

Os arquivos deste pacote são **referências de design criadas em HTML** — protótipos que
mostram aparência e comportamento pretendidos, **não código de produção para copiar**.
A tarefa é **recriar estas telas no ambiente existente do codebase** (Next.js App Router,
componentes React/TSX, Tailwind v4 + CSS custom properties), usando os padrões já
estabelecidos do repo.

- Os HTML abrem direto no navegador (são auto-contidos; usam React UMD + Babel só por
  conveniência de protótipo). Use-os como **fonte da verdade visual e de interação**.
- O CSS de referência (`tokens/*.css`, `ui_kits/corporate/corporate.css`) **pode** ser
  portado quase 1:1 — os tokens são CSS custom properties padrão.

## Fidelidade

**Hi-fi (pixel-perfect).** Cores, tipografia, espaçamentos, raios, sombras e estados são
finais. Recrie fielmente; onde o protótipo usa estilo inline, normalize para o padrão do
repo (CSS Modules / Tailwind / classes utilitárias), mantendo os mesmos valores.

---

## Arquitetura de temas (mecanismo central)

Tokens semânticos em `:root`, re-mapeados por escopo de atributo no `<html>`:

| Combinação | Atributos no `<html>` |
|---|---|
| Friendly light *(padrão global)* | *(nenhum)* |
| Friendly dark | `data-theme-mode="dark"` |
| Corporativo dark *(padrão do corporativo)* | `data-theme="corporate"` |
| Corporativo light | `data-theme="corporate" data-theme-mode="light"` |

- Fonte: `tokens/colors.css` (Friendly light+dark), `tokens/theme-corporate.css`
  (Corporativo dark+light). Entrada única: `styles.css` (só `@import`s).
- Componentes consomem **somente** `var(--hbx-*)` / aliases (`--text-strong`,
  `--border-hairline`, `--surface-card`...) — nunca hex direto. É isso que faz a mesma
  tela re-skinnar nos 4 visuais.
- **Troca de tema em runtime:** suprimir transições durante o swap (senão CSSTransitions
  ficam presas congelando cores antigas — bug real encontrado em teste):
  ```js
  const kill = document.createElement("style");
  kill.textContent = "* { transition: none !important; }";
  document.head.appendChild(kill);
  /* set/remove data-theme / data-theme-mode no <html> */
  void document.documentElement.offsetHeight;
  requestAnimationFrame(() => requestAnimationFrame(() => kill.remove()));
  ```
- Persistência: `localStorage` — `hbx:corporate-mode` (light|dark), `hbx:friendly-mode`,
  `hbx:ws-theme` (friendly|corporate). No repo real, integrar ao mecanismo existente de
  tema (substituindo gradualmente `HBX_THEME_PALETTES`/`theme-palettes.ts`).
- **Controles de tema na topbar:** botão sol/lua (claro/escuro do tema atual) + uma
  *chavinha* (switch 46×26) que alterna **Friendly ↔ Corporativo** com rótulo do tema
  ativo. Ver `ui_kits/corporate/shell.jsx` (`ModeToggle`, `ThemeSwitch`) e o
  `ThemeToggle` em `ui_kits/workspace/index.html`.

## Design tokens — Corporativo

| Token | Dark (padrão) | Light |
|---|---|---|
| brand / primary | `#16C7A4` | `#0FA98A` |
| brand-strong (deltas, links ativos) | `#2EE6A8` | `#0A8E73` |
| brand-soft (seleção, pill ativo) | `#0E2E29` | `#DCF3EC` |
| background (canvas) | `#0A0F14` | `#F2F6F8` |
| nav-surface (sidebar) | `#0D1419` | `#FBFDFD` |
| surface (cards/painéis) | `#101820` | `#FFFFFF` |
| surface-soft | `#0D141B` | `#F6F9FA` |
| surface-raised (hover/inputs) | `#16202A` | `#E9F0F3` |
| foreground (ink) | `#E8F1F5` | `#14242F` |
| foreground-soft | `#B9C8D2` | `#3C5260` |
| muted | `#7C8C99` | `#6A7E8C` |
| border-hairline | `#1C2832` | `#DFE8EE` |
| info / warning / danger | `#4CC2FF` / `#F5B23C` / `#F0566B` | `#1180C2` / `#B26B0F` / `#C23A52` |
| success / accent (+ verde) | `#2ECC8E` / `#22C77D` | `#149A66` / `#12A368` |
| chat outbound | `#0F3D34` | `#DCF2EA` |
| radius xs/sm/md/lg/xl | `6/10/12/14/18px` (controls 10, painéis 14) | idem |
| sombras | curtas e rasas (`0 4px 14px -6px rgba(0,5,8,.5)`) | tons `#92A8B5` |
| blur/glass | **nenhum** (flat) | nenhum |
| tracking de headings | normal (−0.01 a −0.02em) | idem |

Tokens Friendly (glass): ver `tokens/colors.css` + `tokens/effects.css`
(brand `#245CFF`→`#009FD9`, magenta `#E63BC1`, canvas `#F4F9FF`/`#07111F`, raios
8/12/16/20/28, sombras far-throw + `inset 0 1px 0 rgba(255,255,255,.72)`, blur 22–28px).

**Tipografia (ambos os temas):** Plus Jakarta Sans (display+body; Google Fonts),
IBM Plex Mono (números/valores/timestamps, `tabular-nums`). Corpo do app 14px;
títulos de página 1.18rem/700; valores de KPI 1.5rem/800.

## Shell Corporativo (comum às 9 telas)

- **Grid:** `218px (sidebar) + 1fr`; telas com painel de contexto: conteúdo `1fr + 300px`.
- **Sidebar** (`--hbx-nav-surface`, borda direita hairline): logo "≫ HBX" (chevrons teal,
  stroke 2.4), 8 itens de navegação (ícone monoline 18px stroke 1.7 + label 0.86rem/600;
  ativo = pill `--hbx-brand-soft` + texto `--hbx-brand-strong`, radius 10px); rodapé com
  card do plano ("Plano Empresarial" + botão outline teal "Gerenciar plano") e card do
  usuário (avatar redondo gradiente `#2C4A5E→#16C7A4`, nome + cargo, ⋮).
- **Topbar:** hambúrguer; título da página + breadcrumb (`Home › Seção › Página`,
  0.7rem muted); **busca central pill** (max 560px, "Buscar leads, empresas, propostas...",
  kbd `⌘ K`); ações à direita: sol/lua, chavinha de tema, botão redondo **+** verde
  (`--hbx-accent`, texto `#04110D`), sino e chat com badge contador teal, avatar.
- **KPI card:** ícone em círculo 40px (borda teal 35%, fundo teal 7%), label 0.76rem/600,
  valor 1.5rem/800, delta `+18% vs mês anterior` (0.68rem/700 teal; negativo = danger)
  + sparkline SVG 64×22 stroke 1.6.
- **Painéis:** borda hairline 1px, radius 14px, fundo `--hbx-surface`, header com título
  0.98rem/700 e meta à direita; **sem** blur/inset/gradiente.
- **Botões:** `btn-teal` (fundo `--hbx-primary`, texto `#04110D`, 36px, radius 10,
  hover → brand-strong) e `btn-ghost` (borda hairline, hover surface-raised).
- **Pills:** `.tag` (info/teal/warn/red — cor + fundo 8–12% + borda 25–35%),
  `.chan` (canal: WhatsApp `#22C77D`, E-mail `#4CC2FF`, Instagram `#F0566B`),
  `.score-ring` (anel 32px, ≥75 teal / <75 âmbar), `.badge-win` ("Ganho").

## Telas (referência = arquivo HTML correspondente)

| Tela | Arquivo | Conteúdo/interações principais |
|---|---|---|
| Login | `ui_kits/corporate/Login.html` | Split 1.1fr/1fr: lado marca (grid pontilhado, pitch + 3 pilares) + card de login (radius 18, sombra md). Submit → estado de sucesso. Toggle de tema no canto. |
| Dashboard | `ui_kits/corporate/Dashboard.html` | 4 KPIs; Receita 6 meses (barras gradiente teal); Funil (4 faixas centradas + legenda); Atividade recente (dot colorido + time mono); Tarefas (checkbox riscando); Top vendedores (barra de meta). |
| Leads | `ui_kits/corporate/Leads.html` | KPIs; filtros de etapa (pills clicáveis que filtram); tabela (avatar+nome, canal, score-ring, etapa, responsável, último contato mono); paginação; painel "Contexto do lead" atualiza ao clicar na linha; ações rápidas. |
| Webscraping | `ui_kits/corporate/Webscraping.html` | Filtros (4 selects + busca + "▶ Executar coleta"); faixa de métricas da coleta; tabela com checkbox, e-mail validado ✓/⚠, site link, score, status Novo/Validado/Duplicado; painel da empresa (sobre/contato/origem/ações). |
| Vendas | `ui_kits/corporate/index.html` | Kanban 5 colunas (252px; header nome+soma mono; cards: empresa, contato, valor mono, próximo passo, responsável+prazo; "Ganho" no Fechado); seleção destaca card (borda teal + brand-soft) e preenche painel "Detalhes do negócio" + tarefas + funil. |
| Atendimento | `ui_kits/corporate/Atendimento.html` | KPIs; lista de conversas 320px (tabs Todas/Não lidas/Minhas, busca, item: avatar, nome 1 linha SEM cortar, preview ellipsis, badge de canal, contador); thread (header com etapa + dots de progresso; bolhas in/out — out teal escuro com ✓✓; composer Enter envia, emoji/anexo/salvar, "Inserir mensagem rápida"); painel "Contexto do lead" (contatos, etapa, score 82 Alto, interações, tarefas — atrasada em danger, ações rápidas). `height: 100vh` com rolagem interna (lista nunca cropa). |
| Bot | `ui_kits/corporate/Bot.html` | Header próprio (título + ✓ Salvo + Testar bot/Salvar/Publicar) + tabs; coluna de blocos arrastáveis (6 tipos com ícone colorido); canvas pontilhado com nós conectados por SVG (Sim teal / Não vermelho), nó de condição com Sim/Não; painel "Teste seu bot" com chat funcional + quick replies. |
| Relatórios | `ui_kits/corporate/Relatorios.html` | Seletor de período (pills); 4 KPIs; Receita/mês; Leads por canal (barras horizontais nas cores do canal); Funil; Desempenho por vendedor (tabela + barra de meta); Exportar PDF/CSV. |
| Configurações | `ui_kits/corporate/Configuracoes.html` | Sub-nav 210px (Perfil/Empresa/Equipe/Notificações/Plano); formulários com `field-dark`; tabela de equipe; switches custom (track 40×22, thumb desliza, teal quando on); card do plano com limites de uso. |

**Friendly:** `ui_kits/workspace/index.html` (workspace glass: rail 260px, hero, KPIs mono,
esteira de leads com CTA mint, inbox/chat) e `ui_kits/marketing/index.html` (site público
dark com mint `#6EF2D8` — mantém shell próprio).

## Interações & comportamento (resumo transversal)

- Hovers: linhas de tabela/itens de lista → `--hbx-surface-raised`; botões ghost idem;
  cards do kanban → borda `--border-strong`. Sem lift/translate no Corporativo (flat).
- Seleção (linha, card, conversa): fundo `--hbx-brand-soft` + borda/indicador `--hbx-brand`
  (lista de conversas usa border-left 3px).
- Transições: 150ms background/cor; nada de animação decorativa. Respeitar
  `prefers-reduced-motion`.
- Focus de inputs: borda `--hbx-brand` + ring `0 0 0 3px var(--ring-brand)`.
- **Cuidado com herança de cor em `<button>`:** sempre declarar `color` (UA default é
  preto e some no dark — bug real encontrado na lista de conversas).
- Estados vazios/erros: não inventar — seguir o padrão de copy do produto (pt-BR, direto).

## State management (por tela, mínimo)

- Vendas: `selecionado {coluna, card}`; tarefas checadas. Dados via API de pipeline.
- Leads: filtro de etapa; linha selecionada → painel de contexto.
- Atendimento: conversa ativa; thread; draft do composer; tabs.
- Bot: nó selecionado; chat de teste (quick replies → resposta do fluxo).
- Configurações: seção ativa; toggles de notificação.
- Tema: ver "Arquitetura de temas" (atributos no `<html>` + localStorage).

## Assets

- `assets/logo/` — ícone do app HBX (wordmark em anel gradiente). O shell Corporativo usa
  o lockup "≫ HBX" desenhado em SVG stroke (ver `shell.jsx`).
- `assets/icons/` — set SVG 24px do produto (radar, cnpj, coins, whatsapp...). Ícones do
  shell corporativo são monoline stroke 1.7 inline (paths em `shell.jsx` → `ICONS`).
- `assets/channels/` — badges webp de canal (light + `_dark`).
- Fontes: Google Fonts (`tokens/fonts.css`). Se houver licença própria, trocar por
  `@font-face` local.

## Files (neste pacote)

```
styles.css                     ← entrada única de CSS (só @imports)
tokens/                        ← colors, theme-corporate, typography, spacing, effects, fonts, base
ui_kits/corporate/             ← 9 telas + corporate.css (estilos compartilhados) + shell.jsx
ui_kits/workspace/             ← workspace Friendly (light/dark + chavinha de tema)
ui_kits/marketing/             ← site público Friendly
components/                    ← primitivas React de referência (arquivos `.jsx.txt` / `.d.ts.txt` —
                                 remova o sufixo `.txt` ao portar; estão assim para não conflitar
                                 com o compilador do projeto de design)
assets/                        ← ícones, logo, badges de canal
design_system_readme.md        ← guia completo da marca (tom de voz, fundações, iconografia)
```

## Plano de migração sugerido (ordem segura)

1. **Tokens primeiro:** portar `tokens/*.css` para `frontend/src/app/` e importar no
   `globals.css` ANTES das regras existentes (não conflita: namespace `--hbx-*` novo).
2. **Mecanismo de tema:** `data-theme`/`data-theme-mode` no `<html>` via um provider novo,
   coexistindo com o `ThemeProvider` atual até a migração terminar.
3. **Shell Corporativo:** sidebar + topbar como componentes TSX (referência:
   `shell.jsx` + `corporate.css`), atrás de uma rota nova (ex.: `/app2` ou feature flag).
4. **Uma tela por PR**, na ordem: Dashboard → Vendas → Atendimento → Webscraping → Bot →
   Leads → Relatórios → Configurações → Login. Validar visualmente contra o HTML de
   referência antes do merge.
5. Só depois de tudo no ar: redirecionar rotas legadas e remover código morto.
```
