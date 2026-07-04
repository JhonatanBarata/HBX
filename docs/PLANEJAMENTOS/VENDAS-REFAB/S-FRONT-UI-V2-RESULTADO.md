# S-FRONT-UI-V2 — resultado (Worker front), 04/07

> LOCAL — não publicado, não commitado. Ajuste IN-PLACE sobre a tela boa (S1-S4), NÃO
> reconstrução. Pipeline de pesquisa e os cards ricos (badges Web/Receita/Fusão + Puxar)
> foram preservados o tempo todo — nada foi removido/recriado do zero.

## Rodada 2 (correções do coordenador, 04/07)

Depois da conferência ao vivo, 3 ajustes:

1. **Item 8 fechado de vez — ZERO UI de estado/pausa/auto-feed no painel.** Sumiram por completo
   (removidos do JSX, não só escondidos — impossível aparecer seja qual for a resposta do backend):
   - botão **"Retomar"** → o botão de ação virou UM só: **"▶ Buscar"** (ou **"◼ Parar"** enquanto
     busca ao vivo). Nada de "Retomar", nada de estado pausado.
   - caixa **"Sua carteira está cheia… O Radar volta a buscar sozinho…"** + **"+50 km"** (os dois
     `radar-stop-warn`) → removidas.
   - banner **"oferta esgotou → amplie o raio / inclua segmentos vizinhos"** (`radar-expand` no topo
     da lista + funções `ampliarAlcance`/`incluirSegmentosVizinhos`) → removido (era auto-expandir
     de estado).
   - `runPaused`/`runExpansion` (derivados de `opState`) e o cálculo `isPausadoCarteira`/
     `isParadoFiltro` → deletados. Sobrou só `runActive` (dita Buscar↔Parar + a linha de progresso
     real "Varrendo… · N achados", que é feedback de operação em curso, não estado ocioso).
2. **Item 5 fechado — botão "@ Automático" do "Meu funil" (empty state) removido** em
   `frontend/src/app/(app)/vendas/page.client.tsx` (CTA do funil vazio). Junto saíram o handler +
   `autoAtivo`/`autoBusy` + a chamada de boot a `/webscraping/radar/standing-order`. Ficaram
   "Puxar leads →" e "Ver o Radar".
3. **Radar mais protagonista (item 3 "painelzão").** O disco-sonar deixou de ser um ícone
   pequeno no header e virou HERO grande (148px) centralizado no TOPO do painel, num pedestal
   com glow radial suave (`radial-gradient` sobre `--hbx-brand`, tudo token/color-mix — zero hex),
   com "RADAR HBX" + "Buscar empresas" centralizados abaixo. Continua puro enfeite: nenhum estado,
   nenhuma grade de quadradinhos.

Verificado ao vivo no Chrome: DOM sem "Retomar"/"carteira cheia"/"+50 km"/"Em pausa"/"Automático"
e zero `.radar-stop-warn`/`.radar-expand`; hero grande e elegante; popup avançado intacto; build
verde; check-pele sem violação nova (13 pré-existentes, nenhuma minha).

---


## Contexto (por que "ajuste", não reconstrução)

A tentativa anterior (commit `f5631ebe`, revertido em `7fd01a26`) tinha **apagado**
`frontend/src/app/(app)/leads/page.client.tsx` inteiro (2235 linhas — Pipeline, radar, cards)
e criado um componente novo (`buscar-empresas.tsx`) que trocava a lista rica por uma tabela
crua da base fria. O dono odiou ("de onde vc tirou aqueles quadradinhos coloridos") e reverteu.
Esta rodada trabalhou **em cima do arquivo bom** (`leads/page.client.tsx`, é o que
`vendas/page.client.tsx` usa via `<LeadsClient embedded />`) — o popup de filtro avançado do
commit revertido foi resgatado (`git show f5631ebe:...buscar-empresas.tsx`) porque ele em si
era bom; só a tela em volta que o carregava foi descartada.

## O que foi ajustado

