# S3 — Monólito legível (sem reescrever nada que funciona)

## Diagnóstico
`logistica/assets/app/app.js`: 7.643 linhas, 1 IIFE, estado único com ~90 campos, dispatcher de
clique com ~170 ramos (`action === "..."`), 131 data-actions. FUNCIONA — o objetivo aqui NÃO é
reescrever nem "modernizar", é baixar o custo de entender e o risco de mexer. Mudanças 100%
mecânicas, zero comportamento novo.

## Tarefas

1. **Estado 100% declarado**: `state.updateInfo` (1935), `state.modalClient` (2515),
   `state.modalProduct` (6360) nascem por atribuição dinâmica. Declarar os 3 no literal do state
   (linhas 7-236) com comentário de 1 linha cada. Novo campo de estado fora do literal = proibido
   (anotar isso no topo do state).
2. **Matar o caminho morto do `data-day`**: o render pendura listener direto com
   `stopImmediatePropagation` (4824-4832), então o ramo `if (target.dataset.day)` do dispatcher
   (6127) NUNCA roda pra esses botões. Remover o ramo do dispatcher e deixar comentário de 1 linha
   no listener direto dizendo que ele é o ÚNICO caminho (motivo: WebView de alguns aparelhos perde
   o toque delegado — comentário já existe em 4817-4823).
3. **`isAdmin()` sem adivinhação** (436): hoje deduz papel pela PRESENÇA de `modoRotaPadrao` na
   config (shape do serializer admin). Pedir ao backend um campo explícito
   `ehAdmin: isBillingOwnerActor(actor)` no `serializeConfig` (logistica-config.service.ts:444) e
   ler `state.config.ehAdmin === true` com fallback pro truque atual (aparelho pode estar com
   config cacheada velha). Um publish depois, remover o fallback.
4. **Fatiar por domínio SEM bundler** — `index.html` (19 linhas) já carrega scripts em sequência;
   o padrão da casa é IIFE global. Extrair do app.js, NA ORDEM, cada bloco pra arquivo próprio em
   `logistica/assets/app/`:
   - `leitura.js` (~60 funções `leitura*`, linhas ~2859-3750) — maior bloco autocontido.
   - `navegacao.js` (nav*/osrm*/mapa vivo, ~569-1400 + 5376-5470).
   - `conferencia.js` (conferencia*/rotaConferencia, ~5019-5283).
   Mecânica: mover funções inteiras, expor via objeto (`window.HBXLeitura = {...}`) OU manter
   escopo único carregando os arquivos dentro do mesmo IIFE via concatenação no `index.html`
   (script tags na ordem; estado continua no app.js). Escolher a opção que exigir MENOS mudança
   de call-site e documentar no resultado. ⚠️ `NativeApiClientPathPolicyTest` não é afetado;
   `mobile-contract.js` lista os assets? conferir e incluir os novos arquivos onde for preciso
   (grep por `app.js` em EntregaShell/app/src e no deploy).
5. **Rebaixar o comentário-histórico**: o arquivo tem dezenas de comentários "S3 21/07 (PR...)" que
   são changelog, não contrato. NÃO apagar em massa (o dono usa como memória) — só onde o passo 4
   mover código, reescrever o comentário pro CONTRATO atual (o histórico fica no git).
6. **Lint de leis no EntregaShell** (estender o check que já barra hex): barrar também
   `alert(`/`confirm(`/`prompt(` e `style="` novo em `*/assets/app/*.js`. Rodar no publish junto
   do check atual.

## Verificação (gate)
- APK builda (`assembleLogisticaRelease`) e o app abre no aparelho com TODAS as telas da fumaça S1.
- `git diff --stat`: nenhuma mudança fora de EntregaShell + (passo 3) logistica-config.service.
- Fumaça do teclado: novo cliente com Enter encadeando até cadastrar (Lei 5 sobrevive ao fatiamento).
- Lint novo REPROVA um `confirm(` plantado de teste e volta a passar ao remover.

## Não fazer
- Nada de framework, nada de bundler, nada de renomear função viva, nada de "melhorar" lógica no
  meio da mudança mecânica. Um worker por vez NESTE arquivo (conflita com S1 se rodarem juntos).
