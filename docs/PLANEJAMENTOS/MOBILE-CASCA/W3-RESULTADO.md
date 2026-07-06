# W3 — RESULTADO: CONVERSAS mobile (mockup aprovado 2)

Tela mobile registrada em `/atendimento` (troca do stub pelo miolo real).
LISTA + CHAT takeover, consumindo os MESMOS endpoints que
`app/(app)/atendimento/page.client.tsx` já usa no desktop. Zero backend novo,
zero endpoint novo, zero alteração na lógica/estado da tela desktop (DOM
mobile é árvore separada, registrada via `CASCA_SCREENS`). Zero toque em
conexão/reconexão de chip — o pontinho de status é LEITURA de
`/inbox/whatsapp-health` (mesmo cálculo `connectedForUi && canSend` que o
selo do desktop usa).

## Arquivos criados

- `frontend/src/components/casca/screens/conversas-types.ts` — tipos
  (`InboxConversation`, `InboxMessage`, `Presence`, `MessagesResponse`) e
  helpers (`convName`, `convUnread`, `convPreview`, `fmtConvTime`,
  `fmtMsgTime`, `fmtDur`, `msgType`, `isNovaConversa`, `cleanContact`,
  `phoneFromContact`) espelhando (mesmo contrato, sem importar — os do
  desktop não são exportados) os tipos locais de `atendimento/page.client.tsx`.
  `convPreview` monta a prévia de 1 linha da lista com os prefixos do mockup
  ("Você:", ícone robô quando é bot, "Áudio · 0:37", "Foto"/"Figurinha"/
  "Vídeo"/nome do documento).
- `frontend/src/components/casca/screens/conversas-lista.tsx` —
  `ConversasLista`: topo "Conversas" + pontinho de status do chip (verde=
  `connectedForUi && canSend` do `/inbox/whatsapp-health`; vermelho quando não)
  + botão "+"; faixa fina de estado quando o chip caiu (mesmo padrão visual
  da faixa viva de busca do W2, cor de aviso); busca (`GET
  /inbox/conversations?take=50`, filtro client-side); chips finos 11px
  (Todas · Não lidas·n · Bot·n); linhas 64px (avatar 36, nome + tag "nova",
  prévia com prefixo/ícone bot, hora accent quando não lida, bolha contador).
- `frontend/src/components/casca/screens/conversas-chat.tsx` —
  `ConversasChat`: o CHAT, montado dentro de `<CascaView>` (API central do
  W1 — a ÚNICA forma de empilhar; tab bar SAI sozinha porque
  `.casca-stack-layer` cobre a moldura inteira, `z-index` acima da tab bar).
  `title` do `CascaView` = nome do contato (a API só aceita `string`, não
  JSX — avatar/telefone entram como sub-header de 1 linha logo abaixo,
  dentro do corpo; ver "Pequena adaptação" abaixo). `actions` do
  `CascaView` = menu ⋮ (3 pontinhos CSS, sem ícone novo no contrato central)
  com popover `.hbx-pop` (atribuir atendente / ver ficha — stubs nesta
  rodada / encerrar atendimento → `PATCH .../status-card
  {doNotCall:true, closureReason}`, mesmo campo que o desktop usa em
  "Sem Interesse"). Balões: recebido neutro / enviado `--hbx-brand-strong`
  (token da pele), quoted real (`meta.quotedPreview`), áudio com player
  play/pause, imagem/vídeo/documento, hora + checks (✓/✓✓/✓✓ lido). Envio:
  `send()` → `POST .../message {content}`; `sendAttachment()` → `POST
  .../media` (multipart) + `POST .../message` com os campos
  `attachmentKind/Url/MimeType/FileName/FileSize` — MESMO contrato do
  desktop. Presença (`GET .../presence`, poll 6s) e thread (`GET
  .../messages?limit=30`, poll 8s + `PATCH .../read` na abertura).
