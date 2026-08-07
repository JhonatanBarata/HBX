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

  /* 🔴 A CAMADA VIVA É A ÚLTIMA, NUNCA A PRIMEIRA. Durante a troca de tela
     existem DUAS `.tela` no DOM: a que entra e a que morre. `querySelector`
     devolve a PRIMEIRA — a moribunda — e quem procurar botão ali acha nada (ou
     acha o botão errado, que some no instante seguinte). O mock já aprendeu
     isso no `pintar()`; a ponte tem que falar a mesma língua. */
  const camadaViva = () => {
    const camadas = document.querySelectorAll('#app .tela');
    return camadas.length ? camadas[camadas.length - 1] : null;
  };
  const naCamada = (sel) => {
    const c = camadaViva();
    return c ? c.querySelector(sel) : null;
  };

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
    const camada = camadaViva();
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
  /* 🔴 O DIA DA OPERAÇÃO É O DE SÃO PAULO — nem o do relógio do aparelho, nem o
     do servidor. O servidor roda em UTC (sem TZ, medido nos dois containers) e
     o aparelho pode estar em qualquer fuso; se cada ponta escolher o seu, o
     motorista vê a rota de ontem ou de amanhã dependendo da HORA. Mesma conta
     do `operationalDate()` do app que já roda em produção. */
  const diaOperacional = () => {
    const partes = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    return partes;   // en-CA já formata como AAAA-MM-DD
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

  /* 🔴 O TEMPLATE DO MOCK INTERPOLA CRU (`${…}`), como toda maquete. Enquanto o
     dado era do mock isso não tinha dono; com dado REAL passa a ter: um nome de
     cliente com `<` quebra a marcação e o cartão some da lista sem erro nenhum.
     Escapa-se na FONTE (aqui), nunca no template — assim vale pra toda tela que
     ler o seam, e o literal do mock (que tem `<b>` de propósito) continua vivo. */
  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  /** uma parada do servidor → uma linha do mock */
  function traduzirParada(item, i, anterior) {
    const c = item.cliente || {};
    const status = String(item.status || '');
    const entregue = status === 'entregue';
    const cancelada = status === 'cancelada';
    const tags = [];
    if (item.quantidade > 0) tags.push([`${item.quantidade}x`, 'blue']);
    // 🔴 CANCELADA NÃO É PENDENTE. Caía no `else` e a parada que o motorista já
    // resolveu ("não entregue", com motivo) voltava pra lista com cara de coisa
    // por fazer — ele bateria na mesma porta de novo. Visto no g15.
    const pill = entregue
      ? ['Entregue', 'lime', 'check']
      // `mute` + número apagado, e NÃO um vermelho novo: a casca só tem
      // blue/lime/amber/mute, e "não entregue" é desfecho FECHADO, não bloqueio
      // (Lei 2c: vermelho só quando trava). Inventar `.pill.red` aqui seria
      // criar variante que o mock não tem — o oposto de casca única.
      : cancelada
        ? ['Não entregue', 'mute', 'close']
        : (status === 'em_rota' ? ['A caminho', 'blue', 'nav'] : ['Pendente', 'mute', 'clock']);
    return {
      // 🔴 O ID É O QUE FAZ A PARADA VIRAR BOTÃO. O `stop()` do mock só põe o
      // gancho quando ele existe — parada de maquete continua inerte.
      id: item.id,
      // 🔴 O NÚMERO DA TELA É A ORDEM DA VISITA, e gente conta do 1. O servidor
      // grava `rotaOrdem` começando em ZERO — usar o campo cru punha "0, 1, 2"
      // na frente do motorista (visto no g15). A ordem do servidor decide a
      // SEQUÊNCIA; o número que aparece é a posição na fila.
      n: i + 1,
      hora: hora(item.etaAt || item.scheduledAt),
      cor: entregue ? 'lime' : (cancelada ? 'off' : undefined),
      nome: esc(c.nome),
      rua: esc(c.endereco),
      bairro: esc(c.cidade),
      // o pino do mapa sai daqui; sem coordenada a parada existe na lista e
      // NÃO aparece no mapa (é o que "sem trajeto" já conta pro motorista).
      lat: typeof c.lat === 'number' ? c.lat : null,
      lng: typeof c.lng === 'number' ? c.lng : null,
      nota: c.observacoes ? esc(c.observacoes) : undefined,
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

  const centavos = (c) => (typeof c === 'number' && isFinite(c) ? dinheiro(c / 100) : '');
  /* 🔴 LEI DO IF (ordem do dono, 07/08): NADA aparece sem informação.
     Zero NÃO é informação numa quebra por forma de pagamento — se todo mundo
     pagou no pix, a tela mostra só Pix. Estes dois convertem "nada" em VAZIO,
     e o vazio faz o slot sumir no template. Cuidado deliberado: isto vale pra
     RECORTE (quanto entrou em cada forma), não pra medida principal — "0
     paradas hoje" continua sendo um fato que o motorista precisa ler. */
  const seTiver = (v) => (v ? String(v) : '');
  const centavosSeTiver = (c) => (typeof c === 'number' && isFinite(c) && c !== 0 ? dinheiro(c / 100) : '');

  async function carregarRota() {
    if (!temPonte() || typeof window.usarDados !== 'function') return;
    const dia = diaOperacional();
    let r;
    // 🔴 A DATA VIAJA SEMPRE. Sem ela o servidor usa o dia DELE — e ele roda em
    // UTC (medido: nem o container local nem o da VPS têm TZ). Das 21h à
    // meia-noite de Brasília o UTC já é amanhã, então a rota do motorista
    // aparecia VAZIA justo no fim do turno. Achado no g15 às 23:28 (defeito meu
    // da L1: o app velho sempre mandou `?date=`).
    try { r = await window.API.get(`/logistica/rota?date=${encodeURIComponent(dia)}`); } catch (_) {
      // A rota tem estado próprio e o desenho já previa os dois: o esqueleto
      // (`carregando`) e o aviso com "Tentar de novo" (`vazia`). Só na PRIMEIRA
      // carga — com a rota do dia já na tela, rede ruim não apaga o dia.
      try { if (estadoRota === 'carregando') { estadoRota = 'vazia'; pintar(false); } } catch (_) { /* sem seam */ }
      return;
    }

    // Crédito e caixa do dia vêm de OUTRAS portas — pedidos em paralelo, e
    // cada um que falhar deixa o SEU campo vazio, sem derrubar a tela.
    const [creditoR, caixaR, custoR] = await Promise.allSettled([
      window.API.get('/credits/me'),
      // ⚠️ é `date`, não `data` (conferido no controller): o nome errado não dá
      // erro nenhum — o servidor ignora e responde o dia DELE, em UTC.
      window.API.get(`/logistica/caderneta/resumo?date=${encodeURIComponent(dia)}`),
      // 🔴 "Iniciar debita N" no cabeçalho vinha do MOCK e de mais lugar nenhum
      // — o app prometia 12 créditos porque era o número do desenho. É a MESMA
      // porta que o portão do Iniciar usa pra cobrar, então o cabeçalho passa a
      // dizer o que o servidor vai debitar de verdade. Falhou: campo vazio, e
      // pela Lei do IF a linha do custo some — número de crédito inventado é
      // dinheiro errado na tela principal.
      window.API.get('/logistica/rota/custo-preview'),
    ]);
    const custo = custoR.status === 'fulfilled' ? custoR.value : null;
    const credito = creditoR.status === 'fulfilled' ? creditoR.value : null;
    const caixa = caixaR.status === 'fulfilled' ? caixaR.value : null;
    const formas = (caixa && caixa.fechamento && caixa.fechamento.formas) || null;
    const itens = Array.isArray(r.items) ? r.items : [];
    const paradas = itens.map((it, i) => traduzirParada(it, i, i > 0));
    // L4 — a folha de chegada precisa da entrega INTEIRA (itens, débito,
    // método padrão), não da linha resumida da lista. Guardada por id, que é o
    // que o cartão carrega no `data-parada`.
    ENTREGAS.clear();
    itens.forEach((it, i) => { if (it && it.id) ENTREGAS.set(String(it.id), { item: it, n: i + 1 }); });
    // O nível do financeiro vem no MESMO payload da rota (não é chute nem
    // pedido extra): é ele que decide qual das duas folhas abre na porta.
    if (typeof r.moduloFinanceiroAtivo === 'boolean') financeiroAtivo = r.moduloFinanceiroAtivo;
    /* O ANEL DO "TÔ CHEGANDO" vem armado do servidor, no mesmo payload: ele já
       manda `avisoChegandoAtivo` (a trava tripla dele resolvida) e o raio. O
       contrato do backend é explícito sobre de quem é a vez — "o app só arma o
       anel de ~500m quando isto é true (evita POST inútil com o recurso OFF)". */
    avisoChegandoAtivo = !!r.avisoChegandoAtivo;
    if (typeof r.avisoChegandoDistanciaM === 'number' && r.avisoChegandoDistanciaM > 0) {
      avisoChegandoRaioM = r.avisoChegandoDistanciaM;
    }
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
      // saldo/dinheiro/pix = o CAIXA do dia (fechamento da caderneta), em
      // centavos na origem. Financeiro OFF ⇒ campo vazio (é resposta, não
      // falha). ⚠️ Já a fonte FORA DO AR mantém o que estava: apagar o caixa
      // por causa de rede ruim é pior que mostrar o número de um minuto atrás.
      ...(caixaR.status === 'fulfilled' ? {
        saldo: caixa && caixa.fechamento ? centavosSeTiver(caixa.fechamento.totalCents) : '',
        dinheiro: formas ? centavosSeTiver(formas.dinheiroCents) : '',
        pix: formas ? centavosSeTiver(formas.pixCents) : '',
      } : {}),
      // crédito é NÚMERO INTEIRO, nunca moeda (lei da casa) — e também não
      // apaga por falha de rede.
      ...(creditoR.status === 'fulfilled' ? {
        creditos: credito && typeof credito.balance === 'number' ? String(credito.balance) : '',
      } : {}),
      creditosDebita: custo && typeof custo.creditosAIniciar === 'number' ? String(custo.creditosAIniciar) : '',
      diaFeitas: String(entregues),
      diaTotal: String(itens.length),
      diaPct: itens.length ? `${Math.round((entregues / itens.length) * 100)}%` : '0%',
      diaMarcado: temValor ? dinheiro(marcado) : '',
      filtroFila: String(itens.length - entregues),
      filtroEntregue: String(entregues),
      somaProdutos: String(itens.reduce((s, it) => s + (Number(it.quantidade) || 0), 0)),
      somaMarcado: temValor ? dinheiro(marcado) : '',
    });

    // L5 — a caderneta e a semana bebem do MESMO resumo que já veio acima.
    // Só quando ele REALMENTE respondeu: resumo que falhou não pode zerar o
    // caixa do dia (mesma lei do fio de recados, ver L8).
    if (caixaR.status === 'fulfilled') encherCaderneta(caixa, itens, entregues);

    // 🔴 A MONTAGEM SE ENCHE AQUI, não só no toque de "Montar rota". Quem chega
    // nela por outro caminho via a lista do MOCK — João da Silva, R$ 336,00 —
    // com o dado real na tela de trás. Dado de enfeite numa tela de dinheiro é
    // o defeito que esta frente inteira existe pra matar (visto no g15).
    window.usarDados('montagem', {
      somaParadas: String(paradas.length),
      somaProdutos: String(itens.reduce((s, it) => s + (Number(it.quantidade) || 0), 0)),
      somaValor: temValor ? dinheiro(marcado) : '',
      iniciarSub: '',
      linhas: paradas.map((p) => [
        p.n, p.hora, p.nome, p.rua, p.bairro, p.tags.map((t) => t[0]), p.marcado, p.cor || '',
      ]),
    });
    // Quem chama precisa saber se a rota REALMENTE entrou: o `montarRota`
    // navegava pra montagem mesmo com a chamada no chão, e a tela abria com as
    // paradas de exemplo. Sem este retorno não dá pra distinguir.
    return true;
  }

  // 1ª carga assim que a casca subiu, e recarga toda vez que a Rota reaparece.
  // O sino é do CABEÇALHO, que aparece em toda tela: o fio dos recados carrega
  // no boot junto com a rota, senão o contador só ficaria certo depois de o
  // motorista abrir o chat — que é exatamente quem ele deveria chamar.
  window.HBXRota = { carregar: carregarRota };

  /* ------------------------------------------------------------------------
     🔴 NO APARELHO, A DEMONSTRAÇÃO NÃO EXISTE.

     O mock é o front, e o front traz o dado de exemplo do desenho. Até o
     servidor responder, o motorista via João da Silva, Mercadinho Bom Preço e
     um saldo que não é dele — 60 ms na bancada, mas segundos numa rede ruim.
     Nome de cliente que não existe é mentira com cara de app pronto.

     Então, no boot: apaga o exemplo e liga o ESQUELETO das telas que buscam.
     UMA pintura só no fim (`usarDados` repinta a cada chamada; sete chamadas
     seriam sete repintes no quadro mais caro do app, o da abertura).

     A trava do 1º quadro é aqui e não em cada carregador de propósito: quando
     `ir('clientes')` pinta, `carregarClientes` ainda nem começou — ligar o
     esqueleto lá deixaria um quadro de exemplo passar.
     ------------------------------------------------------------------------ */
  function apagarDemonstracao() {
    if (!temPonte()) return;
    try { estadoRota = 'carregando'; } catch (_) { /* seam ausente */ }
    try {
      if (typeof window.PARADAS !== 'undefined') window.PARADAS = [];
      else PARADAS = [];
    } catch (_) { /* idem */ }
    const zerar = {
      /* A rota tem estado próprio (`estadoRota`), acima; aqui vai o CABEÇALHO
         dela — e vai INTEIRO, não os campos que eu lembrei.
         🔴 Medido no g15 com o túnel derrubado: eu tinha zerado só `saldo`, e a
         tela mostrou "Dinheiro R$ 132,00 · Pix R$ 52,00" — os números do mock,
         com cara de caixa do dia. É que a ponte só escreve esses dois quando o
         `caderneta/resumo` responde (`...(caixaR.status === 'fulfilled' ...)`),
         e o que ela não escreve FICA. Campo de dinheiro que sobrou do exemplo é
         a pior mentira desta tela.
         A régua: o que é DADO zera; o que é COPY (`vazioTitulo`, `vazioSub`)
         fica, porque é texto do desenho e não vem do servidor. */
      rota: {
        kpiParadas: '', kpiEntregues: '', kpiEntreguesParado: '',
        saldo: '', dinheiro: '', pix: '',
        diaFeitas: '', diaTotal: '', diaPct: '', diaMarcado: '',
        filtroFila: '', filtroEntregue: '',
        creditos: '', creditosDebita: '',
        somaProdutos: '', somaMarcado: '',
      },
      clientes: { carregando: true, lista: [], total: '', semEndereco: '', marcadoHoje: '', subtitulo: '' },
      produtos: { carregando: true, lista: [], categorias: [], ativos: '', estoqueBaixo: '', valorEstimado: '' },
      salvas: { carregando: true, lista: [], total: '' },
      chat: { carregando: true, conversa: [], recado: '' },
      consumo: { carregando: true, linhas: [], saldo: '', gastosHoje: '', bonus: '' },
      // Ajustes é o pior lugar pra exemplo: o motorista lê a CHAVE no estado do
      // desenho, toca, e acha que mudou o que nem tinha carregado. Também é a
      // tela que mostrava "Baixando o mapa · 62%" — recurso CORTADO em 06/08.
      ajustes: {
        carregando: true, avisarChegadaDist: '', creditosLinha: '',
        painelCreditos: '', grupoOffline: 0, empresa: '', versao: '', versaoSub: '',
        // Papel é DADO, e sem resposta do servidor não se sabe qual é. O desenho
        // nasce admin (é a tela cheia); o aparelho nasce SEM, e só o `config`
        // liga. Errar pro lado de mostrar administração é vazar dinheiro.
        admin: 0,
      },
      // As chaves de dinheiro. Todas nascem 0 e a tela nem desenha: chave no
      // estado do desenho é o motorista achando que desligou o que nem carregou.
      avancado: {
        carregando: true, admin: 0, financeiro: 0, cobrancaSimples: 0,
        precoPorCliente: 0, naHora: 0, mensal: 0, fiado: 0,
      },
      /* A ABERTURA NÃO ENTRA AQUI — e o motivo é o que torna ela especial. Ela
         dizia "Água Rio Claro" (nome do desenho) na PRIMEIRA tela que o
         motorista vê, com o aparelho logado na Atlas. Zerar um slot não
         resolveria: o `pintar(false)` do fim do mock.js já pintou a abertura
         quando esta função roda, e ela não repinta a abertura de propósito
         (`telaAtual() !== 'entrada'`, logo abaixo) porque é uma cena com
         relógio. O nome da empresa também não tem porta no aparelho —
         `hbx:logistica-company-name` não existe no localStorage do app novo
         (medido no g15) e quem gravava essa chave era o `app.js`, que o
         `index.html` não carrega mais. Sem porta e sem repinte, a linha
         saiu do DESENHO (o porquê inteiro está em cima do `.splash-barra`, na
         folha do mock). */
      // 🔴 TELA DE DINHEIRO. O catálogo inteiro era do desenho (R$ 49/129/239/449,
      // "+8% grátis") e o botão anunciava "Recarregar 300 créditos · R$ 129,00"
      // sem pacote escolhido de verdade — ele saía pelo `if (!pacoteEscolhido)`
      // e não fazia nada. Preço inventado com botão em cima não fica na tela.
      recarga: { carregando: true, saldo: '', ritmo: '', pacotes: [], cta: '' },
      /* 🔴 AJUSTES · FINANCEIRO — a última tela que ainda não tinha SEAM NENHUM.
         As outras eu já zerava aqui; esta não tinha o que zerar, porque os
         números moravam CRAVADOS no template do mock. Então ela passava por
         este apagador calada e chegava inteira no aparelho: medido por toque no
         g15 com a bancada (company 39, UMA entrega de R$ 20,00) ela dizia
         "Recebido hoje R$ 336,00", "Em aberto R$ 257,00", a quebra por forma
         completa, TRÊS devedores com nome e sobrenome (Maria Aparecida R$
         74,00, Bar do Zé R$ 96,00, Mercado Estrela R$ 87,00) e a semana em
         R$ 2.648,00. Cobrança de gente que não existe, dentro da Administração
         — o dono lê isso e liga pro cliente.
         Nasce VAZIO como as irmãs, e `carregando` liga o esqueleto: quem enche
         é o `carregarFinanceiro`, no `ir('financeiro')`. */
      financeiro: {
        carregando: true, recebido: '', emAberto: '', formas: [], marcou: '', devedores: [],
        semanaRecebido: '', semanaMarcado: '', semanaPendencia: '',
      },
      // A montagem sobrevivia com as 6 paradas de exemplo e "R$ 336,00" quando
      // o `/logistica/rota` falhava: `carregarRota` volta no catch ANTES de
      // escrever aqui, e o `montarRota` navegava mesmo assim.
      montagem: { somaParadas: '', somaProdutos: '', somaValor: '', iniciarSub: '', linhas: [] },
      /* 🔴 O CAIXA DO DIA — 11 campos de dinheiro presos a UMA chamada.
         `encherCaderneta` só roda se o `caderneta/resumo` responder; as duas
         seções são 100% DADO e nenhuma nascia limpa. Com a chamada no chão a
         Caderneta (que é ABA da barra de baixo, alcançável a qualquer momento)
         mostrava o fechamento do desenho: Dinheiro R$ 132,00 · Pix R$ 52,00 ·
         Cartão R$ 84,00 · Caderneta R$ 68,00, total R$ 336,00 — e o selo
         "Tudo certo!", um veredito que o app não tem como emitir. A Semana
         mostrava 6 dias inventados e R$ 2.648,00. */
      caderneta: { entregues: '', selo: '', formas: [], formaTotal: '', clientes: '', produtos: '', marcado: '' },
      semana: { dias: [], marcado: '', recebido: '', pendencia: '' },
      /* 🔴 AS EMPRESAS DO CORREDOR SÃO A MENTIRA MAIS CARA DESTA TELA. O
         desenho traz "Mercado São Judas", "Padaria Avenida" e "Restaurante
         Sabor" com nome, ramo e posição — e o destino delas, no produto, é
         virar LEAD e MENSAGEM DE WHATSAPP. Empresa de exemplo aqui não é um
         número errado num canto: é o motorista tocando num prédio que não
         existe. Zera INTEIRO; só o `chip` fica, que é COPY do desenho e some
         sozinho junto com a lista.
         O prospector ainda não tem servidor (PR07082026-PROSPECTOR-CNPJ, F0):
         até ele existir, a lista fica vazia e a tela de navegação abre SEM
         empresa nenhuma, sem chip, sem varredura e sem radar. */
      mapa: { empresas: [] },
      /* 🔴 O CROMO DO GPS — a última mentira da varredura, e a pior de todas
         pelo LUGAR: é a tela em que o motorista está DIRIGINDO. Enquanto rota,
         clientes, ajustes, recarga, caderneta e semana já nasciam limpas, esta
         seguia dizendo "Parada 3 de 8 · Mercado São Judas" (cliente que não
         existe), "240 m · Vire à direita" (curva que ninguém escolheu, com a
         seta apontando) e "12:26 chegada · 45 min restante · 8,2 km". Todos
         literais do desenho, cravados no template — nenhum saía de porta
         nenhuma. Na de chegada era ainda mais direto: "Você chegou · Mercado
         São Judas · R. São Judas, 142 · GPS ±6 m, você está na porta".

         A fiação (§4.1 do PR07082026-FECHAR-LOGISTICA2) ainda não existe;
         então, como nas empresas do corredor, o campo fica VAZIO e o pedaço
         some da tela — a tela de navegação abre com o mapa de verdade (L3a),
         a seta do motorista e o Encerrar, e nada mais. Honesto.

         Zera o que é DADO. NÃO zera o que é COPY: `velocidadeUnidade`,
         `chegadaRotulo`, `restanteRotulo`, `distanciaRotulo`, `chegouTitulo`,
         `chegouAcao` e — o que mais importa — `encerrar`, que é a PORTA DE
         SAÍDA desta tela. Motorista preso na navegação é defeito pior que
         qualquer número faltando. */
      gps: {
        manobraIcone: '', manobraDist: '', manobraVerbo: '',
        manobraRua: '', manobraDepois: '',
        rumo: '', velocidade: '',
        paradaN: '', paradaTotal: '', paradaNome: '',
        chegada: '', restante: '', distancia: '',
        chegouEndereco: '', chegouPrecisao: '', chegouFaltam: '', chegouKm: '',
      },
    };
    try {
      Object.keys(zerar).forEach((s) => { DADOS[s] = Object.assign({}, DADOS[s], zerar[s]); });
      // Na ABERTURA não se repinta: ela é uma cena com relógio (o logo viaja
      // pro cabeçalho) e a camada seria recriada do zero. Nenhuma destas telas
      // está à vista agora — quem pinta com o valor novo é o `ir('rota')` que
      // encerra a abertura.
      if (telaAtual() !== 'entrada') pintar(false);
    } catch (_) { /* sem seam: a casca não subiu, e aí não há o que apagar */ }
  }

  /** Fonte fora do ar: some o esqueleto, entra o aviso — nunca lista vazia,
   *  que mentiria dizendo que a base do motorista está vazia.
   *  🔴 SÓ NA PRIMEIRA CARGA (`carregando` ainda ligado). Com dado do servidor
   *  já na tela, rede ruim NÃO apaga nada — é a Lei nº1 desta frente. */
  const fonteCaiu = (secao) => {
    if (typeof window.usarDados !== 'function') return;
    let primeira = false;
    try { primeira = !!(DADOS[secao] && DADOS[secao].carregando); } catch (_) { return; }
    if (!primeira) return;
    window.usarDados(secao, { carregando: false, semFonte: true });
  };
  /** Respondeu: sai o esqueleto E o aviso, no MESMO repinte do dado. */
  const fonteVoltou = { carregando: false, semFonte: false };
  /** "Tentar de novo": devolve o esqueleto e pede de novo. */
  const retentar = (secao, carregador) => {
    if (typeof window.usarDados === 'function') window.usarDados(secao, { carregando: true, semFonte: false });
    carregador();
  };

  /* ------------------------------------------------------------------------
     ITEM 9 DO DONO (07/08) — A BARRA DO MOTORISTA OBEDECE O ADMIN.

     *"deixar os módulos do motorista na mão do ADMIN (não dentro do app, no
     desktop)... Se o admin montar, deixar mastigado e liberar o rota para o
     motorista, ele tem q receber a rota, iniciar e go!"*

     O desktop grava um CSV em `appModulosDesativados` e o `GET
     /logistica/config` o entrega a TODO ator — inclusive ao motorista. Aqui a
     ponte só TRADUZ pro seam; quem some com o botão, com o atalho e com o
     arrastar é a casca (`nav`/`ir`/`podarDesligados`/`arrastarModulo`).

     🔴 REDE CAÍDA NÃO ESCONDE MÓDULO. O `catch` volta SEM escrever: o campo
     fica como estava (vazio no boot = os 6 na tela). É o contrário do resto
     desta ponte, onde fonte fora do ar vira aviso — porque aqui o silêncio
     não pode TIRAR nada do motorista.
     ------------------------------------------------------------------------ */
  function aplicarBarra(cfg) {
    if (!cfg || typeof cfg !== 'object') return;
    if (typeof window.usarDados !== 'function') return;
    // Backend antigo (campo ausente) e "nada desligado" (null) caem no mesmo
    // lugar de propósito: string vazia, barra inteira. Traduzir ≠ decidir.
    const csv = typeof cfg.appModulosDesativados === 'string' ? cfg.appModulosDesativados : '';
    window.usarDados('barra', { desligados: csv });
    // Se o motorista estava JUSTAMENTE no módulo que acabou de ser desligado,
    // a barra fica sem botão aceso e ele fica preso. A casca o devolve à Rota.
    try {
      if (typeof window.resgatarModuloDesligado === 'function') window.resgatarModuloDesligado();
    } catch (_) { /* casca sem a função: barra velha, nada a resgatar */ }
  }

  let barraLidaEm = 0;
  async function carregarBarra() {
    if (!temPonte()) return;
    // Três gatilhos podem cair juntos (voltou pro foco + foco da janela +
    // relógio). Uma leitura por vez basta; o resto é chamada repetida à toa.
    const agora = Date.now();
    if (agora - barraLidaEm < 3000) return;
    barraLidaEm = agora;
    let cfg;
    try { cfg = await window.API.get('/logistica/config'); } catch (_) { return; }
    // A MESMA resposta diz quem é admin (ehAdmin lê o `config`) — sem isso os
    // chips de dia do montar só nasciam depois de passar pelos Ajustes.
    config = cfg;
    aplicarBarra(cfg);
    publicarMontarDias();
  }

  /* O admin desliga o módulo com o app do motorista ABERTO — é o caso normal,
     não a exceção. Sem reler durante o turno a barra só obedeceria no próximo
     boot, e "desliguei no desktop e não sumiu no celular" é exatamente a queixa
     que este item veio resolver.

     🔴 MEDIDO NO g15 (07/08): `visibilitychange` NÃO dispara neste app. Sair
     pelos recentes e voltar mantém a Activity viva, a WebView nunca é pausada
     (`webView.onPause()` não é chamado) e o documento nunca fica `hidden` — a
     barra ficou 1 minuto mostrando a configuração velha na minha cara. Evento
     que eu não vi disparar não é garantia, é esperança.

     Então a GARANTIA é o relógio, no mesmo padrão que o app já usa pro modo
     noturno (`native.js`, 1 checagem por minuto): uma leitura da config por
     minuto — a linha mais barata do app, uma só. Os dois eventos ficam como
     ATALHO: onde dispararem, obedece na hora; onde não, o relógio pega. */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') carregarBarra();
  });
  window.addEventListener('focus', carregarBarra);
  setInterval(carregarBarra, 60000);

  const cargaInicial = () => { apagarDemonstracao(); carregarBarra(); carregarRota(); carregarRecados(); };
  document.addEventListener('DOMContentLoaded', cargaInicial);
  if (document.readyState !== 'loading') setTimeout(cargaInicial, 0);

  /* ------------------------------------------------------------------------
     6. L2 — MONTAR → MONTAGEM → INICIAR (DEBITA) → ENCERRAR.
     Regras que valem dinheiro, todas do domínio e nenhuma inventada aqui:
     · quem DEBITA é o Iniciar, e só ele;
     · o número do portão é o MESMO que o servidor vai cobrar (custo-preview),
       nunca uma conta minha na tela;
     · toque repetido não cobra duas vezes (trava de reentrância);
     · Cancelar não perde entrega: as abertas voltam pra agenda (encerrar).
     ------------------------------------------------------------------------ */
  /* --------------------------------------------------------------------
     O DIA DA ROTA A MONTAR (dono, 07/08): "não estamos conseguindo se
     adiantar, ou voltar um dia". O trilho é o MESMO do desktop
     (`/logistica/admin-route/prepare`): o dia operacional continua HOJE —
     caderneta, cobrança e carimbo coerentes — e só os CLIENTES vêm do dia
     escolhido. 0 = hoje (fluxo de sempre). Chip só aparece pra admin.
     -------------------------------------------------------------------- */
  let montarDia = 0;
  /** a data (SP) da próxima ocorrência do dia n (1=Seg…7=Dom), hoje inclusive */
  const dataDoDia = (n) => {
    const [a, m, d] = diaOperacional().split('-').map(Number);
    const base = new Date(Date.UTC(a, m - 1, d, 12));
    const dow = base.getUTCDay() === 0 ? 7 : base.getUTCDay();
    base.setUTCDate(base.getUTCDate() + (((n - dow) + 7) % 7));
    return base.toISOString().slice(0, 10);
  };
  /** os chips que a Rota desenha no estado "montar" — sem admin, nada entra */
  function publicarMontarDias() {
    if (typeof window.usarDados !== 'function') return;
    if (!ehAdmin()) return;
    const hoje = diaDaSemana();
    const dias = [[0, 'Hoje']];
    for (let n = 1; n <= 7; n += 1) if (n !== hoje) dias.push([n, ROTULO_DIA[n]]);
    window.usarDados('rota', { montarDias: dias, montarDiaSel: montarDia });
  }

  let ocupado = false;
  const comTrava = async (fn) => {
    if (ocupado) return;
    ocupado = true;
    try { await fn(); } finally { ocupado = false; }
  };
  const avisoErro = (e) => {
    const msg = humano(e);
    if (typeof window.portao === 'function') {
      window.portao({ tom: 'trava', ico: 'alert', titulo: 'Não deu certo', sub: msg, acoes: [['Fechar', '']] });
    }
  };
  const hojeISO = () => diaOperacional();

  /** monta a rota do dia: planeja (grava a ordem) e confere (semáforo). */
  async function montarRota() {
    await comTrava(async () => {
      // 🔴 TOQUE MUDO É DEFEITO. Montar são 3 idas ao servidor (planejar,
      // conferir, recarregar) — medido, passa de 2s. Sem sinal na tela o
      // motorista toca de novo achando que falhou. O mock já tem o estado
      // "carregando" (esqueleto): é ele que responde ao dedo.
      const estadoAntes = estadoRota;
      try { estadoRota = 'carregando'; if (typeof window.pintar === 'function') window.pintar(false); } catch (_) { /* sem seam */ }
      const devolverEstado = () => { try { estadoRota = estadoAntes; } catch (_) { /* idem */ } };

      let plano;
      try {
        if (montarDia && montarDia !== diaDaSemana() && ehAdmin()) {
          // Outro dia puxado pra HOJE: o prepare materializa a agenda do dia
          // escolhido em cima do dia operacional de hoje e já planeja.
          const prep = await window.API.post('/logistica/admin-route/prepare', {
            operationalDate: hojeISO(), sourceDates: [dataDoDia(montarDia)],
          });
          plano = prep && prep.plan ? prep.plan : prep;
        } else {
          plano = await window.API.post('/logistica/rota/planejar', { date: hojeISO() });
        }
      } catch (e) { devolverEstado(); return avisoErro(e); }
      const paradas = Array.isArray(plano && plano.stops) ? plano.stops
        : (Array.isArray(plano && plano.items) ? plano.items
          : (Array.isArray(plano && plano.paradas) ? plano.paradas : []));

      // semáforo dos endereços: só ATRASA a montagem se o servidor acusar algo.
      let conf = null;
      try { conf = await window.API.post('/logistica/rota/conferir', { date: hojeISO() }); } catch (_) { /* aviso é enfeite, não portão */ }
      const comAviso = conf && Array.isArray(conf.items)
        ? conf.items.filter((i) => Array.isArray(i.motivosVisiveis) && i.motivosVisiveis.length).length
        : 0;

      devolverEstado();          // o esqueleto sai antes do dado entrar
      // 🔴 SÓ ABRE A MONTAGEM SE A ROTA ENTROU. Com o `/logistica/rota` no chão
      // o `carregarRota` volta no catch antes de escrever no seam, e a tela de
      // montagem abria com as 6 paradas do desenho e "R$ 336,00" — dinheiro de
      // exemplo numa tela de decisão. Falhou, avisa e fica onde está.
      if (!(await carregarRota())) {
        return avisoErro(new Error('Não consegui montar agora. Tente de novo.'));
      }
      if (comAviso && typeof window.usarDados === 'function') {
        window.usarDados('montagem', { iniciarSub: `${comAviso} com aviso` });
      }
      if (comAviso && typeof window.portao === 'function') {
        window.portao({
          tom: 'alerta', ico: 'gps', titulo: `${comAviso} ${comAviso === 1 ? 'endereço com aviso' : 'endereços com aviso'}`,
          sub: 'Dá pra sair assim, mas confira antes.', acoes: [['Ver a rota', 'principal']],
        });
      }
      // Rota montada: a escolha de dia cumpriu o papel e volta pro padrão —
      // seleção presa deixaria o PRÓXIMO montar puxando o dia velho calado.
      if (montarDia) { montarDia = 0; window.usarDados('rota', { montarDiaSel: 0 }); }
      if (typeof window.ir === 'function') window.ir('montagem');
    });
  }

  /** iniciar: mostra o custo REAL e só então cobra. */
  async function iniciarRota() {
    await comTrava(async () => {
      let custo = null;
      try { custo = await window.API.get('/logistica/rota/custo-preview'); } catch (e) { return avisoErro(e); }
      // 🔴 NOME DE CAMPO DE DINHEIRO NÃO SE CHUTA. A 1ª versão adivinhou
      // (`custo`/`total`/`creditos`) e a tela mostrou "Debita 0" com o servidor
      // dizendo 4,8 — mentira com cara de app pronto. Estes são os nomes
      // MEDIDOS na resposta, e quem decide se pode sair é o servidor
      // (`saldoCobre`), não uma conta minha na tela.
      const debita = Number(custo && custo.creditosAIniciar);
      const saldo = Number(custo && custo.saldoAtual);
      const temSaldo = custo && typeof custo.saldoCobre === 'boolean'
        ? custo.saldoCobre
        : (isFinite(saldo) && isFinite(debita) ? saldo >= debita : true);
      const num = (v) => (isFinite(v) ? String(v).replace('.', ',') : '');
      window.portao({
        tom: temSaldo ? 'info' : 'trava',
        ico: temSaldo ? 'play' : 'card',
        titulo: temSaldo ? 'Iniciar a rota?' : 'Créditos insuficientes',
        sub: isFinite(saldo)
          ? `Debita ${num(debita)} · você tem ${num(saldo)}`
          : `Debita ${num(debita)}`,
        acoes: temSaldo ? [['Agora não', ''], ['Iniciar', 'principal']] : [['Fechar', '']],
        classe: temSaldo ? 'duas' : '',
      });
      // o "Iniciar" do portão é quem cobra — nunca este trecho.
      const wrap = naCamada('.portao-wrap');
      const botao = wrap && wrap.querySelector('.principal');
      if (temSaldo && botao) {
        botao.addEventListener('click', () => comTrava(async () => {
          try {
            await window.API.post('/logistica/rota/iniciar', { date: hojeISO() });
          } catch (e) {
            // 🔴 NUNCA MORRER CALADO (dono, §1.3): primeiro a verdade do
            // servidor — se a rota JÁ ESTÁ em andamento, a resposta certa é
            // levar o motorista pra ela, não um erro genérico.
            await carregarRota();
            if (estadoRota === 'rodando' || estadoRota === 'pausada') {
              if (typeof window.ir === 'function') window.ir('rota');
              return window.portao({
                tom: 'info', ico: 'route', titulo: 'A rota já está em andamento',
                sub: 'Você caiu direto nela.', acoes: [['Fechar', '']],
              });
            }
            return avisoErro(e);
          }
          await carregarRota();
          if (typeof window.ir === 'function') window.ir('rota');
        }), { once: true });
      }
    });
  }

  /** cancelar: encerra a rota; entrega aberta volta pra agenda, nunca some. */
  async function cancelarRota() {
    if (typeof window.portao !== 'function') return;
    window.portao({
      tom: 'alerta', ico: 'close', titulo: 'Cancelar a rota de hoje?',
      sub: 'As entregas em aberto voltam pra agenda.',
      acoes: [['Não', ''], ['Cancelar rota', 'principal']], classe: 'duas',
    });
    const botao = naCamada('.portao-wrap .principal');
    if (!botao) return;
    botao.addEventListener('click', () => comTrava(async () => {
      try { await window.API.post('/logistica/rota/encerrar', { date: hojeISO() }); } catch (e) { return avisoErro(e); }
      await carregarRota();
      if (typeof window.ir === 'function') window.ir('rota');
    }), { once: true });
  }

  /* ------------------------------------------------------------------------
     7. L3a — O MAPA DE VERDADE DENTRO DA CASCA DO MOCK.
     O mock ILUSTRA o mapa em SVG: serve pra decidir a casca, não pra guiar
     ninguém. Aqui o palco (`[data-mapa]`) recebe o maplibre com o estilo e os
     tiles que o PRÓPRIO APARELHO serve (`/tiles/{z}/{x}/{y}.pbf`, mesma origem
     — por isso CSP e CORS deixam de existir em vez de serem contornados). Todo
     o cromo em volta (seta, manobra, bússola, velocímetro, rodapé) continua o
     do mock, intocado. O desenho fica embaixo como fundo de espera: tela preta
     enquanto o mapa sobe é pior que a ilustração.
     ------------------------------------------------------------------------ */
  const MAPA_TILES = 'https://appassets.androidplatform.net/tiles/{z}/{x}/{y}.pbf';
  // 🔴 O basemap acaba no z14. Sem declarar o teto, o maplibre pede z15+, não
  // acha nada e a tela fica VAZIA justo no zoom de rua — que é onde o motorista
  // olha. Com o teto, o z14 estica (overzoom), que é o certo.
  const MAPA_ZOOM_MAX = 14;
  let maplibrePromessa = null;
  const carregarMaplibre = () => {
    if (window.maplibregl) return Promise.resolve(window.maplibregl);
    if (maplibrePromessa) return maplibrePromessa;
    maplibrePromessa = new Promise((ok, falha) => {
      const s = document.createElement('script');
      s.src = 'vendor/maplibre-gl.js';
      s.onload = () => (window.maplibregl ? ok(window.maplibregl) : falha(new Error('Mapa indisponível.')));
      s.onerror = () => falha(new Error('Mapa indisponível.'));
      document.head.appendChild(s);
      setTimeout(() => falha(new Error('Mapa indisponível.')), 9000);
    });
    return maplibrePromessa;
  };
  const estiloCache = {};
  async function estiloDoMapa(escuro) {
    const nome = escuro ? 'dark' : 'light';
    if (!estiloCache[nome]) {
      const r = await fetch(`mapa/style-${nome}.json`);
      estiloCache[nome] = await r.text();
    }
    // objeto NOVO a cada mapa: o maplibre mexe no que recebe, e dois mapas
    // dividindo o mesmo objeto é um contaminando o estilo do outro.
    const estilo = JSON.parse(estiloCache[nome]);
    const fonte = estilo.sources && estilo.sources.protomaps;
    if (!fonte) throw new Error('Estilo do mapa sem a fonte protomaps.');
    delete fonte.url;                 // era o marcador __HBX_TILES__
    fonte.type = 'vector';
    fonte.tiles = [MAPA_TILES];
    fonte.minzoom = 0;
    fonte.maxzoom = MAPA_ZOOM_MAX;
    // 🔴 SPRITE E GLYPHS PRECISAM SER ABSOLUTOS. O maplibre recusa caminho
    // relativo no sprite ("must be absolute") e o erro só aparece no console:
    // o mapa sobe, mas SEM ícone e — no caso dos glyphs — sem NOME DE RUA, que
    // é metade da utilidade do mapa pra quem dirige.
    const base = `${location.origin}/assets/app/`;
    if (estilo.sprite && !/^https?:/.test(estilo.sprite)) estilo.sprite = base + estilo.sprite;
    if (estilo.glyphs && !/^https?:/.test(estilo.glyphs)) estilo.glyphs = base + estilo.glyphs;
    return estilo;
  }

  /* O centro do mapa. Quem o escreve é a ÚNICA assinatura do GPS, lá embaixo
     na §7c — havia um `watchPosition` aqui só pra isto, e um segundo pro cromo
     da navegação seria o mesmo aparelho pedindo posição duas vezes, pagando
     bateria dobrada pra ter dois fixes que discordam. */
  let ultimaPos = null;

  /** monta (ou reaproveita) o mapa do palco visível */
  async function montarMapa(palco) {
    if (!palco || palco.__hbxMapa) return;
    palco.__hbxMapa = true;                      // idempotente: 1 mapa por palco
    let maplibregl; let estilo;
    try {
      maplibregl = await carregarMaplibre();
      estilo = await estiloDoMapa(document.documentElement.dataset.luz !== 'claro');
    } catch (_) { palco.__hbxMapa = false; return; }   // sem mapa, fica o desenho
    if (!document.body.contains(palco)) { palco.__hbxMapa = false; return; }

    const alvo = document.createElement('div');
    alvo.className = 'mapa-vivo';
    palco.appendChild(alvo);

    const paradas = (typeof PARADAS !== 'undefined' ? PARADAS : []).filter((p) => p.lat && p.lng);
    const centro = ultimaPos || (paradas[0] ? { lat: paradas[0].lat, lng: paradas[0].lng } : null);
    const mapa = new maplibregl.Map({
      container: alvo,
      style: estilo,
      center: centro ? [centro.lng, centro.lat] : [-47.5863, -22.4226],
      zoom: centro ? 15 : 12,
      maxZoom: 18,
      attributionControl: false,
    });
    palco.__hbxMapaObj = mapa;
    mapa.on('load', () => {
      palco.classList.add('pronto');             // o desenho de espera se apaga
      paradas.forEach((p) => {
        const pino = document.createElement('div');
        pino.textContent = String(p.n);
        pino.style.cssText = 'width:26px;height:26px;border-radius:50%;display:grid;place-items:center;'
          + 'font:500 12px Inter,sans-serif;background:var(--map-pino);color:var(--map-pino-tinta);'
          + 'border:1.5px solid var(--map-rota)';
        new maplibregl.Marker({ element: pino }).setLngLat([p.lng, p.lat]).addTo(mapa);
      });
      if (ultimaPos) new maplibregl.Marker({ color: '#3d8bff' }).setLngLat([ultimaPos.lng, ultimaPos.lat]).addTo(mapa);
    });
    // as empresas do corredor não são marcador do maplibre: elas são a peça
    // do desenho, e quem as coloca no chão é a câmera. Ver `posicionarEmpresas`.
    const acompanharCamera = () => posicionarEmpresas();
    mapa.on('move', acompanharCamera);
    mapa.on('zoom', acompanharCamera);
    mapa.on('resize', acompanharCamera);
    mapa.on('load', acompanharCamera);
  }

  /* ------------------------------------------------------------------------
     7b. L3b — AS EMPRESAS DO CORREDOR NO CHÃO (prospector).

     O desenho já sabe DESENHAR a empresa (prédio, três estados, a cena de
     acender). O que ele não pode saber é ONDE ela cai na tela: isso muda a
     cada quadro que a câmera se mexe. Então a divisão é essa e é limpa —
     **o DADO passa pelo seam, a GEOMETRIA não**:

       · `usarDados('mapa', {empresas:[…]})` diz QUAIS empresas existem e
         quais estão acesas → repinta a tela, como toda outra seção;
       · esta função escreve `--x`, `--y` e `--esc` direto no elemento, a cada
         `move`/`zoom`. Passar posição de mapa pelo repinte seria repintar a
         tela inteira 60 vezes por segundo — e, pior, recomeçaria a cena de
         acender a cada quadro.

     🔴 PROPORCIONAL — a regra de escala, que é o pedido literal do dono
     ("deixe proporcional as empresas q forem aparecendo"):

         esc = 2^(zoom − 16,5) × perto,   preso entre 0,55 e 1,80
         perto = 1 − 0,35 × min(1, distância_em_metros / 300)

     · `2^(zoom−16,5)` é a conta da própria projeção: um metro de chão ocupa o
       DOBRO de pixel a cada nível de zoom. É isso que faz o prédio se
       comportar como coisa que está na rua e não como adesivo colado no
       vidro. 16,5 é o zoom de rua, onde o prédio tem o tamanho do desenho.
     · PISO 0,55 (≈9×10 px): abaixo disso ele vira mancha — some debaixo do
       próprio dedo que ia tocar nele.
     · TETO 1,80 (≈29×32 px): acima disso ele TAMPA o traço da rota e a parada
       da vez. A rota é o trabalho; a empresa é a oferta — a oferta nunca
       cobre o trabalho.
     · `perto` faz empresa longe nascer menor (35% menor a 300 m ou mais). É o
       "empresa longe = menor" com o mapa ainda deitado: quando a câmera
       ganhar inclinação, a perspectiva soma, não briga.

     O RÓTULO não escala: prédio é mundo, nome é interface. Nome que encolhe
     com o zoom fica ilegível justo quando há mais deles na tela.
     ------------------------------------------------------------------------ */
  /* O CONTRATO DO SEAM, pra leva do backend não ter que adivinhar. Cada item
     de `usarDados('mapa', { empresas: [...] })`:

       id      obrigatório pro GANCHO — sem ele o prédio aparece e NÃO é
               clicável (é a lei "o gancho nasce do dado"), que é o certo
               enquanto não houver o que abrir;
       nome    o que é digitado em cima do prédio;
       lat/lng sem elas o prédio não é posicionado — a tela não inventa lugar;
       distM   metros até a parada (vem do `ProspectoRota.distM`) — é o que
               faz a de longe nascer menor;
       aceso   o prospector decidiu acender AGORA (o "3 a 5 vezes no dia");
       ordem   fila das 6 janelas, ex. [0,3,1,5,2,4] — uma por prédio, senão
               os prédios piscam em coro;
       atraso  escalona quem acende primeiro quando duas acendem juntas.

     Faltou campo? o desenho tem padrão pra todos MENOS nome/lat/lng — e sem
     esses três a empresa simplesmente não entra na tela. */
  const EMP_ZOOM_BASE = 16.5;
  const EMP_ESC_PISO = 0.55;
  const EMP_ESC_TETO = 1.8;
  const EMP_DIST_CHEIA = 300;

  function posicionarEmpresas() {
    const palco = naCamada('[data-mapa]');
    const mapa = palco && palco.__hbxMapaObj;
    const cena = palco && palco.parentElement;
    if (!mapa || !cena) return;
    // 🔴 `.emp[data-lat]`: sem coordenada não há o que projetar. O desenho
    // posiciona por porcentagem e não tem `data-lat` — por isso o mock não é
    // afetado por nada daqui, e o portão de pixel segue byte a byte.
    const alvos = cena.querySelectorAll('.emp[data-lat]');
    if (!alvos.length) return;
    let zoom;
    try { zoom = mapa.getZoom(); } catch (_) { return; }
    if (!Number.isFinite(zoom)) return;
    const porZoom = Math.pow(2, zoom - EMP_ZOOM_BASE);
    alvos.forEach((el) => {
      const lat = Number(el.dataset.lat); const lng = Number(el.dataset.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      let ponto;
      try { ponto = mapa.project([lng, lat]); } catch (_) { return; }
      const dist = Number(el.dataset.dist) || 0;
      const perto = 1 - 0.35 * Math.min(1, dist / EMP_DIST_CHEIA);
      const esc = Math.min(EMP_ESC_TETO, Math.max(EMP_ESC_PISO, porZoom * perto));
      el.style.setProperty('--x', `${ponto.x.toFixed(1)}px`);
      el.style.setProperty('--y', `${ponto.y.toFixed(1)}px`);
      el.style.setProperty('--esc', esc.toFixed(3));
    });
  }

  /* 🔴 REPINTE NÃO RECOMEÇA A CENA DE QUEM JÁ ACENDEU — é a Lei nº10 desta
     frente no tamanho desta tela. Acender a 2ª empresa repinta a seção, e a
     1ª nasceria de novo apagada pra re-digitar o nome do zero: o app com cara
     de que descobriu duas vezes a mesma coisa. Quem já estava aceso chega no
     FIM da cena. A respiração do halo é infinita e não se "termina" — ela
     fica rodando, que é o certo. */
  function encerrarCenaDe(jaAcesas) {
    if (!jaAcesas || !jaAcesas.size) return;
    document.querySelectorAll('.emp.on[data-empresa]').forEach((el) => {
      if (!jaAcesas.has(String(el.dataset.empresa))) return;
      let anims = [];
      try { anims = el.getAnimations({ subtree: true }); } catch (_) { return; }
      anims.forEach((a) => {
        try {
          if (a.effect && a.effect.getTiming().iterations === Infinity) return;
          a.finish();
        } catch (_) { /* animação que não termina fica onde está */ }
      });
    });
  }

  /* O GESTO. Encostar num prédio ACENDE ele na hora — é a "prioridade de
     usuário" do §F1 do plano do prospector, e é a única parte que não depende
     de servidor nenhum: a empresa já está na tela, o toque só antecipa o que
     o prospector faria sozinho.
     ⬜ A FALA (`HBX.speak`) e o "abrir lead" — que DEBITA 1 crédito e cria o
     lead na mesa do /vendas — são a leva seguinte, junto com o backend. Botão
     que cobra não nasce antes da porta que cobra. */
  function acenderEmpresa(id) {
    if (!id || typeof window.usarDados !== 'function') return;
    let lista;
    try { lista = ((DADOS.mapa || {}).empresas) || []; } catch (_) { return; }
    const antes = new Set(lista.filter((e) => e.aceso && e.id).map((e) => String(e.id)));
    if (antes.has(String(id))) return;      // já acesa: o toque não re-encena
    window.usarDados('mapa', {
      empresas: lista.map((e) => (String(e.id) === String(id) ? Object.assign({}, e, { aceso: true }) : e)),
    });
    requestAnimationFrame(() => { encerrarCenaDe(antes); posicionarEmpresas(); });
  }

  /* ------------------------------------------------------------------------
     7c. L3b — O CROMO DA NAVEGAÇÃO COM FONTE (§4.1 do PR07082026).

     O seam `DADOS.gps` já existe e já nasce VAZIO (ver `apagarDemonstracao`).
     Esta seção é quem o enche, das três fontes que o plano nomeia:

       · `navigator.geolocation` → velocidade, rumo e a precisão do GPS;
       · `ENTREGAS`             → parada N de M, nome, endereço e o que falta;
       · `/logistica/osrm/route` → a manobra (distância, verbo, rua, o depois)
                                   e o total (chegada, restante, distância).

     🔴 O QUE NÃO TEM FONTE NÃO É ESCRITO. Toda função daqui devolve '' quando
     não sabe, e o template do mock some com o pedaço. É a régua do §4.6.5, e
     é ela que faz esta tela poder abrir só com o mapa e o Encerrar.

     🔴 "VOCÊ ESTÁ NA PORTA" MORREU COM A DEMONSTRAÇÃO, DE PROPÓSITO. Era um
     VEREDITO (irmão do selo "Tudo certo!" que o §4.6.5 matou) e não tem porta
     que o emita. `chegouPrecisao` diz o fato que o aparelho mede — "GPS ±6 m"
     — e nada além. Quem já diz que chegou é o título da tela.
     ------------------------------------------------------------------------ */
  const R_TERRA = 6371000;
  const rad = (g) => (g * Math.PI) / 180;
  /** metros entre dois {lat,lng} */
  function metrosEntre(a, b) {
    if (!a || !b) return Infinity;
    const dLat = rad(b.lat - a.lat); const dLng = rad(b.lng - a.lng);
    const s = Math.sin(dLat / 2) ** 2
      + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R_TERRA * Math.asin(Math.min(1, Math.sqrt(s)));
  }
  /** 240 m · 1,2 km — a mesma régua do `distancia()` da lista de paradas */
  const emMetros = (m) => (!(m >= 0) ? ''
    : (m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m)} m`));
  /** 45 min · 1 h 20 — acima de uma hora "95 min" não é jeito de ler tempo */
  const emMinutos = (s) => {
    if (!(s >= 0)) return '';
    const min = Math.max(1, Math.round(s / 60));
    return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
  };
  const maiuscula = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : '');
  /* 8 rumos, em português: Leste é L e Oeste é O (N/S/L/O é o que está escrito
     em toda bússola daqui — E de "East" seria tradução pela metade). */
  const ROSA = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];
  const cardeal = (g) => (Number.isFinite(g) ? ROSA[Math.round(((g % 360) + 360) % 360 / 45) % 8] : '');

  /* 🔴 A TABELA DE MANOBRA É A DO APP QUE JÁ RODA (`osrmStepInstrucao` do
     app.js, S5 21/07), COPIADA SEM UMA PALAVRA NOVA. Dois fronts do mesmo
     produto não podem falar dialetos diferentes na hora de mandar virar. E ela
     é MÍNIMA de propósito (Lei 8): manobra fora da tabela devolve NADA e o
     passo é descartado — inventar copy de navegação é pior que ficar quieto.
     O ícone vem do mesmo lugar da frase, senão a seta e o texto discordam. */
  function manobraDoPasso(passo) {
    const m = (passo && passo.maneuver) || {};
    const tipo = String(m.type || '');
    const mod = String(m.modifier || '');
    // 🔴 NOME DE RUA É TEXTO DE TERCEIRO (vem do OSM) e o template do mock
    // interpola CRU — mesma lei do nome de cliente lá em cima (§L1). Uma rua
    // com "<" quebraria a marcação e o cartão da manobra sumiria sem erro
    // nenhum, na tela de quem está dirigindo. Escapa na FONTE.
    const rua = esc(String((passo && passo.name) || '').trim());
    const saida = (verbo, icone) => ({ verbo, icone, rua });
    if (tipo === 'arrive') return saida('você chegou', 'check');
    if ((tipo === 'roundabout' || tipo === 'rotary') && Number.isFinite(Number(m.exit))) {
      return saida(`na rotatória, pegue a ${Math.trunc(Number(m.exit))}ª saída`, 'nav');
    }
    if (mod === 'slight left') return saida('mantenha-se à esquerda', 'curvaEsquerda');
    if (mod === 'slight right') return saida('mantenha-se à direita', 'curvaDireita');
    if (tipo === 'turn' && mod === 'left') return saida('vire à esquerda', 'curvaEsquerda');
    if (tipo === 'turn' && mod === 'right') return saida('vire à direita', 'curvaDireita');
    if (tipo === 'continue' || tipo === 'new name') {
      return saida(rua ? `continue na ${rua}` : 'continue', 'nav');
    }
    return null;
  }

  /* ---- A POSIÇÃO ---------------------------------------------------------
     O `watchPosition` que já existia guardava só lat/lng (o mapa precisava do
     centro). Agora ele guarda o fix INTEIRO, porque velocidade, rumo e
     precisão são three campos da tela — e são os únicos que não custam rede. */
  let ultimoFix = null;
  /* 🔴 RUMO PARADO É RUÍDO — a lição já paga no app que roda (`navBearingConfiavel`).
     No farol o aparelho reporta qualquer coisa; mostrar "SO" com o carro parado
     é a bússola mentindo, e o mesmo número ainda vai restringir a saída no
     pedido de rota. Abaixo de ~9 km/h não se fala em rumo. */
  const RUMO_VELOCIDADE_MIN_MPS = 2.5;
  const rumoConfiavel = (fix) => (fix && Number.isFinite(fix.velMps) && fix.velMps >= RUMO_VELOCIDADE_MIN_MPS
    && Number.isFinite(fix.rumoGraus) ? fix.rumoGraus : null);

  /* ---- O PEDIDO DE ROTA, COM FREIO ---------------------------------------
     🔴 O RETRAÇO É O QUE JÁ CUSTOU UMA MADRUGADA (§4.1). As três regras:

       1. o resultado guardado leva o CARIMBO da entrada que o gerou. Trocou a
          rota, trocou a assinatura — traço velho não sobrevive à troca;
       2. UM pedido em voo por vez, intervalo mínimo, e recalcula antes da hora
          só se o carro andou de verdade;
       3. orçamento: backoff quando a fonte falha e TETO POR DIA. Roteador em
          laço é conta de servidor e bateria de motorista.

     Entre dois pedidos a manobra NÃO congela: a distância até a curva é
     recalculada do fix atual contra o ponto da manobra, que já veio na
     resposta. É de graça e é o que faz a tela parecer um GPS em vez de um
     cartaz que troca de minuto em minuto. */
  const NAV_INTERVALO_MS = 15000;      // piso entre dois pedidos
  const NAV_ANDOU_M = 120;             // andou isto ⇒ pode pedir antes da hora
  const NAV_TETO_DIA = 400;            // teto por dia operacional
  const NAV_BACKOFF_MS = [2000, 5000, 15000, 60000];
  let navRota = null;                  // { assinatura, passos, totalM, totalS, em }
  let navPedindo = false;
  let navUltimoPedidoEm = 0;
  let navUltimaOrigem = null;
  let navFalhas = 0;
  let navGastoDia = { dia: '', n: 0 };

  const navGastar = () => {
    const dia = diaOperacional();
    if (navGastoDia.dia !== dia) navGastoDia = { dia, n: 0 };
    if (navGastoDia.n >= NAV_TETO_DIA) return false;
    navGastoDia.n += 1;
    return true;
  };

  /** as paradas que ainda faltam, na ordem, com pino */
  function paradasPendentes() {
    const lista = [];
    ENTREGAS.forEach((reg) => {
      const it = reg.item || {};
      const s = String(it.status || '');
      if (s === 'entregue' || s === 'cancelada') return;
      lista.push({ n: reg.n, item: it });
    });
    return lista.sort((a, b) => a.n - b.n);
  }
  const pinoDa = (it) => {
    const c = (it && it.cliente) || {};
    return (typeof c.lat === 'number' && typeof c.lng === 'number') ? { lat: c.lat, lng: c.lng } : null;
  };

  /* ---- O ANEL DO "TÔ CHEGANDO" -------------------------------------------
     🔴 A CHAVE EXISTIA E O AVISO NÃO SAÍA — a corrente estava CORTADA no meio.
     No app que já roda ela tem três elos: o geofence nativo dispara
     `hbx:arrival`, o `hbx:arrival` chama `POST /logistica/entregas/:id/chegando`
     e só então o servidor manda o WhatsApp pro cliente. O app novo não tem
     geofence nativo (a folha abre no TOQUE) e ninguém chamava o `chegando` —
     então `avisoChegandoEnabled` era uma chave que gravava no banco e não
     produzia aviso nenhum. Ligar a chave sem religar a corrente seria entregar
     a mentira com a cara arrumada.

     O anel é o que o backend PEDE ("o app só arma o anel de ~500m quando isto é
     true"): a cada fix do GPS, parada pendente com pino dentro do raio ganha UM
     POST. A marcação é feita ANTES da ida e nunca é desfeita — o servidor é a
     autoridade de idempotência (claim race-safe em `avisoChegandoAt`) e o
     controller responde `{ok:true}` sempre, de propósito, pra que o app não
     tenha o que reenviar. Cliente que reenvia é o começo de todo loop.
     ------------------------------------------------------------------------ */
  let avisoChegandoAtivo = false;
  let avisoChegandoRaioM = 500;
  const jaAvisados = new Set();

  function anelDeChegada() {
    if (!avisoChegandoAtivo || !ultimaPos || !temPonte()) return;
    paradasPendentes().forEach((p) => {
      const id = String((p.item && p.item.id) || '');
      if (!id || jaAvisados.has(id)) return;
      const pino = pinoDa(p.item);
      if (!pino || metrosEntre(ultimaPos, pino) > avisoChegandoRaioM) return;
      jaAvisados.add(id);
      // Best-effort de verdade: não trava a rota, não avisa a tela, não repete.
      window.API.post(`/logistica/entregas/${encodeURIComponent(id)}/chegando`, {}).catch(() => {});
    });
  }

  /** `lng,lat;lng,lat;…` — origem + as paradas que faltam, na ordem da rota */
  function coordenadasDaNavegacao() {
    if (!ultimoFix) return null;
    const pontos = [{ lat: ultimoFix.lat, lng: ultimoFix.lng }];
    paradasPendentes().forEach((p) => { const pino = pinoDa(p.item); if (pino) pontos.push(pino); });
    if (pontos.length < 2) return null;
    return pontos.map((p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(';');
  }

  /* Direção no pedido — a lição de 30/07 do dono ("vc não retraça a rota"):
     sem `bearings` o roteador acha que dá pra sair do ponto pra qualquer lado e
     manda fazer o retorno no meio da avenida. Grau de 15 em 15 pra bússola
     tremendo não gerar assinatura nova a cada fix. */
  const BEARING_TOLERANCIA = 60;
  function bearingsDe(rumo, pontos) {
    if (rumo == null || pontos < 2) return '';
    const grau = ((Math.round(rumo / 15) * 15) % 360 + 360) % 360;
    return `${grau},${BEARING_TOLERANCIA}${';'.repeat(pontos - 1)}`;
  }

  async function pedirRota() {
    if (navPedindo || !temPonte()) return;
    const coords = coordenadasDaNavegacao();
    if (!coords) return;
    const rumo = rumoConfiavel(ultimoFix);
    const bearings = bearingsDe(rumo, coords.split(';').length);
    const assinatura = `${coords}#${bearings}`;
    const agora = Date.now();
    const andou = navUltimaOrigem ? metrosEntre(navUltimaOrigem, ultimoFix) : Infinity;
    const esperar = navFalhas ? NAV_BACKOFF_MS[Math.min(navFalhas - 1, NAV_BACKOFF_MS.length - 1)] : NAV_INTERVALO_MS;
    if (agora - navUltimoPedidoEm < esperar && andou < NAV_ANDOU_M) return;
    if (navRota && navRota.assinatura === assinatura && agora - navRota.em < NAV_INTERVALO_MS) return;
    if (!navGastar()) return;

    navPedindo = true;
    navUltimoPedidoEm = agora;
    navUltimaOrigem = { lat: ultimoFix.lat, lng: ultimoFix.lng };
    try {
      const alvo = `/logistica/osrm/route?coords=${encodeURIComponent(coords)}&steps=true`
        + (bearings ? `&bearings=${encodeURIComponent(bearings)}` : '');
      const r = await window.API.get(alvo);
      const rota = r && r.code === 'Ok' && r.routes && r.routes[0];
      if (!rota) throw new Error('Rota viária não encontrada.');
      // 🔴 CARIMBO. Sem ele, a resposta que voltou tarde escreve o traço de uma
      // rota que já não é a de agora — e o motorista segue a manobra da rota
      // anterior sem nada na tela dizendo que mudou.
      navRota = {
        assinatura,
        em: Date.now(),
        totalM: Number.isFinite(Number(rota.distance)) ? Number(rota.distance) : null,
        totalS: Number.isFinite(Number(rota.duration)) ? Number(rota.duration) : null,
        passos: passosDaPrimeiraPerna(rota),
      };
      navFalhas = 0;
    } catch (_) {
      // 🔴 FALHOU: NÃO APAGA O QUE ESTÁ NA TELA. A manobra de 20 s atrás ainda
      // é melhor que uma tela em branco pra quem está no volante — e a
      // distância até a curva continua sendo recalculada do GPS, de graça.
      navFalhas += 1;
    } finally {
      navPedindo = false;
      pintarNavegacao();
    }
  }

  /** os passos com instrução da 1ª perna (origem → parada da vez) */
  function passosDaPrimeiraPerna(rota) {
    const perna = (rota.legs || [])[0] || {};
    return (perna.steps || []).map((passo) => {
      const m = manobraDoPasso(passo);
      const loc = passo && passo.maneuver && passo.maneuver.location;
      if (!m || !Array.isArray(loc) || loc.length < 2) return null;
      const lng = Number(loc[0]); const lat = Number(loc[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return Object.assign({ lat, lng }, m);
    }).filter(Boolean);
  }

  /* Qual manobra mandar agora: a 1ª ainda À FRENTE. "À frente" aqui é a que
     está a mais de 25 m — passou dela, ela já era, e insistir é o GPS falando
     de uma curva que ficou pra trás. */
  const MANOBRA_PASSOU_M = 25;
  function manobraDaVez() {
    if (!navRota || !ultimoFix) return null;
    const passos = navRota.passos || [];
    for (let i = 0; i < passos.length; i += 1) {
      const d = metrosEntre(ultimoFix, passos[i]);
      if (d > MANOBRA_PASSOU_M) return { passo: passos[i], distancia: d, depois: passos[i + 1] || null };
    }
    return null;
  }

  /* ---- A PINTURA ---------------------------------------------------------
     Um lugar só escreve no seam do GPS, e ele escreve TUDO — inclusive o vazio.
     🔴 Escrever só o que eu sei deixaria o resto com o valor anterior: o seam é
     MERGE (a lei do §4.6.5), e campo que ninguém reescreve fica pra sempre. */
  function pintarNavegacao() {
    if (typeof window.usarDados !== 'function') return;
    const pendentes = paradasPendentes();
    const vez = pendentes[0] || null;
    const cliente = (vez && vez.item && vez.item.cliente) || {};
    const total = ENTREGAS.size;

    // o que falta de estrada: soma das pernas ainda por dirigir
    const faltaM = pendentes.reduce((s, p) => {
      const m = Number(p.item && p.item.legDistanceM);
      return s + (Number.isFinite(m) && m > 0 ? m : 0);
    }, 0);

    const m = manobraDaVez();
    const rumo = rumoConfiavel(ultimoFix);
    const velKmh = ultimoFix && Number.isFinite(ultimoFix.velMps) && ultimoFix.velMps >= 0
      ? String(Math.round(ultimoFix.velMps * 3.6)) : '';
    const precisao = ultimoFix && Number.isFinite(ultimoFix.precisaoM)
      ? `GPS ±${Math.round(ultimoFix.precisaoM)} m` : '';

    // chegada = agora + o que a rota disse que falta. Sem rota, sem hora — a
    // conta do relógio é do APARELHO, mas o tempo é do roteador.
    const chegada = navRota && navRota.totalS != null
      ? hora(new Date(Date.now() + navRota.totalS * 1000).toISOString()) : '';

    window.usarDados('gps', {
      manobraIcone: m ? m.passo.icone : '',
      manobraDist: m ? emMetros(m.distancia) : '',
      manobraVerbo: m ? maiuscula(m.passo.verbo) : '',
      manobraRua: m ? (m.passo.rua || '') : '',
      // "depois, siga em frente por 1,2 km" do desenho = a PRÓXIMA manobra. Só
      // entra se ela existir de verdade; encadeada é o que separa um app com
      // mapa de um GPS (item 7 do app que já roda).
      manobraDepois: m && m.depois ? `depois, ${m.depois.verbo}` : '',
      rumo: cardeal(rumo),
      velocidade: velKmh,
      paradaN: vez ? String(vez.n) : '',
      paradaTotal: total ? String(total) : '',
      paradaNome: vez ? esc(cliente.nome) : '',
      chegada,
      restante: navRota ? emMinutos(navRota.totalS) : '',
      distancia: navRota ? emMetros(navRota.totalM) : '',
      chegouEndereco: vez ? esc(cliente.endereco) : '',
      chegouPrecisao: precisao,
      // "faltam N paradas" conta as que sobram DEPOIS desta — quem está na
      // porta da 3ª quer saber o que vem pela frente, não recontar a de agora.
      // O VERBO CONCORDA: uma parada FALTA, cinco FALTAM. Medido: com 1 pendente
      // a tela dizia "faltam 1 parada". A ponte escolhe a forma porque só ela
      // sabe o número; as duas palavras são do desenho.
      chegouFaltam: pendentes.length > 1
        ? `${pendentes.length - 1} parada${pendentes.length - 1 > 1 ? 's' : ''}` : '',
      chegouFaltamVerbo: pendentes.length === 2 ? 'falta' : 'faltam',
      chegouKm: faltaM > 0 ? emMetros(faltaM) : '',
    });
  }

  /* Só se mexe com a tela do GPS à vista. O `watchPosition` é único e vive o
     app inteiro (o mapa da rota também bebe dele); o que liga e desliga é o
     PEDIDO DE ROTA e o repinte — bateria e conta de roteador não são pagas por
     tela que ninguém está olhando. */
  const naNavegacao = () => telaAtual() === 'mapa' || telaAtual() === 'mapachegou';
  function aoMover() {
    if (!naNavegacao()) return;
    pintarNavegacao();
    if (telaAtual() === 'mapa') pedirRota();
  }

  /* ---- A ÚNICA ASSINATURA DO GPS -----------------------------------------
     Era um `watchPosition` que só guardava o centro do mapa. Vira o fix
     inteiro, e é dele que saem velocímetro, bússola e precisão. */
  if (navigator.geolocation) {
    try {
      navigator.geolocation.watchPosition(
        (p) => {
          const c = p.coords || {};
          ultimoFix = {
            lat: c.latitude, lng: c.longitude,
            velMps: Number.isFinite(c.speed) ? c.speed : null,
            rumoGraus: Number.isFinite(c.heading) ? c.heading : null,
            precisaoM: Number.isFinite(c.accuracy) ? c.accuracy : null,
          };
          ultimaPos = { lat: c.latitude, lng: c.longitude };
          // O anel roda em QUALQUER tela: o motorista chega perto do cliente
          // com o app na lista de paradas, não no GPS. `aoMover` é que é só da
          // navegação — por isso o anel vem antes, e fora dele.
          anelDeChegada();
          aoMover();
        },
        () => {}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
      );
    } catch (_) { /* sem GPS: o mapa abre na 1ª parada e o cromo fica vazio */ }
  }

  /* A BUSCA É DE TECLA, NÃO DE CLIQUE — por isso não cabe no mapa de ações.
     Espera o dedo parar (350ms) antes de ir ao servidor: mandar a cada letra
     enfileira 8 requisições pra digitar "Larissa" e a última nem sempre é a
     que chega por último. O guard `__hbxBusca` é obrigatório: cada repinte
     traz um input NOVO, e sem ele o listener empilhava a cada tecla. */
  let buscaTimer = null;
  function ligarBusca() {
    const cli = naCamada('[data-campo="busca-cliente"]');
    if (cli && !cli.__hbxBusca) {
      cli.__hbxBusca = true;
      cli.addEventListener('input', () => {
        const valor = String(cli.value || '');
        clearTimeout(buscaTimer);
        buscaTimer = setTimeout(() => {
          filtroClientes.busca = valor;
          // O seam guarda o texto pra ele sobreviver ao repinte da lista — sem
          // isso o campo se apagava sozinho no meio da digitação.
          carregarClientes();
        }, 350);
      });
    }
    const prod = naCamada('[data-campo="busca-produto"]');
    if (prod && !prod.__hbxBusca) {
      prod.__hbxBusca = true;
      // Catálogo inteiro já está no aparelho: filtra na hora, sem espera e sem
      // ida ao servidor. O que justifica a diferença pro cliente é o TAMANHO.
      prod.addEventListener('input', () => {
        filtroProdutos.busca = String(prod.value || '');
        carregarProdutos();
      });
    }
  }

  /* Quem abre a tela é quem manda buscar. O mock chama `ir` NU dentro dele, e
     função declarada no topo vira propriedade do window — então trocar
     `window.ir` alcança os toques da barra também (mesmo pacto do `trocarLuz`). */
  if (typeof window.ir === 'function') {
    const irDoMock = window.ir;
    window.ir = function (tela) {
      const r = irDoMock.apply(this, arguments);
      if (tela === 'clientes') carregarClientes();
      if (tela === 'produtos') carregarProdutos();
      if (tela === 'chat') aoAbrirChat();
      if (tela === 'ajustes') carregarAjustes();
      if (tela === 'consumo') carregarConsumo();
      if (tela === 'salvas') carregarSalvas();
      if (tela === 'recarga') carregarRecarga();
      // A carteira do dono busca sozinha, como a Recarga: quem abrisse o
      // Financeiro via o dinheiro do DESENHO, viesse de onde viesse.
      if (tela === 'financeiro') carregarFinanceiro();
      // 🔴 A NAVEGAÇÃO NÃO ESPERA O PRÓXIMO FIX. Entrar na tela já pinta o que
      // se sabe SEM GPS nenhum (parada N de M, nome, endereço, o que falta) e
      // já pede a rota. Sem isto o rodapé nascia vazio e só se enchia no
      // primeiro `watchPosition` — que numa garagem pode demorar.
      if (tela === 'mapa' || tela === 'mapachegou') { pintarNavegacao(); if (tela === 'mapa') pedirRota(); }
      return r;
    };
  }

  // toda pintura de tela pode trazer um palco novo: o mapa nasce junto.
  const observador = new MutationObserver(() => {
    const palco = naCamada('[data-mapa]');
    if (palco) montarMapa(palco);
    // repinte traz elementos NOVOS, sem `--x/--y`: sem isto as empresas
    // nasciam empilhadas no canto até a câmera se mexer.
    posicionarEmpresas();
    ligarBusca();
    ligarCamposDaFicha();
  });
  observador.observe(document.getElementById('app') || document.body, { childList: true, subtree: true });

  /* ------------------------------------------------------------------------
     L10 — ROTAS SALVAS (é aqui que a "Caderneta de <dia>" do L5 vai parar).

     Só LISTA e ABRIR: criar, duplicar, editar e indicar modelo saíram no corte
     de 06/08 — é trabalho de escritório e o desktop já faz. Por isso o par
     "Duplicar / três pontinhos" do desenho não é renderizado com dado real:
     botão que não leva a lugar nenhum é pior que botão ausente.
     ------------------------------------------------------------------------ */
  const MODELOS = new Map();

  async function carregarSalvas() {
    if (!temPonte() || typeof window.usarDados !== 'function') return;
    let r;
    try { r = await window.API.get('/logistica/rota-modelos'); } catch (_) { return fonteCaiu('salvas'); }
    const lista = Array.isArray(r) ? r : [];
    MODELOS.clear();
    lista.forEach((m) => { if (m && m.id) MODELOS.set(String(m.id), m); });
    window.usarDados('salvas', {
      ...fonteVoltou,
      busca: '',
      total: `${lista.length} ${lista.length === 1 ? 'rota salva' : 'rotas salvas'}`,
      // "Ordenar por" precisa de mais de uma ordem pra existir; o servidor
      // devolve uma lista só, na ordem dele.
      ordem: '',
      acoes: 0,
      lista: lista.map((m) => {
        const paradas = Array.isArray(m.paradas) ? m.paradas.length : 0;
        return [
          esc(m.nome),
          // A porta não devolve data de criação; o que ela tem é o DIA da
          // semana do modelo — que é justamente o que identifica a caderneta.
          m.diaSemana ? DIAS_SEMANA[Number(m.diaSemana)] || '' : '',
          String(paradas),
          '',            // produtos: sem fonte
          '',            // marcado: sem fonte
          'route',
          0,
          String(m.id),
        ];
      }),
    });
  }

  /** Abrir = GERAR a rota de hoje a partir do modelo. Cria entrega: confirma. */
  async function abrirSalva(id) {
    const m = MODELOS.get(String(id));
    if (!m || typeof window.portao !== 'function') return;
    const paradas = Array.isArray(m.paradas) ? m.paradas.length : 0;
    window.portao({
      tom: 'info', ico: 'play', titulo: 'Usar esta rota hoje?',
      sub: `${esc(m.nome)} · ${paradas} ${paradas === 1 ? 'parada' : 'paradas'}`,
      acoes: [['Agora não', ''], ['Usar', 'principal']], classe: 'duas',
    });
    const botao = naCamada('.portao-wrap .principal');
    if (!botao) return;
    botao.addEventListener('click', () => comTrava(async () => {
      try { await window.API.post(`/logistica/rota-modelos/${encodeURIComponent(id)}/gerar`, { date: diaOperacional() }); }
      catch (e) { return avisoErro(e); }
      await carregarRota();
      window.ir('rota');
    }), { once: true });
  }

  /* ------------------------------------------------------------------------
     L9 — AJUSTES, RECARGA E CONSUMO.

     🔴 CHAVE QUE APARECE E NÃO CONTROLA NADA É PIOR QUE CHAVE AUSENTE. Só
     entram as que têm porta: as três do servidor (`avisoChegandoEnabled`,
     `modoCaderneta`) e as do próprio aparelho (som/voz pelo `soundPrefs` do
     Kotlin, tema pelo native). O grupo "Sem internet" INTEIRO sai da tela: o
     download de mapa e o pacote offline morreram no corte de 06/08 — o PMTiles
     guarda os 60 km sozinho, sem botão. "Painel de créditos do dia" também
     sai: não achei porta nenhuma pra ele.
     ------------------------------------------------------------------------ */
  let config = null;

  /* 🔴 QUEM É ADMIN QUEM DIZ É O SERVIDOR, NÃO A TELA. O `GET /logistica/config`
     responde DOIS tamanhos: pra quem é responsável financeiro ele manda o bloco
     comercial (`modoRotaPadrao`, `pixChave`, `trackingAtivo`…), e pra gerente,
     vendedor e motorista esses campos vêm AUSENTES — não nulos, ausentes. Então
     a presença de um deles É a resposta, e não há gate nenhum inventado aqui.
     É o MESMO `isAdmin()` do app que já roda (`app.js`, L545), com o MESMO
     campo, de propósito: dois fronts do mesmo produto não podem discordar sobre
     quem é dono.
     ⚠️ Medido: `moduloFinanceiroAtivo` é o ÚNICO dos 6 que o backend exige
     responsável financeiro pra GRAVAR (está no `changesCommercialConfig`); os
     outros 5 bastam ser ADMIN. Como o app não tem sinal nenhum que separe
     gerente de motorista, o corte é este — e ele erra pro lado certo: esconder
     uma chave que o gerente poderia mexer é menos grave que mostrar uma chave
     que vai devolver 403 na cara dele. Chave que não obedece é mentira. */
  const ehAdmin = () => !!config && Object.prototype.hasOwnProperty.call(config, 'modoRotaPadrao');

  async function carregarAjustes() {
    if (!temPonte() || typeof window.usarDados !== 'function') return;
    const [cfgR, credR] = await Promise.allSettled([
      window.API.get('/logistica/config'),
      window.API.get('/credits/me'),
    ]);
    // Mesma lei do L8: fonte fora do ar não reescreve a tela de ajustes com
    // chave desligada — isso faria o dono achar que perdeu a configuração.
    if (cfgR.status !== 'fulfilled' || !cfgR.value) return fonteCaiu('ajustes');
    config = cfgR.value;
    // A MESMA resposta já traz o CSV do item 9 — aproveitar aqui é de graça e
    // deixa a barra fresca pra quem passou pelos Ajustes (uma chamada a menos).
    aplicarBarra(config);
    const cred = credR.status === 'fulfilled' ? credR.value : null;
    const saldo = cred && typeof cred.balance === 'number' ? cred.balance : null;
    const info = (window.HBX.info && window.HBX.info()) || {};
    let sons = 1;
    try { const p = window.HBX.soundPrefs.get(); sons = p && p.master === false ? 0 : 1; } catch (_) { /* padrão ligado */ }
    const dist = Number(config.avisoChegandoDistanciaM);
    const admin = ehAdmin() ? 1 : 0;
    window.usarDados('ajustes', {
      ...fonteVoltou,
      admin,
      avisarChegadaDist: isFinite(dist) && dist > 0 ? `${dist} m` : '',
      avisarChegada: config.avisoChegandoEnabled ? 1 : 0,
      creditosLinha: saldo != null ? `${saldo} ${saldo === 1 ? 'crédito' : 'créditos'}` : '',
      modoCaderneta: config.modoCaderneta ? 1 : 0,
      sons,
      painelCreditos: '',      // sem porta: a linha inteira some
      grupoOffline: 0,         // corte de 06/08
      empresa: '',             // o nome da empresa não vem em porta do celular
      versao: info.versionName ? `Versão ${esc(info.versionName)}` : '',
      versaoSub: '',
    });
    /* As 6 chaves de dinheiro. Vêm da MESMA resposta que já foi buscada — a tela
       do Avançado não tem chamada própria, e por isso também não tem estado
       próprio de falha: quem recarrega é o `recarregar-ajustes`. */
    window.usarDados('avancado', {
      ...fonteVoltou,
      admin,
      financeiro: config.moduloFinanceiroAtivo ? 1 : 0,
      cobrancaSimples: config.cobrancaSimples ? 1 : 0,
      precoPorCliente: config.precoPorClienteAtivo ? 1 : 0,
      naHora: config.aceitaNaHora ? 1 : 0,
      mensal: config.aceitaMensal ? 1 : 0,
      fiado: config.aceitaFiado ? 1 : 0,
    });
    if (cred) encherRecarga(cred);
  }

  /* 🔴 A RECARGA CARREGA SOZINHA. Ela só era preenchida de carona no
     `carregarAjustes`: quem abrisse a Recarga direto (o atalho `ir-recarga`, ou
     o caminho vindo do crédito baixo) via o catálogo do DESENHO — preço, selo
     de desconto e o botão de pagar. Tela de dinheiro não pode depender de por
     onde o motorista entrou. */
  async function carregarRecarga() {
    if (!temPonte() || typeof window.usarDados !== 'function') return;
    let cred;
    try { cred = await window.API.get('/credits/me'); } catch (_) { return fonteCaiu('recarga'); }
    if (!cred) return fonteCaiu('recarga');
    encherRecarga(cred);
  }

  /** os pacotes vêm no MESMO `/credits/me` do saldo — não há porta separada */
  let pacoteEscolhido = null;
  function encherRecarga(cred) {
    const packs = Array.isArray(cred && cred.packs) ? cred.packs : [];
    const saldo = typeof cred.balance === 'number' ? cred.balance : null;
    if (!pacoteEscolhido) {
      const rec = packs.find((p) => p.recommended) || packs[0];
      pacoteEscolhido = rec ? rec.key : null;
    }
    const atual = packs.find((p) => p.key === pacoteEscolhido) || null;
    window.usarDados('recarga', {
      ...fonteVoltou,
      saldo: saldo != null ? String(saldo) : '',
      // "~17 dias no seu ritmo" precisaria do consumo médio — não tenho essa
      // conta em porta nenhuma, e chutar dias em tela de crédito é mentira.
      ritmo: '',
      pacotes: packs.map((p) => [
        // crédito é NÚMERO INTEIRO; só o PREÇO do pacote é dinheiro.
        String(p.credits),
        Number(p.price).toFixed(2).replace('.', ','),
        esc(p.badge),
        p.key === pacoteEscolhido ? 1 : 0,
        esc(p.key),
      ]),
      cta: atual ? `Recarregar ${atual.credits} créditos · ${dinheiro(Number(atual.price))}` : '',
    });
  }

  /* ------------------------------------------------------------------------
     AJUSTES · FINANCEIRO — a carteira do dono, e a última tela cravada.

     DUAS portas, porque são duas perguntas diferentes:
       · `caderneta/resumo` → o CAIXA DE HOJE (quanto entrou, por qual forma) E
         o mapa `devedores` (id do cliente → centavos em aberto);
       · `nucleo/clientes`  → o NOME de quem está nesse mapa.

     🔴 POR QUE NÃO `GET /logistica/financeiro/saldos`, que seria a porta óbvia
     (ela devolve nome + saldo prontos, é a mesma que o resumo diário do
     WhatsApp usa): ela EXISTE no servidor e está certa, mas o app NÃO ALCANÇA.
     O `NativeApiClient` tem uma lista branca de endereços por flavor
     (`isMobileEndpointAllowed`) e `financeiro/saldos` não está nela — medido no
     g15, a chamada morre DENTRO do aparelho com "Esta operação não pertence ao
     logistica", sem nem sair pra rede. Essa lista mora em `src/main/`, que esta
     frente não pode tocar. Chamar assim mesmo seria pior que não chamar: o
     "Em aberto" nasceria vazio por bloqueio COM CARA de "ninguém te deve" — e
     esses dois vazios são opostos (Lei nº1). Então a conta vem pelo caminho que
     o app já tem aberto, e sem inventar 2ª conta de dívida: o `devedores` do
     resumo é computado pelo MESMO `saldosFinanceiro` (que por sua vez lê a
     fonte única `saldoAbertoPorClientes`), e o `debitoAtual` do
     `nucleo/clientes` é espelho da mesma regra.

     Cada porta escreve SÓ O SEU pedaço, e só se responder. As duas no chão na
     primeira carga ⇒ `fonteCaiu` (aviso + "Tentar de novo"), nunca tela vazia:
     "não entrou nada hoje" e "a rede caiu" não podem ter a mesma cara.
     ------------------------------------------------------------------------ */
  async function carregarFinanceiro() {
    if (!temPonte() || typeof window.usarDados !== 'function') return;
    const dia = diaOperacional();
    const [caixaR, rosterR] = await Promise.allSettled([
      window.API.get(`/logistica/caderneta/resumo?date=${encodeURIComponent(dia)}`),
      window.API.get('/nucleo/clientes?page=1&pageSize=100'),
    ]);
    if (caixaR.status !== 'fulfilled' && rosterR.status !== 'fulfilled') return fonteCaiu('financeiro');

    const caixa = caixaR.status === 'fulfilled' ? caixaR.value : null;
    const formas = (caixa && caixa.fechamento && caixa.fechamento.formas) || null;
    // `devedores` é { idDoCliente: centavos } e só traz quem tem saldo > 0.
    const deve = (caixa && caixa.devedores && typeof caixa.devedores === 'object') ? caixa.devedores : null;
    const totalAberto = deve ? Object.keys(deve).reduce((s, k) => s + (Number(deve[k]) || 0), 0) : 0;
    // O NOME vem do roster. Quem não estiver nele fica SEM LINHA — mas o valor
    // dele continua contado no "Em aberto": o total é QUANTO, a lista é QUEM, e
    // o total nunca pode encolher por causa de uma página de nomes que não veio.
    const nomes = new Map();
    if (rosterR.status === 'fulfilled') {
      const itens = (rosterR.value && Array.isArray(rosterR.value.items)) ? rosterR.value.items : [];
      itens.forEach((c) => { if (c && c.id && String(c.name || '').trim()) nomes.set(String(c.id), String(c.name)); });
    }
    const linhasDevedor = deve
      ? Object.keys(deve)
        .filter((id) => nomes.has(String(id)) && (Number(deve[id]) || 0) > 0)
        .sort((a, b) => (Number(deve[b]) || 0) - (Number(deve[a]) || 0))
      : [];

    window.usarDados('financeiro', {
      ...fonteVoltou,
      ...(caixaR.status === 'fulfilled' ? {
        /* "Recebido" é o que ENTROU: dinheiro + pix + cartão. NÃO é o
           `totalCents`, que soma o fiado junto — e fiado é exatamente o que
           NÃO entrou. Chamar o marcado de recebido seria a mesma mentira desta
           tela vestida de outra roupa. É soma de número do servidor, não conta
           minha. Zero some (Lei do IF, a mesma régua do `saldo` da Rota). */
        recebido: formas
          ? centavosSeTiver((formas.dinheiroCents || 0) + (formas.pixCents || 0) + (formas.cartaoCents || 0))
          : '',
        formas: formas ? [
          ['cash', 'var(--lime)', 'Dinheiro', centavosSeTiver(formas.dinheiroCents)],
          ['pix', 'var(--blue-l)', 'Pix', centavosSeTiver(formas.pixCents)],
          ['card', 'var(--purple)', 'Cartão', centavosSeTiver(formas.cartaoCents)],
        ].filter((x) => x[3]) : [],
        // "Marcou" é o fiado do dia — a palavra é do dono (o `aceitaFiado`, o
        // "pagou não" dele). Não inventar sinônimo aqui é regra, não estilo.
        marcou: formas ? centavosSeTiver(formas.fiadoCents) : '',
        // O TOTAL em aberto sai do mapa INTEIRO — inclusive de quem não tem
        // nome no roster. Ele vem em centavos (o `devedores` do resumo já
        // converte), por isso `centavosSeTiver` e não `dinheiro`.
        emAberto: deve ? centavosSeTiver(totalAberto) : '',
      } : {}),
      ...(rosterR.status === 'fulfilled' && caixaR.status === 'fulfilled' ? {
        /* 🔴 O 3º campo é a linha de baixo do desenho ("3 marcações · a mais
           antiga de 28/07") e vai VAZIA DE PROPÓSITO: nem o `devedores` do
           resumo nem o `financeiro/saldos` entregam QUANTAS marcações são nem a
           data da mais antiga — os dois dão só o saldo. Sem porta, o slot some
           e sobra nome + valor. Contar cobrança aqui no celular seria uma 2ª
           conta de dívida, fadada a discordar do extrato. */
        devedores: linhasDevedor.map((id) => [
          iniciais(nomes.get(String(id))), esc(nomes.get(String(id))), '',
          centavos(Number(deve[id]) || 0), '',
        ]),
      } : {}),
      /* 🔴 A SEMANA NÃO TEM FONTE — e some INTEIRA, com o título junto.
         O desenho pede três números: recebido, marcado e pendência da semana.
         O `historicoDias` do resumo só traz o TOTAL de cada dia (`totalCents`),
         sem quebra por forma — então "recebido da semana" (dinheiro+pix+cartão)
         não existe em porta nenhuma. "Pendência" também não: o "em aberto" é
         saldo ACUMULADO, não da semana — publicá-lo debaixo do título "Semana"
         seria mentira de moldura, o número certo na caixa errada.
         E o "marcado" da semana eu NÃO ligo no `sum(totalCents)` de propósito,
         embora esse número exista: nesta tela, dois dedos acima, "Marcou" já
         significa FIADO. A mesma palavra com dois sentidos na mesma rolagem é
         pior que número faltando. (A tela Semana usa "Marcado" no sentido de
         total — lá é o vocabulário dela, aqui não.)
         Falta: `historicoDias[]` com as `formas` de cada dia. */
    });
  }

  async function carregarConsumo() {
    if (!temPonte() || typeof window.usarDados !== 'function') return;
    let e;
    try { e = await window.API.get('/logistica/creditos/extrato'); } catch (_) { return fonteCaiu('consumo'); }
    if (!e || typeof e !== 'object') return fonteCaiu('consumo');
    const uso = e.usage || {};
    const tot = e.totals || {};
    const linhas = [];
    (Array.isArray(e.trackedDeliveries) ? e.trackedDeliveries : []).forEach((d) => {
      linhas.push(['menos', esc(d.titulo || 'Entrega rastreada'), esc(d.quando || ''), String(d.creditos || 0)]);
    });
    (Array.isArray(e.bonuses) ? e.bonuses : []).forEach((b) => {
      linhas.push(['mais', esc(b.titulo || 'Bônus'), esc(b.quando || ''), String(b.creditos || 0)]);
    });
    window.usarDados('consumo', {
      ...fonteVoltou,
      // Crédito é NÚMERO INTEIRO, nunca moeda — e zero some, como todo recorte.
      saldo: seTiver(e.balanceCredits),
      gastosHoje: seTiver(uso.hoje),
      bonus: seTiver(tot.bonusCredits),
      linhas,
      vazio: 'Nenhum movimento neste mês',
    });
  }

  /** liga/desliga uma chave do servidor e recarrega — sem otimismo na tela */
  async function virarChave(campoConfig) {
    if (!config) return;
    await comTrava(async () => {
      const novo = !config[campoConfig];
      try { await window.API.patch('/logistica/config', { [campoConfig]: novo }); }
      catch (e) { return avisoErro(e); }
      await carregarAjustes();
      // A rota lê as MESMAS chaves pra decidir qual folha abre na porta: sem
      // isto, virar "modo caderneta" só valeria na próxima abertura do app.
      await carregarRota();
    });
  }

  /* ------------------------------------------------------------------------
     L8 — CHAT COM A CENTRAL (o único canal do motorista com o escritório).

     🔴 O PORTÃO DO RECADO É TRAVA, NÃO AVISO. Recado urgente/alarme que chegou
     e não teve "Entendi" segura a confirmação da entrega — é o ponto exato
     onde cobrar não atrapalha a rota nem põe ninguém em risco: ele está
     PARADO, com o celular na mão, prestes a fechar a parada.

     As rotas indicadas e as missões NÃO entram aqui: saíram no corte de 06/08
     (4 linhas na história inteira, servidas por 2.981 chamadas de poll).
     ------------------------------------------------------------------------ */
  let recados = [];
  let portaoRecados = [];

  const horaCurta = (iso) => hora(iso);

  async function carregarRecados() {
    if (!temPonte() || typeof window.usarDados !== 'function') return;
    const [fioR, portaoR] = await Promise.allSettled([
      window.API.get('/logistica/recados/me'),
      window.API.get('/logistica/recados/portao'),
    ]);
    /* 🔴 FALHA DE REDE NÃO APAGA A TELA. "Vazio porque o servidor disse vazio"
       e "vazio porque a rede caiu" são coisas OPOSTAS, e escrever as duas do
       mesmo jeito faria o fio de recados sumir e o sino zerar no meio da rua.
       O portão pegou isto: no navegador do conferidor as duas chamadas falham
       e o sino ia de 2 pra 0 — 60 das 66 telas mudaram por causa do
       cabeçalho. Sem o fio, não se toca no seam. */
    if (fioR.status !== 'fulfilled' || !Array.isArray(fioR.value)) return fonteCaiu('chat');
    recados = fioR.value;
    // O portão é uma segunda fonte: se SÓ ele falhou, mantém o que já valia —
    // deixar de cobrar o "Entendi" por causa de um erro de rede seria afrouxar
    // uma trava, e trava não se afrouxa sozinha.
    if (portaoR.status === 'fulfilled' && Array.isArray(portaoR.value)) portaoRecados = portaoR.value;
    const pendente = portaoRecados[0] || null;
    window.usarDados('chat', {
      ...fonteVoltou,
      recado: pendente ? esc(pendente.texto) : '',
      // O título é do MOCK e é sempre verdade: quem manda recado é a Central.
      // Montar "Recado de {autor}" me deu "Recado de Central" na tela — nome
      // de gente no lugar de instituição vira português torto.
      recadoTitulo: 'Recado da Central',
      conversa: recados.map((r) => [
        r.origem === 'motorista' ? 'minha' : 'deles',
        esc(r.texto),
        horaCurta(r.criadoEm),
      ]),
      // Fio vazio não é erro: é o dia em que ninguém precisou falar nada.
      vazio: recados.length ? '' : 'Nenhum recado por aqui',
      sino: contarNaoLidos(),
    });
  }

  /** o número do sino: recado do ESCRITÓRIO que este aparelho ainda não abriu */
  function contarNaoLidos() {
    return recados.filter((r) => r && r.origem === 'escritorio' && !r.vistoEm).length;
  }

  /** abrir o chat é LER: marca visto e o sino zera (o portão continua de pé) */
  async function aoAbrirChat() {
    await carregarRecados();
    // ⚠️ `marcarVisto` exige a LISTA de ids — corpo vazio marca ZERO e volta
    // "ok" (medido: o sino ficava em 2 depois de abrir a conversa). Ele só
    // aceita recado do escritório, então mandar os meus não faria nada de
    // qualquer jeito; mando exatamente os que ainda não foram lidos.
    const naoLidos = recados.filter((r) => r.origem === 'escritorio' && !r.vistoEm).map((r) => r.id);
    if (!naoLidos.length) return;
    try { await window.API.post('/logistica/recados/visto', { ids: naoLidos }); } catch (_) { return; }
    await carregarRecados();
  }

  async function entendiRecado() {
    const alvo = portaoRecados[0];
    if (!alvo) return;
    await comTrava(async () => {
      try { await window.API.post(`/logistica/recados/${encodeURIComponent(alvo.id)}/entendi`, {}); }
      catch (e) { return avisoErro(e); }
      await carregarRecados();
    });
  }

  async function enviarRecado() {
    const el = naCamada('[data-campo="recado-texto"]');
    const texto = el ? String(el.value || '').trim() : '';
    if (!texto) return;
    await comTrava(async () => {
      // clientMessageId: toque duplo ou retry de rede devolve a MESMA resposta
      // em vez de criar dois balões na central.
      const corpo = { texto, clientMessageId: window.HBX.uuid(), date: diaOperacional() };
      const alvo = portaoRecados[0];
      if (alvo) corpo.recadoId = alvo.id;
      try { await window.API.post('/logistica/recados/responder', corpo); }
      catch (e) { return avisoErro(e); }
      if (el) el.value = '';
      await carregarRecados();
    });
  }

  /* ------------------------------------------------------------------------
     L7 — PRODUTOS (o catálogo, que é de onde sai o preço de TODA entrega).

     ⚠️ O catálogo do celular devolve `{id, nome, unidade, usaLogistica,
     precoCatalogo}` — SEM estoque e SEM categoria, embora as duas colunas
     existam na tabela e o PATCH até aceite `estoque`. Ou seja: dá pra ESCREVER
     estoque e não dá pra LER. Campo assim é o pior de todos — o dono digitaria
     por cima do estoque real sem ver o que estava lá. Por isso o campo Estoque
     e os contadores que dependem dele não aparecem. Está na mão do dono.

     O catálogo inteiro vem numa resposta só (sem paginação), então a busca
     filtra AQUI — e isso é honesto justamente porque a lista inteira já está
     no aparelho. Na tela de Clientes é o contrário, e por isso lá vai pro
     servidor: são coisas diferentes, não incoerência.
     ------------------------------------------------------------------------ */
  const PRODUTOS = new Map();
  let filtroProdutos = { busca: '' };
  let produto = null;

  /** "R$ 11,00" / "11,00" → 11. Vazio ou lixo → null (não vira zero). */
  const paraNumero = (txt) => {
    const limpo = String(txt || '').replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.');
    const n = Number(limpo);
    return limpo !== '' && isFinite(n) ? n : null;
  };

  async function carregarProdutos() {
    if (!temPonte() || typeof window.usarDados !== 'function') return;
    let r;
    try { r = await window.API.get('/logistica/produtos'); } catch (_) { return fonteCaiu('produtos'); }
    const todos = Array.isArray(r) ? r : [];
    PRODUTOS.clear();
    todos.forEach((p) => { if (p && p.id != null) PRODUTOS.set(String(p.id), p); });
    const busca = filtroProdutos.busca.trim().toLowerCase();
    const lista = busca
      ? todos.filter((p) => String(p.nome || '').toLowerCase().indexOf(busca) >= 0)
      : todos;
    window.usarDados('produtos', {
      ...fonteVoltou,
      busca: esc(filtroProdutos.busca),
      // Sem categoria no payload, a fileira de chips inteira SOME. Um filtro
      // com uma opção só ("Todos") é enfeite com cara de controle.
      categorias: [],
      lista: lista.map((p) => [
        esc(p.nome),
        // 🔴 ESTOQUE SÓ EXISTE SE A EMPRESA LIGOU (o campo só vem do servidor
        // com `estoqueAtivo` no perfil fiscal — quem decide é o ADMIN, no
        // desktop). Sem ele a linha diz a unidade, como antes.
        typeof p.estoqueDisponivel === 'number'
          ? `Estoque: ${p.estoqueDisponivel} un.`
          : esc(p.unidade),
        typeof p.precoCatalogo === 'number' ? p.precoCatalogo.toFixed(2).replace('.', ',') : '',
        'azul',
        String(p.id),
      ]),
      ativos: String(todos.length),
      estoqueBaixo: '',
      valorEstimado: '',
    });
  }

  function abrirProduto(id) {
    const p = PRODUTOS.get(String(id));
    if (!p || typeof window.usarDados !== 'function') return;
    produto = { id: String(id), item: p, rascunho: {} };
    encherProduto();
    window.ir('fichaproduto');
  }

  function encherProduto() {
    if (!produto) return;
    const p = produto.item || {};
    const r = produto.rascunho || {};
    const v = (k, servidor) => (r[k] !== undefined ? esc(r[k]) : esc(servidor));
    window.usarDados('fichaproduto', {
      nome: v('produto-nome', p.nome),
      // "no catálogo desde… · N entregas" não vem em porta nenhuma do celular.
      resumo: '',
      selo: p.usaLogistica ? 'ativo' : '',
      unidade: v('produto-unidade', p.unidade),
      preco: v('produto-preco', typeof p.precoCatalogo === 'number' ? dinheiro(p.precoCatalogo) : ''),
      // Número, não moeda — e SÓ LEITURA: este saldo é derivado da trilha de
      // movimentos (entrada, reserva, baixa). Corrigir é fazer contagem de
      // inventário no desktop, não digitar por cima aqui.
      estoque: typeof p.estoqueDisponivel === 'number' ? String(p.estoqueDisponivel) : '',
      estoqueDica: 'disponível hoje · vem do controle de estoque',
    });
  }

  async function salvarProduto() {
    if (!produto) return;
    await comTrava(async () => {
      const p = produto.item || {};
      const corpo = {};
      const nome = campo('produto-nome');
      const unidade = campo('produto-unidade');
      const preco = paraNumero(campo('produto-preco'));
      if (nome && nome !== String(p.nome || '')) corpo.nome = nome;
      if (unidade !== String(p.unidade || '')) corpo.unidade = unidade;
      // 🔴 PREÇO SÓ VIAJA SE VIROU NÚMERO. Campo apagado ou digitado errado não
      // pode virar 0 — este é o preço de TODA entrega deste produto.
      if (preco != null && preco !== Number(p.precoCatalogo)) corpo.preco = preco;
      if (!Object.keys(corpo).length) {
        return window.portao({
          tom: 'info', ico: 'check', titulo: 'Nada mudou', sub: 'O produto já está assim.',
          acoes: [['Fechar', '']],
        });
      }
      const gravar = async () => {
        try { await window.API.patch(`/logistica/produtos/${encodeURIComponent(produto.id)}`, corpo); }
        catch (e) { return avisoErro(e); }
        await carregarProdutos();
        const atualizado = PRODUTOS.get(produto.id);
        if (atualizado) produto.item = atualizado;
        produto.rascunho = {};
        encherProduto();
        window.portao({ tom: 'ok', ico: 'check', titulo: 'Produto salvo', sub: '', acoes: [['Fechar', '']] });
      };
      // 🔴 PREÇO MUDOU: mostra o número JÁ LIDO antes de gravar.
      // O campo é texto livre (o mock não tem a moeda "estilo banco" do app
      // velho) e eu vi na tela um dedo escorregado virar "9 509,50" — que o
      // leitor entende como NOVE MIL. Este é o preço que multiplica TODA
      // entrega do produto: ele não pode mudar sem alguém ler o valor.
      if (corpo.preco === undefined) return gravar();
      window.portao({
        tom: 'alerta', ico: 'cash', titulo: 'Confirmar o preço?',
        sub: `${esc(p.nome)} passa a valer ${dinheiro(corpo.preco)}`,
        acoes: [['Não', ''], ['Salvar preço', 'principal']], classe: 'duas',
      });
      const botao = naCamada('.portao-wrap .principal');
      if (botao) botao.addEventListener('click', () => { gravar(); }, { once: true });
    });
  }

  /* ------------------------------------------------------------------------
     L6 — CLIENTES E FICHA (a tela nº1 de quem usa o app de verdade).

     A lista é PULL: busca e chips de dia vão pro SERVIDOR junto com a página.
     Filtrar no aparelho esconderia todo cliente que ainda não desceu — a base
     do cliente real tem centenas.

     🔴 O ENDEREÇO MATA O PINO. Mudou rua/número/bairro/CEP, a coordenada velha
     MORRE junto (lat/lng = null). Pino velho com endereço novo é o defeito mais
     caro desta casa: a rota leva o motorista pra porta errada e ninguém vê.
     Sem pino a parada aparece como "sem trajeto" e a conferência acusa — barulho
     é melhor que silêncio errado.
     ------------------------------------------------------------------------ */
  const CLIENTES = new Map();
  let filtroClientes = { busca: '', dia: 0 };
  /* Dias que TÊM cliente (união dos `diasEntrega` da base). Só a carga SEM
     filtro mede — com filtro de dia a lista volta só daquele dia e a união
     colapsaria pra ele. Entre filtros o valor fica de pé (sticky). O dono
     (07/08): "não tem terça nem domingo nas rotas, e ainda está aparecendo". */
  let diasComGente = null;
  let ficha = null;          // { id, item, detalhe, local, telefone, dias }
  let clientesEmVoo = false;

  const iniciais = (nome) => String(nome || '')
    .split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';

  const ROTULO_DIA = ['', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  /** o que a pendência do servidor vira na tela (só a primeira, a mais dura) */
  const AVISO_PENDENCIA = { numero: 'sem número', endereco: 'sem endereço', dia: 'sem dia', telefone: 'sem telefone' };

  async function carregarClientes() {
    if (!temPonte() || typeof window.usarDados !== 'function') return;
    if (clientesEmVoo) return;
    clientesEmVoo = true;
    try {
      const p = new URLSearchParams({ page: '1', pageSize: '100' });
      if (filtroClientes.busca) p.set('query', filtroClientes.busca);
      if (filtroClientes.dia) p.set('diasSemana', String(filtroClientes.dia));
      let r;
      try { r = await window.API.get(`/nucleo/clientes?${p.toString()}`); } catch (_) { return fonteCaiu('clientes'); }
      // 🔴 SÓ CLIENTE ENTRA. A mesma porta serve lead e fornecedor; sem este
      // filtro a agenda de quem nunca comprou apareceria na rota de quem vende.
      const itens = (Array.isArray(r && r.items) ? r.items : []).filter((c) => c && c.isCliente === true);
      CLIENTES.clear();
      itens.forEach((c) => CLIENTES.set(String(c.id), c));
      // Quem está na rota de HOJE ganha o avatar aceso — é o que o motorista
      // procura primeiro quando abre a lista.
      const naRota = new Set();
      ENTREGAS.forEach((reg) => {
        const id = reg.item && reg.item.cliente && reg.item.cliente.id;
        if (id) naRota.add(String(id));
      });
      if (!filtroClientes.busca && !filtroClientes.dia) {
        const uniao = new Set();
        itens.forEach((c) => (Array.isArray(c.diasEntrega) ? c.diasEntrega : [])
          .forEach((n) => uniao.add(Number(n))));
        diasComGente = [1, 2, 3, 4, 5, 6, 7].filter((n) => uniao.has(n));
      }
      window.usarDados('clientes', {
        ...(diasComGente ? { dias: diasComGente } : {}),
        ...fonteVoltou,
        subtitulo: `${ENTREGAS.size} na rota de hoje`,
        busca: esc(filtroClientes.busca),
        diaSel: filtroClientes.dia,
        total: r && typeof r.total === 'number' ? String(r.total) : '',
        // "sem endereço" seria uma conta da BASE INTEIRA e o servidor não manda
        // esse total — contar só os que desceram diria um número menor que a
        // verdade. Slot vazio some; número errado ficaria.
        semEndereco: '',
        marcadoHoje: DADOS.rota.somaMarcado || '',
        lista: itens.map((c) => {
          const dias = Array.isArray(c.diasEntrega) ? c.diasEntrega : [];
          const pend = Array.isArray(c.pendencias) ? c.pendencias : [];
          const aviso = pend.map((k) => AVISO_PENDENCIA[k]).filter(Boolean)[0] || '';
          const deve = Number(c.debitoAtual) || 0;
          return [
            iniciais(c.name),
            esc(c.name),
            [esc(c.endereco), esc(c.cidade)].filter(Boolean).join(' • '),
            dias.map((n) => ROTULO_DIA[n]).filter(Boolean).join(', '),
            deve > 0 ? deve.toFixed(2).replace('.', ',') : '',
            naRota.has(String(c.id)) ? 1 : 0,
            aviso,
            String(c.id),
          ];
        }),
      });
    } finally { clientesEmVoo = false; }
  }

  /** toque no cliente: puxa a ficha inteira (cadastro + o que ele leva) */
  async function abrirCliente(id) {
    const item = CLIENTES.get(String(id));
    if (!item || typeof window.usarDados !== 'function') return;
    // A ficha abre JÁ com o que a lista sabe; o detalhe entra quando chegar.
    // Tela de cadastro que fica em branco esperando rede é tela quebrada.
    // rascunho ZERADO: cliente novo mostra o cadastro DELE, nunca sobra do anterior.
    ficha = { id: String(id), item, detalhe: null, local: null, telefone: null, rascunho: {}, dias: (item.diasEntrega || []).slice() };
    encherFicha();
    window.ir('ficha');
    const [detR, prodR] = await Promise.allSettled([
      window.API.get(`/nucleo/clientes/${encodeURIComponent(id)}`),
      window.API.get(`/logistica/cliente-produtos?customerProfileId=${encodeURIComponent(id)}`),
    ]);
    if (!ficha || ficha.id !== String(id)) return;      // trocou de cliente no meio
    if (detR.status === 'fulfilled' && detR.value) {
      ficha.detalhe = detR.value;
      const locais = Array.isArray(detR.value.locais) ? detR.value.locais : [];
      ficha.local = locais.find((l) => l.isPrincipal) || locais[0] || null;
      const tels = Array.isArray(detR.value.telefones) ? detR.value.telefones : [];
      ficha.telefone = tels.find((t) => t.isPrincipal) || tels[0] || null;
    }
    ficha.produtos = prodR.status === 'fulfilled' && Array.isArray(prodR.value) ? prodR.value : [];
    encherFicha();
  }

  /* 🔴 O QUE O DEDO ESCREVEU TEM QUE SOBREVIVER AO REPINTE.
     Qualquer `usarDados` repinta a tela inteira a partir do seam — e o texto
     digitado vive no DOM, não no seam. Medido no g15: digitei o número da casa,
     toquei num dia e o número SUMIU.

     🔴 E O RASCUNHO SÓ GUARDA O QUE FOI DIGITADO — nunca uma foto dos campos.
     Minha 1ª versão tirava foto antes de repintar: como a ficha abre VAZIA e
     preenche quando o detalhe chega, a foto gravava "" como se fosse escolha do
     usuário, e daí em diante o vazio VENCIA o dado do servidor. CEP, rua e
     bairro sumiram na tela por causa disso. Rascunho nasce de tecla, e ponto. */
  const CAMPOS_FICHA = ['nome', 'telefone', 'cpf', 'cep', 'rua', 'numero', 'bairro', 'observacoes'];
  const CAMPOS_PRODUTO = ['produto-nome', 'produto-unidade', 'produto-preco'];
  /** liga o rascunho de QUALQUER ficha da camada viva (cliente ou produto) */
  function ligarCamposDaFicha() {
    const camada = camadaViva();
    if (!camada) return;
    const ligar = (nomes, dono) => {
      for (const nome of nomes) {
        const el = camada.querySelector(`[data-campo="${nome}"]`);
        if (!el || el.__hbxCampo) continue;
        el.__hbxCampo = true;
        el.addEventListener('input', () => {
          const alvo = dono();
          if (!alvo) return;
          alvo.rascunho = alvo.rascunho || {};
          alvo.rascunho[nome] = String(el.value || '');
        });
      }
    };
    ligar(CAMPOS_FICHA, () => ficha);
    ligar(CAMPOS_PRODUTO, () => produto);
  }
  /** valor a mostrar: o que ele digitou, senão o que o servidor mandou */
  const valorFicha = (nome, doServidor) => {
    const r = ficha && ficha.rascunho;
    return r && r[nome] !== undefined ? esc(r[nome]) : esc(doServidor);
  };

  function encherFicha() {
    if (!ficha) return;
    const it = ficha.item || {};
    const d = ficha.detalhe || {};
    const loc = ficha.local || {};
    const pend = Array.isArray(it.pendencias) ? it.pendencias : [];
    const entregas = Number(it.entregasCount) || 0;
    const dias = ficha.dias || [];
    window.usarDados('ficha', {
      ini: iniciais(it.name || d.name),
      nome: valorFicha('nome', d.name || it.name),
      // "cliente desde" não vem em nenhuma das duas portas — some em vez de
      // virar uma data inventada. O que existe é a contagem de entregas.
      resumo: entregas ? `${entregas} ${entregas === 1 ? 'entrega' : 'entregas'}` : '',
      alerta: pend.map((k) => AVISO_PENDENCIA[k]).filter(Boolean)[0] || '',
      telefone: valorFicha('telefone', d.whatsapp || it.phone),
      cpf: valorFicha('cpf', d.document),
      cep: valorFicha('cep', loc.cep || d.cep),
      rua: valorFicha('rua', loc.endereco || d.endereco),
      numero: valorFicha('numero', loc.numero != null ? loc.numero : d.numero),
      bairro: valorFicha('bairro', loc.bairro || d.bairro),
      numeroPendente: pend.indexOf('numero') >= 0 ? 1 : 0,
      observacoes: valorFicha('observacoes', d.observacoes || it.observacoes),
      dias: [1, 2, 3, 4, 5, 6, 7].map((n) => (dias.indexOf(n) >= 0 ? 1 : 0)),
      produtos: (ficha.produtos || []).map((v) => {
        const p = v.produto || {};
        const preco = typeof v.precoAcordado === 'number' ? v.precoAcordado : null;
        const catalogo = typeof p.precoCatalogo === 'number' ? p.precoCatalogo : null;
        // Preço combinado SÓ PRA ELE ganha destaque; preço de catálogo é o
        // normal. Sem preço nenhum, a linha diz só a quantidade.
        const proprio = preco != null && catalogo != null && preco !== catalogo;
        const valor = preco != null
          ? (proprio
            ? ` · <b style="color:var(--lime)">${dinheiro(preco)} só pra ele</b>`
            : ` · ${dinheiro(preco)} (catálogo)`)
          : '';
        return ['box', esc(p.nome), `${Number(v.qtdPadrao) || 0} por entrega${valor}`];
      }),
    });
  }

  /** lê um campo da ficha na camada viva (o que o dedo digitou, não o do seam) */
  const campo = (nome) => {
    const el = naCamada(`[data-campo="${nome}"]`);
    return el ? String(el.value || '').trim() : '';
  };

  /** Salvar: manda SÓ o que mudou, e cada porta é a sua. */
  async function salvarCliente() {
    if (!ficha) return;
    await comTrava(async () => {
      const d = ficha.detalhe || {};
      const it = ficha.item || {};
      const loc = ficha.local || {};
      const nome = campo('nome');
      const telefone = campo('telefone');
      const cpf = campo('cpf');
      const observacoes = campo('observacoes');
      const cep = campo('cep');
      const rua = campo('rua');
      const numero = campo('numero');
      const bairro = campo('bairro');

      const conta = {};
      if (nome && nome !== String(d.name || it.name || '')) conta.nome = nome;
      if (observacoes !== String(d.observacoes || '')) conta.observacoes = observacoes;
      if (telefone !== String(d.whatsapp || it.phone || '')) conta.phone = telefone;
      // 🔴 CPF NUNCA É OBRIGATÓRIO (ordem do dono, 07/08): a ficha salva sem
      // ele igual. Compara SÓ OS DÍGITOS pra máscara digitada
      // ("123.456.789-00") não parecer mudança quando nada mudou.
      const soDigitos = (v) => String(v || '').replace(/\D/g, '');
      if (soDigitos(cpf) !== soDigitos(d.document)) conta.document = cpf;

      const mudouEndereco = cep !== String(loc.cep || '')
        || rua !== String(loc.endereco || '')
        || numero !== String(loc.numero == null ? '' : loc.numero)
        || bairro !== String(loc.bairro || '');

      const diasAgora = [1, 2, 3, 4, 5, 6, 7].filter((n) => (ficha.dias || []).indexOf(n) >= 0);
      const diasAntes = (it.diasEntrega || []).slice().sort().join(',');
      const mudouDias = diasAgora.slice().sort().join(',') !== diasAntes;

      if (!Object.keys(conta).length && !mudouEndereco && !mudouDias) {
        return window.portao({
          tom: 'info', ico: 'check', titulo: 'Nada mudou', sub: 'A ficha já está assim.',
          acoes: [['Fechar', '']],
        });
      }
      try {
        if (Object.keys(conta).length) {
          await window.API.patch(`/nucleo/contas/${encodeURIComponent(ficha.id)}`, conta);
        }
        // O telefone vive em DOIS lugares (a conta espelha, o contato é a
        // verdade) — o app velho já grava nos dois, e a busca lê do espelho.
        if (conta.phone && ficha.telefone && ficha.telefone.id) {
          await window.API.patch(`/nucleo/telefones/${encodeURIComponent(ficha.telefone.id)}`,
            { whatsapp: conta.phone, phone: conta.phone, isPrincipal: true });
        }
        if (mudouEndereco && loc.id) {
          await window.API.patch(`/nucleo/locais/${encodeURIComponent(loc.id)}`, {
            endereco: rua, numero, bairro, cep,
            cidade: loc.cidade || '', uf: loc.uf || '',
            // 🔴 O PINO MORRE COM O ENDEREÇO VELHO. Ver o bloco no topo.
            lat: null, lng: null,
          });
        }
        if (mudouDias) {
          await window.API.patch(`/logistica/clientes/${encodeURIComponent(ficha.id)}/dias`, { dias: diasAgora });
        }
      } catch (e) { return avisoErro(e); }
      await carregarClientes();
      // Rascunho MORRE no salvamento: daqui pra frente quem manda é o servidor
      // (foi ele que decidiu o que aceitou), senão a tela mostraria pra sempre
      // o que eu digitei mesmo que a gravação tenha ajustado o valor.
      await abrirCliente(ficha.id);
      window.portao({
        tom: 'ok', ico: 'check', titulo: 'Ficha salva',
        // Lei 8: a palavra "pino" é PROIBIDA em tela — é jargão de motor. Quem
        // lê é o motorista, e pra ele o que mudou é o LOCAL.
        sub: mudouEndereco ? 'O endereço mudou — o local vai ser conferido de novo.' : '',
        acoes: [['Fechar', '']],
      });
    });
  }

  /* ------------------------------------------------------------------------
     L5 — O FECHAMENTO DO DIA (caderneta) E A SEMANA.

     Tudo sai de UMA porta (`/logistica/caderneta/resumo`), que já era pedida
     pra encher o caixa do topo da Rota — a caderneta não custa requisição nova.
     🔴 SEM FONTE, VAZIO: o resumo não traz "produtos por dia" nem o recebido
     de cada dia da semana (só o total). Esses dois slots do desenho ficam SEM
     NÚMERO em vez de com zero — zero é uma afirmação, e nesta tela ela seria
     falsa. Está anotado como pendência pro dono decidir a fonte.
     ------------------------------------------------------------------------ */
  const DIAS_SEMANA = ['', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
  const dataBR = (k) => String(k || '').split('-').reverse().slice(0, 2).join('/');
  /** ISO: segunda = 1 … domingo = 7, no dia operacional de São Paulo. */
  const diaDaSemana = () => {
    const [a, m, d] = diaOperacional().split('-').map(Number);
    const js = new Date(Date.UTC(a, m - 1, d, 12)).getUTCDay();
    return js === 0 ? 7 : js;
  };

  function encherCaderneta(caixa, itens, entregues) {
    if (typeof window.usarDados !== 'function') return;
    const f = (caixa && caixa.fechamento) || null;
    const formas = (f && f.formas) || null;
    const vendas = f ? Number(f.vendas) || 0 : 0;
    const pagina = (caixa && caixa.pagina) || null;
    // "clientes" é gente DISTINTA, não linha de venda — o mesmo cliente comprando
    // duas vezes é UM cliente. Contar venda aqui inflaria o número do dia.
    const clientes = pagina && Array.isArray(pagina.vendas)
      ? new Set(pagina.vendas.map((v) => String(v.clienteId || ''))).size
      : null;
    window.usarDados('caderneta', {
      entregues: String(entregues),
      // O selo do canto diz um FATO (quantas vendas), nunca um veredito: o app
      // não tem como saber que está "tudo certo". Sem venda, sem selo.
      selo: vendas ? `${vendas} ${vendas === 1 ? 'venda' : 'vendas'}` : '',
      // Só entra a forma que teve dinheiro. Cartão com R$ 0,00 no fechamento
      // de quem só recebeu em pix é ruído com cara de informação.
      formas: formas ? [
        ['cash', 'var(--lime)', 'Dinheiro', centavosSeTiver(formas.dinheiroCents)],
        ['pix', 'var(--blue-l)', 'Pix', centavosSeTiver(formas.pixCents)],
        ['card', 'var(--purple)', 'Cartão', centavosSeTiver(formas.cartaoCents)],
        ['note', 'var(--amber)', 'Caderneta', centavosSeTiver(formas.fiadoCents)],
      ].filter((x) => x[3]) : [],
      formaTotal: f ? centavosSeTiver(f.totalCents) : '',
      clientes: seTiver(clientes),
      // 🔴 PRODUTOS E MARCADO SÃO DA CADERNETA, NÃO DA ROTA. Estavam lendo
      // `DADOS.rota.*` — e aí uma venda de 2 galões aparecia como "0 produtos"
      // porque a ROTA de hoje estava vazia. São duas contas diferentes com o
      // mesmo nome; a desta tela é a das VENDAS da página.
      produtos: pagina && Array.isArray(pagina.vendas)
        ? seTiver(pagina.vendas.reduce((s, v) => s
            + (Array.isArray(v.itens) ? v.itens.reduce((n, it) => n + (Number(it.qtd) || 0), 0) : 0), 0))
        : '',
      // "marcado" na língua da caderneta é o que ficou FIADO — o que o cliente
      // levou e não pagou. Sem financeiro não existe conta, e o slot fica vazio.
      marcado: formas ? centavosSeTiver(formas.fiadoCents) : '',
    });

    const dias = Array.isArray(caixa && caixa.historicoDias) ? caixa.historicoDias : [];
    const totalSemana = dias.reduce((s, h) => s + (Number(h.totalCents) || 0), 0);
    window.usarDados('semana', {
      dias: dias.map((h) => [
        DIAS_SEMANA[Number(h.diaSemana)] || '',
        dataBR(h.dateKey),
        String(Number(h.vendas) || 0),
        '',                                        // produtos: sem fonte no resumo
        '',                                        // recebido do dia: idem
        h.totalCents != null ? centavos(h.totalCents).replace('R$ ', '') : '',
      ]),
      marcado: centavosSeTiver(totalSemana),
      recebido: '',
      pendencia: '',
    });
  }

  /** Fechar o dia: registra a caderneta de hoje e salva nas Rotas salvas. */
  async function fecharDia() {
    if (typeof window.portao !== 'function') return;
    const dia = diaDaSemana();
    window.portao({
      tom: 'info', ico: 'lock', titulo: 'Fechar o dia?',
      sub: `Registrar como ${DIAS_SEMANA[dia]}`,
      acoes: [['Agora não', ''], ['Fechar o dia', 'principal']], classe: 'duas',
    });
    const botao = naCamada('.portao-wrap .principal');
    if (!botao) return;
    botao.addEventListener('click', () => comTrava(async () => {
      try { await window.API.post('/logistica/caderneta/finalizar', { dia }); }
      catch (e) { return avisoErro(e); }
      await carregarRota();
      window.ir('caderneta');
    }), { once: true });
  }

  /* ------------------------------------------------------------------------
     8. L4 — A PORTA: chegar, entregar e receber.

     Três regras de domínio que NÃO nasceram aqui — vieram do app que já roda:
     · a folha é escolhida pela CONFIG, não pelo gosto: financeiro OFF ou
       "cobrança simples" abrem a folha SIMPLES (`venda`); o resto abre a
       COMPLETA (`folha`). É o mesmo degrau do `deliverySheet()` do app velho;
     · a hora da CHEGADA nasce no celular quando a folha abre e viaja no
       DESFECHO (nunca num POST próprio) — a folha tem que abrir sem rede;
     · toque repetido não confirma duas vezes: a `idempotencyKey` é gravada
       ANTES da ida e só morre quando o servidor responde.

     🔴 O COMPROVANTE POR FOTO NÃO ESTÁ AQUI DE PROPÓSITO (decisão do dono,
     06/08): 0 uso na história do produto. Não é esquecimento.
     ------------------------------------------------------------------------ */
  const ENTREGAS = new Map();
  let financeiroAtivo = true;
  let cobrancaSimples = false;
  let aberta = null;              // { id, n, item } — a parada com a folha aberta
  let forma = '';                 // pix | dinheiro | cartao | fiado
  let motivo = '';                // o motivo do "não entregue"

  // A config só muda quando o dono mexe em Ajustes: pedir 1× por abertura do
  // app basta, e uma falha aqui NÃO pode fechar a porta — o default é o
  // comportamento de hoje (financeiro ligado, folha completa).
  (async function lerConfig() {
    if (!temPonte()) return;
    try {
      const c = await window.API.get('/logistica/config');
      if (c && typeof c === 'object') {
        if (typeof c.moduloFinanceiroAtivo === 'boolean') financeiroAtivo = c.moduloFinanceiroAtivo;
        cobrancaSimples = !!c.cobrancaSimples;
      }
    } catch (_) { /* fica o default */ }
  })();

  /** a hora em que o motorista CHEGOU nesta parada (1ª abertura da folha) */
  function carimbarChegada(id) {
    const chave = `chegada:${id}`;
    const guardada = window.HBX.cache.get(chave, null);
    if (guardada) return guardada;
    // Sobrevive a fechar o app no meio da parada — o desfecho pode vir minutos
    // depois, e uma chegada perdida vira `null` (o servidor prefere ausente a
    // inventada, ver `aparaChegada`).
    const agora = new Date().toISOString();
    window.HBX.cache.set(chave, agora);
    return agora;
  }

  const somaItens = (item) => (Array.isArray(item.itens) ? item.itens : []);

  /** entrega do servidor → seam da folha COMPLETA */
  function encherFolha(item, n) {
    const c = item.cliente || {};
    const anterior = typeof c.debitoAtual === 'number' ? c.debitoAtual : null;
    const hojeVal = typeof item.valorHoje === 'number' ? item.valorHoje : null;
    window.usarDados('folha', {
      n: String(n),
      cor: String(item.status || '') === 'entregue' ? 'lime' : 'blue',
      nome: esc(c.nome),
      endereco: [esc(c.endereco), esc(c.cidade)].filter(Boolean).join(' • '),
      pill: 'Chegou',
      cabecalho: `Parada ${n} · ${esc(c.nome)}`,
      // Observação do cliente é a única coisa que o motorista PRECISA ler antes
      // de bater na porta — e sem ela a faixa some (não fica caixa vazia).
      nota: c.observacoes ? esc(c.observacoes) : '',
      itens: somaItens(item).map((it) => {
        const prod = (it && it.produto) || {};
        const qtd = it.qtdEntregue != null ? it.qtdEntregue : it.qtdPrevista;
        // 🔴 `valorUnit` só existe pra quem tem acesso a preço (billingAudience).
        // Entregador comum não recebe — e aí a linha diz só "previsto 2", sem
        // "R$ 0,00 cada", que seria um "não sei" com cara de preço.
        const preco = typeof it.valorUnit === 'number' ? ` · ${dinheiro(it.valorUnit)} cada` : '';
        return ['box', esc(prod.nome), `previsto ${it.qtdPrevista}${preco}`, String(qtd == null ? '' : qtd)];
      }),
      anterior: anterior != null ? dinheiro(anterior) : '',
      hoje: hojeVal != null ? dinheiro(hojeVal) : '',
      total: anterior != null || hojeVal != null ? dinheiro((anterior || 0) + (hojeVal || 0)) : '',
      forma,
      /* 🔴 A TELA E O SERVIDOR TÊM QUE DIZER O MESMO MOTIVO. `abrirParada` zerava
         a variável `motivo` mas NÃO o seam: marcar "Endereço não encontrado" na
         parada 3 e abrir o "não entregue" da parada 5 deixava esse motivo
         marcado na tela — enquanto o `registrarNaoEntregue` mandava
         `motivo || motivos[0]`, ou seja, "Ninguém atendeu", pro servidor. A tela
         mostrava um e o banco gravava outro. Agora o seam recebe EXATAMENTE o
         que vai ser enviado, inclusive o padrão da 1ª abertura. */
      motivo: motivo || (DADOS_MOTIVO_PADRAO() || ''),
    });
  }

  /** entrega do servidor → seam da folha SIMPLES (a venda) */
  function encherVenda(item, n) {
    const c = item.cliente || {};
    const lista = somaItens(item);
    const primeiro = lista[0] || {};
    const prod = primeiro.produto || {};
    const hojeVal = typeof item.valorHoje === 'number' ? item.valorHoje : null;
    const anterior = typeof c.debitoAtual === 'number' ? c.debitoAtual : null;
    window.usarDados('venda', {
      n: String(n),
      titulo: `Parada ${n} • ${esc(c.nome)}`,
      endereco: [esc(c.endereco), esc(c.cidade)].filter(Boolean).join(' • '),
      pill: 'Chegou',
      produto: esc(prod.nome) || (lista.length > 1 ? `${lista.length} produtos` : ''),
      tags: lista.map((it) => {
        const p = (it && it.produto) || {};
        return [`${esc(p.nome)} x${it.qtdPrevista}`, 'blue'];
      }),
      contaItem: hojeVal != null ? dinheiro(hojeVal) : '',
      contaChegada: hojeVal != null ? dinheiro(hojeVal) : '',
      // "Lançamento na caderneta" só é verdade quando a forma escolhida é FIADO
      // — em dinheiro/pix/cartão nada vai pra caderneta. Número que muda de
      // significado conforme o botão é número que mente.
      lancamento: forma === 'fiado' && hojeVal != null ? dinheiro(hojeVal) : dinheiro(0),
      recebido: forma && forma !== 'fiado' && hojeVal != null ? dinheiro(hojeVal) : dinheiro(0),
      paraCaderneta: anterior != null ? dinheiro(anterior + (forma === 'fiado' ? (hojeVal || 0) : 0)) : '',
      forma,
    });
  }

  /** toque na parada: carimba a chegada e abre a folha que a config mandar */
  function abrirParada(id) {
    const reg = ENTREGAS.get(String(id));
    if (!reg || typeof window.usarDados !== 'function') return;
    aberta = { id: String(id), n: reg.n, item: reg.item };
    carimbarChegada(aberta.id);
    // Método já gravado (reabrindo) > o padrão do cliente > nenhum. Nada de
    // "Dinheiro" pré-marcado por enfeite: quem escolhe como recebeu é quem
    // está na porta.
    const c = reg.item.cliente || {};
    forma = String(reg.item.receiptMethod || c.metodoPadrao || '');
    motivo = '';
    const simples = !financeiroAtivo || cobrancaSimples;
    if (simples) { encherVenda(reg.item, reg.n); window.ir('venda'); }
    else { encherFolha(reg.item, reg.n); window.ir('folha'); }
  }

  /** repinta a folha aberta (o seam é a única fonte da marcação selecionada) */
  function repintarFolha() {
    if (!aberta) return;
    const simples = !financeiroAtivo || cobrancaSimples;
    if (simples) encherVenda(aberta.item, aberta.n);
    else encherFolha(aberta.item, aberta.n);
  }

  /** o desfecho: entregue. `metodo` vazio = a folha ainda não sabe como pagou. */
  async function confirmarEntrega(metodo) {
    if (!aberta) return;
    const escolhido = metodo || forma;
    // Financeiro ON exige saber como recebeu — senão o fechamento do dia soma
    // errado e ninguém descobre até o caixa não bater.
    if (financeiroAtivo && !escolhido) {
      return window.portao({
        tom: 'alerta', ico: 'cash', titulo: 'Como o cliente pagou?',
        sub: 'Escolha a forma antes de confirmar.', acoes: [['Fechar', '']],
      });
    }
    await comTrava(async () => {
      const chave = `entrega-confirmar:${aberta.id}`;
      let idem = window.HBX.cache.get(chave, null);
      if (!idem) { idem = window.HBX.uuid(); window.HBX.cache.set(chave, idem); }
      const corpo = { idempotencyKey: idem, arrivedAt: carimbarChegada(aberta.id) };
      if (escolhido) corpo.receiptMethod = escolhido;
      // O GPS da confirmação é o que realimenta o cadastro do cliente — vai
      // quando existe, e a falta dele NUNCA barra a entrega.
      if (ultimaPos) { corpo.lat = ultimaPos.lat; corpo.lng = ultimaPos.lng; }
      try {
        await window.API.post(`/logistica/entregas/${encodeURIComponent(aberta.id)}/confirmar`, corpo);
      } catch (e) { return avisoErro(e); }
      window.HBX.cache.remove(chave);
      window.HBX.cache.remove(`chegada:${aberta.id}`);
      aberta = null; forma = '';
      await carregarRota();
      window.ir('rota');
    });
  }

  /** o outro desfecho: não entregue, com o motivo que o motorista marcou */
  async function registrarNaoEntregue() {
    if (!aberta) return;
    const escolhido = motivo || (DADOS_MOTIVO_PADRAO() || '');
    if (!escolhido) {
      return window.portao({
        tom: 'alerta', ico: 'alert', titulo: 'O que aconteceu?',
        sub: 'Marque o motivo antes de registrar.', acoes: [['Fechar', '']],
      });
    }
    await comTrava(async () => {
      try {
        await window.API.post(`/logistica/entregas/${encodeURIComponent(aberta.id)}/cancelar`, {
          motivo: escolhido, arrivedAt: carimbarChegada(aberta.id),
        });
      } catch (e) { return avisoErro(e); }
      window.HBX.cache.remove(`chegada:${aberta.id}`);
      aberta = null; motivo = '';
      await carregarRota();
      window.ir('rota');
    });
  }

  /* O 1º motivo já nasce marcado na folha (`.motivo.on` do mock): quem só toca
     em "Registrar" está escolhendo ELE, não "nenhum". Ler do seam mantém uma
     fonte só — se o dono trocar a lista no mock, isto acompanha. */
  function DADOS_MOTIVO_PADRAO() {
    try { return (DADOS.folha.motivos || [])[0] || ''; } catch (_) { return ''; }
  }

  const ACOES = {
    montar: montarRota,
    'iniciar-rota': iniciarRota,
    iniciar: iniciarRota,
    'cancelar-rota': cancelarRota,
    'entregue-pagou': () => confirmarEntrega(''),
    'entregue-marcou': () => confirmarEntrega('fiado'),
    'confirmar-venda': () => confirmarEntrega(''),
    'registrar-nao-entregue': registrarNaoEntregue,
    'fechar-dia': fecharDia,
    'salvar-cliente': salvarCliente,
    'salvar-produto': salvarProduto,
    'entendi-recado': entendiRecado,
    // "Tentar de novo" do aviso de fonte fora do ar: volta pro esqueleto e
    // pede de novo. Sem devolver o esqueleto o toque não teria resposta
    // nenhuma na tela, e o motorista tocaria três vezes achando que travou.
    'recarregar-clientes': () => retentar('clientes', carregarClientes),
    'recarregar-produtos': () => retentar('produtos', carregarProdutos),
    'recarregar-salvas': () => retentar('salvas', carregarSalvas),
    'recarregar-chat': () => retentar('chat', carregarRecados),
    'recarregar-consumo': () => retentar('consumo', carregarConsumo),
    'recarregar-ajustes': () => retentar('ajustes', carregarAjustes),
    'recarregar-recarga': () => retentar('recarga', carregarRecarga),
    'recarregar-financeiro': () => retentar('financeiro', carregarFinanceiro),
    'ir-consumo': () => window.ir('consumo'),
    'ir-recarga': () => window.ir('recarga'),
    'ir-financeiro': () => window.ir('financeiro'),
    'ir-avancado': () => window.ir('avancado'),
    'chave-caderneta': () => virarChave('modoCaderneta'),
    /* 🔴 TRÊS CAMPOS DO SERVIDOR DISPUTAVAM O RÓTULO "AVISAR CHEGADA". Medido,
       e a diferença é de FUNÇÃO, não de nome:
       · `raioChegadaM` (60 m) — no app que já roda é o raio do geofence NATIVO
         (`activateRoute({raioM})`): é ele que dispara o `hbx:arrival` e ABRE a
         folha sozinho. O app novo NÃO tem esse geofence — aqui a folha abre
         quando o motorista TOCA na parada. Logo, no celular novo esse número
         não muda nada do que ele vê (o que sobra dele é o vigia da Central, que
         é tela de PC). Não entra: número que não faz nada é o mesmo defeito da
         chave que não faz nada.
       · `avisoChegandoEnabled` — liga/desliga o WhatsApp "estou chegando" PRO
         CLIENTE. É literalmente o "chegou no cliente" do dono. É esta a chave.
       · `avisoChegandoDistanciaM` (500 m) — a que distância esse aviso sai. É o
         NÚMERO que aparece na linha, e agora ele é verdade: é o raio do anel
         armado em `anelDeChegada`. */
    'aviso-chegada': () => virarChave('avisoChegandoEnabled'),
    // As 6 do dono. Uma chave = um campo = um PATCH, sem lote: assim o que
    // falhou fica evidente e o resto não volta atrás junto.
    'chave-financeiro': () => virarChave('moduloFinanceiroAtivo'),
    'chave-cobranca-simples': () => virarChave('cobrancaSimples'),
    'chave-preco-cliente': () => virarChave('precoPorClienteAtivo'),
    'chave-na-hora': () => virarChave('aceitaNaHora'),
    'chave-mensal': () => virarChave('aceitaMensal'),
    'chave-fiado': () => virarChave('aceitaFiado'),
    // Som e voz sao do APARELHO (soundPrefs do Kotlin), nao do servidor.
    'chave-sons': () => {
      try {
        const atual = window.HBX.soundPrefs.get() || {};
        window.HBX.soundPrefs.set(Object.assign({}, atual, { master: atual.master === false }));
      } catch (_) { /* sem ponte de som: nada a fazer */ }
      carregarAjustes();
    },
    // 🔴 `chave-tema` NÃO ENTRA AQUI — e a ausência é a correção, não um
    // esquecimento. O tema tem um dono só (§1): a ponte já EMBRULHA o
    // `trocarLuz` do mock pra falar com o native. O mock vira a luz; o embrulho
    // leva pro aparelho. Uma entrada aqui viraria a luz uma SEGUNDA vez no
    // mesmo clique — medido no g15: escuro→claro→escuro, e a chave "Tema
    // escuro" dos Ajustes simplesmente não fazia nada.
    // 🔴 SAIR APAGA A SESSAO DO APARELHO — confirma antes, sempre.
    sair: () => {
      window.portao({
        tom: 'alerta', ico: 'logout', titulo: 'Sair do aplicativo?',
        sub: 'Voce vai precisar parear o aparelho de novo.',
        acoes: [['Ficar', ''], ['Sair', 'principal']], classe: 'duas',
      });
      const b = naCamada('.portao-wrap .principal');
      if (b) b.addEventListener('click', () => { try { window.HBX.logout(); } catch (_) {} }, { once: true });
    },
    recarregar: () => {
      if (!pacoteEscolhido) return;
      // O checkout e NATIVO (RechargeCheckoutActivity): o WebView nunca ve
      // dado de cartao. Aqui so se diz QUAL pacote.
      try { window.HBX.recharge(pacoteEscolhido); }
      catch (_) { avisoErro(new Error('Nao consegui abrir a recarga agora.')); }
    },
    'enviar-recado': enviarRecado,
    // "Responder" não manda nada: ele leva o dedo pro campo. O texto é dele.
    'responder-recado': () => {
      const el = naCamada('[data-campo="recado-texto"]');
      if (el) el.focus();
    },
  };
  // captura na fase de subida, DEPOIS do mock: quem não é meu segue o caminho dele.
  document.addEventListener('click', (e) => {
    const alvo = e.target.closest('[data-acao], [data-estado]');
    if (!alvo || !temPonte()) return;
    const chave = alvo.dataset.acao || alvo.dataset.estado;
    // Ações que carregam ARGUMENTO no próprio botão. Ficam fora do mapa porque
    // o mapa é nome→função; aqui o dado é parte do toque.
    if (chave === 'abrir-parada') return abrirParada(alvo.dataset.parada);
    if (chave === 'abrir-cliente') return abrirCliente(alvo.dataset.cliente);
    if (chave === 'abrir-produto') return abrirProduto(alvo.dataset.produto);
    if (chave === 'abrir-salva') return abrirSalva(alvo.dataset.salva);
    if (chave === 'abrir-empresa') return acenderEmpresa(alvo.dataset.empresa);
    if (chave === 'pacote') {
      pacoteEscolhido = String(alvo.dataset.pacote || '');
      return carregarAjustes();
    }
    if (chave === 'montar-dia') {
      const n = Number(alvo.dataset.dia) || 0;
      montarDia = montarDia === n ? 0 : n;
      window.usarDados('rota', { montarDiaSel: montarDia });
      return;
    }
    if (chave === 'chip-dia') {
      const n = Number(alvo.dataset.dia) || 0;
      // 2º toque no mesmo chip DESLIGA o filtro. Chip que só liga é armadilha:
      // o motorista fica preso num dia e acha que perdeu os clientes.
      filtroClientes.dia = filtroClientes.dia === n ? 0 : n;
      window.usarDados('clientes', { diaSel: filtroClientes.dia });
      return carregarClientes();
    }
    if (chave === 'dia-cliente') {
      if (!ficha) return;
      const n = Number(alvo.dataset.dia) || 0;
      const i = ficha.dias.indexOf(n);
      if (i >= 0) ficha.dias.splice(i, 1); else ficha.dias.push(n);
      return encherFicha();
    }
    if (chave === 'forma') { forma = String(alvo.dataset.forma || ''); return repintarFolha(); }
    if (chave === 'motivo') {
      motivo = String(alvo.dataset.motivo || '');
      if (typeof window.usarDados === 'function') window.usarDados('folha', { motivo });
      return;
    }
    const fn = ACOES[chave];
    if (fn) fn();
  });
})();
