
  /* ==========================================================================
     RADAR — a ÚNICA tela deste app em que o dedo vira DINHEIRO.

     São CINCO portas e cada uma tem desfecho próprio (nenhuma derruba a outra):
       GET  /webscraping/radar/leads              → a colheita (a lista)
       GET  /webscraping/radar/search-runs/latest → a corrida deixada rodando
       GET  /webscraping/radar/preference-suggestions → os chips de segmento
       GET  /credits/me                           → o saldo (o que sobra pra gastar)
       POST /webscraping/radar/count              → a contagem GRÁTIS
       POST /webscraping/radar/search-runs        → começar a busca (grátis)
       POST /webscraping/radar/search-runs/:id/cancel     → parar a busca
       POST /webscraping/radar/leads/:id/send-to-vendas   → 🔴 O ÚNICO QUE COBRA

     🔴 O RADAR RESPONDE FALHA COM 200. `buildRadarClientErrorResponse` devolve
     `{items:[], code, message, meta:{available:false}}` com status 200 — quem
     tratar só o `catch` acha que recebeu uma lista vazia e escreve na tela
     "nenhuma empresa com esse pedido" quando o que houve foi o Radar fora do ar.
     São cenas OPOSTAS (a lei nº1 do portão de fontes), então `meta.available
     === false` é lido como queda em TODAS as leituras deste arquivo.

     🔴 A CONTAGEM É GRÁTIS E VEM ANTES DE GASTAR — e por isso ela zera sozinha
     quando o pedido muda. Contagem velha ao lado de pedido novo é uma mentira
     barata que decide um gasto: "86 empresas batem" com a cidade já trocada faz
     a pessoa buscar (e puxar) achando que o número era daquele pedido.

     🔴 A CORRIDA É ASSÍNCRONA E VIVE NO SERVIDOR. "Ainda rodando" e "terminou e
     não achou" são CENAS DIFERENTES no desenho, e a diferença é o `status` do
     run — nunca o tamanho da lista. Sair da tela não mata a busca: ao voltar, o
     `/latest` reencontra a corrida e a tela continua de onde parou.
     ========================================================================== */

  /* Quanto da colheita a tela carrega de uma vez. Não é o tamanho da corrida
     (esse é o `quantidade`, escolha do dedo): é o teto de UMA tela de celular —
     a lista tem cartão de ~72 px e ninguém rola 2.000. */
  const TETO_DA_COLHEITA = 50;
  /* Os cinco desfechos do run no servidor que já são FIM. Escrito por extenso e
     não deduzido de `meta.terminal` porque é este mesmo vocabulário que separa
     as três cenas do desenho (terminou · cancelada · falhou). */
  const CORRIDA_ACABOU = ['completed', 'partial_error', 'completed_insufficient_results', 'failed', 'canceled'];
  const PASSO_DA_CORRIDA = 4000;   // o tique que acompanha a busca enquanto a tela está aberta

  let radarPrimeiraCarga = true;
  let radarSugestoesPedidas = false;
  let radarListaCrua = [];         // a resposta CRUA: o filtro e a tradução releem daqui
  let radarRunId = '';
  let radarRelogio = 0;
  let radarAchadosVistos = -1;     // pra só reler a colheita quando a corrida ANDOU
  let radarTropecos = 0;           // tiques seguidos sem resposta
  let radarSaldo = null;           // último saldo NUMÉRICO conhecido (a régua do custo medido)

  /* 🔴 OS DOIS COFRES DO DINHEIRO. `radarPuxando` é a reentrância: enquanto o id
     estiver aqui, nenhum segundo toque vira segunda cobrança — e como a tradução
     da lista LÊ estes dois conjuntos, qualquer repinte (o tique da corrida, o
     teclado, a volta de foco) redesenha o botão JÁ travado. Guarda que mora só
     no nó do DOM morre no primeiro repinte, e aí o dedo paga duas vezes. */
  const radarPuxando = new Set();
  const radarPuxados = new Set();  // ids que o servidor confirmou nesta sessão

  /* O pedido é do DEDO e mora no seam. Ler daqui — e não de uma variável
     paralela — é o que faz o campo, o chip de sugestão, a contagem e a corrida
     falarem do MESMO pedido; bandeira paralela ao dado é como as duas
     discordam no dia seguinte. */
  const pedidoDoRadar = () => {
    let d = {};
    try { d = DADOS.radar || {}; } catch (_) { d = {}; }
    return {
      segmento: String(d.segmento || '').trim(),
      cidade: String(d.cidade || '').trim(),
      uf: String(d.uf || '').trim().toUpperCase(),
      // o servidor aceita 1..100; fora disso ele responde 400 e o toque some sem cena
      quantidade: Math.max(1, Math.min(100, Math.trunc(Number(d.quantidade) || 20))),
    };
  };

  /* Resposta do Radar que chegou 200 mas está dizendo "eu caí". Ver o bloco 🔴
     do topo: sem esta régua, queda de servidor vira "não achei nada". */
  const radarCaiu = (r) => !r || (r.meta && r.meta.available === false);

  /* JÁ ESTÁ NA CARTEIRA — e a régua é generosa DE PROPÓSITO. Errar pro lado de
     "já é seu" esconde um botão de cobrança; errar pro outro lado cobra de novo
     por uma empresa que a pessoa já pagou. Entre um botão a menos e uma
     cobrança a mais, esta casa escolhe o botão a menos. */
  const naCarteiraDoRadar = (c) => !!(c && (
    radarPuxados.has(String(c.id || ''))
    || c.vendasLeadId
    || c.ownershipStatus === 'mine'
    || c.companyStatus === 'sent_to_vendas'
    || c.companyStatus === 'in_attendance'
  ));

  function traduzirCardDoRadar(l) {
    const c = l || {};
    const id = String(c.id || '');
    const presenca = c.channelPresence || {};
    const nome = String(c.name || '').trim();
    const nota = Number(c.rating);
    return {
      // sem id a linha não vira botão de cobrança — o desenho já testa `l.id`
      id,
      ini: esc(iniciais(nome)),
      nome: esc(nome),
      /* 🔴 O "· 3,2 km" DO DESENHO NÃO TEM FONTE. A porta devolve cidade e UF,
         nunca distância — escrever um número de quilômetro aqui seria inventar
         a informação que mais parece verdade nesta tela. Some, e a linha lê
         "Valinhos · SP", que é o que o servidor disse. */
      onde: esc(local(c.city, c.state)),
      segmento: esc(c.businessCategory || c.segment || ''),
      /* Os selos são SINAL DE VENDA e cada um só existe com o fato por trás.
         `channelPresence` é calculado ANTES da máscara de contato, então ele
         continua honesto no card que ainda não foi puxado (onde o telefone vem
         vazio de propósito) — é a única leitura que não mente aqui. */
      zap: c.hasWhatsapp ? 1 : 0,
      semSite: presenca.site === false ? 1 : 0,
      nota: isFinite(nota) && nota > 0 ? esc(`${nota.toFixed(1).replace('.', ',')} de nota`) : '',
      puxado: naCarteiraDoRadar(c) ? 1 : 0,
      puxando: radarPuxando.has(id) ? 1 : 0,
    };
  }

  /* A colheita traduzida + as duas contas do rodapé, num objeto só: quem escreve
     no seam escreve UMA vez (cada `usar` remonta a camada inteira). */
  function montarColheitaDoRadar() {
    const hoje = diaOperacional();
    const comFone = radarListaCrua.filter((c) => c && c.hasPhone).length;
    const puxadasHoje = radarListaCrua.filter((c) => c && c.claimedAt && diaEmSp(c.claimedAt) === hoje).length;
    return {
      lista: radarListaCrua.map(traduzirCardDoRadar),
      /* ZERO AQUI É NOTÍCIA e por isso vira string: "0 com telefone" numa lista
         de 12 empresas é o motivo de nenhuma delas virar conversa, e é a coisa
         mais útil que o rodapé pode dizer. Já "0 puxadas hoje" não é notícia
         nenhuma — some, como o desenho manda (`d.puxados?`). */
      comTelefone: String(comFone),
      puxados: puxadasHoje ? String(puxadasHoje) : '',
    };
  }
  const publicarColheitaDoRadar = () => usar('radar', montarColheitaDoRadar());

  /* ------------------------------------------------------------------------
     AS LEITURAS.
     ------------------------------------------------------------------------ */
  function carregarColheitaDoRadar() {
    const p = pedidoDoRadar();
    /* O pedido do dedo VIRA FILTRO da colheita: a lista se chama "Empresas
       encontradas", então ela mostra o que casa com o que foi pedido. Sem
       pedido nenhum (o boot), vem a lagoa inteira da empresa — que é a resposta
       certa pra "o que eu já tenho aqui". */
    const q = [`limit=${TETO_DA_COLHEITA}`];
    if (p.segmento) q.push(`segment=${encodeURIComponent(p.segmento)}`);
    if (p.cidade) q.push(`city=${encodeURIComponent(p.cidade)}`);
    if (p.uf) q.push(`state=${encodeURIComponent(p.uf)}`);
    return window.API.get(`/webscraping/radar/leads?${q.join('&')}`).then((r) => {
      if (radarCaiu(r)) { fonteCaiu('radar'); return; }
      radarListaCrua = Array.isArray(r.items) ? r.items : [];
      usar('radar', Object.assign({}, fonteVoltou, montarColheitaDoRadar()));
    }).catch((e) => fonteCaiu('radar', e));
  }

  /* 🔴 O SALDO É LIDO, NUNCA CONTADO NA MÃO. Descontar 1 da tela depois de puxar
     seria a tela mantendo a própria contabilidade — e ela erra no primeiro card
     que o motor marcar como não-cobrável (o `review_backup` entra de graça). */
  function carregarSaldoDoRadar() {
    return window.API.get('/credits/me').then((c) => {
      /* As DUAS faces do `/credits/me`: `balance` pra audiência de cobrança,
         `leadsDisponiveis` pro vendedor (1 crédito = 1 lead). Aqui as duas
         valem o mesmo número — o que a pessoa ainda pode puxar. */
      const n = typeof (c && c.balance) === 'number' ? c.balance
        : (typeof (c && c.leadsDisponiveis) === 'number' ? c.leadsDisponiveis : null);
      if (n == null) return null;
      radarSaldo = n;
      usar('radar', { saldo: String(n) });
      return n;
    }).catch(() => null);
  }

  function carregarSugestoesDoRadar() {
    if (radarSugestoesPedidas) return Promise.resolve();
    radarSugestoesPedidas = true;
    return window.API.get('/webscraping/radar/preference-suggestions').then((r) => {
      const lista = Array.isArray(r && r.suggestions) ? r.suggestions : [];
      /* Chip é o que a EMPRESA já vendeu (afinidade de segmento do servidor).
         Sem fonte, nenhum chip e o campo continua servindo sozinho — chip
         inventado manda a vendedora caçar um segmento que o motor não conhece.

         🔴 AQUI O `esc()` SERIA O BUG, e é a única exceção desta ponte. O texto
         do chip não é só texto: ele vira o PEDIDO (`data-segmento` → o campo →
         o corpo do POST). Escapado, a empresa procuraria por "bar &amp; cia" e
         o motor não acharia nada. Então ele viaja CRU e quem não couber num
         atributo do desenho (aspas e sinais de marcação, que não existem em
         nome de segmento de verdade) simplesmente não vira chip — o campo
         continua aceitando qualquer coisa que a pessoa digitar. */
      const cabeNoChip = (s) => s && !/["'<>&]/.test(s);
      usar('radar', { sugestoes: lista.map((s) => String((s && s.segment) || '').trim()).filter(cabeNoChip) });
    }).catch(() => { radarSugestoesPedidas = false; });
  }

  /* ------------------------------------------------------------------------
     A CORRIDA — quatro palavras pro que o servidor fala em oito status.
     ------------------------------------------------------------------------ */
  const corridaZerada = { rodando: 0, terminou: 0, cancelada: 0, falhou: 0, pct: 0, achados: '0', alvo: '0', etapa: '', mensagem: '' };

  /** Escreve a cena da corrida. Devolve `true` se ela acabou, `false` se segue
   *  viva, `null` quando não há corrida nenhuma pra mostrar. */
  function vestirCorridaDoRadar(r) {
    if (!r || !r.id) return null;
    const status = String(r.status || '');
    const acabou = CORRIDA_ACABOU.indexOf(status) >= 0;
    const meta = r.meta || {};
    const recado = String(meta.operationalMessage || r.message || r.errorMessage || '');
    radarRunId = String(r.id);
    usar('radar', {
      corrida: {
        rodando: acabou ? 0 : 1,
        terminou: (status === 'completed' || status === 'partial_error' || status === 'completed_insufficient_results') ? 1 : 0,
        cancelada: status === 'canceled' ? 1 : 0,
        falhou: status === 'failed' ? 1 : 0,
        pct: Math.max(0, Math.min(100, Math.trunc(Number(meta.progress) || 0))),
        achados: String(Math.max(0, Math.trunc(Number(r.foundCount) || Number(meta.deliveredCount) || 0))),
        alvo: String(Math.max(0, Math.trunc(Number(r.targetQuantity) || 0))),
        /* A frase do servidor É a etapa. Ela é o que separa "procurando em
           Valinhos" de "pausado, sem cota" — dois estados que caem no mesmo
           `rodando` e que a pessoa precisa distinguir pra decidir se espera. */
        etapa: acabou ? '' : esc(recado),
        mensagem: esc(recado),
      },
    });
    return acabou;
  }

  function pararRelogioDoRadar() {
    if (radarRelogio) { clearInterval(radarRelogio); radarRelogio = 0; }
  }

  /* 🔴 O RELÓGIO É DA TELA, NÃO DA CORRIDA. A busca roda no servidor com ou sem
     ninguém olhando (é isso que o banner promete); o tique só existe pra pintar
     o progresso. Deixá-lo vivo com o app noutra tela seria pagar uma requisição
     a cada 4 s pelo dia inteiro pra mostrar uma barra que ninguém está vendo —
     quem reencontra a corrida na volta é o `/latest`, que custa uma ida só. */
  function acompanharCorridaDoRadar() {
    pararRelogioDoRadar();
    if (!radarRunId) return;
    radarAchadosVistos = -1;
    radarTropecos = 0;
    radarRelogio = setInterval(() => {
      if (telaAtual() !== 'radar' || !radarRunId) { pararRelogioDoRadar(); return; }
      window.API.get(`/webscraping/radar/search-runs/${encodeURIComponent(radarRunId)}`).then((r) => {
        if (radarCaiu(r)) {
          /* Run que o servidor não acha mais: a busca acabou e foi recolhida.
             Isso não é falha — some com a cena da corrida e deixa a colheita,
             que é o que sobrou dela. */
          radarRunId = '';
          pararRelogioDoRadar();
          usar('radar', { corrida: {} });
          carregarColheitaDoRadar();
          return;
        }
        radarTropecos = 0;
        const acabou = vestirCorridaDoRadar(r);
        const achados = Math.max(0, Math.trunc(Number(r.foundCount) || 0));
        /* A colheita só é relida quando a corrida ANDOU (ou acabou). Sem esta
           régua, cada tique pagaria uma varredura da lagoa inteira pra
           redesenhar exatamente os mesmos cartões. */
        if (acabou || achados !== radarAchadosVistos) {
          radarAchadosVistos = achados;
          carregarColheitaDoRadar();
        }
        if (acabou) { radarRunId = ''; pararRelogioDoRadar(); }
      }).catch(() => {
        /* Tique que não respondeu NÃO apaga a corrida — a busca continua viva no
           servidor. Depois de três seguidos o relógio desiste (bateria) e a tela
           diz a verdade: eu perdi o contato, não que a busca morreu. Reabrir a
           tela refaz o encontro pelo `/latest`. */
        radarTropecos += 1;
        if (radarTropecos < 3) return;
        pararRelogioDoRadar();
        let cena = {};
        try { cena = (DADOS.radar && DADOS.radar.corrida) || {}; } catch (_) { cena = {}; }
        usar('radar', { corrida: Object.assign({}, cena, { etapa: 'Sem resposta do servidor agora.' }) });
      });
    }, PASSO_DA_CORRIDA);
  }

  function recuperarCorridaDoRadar() {
    /* `/latest` só devolve corrida VIVA (queued/running/sleeping/paused) e
       responde vazio quando não há nenhuma — por isso o silêncio aqui é a
       resposta certa, e não uma falha a anunciar. */
    return window.API.get('/webscraping/radar/search-runs/latest').then((r) => {
      if (radarCaiu(r)) return;
      const acabou = vestirCorridaDoRadar(r);
      if (acabou === false) acompanharCorridaDoRadar();
    }).catch(() => {});
  }

  function carregarRadar() {
    if (!temPonte()) return Promise.resolve();
    /* O Radar nasce SEM esqueleto (`carregando:false` no `apagarDemonstracao`)
       porque a cena de estreia dele é o CONVITE, não uma lista. O esqueleto
       entra só na primeira busca de verdade — e é ele que autoriza o
       `fonteCaiu` a trocar a tela pelo aviso (lei: rede caída só apaga tela na
       PRIMEIRA carga). */
    if (radarPrimeiraCarga) usar('radar', { carregando: true, semFonte: false });
    return Promise.allSettled([
      carregarColheitaDoRadar(),
      recuperarCorridaDoRadar(),
      carregarSugestoesDoRadar(),
      carregarSaldoDoRadar(),
    ]).then(() => { radarPrimeiraCarga = false; });
  }

  /* ------------------------------------------------------------------------
     O QUE O DEDO FAZ — e o que ele CUSTA.
     ------------------------------------------------------------------------ */

  /* CONTAR É GRÁTIS e tem par de bandeiras PRÓPRIO (`contando`/
     `contagemSemFonte`): a contagem no chão não pode apagar a colheita, nem o
     contrário. São duas portas na mesma tela. */
  function contarNoRadar() {
    if (!temPonte()) return;
    const p = pedidoDoRadar();
    if (!p.segmento && !p.cidade && !p.uf) {
      avisoErro(new Error('Escreva o que você procura antes de contar.'));
      return;
    }
    usar('radar', { contando: 1, contagemSemFonte: 0 });
    window.API.post('/webscraping/radar/count', { segment: p.segmento, city: p.cidade, uf: p.uf }).then((r) => {
      const disponivel = !!(r && r.available) && r.count != null;
      if (!disponivel) {
        /* "A base não está carregada neste ambiente" tem a MESMA cara de rede
           caída pra quem olha: nos dois casos não existe número. O que não pode
           é virar "0 empresas batem" — isso mandaria a pessoa desistir de uma
           cidade cheia. */
        usar('radar', { contando: 0, contagemSemFonte: 1, contagem: '' });
        return;
      }
      const n = Math.max(0, Math.trunc(Number(r.count)));
      // o servidor capa a contagem num teto e marca `approx` — o "+" é dele, não meu
      usar('radar', { contando: 0, contagemSemFonte: 0, contagem: r.approx ? `${n}+` : String(n) });
    }).catch(() => usar('radar', { contando: 0, contagemSemFonte: 1 }));
  }

  function buscarNoRadar(el) {
    if (!temPonte()) return;
    const p = pedidoDoRadar();
    /* O servidor exige cidade E segmento (`Cidade e segmento sao obrigatorios`).
       Deixar o 400 chegar funcionaria, mas gastaria uma ida à rede pra dizer o
       que já dá pra ver — e a frase daqui aponta os DOIS campos que faltam. */
    if (!p.segmento || !p.cidade) {
      avisoErro(new Error('Escreva o que você procura e a cidade — o Radar precisa dos dois.'));
      return;
    }
    if (el) { el.disabled = true; el.setAttribute('aria-busy', 'true'); }
    // A cena de "abrindo" entra no MESMO quadro do dedo: o pé vira "Buscando…" e
    // o Parar aparece antes de qualquer resposta.
    usar('radar', { corrida: Object.assign({}, corridaZerada, { rodando: 1, alvo: String(p.quantidade), etapa: 'Abrindo a busca…' }) });
    window.API.post('/webscraping/radar/search-runs', {
      segment: p.segmento, city: p.cidade, state: p.uf, quantity: p.quantidade,
    }).then((r) => {
      if (radarCaiu(r)) {
        usar('radar', { corrida: Object.assign({}, corridaZerada, { falhou: 1, alvo: String(p.quantidade), mensagem: esc((r && r.message) || 'A busca não começou.') }) });
        return;
      }
      const acabou = vestirCorridaDoRadar(r);
      if (acabou === null) { usar('radar', { corrida: {} }); return; }
      carregarColheitaDoRadar();
      if (!acabou) acompanharCorridaDoRadar();
    }).catch((erro) => {
      usar('radar', { corrida: Object.assign({}, corridaZerada, { falhou: 1, alvo: String(p.quantidade), mensagem: esc((erro && erro.message) || '') }) });
    });
  }

  function pararCorridaDoRadar(el) {
    if (!temPonte() || !radarRunId) return;
    if (el) { el.disabled = true; el.setAttribute('aria-busy', 'true'); }
    const alvo = radarRunId;
    pararRelogioDoRadar();
    window.API.post(`/webscraping/radar/search-runs/${encodeURIComponent(alvo)}/cancel`).then((r) => {
      radarRunId = '';
      if (radarCaiu(r)) { usar('radar', { corrida: Object.assign({}, corridaZerada, { cancelada: 1 }) }); }
      else vestirCorridaDoRadar(r);
      // o que chegou até o instante da parada é da pessoa e continua na tela
      carregarColheitaDoRadar();
    }).catch((erro) => {
      // O cancelamento não pegou: a busca CONTINUA. Voltar a acompanhar é o
      // honesto — dizer "parada" sem o servidor ter confirmado é a mentira que
      // faz a pessoa tocar em Buscar e nascer a segunda corrida.
      radarRunId = alvo;
      acompanharCorridaDoRadar();
      avisoErro(erro);
    });
  }

  /* ==========================================================================
     🔴 O PUXAR — O ÚNICO TOQUE DESTE APLICATIVO QUE VIRA DINHEIRO.

     A trava tem TRÊS camadas e as três entram no MESMO quadro do dedo, antes de
     qualquer ida à rede:
       1. o `Set` de reentrância (memória do módulo) — o segundo toque morre aqui
          mesmo que o nó do DOM tenha sido trocado por um repinte no meio;
       2. o nó tocado (`disabled` + `aria-busy`) — o dedo vê a reação na hora;
       3. o SEAM (`puxando:1`) — o repinte redesenha o botão JÁ travado, que é o
          que faz a trava sobreviver ao tique da corrida e à volta do teclado.

     🔴 E ELA SÓ SAI POR RESPOSTA DO SERVIDOR, NUNCA POR RELÓGIO. Um `setTimeout`
     que destravasse o botão devolveria o toque a uma cobrança que talvez tenha
     acontecido — e a segunda cobrança não tem `git revert`.
     ========================================================================== */
  function puxarLeadDoRadar(el) {
    if (!temPonte()) return;
    const id = String((el && el.dataset && el.dataset.lead) || '');
    if (!id) return;
    if (radarPuxando.has(id) || radarPuxados.has(id)) return;

    radarPuxando.add(id);
    if (el) {
      el.disabled = true;
      el.setAttribute('aria-busy', 'true');
      el.classList.add('aguarde');
    }
    publicarColheitaDoRadar();

    window.API.post(`/webscraping/radar/leads/${encodeURIComponent(id)}/send-to-vendas`, {}).then(() => {
      radarPuxados.add(id);
      radarPuxando.delete(id);
      publicarColheitaDoRadar();
      /* 🔴 O SALDO É RELIDO. O PREÇO, NÃO — E ESSA É A CORREÇÃO DE 19/08.
         Até aqui a tela escrevia o preço do botão que COBRA como a subtração de
         dois saldos lidos em momentos diferentes (`antes - agora`). Parecia
         "fato medido"; não era. O `/credits/me` devolve o saldo da EMPRESA, não
         do usuário: qualquer crédito que um colega consumisse no computador
         entre as duas leituras entrava na conta e virava "o preço do meu
         clique". Num tenant com dois vendedores trabalhando ao mesmo tempo, o
         botão passaria a anunciar 3, 7, 12 créditos por empresa — e é por esse
         número que a pessoa decide gastar.

         E não há de onde tirar o número certo hoje: o `send-to-vendas` responde
         `{ok, radarLeadId, vendasLeadId, import}` e não diz quanto debitou (o
         `reserveLeadDeliveryCredit` sabe, e guarda pra si); o `/webscraping/
         radar/count` é a CONTAGEM, que é de graça; e o catálogo de preço de
         ação é do /master, sem porta pública. Preço só se escreve quando o
         servidor o informa — a Lei nº4 desta ponte, e a régua da casa: número
         de dinheiro inventado na tela é pior que número ausente.
         O dia em que o `send-to-vendas` devolver `debited`, é UMA linha aqui. */
      return carregarSaldoDoRadar();
    }).catch((erro) => {
      radarPuxando.delete(id);
      publicarColheitaDoRadar();
      /* 🔴 SEM SALDO O SERVIDOR RESPONDE 409, e esse caso tem cena própria: uma
         caixa vermelha genérica ("Não deu certo") faria a pessoa tocar de novo
         no mesmo botão. O portão diz o número REAL que ela tem — o catálogo do
         mock traz "0 créditos / 1 por empresa / 14 na carteira" cravados no
         desenho, e número de dinheiro cravado é o que esta casa não publica. */
      if (erro && erro.status === 409) { travaDeCreditoDoRadar(erro); return; }
      avisoErro(erro);
    });
  }

  function travaDeCreditoDoRadar(erro) {
    if (typeof window.portao !== 'function') return;
    const saldo = radarSaldo == null ? '' : String(radarSaldo);
    window.portao({
      tom: 'trava', ico: 'card', titulo: 'Créditos acabaram',
      sub: String((erro && erro.message) || 'Sem crédito o Radar não manda empresa nova.')
        + ' Buscar e contar continuam de graça.',
      corpo: saldo ? `<div class="pt-nums"><div><b>${esc(saldo)}</b><small>créditos seus</small></div></div>` : '',
      acoes: [['Fechar', '']],
    });
  }

  /* ------------------------------------------------------------------------
     OS REGISTROS.
     ------------------------------------------------------------------------ */
  registrarTelas({ radar: carregarRadar });

  registrarAcoes({
    'radar-contar': () => contarNoRadar(),
    'radar-buscar': (el) => buscarNoRadar(el),
    'radar-cancelar': (el) => pararCorridaDoRadar(el),
    'puxar-lead': (el) => puxarLeadDoRadar(el),
    'radar-recarregar': () => retentar('radar', carregarRadar),

    /* Chip de sugestão é um PEDIDO INTEIRO trocado num toque — então ele zera a
       contagem (que era de outro pedido) e relê a colheita. Diferente de digitar
       letra a letra, aqui a pessoa afirmou o que quer. */
    'radar-sugestao': (el) => {
      const seg = String((el && el.dataset && el.dataset.segmento) || '');
      if (!seg) return;
      usar('radar', { segmento: seg, contagem: '', contagemSemFonte: 0 });
      carregarColheitaDoRadar();
    },
    // Quantas trazer é o tamanho da CORRIDA, não o da conta — não fala com a rede.
    'radar-quantidade': (el) => {
      const q = Math.max(1, Math.min(100, Math.trunc(Number((el && el.dataset && el.dataset.quantidade)) || 0)));
      if (q) usar('radar', { quantidade: q });
    },
  });

  /* 🔴 MUDOU O PEDIDO, MORREU A CONTAGEM. Os três campos escrevem no seam com
     respiro (sem ele é um repinte por letra numa tela com o dedo no vidro) e
     apagam o número da contagem junto: "86 empresas batem" ao lado de uma
     cidade que a pessoa acabou de trocar é a mentira mais barata desta tela — e
     é ela que decide um gasto logo em seguida. */
  const trocarPedidoDoRadar = (campo) => (valor) => {
    const novo = {};
    novo[campo] = campo === 'uf' ? String(valor || '').toUpperCase() : valor;
    novo.contagem = '';
    novo.contagemSemFonte = 0;
    usar('radar', novo);
  };

  registrarCampos({
    'radar-segmento': {
      espera: 180,
      ao: trocarPedidoDoRadar('segmento'),
      /* A tecla de confirmar do teclado do Android (`enterkeyhint="search"`) é um
         botão de verdade na cara da pessoa. Ela responde com a CONTAGEM, que é
         grátis, instantânea e não cria nada: começar uma corrida com o formulário
         pela metade nasceria em 400 ("falta a cidade") a cada Enter apressado.
         O verbo que busca continua onde o desenho o pôs — o botão do pé. */
      aoEnter: () => contarNoRadar(),
    },
    'radar-cidade': { espera: 180, ao: trocarPedidoDoRadar('cidade') },
    'radar-uf': { espera: 180, ao: trocarPedidoDoRadar('uf') },
  });
