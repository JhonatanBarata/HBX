# S-FRONT-UI — resultado (Worker B, front), 04/07

> LOCAL — não publicado, não commitado. Sobre o contrato do Worker A
> (`CONTRATO-FILTRO.md` + `S-BACKEND-UI-RESULTADO.md`).

## O que foi feito

- **Componente novo `frontend/src/components/hbx/buscar-empresas.tsx`** — substitui o Radar antigo
  (`LeadsClient`) dentro do modo "Buscar empresas" de `/vendas`. Consome DIRETO o contrato novo:
  `POST /webscraping/radar/cnpj-base/query` pra listar ("Disponíveis" = `count` + `sample`) e
  `POST /webscraping/radar/cnpj-base/pull` pra puxar (contrato assumido — hoje 404 no backend
  local rodando, ver "Verificação ao vivo" abaixo; tratado com toast neutro, nunca inventa outro
  caminho).
- **`frontend/src/app/(app)/vendas/page.client.tsx`**: trocou `<LeadsClient embedded .../>` por
  `<BuscarEmpresas onLeadPulled={handlePulled} onCountChange={setBuscarCount} />`; removeu o botão
  "@ Automático" + `poolDisponivel`/`autoAtivo`/`autoBusy` + as duas chamadas a
  `/webscraping/radar/standing-order` (item 5); simplificou o KPI do topo em modo "buscar" pra só
  "Disponíveis agora" (tirou "Total no Brasil"/cota do standing-order antigo — não fazia sentido
  sem a automação); CTA do funil vazio agora manda pra "Buscar empresas" (`irBuscar`) em vez de
  `/leads`. Removida a import morta `isCompanySeller`/`isSellerVnd` (só existia pra rotular a cota
  antiga).
- **`frontend/src/app/(app)/leads/page.client.tsx` DELETADO** (item 9): ficou órfão — nada mais
  importava `LeadsClient` depois da troca acima (`/leads` já era só `LeadsRedirect` pro `/vendas`,
  regra "Sem legado" do FRONTEND.md). Isso também removeu ~2000 linhas de estado morto (radar
  disc/search-runs/standing-order/pesquisas salvas antigas) e 2 erros de lint pré-existentes
  (`react-hooks/immutability`, `react-hooks/refs`) que viviam só nesse arquivo.
- **CSS novo em `frontend/src/app/hbx-theme/screens.css`** (bloco `.be-*` no fim do arquivo): layout
  grid `.be-root` (esquerda resultados / direita painel fixo), `.be-side` com
  `position: sticky; top: 0` (item 7 — ancorado, não empurra layout), `.be-mosaic` (radar
  decorativo, ver abaixo), `.be-chips-row`/`.be-active-filters` (filtros ativos), `.be-search`
  (caixa de busca básica estilo site famoso), `.be-tristate`/`.be-chipset` (controles do popup
  avançado), `.be-adv-modal` (moldura do popup, `.hbx-veil`/`.hbx-modal` centralizam — Lei 2, nunca
  reposicionado inline). Zero hex/rgba novo — tudo em `var(--hbx-*)`/`color-mix`.

## Layout (itens 2, 6, 7, 8)

- Coluna DIREITA = **1 painel só**, `position: sticky` (não sai do lugar, não empurra layout):
  1. **Radar decorativo** (`RadarMosaic`) — grid 6×4 de quadrados coloridos com `color-mix` sobre
     `--hbx-success/brand/warning/info/accent` (a MESMA paleta dos estados antigos
     funcionando/pausado/parado, reaproveitada só como cor). Zero estado, zero `useEffect`, zero
     texto "Em pausa/Pronto pra buscar" — é só decoração fixa (`useMemo` gera os tons 1x).
  2. **Filtros ativos**: chips (`buildChips`) traduzem o filtro corrente em frases legíveis
     ("SP", "Fortaleza", "CNAE 4711-3/02", "Ativa", "MEI"...) + botão "Limpar".
  3. **Filtro básico**: 1 caixa de busca livre (`keyword`, debounce 380ms) + Estado (select) +
     Cidade (texto) + Segmento (mesma keyword, exposta 2x pro pedido "site famoso") + "Tem
     WhatsApp" (tri-state sobre `contato.comCelular`).
  4. Botão **"Filtro avançado"** → abre o popup.
- Coluna ESQUERDA = resultados: "Disponíveis" = `count` (título) + tabela da `sample` (empresa,
  cidade/UF, CNAE, contato, selo de qualidade). Clique na linha abre o detalhe (`DetalhesNegocio`
  reaproveitado, mapeado de `CnpjBaseSampleRow`) dentro de `.hbx-veil/.hbx-modal`. Paginação por
  `cursor`/`cursorNext` (pilha de cursores pra "Anterior" funcionar sem re-chamar do zero).

## Popup Filtro avançado (item 4)

