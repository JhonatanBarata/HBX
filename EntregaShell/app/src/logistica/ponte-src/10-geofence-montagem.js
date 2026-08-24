  /* ---- O GEOFENCE NATIVO: quem arma é a rota que está NA RUA ---------------
     🔴 O MOTOR SEMPRE ESTEVE INTEIRO; O QUE MORREU FOI O CHAMADOR (10/08).
     `RotaService` (GPS em segundo plano), `ChegadaActivity` (o alarme na tela
     apagada) e o `hbx:arrival` do `MainActivity` atravessaram a fusão de 07/08
     sem um arranhão — mas quem entregava as paradas ao Android era o
     `activateRoute` do `iniciarRota` do app VELHO, e o app novo não o portou.
     Medido: de 07/08 até aqui a folha só abria no TOQUE, e o motorista com o
     celular no bolso não era avisado de nada. É o padrão da fusão de sempre
     (capacidade nativa viva, fio cortado).

     O sync mora AQUI, e não no toque do Iniciar, de propósito: `carregarRota`
     é a ÚNICA porta por onde a rota do dia entra na tela — boot, cada desfecho,
     virada da meia-noite, volta do foco. Pendurado no Iniciar, o serviço
     nasceria desarmado em todo caminho que não passa por ele, e "reabri o app
     no meio do turno" é o caso comum, não a exceção.

     🔴 E ELE TAMBÉM DESARMA. Rota encerrada no desktop, dia virado, última
     parada fechada: sem o `stopRoute` o GPS segue ligado no bolso de quem já
     terminou o dia — bateria e ruído, com a tela dizendo que acabou.

     Re-armar não faz parada repetir apito: o `RotaState.setRota` do Kotlin faz
     `disparados.retainAll(ids)`, que só esquece quem SAIU da lista (parada
     reaberta é visita nova, e aí apitar é certo). O freio por assinatura abaixo
     é só pra não pedir `startForegroundService` a cada foco da janela. */
  let geofenceAssinatura = '';

  function raioDaChegada() {
    /* `config` chega pelo `carregarBarra` e a `let` dele mora bem mais abaixo
       neste arquivo — no boot isto pode cair em TDZ, e é o mesmo motivo dos
       outros `try` desta função. 60 m é o padrão do servidor E do Kotlin (que
       ainda clampa entre 20 e 1000), então errar pra cá não inventa nada. */
    try {
      const v = Number(config && config.raioChegadaM);
      return Number.isFinite(v) && v > 0 ? v : 60;
    } catch (_) { return 60; }
  }

  function sincronizarGeofence(r, itens) {
    if (!temPonte() || typeof window.HBX.activateRoute !== 'function') return;
    /* 🔴 DESARMA SEMPRE, E O FREIO É DO OUTRO LADO. A 1ª versão pulava o
       `stopRoute` quando a assinatura já estava vazia ("nada a desarmar") — e
       isso é falso justamente no caso que importa: `RotaService` é START_STICKY
       e o `RotaState` é PERSISTIDO, então o serviço sobrevive ao app fechado.
       Quem encerrasse o dia, fechasse o app e abrisse de novo caía numa
       assinatura vazia (módulo novo) com o GPS ainda rodando no bolso.
       Quem sabe se há algo a parar é o Kotlin, e ele já responde: o
       `requestStop` começa com `if (!isRunning) return`. Pedir é barato;
       presumir é que sai caro. */
    const desarmar = () => {
      geofenceAssinatura = '';
      try { if (typeof window.HBX.stopRoute === 'function') window.HBX.stopRoute(); } catch (_) { /* ponte velha */ }
    };
    /* SÓ 'rodando'. Pausada é pausa DELIBERADA (almoço, imprevisto) — apitar
       ali é ruído em cima de quem escolheu parar. E 'pronta'/'montar' é rota
       que ainda não saiu: geofence antes de sair é alarme na garagem. */
    let naRua = false;
    try { naRua = estadoRota === 'rodando'; } catch (_) { return; }
    if (!naRua) return desarmar();

    /* Alvo é PARADA ABERTA COM PORTA. Sem pino não há o que vigiar (a régua é a
       mesma `pinoValido` do resto do app: zero não é pino, meia coordenada não
       é pino) — mandar um alvo sem coordenada faria o Kotlin descartar calado,
       e o motorista acharia que o cliente sem pino também apita. */
    const alvos = [];
    (itens || []).forEach((it) => {
      const st = String((it && it.status) || '');
      if (st === 'entregue' || st === 'cancelada') return;
      const c = (it && it.cliente) || {};
      if (!it || !it.id || !pinoValido(c.lat, c.lng)) return;
      alvos.push({
        id: String(it.id),
        nome: String(c.nome || 'Cliente'),
        lat: Number(c.lat),
        lng: Number(c.lng),
      });
    });
    // Rota rodando sem nenhuma porta aberta = dia cumprido: desarma igual.
    if (!alvos.length) return desarmar();

    const raioM = raioDaChegada();
    const routeId = (r && r.routeId) ? String(r.routeId) : null;
    /* O modo é do SERVIDOR, nunca inferido aqui — é ele que decide se a rota é
       rastreada. E TRACKED sem `routeId` o próprio Kotlin rebaixa pra
       ESSENTIAL: telemetria nunca liga por engano. */
    const mode = (r && r.trackingRequired) ? 'TRACKED' : 'ESSENTIAL';
    const trackingSessionId = (r && r.trackingSessionId) ? String(r.trackingSessionId) : null;
    const assinatura = `${raioM}|${mode}|${routeId || ''}|${trackingSessionId || ''}|`
      + alvos.map((a) => `${a.id}:${a.lat.toFixed(5)},${a.lng.toFixed(5)}`).join(';');
    if (assinatura === geofenceAssinatura) return;
    geofenceAssinatura = assinatura;
    try {
      window.HBX.activateRoute({ raioM, paradas: alvos, routeId, mode, trackingSessionId });
    } catch (_) {
      // Ponte fora do ar não pode derrubar a rota da tela — e a assinatura
      // volta pra vazio pra próxima carga tentar de novo.
      geofenceAssinatura = '';
    }
  }

  async function carregarRota() {
    if (!temPonte() || typeof window.usarDados !== 'function') return;
    const dia = diaOperacional();
    let r;
    const continuidadePedido = window.API.get('/logistica/rota/continuidade').catch(() => null);
    // 🔴 A DATA VIAJA SEMPRE. Sem ela o servidor usa o dia DELE — e ele roda em
    // UTC (medido: nem o container local nem o da VPS têm TZ). Das 21h à
    // meia-noite de Brasília o UTC já é amanhã, então a rota do motorista
    // aparecia VAZIA justo no fim do turno. Achado no g15 às 23:28 (defeito meu
    // da L1: o app velho sempre mandou `?date=`).
    const rotaNormal = () => window.API.get(`/logistica/rota?date=${encodeURIComponent(dia)}`);
    try {
      r = continuidadeAtiva
        ? await window.API.get(`/logistica/rota/continuidade/abrir?ref=${encodeURIComponent(continuidadeAtiva)}`)
        : await rotaNormal();
    } catch (erroRota) {
      // A pendência pode ter sido concluída noutro aparelho entre dois polls.
      // Só 404/409 prova que o ref morreu. Falha de rede preserva a fotografia
      // já aberta/cartão — nunca troca silenciosamente para outra rota.
      const statusErro = Number(erroRota && (erroRota.status || erroRota.statusCode
        || (erroRota.body && erroRota.body.statusCode))) || 0;
      if (continuidadeAtiva && (statusErro === 404 || statusErro === 409)) {
        continuidadeAtiva = '';
        try { r = await rotaNormal(); } catch (_) { r = null; }
      }
      if (continuidadeAtiva && !r) {
        pendenciasSemConexao = true;
        if (typeof window.usarDados === 'function') {
          window.usarDados('rota', { pendencias: pendenciasDaRota, pendenciasSemConexao });
        }
        return;
      }
      if (!r) {
      // A rota tem estado próprio e o desenho já previa os dois: o esqueleto
      // (`carregando`) e o aviso com "Tentar de novo" (`vazia`). Só na PRIMEIRA
      // carga — com a rota do dia já na tela, rede ruim não apaga o dia.
      try { if (estadoRota === 'carregando') { estadoRota = 'vazia'; pintar(false); } } catch (_) { /* sem seam */ }
      return;
      }
    }
    // Só depois que o servidor RESPONDEU: rede caída não pode carimbar o dia,
    // senão o vigia da virada acharia que já cuidou de um dia que nunca chegou.
    diaNaTela = String(r.date || dia);
    const continuidadeResp = await continuidadePedido;
    if (continuidadeResp) vestirPendencias(continuidadeResp);

    // Crédito e caixa do dia vêm de OUTRAS portas — pedidos em paralelo, e
    // cada um que falhar deixa o SEU campo vazio, sem derrubar a tela.
    const [creditoR, caixaR, custoR] = await Promise.allSettled([
      window.API.get('/credits/me'),
      // ⚠️ é `date`, não `data` (conferido no controller): o nome errado não dá
      // erro nenhum — o servidor ignora e responde o dia DELE, em UTC.
      window.API.get(`/logistica/fechamento/resumo?date=${encodeURIComponent(dia)}`),
      // 🔴 "Iniciar debita N" no cabeçalho vinha do MOCK e de mais lugar nenhum
      // — o app prometia 12 créditos porque era o número do desenho. É a MESMA
      // porta que o portão do Iniciar usa pra cobrar, então o cabeçalho passa a
      // dizer o que o servidor vai debitar de verdade. Falhou: campo vazio, e
      // pela Lei do IF a linha do custo some — número de crédito inventado é
      // dinheiro errado na tela principal.
      // 🔴 A DATA VIAJA AQUI TAMBÉM (medido em produção, 07/08 23h): sem `date`
      // o servidor usa o dia DELE, e ele roda em UTC — das 21h à meia-noite de
      // Brasília o UTC já é amanhã. As 96 entregas do dia (scheduledAt
      // 2026-08-07T03:00Z) ficavam FORA da janela e a porta respondia "Nenhuma
      // entrega aberta neste dia. Monte a rota antes de iniciar" — foi ESTE o
      // erro que o dono levou na cara depois de montar a rota. Mesmo remendo
      // que o `/logistica/rota` já tinha; faltava nas duas do custo.
      window.API.get(`/logistica/rota/custo-preview?date=${encodeURIComponent(dia)}`),
    ]);
    const custo = custoR.status === 'fulfilled' ? custoR.value : null;
    const credito = creditoR.status === 'fulfilled' ? creditoR.value : null;
    const caixa = caixaR.status === 'fulfilled' ? caixaR.value : null;
    const formas = (caixa && caixa.fechamento && caixa.fechamento.formas) || null;
    /* 🔴 CANCELADA SEM ORDEM NUNCA ESTEVE NESTA ROTA (09/08, MEDIDO em produção).
       A lei de cima continua de pé — cancelada É o "não entregue" do motorista e
       tem que ficar no mapa com a cor dela —, mas ela vale pra quem foi MONTADO
       aqui. `GET /logistica/rota` devolve tudo que cai no DIA, sem filtro de
       status, e limpeza administrativa carimba o dia de hoje em massa: na
       company 41 eram 137 canceladas das 09h24, todas com `rotaOrdem` NULO.
       Bastava montar qualquer rota pra elas entrarem — a tela dizia "140
       paradas" com 3 paradas de verdade, e o motorista rolava 137 cartões
       mortos antes de achar a primeira porta.
       A régua é a MESMA que o `estadoDaRota` já usa duas telas acima: quem prova
       que a parada é desta rota é a ORDEM gravada. Cancelada COM ordem fica
       (é o desfecho do dia); cancelada SEM ordem nunca foi parada, é resíduo. */
    const itens = (Array.isArray(r.items) ? r.items : []).filter((it) => {
      if (!it || String(it.status || '') !== 'cancelada') return true;
      return it.rotaOrdem !== null && it.rotaOrdem !== undefined;
    });
    rotaRefAtual = refDaResposta(r, itens);
    const paradas = itens.map((it, i) => traduzirParada(it, i, i > 0));
    // L4 — a folha de chegada precisa da entrega INTEIRA (itens, débito,
    // método padrão), não da linha resumida da lista. Guardada por id, que é o
    // que o cartão carrega no `data-parada`.
    ENTREGAS.clear();
    itens.forEach((it, i) => { if (it && it.id) ENTREGAS.set(String(it.id), { item: it, n: i + 1 }); });
    // As paradas do "Salvar rota", na ORDEM que o planejador deu (o servidor já
    // devolve por `rotaOrdem`): salvar o roteiro é salvar essa sequência.
    PARADAS_SALVAR.length = 0;
    itens.forEach((it) => {
      const id = it && it.cliente && it.cliente.id;
      if (id) PARADAS_SALVAR.push({ customerProfileId: String(id) });
    });
    // ⚰️ 24/08 — `moduloFinanceiroAtivo` saiu do payload da rota (e do
    // produto): a folha da porta é sempre a completa, não há mais o que decidir.
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
    try { estadoRota = continuidadeAtiva ? 'consulta' : estadoDaRota(r); } catch (_) { /* idem */ }
    /* O geofence anda JUNTO com a rota que acabou de chegar — depois do
       `estadoRota` (é ele quem diz se está na rua) e antes de pintar, porque
       armar o serviço não depende de tela nenhuma. Best-effort de verdade:
       tudo lá dentro é try/catch, e falha aqui nunca segura a rota do dia. */
    sincronizarGeofence(
      continuidadeAtiva ? { ...r, routeStatus: 'ENCERRADA', trackingRequired: false } : r,
      itens,
    );

    window.usarDados('rota', {
      /* 🔴 A LISTA PRECISA CABER NO FREIO. `usarDados` só repinta quando um
         CAMPO muda — e a lista de paradas viaja por FORA dele (`PARADAS` é
         variável do mock, não campo de `DADOS`). Quando só a SEQUÊNCIA muda,
         todos os KPIs ficam idênticos e o repinte era engolido: a tela
         continuava na ordem que o dedo arrastou mesmo quando o servidor
         recusou a gravação — o erro aparecia num aviso e a mentira ficava na
         tela. Vale igual pro desfecho de uma parada (pendente → não entregue),
         que também não mexe em KPI nenhum.
         Esta digital não é desenhada em lugar nenhum: ela existe só pra o
         freio enxergar que a lista é OUTRA. */
      digitalDaLista: `${gestoSujouATela}|${itens.map((it) => `${it.id}:${it.status || ''}:${it.mapStatus || ''}:${it.arrivedAt || ''}`).join('|')}`,
      pendencias: pendenciasDaRota,
      pendenciasSemConexao,
      /* O subtítulo do nome da tela. Escrito a cada carga da rota (e não uma vez
         no boot) porque o app do motorista ATRAVESSA a meia-noite ligado — quem
         vira o dia é a `viradaDoDia`, e ela recarrega por aqui. */
      dataLonga: dataPorExtenso(dia),
      /* 🔴 ESTE CAMPO É O TOTAL DO DIA, E NÃO SE ESVAZIA (09/08). A barra do
         mapa dizia "52 paradas · 0 entregues" no estado `montar` — a AGENDA
         vestida de rota — e a 1ª cura foi mandar o campo VAZIO daqui. Errado, e
         medido: `kpiParadas` é lido por mais quatro telas (lista, foto,
         fechamento, semana), onde ele é o total do dia e É pra aparecer; esvaziar
         na fonte deixava o rótulo "paradas" sem número em todas elas.
         A régua de "sem rota montada não se conta parada" ficou onde ela nasce:
         na barra do `T.rota`, que já tem o estado da rota na mão. Régua de uma
         superfície não se aplica na fonte que serve cinco. */
      kpiParadas: String(itens.length),
      kpiEntregues: String(entregues),
      kpiEntreguesParado: String(entregues),
      // saldo/dinheiro/pix = o CAIXA do dia (fechamento do dia), em
      // centavos na origem. Financeiro OFF ⇒ campo vazio (é resposta, não
      // falha). ⚠️ Já a fonte FORA DO AR mantém o que estava: apagar o caixa
      // por causa de rede ruim é pior que mostrar o número de um minuto atrás.
      //
      // 🔴 19/08 — o `saldo` era `fechamento.totalCents`, e o totalCents SOMA O
      // FIADO. Este comentário jurava "o CAIXA do dia" e entregava o total: o
      // motorista lia na tela que mais olha um número inflado pelo que ele NÃO
      // recebeu. Nos números do próprio desenho dá 336 onde deveria dar 184
      // (logistica-2.0.html:4695 — saldo 184 = dinheiro 132 + pix 52), e o erro
      // é INVISÍVEL: o split ao lado só mostra Dinheiro e Pix, então não há
      // como reconstruir a diferença olhando a tela. Não existe acerto de
      // dinheiro no servidor (só o físico, de galão) — quem faz a conta do
      // acerto é o motorista de cabeça, com este número.
      // A régua é a MESMA já escrita e comentada em 90-ajustes-financeiro.js:489
      // (que inclusive cita "a mesma régua do `saldo` da Rota"): recebido é o
      // que ENTROU — dinheiro + pix + cartão. O fiado tem casa própria ("Marcou")
      // e o total tem rótulo próprio ("Total do dia"). Uma palavra, um número.
      ...(caixaR.status === 'fulfilled' ? {
        saldo: formas
          ? centavosSeTiver((formas.dinheiroCents || 0) + (formas.pixCents || 0) + (formas.cartaoCents || 0))
          : '',
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

    // As empresas do corredor viajam no MESMO payload da rota (o servidor as
    // relê de `ProspectoRota`): é isto que faz elas sobreviverem a fechar o app.
    aplicarProspector(r);

    // L5 — o fechamento e a semana bebem do MESMO resumo que já veio acima.
    // Só quando ele REALMENTE respondeu: resumo que falhou não pode zerar o
    // caixa do dia (mesma lei do fio de recados, ver L8).
    // 🔴 SEM RESPOSTA, A TELA FALA (15/08) — sem este `else` T.fechamento ficava em BRANCO, nem esqueleto nem aviso.
    if (caixaR.status === 'fulfilled') encherFechamento(caixa, itens, entregues);
    else fonteCaiu('fechamento');

    // 🔴 A MONTAGEM SE ENCHE AQUI, não só no toque de "Montar rota". Quem chega
    // nela por outro caminho via a lista do MOCK — João da Silva, R$ 336,00 —
    // com o dado real na tela de trás. Dado de enfeite numa tela de dinheiro é
    // o defeito que esta frente inteira existe pra matar (visto no g15).
    /* 🔴 A MONTAGEM TEM UM DONO SÓ, E NÃO É AQUI (dono, 08/08: "o prévia vai
       ser a montagem única").
       Este `else` era a tela "de depois": com a rota montada ele reescrevia a
       MESMA lista com outra fonte — sem o seletor de modos, sem o arrasto,
       trocando só a hora do lado do nome. Era o "próximo que não serve pra
       nada visualmente", e ele custava caro: o motorista arrastava, mandava
       montar, e o repinte devolvia a lista do servidor por cima do gesto dele.
       Agora a lista da Montagem sai SEMPRE do `publicarPrevia`. O que a rota
       montada faz é dar a ORDEM e a HORA de cada parada (ver
       `ordemDaRotaMontada`) — mandar no conteúdo, não na pintura. */
    if (previaCrua) publicarPrevia();
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

  /* 🔴 A CENA DE SAÍDA É DO APP, NÃO DE UMA TELA NATIVA (ordem do dono, 09/08:
     *"remova o efeito de sair, é o antigo, e faça o inverso do q foi feito no
     1"*). O Kotlin pedia uma página só pra fechar (`opening.html?mode=exit`) e
     ali morava OUTRA marca, com OUTRO desenho — a saída não era o inverso da
     entrada, era outra cena. Agora quem toca é o próprio app, com a mesma marca
     e as mesmas animações ao contrário (§ `T.saida` no mock).
     O Kotlin chama isto e fecha no relógio dele: se esta função não existir (app
     velho dentro de casca nova), ele fecha do mesmo jeito — a saída nunca pode
     depender de a cena dar certo. */
  window.HBXSaida = function () {
    try {
      if (typeof window.ir !== 'function') return 0;
      /* 🔴 O REVERSO COMEÇA PELO MAPA (ordem do dono, 09/08). A entrada TERMINA
         no mapa desenhado; então a saída começa desfazendo ele — as ruas
         recolhem, os nomes se apagam letra a letra — e só depois o HBX desce do
         cabeçalho. Sem mapa na tela (o motorista fechou o app no Chat ou nos
         Ajustes) a conta dá zero e a marca desce na hora: a saída nunca espera
         por uma cena que não tem palco. */
      const mapaEm = cenaAoContrario();
      // os 200 ms de sobreposição são de propósito: a marca começa a descer
      // enquanto as últimas ruas ainda recolhem, senão a saída tem um vão morto.
      if (mapaEm) setTimeout(() => { try { window.ir('saida'); } catch (_) { /* fechando */ } }, Math.max(0, mapaEm - 200));
      else window.ir('saida');
      return 1;
    } catch (_) { return 0; }
  };

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
         `fechamento/resumo` responde (`...(caixaR.status === 'fulfilled' ...)`),
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
      /* A MONTAGEM É TELA DE DECISÃO E DE DINHEIRO: ela mostrava João da Silva
         e "R$ 336,00" (o desenho) pra quem entrasse antes do servidor
         responder. Nasce vazia, com esqueleto. `pronta:1` porque o pé desta
         tela é UM só — "Iniciar rota" (o 2º "Montar rota" morreu em 08/08); e
         com a lista vazia o pé nem é desenhado.

         🔴 ESTA CHAVE ESTAVA ESCRITA DUAS VEZES NESTE MESMO OBJETO (09/08). A
         segunda — lá embaixo, entre o `financeiro` e o `fechamento`, acrescentada
         depois pro caso do `/logistica/rota` no chão — repetia cinco campos e
         SOBRESCREVIA este bloco inteiro: em objeto literal quem vence é a
         última. Os cinco repetidos tinham valor idêntico (por isso as 6 paradas
         de exemplo e o "R$ 336,00" morriam mesmo assim), mas `carregando`,
         `vazio`, `pronta`, `dias` e `diaSel` NUNCA chegavam ao seam. O que se
         via: a Montagem nascia SEM ESQUELETO, com o vazio do desenho na cara —
         "Nenhum cliente nesse dia" por um quadro em toda abertura da tela (o
         `ir('montagem')` pinta ANTES de o `encherMontagem` ligar o `carregando`).
         É a Lei nº1 desta frente invertida: dizia "não tem ninguém" quando o
         certo era "estou buscando". Chave repetida é bug MUDO — nem o `node
         --check` nem os portões reclamam. UMA chave só, e o caso da rota no chão
         está coberto aqui dentro, não numa segunda cópia. */
      montagem: {
        carregando: true, linhas: [], pronta: 1, iniciarSub: '',
        // COPY que o ESTADO decide não é copy do desenho: no boot o dia é HOJE,
        // e o "nesse dia" do mock não se refere a dia nenhum sem chip aceso.
        vazio: textoVazio(0),
        somaParadas: '', somaProdutos: '', somaValor: '', dias: [], diaSel: 0,
        // o HISTÓRICO demo do mock morre aqui como todo dado de exemplo —
        // "Sáb · 95 paradas" inventado numa tela de decisão é a mentira de
        // sempre com roupa nova (09/08).
        historico: [],
      },
      clientes: { carregando: true, lista: [], total: '', semEndereco: '', marcadoHoje: '', subtitulo: '' },
      produtos: { carregando: true, lista: [], categorias: [], ativos: '', estoqueBaixo: '', valorEstimado: '' },
      salvas: { carregando: true, lista: [], total: '' },
      // `sino` zera JUNTO: o "2" do desenho ficava no cabeçalho de TODA tela
      // até os recados responderem — badge de exemplo com cara de recado real.
      chat: { carregando: true, conversa: [], recado: '', sino: '' },
      /* 🔴 CRÉDITOS — a tela única (09/08), e DOIS pares de bandeira porque são
         DUAS portas de rede: `carregando`/`semFonte` cobrem `/credits/me`
         (saldo + pacotes, a espinha da tela) e `movCarregando`/`movSemFonte`
         cobrem `/logistica/creditos/extrato` (o movimento). Com um par só, o
         extrato no chão apagaria a recarga — que é o que a pessoa veio fazer
         aqui. Tudo nasce VAZIO: catálogo de demonstração numa tela de dinheiro
         é preço inventado com botão de cobrar em cima. */
      creditos: {
        carregando: true, saldo: '', vence: '', pacotes: [], cta: '',
        movCarregando: true, mes: '', gastosHoje: '', gastosMes: '', bonus: '', linhas: [],
      },
      // Ajustes é o pior lugar pra exemplo: o motorista lê a CHAVE no estado do
      // desenho, toca, e acha que mudou o que nem tinha carregado. Também é a
      // tela que mostrava "Baixando o mapa · 62%" — recurso CORTADO em 06/08.
      ajustes: {
        carregando: true, creditosLinha: '',
        painelCreditos: '', grupoOffline: 0, empresa: '',
        /* A VERSÃO NÃO ZERA: ela não vem do servidor, vem do APK (ponte nativa,
           leitura síncrona). Nasce preenchida pra não piscar vazia entre o boot
           e a resposta do `/logistica/config`. (O miolo dos Ajustes ainda é
           esqueleto enquanto `carregando` — a linha só APARECE quando a tela
           inteira aparece; o que se ganha aqui é que ela já chega certa.) */
        ...linhaDaVersao(),
        // Papel é DADO, e sem resposta do servidor não se sabe qual é. O desenho
        // nasce admin (é a tela cheia); o aparelho nasce SEM, e só o `config`
        // liga. Errar pro lado de mostrar administração é vazar dinheiro.
        admin: 0,
      },
      // As chaves de dinheiro. Todas nascem 0 e a tela nem desenha: chave no
      // estado do desenho é o motorista achando que desligou o que nem carregou.
      // ⚰️ 24/08 — financeiro/cobrancaSimples/precoPorCliente saíram do seam
      // (campos mortos no contrato) e prospectorDisponivel morreu junto: o
      // prospector é aberto a toda empresa, a chave dele nasce só DESLIGADA.
      avancado: {
        carregando: true, admin: 0,
        naHora: 0, mensal: 0, fiado: 0,
        avisarChegada: 0, avisarChegadaDist: '',
        prospector: 0,
      },
      /* O TUTORIAL NASCE SEM SABER DE NADA. `carregando:1` é o que segura o
         motor do tour: capítulo escondido antes de a config chegar seria
         esconder por IGNORÂNCIA, e "não sei" nunca apaga nada (a mesma lei do
         módulo que não some por rede ruim). E `obrigatorioVisto` nasce 1 —
         "não sei" responde JÁ VIU, senão o 0 do DESENHO viraria fato e o
         obrigatório (que não tem X) dispararia por ignorância. Só um "nunca
         visto" dito pelo servidor o zera. */
      tutorial: { carregando: 1, obrigatorioVisto: 1 },
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
      // (A `recarga:` morava AQUI e foi fundida na `creditos:` lá de cima, que é
      // a tela única desde 09/08. O motivo de zerar continua o mesmo: o catálogo
      // era do desenho — R$ 49/129/239/449, "+8% grátis" — e o botão anunciava
      // "Recarregar 300 créditos · R$ 129,00" sem pacote escolhido de verdade.)
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
      // (A 2ª `montagem:` morava AQUI — o caso do `/logistica/rota` no chão, em
      // que `carregarRota` volta no catch antes de escrever e o `montarRota`
      // navegava mesmo assim. Fundida na chave lá de cima, que já zerava os
      // mesmos cinco campos com os mesmos valores; o porquê está escrito lá.)
      /* 🔴 O CAIXA DO DIA — 11 campos de dinheiro presos a UMA chamada.
         `encherFechamento` só roda se o `fechamento/resumo` responder; as duas
         seções são 100% DADO e nenhuma nascia limpa. Com a chamada no chão a
         Fechamento (alcançável a qualquer momento pelo caixa da Rota)
         mostrava o fechamento do desenho: Dinheiro R$ 132,00 · Pix R$ 52,00 ·
         Cartão R$ 84,00 · Marcado R$ 68,00, total R$ 336,00 — e o selo
         "Tudo certo!", um veredito que o app não tem como emitir. A Semana
         mostrava 6 dias inventados e R$ 2.648,00. */
      fechamento: { carregando: true, entregues: '', selo: '', formas: [], formaTotal: '', clientes: '', produtos: '' }, // 🔴 carregando (15/08): sem ele fonteCaiu(abaixo) era NO-OP
      semana: { dias: [], marcado: '', recebido: '', pendencia: '' },
      /* O recibo do fim do dia (12/08). Zera DADO e só dado: `quando` e `sobra`
         são o retrato do momento em que ESTE aparelho fechou o dia — nascer com
         "Fechado às 19:12" do desenho seria carimbar hora num dia que ninguém
         terminou. `titulo` NÃO entra: é COPY, texto fixo da tela. */
      terminou: { quando: '', sobra: '' },
      /* 🔴 AS EMPRESAS DO CORREDOR SÃO A MENTIRA MAIS CARA DESTA TELA. O
         desenho traz "Mercado São Judas", "Padaria Avenida" e "Restaurante
         Sabor" com nome, ramo e posição — e o destino delas, no produto, é
         virar LEAD e MENSAGEM DE WHATSAPP. Empresa de exemplo aqui não é um
         número errado num canto: é o motorista tocando num prédio que não
         existe. Zera INTEIRO; só o `chip` fica, que é COPY do desenho e some
         sozinho junto com a lista.
         🔴 ESTE COMENTÁRIO JÁ MENTIU UMA VEZ. Ele dizia "o prospector ainda não
         tem servidor (F0)" — e o servidor nasceu SETE HORAS depois, no mesmo dia
         07/08. O comentário ficou, a ponte nunca foi ligada, e o app passou um
         dia inteiro com 8 empresas embarcadas no banco e ZERO prédios na tela.
         Hoje quem enche a lista é o `aplicarProspector`, nas DUAS portas
         (iniciar e releitura da rota). O que sobra aqui é só o apagador: até o
         servidor responder, a tela de navegação abre SEM empresa nenhuma, sem
         chip, sem varredura e sem radar — que continua sendo o certo. */
      mapa: { empresas: [] },
      /* 🔴 O CROMO DO GPS — a última mentira da varredura, e a pior de todas
         pelo LUGAR: é a tela em que o motorista está DIRIGINDO. Enquanto rota,
         clientes, ajustes, recarga, fechamento e semana já nasciam limpas, esta
         seguia dizendo "Parada 3 de 8 · Mercado São Judas" (cliente que não
         existe) e "240 m · Vire à direita" (curva que ninguém escolheu, com a
         seta apontando). Literais do desenho, cravados no template — nenhum
         saía de porta nenhuma.

         A fiação (§4.1 do PR07082026-FECHAR-LOGISTICA2) ainda não existe;
         então, como nas empresas do corredor, o campo fica VAZIO e o pedaço
         some da tela — a tela de navegação abre com o mapa de verdade (L3a),
         a seta do motorista e o Encerrar, e nada mais. Honesto.

         Zera o que é DADO. NÃO zera o que é COPY: `velocidadeUnidade`,
         `chegadaRotulo`, `restanteRotulo`, `distanciaRotulo` e — o que mais
         importa — `panoramica` (a antiga `encerrar`), que é a PORTA DE SAÍDA
         desta tela, e `encerrarDia`. Motorista preso na navegação é defeito
         pior que qualquer número faltando; e o fim do dia sem rótulo seria um
         botão mudo na ponta da faixa (16/08, junto da renomeação dos verbos).

         🔴 OS CAMPOS `chegou*` SAÍRAM DAQUI NO LOTE 3 (15/08). "Você chegou"
         deixou de ser cromo desta tela — virou a peça `.chegou-wrap`, com
         COPY própria ('Você chegou', 'Registrar entrega', 'Agora não') e DADO
         lido direto de `ENTREGAS`/`ultimoFix` na hora de montar, nunca deste
         apagador (ver `cartaoChegada`/`desenharChegada`). Nada aqui tem mais
         o que zerar sobre ela. */
      gps: {
        manobraIcone: '', manobraDist: '', manobraVerbo: '',
        manobraRua: '', manobraDepois: '',
        rumo: '', velocidade: '',
        paradaN: '', paradaTotal: '', paradaNome: '',
        chegada: '', restante: '', distancia: '',
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
    // A MESMA resposta diz quem é admin, o que a empresa tem e o que o admin
    // desligou — que é exatamente o que o tour precisa pra saber qual capítulo
    // existe. De carona: nenhuma chamada nova (ver a seção TUTORIAL).
    publicarTutorial();
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
    // A medida dos dias que têm cliente vem UMA vez, aqui, e não na abertura da
    // montagem: chip que nasce com 7 e encolhe pra 4 meio segundo depois pisca
    // na cara de quem está escolhendo. Esta função já roda no boot (e a cada
    // minuto, mas só a 1ª pergunta) — quando a tela abrir, a conta já existe.
    if (!diasComCliente) carregarDiasComCliente();
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
  /* 🔴 TIQUE DE RELÓGIO NÃO PODE DERRUBAR O TOUR (09/08). Todo `usarDados`
     monta uma camada NOVA (é o `pintar` que faz isso), e o tutorial guiado vive
     DENTRO da camada, como a aula: um tique de fundo no meio de um passo
     arrancaria o furo da tela sem ninguém ter encostado no aparelho. O freio do
     `usarDados` engole o que não mudou, mas o obrigatório roda justamente no
     BOOT, quando ainda está tudo chegando.
     Espera só o que é RELÓGIO. O que é DEDO continua passando — é o clique do
     próprio passo `fazer` que abre a montagem de verdade. E o pulso dos recados
     NÃO espera, de propósito: recado é trava e alarme, e atrasar alarme por
     causa de tutorial seria trocar segurança por enfeite.
     Quem publica `window.TUTOR` é o motor da casca (ver a seção TUTORIAL). */
  const tourRodando = () => {
    try {
      return !!(window.TUTOR && typeof window.TUTOR.rodando === 'function' && window.TUTOR.rodando());
    } catch (_) { return false; }   // motor de casca velha: nada a respeitar
  };
  setInterval(() => { if (!tourRodando()) carregarBarra(); }, 60000);

  /* 🔴 A MEIA-NOITE DEIXAVA A TELA NUM DIA E OS BOTÕES NOUTRO — e foi ISTO que o
     dono levou na cara em 09/08 às 00:37: a tela dizia "52 paradas" com o
     Iniciar verde, e o servidor respondia *"Nenhuma entrega aberta neste dia.
     Monte a rota antes de iniciar."* Os DOIS estavam certos. A tela era de
     ONTEM — carregada antes da meia-noite e nunca mais relida; o `hojeISO()` de
     todo botão já era HOJE, e hoje ainda não tinha entrega nenhuma. O banco de
     produção fecha o caso: as 52 de 08/08 foram canceladas e as 52 de 09/08
     nasceram às 03:40:25 UTC — três minutos DEPOIS do erro.

     Nada recarregava sozinho: `carregarRota` roda no boot e nos toques, e mais
     nada. Só que app de entrega fica horas aberto num apoio — atravessar a
     meia-noite é o caso NORMAL dele, não a exceção.

     A garantia é o RELÓGIO, mesmo padrão da `carregarBarra` logo acima. Neste
     app `focus`/`visibilitychange` comprovadamente não disparam (custou uma
     leva inteira de "checagem só no boot frio"), então eles entram como
     ATALHO — quem garante é o tique. Custa uma comparação de string por minuto
     e só vai à rede quando a data VIROU de verdade. */
  const viradaDoDia = () => {
    // Uma rota antiga aberta para conferência continua na tela até o motorista
    // escolher Continuar ou Cancelar. A meia-noite nunca a apaga por trás.
    if (!continuidadeAtiva && diaNaTela && diaNaTela !== diaOperacional()) carregarRota();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') viradaDoDia();
  });
  window.addEventListener('focus', viradaDoDia);
  // Mesma espera do tique acima: a virada de um minuto atrasada não custa nada,
  // o tour arrancado da tela custa o passo inteiro.
  setInterval(() => { if (!tourRodando()) viradaDoDia(); }, 60000);

  /* 🔴 `atualizarContinuidades` (o poll de 60s da continuidade, com o bloco de
     POSSE REVOGADA e os 3 gatilhos dele) MUDOU DE CASA no LOTE 1.3, pro módulo
     dela de verdade — `25-continuidade-rota.js`. Dois motivos, os dois duros:
     este arquivo bate no teto de 1.000 linhas do portão da ponte, e o poll
     nunca foi do geofence — é a irmã do `refDaResposta`, que já mora lá desde
     o lote 1.2. A costura é um IIFE contíguo e `function` hoista, então a
     mudança de casa não muda comportamento nenhum. `tourRodando` (acima) e
     `carregarRota` continuam aqui e são lidos de lá. */

  const cargaInicial = () => {
    apagarDemonstracao(); carregarBarra(); carregarRecados(); checkAppUpdate();
    /* 🔴 A ABERTURA ESPERA ESTA LINHA (§ 7a-ter). O `carregarRota` era chamado
       solto aqui; agora o FIM dele — dando certo ou dando errado — é uma das três
       peças que liberam a primeira tela. Falhar também é "carregou": app que não
       abre porque o servidor caiu é pior que app aberto sem a lista. */
    Promise.resolve(carregarRota())
      .catch(() => {})
      .then(() => bootChegou('dado'));
    // o mapa nasce fora da tela enquanto o HBX ainda está no ar
    setTimeout(prepararMapaCedo, ABERTURA_MAPA_EM);
    // e o teto: sem GPS, sem tile, sem rede, a abertura sai mesmo assim
    setTimeout(avisarAbertura, ABERTURA_TETO_PONTE);
    // O estado do tutorial é do USUÁRIO e vem em porta PRÓPRIA — pendurar no
    // `/logistica/config` custaria uma consulta por minuto por aparelho pra um
    // dado que só interessa no boot.
    carregarTutorial();
    // O que chegou com o app fechado alerta AGORA — o motorista abre o app e
    // descobre o recado das 6h, em vez de esperar o próximo tique.
    pulsoRecados();
    // O app pode ter sido aberto PELA tela do alarme: a resposta dela chega
    // antes de qualquer evento, guardada no aparelho.
    drenarRespostaDoAlarme();
  };
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
     adiantar, ou voltar um dia". 0 = hoje (fluxo de sempre); chip só pra admin.

     🔴 O CHIP ESCOLHE GENTE, NÃO DATA (dono, 10/08, com a foto do portão "Rota
     de Qua montada · Ela abre sozinha quando o dia chegar"): *"se eu clicar no
     'qua', e hoje for segunda, ele monta e inicia a rota normalmente"* · *"se
     for uma segunda, e eu quiser entregar clientes de domingo, qual
     problema?"*. Tocar outro dia é dizer QUEM entra na rota de HOJE — nunca
     agendar um dia futuro. Quem agenda dia futuro é o computador (a mesa de
     despacho); no celular quem está com o carro na rua entrega HOJE.

     ⚰️ AQUI MORREU O `/logistica/admin-route/prepare` DO CELULAR. Ele nasceu
     em 07/08 como "o mesmo trilho do desktop" e em 09/08 virou "a rota nasce no
     dia dela" (a torneira: 50 clientes de segunda viravam entrega de domingo
     porque escolher o dia GRAVAVA calado). Os três perigos que o justificavam
     morreram na madrugada de 10/08 — entrar não grava (só o dedo grava), o
     não-processado expira sozinho (Lei do Desaparecer) e `paradaAbertaDaConta`
     impede a porta de entrar 2× no mesmo dia. O que sobrou dele era só a
     PAREDE: um portão dizendo "volte quarta-feira" pra quem tem o carro na rua
     hoje. Ver a cena M do `prova-fluxo-rota`.

     🔴 OS CHIPS SAÍRAM E VOLTARAM EM 09/08, e a lição fica escrita aqui: eles
     são a ÚNICA porta deste valor. Sem eles `montarDia` nasce e morre em 0 —
     `diaDosEspacos` e o recorte do dia escolhido ficam de pé e inalcançáveis.
     Quem for tirar o chip da tela de novo está tirando "montar a rota com a
     gente de outro dia" junto.
     -------------------------------------------------------------------- */
  /* 🔴 A MONTAGEM ABRE SEM DIA (dono, 10/08, com a foto da tela: "ao entrar no
     montagem de rota, não carregar o dia automaticamente, deixe nessa tela").
     -1 = nenhum chip aceso = a ROTA AVULSA: a tela mostra a semana ("Os dias que
     você entrega"), o histórico e o "Adicionar parada" — e nenhuma lista chega do
     servidor até o dedo escolher um dia. É o par do que foi feito hoje de manhã
     ("entrar não GRAVA nada"): agora entrar também não CARREGA nada. 0 continua
     sendo HOJE, e é pra ele que o chip de hoje leva. */
  let montarDia = -1;

  /* ------------------------------------------------------------------------
     🔴 ESCOLHER CLIENTE É RASCUNHO ATÉ ALGUÉM MANDAR GRAVAR (dono, 09/08: "se
     eu apertar voltar ele já abre a tela inicial com as 3 rotas avulsas, eu
     ainda nem confirmei q queria nada — está cobrando créditos?").

     A porta "Meus clientes" gravava no toque: MEDIDO na prova, três
     `POST /logistica/entregas` mais um `planejar` saíam antes de o dono
     confirmar coisa nenhuma. Decidir e GRAVAR eram o mesmo gesto, e o Voltar
     não desfazia nada — a tela inicial já abria com as paradas dentro.

     Agora, com a rota AINDA NÃO INICIADA, o que sai da porta é RASCUNHO: mora
     aqui no aparelho, aparece na lista da Montagem junto com a prévia do dia, e
     só vira entrega quando o dedo manda — "Salvar rota", "Montar rota" ou
     "Iniciar rota". Voltar sem mandar joga fora.

     🔴 DUAS EXCEÇÕES, E AS DUAS SÃO DO DOMÍNIO, NÃO CONVENIÊNCIA MINHA:
     1. ROTA VIVA NA RUA. Quem entrou pela Rota / Rota·lista está dirigindo, e a
        rota já existe: adicionar A ELA é o propósito do gesto, e não há nenhum
        momento "salvar" depois pra segurar o rascunho até lá. Ali a parada
        continua imediata, exatamente como sempre foi.
     2. CADASTRO DE CLIENTE NOVO. Cadastro é cadastro: a CONTA continua nascendo
        na hora (porta Endereço, modo Cadastro). O que virou rascunho é a
        PARADA, nunca o cliente.
     ------------------------------------------------------------------------ */
  /* {id, localId?, nome, enderecoLinha, bairro, lat?, lng?, resolveSozinho}
     🔴 A LINHA JÁ CHEGA MONTADA, e o rascunho NÃO guarda `endereco` cru
     (09/08): quem enche este array é quem sabe de onde o dado veio — do
     servidor, que manda `enderecoLinha` pronta (histórico), ou das partes,
     que passam por `linhaDeEndereco` na porta "Meus clientes". Guardar a rua
     crua aqui convidaria a próxima tela a montar a linha do jeito dela. */
  const RASCUNHO = [];
  /** a rota está viva na rua? então nada aqui é rascunho */
  const rotaNaRua = () => estadoRota === 'rodando' || estadoRota === 'pausada';
  /** as telas em que o rascunho SOBREVIVE: elas são a própria escolha de gente */
  // 'fichavinculo' entra pela mesma razão da 'ficha' (12/08): ela é uma tela DE
  // DENTRO do cadastro, e atravessá-la não é desistir da gente já escolhida.
  const MANTEM_RASCUNHO = new Set(['rapida', 'ficha', 'novocliente', 'fichavinculo']);
  function descartarRascunho() {
    if (!RASCUNHO.length) return;
    RASCUNHO.length = 0;
    // o chip de HOJE pode ter nascido só por causa do rascunho — ver `publicarMontarDias`
    publicarMontarDias();
  }

  /** a data (SP) da próxima ocorrência do dia n (1=Seg…7=Dom), hoje inclusive */
  const dataDoDia = (n) => {
    const [a, m, d] = diaOperacional().split('-').map(Number);
    const base = new Date(Date.UTC(a, m - 1, d, 12));
    const dow = base.getUTCDay() === 0 ? 7 : base.getUTCDay();
    base.setUTCDate(base.getUTCDate() + (((n - dow) + 7) % 7));
    return base.toISOString().slice(0, 10);
  };
  /* 🔴 SÓ ENTRA DIA QUE TEM CLIENTE — e "Hoje" não é um dia (dono, 08/08: "não
     pode ter os dias q não tem cliente, nem o hoje... só carregar e ficar
     selecionado o dia atual").
     Antes eram 8 chips: "Hoje" mais os outros 6 dias da semana. Dois defeitos
     num só: (1) o dia de hoje aparecia com nome falso — sábado se chamava
     "Hoje" e "Sáb" sumia da fila; (2) terça, quarta e domingo, dias em que esta
     empresa não entrega, convidavam pra uma lista vazia. Hoje o chip do dia
     atual É o dia dele (Sáb), já aceso, e o valor dele continua sendo 0 — o
     resto do fluxo (montar, prepare, salvar) lê 0 como "o dia de hoje, o
     caminho de sempre", e dinheiro não muda de trilho por causa de rótulo.
     🔴 QUEM DIZ QUE O DIA TEM GENTE É O SERVIDOR: `GET /logistica/agenda` traz
     `totalClientesDia` por dia da semana — a MESMA conta do chip do desktop, de
     propósito (dois fronts do mesmo produto não podem discordar sobre quem
     entrega na terça). `totalParadas` NÃO serve: ele zera sozinho quando o dia
     já foi gerado ou a cadência é quinzenal, e o dia sumiria da tela com os
     clientes todos lá dentro (é o FIX 27/07 do próprio backend). Medido no g15
     em 08/08: agenda e prévia concordam nos 7 dias (Seg 52·52, Ter 0·0,
     Qua 0·0, Qui 72·72, Sex 4·1, Sáb 98·98, Dom 0·0).
     -------------------------------------------------------------------- */
  let diasComCliente = null;      // Set de 1..7; null = ainda não medi
  let diasEmVoo = false;
  /* 🔴 A MESMA RESPOSTA JÁ TRAZIA A CONTA, E ELA ERA JOGADA FORA. O `/logistica/
     agenda` devolve `totalClientesDia` por dia e este loader guardava só o
     CONJUNTO de dias que têm gente — o suficiente pros chips ("Seg, Qua, Qui"),
     nada pro que o dono pediu em 09/08 ("os dias q foram agendados e
     quantidades"). Zero pedido novo ao servidor: o número já estava no pacote.

     🔴 E O FETCH SAIU DO PORTÃO DE ADMIN. Ele estava lá porque o único cliente
     era o chip da MONTAGEM, que é tela de admin — mas a semana é da tela do
     motorista também, e "em que dia eu entrego?" não é dado de dono. O
     endpoint não tem `@Admin` (conferido no controller); quem continua atrás do
     portão é a PUBLICAÇÃO dos chips (`publicarMontarDias`), que é o que
     realmente pertence ao admin. */
  async function carregarDiasComCliente() {
    if (typeof window.API === 'undefined' || diasEmVoo) return;
    diasEmVoo = true;
    let r;
    // Fonte no chão fica com o que já sabia — e, se nunca soube, com os 7 dias.
    // Sumir com um dia por IGNORÂNCIA tira o acesso ao dia; mostrar um dia a
    // mais custa um toque. O erro tem que cair pro lado que não prende ninguém.
    try { r = await window.API.get('/logistica/agenda'); } catch (_) { return; } finally { diasEmVoo = false; }
    const dias = Array.isArray(r && r.dias) ? r.dias : [];
    if (!dias.length) return;
    diasComCliente = new Set(dias
      .filter((d) => Number(d && d.totalClientesDia) > 0)
      .map((d) => Number(d.diaSemana)));
    publicarSemana(dias);
    publicarMontarDias();
  }

  /* A SEMANA DA AGENDA na tela da lista: `[[dia, 'Segunda', 53, ehHoje]]`.
     🔴 OS SETE DIAS ENTRAM, INCLUSIVE OS ZERADOS — ao contrário dos chips, que
     escondem o dia vazio de propósito (chip é CONVITE: levar pra uma lista sem
     ninguém é botão morto). Aqui a linha é RESPOSTA, não convite: quem abre a
     tela num domingo está perguntando "e nos outros dias?", e um domingo que
     some da semana deixa a pergunta sem resposta. Domingo com 0 é a resposta.
     Só o dia da semana entra — `totalClientesDia` é a LISTA DE GENTE do dia,
     estável; `totalParadas` zera sozinho quando o dia já foi gerado e faria a
     semana inteira piscar pra zero ao longo do turno (é o FIX 27/07 do backend). */
  const NOME_DIA = ['', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
  function publicarSemana(dias) {
    if (typeof window.usarDados !== 'function') return;
    const hoje = diaDaSemana();
    const porDia = new Map(dias.map((d) => [Number(d && d.diaSemana), d]));
    const semana = [1, 2, 3, 4, 5, 6, 7].map((n) => {
      const d = porDia.get(n);
      return [n, NOME_DIA[n], Number((d && d.totalClientesDia) || 0), n === hoje ? 1 : 0];
    });
    // Empresa que não agendou NINGUÉM em dia nenhum não ganha um quadro de sete
    // zeros: aí o bloco todo é ruído, e o vazio da tela já diz o que precisa.
    window.usarDados('rota', { semana: semana.some((x) => x[2] > 0) ? semana : [] });
  }

  /** os chips de dia da tela de MONTAGEM — sem admin, nada entra */
  function publicarMontarDias() {
    if (typeof window.usarDados !== 'function') return;
    if (!ehAdmin()) return;
    const hoje = diaDaSemana();
    // 🔴 A REGRA É UMA SÓ, E VALE PRO HOJE TAMBÉM (dono, 08/08: "se o dia não
    // tem nada: nada a exibir hoje"). Eu tinha aberto exceção pro dia atual —
    // ele ficaria de pé mesmo vazio, pra não sobrar seleção sem chip. Errado:
    // chip de um dia que não tem ninguém é convite pra lista vazia, e o dia
    // atual não é diferente dos outros. Quem explica a tela quando hoje está
    // vazio é o TEXTO ("Nada a exibir hoje"), não um chip mentindo que há o que
    // montar.
    /* 🔴 CHIP DE DIA É DA AGENDA, E SÓ DELA (dono, 09/08: "vc meio q criou um
       'dom' como se tivesse cliente de domingo, totalmente fora de semantica…
       isso aqui é AVULSO, crie uma parte avulsa"). A 1ª cura da "porta de
       volta" fez rascunho e parada aberta acenderem o chip de HOJE — e num
       domingo sem agenda nasceu um "Dom" mentindo que havia cliente de
       domingo. O chip conta a AGENDA; o avulso vive na PARTE AVULSA da lista
       de HOJE (etiqueta `avulsa` no somarRascunho/somarAvulsas), e a volta de
       um dia espiado é o 2º toque no chip aceso — regra que os chips já têm. */
    const temHoje = !!(diasComCliente && diasComCliente.has(hoje));
    const dias = [1, 2, 3, 4, 5, 6, 7]
      .filter((n) => (n === hoje ? temHoje : (!diasComCliente || diasComCliente.has(n))))
      .map((n) => [n === hoje ? 0 : n, ROTULO_DIA[n]]);
    window.usarDados('montagem', { dias, diaSel: montarDia });
  }

  /* O recado da lista vazia. Hoje sem ninguém não tem chip pra explicar a tela
     (a regra acima o tirou da fila), então quem explica é esta linha — texto
     literal do dono. Outro dia continua com o recado que já existia: ali o chip
     está aceso e o "nesse dia" tem a quem se referir. Um dia da semana pode vir
     vazio mesmo tendo gente: a cadência (quinzenal, de N em N) decide se ele
     cai NESTA semana. */
  const textoVazio = (dia) => (dia === -1 ? 'Rota avulsa — adicione as paradas'
    : dia ? 'Nenhum cliente nesse dia' : 'Nada a exibir hoje');

  /* 🔴 O CHIP DE DIA TEM QUE TROCAR A LISTA (dono, 07/08: "alterno entre dias
     e só aparece o mesmo cliente"). Antes o chip só mudava a SELEÇÃO — a lista
     continuava a mesma, e escolher Sábado parecia quebrado. Agora a MONTAGEM
     mostra a prévia do dia escolhido (`GET /logistica/dia-preview`, a mesma
     porta do app antigo): quem VAI entrar na rota, antes de materializar nada.
     Rota já montada tem prioridade: aí a montagem mostra a rota de verdade
     (escrita pelo `carregarRota`) e o botão do pé vira "Iniciar rota". */
  let previaSeq = 0;
  const PREVIA = [];                  // as paradas da prévia, pro Salvar rota
