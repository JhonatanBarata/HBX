# S1 — Resultado (limpeza de código morto + inline→classe + moldura/cabeçalho único)

Executado 21/07. Arquivos tocados (únicos permitidos): `EntregaShell/app/src/logistica/assets/app/app.js`
e `EntregaShell/app/src/main/assets/app/app.css`.

## Item a item (dos 13 da tarefa)

1. **Código morto do `modal()` apagado.** Removidos os 2 branches unreachable (`client-product`
   antigo ~10 linhas, `new-client` antigo 1 linha) logo abaixo dos `if` que já retornavam
   `clientEditorModal(false/true)`. Conferido campo a campo antes de apagar: os dois morto eram
   versões MAIS SIMPLES (sem DDD incompleto, sem `formOpen` colapsável, sem `precoAcordado`, sem
   seções `client-editor-part`) do que a versão viva — nada exclusivo neles, nada perdido.

2. **22+ inline styles migrados.** Achei 45 ocorrências reais de `style="` no arquivo (não 22 —
   o número cresceu com features novas desde o achado). Migrei TODAS as estáticas para classes
   novas (nomes batendo com a sugestão do plano onde fazia sentido: `.delivery-hero-name`,
   `.delivery-deve`, `.delivery-big-btn`, `.delivery-detail-link`, `.delivery-obs-card`,
   `.app-confirm-extra`, mais ~15 outras para telas que o plano não detalhou: leitura/timeline,
   next-stop, app-update, distance-warning, routeModelos, avatar arquivado). Sobraram exatamente
   **3 inline dinâmicos** (`stroke-dashoffset` do anel de contagem, `width` das duas barras de
   progresso) — dentro do orçamento de ≤8 do "pronto quando". Além do HTML, achei e migrei um
   inline **imperativo** (`box.style.cssText` setado via JS em `syncHeaderChips()`, os chips
   vivos do topbar) — mesma categoria de débito, virou `#hbx-header-chips` no CSS.

3. **Número duplicado no endereço corrigido.** `clientAddressText()` agora só concatena
   `client.numero` se ele ainda não aparece dentro de `client.endereco` (checa borda de palavra
   via regex, escapando o número). Único ponto de pixel mudado de propósito nesta categoria.

4. **`.day-saved-delete.day-saved-edit` → `.day-saved-edit`.** Renomeado no app.js (1 uso, em
   "Rotas Salvas") e no CSS: as duas regras (base vermelha morta + override verde) viraram UMA
   só com os valores que já venciam hoje (verde/brand). Comentário explicando que exclusão é
   segurar no card.

5. **Seletores CSS repetidos — auditados um a um, só 2 eram bug real:**
   - `.app-confirm-wrap` (2 blocos, zero conflito de propriedade) → fundidos em 1, sem mudar
     nenhum valor.
   - `.lrt-endereco-compare` (3 blocos, com conflito real em gap/padding/background) → fundidos
     preservando o valor que vence HOJE (gap 7px, padding 8px, background var(--surface) — do
     bloco de baixo, que vence por ordem); border-radius continua vindo do bloco compartilhado
     com `.lrt-endereco-card` (não mexi nesse, ele serve aos dois seletores).
   - **`.content`, `.sheet`/`.sheet-wrap`, `.stop-card`, `*` — NÃO são bug, decidi não juntar.**
     Conferi cada um: `.content` "repete" só em `@media` (breakpoint) e `.keyboard-open` (estado)
     — são overrides legítimos, juntar quebraria o responsivo. `.sheet-wrap`/`.sheet` idem (bloco
     base + bloco do ajuste de teclado, comentado e datado separadamente, sem sobreposição de
     propriedade). `.stop-card` é reuso proposital via seletor combinado com `.lead-card`/
     `.row-card` (DRY correto, não duplicação). `*` só existe 1× hoje (achado batia com estado
     anterior, já não existe mais). Juntar essas seria mexer em pixel sem necessidade.