### 1. Radar = só enfeite (itens 2 e 8)
- `RadarDisc` (`leads/page.client.tsx`) perdeu a prop `opState` e toda a máquina de estado.
  Continua o MESMO disco-sonar (anéis, sweep, blips) — só que agora é decoração fixa, sempre
  no visual mais "vivo" (nunca reage a `operationalState`).
- Removidos os textos "Em pausa — volta sozinho" / "Pronto pra buscar" / a label de estado
  embaixo do disco (`radar-state-label`) — tanto no console cheio quanto na mini-barra do
  painel com lead selecionado. Também saiu a mesma frase duplicada na tira da lista de
  resultados (`radar2-live--pausado`).
- O que ficou (e é FUNCIONAL, não decoração): "Varrendo {cidade} · N achados · X%" durante uma
  busca ativa de verdade (progresso real de operação assíncrona), e os botões Buscar/STOP/
  Retomar (o Play real continua funcionando).
- **Não** virou grade de quadradinhos coloridos (isso já foi feito e odiado) — resgatei o
  padrão do sonar giratório, que é o mesmo visual elegante de antes.

### 2. Painelzão de filtro (item 3)
- Novo cabeçalho `radar-hero` (disco pequeno + "Radar HBX" / "Buscar empresas") acima do
  filtro.
- Caixa de busca criativa (`.be-search`, pill arredondado) com placeholder "O que você
  procura? Ex.: restaurantes em São Paulo com WhatsApp" — liga direto no campo `segment` real
  que a busca já usa (autocomplete via `<datalist>` com os segmentos conhecidos).
- Essenciais reorganizados em card único (`radar-panel`, cantos arredondados + sombra via
  token): Estado / Cidade / Alcance numa grade de 3, Quantos puxar + Tem WhatsApp lado a lado,
  Tem site embaixo, botão "Filtro avançado" centralizado.

### 3. Popup "Filtro avançado" ressuscitado (item 3b/4)
- Componente novo `frontend/src/components/hbx/filtro-avancado-modal.tsx` — recuperado do
  commit revertido (form 1:1 com `CONTRATO-FILTRO.md`: Localização/UF-DDD-cidades, Segmento
  CNAE, Características (situação/porte/matriz-filial/natureza/MEI/Simples/capital/idade),
  Sócio-dono, Contato/anti-contador). **Não oferece** regime tributário, "tem site" como corte,
  bairro/CEP — igual ao contrato.
