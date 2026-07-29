# FRONTEND REWORK — Visual premium do HBX (frente LEAD-CÊNTRICO e superfícies de venda)

> Documento de missão para agente executor externo. Autossuficiente: visão, caminhos, leis,
> armadilhas e aceite. Escrito 25/07/2026 pelo orquestrador da frente LEAD-CÊNTRICO.

## 1. Missão (a visão, em uma frase)

Pegar tudo que a frente LEAD-CÊNTRICO arrumou funcionalmente e dar a ele aparência de produto
**premium de altíssima qualidade**: impressão de ALTA RESOLUÇÃO, informação respirando, nada
apertado. O sistema hoje funciona, mas em vários pontos parece "tela 800x600": dado empilhado,
chip colado em chip, célula espremida. A ordem do dono é literal: **"menor, mais bonito"** —
MENOS informação visível por vez, MELHOR apresentada. Densidade não é virtude aqui; clareza é.

O que "premium alta resolução" significa na prática (traduza cada tela nisso):
- **Respiro**: escala de espaçamento consistente e generosa (padding interno de cartão, gap
  entre grupos, margem entre seções). Elemento encostado em elemento = defeito.
- **Hierarquia tipográfica real**: 1 título claro por bloco, secundário menor e mais claro,
  metadado em caption. Nunca 3 textos do mesmo peso disputando o olho.
- **Divulgação progressiva**: o que não é decisão imediata sai da frente — vira tooltip,
  expansão, segunda camada do cartão. Melhor 5 dados legíveis que 15 espremidos.
- **Profundidade sóbria**: elevação/sombra/borda suave pra separar planos; nada de sombra
  pesada nem gradiente chamativo. Microinterações curtas (hover, transição de aba) — sem
  animação longa (ver gotcha §7 de reduced-motion).
- **Consistência absoluta**: equivalentes IGUAIS. Padronizar = IGUALAR a forma, nunca
  decorar um item diferente dos irmãos (regra do dono; enfeite pontual mantém a inconsistência).
- **Contraste sempre**: o dono cobra contraste visual — texto lavado sobre fundo próximo é
  reprovado. E o dono usa fonte pequena com atenção: "diminuir letra" quando pedido é literal.

## 2. As 5 Leis do Design System (INEGOCIÁVEIS — o lint reprova violação)

TODO visual nasce em token/classe central em `frontend/src/app/hbx-theme/`. **Nada de cor,
borda, sombra, fonte ou radius solto em tela.** Nada de hex fora do tema; nada de style inline
decorativo. O lint `npm run lint` roda `frontend/scripts/check-pele.mjs` e REPROVA hex/inline
em tela (há baseline de exceções em `frontend/scripts/pele-baseline.json` — não adicionar nada
a ela). Tema troca por tokens. Refatorar aparência é AUTORIZADO — as Leis dizem COMO (no
tema), não SE.

Consequência operacional: este rework acontece ~80% dentro de `hbx-theme/*.css` e ~20% em
ajuste de estrutura/classe nos `.tsx`. Se você está escrevendo `#0af` ou `style={{...}}` num
componente, está errado — crie/ajuste a classe no tema.

A casca vigente e ÚNICA é a **modern** (`casca-modern.css`); a NOIR foi removida. Detalhe e
exceções: `docs/Rules/FRONTEND.md` (LEIA antes de começar).

## 3. Mapa de caminhos (onde cada coisa vive)

### Telas-alvo (na ordem de ataque)
| Superfície | Arquivo de tela | CSS de tema |
|---|---|---|
| **/vendas** — pipeline: 5 guias novas na Lista, Quadro renomeado (Planejar / Robô trabalhando / Te chamou / Negociação / Fechado), selo de tentativa e selo 🤖 no card | `frontend/src/app/(app)/vendas/page.client.tsx` | `hbx-theme/vendas-live.css` (guias `.vnd-guides`), `hbx-theme/screens.css` (classes `vnd-*` do quadro/planilha) |
| **Cockpit do lead** (detalhes de 1 clique, modal) — incl. a aba nova "Planejar" (pré-voo: entendimento, prontidão, personas, revisão de mensagem) | `frontend/src/components/hbx/lead-cockpit-modal.tsx` | `hbx-theme/vendas-details2.css` (aba Planejar: `.lead-cockpit__persona-*`), `hbx-theme/detalhes-negocio-vendas.css` |
| **/leads** — vitrine do Radar com badges de origem (Web/Receita/Fusão) e o novo badge "motivo de inclusão" | `frontend/src/app/(app)/leads/page.client.tsx` | `hbx-theme/screens.css` (`.radar-origin*`) |
| Fechar venda (passo a passo do fechamento) | tela dentro de /vendas | `hbx-theme/fechar-venda.css` |

### Fundações do tema (mexa AQUI pra efeito global)
- `hbx-theme/theme.css` + `casca-modern.css` — tokens de cor/superfície da casca aprovada.
- `hbx-theme/typography.css`, `fonts.css` — escala tipográfica.
- `hbx-theme/spacing.css` — escala de espaçamento (a alma do "respiro"; prefira corrigir a
  escala aqui a inventar padding local).
- `hbx-theme/kit.css` — componentes compartilhados (chips, tags, pills, fichas). ⚠️ tem
  violações antigas de check-pele já em baseline — não piorar.
- `hbx-theme/transitions.css` — microinterações (ver gotcha reduced-motion).
- `hbx-theme/base.css`, `screens.css` — grosso das classes de tela legadas.

### O que estas telas têm de NOVO (contexto do que foi construído, commits locais na master)
- `e40fa40b` — 5 guias com contagem na Lista (`.vnd-guides`, padrão Glass Pill), renome das
  etapas, selo "Nº contato" no card.
