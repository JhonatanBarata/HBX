# S4 — Resultado (aviso único, erro humano em todo catch, chegada consistente)

Executado 21/07. Arquivos tocados (únicos permitidos): `EntregaShell/app/src/logistica/assets/app/app.js`
e `EntregaShell/app/src/main/assets/app/app.css`.

## 1. Classe única de aviso (`.hbx-aviso`)

Criada em `app.css` (~linha 805): `.hbx-aviso` + variantes `--warn`/`--danger`/`--ok`, todas com os
mesmos ingredientes (borda `color-mix` + fundo suave + texto pequeno centralizado), só troca o
token de cor (`--warning`/`--danger`/`--success`). Os 3 nomes antigos viram alias na MESMA regra
(decisão do worker, per o plano — "sem quebrar" o HTML espalhado):

- `.lrt-endereco-warning` → alias de `--warn` (usado 1×: "Atualizar substitui o endereço anterior."
  no passo Endereço da Leitura).
- `.client-ddd-hint` → alias de `--warn` (usado 1×: "Falta o DDD — toque em Completar DDD.", dentro
  do campo Telefone do editor de cliente). Antes era só texto colorido sem moldura (`margin:6px 0 0;
  color:var(--warning)`) — agora ganha a MESMA caixa dos outros avisos. É mudança de pixel
  intencional (o pedido do dono foi "aviso tem que ter UMA cara"), não um bug de cópia.
