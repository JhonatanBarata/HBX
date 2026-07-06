# W4 — RESULTADO: EMPRESAS mobile (mockup aprovado 3)

Tela mobile registrada em `/empresas` (troca do stub `EmpresasStub` pelo
miolo real, matando o "chegam aqui (W4)" que estava em produção). LISTA +
FICHA em bottom sheet, consumindo os MESMOS endpoints do NÚCLEO-CRM que
`app/(app)/empresas/page.client.tsx` já usa no desktop. Zero backend novo,
zero endpoint novo, zero alteração na lógica/estado da tela desktop (DOM
mobile é árvore separada, registrada via `CASCA_SCREENS`).

## Arquivos criados

- `frontend/src/components/casca/screens/empresas-types.ts` — tipos
  (`EmpresaListItem`, `EmpresaListResponse`, `EmpresaContato`,
  `EmpresaDetail`) e helpers (`fmtCnpj`, `fmtPhone`, `localCityUf`,
  `initials`, `papelBadge`, `statusLabel`) espelhando (mesmo contrato, sem
  importar — os do desktop não são exportados) os tipos locais de
  `empresas/page.client.tsx`. `papelBadge` decide a badge ÚNICA por linha
  (cliente > lead > fornecedor > sem papel — cliente pesa mais por ser o
  status comercial mais forte).
- `frontend/src/components/casca/screens/empresas-lista.tsx` —
  `EmpresasLista`: topo "Empresas" + botão compacto 28px "+ Nova"; busca
  36px (nome/CNPJ/cidade, via `query` do mesmo endpoint); stats 1 linha 11px
  ("{n} empresas · {n} clientes"); linhas 60px (avatar QUADRADO 32 com
  iniciais — classe própria `.emp-m__ico`, não reusa `<Av>` central que é
  circular; nome 13px trunca com ellipsis real — `white-space:nowrap` +
  `text-overflow:ellipsis`, o furo pego em prod na tela do W2 não se repete
  aqui; "cidade/UF · segmento" 11px muted; badge única; chevron). Estados:
  carregando (`CascaLoading`), vazio ("Cadastre a primeira empresa" + CTA),
  erro (com "Tentar novamente").
- `frontend/src/components/casca/screens/empresas-ficha.tsx` —
  `EmpresasFicha` (`CascaSheet` sobre a lista): header (avatar quadrado 40 +
  nome 15px + linha "cidade · segmento · status" + lápis que abre
  `EditarContaModal`, o MESMO modal do núcleo que o desktop usa); 3 ações que
  cruzam a casca ("Conversar" → `POST /inbox/conversations/start` + handoff
  `sessionStorage("hbx:abrir-conversa")` + `router.push("/atendimento")`,
  MESMO padrão do `negocio-sheet.tsx` do W2; "Ligar" → `tel:`; "Funil" →
  `router.push("/vendas")`); tabela resumo 12px (Telefone · CNPJ · Endereço ·
  Contato (principal) · Origem · No funil); rodapé micro "Última conversa
  {quando} · {n} não lidas" (só aparece com dado real — busca a conversa por
  telefone via `GET /inbox/conversations?take=50`, mesmo endpoint do W3,
  comparando os últimos dígitos). Estados: carregando, erro (retry), vazio
  coberto pela lista.