6. **`.btn-danger` morto apagado** (1ª definição `#b62f2f`, nunca vencia). Ficou 1 definição só
   (`var(--danger)`). **`.toast.error`** trocou `#a92e2e` fixo por
   `color-mix(in srgb, var(--danger) 68%, var(--navy))` — mistura com `--navy` (âncora escura
   nos dois temas) porque `--danger` sozinho no tema escuro é CLARO (rosa) e quebraria o
   contraste do texto branco do toast. Esse é o único dos "3 vermelhos" que muda de tom (~1
   passo mais escuro/acastanhado que o `#a92e2e` original) — é o preço de convergir 3 hex soltos
   pra 1 token; ainda lê como "vermelho de erro" nos dois temas.

7. **Token `--cta`** criado (`--cta-from`/`--cta-to`/`--cta` no `:root`). Trocado em `.rp2-cta`,
   `.center-arrow-glyph` e no gradiente SVG do botão play/transmux (`routePlayGradient` — os
   `<stop>` agora usam classe `.cta-gradient-from/-to` com `stop-color:var(...)`, porque atributo
   de apresentação SVG não aceita `var()`). GPS/stop gradients do mesmo botão (azul/vermelho) NÃO
   mexi — fora do escopo do --cta (só a dupla verde-esmeralda), risco desnecessário numa peça
   ilustrativa delicada.

8. **Token `--info`** criado (`#0865df`, mesmo valor nos dois temas — não inventei tom pro dark,
   já não existia). Aplicado em `.rp2-mode-icon--manual`.

9. **Switch unificado — só que a premissa do achado estava desatualizada.** Conferi o código:
   `.toggle` (38×22) tem **zero usos** em `app.js` hoje (nem em Ajustes, nem em lugar nenhum);
   `.module-switch` (46×27) já é o ÚNICO switch vivo, usado em Ajustes/Financeiro/Avançado/
   "salvar como minha rota" — todos já do MESMO tamanho. Migrar `module-switch` pra pegar o
   tamanho do `.toggle` teria MUDADO pixel (46×27 → 38×22) em 3 telas sem permissão pra isso.
   Em vez disso apaguei o `.toggle`/`.toggle i`/`.toggle.on` morto do CSS — "um só componente"
   alcançado sem mexer em nenhum pixel visível.

10. **Pendência bloqueante × informativa.** `pendingIsBlocking(key)` (End/Dia = bloqueante) e
    `pendingHasBlocking(list)` viraram a fonte única: `has-pending` (card/avatar vermelho na
    lista) e `client-head-pending` (avatar vermelho no editor) só disparam por End/Dia. Chips
    `.client-missing b` ganharam `.is-neutral` (cor `--muted`, fundo `--surface-2`) para tudo que
    não é End/Dia. **Extensão além do pedido literal:** o dono só falou de Tel/Dup viraram
    neutros; eu também deixei "Pag" (pagamento pendente) neutro, seguindo a regra geral
    ("vermelho SÓ para End e Dia") e o pedido de "separar em bloqueante × informativo" (partição
    completa, não só os 2 exemplos citados). Confirmado no aparelho com dados reais: cards com
    só Tel/Dup ficam brancos com chip cinza; cards com End/Dia ficam com borda+avatar vermelho e
    chip vermelho só nesses dois, Dup ao lado fica cinza. **Se "Pag" vermelho for intencional,
    avisar que reverto** (é `pendingIsBlocking` que precisa voltar a incluir "Pag").
    `client-part-pending`/`client-field-pending`/`client-address-duplicate` (dentro do formulário
    de edição, por campo) ficaram INTOCADOS — não fazem parte do "card de cliente", que era o
    escopo explícito da decisão.

11. **FAB não cobre mais o último card.** `.content` (mobile) foi de `82px` pra `128px` de
    padding-bottom — o FAB (bottom:66px + 44px de altura = topo a 110px do rodapé) tinha 28px
    de sobra cobrindo conteúdo; 128px dá ~18px de folga. Achei e também corrigi o MESMO bug no
    breakpoint desktop (`@media min-width:820px`, FAB bottom:28px/44px = topo a 72px, mas o
    padding lá era só 28px — praticamente o FAB inteiro cobria o conteúdo); subi pra 84px.
    Confirmado no aparelho: rolei os 213 clientes até o fim, último card ("Bem-te-fiz / Bete")
    aparece inteiro, FAB não encosta.