- `9a2225bd` — badge/tooltip "motivo de inclusão" no /leads (reusa `.radar-origin-enriched`).
- `8c837870` — aba "Planejar" no cockpit modal (entendimento/prontidão/persona/revisão).
- Em voo (mesma área, commits chegando): selo 🤖 robô ligado no card + botão "Ligar robô"
  habilitado (S4); config enxuta do admin + slots (S5); perfil do remetente de e-mail (S6).

## 4. Ordem de ataque sugerida

1. **Fundações**: revisar escala de espaçamento (`spacing.css`) e tipografia (`typography.css`)
   da casca modern — é o multiplicador; 1 ajuste aqui melhora todas as telas. Cuidado: mudança
   global exige olhada em TODAS as telas depois (item §8 de verificação).
2. **/vendas Lista + guias**: as 5 guias são a primeira coisa que o dono vê. Deixá-las
   protagonistas (respiro, contagem legível, estado ativo óbvio), e a planilha embaixo mais
   calma (linhas mais altas, colunas com folga, célula sem texto grudado na borda).
3. **/vendas Quadro**: coluna com cabeçalho claro (nome + subtítulo em caption), cards com
   hierarquia (empresa em destaque; selos de tentativa/robô/agenda como acessório, não
   competindo com o nome).
4. **Cockpit do lead** (a tela mais importante da frente): hoje mistura muitos blocos. Aplicar
   divulgação progressiva com força — cada aba com 1 propósito visível, cartões compactos com
   respiro, a aba Planejar como vitrine do capricho (é o "pré-voo" que o dono vai demonstrar).
5. **/leads vitrine**: badges de origem/motivo discretos e elegantes (são metadado, não grito).
6. **Responsividade 1368x768**: o cockpit corta nessa resolução (moldura fixa ~650px é
   suspeita conhecida). Existe plano prévio com QA de 4 resoluções em
   `docs/PLANEJAMENTOS/PR22072026-UIUX-ADAPTATIVO/` (execução nunca iniciada) — use como
   referência de alvos de resolução; não precisa executá-lo inteiro.

## 5. Regras de conteúdo (tão duras quanto as visuais)

- **NÃO inventar texto de UI.** Nenhum título novo, dica nova, explicação nova. O rework é de
  FORMA. Se um texto parecer errado, listar no relatório pro dono decidir.
- **Excluir = manter pressionado** (padrão do produto; nunca introduzir lixeira/botão de excluir).
- **Não remover funcionalidade** nem esconder controle existente sem equivalente visível.
- **OOBE é casca isolada** (visual próprio dark constante) — se esbarrar, não aplicar tokens do
  sistema lá.

## 6. Fronteiras (NÃO tocar)

- Backend inteiro, APK/Kotlin, `Webwhats/`.
- Módulos Atendimento e Conversas (negociação separada do dono) e Recovery.
- As 3 seeds de persona e qualquer texto de mensagem que sai pro cliente.
- Trabalho paralelo NÃO commitado de outras sessões no working tree (há frentes de logística e
  LEAD-CENTRICO commitando na mesma árvore): `git add` só arquivo por arquivo do que VOCÊ
  tocou; NUNCA `git add -A`; NUNCA `git stash`; NUNCA criar branch/worktree — trabalhar DIRETO
  na `master`, commits locais, publicar só o dono.

## 7. Armadilhas técnicas que JÁ morderam (não repetir)

- `*/` dentro de comentário CSS **derruba o app** (parser). `#` + hex dentro de COMENTÁRIO
  quebra o check-pele. Cuidado ao comentar.
- `.next` cacheia "Can't resolve" — erro fantasma após mover arquivo: apagar `.next` e rebuildar.
- `animation-fill-mode: both` congela transform/filter e vira containing-block eterno —
  **quebra `position:fixed` de modal** (o cockpit é modal!). Usar `backwards`.
- Uma SEGUNDA folha importada depois no globals anula edição — se "editar e não mudar nada",
  procure outra folha vencendo a cascata antes de culpar cache.
- `prefers-reduced-motion` no Windows do dono zerava animações — transições devem degradar com
  elegância sob o `@media` de reduced-motion (não sumir com a interface).
- Muitos erros no preview interno — validação visual é no **Chrome**, `localhost:3001`
  (subir com `npm run up`; credenciais de teste em `.test-login.local.md`, gitignored, acesso
  full de teste).

## 8. Aceite (o que "pronto" significa)

1. `cd frontend && npm run lint` (eslint + check-pele) e `npm run build` verdes — **zero
   violação nova** de pele (baseline não cresce).
2. As 4 telas-alvo visivelmente mais respiradas em 1920x1080 E íntegras em 1368x768 (nada
   cortado, sem scroll horizontal de página).
3. Nenhum texto de UI novo; nenhuma funcionalidade sumida; equivalentes IGUALADOS.
4. Commits locais na master, 1 por tela/etapa (mensagens `style(frontend): ...`), sem push.
5. Relatório final: o que mudou por tela, prints antes/depois se possível, e a lista de
   textos/incoerências encontrados que ficaram PARA O DONO decidir.

## 9. Contexto de negócio (pra calibrar o gosto)

O HBX está virando um cockpit comercial lead-cêntrico (o vendedor abre o lead, entende, planeja
e liga Automação; o sistema chama ele quando o lead esquenta). O comprador é dono de PME
brasileiro. A aparência precisa transmitir: **ferramenta séria de vendas, cara de produto caro,
zero cara de painel de admin genérico**. Referências de régua: Linear, Pipedrive, Attio —
sobriedade, respiro, microdetalhe bem feito. Nada de neon, nada de densidade de terminal.
