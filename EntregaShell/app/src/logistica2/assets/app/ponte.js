/* ==========================================================================
   PONTE — o único lugar onde a casca do mock encosta no APARELHO.

   Escrito à mão (NÃO é gerado): `mock.css`/`mock.js` saem do mock e não podem
   ser editados, então tudo que é do aparelho — API, Voltar do Android, teclado,
   tema — mora aqui. Carrega DEPOIS do mock, e só se apoia no que o mock já
   expõe no escopo global (`ir`, `atual`, `T`).

   F2 do PR06082026-RECOMECO-LOGISTICA2. Nesta leva a ponte NÃO busca dado
   nenhum: ela abre a porta. A fiação por cena entra a partir da L1.
   ========================================================================== */
(function () {
  'use strict';

  const temPonte = () => typeof window.HBX !== 'undefined' && typeof window.HBX.api === 'function';

  /* 🔴 `let`/`const` de topo NÃO viram propriedade de `window` — só `var` e
     `function` viram. O mock declara `let atual`, então `window.atual` é
     SEMPRE undefined, e quem ler assim vai achar que não tem tela nenhuma
     (foi o que fez o Voltar devolver "não tratei" no aparelho, medido no g15).
     Referência NUA resolve pelo escopo léxico global, que os dois scripts
     compartilham — é assim que se lê o estado do mock. */
  const telaAtual = () => { try { return atual; } catch (_) { return null; } };

  /* ------------------------------------------------------------------------
     1. TEMA COM UM DONO SÓ.
     O `native.js` já resolve o tema com três entradas (escolha do dono, virada
     de turno e o aparelho) e espelha em `data-luz`. O mock tem o `trocarLuz`
     dele. Dois donos do tema um dia discordam — e quem perde é a tela, que
     fica clara com o app escuro. Aqui o mock passa a OBEDECER o native: manda
     a escolha pra ele e só repinta quando ele avisa.
     ------------------------------------------------------------------------ */
  if (temPonte() && typeof window.trocarLuz === 'function') {
    const doMock = window.trocarLuz;
    window.trocarLuz = function (escolha) {
      // vocabulário do mock (escuro/claro/sistema) → o do native (dark/light/system)
      const mapa = { escuro: 'dark', claro: 'light', sistema: 'system' };
      if (mapa[escolha]) { window.HBX.theme.set(mapa[escolha]); return; }
      doMock(escolha);
    };
    // o native mexeu no tema (turno virou, aparelho mudou): a tela acompanha.
    document.addEventListener('hbx:theme', () => {
      if (typeof window.pintar === 'function') window.pintar(false);
    });
  }

  /* ------------------------------------------------------------------------
     2. VOLTAR DO ANDROID (Lei 10 do app).
     O Kotlin pergunta `window.HBXApp.handleBack()`: `true` = eu tratei,
     `false` = pode sair do app. A ordem é a de sempre: primeiro fecha o que
     está POR CIMA, depois volta pra Rota, e só na Rota é que sair vale.
     Camada nova do mock entra AQUI, não em outro lugar.
     ------------------------------------------------------------------------ */
  const POR_CIMA = ['.erro-wrap', '.conf-wrap', '.portao-wrap', '.sheet-wrap', '.modal-wrap', '.aviso'];
  window.HBXApp = window.HBXApp || {};
  window.HBXApp.handleBack = function () {
    const camada = document.querySelector('#app .tela');
    if (camada) {
      for (const sel of POR_CIMA) {
        const peca = camada.querySelector(sel);
        if (!peca) continue;
        // 🔴 TRAVA É TRAVA — mas quem diz se trava é o ESCAPE, não o tom.
        // Escape = o botão que sai SEM resolver. O portão marca (`data-escape`);
        // erro e confirmação não marcam, e ali o escape é o `data-fechar` que
        // NÃO é o principal ("Fechar", "Não"). Camada sem escape nenhum é
        // obrigatória (atualização obrigatória, por ex.) e Voltar não pode ser
        // a porta dos fundos: engole o Voltar (`true` sem fechar) e a trava
        // continua de pé, com o app aberto.
        // ⚠️ Medido no g15: "Créditos acabaram" TEM "Fechar" — tom vermelho não
        // é obrigação, e tratar tom como trava prenderia o dono numa tela.
        const escapes = peca.querySelectorAll('[data-escape], [data-fechar]:not(.principal):not(.azul)');
        const eEnfeite = sel === '.aviso';   // aviso passa sozinho; não é decisão
        if (!escapes.length && !eEnfeite) return true;
        // o mock sabe fechar com a animação certa; sem ele, some direto.
        if (typeof window.fechar === 'function' && peca.firstElementChild) window.fechar(peca);
        else peca.remove();
        return true;
      }
    }
    const tela = telaAtual();
    if (tela && tela !== 'rota' && typeof window.ir === 'function') {
      window.ir('rota');
      return true;
    }
    return false;   // na Rota, Voltar sai do app (o Kotlin pede a confirmação)
  };

  /* ------------------------------------------------------------------------
     3. TECLADO NUNCA COBRE CAMPO NEM BOTÃO (Lei 4).
     O WebView não encolhe sozinho: quem sabe a altura real é a `visualViewport`.
     A folha usa `--teclado` pra empurrar o que precisa; a classe é o sinal.
     ------------------------------------------------------------------------ */
  const vv = window.visualViewport;
  if (vv) {
    const sincronizar = () => {
      const tomado = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty('--teclado', `${Math.round(tomado)}px`);
      document.body.classList.toggle('keyboard-open', tomado > 120);
    };
    vv.addEventListener('resize', sincronizar);
    vv.addEventListener('scroll', sincronizar);
    sincronizar();
  }

  /* ------------------------------------------------------------------------
     4. A PORTA DOS DADOS.
     `API.get/post/patch/del` é o que as levas de fiação vão usar. Erro chega
     em PORTUGUÊS de gente (Lei 6): id cru de backend nunca vai pra tela.
     Sem ponte (mock aberto no navegador), a porta REJEITA em vez de inventar
     dado — número inventado em tela de dinheiro é mentira com cara de app.
     ------------------------------------------------------------------------ */
  const humano = (e) => {
    const msg = String((e && e.message) || e || '');
    if (/Failed to fetch|NetworkError|ERR_/i.test(msg)) return 'Sem conexão agora.';
    if (/demorou/i.test(msg)) return 'O servidor demorou. Tente de novo.';
    if (/401|403|sessão|token/i.test(msg)) return 'Sua sessão expirou. Abra o app de novo.';
    if (/Abra esta tela pelo HBX/i.test(msg)) return msg;
    return msg || 'Não consegui agora.';
  };
  const chamar = (metodo, caminho, corpo) => {
    if (!temPonte()) return Promise.reject(new Error('Abra esta tela pelo HBX Logística.'));
    return window.HBX.api(caminho, { method: metodo, body: corpo }).catch((e) => {
      throw new Error(humano(e));
    });
  };
  window.API = {
    ponte: temPonte,
    get: (c) => chamar('GET', c),
    post: (c, corpo) => chamar('POST', c, corpo),
    patch: (c, corpo) => chamar('PATCH', c, corpo),
    del: (c) => chamar('DELETE', c),
  };

  /* ------------------------------------------------------------------------
     5. L1 — A ROTA DO DIA COM DADO REAL.
     A ponte TRADUZ o que o servidor mandou pro vocabulário do mock e entrega
     no seam (`usarDados`). Ela não decide nada: campo sem fonte vai VAZIO,
     nunca com número de enfeite.
     ------------------------------------------------------------------------ */
  const dinheiro = (n) => (typeof n === 'number' && isFinite(n)
    ? `R$ ${n.toFixed(2).replace('.', ',')}`
    : '');
  const hora = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return isFinite(d.getTime())
      ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      : '';
  };
  const distancia = (m, s) => {
    if (!(m > 0)) return '';
    const km = m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m)} m`;
    const min = s > 0 ? ` · ${Math.max(1, Math.round(s / 60))} min` : '';
    return km + min;
  };

  /** estado da rota, no vocabulário do transmux do mock */
  function estadoDaRota(r) {
    const s = String(r.routeStatus || '').toLowerCase();
    if (s === 'em_rota' || s === 'iniciada' || s === 'running') return 'rodando';
    if (s === 'pausada' || s === 'paused') return 'pausada';
    if (r.routeId) return 'pronta';
    return 'montar';
  }

  /** uma parada do servidor → uma linha do mock */
  function traduzirParada(item, i, anterior) {
    const c = item.cliente || {};
    const entregue = String(item.status || '') === 'entregue';
    const tags = [];
    if (item.quantidade > 0) tags.push([`${item.quantidade}x`, 'blue']);
    const pill = entregue
      ? ['Entregue', 'lime', 'check']
      : (item.status === 'em_rota' ? ['A caminho', 'blue', 'nav'] : ['Pendente', 'mute', 'clock']);
    return {
      n: item.rotaOrdem != null ? item.rotaOrdem : i + 1,
      hora: hora(item.etaAt || item.scheduledAt),
      cor: entregue ? 'lime' : undefined,
      nome: c.nome || '',
      rua: c.endereco || '',
      bairro: c.cidade || '',
      nota: c.observacoes || undefined,
      tags,
      // valorHoje só existe com o financeiro ligado — sem ele, sem número.
      marcado: typeof item.valorHoje === 'number' ? item.valorHoje.toFixed(2).replace('.', ',') : '',
      pill,
      // parada sem pino não tem trajeto: o mock já pinta isso como ALERTA.
      perna: item.semCoordenada
        ? 'sem trajeto — não sei onde fica'
        : (anterior ? distancia(item.legDistanceM, item.legDurationS) : ''),
    };
  }

  async function carregarRota() {
    if (!temPonte() || typeof window.usarDados !== 'function') return;
    let r;
    try { r = await window.API.get('/logistica/rota'); } catch (_) { return; }
    const itens = Array.isArray(r.items) ? r.items : [];
    const paradas = itens.map((it, i) => traduzirParada(it, i, i > 0));
    const entregues = itens.filter((it) => String(it.status || '') === 'entregue').length;
    const marcado = itens.reduce((s, it) => s + (typeof it.valorHoje === 'number' ? it.valorHoje : 0), 0);
    const temValor = itens.some((it) => typeof it.valorHoje === 'number');

    if (typeof window.PARADAS !== 'undefined') window.PARADAS = paradas;
    else try { PARADAS = paradas; } catch (_) { /* seam ausente: nada a fazer */ }
    try { estadoRota = estadoDaRota(r); } catch (_) { /* idem */ }

    window.usarDados('rota', {
      kpiParadas: String(itens.length),
      kpiEntregues: String(entregues),
      kpiEntreguesParado: String(entregues),
      // saldo/dinheiro/pix são do fechamento do dia: sem essa fonte aqui, vazio.
      saldo: '', dinheiro: '', pix: '',
      diaFeitas: String(entregues),
      diaTotal: String(itens.length),
      diaPct: itens.length ? `${Math.round((entregues / itens.length) * 100)}%` : '0%',
      diaMarcado: temValor ? dinheiro(marcado) : '',
      filtroFila: String(itens.length - entregues),
      filtroEntregue: String(entregues),
      somaProdutos: String(itens.reduce((s, it) => s + (Number(it.quantidade) || 0), 0)),
      somaMarcado: temValor ? dinheiro(marcado) : '',
    });
  }

  // 1ª carga assim que a casca subiu, e recarga toda vez que a Rota reaparece.
  window.HBXRota = { carregar: carregarRota };
  document.addEventListener('DOMContentLoaded', carregarRota);
  if (document.readyState !== 'loading') setTimeout(carregarRota, 0);
})();
