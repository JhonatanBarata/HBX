# MOBILE-CASCA — a casca de celular do HBX (aprovada pelo dono 06/07)

> Dono aprovou os mockups (Vendas/Leads, Conversas, Empresas — "acertou em cheio, é isso q eu quero")
> e mandou orquestrar. Workers implementam LOCAL no **master** (sem branch, sem stash, `git add` por
> caminho, commit local por sprint), **NÃO publicam**. Orquestrador (Fable) planeja e revisa, não edita.

## As ordens do dono (LEIS — violar = refazer)
1. **Casca idêntica em TODOS os painéis.** Nenhuma tela altera a casca (topo 1 linha + conteúdo +
   tab bar). Tela injeta conteúdo; a moldura é uma só.
2. **2 transições, sempre.** IR (entrar) e VOLTAR (sair), definidas 1× na central. **NADA abre sem
   transição, NADA fecha sem** — telas, sheets, chat, modais, fullscreen. Abrir/fechar seco = bug.
3. **Fullscreen existe como opção** (Fullscreen API) e **o aviso é emitido ao entrar** (toast central
   "Tela cheia — deslize a borda de cima pra sair"), **especialmente no Rota**.
4. **ZERO reuso da casca anterior.** Antes de implantar roda-se LIMPEZA (W0): o front mobile velho
   (mobile.css, mobile-tab-bar.tsx, folha "Mais" velha, remendos @media do dashboard) é REMOVIDO.
   Motivo do dono: "vc pega vício e reutiliza". A casca nova não importa NADA do que foi limpo —
   nem hook, nem classe, nem componente.
5. **Rota é "outro aplicativo"**: pode ter outra cor (skin própria), mas é o MESMO ideal e a MESMA
   casca (estrutura idêntica), e tem que ter **como voltar pro HBX central nos ícones** da tab bar.
6. **Anti-placona (regra do dono):** "placonas para velha cega" = negado na cara. Densidade é lei.

## A régua aprovada (números dos mockups)
- **Orçamento de cromo:** tudo que não é conteúdo (topo + guias + busca + stats) ≤ **~140px**.
  Topo = 1 linha (~48px). Tab bar 54–56px. O resto da viewport é LISTA.
- **≥8 itens visíveis** (linhas 56–64px) em viewport 844px. Linha inteira clicável.
- Guia de modo = **segmented compacto 28px** (nunca botões-cartaz). Stats = **1 linha micro 11px**.
- Fileira de ícones do topo (ajuda/sino/balão/avatar) NÃO existe no mobile — vive no "Mais".
- Busca ao vivo = **faixa fina** com pulso + contador; resultados entram NA lista com transição.
  Zero painel flutuante, zero botão "Voltar" pra ver resultado.
- Detalhe/ficha = **bottom sheet** sobre a lista (sobe com transição, arrasta pra fechar).
- Chat = **takeover** (tab bar sai, input entra). Voltar pela seta, com transição VOLTAR.
- Badge de status = 1 cor no máximo por linha. Dado sem cadastro = "—", nunca inventar.

## Arquitetura
- **`MobileShell`** (componente novo): decide por hook novo próprio (`useCascaMobile`, breakpoint
  ~768px) — quando mobile, renderiza a casca (topo + slot + tab bar) e o **registry** de telas.
- **Registry rota→tela mobile**: só o que está registrado renderiza no celular. Rota sem versão
  mobile → **fallback gracioso** central ("Disponível no computador", card limpo na casca). Assim a
  casca NUNCA quebra por construção. Desktop = intocado (branch mobile é DOM separada).
- **Tab bar:** Vendas · Conversas · Empresas · Rota (gate `isModuleVisible`) · Mais. A aba "Buscar"
  não existe (Buscar vive dentro de Vendas). No mobile, `/dashboard` redireciona pra `/vendas`.
- **CSS:** classes da casca em arquivo central novo `hbx-theme/casca.css` (importado no globals);
  métrica estrutural (alturas/font-size/spacing) nasce nos arquivos da Lei 1 (`typography.css`/
  `spacing.css`/`skeleton.css`) — ver docs/Rules/FRONTEND.md. Pele veste via tokens; a casca herda
  a pele ativa (aurora/ember/rose) automaticamente.
- **Transições centrais:** tokens de movimento + classes `casca-ir`/`casca-voltar` (tela: slide
  horizontal; sheet: slide vertical; fade acompanha). Helper central segura o unmount até a
  transição de saída terminar. TODA abertura/fechamento passa por ele.
- **Fullscreen:** util central (`casca-fullscreen`) + toast central de aviso. Opção no "Mais" e nos
  Ajustes do Rota; no Rota, oferecer ao iniciar rota.
- **Carregamento padrão (ordem do dono 06/07):** componente central `CascaLoading` — a marca
  **HBX no centro** com um **anel ao redor que ENCHE de 0 a 100**, multi-cor (gradiente cônico),
  acabamento de altíssima qualidade com profundidade 3D (brilho, sombra interna, glow suave).
  Progresso real quando a tela souber (%, número no centro); sem progresso = modo indeterminado
  (enche em loop com easing). É O carregamento de tela/ação da casca inteira (skeleton de linhas
  continua só pra listas). Cores nascem como tokens no contrato e cada pele veste as suas
  (check-pele: hex só em arquivo de pele/tema). O Rota veste com a skin entrega.
- **Dados:** mesmos hooks/endpoints do desktop. **Zero backend, zero endpoint novo, zero Prisma.**

## Sprints (sequenciais — cada worker lê docs/Rules/FRONTEND.md + este PLANO antes)
| # | Worker | Modelo | Entrega |
|---|---|---|---|
| W0 | LIMPEZA | sonnet | Remover front mobile velho (inventário + remoção cirúrgica) |
| W1 | CASCA | opus | MobileShell + registry + fallback + tab bar + transições + fullscreen |
| W2 | VENDAS | sonnet | Funil + Buscar (mockup aprovado 1) |
| W3 | CONVERSAS | sonnet | Lista + chat takeover (mockup aprovado 2) |
| W4 | EMPRESAS | sonnet | Lista + ficha bottom sheet (mockup aprovado 3) |
| W5 | MAIS/CONFIG | sonnet | Folha "Mais" + Configurações curadas (sem IA/avançado) |
| W6 | ROTA | sonnet | /entrega re-vestido na casca (skin própria + volta pro HBX + fullscreen) |
| W7 | QA | sonnet | Playwright viewport iPhone + varredura + landing/login mobile |

## Regras de repo (todas as sprints)
- Master direto, sem branch/worktree/stash. `git add` por caminho. Commit local por sprint
  (`feat(mobile-casca): W{n} …`). **NÃO publicar** — só o dono publica.
- Não tocar em arquivos paralelos do dono; não mexer em lógica/estado das telas desktop.
- Checks por sprint: `cd frontend && npm run lint` (check-pele) + `npx tsc --noEmit` + `npm run build`.
- Cada worker grava `W{n}-RESULTADO.md` nesta pasta e APAGA o próprio arquivo de tarefa ao concluir.
- WhatsApp/cobrança: caminhos blindados INTOCADOS (isto é UI).
