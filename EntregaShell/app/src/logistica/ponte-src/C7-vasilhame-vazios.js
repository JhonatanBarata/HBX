  /* ------------------------------------------------------------------------
     C7 — OS VAZIOS DA PORTA (VASILHAME, onda 2 — 17/08)

     A onda 1 pôs o casco no cadastro: o dono injeta e devolve garrafão na ficha
     do cliente, na mão. Isto aqui é a outra metade — o único lugar onde o
     número existe DE VERDADE é a porta, no instante em que o motorista pega o
     vazio da mão do cliente. Sem este campo o saldo é um caderno que ninguém
     preenche; com ele o "Patrimônio na rua" se mantém sozinho.

     ── A LINHA SÓ EXISTE PRA QUEM TEM CASCO ────────────────────────────────
     `produto.possuiVasilhame` (que a rota passou a mandar nesta onda) decide.
     Quem vende água em fardo, salgado ou serviço nunca vê a pergunta aparecer
     — mesma lei do bloco da ficha: recurso desligado não ocupa tela de ninguém.

     ── O QUE VIAJA NO DESFECHO ─────────────────────────────────────────────
     SÓ `{ id, vasilhameRetornado }`, e nunca a quantidade entregue. É de
     propósito: `qtdEntregue` no payload faz o servidor RECALCULAR o valor da
     entrega pela soma dos itens (ver `mexeuNoDinheiro` em logistica.service.ts),
     e contar vazio não pode mexer no que o cliente paga. Casco é patrimônio,
     não preço.

     ── AUSENTE ≠ ZERO ──────────────────────────────────────────────────────
     O campo só vai pro servidor pra item COM casco. Item sem casco não manda
     nada, e o APK velho (que nem tem esta tela) não manda nada — nos dois casos
     o saldo NÃO se mexe. Zero é uma resposta ("conferi, não voltou nenhum");
     ausência é silêncio, e silêncio não move patrimônio.

     ── POR QUE ARQUIVO NOVO, E POR QUE "C7" ────────────────────────────────
     `D0-porta-entrega.js` está com 987 linhas e o teto da casa é 1.000 (regra
     do dono). O precedente de ouvinte próprio é o `C5-busca-painel.js`, logo
     acima na costura: chaves que não se cruzam, mesmo comportamento.

     🔴 O NOME É "C7" E NÃO "D5", E ISSO NÃO É ESTÉTICA — foi medido. A costura
     concatena na ordem do NOME, e o `D0-porta-entrega.js` TERMINA fechando o
     IIFE (`})();`). Um arquivo depois dele cai FORA do escopo: as funções viram
     globais (o D0 até as enxerga), mas nada do lado de dentro existe pra elas —
     `temPonte`, `aberta` e `repintarFolha` viravam `is not defined` e o + do
     contador não contava. A prova (`scripts/prova-vasilhame-vazios.js`) pegou
     em 8/24. LEI: quem precisa do escopo da porta entra ANTES do D0.

     As funções são `function` (hoisted) porque o D0 — que roda depois — chama
     três delas: `slotVazios`, `zerarVazios` e `itensDoDesfecho`.
     ------------------------------------------------------------------------ */

  /** id do EntregaItem → quantos vazios o dedo contou nesta parada. */
  const vaziosPorItem = new Map();

  /** o produto empresta embalagem? só ele ganha a segunda linha na folha. */
  function itemTemCasco(it) {
    return !!(it && it.produto && it.produto.possuiVasilhame);
  }

  /**
   * Quantos vazios estão marcados AGORA neste item.
   *
   * A memória do dedo vence o servidor: numa parada reaberta o motorista pode
   * estar corrigindo justamente o número que veio de lá. Sem nada nos dois
   * lados, começa em 0 — o campo pergunta "quantos voltaram", e a resposta
   * honesta antes de contar é nenhum.
   */
  function vaziosDoItem(it) {
    const id = String((it && it.id) || '');
    if (!id) return 0;
    if (vaziosPorItem.has(id)) return vaziosPorItem.get(id);
    const gravado = Number(it && it.vasilhameRetornado);
    return Number.isFinite(gravado) && gravado >= 0 ? Math.trunc(gravado) : 0;
  }

  /** o 5º slot da linha da folha: '' quando o produto não tem casco. */
  function slotVazios(it) {
    return itemTemCasco(it) ? String(vaziosDoItem(it)) : '';
  }

  /**
   * Zera a contagem. Chamado em `abrirParada`: a contagem é DESTA porta, e um
   * "2 vazios" que sobrasse da parada anterior viraria patrimônio do cliente
   * errado — o mesmo defeito do `motivo` que ficava marcado entre paradas.
   */
  function zerarVazios() {
    vaziosPorItem.clear();
  }

  /** − e + da linha dos vazios. Piso 0; teto = o que o servidor aceita (9999). */
  function mexerVazios(id, passo) {
    const chave = String(id || '');
    if (!chave || !aberta) return;
    const itens = Array.isArray(aberta.item && aberta.item.itens) ? aberta.item.itens : [];
    const alvo = itens.find((it) => String(it && it.id) === chave);
    if (!alvo || !itemTemCasco(alvo)) return;
    const atual = vaziosDoItem(alvo);
    vaziosPorItem.set(chave, Math.max(0, Math.min(9999, atual + passo)));
    repintarFolha();
  }

  /**
   * O pedaço `itens` do desfecho. Só item com casco, e só o casco — ver o
   * cabeçalho deste arquivo: quantidade no payload mexeria no dinheiro.
   */
  function itensDoDesfecho(item) {
    const itens = Array.isArray(item && item.itens) ? item.itens : [];
    return itens
      .filter((it) => itemTemCasco(it) && String((it && it.id) || ''))
      .map((it) => ({ id: String(it.id), vasilhameRetornado: vaziosDoItem(it) }));
  }

  /* Ouvinte próprio (precedente do C5, ver cabeçalho). Roda ANTES do mapa do
     D0 na ordem da costura e não disputa chave com ninguém — `vazio-mais` e
     `vazio-menos` não existem em lugar nenhum além daqui. */
  document.addEventListener('click', (ev) => {
    const alvo = ev.target && ev.target.closest ? ev.target.closest('[data-acao]') : null;
    if (!alvo || !temPonte()) return;
    const chave = alvo.dataset.acao;
    if (chave === 'vazio-mais') return mexerVazios(alvo.dataset.item, 1);
    if (chave === 'vazio-menos') return mexerVazios(alvo.dataset.item, -1);
  });
