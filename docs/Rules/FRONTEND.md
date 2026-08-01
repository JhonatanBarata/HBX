# Regras — FRONTEND

> Next.js (App Router) + React + TypeScript em `frontend/`.
> Leia antes de criar ou alterar qualquer tela.

## As 5 Leis do Design System (MÉTODO — todo visual nasce centralizado)

> Não são freio: refatorar aparência e criar peles está AUTORIZADO. São o
> método pra todo valor visual nascer em token/classe central. O fiscal
> (`frontend/scripts/check-pele.mjs`, dentro do `npm run lint`) reprova o
> build se um hex/inline vazar pra dentro de tela — a disciplina não depende
> de memória de ninguém.

1. **Tokens centrais.** Todo valor visual (cor, fonte, radius, sombra,
   movimento) nasce em `frontend/src/app/hbx-theme/`:
   - `skeleton.css` — o CONTRATO inteiro, em valores neutros (cinza). É a
     lista fechada de variáveis que existe. Modo escuro é AUTOMÁTICO:
     `[data-theme-mode="dark"]` troca a escada de tokens — tela nunca sabe
     que o dark existe.
   - `theme.css` — Tailwind v4 (`@theme inline`): cada token vira utility
     (`bg-surface`, `text-ink-muted`, `rounded-panel`, `shadow-lip`…). A
     paleta default do Tailwind foi APAGADA — não existe utility de cor
     fora do contrato.
   - **Métrica estrutural é ESQUELETO (LEADS-FINAL/01, 06/07).** `font-size`,
     alturas (`height`, `--control-height*`, `--field-height`, `--row-height`),
     larguras de shell (`--rail-width*`, `--context-width`) e a escala de
     spacing nascem SÓ em `typography.css`/`spacing.css`/`skeleton.css`. Pele
     (`theme-*.css`) é PROIBIDA de declarar `font-size`/altura/largura
     estrutural — pele veste cor, borda, sombra, vidro, radius e família de
     fonte. É isso que garante troca de tema sem quebrar densidade (o
     check-pele reprova `font-size:<px>` dentro de `theme-*.css`).
     Alvos de densidade: lista de dados mostra **≥9 linhas em 1080p**
     (`--row-height: 48px`); zero-scroll (abaixo) continua lei — densidade
     não é desculpa pra deixar a tela rolar.
2. **Componentes centrais.** Visual repetido vira classe do kit
   (`kit.css`: panels, botões, campos, tabelas, overlays `.hbx-veil/.hbx-modal/
   .hbx-pop/.hbx-drawer`…) ou utility. Estrutura por-tela vive em
   `screens.css`. Nunca se repete visual em tela.
   - **Pop-up = SEMPRE no centro, pela central.** `.hbx-veil` já centraliza
     (`position:fixed; inset:0; grid; place-items:center; padding; z-index`).
     TODA tela só põe `className="hbx-veil"` + `.hbx-modal` e dimensiona a
     moldura (width). É PROIBIDO re-centralizar, re-posicionar ou re-empilhar
     (`z-index`) inline na tela. Pop-up fora do centro / "não aparece" = a tela
     está furando isto — o conserto é na classe central, NUNCA na página.
   - **Seleção ativa (menu/aba/chip/passo) = SEMPRE Glass Pill deslizante**
     (ordem do dono, 05/07 — nasceu do menu lateral, virou regra pra TODO
     grupo de botões/links com um "ativo" por vez). Nunca um `background`/
     `border` próprio que troca instantâneo no item clicado — o destaque é
     uma pílula de vidro (blur + brilho + sombra) que MEDE a posição do item
     ativo e desliza até ele, com uma leve "chacoalhada" de pouso ao chegar
     (squash/stretch, como uma gota assentando). Hook + componente prontos:
     `components/hbx/glass-pill.tsx` (`useGlassPill` + `<GlassPill>`); CSS
     genérico em `kit.css` (`.glass-pill-track`, `.glass-pill-item`,
     `.glass-pill`, `.glass-pill__glass`); cada pele veste o vidro em
     `theme-<nome>.css` via `.glass-pill__glass` (não recriar o efeito). Uso:
     ```tsx
     const gp = useGlassPill(activeKey, outrasDeps...);
     <div className="glass-pill-track algumaClasseDoContainer">
       <GlassPill {...gp} />
       {items.map(it => (
         <button key={it.key} ref={gp.itemRef(it.key)}
           className={"glass-pill-item algumaClasseDoItem" + (it.key === activeKey ? " active" : "")}>
           {it.label}
         </button>
       ))}
     </div>
     ```
     O container do grupo precisa de `position:relative` (a classe
     `.glass-pill-track` já dá isso). Forma padrão = `--radius-pill`; grupo
     com cantos quadrados (ex.: sub-menu de Configurações) seta
     `--glass-pill-radius: var(--radius-sm)` (ou a variável de radius que já
     usava) no container. Aplica-se a QUALQUER menu novo: sub-nav vertical,
     abas horizontais, chips de filtro/período, passos de wizard — não só ao
     menu lateral.