- `frontend/src/components/casca/screens/conversas.tsx` — `ConversasMobile`
  (componente registrado): orquestra lista + chat (estado `selId`/`conv`
  local, busca a conversa completa via `GET /inbox/conversations?take=50`
  ao abrir — mesma fonte que a lista já carregou); "+Nova" em `CascaSheet`
  com a MESMA máscara de telefone BR do desktop (+55 fixo fora do campo,
  formata só a parte nacional) → `POST /inbox/conversations/start`.

## Arquivos alterados

- `frontend/src/components/casca/registry.tsx` — `CASCA_SCREENS["/atendimento"]`
  trocado do stub (`ConversasStub`, removido) pra `<ConversasMobile/>`.
- `frontend/src/app/hbx-theme/screens.css` — bloco novo "MOBILE-CASCA/W3" no
  final do arquivo (estrutura por-tela, Lei 2). Classes `.cvs-m__*`. Zero
  cor/hex — só tokens (`--casca-*`, `--hbx-success`/`--hbx-danger` para o
  pontinho e a faixa, `--space-*`, `--text-*`). Nenhum arquivo de pele tocado.

## Pequena adaptação em relação ao mockup literal

O mockup pede "header 48px: seta + avatar 32 + nome/telefone + menu ⋮". A API
central `<CascaView>` (W1) já entrega seta + título (string) + slot de ações
no header de 48px — de propósito, pra ser a ÚNICA forma de abrir/fechar
(LEI). Como `title` é `string` (não aceita JSX/avatar), usei `title=<nome>` e
pus avatar 22 + telefone/presença como uma segunda linha fina
(`.cvs-m__chat-sub`) logo abaixo do header, dentro do corpo do `CascaView` —
não abri mão da API central pra encaixar o avatar no lugar exato do mockup.
Resultado: 2 linhas de cromo no topo do chat em vez de 1 (48px + ~32px), mas
zero duplicação de lógica de transição/abertura. Alternativa mais fiel ao
mockup exigiria estender `CascaView` pra aceitar `title?: React.ReactNode`
— não fiz essa mudança na API central sem o orquestrador revisar (é
compartilhada por W2/W4/W5/W6).

## Dados — mesmos endpoints do desktop (conferido linha a linha)

- Lista: `GET /inbox/conversations?take=50`, `GET /inbox/whatsapp-health`
  (pontinho de status).
- Chat: `GET .../messages?limit=30`, `PATCH .../read`, `GET .../presence`,
  `POST .../message` (texto + anexo), `POST .../media` (upload), `PATCH
  .../status-card` (encerrar).
- Nova conversa: `POST /inbox/conversations/start` (mesmo payload
  `{phone, name?}` do "+Nova" do desktop).

## ZERO caminho de envio novo (confirmação)

Nenhum novo mecanismo de dispatch foi criado. `send()`/`sendAttachment()` em
`conversas-chat.tsx` chamam os MESMOS 3 endpoints (`POST .../message`,
`POST .../media`, e o upload) na MESMA ordem que
`atendimento/page.client.tsx` usa — só reimplementados numa UI mais enxuta
(sem citação/gravação de áudio/emoji/mensagem rápida nesta 1ª versão mobile,
que ficam só no desktop). Nenhum arquivo de socket/instância do motor
(`Webwhats/`) ou de conexão/reconexão foi tocado; o pontinho e a faixa são
LEITURA pura de `/inbox/whatsapp-health` (mesmo cálculo do selo do desktop).

## Régua (auditada)

- Cromo da lista: topo ~44px (pontinho+título+botão) + busca ~44px + chips
  ~30px ≈ **118px** (< 140px, sem a faixa de aviso; +28px quando a faixa
  aparece com o chip caído, ainda dentro do orçamento considerando que a
  faixa SUBSTITUI espaço de respiro, não empilha sobre as 8 linhas).
