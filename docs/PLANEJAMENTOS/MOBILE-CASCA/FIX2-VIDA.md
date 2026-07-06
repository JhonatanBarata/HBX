# FIX2 — VIDA nas telas (reprova do dono 06/07 noite, prints de prod)

> Dono: "vendas em cima está feio, parece planilha do excel; o buscar nem dá pra saber q é
> clicável; não tem como saber o q é filtro, onde clicar. Péssimo!" / "cade a foto? Cade efeitos
> cade vida? nem dá pra saber q é um audio, só um play, não tem tempo, nada". Simplicidade está
> certa — o que falta é AFFORDANCE e VIDA (pele/vidro/profundidade), não mais elemento.

## V1 — Vendas topo (vendas.tsx / vendas-funil.tsx / vendas-buscar.tsx + screens.css)
- **Funil|Buscar e Lista|Quadro = Glass Pill deslizante** (LEI FRONTEND.md §2 que foi furada):
  usar `useGlassPill`+`<GlassPill>` centrais (components/hbx/glass-pill.tsx, classes
  `.glass-pill-*` do kit.css — NÃO recriar o efeito). A pílula de vidro desliza até o ativo
  com a chacoalhada de pouso.
- Ícones soltos (Lista/Quadro/raio) viram BOTÕES com cara de botão da pele (borda hairline,
  fundo, radius, estado pressed) — nada flutuando pelado ao lado de texto.
- O grupo inteiro do topo ganha respiro/hierarquia da pele (panel/vidro leve), matando a cara
  de linha de planilha. Cromo continua ≤140px.

## V2 — Conversas: seletor do admin (conversas-lista.tsx)
- Admin/gestor vê chip extra no grupo de filtros: **Todos | Meus** (gate igual desktop —
  mesma fonte de papel/role que o /atendimento desktop usa pra filtrar por atendente; vendedor
  não vê o chip e segue só nas dele). Filtra client-side/param como o desktop já faz — zero
  endpoint novo.
- Chips de filtro (Todas/Não lidas/Bot/Todos|Meus) também viram **Glass Pill** (lei §2).

## V3 — Conversas: FOTO real (conversas-lista.tsx / conversas-chat.tsx)
- Avatar da lista e do chat usa a MESMA fonte de foto do desktop (avatar estável do
  atendimento — foto do WhatsApp quando existe, fallback iniciais). Achar como o desktop
  resolve a URL da foto e reusar idêntico.

## V4 — Áudio com cara de áudio (conversas-chat.tsx + screens.css)
- Bolha de áudio de verdade (padrão WhatsApp): play/pause + **forma de onda** (barras estáticas
  CSS por token, animação sutil de progresso ao tocar) + **duração** (0:37) + hora/checks na
  bolha. Hoje é só um play pelado sem tempo — reprovado. Reusar o elemento <audio>/fluxo de
  mídia que o desktop já usa (zero caminho novo de mídia).

## V5 — Seta de voltar do chat (components/casca/transitions.tsx)
- O botão voltar do CascaView está renderizando seta pra DIREITA (→ antes do nome, print do
  dono). Voltar = seta pra ESQUERDA (usar o ícone correto de ICONS ou rotacionar via classe
  central). Conferir alvo ≥28px.

## Regras
- Vida = pele/vidro/profundidade/estados pressed + Glass Pill — NÃO adicionar texto/elemento novo
  (anti-placona segue). Transições da casca intactas. Zero hex/inline em TSX; check-pele sem
  violação nova (janela-empresas.tsx tem 2 pré-existentes do dono — não tocar).
- screens.css é compartilhado com o W5 — coordenar: só commitar screens.css depois de conferir
  `git diff` (não varrer hunks alheios no `git add`).
- Repo: master direto, add por caminho, commit `fix(mobile-casca): FIX2 vida (glass pill + fotos
  + audio + seletor admin)`, NÃO publicar. Checks: lint + tsc + build verdes.
- Gravar resultado em FIX2-RESULTADO.md e apagar este arquivo.