- `frontend/src/components/casca/screens/empresas.tsx` — `EmpresasMobile`
  (componente registrado): orquestra lista + ficha (estado `openId`) + "+
  Nova" em `CascaSheet` com cadastro mínimo (nome, telefone, cidade) → `POST
  /nucleo/contas` (o MESMO endpoint que o cadastro manual grátis do núcleo já
  expõe — `CreateContaDto` aceita exatamente esses 3 campos + `tipo`).

## Arquivos alterados

- `frontend/src/components/casca/registry.tsx` — `CASCA_SCREENS["/empresas"]`
  trocado do stub (`EmpresasStub`, removido) pra `<EmpresasMobile/>`.
- `frontend/src/app/hbx-theme/screens.css` — bloco novo "MOBILE-CASCA/W4" no
  final do arquivo (estrutura por-tela, Lei 2). Classes `.emp-m__*`. Zero
  cor/hex — só tokens (`--casca-*`, `--hbx-success` pro badge "cliente",
  `--space-*`, `--text-*`). Nenhum arquivo de pele tocado.

## Dados — mesmos endpoints do desktop (conferido linha a linha)

- Lista: `GET /nucleo/empresas?query=` (mesmo filtro nome/cidade/CNPJ que o
  desktop usa; UF ficou de fora no mobile pra caber no orçamento de cromo —
  a busca por texto já cobre cidade).
- Ficha: `GET /nucleo/empresas/:id` (mesmo detalhe + contatos do desktop).
- Editar: `PATCH /nucleo/contas/:id` via `EditarContaModal` (componente
  IMPORTADO de `editar-nucleo-modais.tsx`, não duplicado).
- "+ Nova": `POST /nucleo/contas` (cadastro manual PJ grátis, já existente).
- Ações da ficha: `POST /inbox/conversations/start` (Conversar), `GET
  /inbox/conversations?take=50` (achar a conversa pra "Ligar"/rodapé —
  mesmo endpoint do W3).

## Pendência honesta nº1 — "No funil" (etapa + valor)

O mockup/tarefa pediam a linha "No funil (etapa + valor)" na tabela resumo.
Investiguei o backend: `CustomerProfile` (a tabela de `/nucleo/empresas`) NÃO
tem campo de etapa/funil; existe `VendasLead.customerProfileId` que cruzaria
com o board de Vendas, mas **não há endpoint que devolva isso hoje** — só
dá pra montar cruzando `/vendas/board` inteiro no cliente (payload pesado,
fora do padrão "1 empresa = 1 fetch" das outras linhas da tabela) ou criando
endpoint novo no backend (fora do orçamento "zero backend, zero endpoint
novo" do PLANO). Decisão: a linha "No funil" aparece na tabela sempre como
"—" (Lei do dono: dado sem contrato mostra "—", nunca inventa). Fica pro
dono decidir se quer um endpoint dedicado (`GET
/nucleo/empresas/:id/funil` ou embutir no próprio `getEmpresa`) numa rodada
futura — não é um bug desta entrega, é limite real do contrato hoje.

## Pendência honesta nº2 — "segmento"

Não existe campo "segmento" em `CustomerProfile`. Usei `origin` (o mesmo
campo "Origem" que o desktop já mostra na ficha) como o dado mais próximo
disponível pra preencher "cidade/UF · segmento" na linha da lista e no
header da ficha — mesma stand-in que a tarefa aceita implicitamente ("dado
sem cadastro = —"): quando `origin` é vazio, o subtítulo cai só pro CNPJ (na
lista) ou os separadores somem (na ficha).

## Pendência honesta nº3 — ação "Funil" sem foco na empresa

A ação "Funil" navega pra `/vendas` mas não abre direto no card da empresa
clicada — não existe hoje um handoff (sessionStorage ou querystring) pronto
no `VendasClient` do desktop pra abrir focado num `customerProfileId`
específico (o handoff existente, `hbx:vendas-modo`, só troca o MODO
Funil/Buscar, não seleciona um card). Implementar isso tocaria o desktop
(fora do escopo desta tela) ou exigiria estender a API central — fica de
sugestão pro dono/orquestrador se quiser paridade completa.

## Régua (auditada)

- Cromo: topo ~44px (título+"Nova") + busca ~44px + stats ~18px ≈ **106px**
  (< 140px).
- Linhas `--casca-row-h` (60px fixo). Em 812px de viewport: cromo ~106px +
  tab bar 55px + topo da moldura já contado ≈ 161px de moldura fixa, sobram
  ~651px pra lista → **10+ linhas de 60px cabem** (≥8 visíveis, régua
  cumprida).
- Badge única por linha: cliente (verde, `--hbx-success`) OU lead (neutro)
  OU fornecedor (neutro) — nunca mais de uma ao mesmo tempo (`papelBadge`
  decide por prioridade, nunca empilha).
- Nome longo trunca com ellipsis real (`white-space:nowrap` +
  `overflow:hidden` + `text-overflow:ellipsis` em `.emp-m__row-name` e
  `.emp-m__ficha-name`) — conferido no CSS, não só de olho.
- Ficha sobe/desce via `CascaSheet` (API central do W1, único jeito de
  abrir/fechar); "+ Nova" também em `CascaSheet`; "Funil"/"Conversar"
  navegam via `router.push` (transição de rota da própria casca).

## Checks

- `npx tsc --noEmit` — limpo (0 erros).
- `npm run lint` (eslint + check-pele) — **45 errors / 38 warnings**,
  IDÊNTICO à baseline documentada em W1/W2/W3-RESULTADO.md: meus arquivos
  somaram **0** erro/warning novo. (Corrigi durante o desenvolvimento 3
  ocorrências de `react-hooks/set-state-in-effect` nas minhas próprias
  primeiras versões — setState síncrono direto no corpo do effect —,
  movendo tudo pra dentro de função `async` local, mesmo padrão do
  `conversas-lista.tsx` do W3, antes do check final.)
- `check-pele` isolado — a catraca acusou **497/495** (2 acima do teto), mas
  **nenhum arquivo meu está na lista de violações**: o estouro é 100% do
  `src/app/(app)/master/janela-empresas.tsx` (trabalho não-commitado do
  dono, working tree — não faz parte deste commit, não toquei nele). O
  `scripts/pele-baseline.json` continua em 495 (inalterado por mim).
- `npm run build` — **verde**, "Compiled successfully", 42 rotas geradas
  (`/empresas` incluída).

## Pendência de verificação visual

Não fiz spot-check ao vivo no Chrome nesta rodada (regra do dono: localhost
não é referência de veredito; validação final é em prod pós-publish). Os
checks estáticos (tsc/build/lint) dão alta confiança estrutural e a régua
foi auditada em px a partir dos tokens reais — falta o olho no pixel em
produção, igual W1/W2 relataram.

## Commit

`bc6e4546` — `feat(mobile-casca): W4 empresas` (6 arquivos: registry.tsx,
screens.css, + 4 novos em `components/casca/screens/`). Não publicado — o
orquestrador publica depois da revisão.