12. **Marca "» HBX" centralizada — precisou de 2 tentativas.** 1ª tentativa (espelhar a largura
    do spacer pela toolbar via JS) **quebrou**: nesse aparelho a toolbar (chips vivos + tema +
    atualizar) ocupa quase metade da largura útil da topbar, e reservar a mesma largura dos DOIS
    lados sufocou a coluna central a ~12px — "HBX" virou só "H" (capturado em screenshot, revertido
    antes de seguir). Solução final: `.brand` saiu do grid (`position:absolute`, centralizado
    pelo próprio `.topbar`, com leve offset `-30px` porque a toolbar pesa mais à direita — testado
    visualmente, sem fórmula exata) e ganhou `max-width`+ellipsis (`.brand-copy`/`strong`) pra
    nome de empresa comprido truncar em vez de vazar por baixo dos ícones. **Testado no aparelho
    com nome curto ("HBX", vazio) e nome longo forçado temporariamente** ("Distribuidora Agua
    Mineral Santa Clara Ltda" — 1ª versão do fix ainda vazava atrás dos chips, achei e corrigi
    antes de fechar o item); nome revertido pro estado original ao final (nenhum dado de teste
    ficou no cadastro).

13. **4 modais bottom-sheet (new-product/new-delivery/new-oneoff/client-edit) — passada de olho.**
    3 primeiros já seguiam o padrão (avatar+h2+subtitle opcional+close, CTA `btn btn-primary
    btn-block`). Única divergência achada: o botão "Salvar cliente" do editor de cliente
    (`client-editor-modal`, usado por Novo/Editar) tinha `class="btn btn-primary"` sem
    `btn-block` — funcionava igual (grid do `.client-primary-actions` já estica), mas não
    declarava o contrato. Adicionei `btn-block` — zero pixel, só consistência de classe.
    Confirmado no aparelho (Editar Wellen): "Salvar cliente" continua largura total, idêntico.

## Fora do escopo, ANOTADO (não mexi)

- **`client-part-pending`/`client-field-pending`/`client-address-duplicate`** (item 10): pintura
  interna do formulário por campo — fora do "card de cliente", deixei como estava.
- **GPS/stop gradients do botão transmux** (item 7): não fazem parte do par --cta, não toquei.
- **`.content`/`.sheet`/`.stop-card`/`*`** (item 5): reavaliados e classificados como reuso
  legítimo, não bug — decidido não juntar (ver item 5 acima).
- **Item "Pag" vira informativo** (item 10): extensão minha da regra do dono, além do que foi
  perguntado — avisar se for pra reverter só esse pedaço.

## Verificação

- `node --check app.js`: **passou**.
- Brace-balance do CSS: **ok** (script Node dedicado, profundidade final 0).
- Rebuild + instalação no moto g15 (serial `ZF5255SMWF`), 4 ciclos de build/instalação durante o
  sprint (2 pra achar/corrigir o bug da marca, 1 pra corrigir o overflow do nome comprido, 1 final).
- Telas conferidas visualmente no aparelho: Rota (topbar+FAB+play), Clientes (pendência End/Dia
  vermelha vs Tel/Dup/Pag neutro, em ~15 cards reais incluindo os 213 rolados até o fim), editor
  "Editar cliente" (cabeçalho pendente, CTA btn-block, campos pendentes intocados), Produtos,
  "Editar produto" (btn-danger consolidado), Ajustes (module-switch intacto, nome de empresa
  curto/longo), popup "Montar Rota", "Rotas Salvas" (botão editar verde renomeado), editor de
  rota salva (referência, intocado), "Novo cliente" (form completo + teclado + Enter avança
  Nome→Telefone com máscara). Chegada (offline/simples/completa) **pulada** — sem rota ativa no
  aparelho, conforme permitido pela tarefa.
- **Bug pego e corrigido durante o próprio sprint** (não existia antes, foi introduzido e revertido
  na mesma sessão): a 1ª tentativa de centralizar a marca cortava o nome "HBX" pra "H" sozinho;
  a 2ª tentativa (já com position:absolute) ainda vazava texto atrás dos ícones com nome de
  empresa comprido. Nenhuma das duas foi ao commit — só a versão final testada.

## Commit

`fix(apk): S1 limpeza+moldura unica` — hash preenchido após o commit (ver mensagem final).