3. **Tema SÓ troca tokens (+ camada de vestir).** Pele nova =
   `theme-<nome>.css` (tokens claro/escuro + reestilo visual das classes
   centrais, tudo sob `[data-theme="nome"]`) + import no `globals.css` +
   entrada no `PELES` (theme-attributes.tsx). Como encomendar a uma IA:
   **docs/Rules/PEDIDO-DE-PELE.md**. Julgamento: tela-prova **/dev/pele**.
   Tema NUNCA muda escrita, estrutura, menu ou navegação — uma
   funcionalidade = UMA tela, UM DOM, UMA escrita. Cores instaladas: aurora
   (padrão), ember, rose, hbx-cyber. `skeleton.css` é a BASE de tokens
   (contrato neutro que as peles vestem) — NÃO é uma opção do seletor.
   - **CASCAS (dono 07/07; aprovação na mesma noite: "remover temas e
     cascas antigas, ficou perfeito os 4 novos"):** a casca MODERN
     (`casca-modern.css`, fundo infinito + vidro) é a ÚNICA selecionável —
     o seletor tem só os 4 temas "<Nome> Mod" e o visual clássico saiu do
     seletor (kit.css/casca.css seguem como ESTRUTURA base que a casca
     veste). Mecânica (genérica, serve pra casca futura): entrada com
     `casca: "modern"` no `PELES` aplica `data-casca="modern"` no `<html>`
     por cima do `data-theme` da COR base (`base:`); chave clássica salva
     em localStorage migra pra variante Mod da mesma cor (registry + boot
     do layout.tsx, manter em sincronia). Casca NÃO é pele: veste o MESMO
     DOM (shell desktop + casca mobile) e deriva TODA cor de token
     (`var(--hbx-*)` + color-mix com #fff/#000) — por isso
     `casca-modern.css` NÃO é isenta do check-pele e uma folha serve às 4
     cores. Continua valendo: UMA tela, UM DOM, UMA escrita — casca nova
     nunca duplica tela nem cria navegação própria.
4. **Tela é PROIBIDA de ter visual próprio.** Nenhuma cor, borda, sombra,
   fonte ou radius dentro de TSX — só classe central/utility/token. Inline
   `style` é tolerado SOMENTE para layout (display/gap/padding/width…).
5. **Fiscal no lint.** `check-pele.mjs`: cor literal em CSS fora de pele,
   cor literal em TSX e valor arbitrário do Tailwind (`bg-[#…]`) = build
   REPROVADO na hora. Styles visuais inline legados descem por CATRACA
   (`scripts/pele-baseline.json` — o teto só desce; meta ZERO; subir = build
   reprovado).

### Estado atual e exceções registradas
- **DUAS cascas, as MESMAS cores (dono 31/07).** A casca HBX (chave `premium`)
  foi REMOVIDA da raiz — registro, `casca-premium.css` e o contrato de cor
  `[data-theme="premium"]` saíram juntos. Sobram **Premium** (attr `modern`) e
  **Corporativo**, e as duas oferecem os 5 temas clássicos (Login, Aurora,
  Ember, Rosé, Layout) + o azul Corporativo, nos modos claro e escuro: o que
  separa as cascas é **densidade e geometria, nunca paleta**. Casca padrão =
  `backup` ("Premium"); chave desconhecida no navegador cai nela sozinha
  (`getCasca`). A escolha de COR é uma só e vale nas duas cascas — quem tinha
  um tema salvo vê o Corporativo abrir naquela cor.
- **A paleta `.cdl` não é de casca nenhuma.** Ela morava no `theme-premium.css`
  e sobreviveu à remoção em `theme-central-do-lead.css`: a ficha do lead é
  desenho FECHADO e sai igual em qualquer casca/modo, como o app do entregador
  (`entrega.css`). Manteve o prefixo `theme-` porque é onde o fiscal aceita
  cor literal. Deletar o arquivo junto com a casca teria despintado a ficha.
- Peles de COR instaladas (aurora, ember, rose, hbx-cyber, login, corporativa)
  vestem o contrato neutro de tokens; criar/refatorar pele é trabalho
  autorizado (ver PEDIDO-DE-PELE.md). `skeleton.css` é a base de tokens, não
  uma opção do seletor. Os theme-<cor>.css seguem vivos — não deletar.
- **Contraste medido (31/07, produção, 24 combinações casca × cor × modo):** o
  tema Corporativo passa AA nos dois modos (pior par 4,54 no claro / 5,65 no
  escuro). Os 6 pares que reprovam — aurora/escuro, ember/claro,
  hbx-cyber/escuro, login (os dois), rose/claro — reprovam IGUAL nas duas
  cascas: é dívida das paletas clássicas, não da Corporativa. Ver
  `contraste-sempre` antes de "consertar" (o auditor simplista mede `brand`
  como texto, e em alguns temas ele é só fundo de botão).
- **Pele noir REMOVIDA (dono 07/07, mesma ordem que criou a casca Modern):**
  theme-noir.css, a vitrine `.vnd-m__vitrine` (screens.css/vendas-funil.tsx)
  e o campo `mobileOnly` do PELES saíram juntos — não reintroduzir.
- `docs/TEMAS` é REFERÊNCIA de estrutura/escrita das telas — o visual de lá
  não se copia para dentro de tela nem de TSX (vira token/classe).
- Mundo-site (visual próprio, fora do fiscal): `hbx-theme/marketing.css`,
  `src/app/page.client.tsx` (landing) e `src/app/trabalhe-conosco/`.
- OOBE (10/07, supersede 07/07): a folha isolada `hbx-theme/oobe.css` MORREU —
  o portão de primeiro acesso (`components/hbx/oobe-gate.tsx`) veste a MESMA
  casca do app (tokens/kit; claro/escuro seguem o tema). Estrutura `.oobe-*`
  vive em `screens.css`, sem exceção no check-pele.
- `public/sw.js` é kill-switch permanente do PWA antigo — não remover; não
  registrar service worker novo sem ordem do dono.
- Webfonts via `<link>` no `src/app/layout.tsx` (nunca `@import` em CSS — o
  bundler descarta em silêncio).
- **Gotcha recorrente: `*/` dentro de comentário CSS derruba o build.** Se o
  texto de um `/* ... */` contém a sequência `*/` (ex.: comentário explicando
  um trecho de código que termina em `*/`), o comentário fecha ANTES do
  previsto e o resto vira CSS inválido — derrubou o build 2x nesta frente
  (MOTOR-ÚNICO, jul/26). Nunca escrever `*/` no texto de um comentário CSS;
  se precisar citar a sequência, quebrar (`* /`) ou reescrever a frase.

## Tipografia — UMA moradia para toda letra (31/07/2026)

`hbx-theme/typography.css` é o único lugar onde nasce tamanho de letra. Antes
desta passada o app tinha **2.523 declarações de `font-size`** espalhadas por
~70 medidas quase iguais (0,72 / 0,74 / 0,76 / 0,77 / 0,78rem — meio pixel de
diferença entre telas); mexer numa legenda era caçar arquivo por arquivo.

**Os 4 papéis e os 18 degraus.** Título `--fz-t1…t10`, normal `--fz-n1…n3`,
legenda `--fz-l1…l3`, micro `--fz-m1/m2` (o `m2` é o PISO, `--hbx-font-min`).
Tela pede o degrau, nunca a medida: `font-size: var(--fz-n2)`. Faltou um
tamanho? **O degrau nasce no typography.css** — não se escreve rem em tela.
Os nomes antigos (`--text-h1`, `--text-base`, `--text-xs`…) continuam vivos
como apelido do degrau equivalente.

**Fiscal R8** (`check-pele.mjs`): `font-size` com medida fixa (px/rem/pt) em
qualquer CSS/TSX **reprova o build**. Passam `var()`, `0`, `inherit`, `em` de
proporção e o miolo em `vw` de um `clamp` — desde que os LIMITES do clamp
sejam degraus. Isentos: o próprio typography.css e o mundo público
(landing/portal/site de cliente, que tem cena própria).

**Quem manda no tamanho.** O painel do header (fonte + 5 réguas de 50% a 150%:
Tudo, Títulos, Normal, Legendas, Micro) é da casca **Premium**. HBX e
Corporativo respeitam a própria casca — e quem garante isso é o CSS
(`html[data-casca="modern"]` é o único bloco que lê `--fz-user-*`), não um
`if` de componente. O painel só aparece lá porque o CSS já decidiu.

**Módulo pode ter tamanho próprio, não medida solta.** `/entrega` se lê na rua
e nasce 7% maior: isso é UM multiplicador (`--ent-mult`) sobre os degraus, não
7 px avulsos. Mesmo padrão para a casca mobile (`--casca-text-*`).

**Duas armadilhas medidas em produção:** `<small>` sem regra própria cai
ABAIXO do piso (o navegador aplica `smaller`, ~0,83× do pai) — por isso
`base.css` tem `small { font-size: max(0.83em, var(--hbx-font-min)) }`; e
`title=` nativo em botão de menu nasce POR CIMA do menu aberto e tapa a
primeira linha — em trigger de painel, usar só `aria-label`.

Consequência conhecida do `max()`: um `<small>` sem classe pode medir entre
dois degraus (0,83 × o degrau do pai, nunca abaixo do piso). É proporção com
chão, de propósito — mandar todo `<small>` para um degrau fixo mudaria o
tamanho de ~90 textos que hoje herdam do contexto certo.

## Layout — Zero scroll em desktop (100% zoom)

Toda tela de marketing (landing, esteira, módulos, planos) e toda tela do app
**deve caber na viewport sem rolar verticalmente** em desktop 100% de zoom.
Viewport alvo: ≥ 768 px de altura (resolução 1366×768 em tela cheia é o mínimo
comum de laptop).

### Como verificar antes de entregar

```js
// no console do navegador — retorna true se não precisa rolar
document.documentElement.scrollHeight <= window.innerHeight
// ou para a .scene-center da landing:
document.querySelector('.scene-center').offsetHeight <= window.innerHeight
```

### Onde e como corrigir overflow

O ajuste nunca mexe no visual macro: não "amassa" card, não troca cópia, não
remove elemento. A técnica é **compactar espaçamento** proporcionalmente à
altura da viewport com `@media (max-height: …)` + `clamp(vh, vh, px)`:

- **Arquivo:** `frontend/src/app/hbx-theme/screens.css`
- **Bloco existente:** `@media (max-height: 900px)` (perto do fim do arquivo)
  que já cuida da casca de marketing (`.scene-center`, `.scene-next`,
  `.site-integra`). Adicione aí se a tela usa essa casca.
- **Novas telas do app:** mesma lógica — `max-height` reduz padding/gap do
  container principal, nunca o conteúdo em si.

### Ordens

1. Novo componente ou tela adicionado → testar scroll no Chrome 100% zoom antes
   de marcar como feito.
2. Overflow detectado → corrigir via `@media (max-height: 900px)` em
   `screens.css`, **não** via `overflow-y: auto` no container da tela (isso
   esconde o problema em vez de resolver).
3. Reduzir na ordem: primeiro padding/gap da view, depois tamanho de botão de
   navegação, por último font-size (só se realmente necessário).

## Dados e API

- Client único: `src/lib/api.ts` (`apiFetch`, token em localStorage, proxy
  `/hbx/api` em dev via next.config). 401 fora do login → limpa token e volta
  pro `/login` (AuthGate no layout do grupo `(app)`).
- Conexão WhatsApp: fluxo canônico em `src/lib/whatsapp-connection-flow.ts`
  (+ `whatsapp-center.ts`); UI em `components/hbx/whatsapp-connect-modal.tsx`.
- Dado sem contrato no backend mostra "—" ou fica visual com nota — nunca
  número fake ao lado de dado real.

## Máscaras BR — telefone, CPF, data (resolver SEMPRE no front)

Telefone, CPF e data são **formatados no front** — o usuário nunca digita nem
lê dígito cru. Vale pra input (auto-formata enquanto digita) e pra exibição
(formata o que vem do backend). O backend recebe/guarda só dígitos
(`replace(/\D/g,"")` — data em ISO); a máscara é camada de tela.

- **Telefone** → `(DD)NNNNN-NNNN`, **sem espaço** depois do `)`.
  Ex.: `19997024884` → `(19)99702-4884`. Com 1 dígito a menos (fixo/8),
  os **4 últimos ficam sempre depois do traço** e o resto vai antes:
  `1997024884` → `(19)9702-4884`.
- **CPF** → `000.000.000-00`. Ex.: `40032304854` → `400.323.048-54`.
- **Data** → sempre com `/`: `DD/MM/AAAA`, `DD/MM/AA` ou `DD/MM` (a barra entra
  sozinha enquanto digita — nunca dígito colado).

**Uma fonte só (Lei nº2 — visual/lógica de tela nasce central).** Hoje isso
está espalhado e divergente: `fmtPhone`/`fmtTelefone`/`prettyPhone`
reimplementados em `(app)/empresas`, `entrega/clientes`, `(app)/atendimento`,
`casca/screens/empresas-ficha`+`empresas-types`, `whatsapp-connect-modal`,
`casca/whatsapp-conectar-sheet`… — vários ainda com espaço depois do `)`
(formato errado). O destino é UM helper central em `frontend/src/lib/format.ts`
(`formatPhoneBR`, `formatCpf`, `formatDateBR` + os `only-digits`/`parse`) que
todas as telas consomem; regex de máscara solto em TSX é proibido. Ao tocar
numa tela que formata um desses, **migra pro central** em vez de copiar mais
uma variação.

## Rotas

- Uma rota canônica por funcionalidade; alias só redireciona.
- Aliases ativos: `/dashboard/master` → `/dashboard`; `/workspace` → `/dashboard` (app paralelo
  friendly morto na unificação); `/webscraping` → `/leads` (Radar unificada); `/login` → `/?entrar`
  (W1 10/07: 1 login só, o card embutido na landing — logout/401 caem em `/` e `/?entrar` via
  `lib/logout.ts`/`lib/leave.ts`, com transição); `/bot` → `/automacao?secao=atendente`,
  `/automacoes` → `/automacao?secao=prospeccao`, `/assistente` → `/automacao?secao=atendente`
  (fusão MOTOR-ÚNICO, S17/21-07 — as 3 telas velhas viraram 1 hub por objetivo em
  `/automacao`, 4 seções: `atendente`/`cobranca`/`prospeccao`/`regras`; o sub-recurso
  `/assistente/copiloto/*` — redação assistida na tela do Lead — NÃO é alias, continua
  onde está).
  (`/boasvindas`, `/pre-checkout`, `/precheckout` removidos em F8/19/06 — rotas mortas deletadas.)
- **Sem legado (regra dura, dono 17/06).** Merge/substituição de tela apaga a velha NO
  MESMO passo — ela vira alias `redirect()` (ex.: `/workspace`→`/dashboard`,
  `/webscraping`→`/leads`) ou é deletada; e saem JUNTOS os botões/links que apontavam pra
  ela, a entrada `META` em `app-shell.tsx` e o CSS de `screens.css` que só ela usava. Duas
  telas vivas pra mesma função = legado proibido. Antes de editar, confirme que a tela é a
  CANÔNICA (a que o menu abre) — editar a homônima morta é trabalho jogado fora.

## Acesso e cobrança

- Frontend NÃO decide regra comercial: consome `accessState*` e mensagens do
  backend. Vendedor (`userKind=seller`) nunca vê plano/valor/cobrança.
- **Módulo sem acesso NÃO aparece no painel da esquerda.** O gate é
  `isModuleVisible` em `components/hbx/shell.tsx` e é
  **fail-closed**: o item da sidebar só entra quando `/modules/me` afirma
  `accessible:true` (mesmo veredito do guard real `canUserAccessModule`).
  Nunca mostrar um módulo e barrar no clique — sem acesso = some da navegação.
- Preço/plano só do catálogo da API (`/commercial-plans/me`) — hardcode proibido.
- Trilha de checkout: aguardando "go checkout" do dono.

## Texto que não cabe — as 3 leis (01/08/2026)

Truncar é **decisão de produto, não acidente de CSS**. Toda caixa que pinta texto
escolhe uma das três, e escolher é obrigatório — não escolher também é escolha: a de
cortar no meio da palavra sem avisar ninguém. As classes moram em
`hbx-theme/hbx-system.css`.

| Lei | Classe | Para quê |
|---|---|---|
| 1 linha + reticências | `.hbx-1linha` | texto longo por natureza cujo começo já identifica: razão social, e-mail, endereço |
| 2 linhas e para | `.hbx-2linhas` | texto corrido que precisa de contexto: observação, descrição, última mensagem |
| **nunca encurta** | `.hbx-inteiro` | **o dado que DECIDE**: status, valor em R$, telefone, prazo, etapa do funil, rótulo de botão |

**A Lei 3 é a que se esquece.** Um selo de status não pode encurtar: "Aguardando
resposta" virando "Aguardand" não é feio, é ERRADO — o dado que decide a próxima ação
do vendedor virou ilegível e a tela não deu sinal de que escondeu algo. Se não cabe,
quem cede é o layout (a linha que hospeda usa `.hbx-linha-flex`, que quebra).

**`min-width: 0` não é enfeite.** Item de flex tem `min-width: auto` por padrão, que o
proíbe de encolher abaixo do próprio conteúdo — sem ele as reticências nunca aparecem,
o texto só empurra o vizinho para fora. É a causa nº1 de corte em layout flex.

**Nunca dimensione caixa de texto com número fixo.** `conversas-live.css` já foi de
`min-width: 86px` para 104 para 148 — com o comentário registrando a medida exata — e
ainda cortava. A medida NÃO É CONSTANTE: depende da régua de letra que o usuário
escolhe (50–150%) e do peso da fonte da pele. Todo px ali é aposta na palavra mais
curta com a régua padrão. `max-content` não aposta, mede.

## Checks

- `cd frontend && npm run lint` (eslint + check-pele) → `npm run build`
  antes de entregar. Lint vermelho do check-pele = a entrega está ERRADA —
  corrigir na fonte (token/classe central), nunca contornar o fiscal.
- **`npm run clip`** (raiz) — fiscal de CORTE. Abre 9 telas × 2 padrões × 3 larguras
  com **dado hostil** e pergunta a cada elemento se o texto cabe dentro dele. Quatro
  defeitos: `CORTADO` (texto some), `VAZANDO` (escapa por cima do vizinho), `ESMAGADO`
  (altura fixa decapitou a linha) e `APERTADO` (texto CURTO que não coube = caixa mal
  medida, não truncamento).
  A régua (`tests/e2e/clip-baseline.json`) está **TRAVADA EM ZERO** desde 01/08:
  qualquer corte novo reprova. Consertou de verdade? `npm run clip:regua`.
- **`npm run paletas`** — as 6 cores × 2 modos. Prova que nenhuma esqueceu um token
  (um `var()` órfão pinta **transparente** com o build verde) e mede **contraste WCAG
  AA** nos pares de leitura. Cor não entra no fiscal de corte de propósito: cor é só
  token e não mexe em geometria. Cada fiscal responde UMA pergunta.
- **`npm run retratos`** — 20 PNGs em `visual-check/hbx-system/`, incluindo a
  prateleira das 6 cores na mesma tela. Não reprova nada: a rede garante que nada
  SOME, não que ficou bom. Essa segunda pergunta continua sendo humana.

> **LEI: token sem fiscal é decoração.** Medido nesta base: tipografia foi
> centralizada e **pegou** (2.523 declarações → 18 degraus) porque ganhou o R8.
> Espaçamento foi centralizado e **morreu** — 3.218 px literais contra 233 usos do
> token, 6,8% de adoção. Mesmo autor, mesma casa; a única diferença é quem cobrava.
> Daí nasceram R9 (espaço literal) e R10 (altura travada), como **catraca**: não
> exigem zero, exigem não piorar. Regra que reprova 3.218 linhas no primeiro dia é
> desligada na primeira sexta-feira, e aí não sobra nem a regra nem o hábito.