- `.client-duplicate-warning` → alias de `--danger`. **Achado: código morto.** Grep confirma zero
  uso em `app.js` — o comentário vizinho no CSS ("endereço duplicado: só o vermelho sinaliza o
  campo, sem texto") mostra que foi substituído por pintura de borda (`.client-address-duplicate`)
  em algum PR anterior e a classe de texto ficou órfã. Mantive como alias (custo zero) em vez de
  apagar, seguindo a autorização do plano de preservar nomes antigos — se quiser, é candidato a
  remoção de fato numa faixa de limpeza (tipo S1).

**1ª aplicação real — status do CEP (achado #0, provado ao vivo pelo dono):** `clientAddressFields()`
e `setClientCepStatus()` (`app.js`) agora classificam a mensagem via `cepStatusKind()` — função nova
que casa a mensagem EXATA (zero copy nova, Lei 8) contra a lista de textos de sucesso conhecidos:
"Endereço preenchido. Informe/Confirme o número.", "Endereço localizado. Salve o cliente para
confirmar.", "Localização preenchida. Confirme o número." → variante `ok` (verde `--success`).
Qualquer outro texto (CEP não encontrado, preencha rua, não foi possível localizar/obter
localização, autorize a localização) → variante `warn` (âmbar `--warning`). Mensagens de
carregamento (terminam em "…", ex. "Buscando CEP…") ficam neutras, sem caixa — do contrário a
moldura piscaria a cada dígito digitado. Cobre os DOIS fluxos: cadastro novo
(`state.newClientCepStatus`, sempre passa por `render()`) e edição existente (`state.clientCepStatus`,
tem um caminho IMPERATIVO em `setClientCepStatus()` que troca `textContent`/`hidden` sem re-render —
agora também recalcula `className` ali).

## 2. Auditoria de catch (82 catches em `app.js`)

| Categoria | Contagem | Tratamento |
|---|---|---|
| Já tinham `toast(humanApiError(e), true)` | ~50 | Sem mudança — padrão correto |
| Erro exibido INLINE (empty-state da própria tela: `clientsError`, `routeModelosError`, `dayPreviewError`, `clientProductsError`, `leituraResumoError`, `recargaError`, CEP status) | 9 | Sem mudança — já é "estado padrão" da Lei 7, toast seria redundante |
| Cosmético/best-effort documentado (map markers/linha de rota, foco/scroll de campo, `refreshGpsPerm`, `checkAppUpdate`, `findDuplicateClient`, geocode de apoio, `leituraReverse` com fallback, sync secundário de `locais` após PATCH principal já confirmado por toast, `loadDayCounts`/`refreshCreditsLock` — comentário explícito "fail-open"/"sem toast por dia") | ~20 | Sem mudança — silêncio é intencional e documentado no próprio código |
| **AÇÃO do usuário engolida sem nenhum feedback** | **1** | **Corrigido** |

**O 1 caso corrigido:** `loadClientDetail()` (chamada por `openClientEditor`, disparada ao TOCAR num
cliente pra abrir a ficha). Antes: `catch (error) { state.clientDetail = null; render(); }` — se a
busca do detalhe falhasse (rede caiu no instante do toque), o modal abria já aberto (mostrado antes
do fetch) e ficava sem nenhum aviso de que os dados não vieram; pior, `state.clientPaymentDraft`
(endereço/CEP/forma de pagamento) não é resetado em `openClientEditor`, então o formulário podia
mostrar dados do cliente ANTERIOR ainda no rascunho — achado à parte, anotado abaixo, não é escopo
de "catch silencioso" e sim de integridade de estado. Agora: `toast(humanApiError(error), true)`
avisa que o carregamento falhou.

**Códigos de backend conhecidos (item 3):** `ENTREGA_EM_OUTRA_ROTA` e `ROTA_NOME_DUPLICADO` já têm
frase em `humanApiError` (~linha 242-243). Nenhum code novo apareceu nos catches auditados
estaticamente; a prova de um erro de rede real (modo avião) ficou para o teste no aparelho — ver
seção 5.

## 3. Chegada nos 3 níveis — auditoria de código + 1 correção

`deliveryOfflineSheet`, `deliverySimpleSheet` e `deliverySheet` (nível completo) usam a MESMA
moldura (`sheet-wrap`/`section.sheet`), o mesmo selo "Você chegou no endereço"
(`state.deliveryArrived`) e mostram observações do cliente nos 3 (offline/simples: integradas no
hero como `.delivery-hero-obs`; completo: card dedicado `.delivery-obs-card` — diferença de
composição justificada pelo volume de conteúdo da tela completa, não um bug de padrão).

**Achado + corrigido:** os botões grandes de offline/simples (`.delivery-big-btn`: Pago/Próximo/
Entregue/Não atendeu) já usavam `min-height: 64px`, mas o CTA "Confirmar entrega" do nível
COMPLETO usava a classe genérica `.delivery-confirm` sozinha, com `min-height: 54px` — 10px abaixo
do padrão dos outros 2 níveis e do "≥64px" pedido pelo dono. Subi `.delivery-confirm` para 64px
(`app.css` ~371); afeta também "Confirmar não entregue" (mesma classe), que ganha o mesmo tamanho
por consistência.

## 4. Toast + teclado (item 5) — NÃO alterado, motivo abaixo

`.toast` é `position:fixed; bottom:62px` fixo (24px no breakpoint mobile), sem regra específica
para `html.keyboard-open`. Por leitura de código não dá pra confirmar com certeza se ele fica atrás
do teclado: o app já precisou construir um sistema próprio de medição de viewport
(`syncKeyboardViewport`, via `visualViewport`) exatamente porque `vh`/`dvh` não são confiáveis
NESTE WebView — o que significa que não dá pra saber, só lendo CSS, se `position:fixed` respeita o
viewport visual (resize real do layout) ou o viewport total (ficando atrás do teclado). Uma correção
"no escuro" (ex.: `bottom: calc(100vh - var(--hbx-visible-height) + 62px)`) arriscava piorar em vez
de melhorar, sem eu poder ver o resultado. **Não consegui testar no aparelho** (ver seção 5) — deixei
como está e sinalizo pro dono/próxima sprint confirmar com o teclado aberto de verdade antes de
mexer.

## 5. Verificação no aparelho — BLOQUEADA

`node --check app.js`: **passou**. Brace-balance do CSS (script Node): **profundidade final 0**.

**Não consegui rebuildar o APK.** `gradlew.bat :app:assembleLogisticaRelease` falhou por um erro de
COMPILAÇÃO KOTLIN alheio ao meu escopo — `LeituraTrilhaSync.kt` (arquivo novo, ainda sendo escrito
em paralelo pelo dono nesta mesma janela de trabalho) com comentário `/*` não fechado, quebrando
`NativeAppBridge.kt`/`RotaService.kt` que já referenciam a classe nova. Tentei o build repetidas
vezes (retry automático de 10 tentativas, ~25s de intervalo) — [ATUALIZAR conforme resultado final].
Backend/Kotlin é território proibido pro meu sprint ("NÃO TOCAR"), então não mexi no arquivo do
dono para destravar.

**Consequência:** não consegui tirar nenhum screenshot — nem o CEP válido/inválido com as 2
variantes, nem o erro de rede em modo avião, nem os 3 níveis de chegada no aparelho. Toda a seção
1-3 acima foi verificada por leitura de código + `node --check`, não por prova visual. Isso é uma
violação do "Pronto quando" do plano (pedia screenshots) — reporto honestamente em vez de forçar
sem o build funcionar.

## Achados fora de escopo (ANOTADOS, não consertados)

1. **`clientPaymentDraft` não é resetado em `openClientEditor`.** Se `loadClientDetail()` falhar
   (agora com toast avisando), o formulário de edição pode continuar mostrando o rascunho de
   endereço/CEP do cliente anterior em vez de ficar vazio/genérico. Não é um catch silencioso — é
   um bug de estado ao lado do catch que corrigi. Candidato a sprint futura.
2. **`.client-duplicate-warning` é CSS morto** (zero uso em `app.js`, substituído por pintura de
   borda `.client-address-duplicate`). Mantido como alias por segurança; candidato a remoção
   definitiva numa faixa de limpeza tipo S1.
3. **Achado do S2 (busca de clientes com resultado desatualizado) — não alterado.** Por leitura de
   código, `loadClients(true)` (disparada pelo debounce da busca) JÁ reseta `clientsPage=0` e chama
   `render()` de imediato (mostrando o skeleton `loading()`), e também dispara
   `showLoading("Carregando clientes…")` como overlay após 150ms — ambos mecanismos já existem e,
   pela leitura do código, deveriam cobrir o caso. Não sei se isso já resolve o que o worker do S2
   viu ao vivo (pode ter sido testado numa build anterior a esse comportamento) ou se ainda falha em
   algum caminho que só aparece no aparelho. Não mexi: a correção mais óbvia (chamar `render()` a
   cada tecla, não só no fim do debounce) tem risco real de quebrar o foco/cursor do campo de busca
   (o mecanismo de restaurar campo focado após re-render não foi pensado pra rodar a cada tecla) —
   risco alto demais pra aplicar sem poder testar ao vivo. Fica pro S6 ou uma sprint dedicada, com
   aparelho disponível.
4. **Banner "N paradas registradas" não decrementa ao remover parada** (achado do S3, cosmético,
   Resumo continua correto) — segue sem correção, fora do escopo de aviso/erro/chegada (é contador
   de estado, não avaria de aviso).

## Commit

`fix(apk): S4 avisos+erros+chegada` — hash preenchido após o commit.
