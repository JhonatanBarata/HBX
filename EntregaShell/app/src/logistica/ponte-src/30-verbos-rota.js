  /* ------------------------------------------------------------------------
     A ROTA MONTADA VISTA PELA LISTA DA MONTAGEM.

     O elo é cliente+porta — o mesmo par que o espaço usa. `ENTREGAS` guarda as
     entregas na ordem que o servidor devolveu (que é a `rotaOrdem`), então a
     posição dentro dele É a sequência do otimizador.

     Devolve `null` quando não há rota montada ou quando ela não fala da mesma
     gente (dia trocado no chip, prévia de outro dia): sem casamento, a lista
     segue no encadeado por distância em vez de aceitar uma ordem alheia.
     ------------------------------------------------------------------------ */
  function pesosDaRotaMontada() {
    if (!ENTREGAS.size) return null;
    const porPorta = new Map();
    const porCliente = new Map();
    let i = 0;
    ENTREGAS.forEach((e) => {
      const it = e && e.item;
      const cid = String((it && it.cliente && it.cliente.id) || '');
      const pos = i; i += 1;
      if (!cid) return;
      /* 🔴 A MONTAGEM PRECISA DA PARADA INTEIRA, NÃO SÓ DA HORA (09/08). Com a
         rota já montada, a lista de lá mostra as MESMAS pessoas que a lista da
         rota — e mostrava todas como "Pendente", sem trecho nenhum, porque
         daqui só saía `hora`. `status` é o que acende a pílula; `legDistanceM`
         /`legDurationS` são a perna REAL, por rua, que o motor já calculou. */
      const dado = {
        pos,
        hora: hora(it.etaAt || it.scheduledAt),
        status: String((it && it.status) || ''),
        legDistanceM: typeof it.legDistanceM === 'number' ? it.legDistanceM : null,
        legDurationS: typeof it.legDurationS === 'number' ? it.legDurationS : null,
      };
      const porta = chaveDaPorta(cid, it && it.localId);
      if (!porPorta.has(porta)) porPorta.set(porta, dado);
      if (!porCliente.has(cid)) porCliente.set(cid, dado);
    });
    if (!porCliente.size) return null;
    return { porPorta, porCliente };
  }

  const naRotaMontada = (mapas, c) => {
    if (!mapas) return null;
    const cid = String((c && c.customerProfileId) || '');
    return mapas.porPorta.get(chaveDaPorta(cid, c && c.localId)) || mapas.porCliente.get(cid) || null;
  };

  function ordemDaRotaMontada(clientes, mapas) {
    if (!mapas) return null;
    // Casou pouco? Então a rota no servidor é de outro dia/outro conjunto e
    // ordenar por ela seria pior que não ordenar.
    const casou = clientes.filter((c) => naRotaMontada(mapas, c)).length;
    if (casou < Math.min(2, clientes.length) || casou * 2 < clientes.length) return null;
    const FIM = Number.MAX_SAFE_INTEGER;
    return clientes
      .map((c, i) => ({ c, p: (naRotaMontada(mapas, c) || { pos: FIM }).pos, i }))
      .sort((a, b) => (a.p - b.p) || (a.i - b.i))
      .map((x) => x.c);
  }

  /* ------------------------------------------------------------------------
     SOLTAR O DIA — o mesmo gesto por três portas: o 2º toque no chip aceso, o
     Voltar do Android e a seta do cabeçalho (dono, 10/08: "ao clicar em voltar
     1x, se tiver algum dia selecionado, ele remove a seleção; caso não tenha
     nada selecionado, só sai").
     Sem dia (`-1`) a Montagem é a ROTA AVULSA — o estado em que ela abre desde
     10/08. Escrito UMA vez porque as três portas têm que soltar o dia do mesmo
     jeito: chip apagado com a lista do dia ainda na tela é a tela mentindo.
     ------------------------------------------------------------------------ */
  function soltarDia() {
    if (montarDia === -1) return false;
    montarDia = -1;
    if (typeof window.usarDados === 'function') window.usarDados('montagem', { diaSel: -1 });
    carregarEspacos();
    encherMontagem();
    return true;
  }

  /** o botão do meio da Rota: abre a tela de montar, sem tocar no servidor */
  function abrirMontagem() {
    // Os espaços do dia entram junto com a tela — quem os busca é o guarda de
    // `tela === 'montagem'`, o mesmo lugar que já enche a lista.
    if (typeof window.ir === 'function') window.ir('montagem');
  }

  let ocupado = false;
  /* 🔴 TOQUE DESCARTADO TAMBÉM MERECE RECIBO (15/08): `comTrava` jogava o 2º
     toque fora CALADO. `alvo` é opcional (maioria dos chamadores segue igual,
     sem pulso); quem passa ganha o pulso curto na MESMA classe `aguarde` do
     toque em voo (`aguardeNoToque`, abaixo) — sem prometer que o verbo rodou. */
  function pulsarAguarde(alvo) {
    if (!alvo || !alvo.classList) return;
    alvo.classList.add('aguarde');
    setTimeout(() => { try { alvo.classList.remove('aguarde'); } catch (_) { /* nó já foi embora */ } }, 600);
  }
  const comTrava = async (fn, alvo) => {
    if (ocupado) { pulsarAguarde(alvo); return undefined; }
    ocupado = true;
    /* 🔴 O RESULTADO DE `fn` VIAJA DE VOLTA (10/08) — sem ele, `depoisDaTrava`
       (mais abaixo, o "refaz a ação original" do 409/402 novos) não tem como
       saber se o gesto deu certo antes de repetir o montar/iniciar. */
    try { return await fn(); } finally { ocupado = false; }
  };
  /* 🔴 O "SIM" DE UM PORTÃO NÃO PODE SER DESCARTADO (09/08). `comTrava` protege
     do toque duplo JOGANDO FORA o segundo — o que é certo pro botão de uma tela
     (ele continua ali, dá pra tocar de novo) e errado pra uma confirmação: ela
     FECHA no toque, e toque descartado numa peça que sumiu não tem repeteco.
     Se o app estiver ocupado no instante do "Iniciar" (a Montagem monta sozinha
     ao abrir, e a rede pode estar devolvendo isso agora), o dono via o diálogo
     fechar e nada acontecer. Aqui o toque ESPERA a vez; e se a vez não chegar,
     ele FALA — nunca morre calado. */
  const comTravaFila = async (fn) => {
    const limite = Date.now() + 12000;
    while (ocupado && Date.now() < limite) {
      await new Promise((r) => { setTimeout(r, 60); });
    }
    if (ocupado) return avisoErro(new Error('O app ainda está terminando a ação anterior. Toque de novo.'));
    return comTrava(fn);
  };
  /* 🔴 O PÉ DA MONTAGEM RESPONDE NO MESMO QUADRO DO TOQUE (12/08 — dor do
     dono: toca em "Montar rota" e NADA acontece por segundos; o primeiro
     recibo visual, o `montando(1)` do montarRota, só sai DEPOIS do
     materializarRascunho — que é rede — e gente fica tocando de novo até
     aparecer algo). Duas peças, cada uma com um papel:

       · a CLASSE `aguarde` entra no botão vivo AINDA NO TOQUE, antes de
         qualquer await — a mesma cara do `.ocupado` + pointer-events (cromo
         direto no nó, nunca pelo seam: repinte de seam pisca e chega tarde);
       · a TRAVA é variável DA PONTE, não do DOM: o repinte do meio do fluxo
         (o `carregarRota` de dentro do materializar) troca o nó, e nó novo
         nasce sem a classe — quem segura o toque nesse vão é isto aqui. O
         `comTrava` já descartava o toque duplo (medido na cena Y da prova:
         2 toques = 1 planejar, antes mesmo disto); esta camada soma o recibo
         visual e devolve o botão em ERRO — coisa que o comTrava não faz
         porque não sabe qual nó tocou.

     No fim (sucesso OU erro) a trava solta e a classe sai do nó que ainda
     estiver na mão: em sucesso o repinte já levou a tela embora (nó novo
     nasce limpo, e o "Montando…" do seam assume); em erro o botão volta
     INTEIRO pra tentativa seguinte — aguarde pendurado é promessa falsa. */
  let verboDoPeEmVoo = false;
  function aguardeNoToque(alvo, seguir) {
    if (verboDoPeEmVoo) return;
    verboDoPeEmVoo = true;
    if (alvo && alvo.classList) alvo.classList.add('aguarde');
    const soltar = () => {
      verboDoPeEmVoo = false;
      if (alvo && alvo.classList) alvo.classList.remove('aguarde');
    };
    Promise.resolve().then(seguir).then(soltar, soltar);
  }
  /* 🔴 O CORPO DO ERRO TEM DADO, E ELE ESTAVA SENDO JOGADO FORA (10/08 — o
     beco que travou o dono: toque em Montar/Iniciar morrendo em "Não deu
     certo" quando o servidor já sabia dizer QUEM montou a rota, ou QUEM
     ficou de fora do dia vazio). Contrato novo do servidor: o corpo do erro
     pode trazer `code` (409 `ROTA_DE_OUTRO_MOTORISTA`, 402
     `ASSENTOS_ESGOTADOS`), e o materialize desta MESMA tentativa pode ter
     guardado `avisos` nomeados. `avisoErro` lê os dois ANTES de cair na
     frase genérica — e recebe, opcional, QUEM refaz a ação depois de
     resolver (`contexto.repetir`). */
  let ultimosAvisosMaterialize = [];
  /* 🔴 REFAZER DEPOIS NÃO PODE FICAR PRESO NA MESMA TRAVA. "Forçar
     cancelamento e puxar" e "Liberar hoje" prometem refazer o montar/iniciar
     sozinhos — e refazer é outro gesto, com a MESMA `comTrava` por dentro.
     Chamado ainda DENTRO da trava do gesto que abriu o portão, ele veria
     `ocupado=true` e morreria calado — o toque mudo que esta casa já matou
     uma vez (ver a nota do `comTrava`, acima). `depoisDaTrava` espera a
     trava soltar (o `.then()` só corre depois do `finally` de `comTrava`) e
     só chama `depois` quando `fn` terminou OK. */
  const depoisDaTrava = (fn, depois) => {
    comTravaFila(fn).then((sucesso) => {
      if (sucesso && typeof depois === 'function') depois();
    });
  };
  const avisoErro = (e, contexto) => {
    const body = (e && e.body) || null;
    const code = String((body && body.code) || '');
    if (code === 'ROTA_DE_OUTRO_MOTORISTA') return portaoOutroMotorista(body);
    if (code === 'ASSENTOS_ESGOTADOS') {
      const repetir = contexto && typeof contexto.repetir === 'function' ? contexto.repetir : null;
      return portaoAssentosEsgotados(body, repetir);
    }
    const msg = humano(e);
    // A MESMA frase genérica ("Nenhuma entrega aberta") vira RECADO NOMEADO
    // quando o materialize DESTA tentativa guardou por quem ela passou vazia.
    if (/Nenhuma entrega aberta/i.test(msg) && ultimosAvisosMaterialize.length) {
      return portaoAvisosMaterialize(ultimosAvisosMaterialize);
    }
    if (typeof window.portao === 'function') {
      window.portao({ tom: 'trava', ico: 'alert', titulo: 'Não deu certo', sub: msg, acoes: [['Fechar', '']] });
    }
  };
  // A ROTA FANTASMA (14/08) — `avisoErroContinuidade` mora em
  // `25-continuidade-rota.js`, junto dos verbos que ela ressincroniza.
  const hojeISO = () => diaOperacional();

  /* 🔴 A CONFIRMAÇÃO PADRÃO DA CASA, NUM LUGAR SÓ (10/08) — o mesmo "Tem
     certeza que deseja cancelar? Não/Sim" que o Cancelar já usava (lei do
     dono, 29/07) passa a ser também o "Forçar cancelamento e puxar" do 409
     de outro motorista. `depoisDaTrava`, não `comTrava` direto: este é o
     "Sim" de um portão — ele FECHA no toque, então toque descartado por app
     ocupado não tem repeteco, e `depois` só roda DEPOIS que a trava soltou
     e a limpeza deu certo. Confirma, limpa o dia no servidor, esquece a
     rota carregada deste lado do fio (a fita, a geometria, a lista — ANTES
     do `carregarRota`, senão o repinte passaria com a rota morta ainda
     desenhada), recarrega — e só então `depois` decide o que vem: sair pra
     Rota (o Cancelar) ou remontar sozinho (o Forçar). */
  /* 🔴 O RECIBO DO CANCELAR (17/08 — MEDIDO no g15, APK 339, gravação do
     cancelamento de verdade). O "Sim" some e o servidor leva ~860 ms pra
     responder; nesse vão a tela continuava sendo a de dirigir INTEIRA e ACESA —
     traço verde, tarja de manobra, "14 min · 6,1 km · 14:42" e o próprio botão
     "Cancelar" ainda oferecido —, com 490 ms num quadro CONGELADO (quadros
     pixel-idênticos na medição). Toque sem recibo é toque que o dono repete.
     Mesma cura do `montando` (32-verbos-montar-iniciar.js): a bandeira acende
     SÍNCRONA, antes do 1º pedido, e o rodapé vira "Cancelando…" pelo
     `dockDaRota` — que serve as duas câmeras de uma vez. */
  const cancelando = (v) => {
    try { window.usarDados('rota', { cancelando: v }); } catch (_) { /* sem seam: o verbo continua */ }
  };
  function confirmarLimparDia(depois, aoLimpar) {
    if (typeof window.portao !== 'function') return;
    window.portao({
      tom: 'alerta', ico: 'close', titulo: 'Tem certeza que deseja cancelar?',
      acoes: [['Não', ''], ['Sim', 'principal']], classe: 'duas', perigo: true,
    });
    const botao = naCamada('.portao-wrap .principal');
    if (!botao) return;
    botao.addEventListener('click', () => {
      /* 🔴 O RECIBO ESPERA O PORTÃO SAIR — 230 ms, A ESPERA DA CASA (17/08).
         A 1ª versão desta cura acendia o recibo NO MESMO QUADRO do toque, e
         MEDI o estrago no g15: um repinte de camada na tela de dirigir custa
         **~400 ms** de linha principal (o mesmo custo que aparece como os 490 ms
         da gravação de antes e os 276 ms do teste de transplante isolado). Posto
         em cima do toque, ele engolia justamente os 200 ms de saída do diálogo —
         e animação de CSS corre no RELÓGIO, não no quadro: bloqueada, ela termina
         por dentro e o 1º quadro depois do bloqueio já mostra o véu sumido.
         Medida: a tarja saltando 29,0 → 44,3 em UM quadro, o MESMO número de
         antes do conserto. Consertar o `mvScrimSai` não bastava porque não havia
         quadro nenhum pra ele desenhar.
         230 ms é a espera que esta casa já usa pro tour (§ delegado do
         `data-fechar`, no mock: *"o portão fecha primeiro, e a espera cobre a
         saída dele"*) e fica logo depois dos 210 ms em que o `fechar` tira o nó.
         A REDE NÃO ESPERA — o `depoisDaTrava` sai no mesmo toque, então o
         cancelamento não fica 230 ms mais lento; quem espera é só a TINTA. E o
         resultado é sequência de verdade: o diálogo sai, DEPOIS o rodapé vira
         "Cancelando…", DEPOIS a tela troca. Nunca duas coisas no mesmo quadro. */
      let reciboTimer = setTimeout(() => { reciboTimer = 0; cancelando(1); }, 230);
      // apaga o recibo — e se ele nem chegou a acender, só desarma o relógio
      // (acender pra apagar no quadro seguinte é o pisca que isto evita).
      const soltarRecibo = () => {
        if (reciboTimer) { clearTimeout(reciboTimer); reciboTimer = 0; return; }
        cancelando(0);
      };
      depoisDaTrava(async () => {
        /* 🔴 A DEMONSTRAÇÃO CANCELA POR DENTRO (24/08), E A REF NÃO ERA A CURA.
           MEDIDO no g15 (APK 358, conta nova — a demonstração abriu sozinha por
           `talvezOferecerDemo`): o Cancelar não morria no cano da demonstração
           (`__demoIntercepta`, § 00-nucleo), morria TRÊS LINHAS ANTES. A ref de
           continuidade nasce de `refDaResposta` (§ 25-continuidade-rota) e o
           `GET /logistica/rota` fingido não tem `continuityRef`, não tem
           `routeId` e não tem `entregador` nos itens — as três portas fechadas,
           ref vazia, e o dono levava "Atualize a rota antes de cancelar" numa
           rota que nunca existiu em servidor nenhum.
           E publicar uma ref no payload fingido seria TROCAR o defeito por um
           pior: rota 'rodando' + ref viva + `ownedRefs` vazia (a demonstração
           responde continuidade sem `items`, então `vestirPendencias` sai na
           primeira linha e `refsDoAtor` fica []) + paradas abertas acende o
           bloco de posse revogada do lote 1.5 — `stopRoute` + `carregarRota` a
           cada tique de 60 s, a cada foco e a cada visibilitychange. É o loop
           que aquele lote existe pra ter matado.
           Então quem sabe o que "cancelar" significa lá dentro é a própria
           demonstração, e ela ganha UM seam — a mesma forma do cano, um lugar
           só. O verbo real fica intocado: sem demonstração no ar o seam nem
           existe, e daqui pra baixo é a linha de sempre.
           `=== true` de propósito: seam ausente, casca velha ou demonstração
           fechada devolvem qualquer outra coisa e o caminho de sempre segue. */
        const demoTratou = typeof window.__demoCancelarRota === 'function'
          && window.__demoCancelarRota() === true;
        if (!demoTratou) {
          if (!rotaRefAtual) {
            soltarRecibo();
            avisoErro(new Error('Atualize a rota antes de cancelar.'));
            return false;
          }
          if (!(await filaOfflinePronta())) { soltarRecibo(); return false; }
          try { await window.API.post('/logistica/rota/continuidade/cancelar', { ref: rotaRefAtual }); }
          catch (e) { soltarRecibo(); await avisoErroContinuidade(e); return false; }
        }
        /* 🔴 UM EVENTO VISUAL SÓ, E A ORDEM É O CONSERTO INTEIRO (17/08 — o
           "não tem sequência" do dono, medido quadro a quadro).
           ANTES daqui a saída era em QUATRO repintes soltos, cada um disparado
           pelo dado que por acaso mudou, com um `await` no meio pra o olho ver
           cada pedaço:
             1. `esquecerRotaCarregada()` → `usarDados` → `pintar` SÍNCRONO:
                levava o traço, a tarja e a linha "14 min · 6,1 km" embora…
             2. …e DEIXAVA a fileira de botões, porque a tela ainda era `mapa`.
                Medida: o "Panorâmica" verde ficou pixel-idêntico (luma 161,323)
                por 732 ms sobre um mapa que já não tinha rota — meia peça viva,
                meia peça morta, que é literalmente a metade de uma transição.
             3. o `await carregarRota()` cedia o quadro e ESSE estado rachado
                virava imagem na tela;
             4. só então o `depois` trocava de tela e a fileira sumia de estalo —
                luma da tela inteira caindo 42,4 → 28,6 em UM quadro, o mapa sem
                tiles e o cromo novo entrando por cima. O pisca.
           Agora a troca de tela vem PRIMEIRO e nada espera entre as três linhas:
           sem `await` no meio, o navegador pinta UMA vez, no fim do tique. A
           camada que SAI é a de dirigir INTEIRA (com o recibo "Cancelando…" que
           o dedo acendeu) e ela cumpre o show de `modo-troca` inteiro, 900 ms,
           sem ser desmontada por dentro; a que ENTRA já nasce com o dia limpo.
           `aoLimpar` e não `depois`: o `depois` roda DEPOIS da trava soltar (é o
           contrato do `depoisDaTrava`, e o "Forçar" do 409 depende disso pra
           remontar), e o que precisa ser atômico com a faxina é a TELA. Quem só
           passa `depois` (o 409) continua com o comportamento de antes.
           A faxina segue ANTES do `carregarRota`, como a lei de 09/08 manda: se
           a rede cair no meio, o servidor já cancelou e a tela tem que estar
           limpa do mesmo jeito. */
        if (typeof aoLimpar === 'function') aoLimpar();
        esquecerRotaCarregada();
        soltarRecibo();
        await carregarRota();
        return true;
      }, depois);
    }, { once: true });
  }

  /* 409 ROTA_DE_OUTRO_MOTORISTA — fala quem montou e oferece o handoff exato.
     Nada é apagado: só as paradas abertas do dono/data informados no conflito
     podem mudar de mãos. */
  function portaoOutroMotorista(body) {
    if (typeof window.portao !== 'function') return;
    const podeForcar = !!(body && body.podeForcar);
    const sub = String((body && body.message) || 'Essa rota já foi montada por outro motorista.');
    if (!podeForcar) {
      window.portao({ tom: 'trava', ico: 'alert', titulo: 'Rota já montada', sub, acoes: [['Fechar', '']] });
      return;
    }
    window.portao({
      tom: 'trava', ico: 'alert', titulo: 'Rota já montada', sub,
      acoes: [['Fechar', ''], ['Puxar rota', 'principal']], classe: 'duas',
    });
    const botao = naCamada('.portao-wrap .principal');
    if (!botao) return;
    botao.addEventListener('click', async () => {
      let resp;
      try { resp = await window.API.get('/logistica/rota/continuidade'); } catch (e) { return avisoErro(e); }
      const ids = new Set((Array.isArray(body && body.montadores) ? body.montadores : [])
        .map((m) => Number(m && m.userId)).filter((id) => id > 0));
      const data = String((body && body.date) || hojeISO());
      const alvo = (resp && Array.isArray(resp.items) ? resp.items : []).find((p) => p && p.canPull
        && ids.has(Number(p.owner && p.owner.id)) && String(p.date || '') === data);
      if (!alvo) return avisoErro(new Error('Não há paradas abertas e transferíveis nesta rota.'));
      puxarRotaPendente({ dataset: { ref: String(alvo.ref), owner: String(alvo.owner && alvo.owner.id || '') } });
    }, { once: true });
  }

  /* 🔴 402 ASSENTOS_ESGOTADOS — mesma língua: o corpo é a frase do servidor,
     e a única ação (comprar o passe do dia) só nasce quando ele autoriza
     (`podeComprarPasse`). Comprado, refaz a AÇÃO ORIGINAL — montar ou
     iniciar, quem chamou decide (`repetir`, vindo do `contexto` do
     `avisoErro`). */
  function portaoAssentosEsgotados(body, repetir) {
    if (typeof window.portao !== 'function') return;
    const podeComprar = !!(body && body.podeComprarPasse);
    const sub = String((body && body.message) || 'Assentos esgotados hoje.');
    if (!podeComprar) {
      window.portao({ tom: 'trava', ico: 'card', titulo: 'Assentos esgotados', sub, acoes: [['Fechar', '']] });
      return;
    }
    const n = Number(body && body.passeCreditos);
    const rotulo = `Liberar hoje (${Number.isFinite(n) ? String(n).replace('.', ',') : '0'} créditos)`;
    window.portao({
      tom: 'trava', ico: 'card', titulo: 'Assentos esgotados', sub,
      acoes: [['Fechar', ''], [rotulo, 'principal']], classe: 'duas',
    });
    const botao = naCamada('.portao-wrap .principal');
    if (!botao) return;
    botao.addEventListener('click', () => depoisDaTrava(async () => {
      try { await window.API.post('/logistica/rota/passe-do-dia', {}); } catch (e) { avisoErro(e); return false; }
      return true;
    }, repetir), { once: true });
  }

  /* 🔴 O RECADO NOMEADO DO DIA VAZIO (10/08 — a madrugada que travou o dono:
     "Nenhuma entrega aberta neste dia" na cara de quem só precisava saber
     QUEM ficou de fora e por quê). Quando o materialize DESTA tentativa
     guardou avisos, eles trocam de lugar com a frase genérica: até 5, um
     por linha, no `corpo` do portão (não no `sub` — é lista, não frase). */
  function portaoAvisosMaterialize(avisos) {
    if (typeof window.portao !== 'function') return;
    const linhas = avisos.slice(0, 5).map((a) => esc(a));
    window.portao({
      tom: 'trava', ico: 'alert', titulo: 'Não deu certo',
      sub: 'Ninguém entrou na rota:', corpo: linhas.join('<br>'), acoes: [['Fechar', '']],
    });
  }

  /* 🔴 O PONTO DE PARTIDA DA ROTA É ONDE O MOTORISTA ESTÁ — e o app nunca
     mandava (dono, 08/08: "já carregar montado pelo GPS").
     O servidor SEMPRE soube receber isto: `origemLat/origemLng` está no
     PlanejarRotaDto ("GPS do entregador (ponto de partida)"), no ConferirRotaDto,
     no IniciarRotaDto e no prepare do admin. Sem ele, `coordFromInput` devolve
     null e o `nearestNeighbor` faz o que está escrito no próprio código: "sem
     origem: a 1ª parada da LISTA é o ponto de partida" — ou seja, a rota nascia
     encadeada a partir de um cliente sorteado pela varredura do banco, com o
     carro do motorista em outro bairro. Este objeto é o conserto inteiro.

     Vai nos QUATRO caminhos que rodam o motor, e não em um só: planejar (montar),
     conferir (o semáforo roda o MESMO motor em dry-run — origem diferente daria
     um aviso sobre uma rota que não é a montada), prepare (o dia puxado pra hoje)
     e iniciar — que RE-PLANEJA ("re-planeja a partir da origem atual"). Faltando
     no iniciar, a ordem que ele acabou de ver na montagem seria reescrita no
     toque seguinte, e o motorista sairia com uma sequência que ninguém mostrou.
     Sem fix, o objeto é VAZIO e tudo volta a ser exatamente o que era. */
  const origemGps = () => (ultimaPos ? { origemLat: ultimaPos.lat, origemLng: ultimaPos.lng } : {});

  /* ------------------------------------------------------------------------
     🔴 A ORDEM É DO OTIMIZADOR — SALVO QUANDO GENTE DECIDE (dono, 08/08).

     A regra tem duas metades, e a 1ª versão desta seção errou por só ter uma:
       · SEM decisão humana → quem ordena é o servidor, a partir do GPS. Ele
         roda no montar e RE-RODA no iniciar ("re-planeja a partir da origem
         atual"), que é justamente o que o dono quer: a rota sai encadeada de
         onde ele está NA HORA DE SAIR, não de onde ele estava ao montar.
       · COM decisão humana → arrasto do dedo ou um ESPAÇO escolhido. Aí a
         sequência é dele e o motor não tem o direito de refazê-la: entra o
         `ordemManual` ("os ids recebem rotaOrdem NA ORDEM DADA e o motor pula
         o NN+2-opt"), o mesmo contrato que o Gerenciador do desktop usa.

     Mandar `ordemManual` SEMPRE — como esta seção fazia — é desligar o
     otimizador com outro nome. Ele volta a mandar por padrão.

     💰 Re-planejar o mesmo conjunto não cria parada nem debita (claim único por
     empresa+motorista+data+bloco).
     ------------------------------------------------------------------------ */

  /** o dedo ou um espaço mandaram nesta lista? então a ordem é DELES */
  const ordemDeGente = () => previaDoDedo || modoSel !== 'dist';

  /* ⚰️ `pularMontarAoAbrir` morreu em 10/08 junto com o auto-montar da entrada
     (a chave existia só pra proteger a decisão humana DELE — sem o mecanismo,
     a proteção é a regra geral: entrar não grava nada). Chave morta varrida no
     mesmo commit, pela lei da casa. */

  /* Casa a lista da tela (clientes) com as entregas do dia (ids) e devolve a
     sequência em ids — o formato que o servidor entende. O elo é o CLIENTE:
     mesmo cliente com duas portas vira duas entregas, consumidas na ordem em
     que aparecem. Entrega fora da tela não se perde: vai pro fim, explícita.
     `null` = não deu pra casar, e aí ninguém crava nada. */
  function idsNaOrdemDaTela() {
    if (!ENTREGAS.size || !PREVIA.length) return null;
    const porCliente = new Map();
    ENTREGAS.forEach((e, id) => {
      const cid = String((e && e.item && e.item.cliente && e.item.cliente.id) || '');
      if (!cid) return;
      const fila = porCliente.get(cid);
      if (fila) fila.push(String(id));
      else porCliente.set(cid, [String(id)]);
    });
    const ids = [];
    PREVIA.forEach((p) => {
      const fila = porCliente.get(String((p && p.customerProfileId) || ''));
      if (fila && fila.length) ids.push(fila.shift());
    });
    if (ids.length < 2) return null;
    const atual = [...ENTREGAS.keys()].map(String);

    return ids.concat(atual.filter((id) => ids.indexOf(id) < 0));
  }

  /* O RECORTE DA ROTA AVULSA: os ids de entrega de quem está NA TELA — e só
     deles. Mesmo casamento por cliente do `idsNaOrdemDaTela`, com duas
     diferenças de propósito: só entrega ABERTA entra (cancelada com ordem vive
     em ENTREGAS pra lista, mas não sai pra rua), e não existe piso de 2 nem
     rabo com o resto do dia — o resto do dia é exatamente o que a avulsa
     deixou de fora. */
  function idsDaPrevia() {
    if (!ENTREGAS.size || !PREVIA.length) return null;
    const porCliente = new Map();
    ENTREGAS.forEach((e, id) => {
      const st = String((e && e.item && e.item.status) || '');
      if (st === 'entregue' || st === 'cancelada') return;
      const cid = String((e && e.item && e.item.cliente && e.item.cliente.id) || '');
      if (!cid) return;
      const fila = porCliente.get(cid);
      if (fila) fila.push(String(id));
      else porCliente.set(cid, [String(id)]);
    });
    const ids = [];
    PREVIA.forEach((p) => {
      const fila = porCliente.get(String((p && p.customerProfileId) || ''));
      if (fila && fila.length) ids.push(fila.shift());
    });
    return ids;
  }

  /* Crava no servidor a ordem que a gente decidiu. Só é chamada quando
     `ordemDeGente()` — em modo Distância isto NUNCA roda, e o otimizador segue
     dono da sequência. Devolve false só quando tentou e o servidor recusou. */
  async function cravarOrdemDaTela() {
    const alvo = idsNaOrdemDaTela();
    if (!alvo) return true;
    if (alvo.join('|') === [...ENTREGAS.keys()].map(String).join('|')) return true;
    try {
      await window.API.post('/logistica/rota/planejar', {
        date: hojeISO(), ordemManual: alvo, ...origemGps(),
      });
    } catch (_) {
      return false;
    }
    await carregarRota();
    return true;
  }

  /* ------------------------------------------------------------------------
     O RASCUNHO VIRA ENTREGA — e este é o ÚNICO lugar onde isso acontece.

     Três chamadores, todos com o dedo do dono em cima: "Salvar rota", "Montar
     rota" e "Iniciar rota". Um lugar só de propósito: enquanto criar a parada
     morava dentro da porta de escolher gente, escolher e gravar eram a mesma
     coisa — que é o defeito inteiro que esta frente mata.

     🔴 UMA DE CADA VEZ, e não `Promise.all`: cinco POSTs em paralelo disputam a
     mesma rota no servidor, e o que eu ganharia em segundos eu perderia em não
     saber QUEM entrou quando um falha. Aqui a falha é por NOME (mesma lei da
     porta "Meus clientes", de onde este laço veio).

     🔴 RESPEITA O QUE JÁ EXISTE: quem já tem parada aberta hoje não nasce de
     novo (a mesma porta não entra 2× na rota do dia), e `paraMinhaRota` continua
     sendo o que dá MOTORISTA à entrega — sem ele o Iniciar recusa o dia inteiro.

     O rascunho sai da memória ANTES dos POSTs (`splice`): se a rede cair no
     meio, o que entrou está no servidor e o que não entrou é dito por nome —
     segurar a lista aqui faria o toque seguinte tentar criar tudo de novo.
     ------------------------------------------------------------------------ */
  /* ------------------------------------------------------------------------
     🔴 O SELO É UM VERBO, NÃO UM CAMPO DE NASCIMENTO (18/08).

     Até aqui a escolha "Prioridade" viajava DENTRO do `POST /logistica/entregas`
     — e derrubava a porta inteira: o DTO não declara o campo, o ValidationPipe
     é whitelist, e a resposta era `400 property prioridade should not exist`.
     Como a chave ia SEMPRE (até como `false`, no caminho dos vários), "Comum"
     morria igual — a tela dizia "Não deu certo" pra qualquer adição.

     E, mesmo aceito, nascer prioritária não é o caso real: na montagem não
     existe fila pra pular. O caso é ROTA ACONTECENDO — a parada já está lá e o
     dedo decide que ela passa na frente. Por isso: cria a parada como sempre e
     CARIMBA depois, pelo `PATCH /logistica/entregas/:id/prioridade`.

     Falhar o carimbo NÃO desfaz a parada (ela existe, e apagar por causa de um
     enfeite seria pior): devolve quantas não carimbaram pro recibo dizer a
     verdade — "entrou como comum" — em vez de prometer vermelho que não veio.
     Uma de cada vez, mesma lei do laço de criação (saber QUEM falhou).
     ------------------------------------------------------------------------ */
  async function carimbarPrioridade(ids) {
    const naoCarimbou = [];
    for (const id of ids) {
      if (!id) continue;
      try {
        await window.API.patch(`/logistica/entregas/${encodeURIComponent(String(id))}/prioridade`, { prioridade: true });
      } catch (_) { naoCarimbou.push(String(id)); }
    }
    return naoCarimbou;
  }

  async function materializarRascunho() {
    if (!RASCUNHO.length) return { falharam: [], entraram: 0 };
    const fila = RASCUNHO.splice(0, RASCUNHO.length);
    const falharam = [];
    const carimbar = [];
    let entraram = 0;
    for (const c of fila) {
      if (paradaAbertaDaConta(String(c.id))) continue;
      try {
        const criada = await window.API.post('/logistica/entregas', {
          customerProfileId: String(c.id),
          /* 🔴 A PORTA VIAJA JUNTO (09/08). Sem `localId` a entrega nasce no
             ENDEREÇO DO PERFIL mesmo quando o rascunho sabe de qual porta o
             dia veio — reutilizar um dia do histórico mandava o motorista pra
             porta errada com a lista dizendo a certa. O DTO já aceita o campo
             e o servidor valida que o local é do mesmo cliente+empresa. */
          ...(c.localId ? { localId: String(c.localId) } : {}),
          quantidade: 1,
          scheduledAt: `${hojeISO()}T12:00:00.000Z`,
          paraMinhaRota: true,
          // 18/08 — `prioridade` NÃO vai mais neste corpo (ver § carimbarPrioridade).
          // O id que volta aqui é o que o carimbo usa logo abaixo.
        });
        entraram += 1;
        if (c.prioridade && criada && criada.id) carimbar.push(String(criada.id));
      } catch (_) { falharam.push(c.nome || 'Cliente'); }
    }
    // Carimbo ANTES do `carregarRota()`: a lista já volta com o vermelho no
    // lugar certo, e o `planejar` que vier depois já ancora o selo no topo.
    if (carimbar.length) await carimbarPrioridade(carimbar);
    // A rota é relida ANTES de quem chamou seguir: é dela que sai a lista de
    // abertas que o planejar vai ordenar.
    if (entraram) await carregarRota();
    publicarMontarDias();      // o chip de HOJE pode ter mudado de fonte
    return { falharam, entraram };
  }

  /** monta a rota do dia: planeja (grava a ordem) e confere (semáforo). */
  /* 🔴 MONTAR TEM QUE MATERIALIZAR A AGENDA — o app novo não tinha ESTA porta
     (10/08, madrugada em que o dono ficou preso). O `planejar` só ORDENA o que
     existe; quem CRIA a entrega do dia a partir da agenda é o
     `materializeForRoute` do servidor, e no app novo ninguém o chamava: o
     app velho falava `/logistica/gerar-dia` via mobile-contract.js, que morreu
     na fusão sem herdeiro (o padrão "capacidade viva, fio cortado"). Sobrava o
     cron de 1×/dia — e um `limpar-dia` às 00:44 deixou a segunda-feira com
     102 canceladas e ZERO abertas, com a tela mostrando a prévia da agenda e o
     Iniciar respondendo "Nenhuma entrega aberta neste dia. Monte a rota antes
     de iniciar" — monte COMO, se nenhum botão materializava?
     A porta já existia no servidor E na allowlist do Kotlin
     (`POST /logistica/mobile/materialize`); é idempotente (gerar o mesmo dia
     2× cria uma vez) e ainda puxa a vassoura dos dias anteriores
     (`encerrarDiasAnteriores`), que o cron pula.
     Falhar aqui NÃO derruba o montar: o planejar segue ordenando o que já
     existe — o dia normal (entregas já criadas) nunca fica refém desta ida. */
  async function materializarDia() {
    try {
      const resp = await window.API.post('/logistica/mobile/materialize', {
        operationalDate: hojeISO(), sourceDates: [hojeISO()],
      });
      const avisos = Array.isArray(resp && resp.avisos) ? resp.avisos.map(String) : [];
      // 🔴 O ESTADO FICA GUARDADO PRA QUEM VIER DEPOIS (`avisoErro`, 10/08): se
      // o planejar/custo-preview seguinte morrer em "Nenhuma entrega aberta",
      // é ESTE recado — nomeado, cliente a cliente — que substitui a frase
      // genérica no portão de erro.
      ultimosAvisosMaterialize = avisos;
      return {
        ok: true,
        criadas: Number((resp && resp.criadas) || 0),
        puladas: Number((resp && resp.puladas) || 0),
        avisos,
      };
    } catch (_) {
      ultimosAvisosMaterialize = [];
      return { ok: false, criadas: 0, puladas: 0, avisos: [] };
    }
  }

  /* ------------------------------------------------------------------------
     🔴 O DIA ESCOLHIDO ENTREGA HOJE (dono, 10/08) — e este é o único lugar onde
     a lista de outro dia vira trabalho de verdade.

     `montarDia > 0` e não é hoje: a tela está mostrando a gente de outra
     data. Montar/Iniciar então fazem exatamente o que fariam com o dedo: a
     lista da tela vira RASCUNHO e o rascunho vira entrega DE HOJE, pela mesma
     porta de sempre (`materializarRascunho`). Nada de dia futuro, nada de
     `prepare`, nenhum portão pedindo pra ele voltar quarta-feira.

     A BAGAGEM INTEIRA VIAJA — a mesma do `usarHistorico`, e pelo mesmo motivo:
     o que sai daqui senta no MESMO cartão da linha da agenda e é lido pela
     MESMA régua (`localId` pra nascer na porta certa, `enderecoLinha` do
     servidor, pino pela régua única, `resolveSozinho` pra não gritar "não sei
     onde fica" em cliente com porta marcada).

     Quem JÁ tem parada aberta hoje não nasce de novo — e não sai da conta: o
     recorte é medido por CLIENTE (`idsDaPrevia`), então ele continua na rota,
     com a entrega que já existia. É o caso do cliente que entrega na segunda e
     na quarta com o cron já tendo criado a de hoje.
     ------------------------------------------------------------------------ */
  const diaDeOutroDia = () => montarDia > 0 && montarDia !== diaDaSemana();

  function previaViraRascunho() {
    const fonte = Array.isArray(previaCrua) ? previaCrua : [];
    const jaNoRascunho = new Set(RASCUNHO.map((c) => chaveDaPorta(c.id, c.localId)));
    let novos = 0;
    fonte.forEach((c) => {
      const id = String((c && c.customerProfileId) || '');
      const porta = chaveDaPorta(id, c && c.localId);
      if (!id || jaNoRascunho.has(porta) || paradaAbertaDaConta(id)) return;
      jaNoRascunho.add(porta);
      RASCUNHO.push({
        id,
        ...(c.localId ? { localId: String(c.localId) } : {}),
        nome: String(c.nome || 'Cliente'),
        enderecoLinha: String(c.enderecoLinha || ''),
        bairro: String(c.bairro || c.cidade || ''),
        ...(pinoValido(c.lat, c.lng) ? { lat: Number(c.lat), lng: Number(c.lng) } : {}),
        resolveSozinho: !!c.resolveSozinho,
        // "Ult. Registro" (12/08): a prévia já traz o campo — perdê-lo aqui faria
        // o MESMO cartão trocar a data por "Pendente" só por virar rascunho.
        ...(c.ultimaEntregaAt ? { ultimaEntregaAt: String(c.ultimaEntregaAt) } : {}),
      });
      novos += 1;
    });
    return novos;
  }

