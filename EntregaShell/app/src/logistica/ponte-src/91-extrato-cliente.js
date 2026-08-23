  /* ==========================================================================
     EXTRATO DO CLIENTE — A TELA DO PAINEL, DENTRO DO APARELHO.

     Ordem do dono (23/08, com a foto do painel na mão e o endereço junto:
     *"eu quero essa tela no extrato, essas informações"* —
     https://hbxsystem.com.br/financeiro).

     🔴 MESMA PORTA, MESMA CONTA. O painel lê
     `GET /financeiro-tenant/clientes/:id/extrato`; o celular passa a ler a
     MESMA. Não inventei porta nem soma nova: duas contas de dívida é como o
     computador e o celular passam a discordar na frente do cliente, e aí
     nenhum dos dois vale. O que muda é só o TAMANHO da folha — o painel tem
     mesa, aqui é portão com rolagem.

     🔴 ELA É @Admin NO SERVIDOR (Lei do Vendedor: só quem responde pela
     empresa vê valor). Motorista comum leva 403 — e 403 aqui NÃO é erro de
     tela: é "esta pessoa não vê isso". Nesse caso o app cai, calado, no
     extrato simples que já existia (a lista do `devedores` do resumo), que é
     exatamente o que ele podia ver antes. Rede no chão é outra coisa: essa
     tem aviso e "Tentar de novo".

     O que a tela mostra, na ordem do desenho do dono:
       nome + selo · TOTAL EM ABERTO + nº de cobranças + % da carteira ·
       última origem/competência/meio · origem do saldo (barra) ·
       cobranças, cada uma abrindo TODO o registro dela (e as entregas que a
       compõem) · "Marcar como pago" em dois toques.
     ========================================================================== */

  /* O VOCABULÁRIO É O MESMO DO PAINEL, palavra por palavra (page.client.tsx do
     /financeiro). Traduzir diferente dos dois lados é o mesmo dado com dois
     nomes — o dono lê "Avulsa" no computador e "Uma vez" no celular e acha que
     são cobranças diferentes. */
  const EXT_ORIGEM = {
    logistica_entrega: ['Entrega', 'entrega'],
    logistica_fechamento: ['Fatura mensal', 'fatura'],
    vendas_fechamento: ['Venda', 'venda'],
  };
  const EXT_CICLO = { ONCE: 'Avulsa (uma vez)', MONTHLY: 'Mensal', ANNUAL: 'Anual' };
  const EXT_FORMA = {
    MANUAL: 'Manual (na mão)', PIX: 'Pix', CARD: 'Cartão', BOLETO: 'Boleto', BONUS: 'Bônus',
  };
  const EXT_RECEBIDO = { pix: 'Pix', dinheiro: 'Dinheiro', cartao: 'Cartão', fiado: 'Marcado' };
  const EXT_COMBINADO = {
    aberto: 'Em aberto (paga depois)', na_hora: 'Paga na hora',
    pendura: 'Pendurado (fecha no dia combinado)', mensal: 'Fatura mensal',
  };
  const EXT_ETAPA = {
    in_progress: 'Em aberto', paid: 'Paga', cancelled: 'Cancelada', finalized: 'Finalizada',
  };
  const EXT_ENTREGA = {
    agendada: 'Agendada', em_rota: 'Em rota', entregue: 'Entregue', cancelada: 'Cancelada',
  };
  const EXT_DESFECHO = {
    lancada: 'Lançada', aguardando_fechamento: 'Aguardando fechamento',
    nao_contabilizado: 'Não contabilizado', isenta: 'Isenta', falhou: 'Falhou',
  };
  /* As chaves do `providerPayload` que já ganharam campo com nome de gente. O
     resto do payload vai no fim, cru — é registro, e registro não se esconde. */
  const EXT_PAYLOAD_MOSTRADO = ['source', 'entregaId', 'entregaIds', 'forma', 'pagoNaHora', 'receiptMethod', 'mesRef'];

  const extRotulo = (mapa, v) => {
    const k = String(v == null ? '' : v).trim();
    if (!k) return '';
    return mapa[k] || k;
  };
  const extOrigem = (m) => (EXT_ORIGEM[String(m || '')] || ['—', 'outra'])[0];
  const extOrigemCls = (m) => (EXT_ORIGEM[String(m || '')] || ['—', 'outra'])[1];
  /** A situação da cobrança, com a MESMA régua do painel (pending = Em aberto). */
  const extSituacao = (s) => {
    const v = String(s || '').toLowerCase();
    if (v === 'approved' || v === 'paid') return ['Pago', 'paga'];
    if (v === 'pending') return ['Em aberto', 'aberta'];
    if (v === 'cancelled' || v === 'failed') return ['Cancelada', 'mute'];
    if (v === 'refunded' || v === 'partially_refunded') return ['Estornada', 'mute'];
    return [s ? String(s) : '—', 'mute'];
  };
  /* Data COM hora no relógio da OPERAÇÃO (São Paulo), não no do aparelho — a
     mesma lei do `quandoDoExtrato` lá do núcleo: extrato é documento, e a mesma
     cobrança tem que carimbar a mesma hora em qualquer celular. */
  const extDataHora = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (!isFinite(d.getTime())) return '';
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(d).replace(', ', ' ');
  };
  const extData = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (!isFinite(d.getTime())) return '';
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
    }).format(d);
  };
  const extTexto = (v) => {
    if (v == null) return '';
    if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
    if (typeof v === 'object') { try { return JSON.stringify(v); } catch (e) { return ''; } }
    return String(v).trim();
  };
  /** Um campo do registro. SEM VALOR NÃO EXISTE — nada de "—" por toda parte. */
  const extCampo = (rot, val) => (val
    ? `<div class="ext-campo"><span>${esc(rot)}</span><span>${esc(val)}</span></div>` : '');

  /* O ESTADO DA FOLHA ABERTA. Mora aqui e não no DOM porque abrir uma cobrança,
     armar o "Marcar como pago" e repintar são a MESMA folha se redesenhando —
     ler o estado do HTML que eu mesmo acabei de escrever é o caminho curto pra
     duas verdades. `armada` é o 1º toque do pagamento (o 2º confirma). */
  let extrato = null;   // { id, nome, dados, aberta, armada, erro, carregando, pagando }

  /** A pessoa é a mesma? (evita repintar por cima de um extrato já trocado) */
  const extratoDe = (id) => extrato && extrato.id === String(id || '');

  /* ------------------------------------------------------------------------
     A ABERTURA. Um toque no devedor busca o extrato REAL; enquanto ele não
     chega, o portão já está na tela dizendo que está buscando — toque sem
     resposta visível é toque que o dedo repete.
     ------------------------------------------------------------------------ */
  function abrirExtratoCliente(id, nome) {
    const alvo = String(id || '');
    if (!alvo || !temPonte()) return;
    extrato = { id: alvo, nome: String(nome || ''), dados: null, aberta: '', armada: '', erro: '', carregando: true, pagando: false };
    pintarExtratoCliente();
    carregarExtratoCliente();
  }

  async function carregarExtratoCliente() {
    if (!extrato) return;
    const alvo = extrato.id;
    let resposta = null;
    try {
      resposta = await window.API.get(`/financeiro-tenant/clientes/${encodeURIComponent(alvo)}/extrato`);
    } catch (e) {
      if (!extratoDe(alvo)) return;
      /* 🔴 403 NÃO É FALHA — É PERMISSÃO. O extrato completo é do responsável
         pela empresa; o motorista continua com o resumo simples de antes, sem
         portão de erro no meio do caminho dele (ele não pediu nada de errado). */
      const st = Number(e && e.status) || 0;
      if (st === 401 || st === 403) {
        extrato = null;
        return void extratoFinanceiro('devedor', alvo, true);
      }
      extrato.carregando = false;
      extrato.erro = (e && e.message) ? String(e.message) : 'Não consegui buscar o extrato agora.';
      return pintarExtratoCliente();
    }
    if (!extratoDe(alvo)) return;
    extrato.carregando = false;
    extrato.erro = '';
    extrato.dados = resposta || null;
    const lista = (resposta && Array.isArray(resposta.charges)) ? resposta.charges : [];
    // A 1ª cobrança já nasce aberta — é a mesma escolha do painel, e é a que o
    // dono quer ver: a mais recente, inteira, sem um toque a mais.
    extrato.aberta = lista.length ? String(lista[0].id) : '';
    pintarExtratoCliente();
  }

  /* ------------------------------------------------------------------------
     O DESENHO. Tudo o que entra aqui é dado do servidor — pedaço sem fonte
     some (a mesma Lei do IF do resto da tela de dinheiro).
     ------------------------------------------------------------------------ */
  function pintarExtratoCliente() {
    if (!extrato || typeof window.portao !== 'function') return;

    if (extrato.carregando) {
      return window.portao({
        tom: 'info', ico: 'wallet', titulo: 'Extrato do cliente',
        sub: 'Buscando as cobranças desta pessoa…',
        acoes: [['Fechar', 'principal', true, 'extrato-fechar']],
      });
    }
    if (extrato.erro) {
      return window.portao({
        tom: 'alerta', ico: 'wallet', titulo: 'Extrato do cliente',
        sub: esc(extrato.erro),
        acoes: [['Tentar de novo', 'principal', false, 'extrato-recarregar'], ['Fechar', '', true, 'extrato-fechar']],
      });
    }

    const d = extrato.dados || {};
    const charges = Array.isArray(d.charges) ? d.charges : [];
    const nome = String(d.nome || extrato.nome || 'Cliente');
    const saldo = Number(d.saldoAberto) || 0;
    const abertas = charges.filter((c) => String(c && c.status).toLowerCase() === 'pending');

    /* O ANEL DA CARTEIRA. O denominador é o "Em aberto" que ESTA tela já mostra
       (o mapa `devedores` do resumo do dia) — pergunta respondida: quanto do
       que me devem é esta pessoa. Sem o mapa carregado o anel some inteiro:
       porcentagem sem denominador é número bonito sem conta atrás. */
    const mapa = devedoresCrus || null;
    const totalCarteira = mapa
      ? Object.keys(mapa).reduce((s, k) => s + (Number(mapa[k]) || 0), 0) / 100
      : 0;
    const pct = (totalCarteira > 0 && saldo > 0) ? Math.min(100, (saldo / totalCarteira) * 100) : -1;

    // A última cobrança é a 1ª da lista (o servidor manda por vencimento desc).
    const ultima = charges[0] || null;

    /* ORIGEM DO SALDO — de onde vem o que está EM ABERTO (só pending entra:
       cobrança paga não é saldo). Uma faixa por origem, com o peso de cada uma. */
    const porOrigem = new Map();
    abertas.forEach((c) => {
      const chave = String(c.sourceModule || '');
      porOrigem.set(chave, (porOrigem.get(chave) || 0) + (Number(c.amount) || 0));
    });
    const somaOrigens = [...porOrigem.values()].reduce((s, v) => s + v, 0);
    const origens = [...porOrigem.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([m, v]) => ({
        rotulo: extOrigem(m), cls: extOrigemCls(m), valor: v,
        pct: somaOrigens > 0 ? (v / somaOrigens) * 100 : 0,
      }));

    const cabecalho = `<div class="ext-cab">
      <span class="ava">${esc(iniciais(nome))}</span>
      <span><strong>${esc(nome)}</strong><small>Extrato financeiro</small></span>
      <span class="pill ${saldo > 0 ? 'amber' : 'mute'}">${saldo > 0 ? 'Em aberto' : 'Sem saldo'}</span>
    </div>`;

    const anel = pct >= 0 ? `<span class="ext-anel">
      <svg viewBox="0 0 44 44" aria-hidden="true">
        <circle class="trilho" cx="22" cy="22" r="18" pathLength="100"></circle>
        <circle class="valor" cx="22" cy="22" r="18" pathLength="100" stroke-dasharray="${pct.toFixed(1)} 100"></circle>
      </svg>
      <span><b>${esc(pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 }))}%</b><small>carteira</small></span>
    </span>` : '';

    const saldoBloco = `<div class="box ext-saldo">
      <span class="ext-saldo-v">
        <small>Total em aberto</small>
        <b>${esc(dinheiro(saldo))}</b>
        <span>${abertas.length === 1 ? '1 cobrança em aberto' : `${abertas.length} cobranças em aberto`}</span>
      </span>
      ${anel}
    </div>`;

    const minis = ultima ? `<div class="ext-minis">
      <div><small>Última origem</small><strong>${esc(extOrigem(ultima.sourceModule))}</strong></div>
      <div><small>Última competência</small><strong>${esc(ultima.competence || '—')}</strong></div>
      <div><small>Último meio</small><strong>${esc(extRotulo(EXT_FORMA, ultima.paymentMethod) || '—')}</strong></div>
    </div>` : '';

    const origemBloco = origens.length ? `<div class="box ext-origem">
      <header><strong>Origem do saldo</strong><span>${esc(dinheiro(somaOrigens))}</span></header>
      <div class="ext-barra">
        ${origens.map((o) => `<span class="is-${o.cls}" style="width:${o.pct.toFixed(1)}%"></span>`).join('')}
      </div>
      <div class="ext-legenda">
        ${origens.map((o) => `<span><i class="is-${o.cls}"></i>${esc(o.rotulo)} ${esc(o.pct.toLocaleString('pt-BR', { maximumFractionDigits: 0 }))}%</span>`).join('')}
      </div>
    </div>` : '';

    const cobrancas = charges.length
      ? charges.map((c) => desenharCobranca(c)).join('')
      : '<span class="sub">Sem cobranças para este cliente.</span>';

    const corpo = cabecalho + saldoBloco + minis + origemBloco
      /* O `style="margin-top:11px"` que estava aqui era 1 px a menos que o
         `margin:12px 2px 5px` que a própria `.grupo` já tem — diferença
         invisível, e o preço dela era uma violação R7 no check-pele por causa
         de nada. Regra da casa: espaçamento sai da classe. */
      + `<div class="grupo">Cobranças<span class="ext-conta">${charges.length === 1 ? '1 item' : `${charges.length} itens`}</span></div>`
      + `<div class="ext-cobs">${cobrancas}</div>`;

    window.portao({
      tom: 'info', ico: 'wallet', titulo: 'Extrato do cliente',
      sub: 'O mesmo extrato do computador — cobrança por cobrança.',
      corpo,
      acoes: [['Fechar', 'principal', true, 'extrato-fechar']],
    });
  }

  /** Uma cobrança: a linha que se toca e, aberta, TODO o registro dela. */
  function desenharCobranca(c) {
    if (!c || !c.id) return '';
    const id = String(c.id);
    const aberta = extrato && extrato.aberta === id;
    const [rotuloSituacao, clsSituacao] = extSituacao(c.status);
    const vence = c.dueDate ? `vence ${extData(c.dueDate)}` : 'sem vencimento';
    const det = (c.detalhes && typeof c.detalhes === 'object') ? c.detalhes : {};

    const linha = `<button class="ext-cob-topo" data-acao="extrato-cobranca" data-cobranca="${esc(id)}">
      <span class="ext-cob-ico is-${extOrigemCls(c.sourceModule)}">${ic('box', 14)}</span>
      <span class="ext-cob-copy">
        <strong>${esc(c.description || 'Cobrança')}</strong>
        <small>${esc(extOrigem(c.sourceModule))} · ${esc(vence)}</small>
      </span>
      <span class="ext-cob-val">
        <strong>${esc(dinheiro(Number(c.amount) || 0))}</strong>
        <small class="ext-st ${clsSituacao}">${esc(rotuloSituacao)}</small>
      </span>
      <span class="ext-seta">${aberta ? '▾' : '▸'}</span>
    </button>`;

    if (!aberta) return `<article class="ext-cob">${linha}</article>`;

    const extras = Object.keys(det)
      .filter((k) => EXT_PAYLOAD_MOSTRADO.indexOf(k) < 0 && extTexto(det[k]))
      .map((k) => extCampo(k, extTexto(det[k]))).join('');

    const bloco = `<div class="ext-det">
      <div class="ext-det-t">Cobrança</div>
      ${extCampo('Valor', `${dinheiro(Number(c.amount) || 0)} (${c.currency || 'BRL'})`)}
      ${extCampo('Situação', rotuloSituacao)}
      ${extCampo('Etapa', extRotulo(EXT_ETAPA, c.lifecycle))}
      ${extCampo('Origem', extOrigem(c.sourceModule))}
      ${extCampo('Tipo de cobrança', extRotulo(EXT_CICLO, c.billingCycle))}
      ${extCampo('Forma prevista', extRotulo(EXT_FORMA, c.paymentMethod))}
      ${extCampo('Combinado com o cliente', extRotulo(EXT_COMBINADO, extTexto(det.forma)))}
      ${extCampo('Como foi recebido', extRotulo(EXT_RECEBIDO, extTexto(det.receiptMethod)))}
      ${extCampo('Pago na hora', typeof det.pagoNaHora === 'boolean' ? (det.pagoNaHora ? 'Sim' : 'Não') : '')}
      ${extCampo('Mês de referência', extTexto(det.mesRef) || c.competence || '')}
      ${extCampo('Criada em', extDataHora(c.createdAt))}
      ${extCampo('Vencimento', extDataHora(c.dueDate))}
      ${extCampo('Paga em', extDataHora(c.paidAt))}
      ${extCampo('Última alteração', extDataHora(c.updatedAt))}
      ${extCampo('Lançada por', c.criadoPor || (c.criadoPorUserId ? `Usuário #${c.criadoPorUserId}` : ''))}
      ${extCampo('Estornada em', extDataHora(c.refundedAt))}
      ${extCampo('Valor estornado', Number(c.refundAmount) > 0 ? dinheiro(Number(c.refundAmount)) : '')}
      ${extCampo('Último retorno do banco', extDataHora(c.lastWebhookAt))}
      ${desenharEntregasDaCobranca(c)}
      <div class="ext-det-t">Registro</div>
      ${extCampo('ID da cobrança', c.id)}
      ${extCampo('Referência externa', c.externalReference)}
      ${extCampo('ID da entrega', c.entregaId)}
      ${extCampo('Lançamento no caixa', c.ledgerEntryId)}
      ${extCampo('Pagamento (Mercado Pago)', c.mpPaymentId)}
      ${extCampo('Preferência (Mercado Pago)', c.mpPreferenceId)}
      ${extCampo('Pedido (Mercado Pago)', c.mpMerchantOrderId)}
      ${extCampo('Link de pagamento', c.paymentUrl)}
      ${extCampo('Comprovante Pix', c.pixTicketUrl)}
      ${extras}
      ${desenharBotaoPagar(c)}
    </div>`;
    return `<article class="ext-cob aberta">${linha}${bloco}</article>`;
  }

  /* As entregas que a cobrança soma. Avulsa tem uma; fatura mensal tem todas as
     do fechamento. Sem entrega guardada, o bloco inteiro some. */
  function desenharEntregasDaCobranca(c) {
    const entregas = Array.isArray(c.entregas) ? c.entregas : [];
    if (!entregas.length) return '';
    const total = Number(c.entregasTotal) || entregas.length;
    const titulo = total > 1 ? `Entregas somadas nesta cobrança (${total})` : 'Entrega desta cobrança';
    const linhas = entregas.map((e) => {
      const quando = extDataHora(e.data) || '';
      const oque = [e.produto || '', e.quantidade ? `${e.quantidade}×` : ''].filter(Boolean).join(' ');
      const recebido = extRotulo(EXT_RECEBIDO, e.receiptMethod)
        || (e.recebidoNaHora === false ? 'Não recebido' : '');
      const rodape = [extRotulo(EXT_ENTREGA, e.status), recebido, extRotulo(EXT_DESFECHO, e.cobrancaOutcome),
        e.entregador ? `por ${e.entregador}` : ''].filter(Boolean).join(' · ');
      return `<div class="ext-entrega">
        <div class="ext-campo"><span>${esc(quando || 'Sem data')}</span><span>${esc(dinheiro(Number(e.valor) || 0))}</span></div>
        ${oque ? `<div class="ext-entrega-sub">${esc(oque)}</div>` : ''}
        ${e.local ? `<div class="ext-entrega-sub">${esc(e.local)}</div>` : ''}
        ${e.observacao ? `<div class="ext-entrega-sub">${esc(e.observacao)}</div>` : ''}
        ${rodape ? `<div class="ext-entrega-sub">${esc(rodape)}</div>` : ''}
      </div>`;
    }).join('');
    const faltando = total > entregas.length
      ? `<div class="ext-entrega-sub">${total - entregas.length} entrega(s) desta cobrança já não existem mais no cadastro.</div>`
      : '';
    return `<div class="ext-det-t">${esc(titulo)}</div>${linhas}${faltando}`;
  }

  /* 🔴 BAIXA MANUAL EM DOIS TOQUES — o mesmo travamento do painel. O 1º toque
     ARMA (o botão troca de rótulo e de cor), o 2º confirma. Dinheiro não se
     baixa por esbarrão de dedo em tela de celular, e o servidor ainda faz claim
     atômico por cima (dois toques = uma baixa, nunca duas). */
  function desenharBotaoPagar(c) {
    if (String(c.status || '').toLowerCase() !== 'pending') return '';
    const id = String(c.id);
    const armada = extrato && extrato.armada === id;
    const pagando = extrato && extrato.pagando === id;
    const rot = pagando ? 'Baixando…' : (armada ? 'Confirmar pagamento' : 'Marcar como pago');
    return `<button class="ext-pagar${armada ? ' armada' : ''}" data-acao="extrato-quitar" data-cobranca="${esc(id)}">
      ${ic('check', 15)}<b>${rot}</b></button>`;
  }

  /* ------------------------------------------------------------------------
     OS TRÊS TOQUES DA FOLHA.
     ------------------------------------------------------------------------ */
  /** abre/fecha uma cobrança (uma por vez: a folha é estreita) */
  function alternarCobrancaDoExtrato(id) {
    if (!extrato || !extrato.dados) return;
    const alvo = String(id || '');
    extrato.aberta = extrato.aberta === alvo ? '' : alvo;
    extrato.armada = '';   // trocar de cobrança DESARMA o pagamento da outra
    pintarExtratoCliente();
  }

  function recarregarExtratoCliente() {
    if (!extrato) return;
    extrato.carregando = true;
    extrato.erro = '';
    pintarExtratoCliente();
    carregarExtratoCliente();
  }

  function fecharExtratoCliente() {
    extrato = null;
  }

  async function quitarDoExtrato(id) {
    if (!extrato || !extrato.dados) return;
    const alvo = String(id || '');
    if (!alvo || extrato.pagando) return;
    if (extrato.armada !== alvo) {            // 1º toque: arma e espera o 2º
      extrato.armada = alvo;
      return pintarExtratoCliente();
    }
    extrato.pagando = alvo;
    pintarExtratoCliente();
    const doExtrato = extrato.id;
    try {
      await window.API.post(`/financeiro-tenant/charges/${encodeURIComponent(alvo)}/quitar`, {});
    } catch (e) {
      if (!extratoDe(doExtrato)) return;
      extrato.pagando = false;
      extrato.armada = '';
      extrato.erro = (e && e.message) ? String(e.message) : 'Não consegui dar baixa agora.';
      return pintarExtratoCliente();
    }
    if (!extratoDe(doExtrato)) return;
    extrato.pagando = false;
    extrato.armada = '';
    /* O número da tela de trás muda junto: quem pagou saiu do "Em aberto". Sem
       isto o portão diria "Pago" com o cartão atrás ainda cobrando a pessoa. */
    carregarFinanceiro();
    recarregarExtratoCliente();
  }