- Linhas 64px fixas (avatar 36 cabe com folga) — em 812px de viewport, cromo
  ~118–146px + tab bar 55px + topo da moldura já contado ≈ 173–201px de
  moldura fixa, sobram ~611–639px pra lista → mais de 9 linhas de 64px cabem
  (**≥8 visíveis**, régua cumprida mesmo no cenário com faixa de aviso).
- Chat: header 48px (API central) + sub-header ~32px + composer ~52px = cromo
  fixo ~132px: o resto é a lista de balões rolável.

## Checks

- `npx tsc --noEmit` — limpo (0 erros).
- `npm run lint` (eslint + check-pele) — **45 errors / 38 warnings**, IDÊNTICO
  à baseline documentada em W1/W2-RESULTADO.md: meus arquivos somaram **0**
  erro/warning novo (corrigi 1 `react-hooks/set-state-in-effect` e 1
  `no-unused-vars` que minha 1ª versão introduziu, antes do check final).
- `check-pele` isolado — **0 violações duras; catraca 495/495** (inalterada).
- `npm run build` — **verde**, "Compiled successfully", 42 rotas geradas
  (`/atendimento` incluída).
- Spot-check visual no Chrome (localhost:3001, sessão já autenticada):
  confirmado em nova aba própria (sem mexer na aba que o dono estava usando
  ao vivo em `/automacoes`), forçando `matchMedia` de teste + navegação
  client-side (o `resize_window`/`preview_resize` não mudou o viewport real
  neste ambiente — mesma limitação que W1/W2 já reportaram, aqui contornada
  o suficiente pra ver a tela renderizada). Confirmado visualmente: topo
  "Conversas" + pontinho vermelho (WhatsApp desconectado na empresa de
  teste — correto, é leitura real), busca, chips "Todas/Não lidas/Bot" em
  pílula, tab bar embaixo (Vendas·Conversas·Empresas·Rota·Mais), estado
  vazio "Nenhuma conversa ainda.", "+Nova" abrindo em `CascaSheet` com
  transição (handle, veil) e a máscara de telefone formatando
  "(11) 98765-4321" ao digitar. Console sem erros. Não criei conversa real
  (evitaria qualquer efeito colateral em WhatsApp) — o chat takeover em si
  não foi visto com dados reais nesta rodada.

## Pendência honesta

1. Não vi o CHAT takeover com uma conversa REAL aberta (a empresa de teste
   não tinha nenhuma conversa e criar uma dispararia contato real via
   WhatsApp, fora do escopo "só UI"). A lista, o "+Nova" e a transição de
   sheet foram confirmados ao vivo; o chat em si foi validado por leitura de
   código + tsc/build verdes + mesma API (`CascaView`) que já funciona no
   `CascaSheet` testado.
2. Menu ⋮ tem 2 ações-stub ("Atribuir atendente", "Ver ficha" — só fecham o
   menu) e 1 ação real ("Encerrar atendimento"). O desktop tem um cockpit
   bem mais rico (transferir/assumir/bloquear/retorno/sem-interesse/fechar
   venda) — fora do orçamento de cromo do resumo mobile pedido no PLANO
   ("aqui dentro: atribuir atendente, ficha, encerrar — resumo; o resto é
   desktop"); ficaria pra um W-seguinte se o dono quiser mais fundo.
3. Gravação de áudio, emoji picker e mensagens rápidas não entraram nesta
   1ª versão do composer mobile (só texto + anexo de arquivo, que já cobre
   imagem/vídeo/documento/áudio gravado fora do app). Mesma decisão de
   escopo do W2 pro Modo Foco — se o dono quiser paridade total, é
   incremento futuro, não bloqueio desta entrega.
4. Este arquivo é gravado depois de eu confirmar que o dono já rodou
   `npm run publish` (commit `d3b7f75b`) e capturou todo o trabalho do W3
   junto com outras mudanças paralelas dele — não criei commit adicional
   duplicado; só limpei o `W3-CONVERSAS.md` (que tinha ido junto no publish)
   e gravei este resultado.
