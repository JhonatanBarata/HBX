  /* ------------------------------------------------------------------------
     CONTINUIDADE DA ROTA — dono, virada do dia e handoff exato.

     Esta frente nunca chama a limpeza ampla do dia. Toda ação leva o `ref`
     validado pelo servidor e só depois recarrega a fonte. A fila offline fecha
     o portão: rota não troca de mãos nem é cancelada enquanto este aparelho
     ainda guarda entrega/comprovante sem ACK.
     ------------------------------------------------------------------------ */
  const refDoAlvo = (alvo) => String((alvo && alvo.dataset && alvo.dataset.ref) || '');
  const ownerDoAlvo = (alvo) => Number(alvo && alvo.dataset && alvo.dataset.owner) || undefined;

  async function filaOfflinePronta() {
    try {
      const ler = () => (window.HBX && window.HBX.offline && window.HBX.offline.status
        ? window.HBX.offline.status() : { pendingOperations: 0, pendingProofs: 0 });
      let st = ler() || {};
      if ((Number(st.rejected) || 0) > 0) {
        window.portao({
          tom: 'alerta', ico: 'alert', titulo: 'Há itens que precisam de revisão',
          sub: 'Uma entrega ou comprovante foi recusado na sincronização. Atualize a rota e resolva esse item antes de mover ou cancelar.',
          acoes: [['Fechar', '']],
        });
        return false;
      }
      if ((Number(st.pendingOperations) || 0) + (Number(st.pendingProofs) || 0) <= 0) return true;
      if (window.HBX.offline && window.HBX.offline.flush) window.HBX.offline.flush();
      await new Promise((resolve) => setTimeout(resolve, 1600));
      st = ler() || {};
      if ((Number(st.rejected) || 0) > 0) {
        window.portao({
          tom: 'alerta', ico: 'alert', titulo: 'Há itens que precisam de revisão',
          sub: 'A sincronização terminou com item recusado. Atualize a rota antes de mover ou cancelar.',
          acoes: [['Fechar', '']],
        });
        return false;
      }
      if ((Number(st.pendingOperations) || 0) + (Number(st.pendingProofs) || 0) <= 0) return true;
      window.portao({
        tom: 'alerta', ico: 'alert', titulo: 'Sincronize antes de mover',
        sub: 'Este aparelho ainda guarda entregas ou comprovantes. Conecte à internet e toque em Sincronizar.',
        acoes: [['Fechar', '']],
      });
      return false;
    } catch (_) {
      window.portao({
        tom: 'alerta', ico: 'alert', titulo: 'Não consegui conferir a fila',
        sub: 'Por segurança, conecte à internet e toque em Sincronizar antes de mover ou cancelar esta rota.',
        acoes: [['Fechar', '']],
      });
      return false;
    }
  }

  async function abrirRotaPendente(alvo) {
    const ref = refDoAlvo(alvo);
    if (!ref) return;
    continuidadeAtiva = ref;
    await carregarRota();
    if (typeof window.ir === 'function') window.ir('rota');
  }

  async function continuarRotaPendente(alvo) {
    const ref = refDoAlvo(alvo);
    const expectedOwnerId = ownerDoAlvo(alvo);
    if (!ref) return;
    await comTravaFila(async () => {
      if (!(await filaOfflinePronta())) return false;
      let resposta;
      try { resposta = await window.API.post('/logistica/rota/continuidade/retomar', { ref, expectedOwnerId }); }
      catch (e) { avisoErro(e); return false; }
      continuidadeAtiva = '';
      esquecerRotaCarregada();
      await carregarRota();
      if (resposta && resposta.planningPending) avisoErro(new Error(resposta.message));
      if (typeof window.ir === 'function') window.ir('rota');
      return true;
    });
  }

  function puxarRotaPendente(alvo) {
    const ref = refDoAlvo(alvo);
    const expectedOwnerId = ownerDoAlvo(alvo);
    if (!ref || typeof window.portao !== 'function') return;
    window.portao({
      tom: 'alerta', ico: 'route', titulo: 'Puxar esta rota?',
      sub: 'As paradas ainda não iniciadas passam para você. A rota da outra pessoa não é apagada.',
      acoes: [['Não', ''], ['Puxar', 'principal']], classe: 'duas',
    });
    const botao = naCamada('.portao-wrap .principal');
    if (!botao) return;
    botao.addEventListener('click', () => comTravaFila(async () => {
      if (!(await filaOfflinePronta())) return false;
      let resposta;
      try { resposta = await window.API.post('/logistica/rota/continuidade/puxar', { ref, expectedOwnerId }); }
      catch (e) { avisoErro(e); return false; }
      continuidadeAtiva = '';
      esquecerRotaCarregada();
      await carregarRota();
      if (resposta && resposta.planningPending) avisoErro(new Error(resposta.message));
      if (typeof window.ir === 'function') window.ir('rota');
      return true;
    }), { once: true });
  }

  function cancelarRotaPendente(alvo) {
    const ref = refDoAlvo(alvo);
    const expectedOwnerId = ownerDoAlvo(alvo);
    if (!ref || typeof window.portao !== 'function') return;
    window.portao({
      tom: 'alerta', ico: 'close', titulo: 'Cancelar esta rota?',
      sub: 'Só as paradas abertas desta rota serão canceladas.',
      acoes: [['Não', ''], ['Sim, cancelar', 'principal']], classe: 'duas', perigo: true,
    });
    const botao = naCamada('.portao-wrap .principal');
    if (!botao) return;
    botao.addEventListener('click', () => comTravaFila(async () => {
      if (!(await filaOfflinePronta())) return false;
      try { await window.API.post('/logistica/rota/continuidade/cancelar', { ref, expectedOwnerId }); }
      catch (e) { avisoErro(e); return false; }
      if (continuidadeAtiva === ref) continuidadeAtiva = '';
      esquecerRotaCarregada();
      await carregarRota();
      if (typeof window.ir === 'function') window.ir('rota');
      return true;
    }), { once: true });
  }