- Diferença importante vs. o commit antigo: aqui o popup **não substitui** o Pipeline. Ele
  consulta `POST /webscraping/radar/cnpj-base/query` (endpoint já existe, leitura pura, aberto
  pra admin/vendedor) só pra mostrar uma **prévia ao vivo** ("N empresas na base Receita com
  este recorte"), com debounce de 380ms a cada mudança no rascunho.
- "Aplicar filtro" traduz o subconjunto compatível (UF/cidade/CNAE-ou-palavra-chave/WhatsApp)
  pros filtros que o Pipeline (`/webscraping/radar/leads`) já entende — testado ao vivo,
  recarrega a lista corretamente. Campos só-RFB (capital, idade, sócio, situação, anti-contador)
  não têm onde aterrissar no Pipeline hoje (`RadarDatabaseQueryDto` não tem essas colunas); o
  popup avisa isso explicitamente na prévia ("Só entram na prévia acima (o Pipeline ainda não
  filtra por): ...") em vez de fingir que filtrou.
- Testado ao vivo no Chrome (localhost:3001): popup abre centralizado via `.hbx-veil`/
  `.hbx-modal` (Lei 2), chips de UF/situação/porte/matriz-filial funcionam, tri-states
  (Qualquer/Sim/Não) funcionam, "Aplicar filtro" fechou o popup e recarregou a lista com
  `city=Fortaleza` de verdade (`GET /webscraping/radar/leads?...city=Fortaleza...` → 200).
- **Nota de ambiente:** o preview do count deu 404 no backend local rodando (`Cannot POST
  /webscraping/radar/cnpj-base/query`) mesmo com a rota compilada no `dist` do container —
  processo Nest local não recarregou depois do rebuild (não mexi nisso, é infra/backend, fora
  do escopo deste worker). O código já trata 404 como "sem erro visível" (mostra "0 empresas"
  sem alarme), então a tela não quebra; só o preview de contagem fica mudo até o backend
  recarregar.

### 4. "Disponíveis" e cards (item 6)
- Intocado — a lista "Disponíveis" continua sendo os cards ricos (badges Web/Receita/Fusão +
  Puxar) vindos de `/webscraping/radar/leads`. Só reorganizei o painel ao lado.

### 5. Painel ancorado (item 7)
- Já era true por natureza do grid (`.content { grid-template-columns: 1fr 360px }` +
  `.ctx { overflow-y: auto }` independente do `.work` da esquerda) — confirmado ao vivo que o
  painel não sai do lugar nem empurra layout ao rolar a lista.

### 6. Botão "@ Automático" (item 6 front)
- Já não existia na tela (uma passada anterior já tinha tirado o botão do JSX). O que sobrava
  era código morto: `toggleAutomatico()` + `autoBusy` (nunca chamados/lidos por nenhum botão) —
  removidos. `standingOrder` (estado) ficou porque ainda é lido de verdade no polling
  (`autoOn = standingOrder?.active`, decide fly-effect vs. toast ao terminar uma busca).

### 7. Legado (item 9)
- Removida a duplicação de blocos (B1/B2/B3 + ações + avisos) que sobrou de um refactor
  anterior mal finalizado no arquivo (o JSX tinha os mesmos blocos escritos duas vezes).
- `"Canais Exigidos"`/`requiredChannels`/`describeFiltro` — investigado e confirmado que ainda
  é usado ao vivo (descreve pesquisas SALVAS antigas no accordion "Minhas pesquisas salvas" e no
  modal "Salvar filtro") — mantido, não é legado morto.

## Onde mexi
- `frontend/src/app/(app)/leads/page.client.tsx` — `RadarDisc`, `renderRadarConsole`,
  `aplicarFiltroAvancado`, remoção do `toggleAutomatico`/`autoBusy`, remoção da tira "Em pausa"
  duplicada na lista.
- `frontend/src/components/hbx/filtro-avancado-modal.tsx` (novo) — popup ressuscitado.
- `frontend/src/app/hbx-theme/screens.css` — `.radar-hero*`, `.radar-panel*`, `.be-search*`,
  `.be-adv-*`, `.be-tristate*`, `.be-chipset*`, `.be-check` (zero hex/inline; tudo em
  `var(--hbx-*)`/tokens; NÃO trouxe de volta `.be-mosaic`, a grade de quadradinhos que o dono
  odiou).

## Verificação
- `cd frontend && npx tsc --noEmit` — limpo.
- `cd frontend && npm run build` — verde (`✓ Compiled successfully`, 34 rotas geradas).
- `node scripts/check-pele.mjs` — mesmas violações PRÉ-EXISTENTES de sempre (bot-builder.css,
  whatsapp.css, screens.css:1555/1572 — nenhuma nova, nenhuma delas no meu diff).
- Testado ao vivo no Chrome (localhost:3001, login `jhonatan@hbxsystem.com.br`): tela
  "Buscar empresas" renderiza Pipeline + painel novo; popup avançado abre/aplica; mini-radar
  com lead selecionado sem texto de estado; painel cabe inteiro sem scroll em janela larga.
- NÃO publiquei, NÃO commitei (`npm run publish`/`git commit` intocados).

## Screenshot final
Painel completo (1600×900, Chrome): disco-sonar decorativo + "Radar HBX / Buscar empresas" +
busca criativa + Estado/Cidade/Alcance + Quantos puxar/Tem WhatsApp + Tem site + Filtro
avançado + Buscar/Limpar + Salvar filtro + Minhas pesquisas salvas + Minha localização, tudo
num card único (`radar-panel`, cantos arredondados, sombra via token) ao lado do Pipeline de
pesquisa com os cards ricos intactos.
