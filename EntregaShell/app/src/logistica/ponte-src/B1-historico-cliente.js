  /* ------------------------------------------------------------------------
     HISTÓRICO OPERACIONAL DO CLIENTE

     O financeiro é só uma parte da ficha. Esta folha é o registro da VISITA:
     entregue, pago ou sem atendimento, com data e hora de São Paulo, itens e
     motivo. A API já existia e já está na allowlist do APK; a fusão só havia
     deixado o chamador de fora da pele nova.
     ------------------------------------------------------------------------ */
  function quandoDoHistorico(iso) {
    const ymd = diaEmSp(iso);
    if (!ymd) return '';
    const hm = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso));
    return `${ymd.slice(8, 10)}/${ymd.slice(5, 7)} · ${hm}`;
  }

  function leituraDoHistorico(linha) {
    const tipo = String(linha && linha.tipo || '');
    if (tipo === 'pago') return { titulo: 'Entregue e pago', icone: 'check', tom: 'lime' };
    if (tipo === 'sem_atendimento') return { titulo: 'Sem atendimento', icone: 'alert', tom: '' };
    return { titulo: 'Entregue, a receber', icone: 'route', tom: '' };
  }

  function linhaDoHistorico(linha) {
    const leitura = leituraDoHistorico(linha);
    const metodo = { pix: 'Pix', dinheiro: 'Dinheiro', cartao: 'Cartão' }[
      String(linha && linha.receiptMethod || '').toLowerCase()
    ] || '';
    const detalhes = [
      quandoDoHistorico(linha && linha.createdAt), linha && linha.itensResumo,
      metodo, linha && linha.motivo,
    ].filter(Boolean).map(esc).join(' · ');
    return `<div class="item-linha"><span class="ava${leitura.tom ? ` ${leitura.tom}` : ''}" style="width:32px;height:32px">${ic(leitura.icone,16)}</span>
      <span><strong>${esc(linha && linha.titulo || leitura.titulo)}</strong>${detalhes ? `<span>${detalhes}</span>` : ''}</span></div>`;
  }

  function corpoDoHistorico() {
    const h = historicoCliente;
    if (!h || h.carregando && !h.items.length) {
      return '<div class="box"><div class="box-t">Carregando histórico…</div></div>';
    }
    if (!h.items.length && h.erro) {
      return `<div class="box"><div class="box-t">Não consegui carregar o histórico</div><div class="box-s">${esc(h.erro)}</div>
        <button class="act full" style="margin-top:10px;justify-content:center" data-acao="abrir-historico-cliente">Tentar de novo</button></div>`;
    }
    if (!h.items.length) {
      return '<div class="box"><div class="box-t">Sem visitas registradas</div><div class="box-s">As próximas entregas e atendimentos aparecem aqui.</div></div>';
    }
    const aviso = h.erro
      ? `<div class="banner alerta" style="margin-top:8px">${ic('alert',15)}<span>${esc(h.erro)}</span></div>`
      : '';
    const mais = h.nextCursor
      ? `<button class="act full" style="margin-top:9px;justify-content:center" data-acao="historico-cliente-mais"${h.carregando ? ' disabled aria-busy="true"' : ''}>${h.carregando ? 'Carregando…' : 'Ver mais'}</button>`
      : '';
    return `<div class="cartao-lista" style="padding:0 11px">${h.items.map(linhaDoHistorico).join('')}</div>${aviso}${mais}`;
  }

  function mostrarHistoricoCliente() {
    if (!historicoCliente || typeof window.portao !== 'function') return;
    const nome = ficha && (ficha.detalhe?.name || ficha.item?.name) || 'Cliente';
    window.portao({
      tom: 'info', ico: 'clock', titulo: 'Histórico',
      sub: `${esc(nome)} · entregas e atendimentos`,
      corpo: corpoDoHistorico(),
      acoes: [['Fechar', '', true]],
    });
  }

  async function abrirHistoricoCliente() {
    if (!ficha || !ficha.id || !temPonte()) return;
    const h = { clienteId: String(ficha.id), items: [], nextCursor: '', carregando: true, erro: '' };
    historicoCliente = h;
    mostrarHistoricoCliente();
    try {
      const r = await window.API.get(`/logistica/clientes/${encodeURIComponent(h.clienteId)}/historico?limit=30`);
      if (historicoCliente !== h || !ficha || ficha.id !== h.clienteId) return;
      h.items = Array.isArray(r && r.items) ? r.items : [];
      h.nextCursor = String(r && r.nextCursor || '');
    } catch (_) {
      if (historicoCliente !== h || !ficha || ficha.id !== h.clienteId) return;
      h.erro = 'Confira a conexão e tente novamente.';
    } finally {
      if (historicoCliente !== h || !ficha || ficha.id !== h.clienteId) return;
      h.carregando = false;
      mostrarHistoricoCliente();
    }
  }

  async function carregarMaisHistoricoCliente() {
    const h = historicoCliente;
    if (!h || h.carregando || !h.nextCursor || !temPonte()) return;
    h.carregando = true;
    h.erro = '';
    mostrarHistoricoCliente();
    try {
      const r = await window.API.get(`/logistica/clientes/${encodeURIComponent(h.clienteId)}/historico?limit=30&cursor=${encodeURIComponent(h.nextCursor)}`);
      if (historicoCliente !== h || !ficha || ficha.id !== h.clienteId) return;
      const novos = Array.isArray(r && r.items) ? r.items : [];
      h.items.push(...novos);
      h.nextCursor = String(r && r.nextCursor || '');
    } catch (_) {
      if (historicoCliente !== h || !ficha || ficha.id !== h.clienteId) return;
      h.erro = 'Não consegui trazer mais visitas agora.';
    } finally {
      if (historicoCliente !== h || !ficha || ficha.id !== h.clienteId) return;
      h.carregando = false;
      mostrarHistoricoCliente();
    }
  }