Todos os campos do CONTRATO-FILTRO, 1:1 (nada inventado, nada omitido):
Localização (UF multi-chip, DDD, cidades), CNAE (código + "só principal"), Características
(situação/porte/matriz-filial multi-chip, natureza jurídica, MEI/Simples tri-state, capital
min/max, idade min/max anos), Sócio/dono (donoConhecido, nome do sócio, qualificações), Contato/
anti-contador (e-mail/telefone/celular tri-state, maxPhoneShare/maxEmailShare, blocklistEmail).
**Não oferece** regime tributário, "tem site" como corte, bairro/CEP, Instagram/nota IA/WhatsApp
validado como corte — exatamente a lista de "NÃO OFERECER" do contrato. O `selo` de qualidade
aparece só como coluna informativa na tabela, nunca como filtro.

## Item 5 (front)

Removido o botão "@ Automático" e toda UI de standing-order/auto-alimentar de `vendas/page.client.tsx`.
Mantido só "Puxar" (por linha) e "Puxar selecionados" (checkbox + ação em lote, para no primeiro
erro de cota/404 e mostra quantos entraram).

## Item 9 (front)

- `leads/page.client.tsx` deletado (órfão).
- Nenhum resíduo de "Canais Exigidos"/"Modo foco" no novo componente (não existiam mais no
  `LeadsClient` também — já tinham sido tirados num sprint anterior, confirmado por grep antes de
  escrever).

## Verificação

- `cd frontend && npm run build` — verde (Next 16 + Turbopack, TS + 32 rotas geradas).
- `npm run lint` — sem erro/warning novo em `buscar-empresas.tsx` nem em `vendas/page.client.tsx`
  (os 3 warnings que aparecem em `vendas/page.client.tsx` — `waStartError`, `fecharMsg`, 1 eslint-
  disable ocioso — são PRÉ-EXISTENTES, confirmados via `git show HEAD:...`). A deleção de
  `leads/page.client.tsx` inclusive REDUZIU 2 erros de lint pré-existentes.
- `node scripts/check-pele.mjs` — mesma lista de violações pré-existentes (bot-builder.css,
  whatsapp.css, screens.css:1555/1572) e nenhuma NOVA — confirmado via `git diff --stat` nesses 3
  arquivos antes/depois (zero diff fora do bloco `.be-*` que acrescentei no fim do screens.css).
- **Verificação AO VIVO no Chrome** (localhost:3001, backend Docker `:3000` saudável): login,
  `/vendas` → aba "Buscar empresas" renderiza o painel novo (mosaico decorativo, chips, busca
  básica, popup avançado com todas as seções). Zero-scroll confirmado em 1366×768
  (`scrollHeight === innerHeight`). Painel direito com `position: sticky; top: 0` confirmado via
  inspeção de estilo computado.
- **Achado ao vivo**: `POST /webscraping/radar/cnpj-base/query` respondeu **404** no container
  Docker `backend` rodando localmente (`Cannot POST /webscraping/radar/cnpj-base/query` no log do
  Nest) — a rota EXISTE no código-fonte (`webscraping.controller.ts:621`), mas o container em
  execução está com build desatualizado em relação ao working tree do Worker A. Não mexi no
  backend/container (regra da missão — outro worker mexe lá). O front absorveu o 404 sem quebrar:
  mostrou mensagem de erro (`loadError`) e manteve "Disponíveis 0 empresas" sem dado fake. Quando o
  backend for rebuilded/reiniciado com o código atual, a tela funciona sem nenhuma mudança de front.

## Pendências / follow-ups

1. **Autocomplete de cidade/CNAE** (`GET cnpj-base/cities`/`cnaes`) segue só `MasterGuard` (Worker A
   confirmou no `S-BACKEND-UI-RESULTADO.md`, item 3) — o filtro básico/avançado usa campo de texto
   livre (cidade, CNAE, natureza jurídica, qualificação) em vez de picker com sugestão. Se o dono
   quiser autocomplete real na tela `/vendas`, precisa abrir as 2 rotas espelho pro
   `ModuleAccessGuard` (mesmo padrão do `query` novo).
2. **`POST /webscraping/radar/cnpj-base/pull`** é contrato ASSUMIDO (não confirmado existir no
   backend ainda) — botão "Puxar"/"Puxar selecionados" está pronto e chamando esse endpoint; erro
   404/402/409 vira toast neutro ("cota da empresa atingida" / "tente novamente em instantes"),
   nunca mostra valor/cobrança pro vendedor.
3. **Tutorial coach-mark** (`frontend/src/lib/tutorial-coach-steps.ts`) tinha passos com seletores
   `data-tut="leads-*"` que só existiam no `LeadsClient` deletado — ficaram órfãos. Flagrado como
   tarefa separada (`task_2ea1ea6b`) em vez de resolvido aqui, pra não misturar sistemas (tutorial
   é reescrita própria, não redesenho de tela).
4. CSS `.radar2-*`/`.radar-canais`/`.radar-box`/`.radarMotion*` (usado só pelo `LeadsClient` morto)
   **não foi removido do `screens.css`** porque `frontend/src/app/page.client.tsx` (landing/
   marketing) reaproveita `.radar2-fit`/`.radar2-sig`/`.radar2-signals` como mockup visual — uma
   varredura de remoção precisa separar o que é exclusivo do Radar morto do que a landing ainda usa
   (fora do escopo desta missão, que era `/vendas` + `screens.css` pro componente novo, não uma
   auditoria de CSS morto no arquivo inteiro).
