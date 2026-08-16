  /* ------------------------------------------------------------------------
     CONTINUIDADE DA ROTA — dono, virada do dia e handoff exato.

     Esta frente nunca chama a limpeza ampla do dia. Toda ação leva o `ref`
     validado pelo servidor e só depois recarrega a fonte. A fila offline fecha
     o portão: rota não troca de mãos nem é cancelada enquanto este aparelho
     ainda guarda entrega/comprovante sem ACK — PENDENTE, o trabalho que ainda
     pode subir. O RECUSADO é outra coisa e não tranca nada (ver a nota do
     `recusadosResolvidos`): ele já morreu no servidor, só precisa ser visto.
     ------------------------------------------------------------------------ */
  const refDoAlvo = (alvo) => String((alvo && alvo.dataset && alvo.dataset.ref) || '');
  const ownerDoAlvo = (alvo) => Number(alvo && alvo.dataset && alvo.dataset.owner) || undefined;

  /* 🔴 A ROTA FANTASMA (15/08) — MOVIDA de `00-nucleo.js` pra CÁ (o módulo da
     ref) porque aquele arquivo está no teto de 1000/1000 do portão da ponte;
     a costura é um IIFE contíguo e `function` hoista, então a mudança de casa
     não muda comportamento nenhum.

     🔴 O QUE MUDOU DE VERDADE: a ref `route:` agora EXIGE rota VIVA — mas
     "viva" NÃO é o mesmo que "rodando". Até aqui (14/08) bastava `r.routeId`
     existir — e ele existe pra QUALQUER rota do motorista+dia, viva ou
     morta. `claimLogisticaRoute` (backend) cria a `LogisticaRoute` ANTES de
     `planejarRota`: todo Iniciar que falha (dia vazio, 402 de assento, OSRM
     fora) deixa uma rota PLANNED com zero stops pra trás — e o Cancelar
     anterior deixa uma rota ACTIVE/ENCERRADA com zero stops (a lápide, medida
     no banco de produção). Nos dois casos o `routeId` continua vindo no
     payload e a ref virava `route:<morta>`: todo verbo (inclusive Cancelar)
     passava a bater 409/404 contra um alvo que o servidor já esqueceu — o
     aparelho ficava preso olhando pra uma rota fantasma, rodando
     `carregarRota()` a cada 60 s pra sempre.

     🔴 O FURO DO LOTE 1.1 (15/08, achado pela revisão adversarial) — a 1ª
     cura restringiu demais: `estadoDaRota(r) === 'rodando'` só é verdade pra
     ACTIVE/INITIALIZING. Uma rota PLANNED deixada por um Iniciar que falhou
     DEPOIS do congelamento (ou uma COMPLETED com abertas presas dentro —
     "a rota COMPLETED com 14 paradas abertas presas" que existe em prod,
     ver §5 do desenho) AINDA SEGURA os stops do dia — mas caía em `draft:`
     porque não está "rodando". O `resolve()` do servidor (ramo `draft:`)
     EXCLUI de propósito qualquer entrega presa num stop de rota com
     `operationalEndedAt` NULO (é o par exato desta régua: rota viva não
     encerrada guarda dono via `route:`, só a morta solta pro `draft:`) — a
     ref virava `draft:`, o resolve não achava as entregas presas, NotFound,
     e o F5 do lote 1.1 engolia isso como saída graciosa: `{ok:true,
     canceladas:0}` SEM cancelar nada. Pior que o 404 de antes — parecia
     sucesso.

     A RÉGUA CERTA (lote 1.2): rota ENCERRADA (`routeStatus === 'ENCERRADA'`,
     o servidor deriva isso de `operationalEndedAt`) OU inexistente → `draft:`
     (é o dia que sobrou por cima da lápide — exatamente a cena do print:
     lápide encerrada → `draft:` → cancela o dia). Rota VIVA (qualquer status
     != 'ENCERRADA': PLANNED, INITIALIZING, ACTIVE, COMPLETED-com-stop-preso)
     → `route:`, independente de estar 'rodando'. Isso NÃO reabre a fantasma
     original: o `routeId` só existe pra rota de HOJE deste motorista
     (`getOperationalRouteMetadata`), e uma rota PLANNED/COMPLETED com
     `routeId` publicado sempre tem dono válido no backend — é a MESMA rota
     que o Cancelar precisa mirar pra realmente esvaziar.

     Qualquer outro estado (sem `routeId`, ou ENCERRADA) cai na ref do DIA
     (`draft:<dono>:<data>`) — é exatamente o que o servidor publica em
     `/logistica/rota/continuidade` quando a rota não é mais "de hoje e
     viva". Sem dono nem ordem gravada, `comDono` não acha ninguém e a ref
     sai vazia — não há o que cancelar, o dock já mostra "Montar rota". */
  function refDaResposta(r, itens) {
    if (r && r.continuityRef) return String(r.continuityRef);
    if (r && r.routeId && String(r.routeStatus || '').toUpperCase() !== 'ENCERRADA') {
      return `route:${String(r.routeId)}`;
    }
    const comDono = (itens || []).find((it) => it && it.entregador && it.entregador.id
      && it.rotaOrdem !== null && it.rotaOrdem !== undefined);
    return comDono ? `draft:${Number(comDono.entregador.id)}:${String((r && r.date) || dataDaRotaNaTela())}` : '';
  }

  /* 🔴 A ROTA FANTASMA (14/08, print do dono): "51 paradas · 0 entregues" com
     dock Cancelar|Iniciar|Montagem, e QUALQUER verbo de continuidade batendo
     409/404 sem NUNCA atualizar a tela — o aparelho ficava preso olhando pra
     um dia que o servidor já não reconhecia mais (sem abertas, rota sumida,
     dono trocado). `avisoErro` sozinho só abria o portão com a frase crua
     ("Não deu certo") e a tela morta continuava desenhada por baixo dele.

     `avisoErroContinuidade` é a MESMA porta, só que pros 4 verbos de
     continuidade (o Cancelar do dock, em `30-verbos-rota.js`, e os 3 destes
     cartões): num 409/404 SEM `code` dedicado — ROTA_DE_OUTRO_MOTORISTA e
     ASSENTOS_ESGOTADOS continuam com o handoff próprio deles, intocado —
     ela RESSINCRONIZA primeiro (esquece a rota carregada e recarrega) e só
     DEPOIS abre um portão curto e honesto. Quando ele fechar, a tela por
     baixo já bate com o servidor — nunca com o fantasma. */
  const avisoErroContinuidade = async (e) => {
    const status = Number((e && e.status) || 0);
    const code = String((e && e.body && e.body.code) || '');
    if (status !== 409 && status !== 404) return avisoErro(e);
    if (code) return avisoErro(e);
    esquecerRotaCarregada();
    await carregarRota();
    if (typeof window.portao !== 'function') return;
    window.portao({
      tom: 'trava', ico: 'alert', titulo: 'Este dia mudou',
      sub: humano(e) || 'Este dia não tem mais paradas abertas.',
      acoes: [['Fechar', '']],
    });
  };

  /* 🔴 UM PORTÃO QUE PERGUNTA PRECISA DEVOLVER A RESPOSTA — E MORRER JUNTO COM A
     TELA (14/08). O "sim" resolve `true`; QUALQUER outra saída (o escape, o toque
     fora, o repinte que varre a camada) resolve `false` pelo vigia. Sem o vigia,
     um "Agora não" deixaria `comTravaFila` ocupado pra sempre — exatamente o tipo
     de beco que este arquivo está consertando. O relógio de 60s é só backstop. */
  function decisaoDoPortao() {
    return new Promise((resolve) => {
      const wrap = naCamada('.portao-wrap');
      const principal = naCamada('.portao-wrap .principal');
      if (!wrap || !principal) { resolve(false); return; }
      let respondido = false;
      let vigia = 0;
      const responder = (valor) => {
        if (respondido) return;
        respondido = true;
        if (vigia) clearInterval(vigia);
        resolve(valor);
      };
      principal.addEventListener('click', () => responder(true), { once: true });
      vigia = setInterval(() => { if (!wrap.isConnected) responder(false); }, 250);
      setTimeout(() => responder(false), 60000);
    });
  }

  /* 🔴 RECUSADO AVISA, NÃO TRANCA (14/08 — o beco que prendeu 4 rotas do dono).
     A régua de ontem exigia `rejected == 0` pra mover ou cancelar, e mandava
     "resolva esse item antes" — só que resolver não existia: REJECTED nasceu pra
     ficar de evidência e NADA neste app o apagava. Pior: a rota com
     `operationalEndedAt` faz o VPS devolver CONFLICT em qualquer comando, o app
     grava CONFLICT como REJECTED permanente, e aí o CANCELAR — a única saída
     daquela rota — some junto. Ciclo fechado, aparelho preso.

     Recusa permanente é fato MORTO: o VPS já disse que não aceita e repetir não
     muda; o `applyLocalOverlay` nem desenha REJECTED, então a tela JÁ mostra o
     que o servidor tem de verdade. Segurar a rota por causa dele não protege
     nada. O que protege é o PENDING — esse continua trancando, porque é trabalho
     que ainda não subiu. Aqui o recusado só precisa ser VISTO e descartado pela
     mão do dono. APK sem a ponte do descarte não trava por algo que não tem como
     resolver: segue, como era antes de ontem. */
  async function recusadosResolvidos(st) {
    const quantos = Number(st && st.rejected) || 0;
    if (quantos <= 0) return true;
    const offline = (window.HBX && window.HBX.offline) || null;
    if (!offline || typeof offline.descartarRecusados !== 'function') return true;
    if (typeof window.portao !== 'function') return true;
    window.portao({
      tom: 'alerta',
      ico: 'alert',
      titulo: quantos === 1 ? 'Um item foi recusado' : `${quantos} itens foram recusados`,
      sub: 'O HBX não aceitou esta entrega ou comprovante e não vai aceitar numa nova tentativa. A rota na tela já mostra o que o servidor tem. Descarte para seguir.',
      acoes: [['Agora não', ''], ['Descartar e seguir', 'principal']],
      classe: 'duas',
      // Descartar APAGA a evidência local — veste vermelho, como todo destrutivo
      // desta casa. A classe segue `principal` porque é nela que o "sim" pendura.
      perigo: true,
    });
    if (!(await decisaoDoPortao())) return false;
    const depois = offline.descartarRecusados();
    if (depois && (Number(depois.rejected) || 0) > 0) {
      window.portao({
        tom: 'alerta', ico: 'alert', titulo: 'Não consegui descartar',
        sub: 'Os itens recusados continuam neste aparelho. Toque em Sincronizar e tente de novo.',
        acoes: [['Fechar', '']],
      });
      return false;
    }
    return true;
  }

  async function filaOfflinePronta() {
    try {
      const ler = () => (window.HBX && window.HBX.offline && window.HBX.offline.status
        ? window.HBX.offline.status() : { pendingOperations: 0, pendingProofs: 0 });
      let st = ler() || {};
      if (!(await recusadosResolvidos(st))) return false;
      st = ler() || {};
      if ((Number(st.pendingOperations) || 0) + (Number(st.pendingProofs) || 0) <= 0) return true;
      if (window.HBX.offline && window.HBX.offline.flush) window.HBX.offline.flush();
      await new Promise((resolve) => setTimeout(resolve, 1600));
      st = ler() || {};
      if (!(await recusadosResolvidos(st))) return false;
      st = ler() || {};
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
      catch (e) { await avisoErroContinuidade(e); return false; }
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
      catch (e) { await avisoErroContinuidade(e); return false; }
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
      catch (e) { await avisoErroContinuidade(e); return false; }
      if (continuidadeAtiva === ref) continuidadeAtiva = '';
      esquecerRotaCarregada();
      await carregarRota();
      if (typeof window.ir === 'function') window.ir('rota');
      return true;
    }), { once: true });
  }
