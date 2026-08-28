  /* ==========================================================================
     O PAINEL DA BUSCA DA PARADA AVULSA — F2 do PR12082026.

     Desenho aprovado: `docs/mockups/pesquisa-avulsa-v2.html`.
     Contrato (F1, já em prod e provado): `GET /logistica/busca?q=&lat=&lng=`
     devolve os TRÊS grupos — clientes (fuzzy pg_trgm), ruas do Censo (CNEFE) e
     comércios da RFB — já ranqueados por nome × distância do GPS; e
     `GET /logistica/busca/porta?municipio=&via=&numero=` devolve o pino da
     PORTA com o CEP junto.

     A doença que isto cura: a busca de endereço era um campo CEGO. Digitava
     tudo, apertava um botão e uma regex decidia em silêncio se ia pro CNEFE (só
     com CEP) ou pro Nominatim público — 1 req/s, fraco no interior, até ~7 s
     parado na calçada. Zero sugestão, zero recentes, zero ranking.

     ── AS TRÊS LEIS DESTE ARQUIVO ────────────────────────────────────────────

     1. 🔴 TECLA NÃO PASSA PELO SEAM. `usarDados` remonta a CAMADA inteira
        (`innerHTML = render()`); uma camada nova por letra digitada é a tela
        piscando na mão de quem está em pé na porta de um cliente. Então o rolo
        de resultados é escrito DIRETO NO NÓ (`[data-rolo="busca"]`) e o seam é
        atualizado por baixo, sem repintar — a MESMA divisão que o velocímetro
        já tinha (§ `data-vivo`, 60-prospector-nav): *o DADO passa pelo seam; o
        que muda a cada quadro, NÃO*. Toque (escolher, S/N, Usar) é outra
        história: ali repintar é o certo, e passa pelo seam de sempre.

     2. 🔴 UM PEDIDO POR PAUSA, E O ATRASADO NÃO VENCE. Debounce de 250 ms e
        um NÚMERO DE SÉRIE por pedido: quem volta com número velho é jogado
        fora. Sem isso, digitar "bar do ze" enfileira 9 requisições e a última a
        CHEGAR nem sempre é a última a SAIR — a tela mostraria o resultado de
        "bar do z" por cima do de "bar do ze".

     3. 🔴 NADA DE NOMINATIM/GOOGLE NO DIGITAR. Autocomplete no Nominatim
        público viola o ToS dele e o preço é ban. O caminho do link do Maps /
        coordenada colada continua VIVO — só que fora do fluxo por tecla: vira
        um cartão que a pessoa toca (§ `busca-colar`), e ele chama o
        `rapidaBuscar` de sempre.

     E o verbo do fim é o que JÁ EXISTIA: a escolha vira `rapida.resolvido` e
     quem grava é o `rapidaConfirmar` (C0) — mesmas três travas (porta não entra
     2×, cadastro sem nome não passa, endereço com conta REUSA a conta) e o
     mesmo `encaixarAvulsa`. Endpoint novo aqui: nenhum além dos dois da F1.
     ========================================================================== */

  /** espera o dedo parar. 250 ms é o piscar de olho — abaixo disso vira pedido
   *  por letra; acima, a lista parece travada. */
  const BUSCA_ESPERA_MS = 250;
  /** menos que isto não é busca, é uma letra: o servidor devolve vazio (§
   *  BUSCA_MIN_CHARS) e a ida seria só gasto de bateria. */
  const BUSCA_MIN = 2;
  /** as 6 últimas ESCOLHAS deste aparelho (não as últimas digitações) */
  const BUSCA_RECENTES_CHAVE = 'hbx.busca.recentes';
  const BUSCA_RECENTES_TETO = 6;

  /* O número de série do pedido. Cresce sempre; resposta com número velho é
     resposta de uma pergunta que a pessoa já mudou. */
  let buscaSerie = 0;
  let buscaTimerPainel = null;
  /* Os itens CRUS do servidor, na ordem em que foram pintados. O seam leva a
     versão de TELA (texto pronto); a escolha precisa do payload inteiro —
     cep, lat/lng, codMunicipio, via, numero, fonte — porque é dele que a F4
     (cadastro herdando a lei do CEP) vai beber. */
  let buscaCrus = { cli: [], rua: [], loja: [] };
  /* O escopo geográfico que o servidor resolveu (município/cidade/UF). O passo
     do NÚMERO precisa do código do município, e ele não viaja no item. */
  let buscaEscopo = { codMunicipio: null, cidade: null, uf: null };

  /* ------------------------------------------------------------------------
     OS RECENTES — memória do APARELHO, não da empresa.
     Repetir a parada de ontem é o gesto mais comum de quem entrega, e ele
     merece um toque em vez de onze letras. Fica em `localStorage` porque é
     preferência de quem segura o telefone; mandar isso pro servidor seria
     inventar uma tabela pra guardar o que não é da empresa.
     Tudo em try/catch: WebView com DOM storage desligado não pode derrubar a
     busca — sem recentes a tela continua inteira.
     ------------------------------------------------------------------------ */
  function recentesDaBusca() {
    try {
      const cru = window.localStorage.getItem(BUSCA_RECENTES_CHAVE);
      const lista = cru ? JSON.parse(cru) : [];
      return Array.isArray(lista) ? lista.filter((x) => typeof x === 'string' && x).slice(0, BUSCA_RECENTES_TETO) : [];
    } catch (_) { return []; }
  }
  function guardarRecenteDaBusca(rotulo) {
    const novo = String(rotulo || '').trim().slice(0, 60);
    if (!novo) return;
    try {
      const lista = recentesDaBusca().filter((x) => x.toLowerCase() !== novo.toLowerCase());
      lista.unshift(novo);
      window.localStorage.setItem(BUSCA_RECENTES_CHAVE, JSON.stringify(lista.slice(0, BUSCA_RECENTES_TETO)));
    } catch (_) { /* sem storage: os recentes somem, a busca não */ }
  }

  /* ------------------------------------------------------------------------
     DO CONTRATO PRA TELA. Cada grupo vira {titulo, detalhe, dist, fonte} — e
     nada mais: o que a pessoa lê é isto. O resto do payload fica em
     `buscaCrus`, onde a escolha vai buscar.
     ------------------------------------------------------------------------ */
  /** "av 84" → "Av 84". A via vem CANÔNICA do banco (minúscula, abreviada);
   *  escrever assim na tela pareceria defeito de banco de dados. */
  const viaBonita = (v) => String(v || '').split(' ')
    .map((p) => (p ? p.charAt(0).toUpperCase() + p.slice(1) : p)).join(' ');
  const juntar = (partes) => partes.filter((x) => x != null && String(x).trim() !== '').join(' · ');

  /* 🔴 O BANCO NÃO ESCREVE NA FICHA DO CLIENTE (F4). O escopo da busca vem com a
     cidade NORMALIZADA do Censo ("rio claro" — minúscula, sem acento: é a chave
     de junção das tabelas), e ela ia inteira pro cadastro. O dono abria a ficha
     do cliente novo e lia "rio claro", que é banco de dados vazando pra cara de
     quem trabalha — a mesma doença do CEP cru que o `cepBonito` já curou. */
  const cidadeBonita = (c) => viaBonita(c);

  /* O NÚMERO DE DENTRO DO TEXTO — a MESMA âncora do servidor
     (`extrairNumeroPorta`, cnefe-resolver.util): só vale número depois de
     vírgula ou de "nº". Nunca o primeiro número solto, porque "Rua 12" tem o 12
     no NOME da via, não na porta. O endereço da Receita vem num campo só
     ("Av. 8, 415"), e sem o número dali a conta nascia S/N — e S/N desliga o
     aviso de porta repetida, que EXIGE número dos dois lados. */
  const numeroDoEnderecoDaBusca = (texto) => {
    const m = /(?:,|n[ºo°]\s*|\bn[uú]mero\s*)\s*(\d{1,6})(?!\d)/i.exec(String(texto || ''));
    return m ? m[1] : '';
  };

  /* 🔴 O NÍVEL DO GEO TEM QUE APARECER (o próprio serviço avisa: "1=porta
     2=rua 3=bairro 4=cidade — a tela TEM que diferenciar"). Comércio marcado
     no CENTRO DO BAIRRO desenhado como se fosse a porta é parada plantada no
     lugar errado — e pino errado custa mais caro que pino nenhum. */
  const avisoDoGeo = (nivel) => (Number(nivel) >= 4 ? 'ponto aproximado (cidade)'
    : Number(nivel) === 3 ? 'ponto aproximado (bairro)' : '');

  /* 🔴 ZERO NÃO É PINO — e aqui isso vira dinheiro (medido no g15, 12/08, contra
     PRODUÇÃO). Quem não tem porta marcada volta do servidor com `distM: 0`, e o
     `emMetros` obediente escrevia "0 m": quatro clientes e dois bares apareceram
     como se estivessem NA FRENTE do motorista. É a pior mentira possível numa
     tela cuja promessa escrita, uma linha acima, é "o mais perto de você vem
     primeiro" — e é a mesma lição do mapa na África, onde 0,0 virava um ponto.
     Distância que não existe não vira número: o cartão simplesmente não a mostra
     (a fonte e o endereço continuam lá, que é o que se sabe de verdade).
     ⚠️ O RANKING em si é do SERVIDOR e continua pondo esses zeros na frente —
     isso é conserto de F1, anotado no relatório com a foto. */
  const distDaBusca = (m) => (Number(m) >= 1 ? emMetros(Number(m)) : '');

  /* CEP se lê com máscara. O banco guarda 8 dígitos (e é assim que ele viaja no
     cadastro, § digitos()); só o que a PESSOA lê ganha o traço — "13502150" na
     tela é banco de dados vazando pra cara de quem trabalha. */
  const cepBonito = (c) => {
    const d = String(c == null ? '' : c).replace(/[^0-9]/g, '');
    return d.length === 8 ? d.slice(0, 5) + '-' + d.slice(5) : String(c || '');
  };

  function paraTelaDaBusca(resp) {
    const g = (resp && resp.grupos) || {};
    const cli = Array.isArray(g.clientes) ? g.clientes : [];
    const rua = Array.isArray(g.enderecos) ? g.enderecos : [];
    const loja = Array.isArray(g.comercios) ? g.comercios : [];
    return {
      clientes: cli.map((c) => ({
        titulo: esc(c.nome),
        detalhe: esc(juntar([linhaDeEndereco(c.endereco, c.numero), c.bairro || c.cidade])),
        dist: esc(distDaBusca(c.distM)),
        fonte: 'cliente',
      })),
      enderecos: rua.map((v) => ({
        titulo: esc(viaBonita(v.via)),
        detalhe: esc(juntar([v.portas ? `${v.portas} portas no Censo` : '', buscaEscopo.cidade || ''])),
        dist: esc(distDaBusca(v.distM)),
        fonte: 'censo',
        cep: esc(cepBonito(v.cep)),
      })),
      comercios: loja.map((e) => ({
        titulo: esc(e.nome),
        detalhe: esc(juntar([e.endereco, e.cidade, avisoDoGeo(e.nivelGeo)])),
        dist: esc(distDaBusca(e.distM)),
        fonte: 'rfb',
      })),
    };
  }

  /* ------------------------------------------------------------------------
     A ESCRITA CIRÚRGICA. É aqui que a lei nº 1 deste arquivo acontece: o seam
     é atualizado POR BAIXO (pra que o próximo repinte de verdade — um toque —
     pinte a mesma coisa) e o HTML vai direto pro nó do rolo.

     O desenho é o do MOCK (`roloDaBuscaAvulsa`), nunca uma segunda cópia aqui:
     duas cópias do mesmo desenho divergem na primeira mexida, e aí o app deixa
     de ser o mock.
     ------------------------------------------------------------------------ */
  function escreverRoloDaBusca(campos) {
    if (typeof DADOS === 'undefined' || !DADOS.rapida) return;
    Object.assign(DADOS.rapida, campos);
    const no = naCamada('[data-rolo="busca"]');
    if (!no || typeof roloDaBuscaAvulsa !== 'function') return;
    no.innerHTML = roloDaBuscaAvulsa(DADOS.rapida);
  }

  /** o × do campo e o `data-campo` só existem/valem com a tela montada */
  const noPainelDaBusca = () => !!rapida && rapida.porta === 'endereco' && telaAtual() === 'rapida';

  /* 🔴 O QUE O DEDO ESCREVEU VOLTA EM TODO REPINTE DE TOQUE. `usarDados`
     remonta a camada a partir do seam: se o `busca` não for devolvido, o campo
     se apaga sozinho no instante em que a pessoa toca num resultado (a mesma
     lição do `novoRascunho`). O nó VIVO manda — ele tem as letras que o
     debounce ainda nem levou pro servidor. */
  const textoDaBusca = () => {
    const no = naCamada('[data-campo="rapida-busca"]');
    if (no) return String(no.value || '');
    return String((rapida && rapida.buscaTexto)
      || (typeof DADOS !== 'undefined' && DADOS.rapida && DADOS.rapida.busca) || '');
  };

  const AVISO_VOZ_PERMISSAO = 'Permita o microfone para buscar por voz.';
  const vozNativaDisponivel = () => {
    try {
      return !!(window.HBX && window.HBX.speech && window.HBX.speech.available());
    } catch (_) { return false; }
  };

  /* Voz é estado da busca, não do nó: o reconhecedor pode responder durante um
     repinte. Guardar no seam faz mic e véu voltarem com a mesma verdade. */
  function publicarVozDaBusca(campos) {
    const r = rapida;
    if (!r) return;
    Object.assign(r, campos || {});
    if (!noPainelDaBusca() || typeof window.usarDados !== 'function') return;
    const seam = {};
    if (Object.prototype.hasOwnProperty.call(campos, 'vozDisponivel')) seam.vozDisponivel = campos.vozDisponivel ? 1 : 0;
    if (Object.prototype.hasOwnProperty.call(campos, 'vozOuvindo')) seam.vozOuvindo = campos.vozOuvindo ? 1 : 0;
    if (Object.prototype.hasOwnProperty.call(campos, 'aviso')) seam.aviso = esc(campos.aviso || '');
    window.usarDados('rapida', seam);
  }

  /* ------------------------------------------------------------------------
     O PEDIDO. Best-effort com VOZ: falhou a rede, o rolo diz que não achou —
     nunca fica girando pra sempre, e nunca inventa lista.
     ------------------------------------------------------------------------ */
  async function procurarNaBusca(texto) {
    const q = String(texto || '').trim();
    const r = rapida;
    if (!r || !temPonte() || !window.API) return;
    /* LINK/COORDENADA COLADA NÃO SE PROCURA EM BANCO — vira cartão (lei nº 3).
       O mesmo texto pode ser as duas coisas ("13500-000 1067" é CEP e é busca),
       então o cartão SOMA, não substitui. */
    const colado = (/https?:\/\//i.test(q) || PAR_COORD.test(q)) ? q.slice(0, 60) : '';
    if (q.length < BUSCA_MIN) {
      buscaCrus = { cli: [], rua: [], loja: [] };
      escreverRoloDaBusca({
        busca: esc(q), grupos: { clientes: [], enderecos: [], comercios: [] },
        semNada: 0, colar: esc(colado), numAberto: -1, recentes: recentesDaBusca().map(esc),
      });
      return;
    }
    const serie = ++buscaSerie;
    // o rolo já diz "Procurando…" (é o vazio honesto de quem ainda não sabe)
    escreverRoloDaBusca({ busca: esc(q), semNada: 0, colar: esc(colado) });
    const perto = ultimaPos && pinoValido(ultimaPos.lat, ultimaPos.lng)
      ? `&lat=${encodeURIComponent(ultimaPos.lat)}&lng=${encodeURIComponent(ultimaPos.lng)}` : '';
    let resp = null;
    try {
      resp = await window.API.get(`/logistica/busca?q=${encodeURIComponent(q)}${perto}`);
    } catch (e) {
      // 🔴 "NÃO CONSEGUI PERGUNTAR" ≠ "NÃO EXISTE". Falha de rede não pode
      // apagar o que já está na tela: só marca que esta pergunta não voltou.
      if (serie !== buscaSerie || !noPainelDaBusca() || rapida !== r) return;
      escreverRoloDaBusca({ semNada: 1 });
      return;
    }
    /* 🔴 A RESPOSTA ATRASADA NÃO SOBRESCREVE A NOVA. Este é o teste do
       painel inteiro: sem esta linha, o resultado de "bar do z" (que saiu
       antes e voltou depois) sentaria por cima do de "bar do ze". */
    if (serie !== buscaSerie || rapida !== r || !noPainelDaBusca()) return;
    const esc0 = (resp && resp.escopo) || {};
    buscaEscopo = {
      codMunicipio: esc0.codMunicipio || null,
      cidade: esc0.cidade || null,
      uf: esc0.uf || null,
    };
    const g = (resp && resp.grupos) || {};
    buscaCrus = {
      cli: Array.isArray(g.clientes) ? g.clientes : [],
      rua: Array.isArray(g.enderecos) ? g.enderecos : [],
      loja: Array.isArray(g.comercios) ? g.comercios : [],
    };
    const grupos = paraTelaDaBusca(resp);
    const nada = !grupos.clientes.length && !grupos.enderecos.length && !grupos.comercios.length;
    escreverRoloDaBusca({
      busca: esc(q), grupos, semNada: nada ? 1 : 0, colar: esc(colado), numAberto: -1,
    });
  }

  /* O teclado e a voz entram pelo MESMO cano. Espelhar só é necessário para a
     voz: no teclado o próprio WebView já escreveu no campo vivo. */
  function usarTextoDaBusca(texto, espelharNoCampo) {
    if (!temPonte() || !rapida) return;
    const valor = String(texto == null ? '' : texto);
    rapida.buscaTexto = valor;
    if (typeof DADOS !== 'undefined' && DADOS.rapida) DADOS.rapida.busca = esc(valor);
    if (espelharNoCampo) {
      const no = naCamada('[data-campo="rapida-busca"]');
      if (no) no.value = valor;
    }
    clearTimeout(buscaTimerPainel);
    buscaTimerPainel = setTimeout(() => { void procurarNaBusca(valor); }, BUSCA_ESPERA_MS);
  }

  /* ------------------------------------------------------------------------
     O TECLADO. Ouvinte DELEGADO no documento (e não por nó): o campo nasce de
     novo a cada repinte da camada, e listener por nó precisaria de guarda e de
     um gancho no repinte. `input` sobe, então um ouvinte só cobre todos os
     nascimentos do campo, hoje e depois.
     ------------------------------------------------------------------------ */
  document.addEventListener('input', (ev) => {
    const alvo = ev.target;
    if (!alvo || !alvo.dataset || alvo.dataset.campo !== 'rapida-busca') return;
    usarTextoDaBusca(alvo.value || '', false);
  });

  window.HBXApp = window.HBXApp || {};
  window.HBXApp.speechPermissionChanged = function (concedida) {
    const r = rapida;
    if (!r) return;
    const limparAviso = concedida && String(r.aviso || '') === AVISO_VOZ_PERMISSAO;
    publicarVozDaBusca({
      vozDisponivel: vozNativaDisponivel() ? 1 : 0,
      vozOuvindo: 0,
      ...(concedida ? (limparAviso ? { aviso: '' } : {}) : { aviso: AVISO_VOZ_PERMISSAO }),
    });
  };
  window.HBXApp.speechRecognitionListening = function () {
    publicarVozDaBusca({ vozOuvindo: 1 });
  };
  window.HBXApp.speechRecognitionResult = function (texto) {
    publicarVozDaBusca({ vozOuvindo: 0 });
    const reconhecido = String(texto || '').trim();
    if (reconhecido && noPainelDaBusca()) usarTextoDaBusca(reconhecido, true);
  };
  window.HBXApp.speechRecognitionError = function (mensagem) {
    publicarVozDaBusca({
      vozOuvindo: 0,
      aviso: String(mensagem || 'Não consegui entender. Tente falar de novo.'),
    });
  };

  /* ------------------------------------------------------------------------
     A ESCOLHA. Ela ARMA a parada (não grava nada): preenche o rascunho que o
     `rapidaConfirmar` já sabe gravar, e acende o pé com o resumo REAL —
     incluindo o CEP com que a parada vai nascer.
     ------------------------------------------------------------------------ */
  /** o pé, com o que a pessoa acabou de escolher */
  function armarPeDaBusca(tipo, i, titulo, dist, cep) {
    if (typeof window.usarDados !== 'function') return;
    window.usarDados('rapida', {
      pe: { tipo, i, titulo: esc(titulo), dist: esc(dist || ''), cep: esc(cepBonito(cep)) },
      numAberto: -1,
      /* 🔴 O AVISO SOBREVIVE AO PÉ. Aqui era `aviso: ''` fixo, e quem acabara de
         escrever um aviso (o ponto é do vizinho, o Censo não deu CEP) via a
         própria frase ser apagada do seam no repinte seguinte. O que a tela SABE
         não pode ser apagado pelo que a tela MOSTRA. */
      aviso: esc((rapida && rapida.aviso) || ''),
      busca: esc(textoDaBusca()),
    });
  }

  function escolherDaBusca(tipo, indice) {
    const r = rapida;
    const i = Number(indice);
    if (!r || r.salvando) return;
    const cru = (buscaCrus[tipo] || [])[i];
    if (!cru) return;
    r.aviso = '';
    r.posicao = 'perto';          // "encaixa na melhor posição sozinho" é o pé
    r.opcoes = [];

    if (tipo === 'cli') {
      /* CLIENTE JÁ TEM CONTA — e por isso ele NÃO passa por `POST /nucleo/contas`.
         Enchendo `duplicado` com a conta dele, o `rapidaConfirmar` reusa a linha
         que existe (e cobra o freio "a mesma porta não entra 2× na rota de hoje"
         de graça). Abrir cadastro novo pra quem já está na base é o defeito que
         enche a base de gente repetida. */
      r.duplicado = { id: String(cru.id), nome: cru.nome, isCliente: true, isLead: false, isFornecedor: false };
      r.origem = 'busca';
      r.nome = String(cru.nome || '');
      r.cep = String(cru.cep || '');
      r.numero = String(cru.numero || '');
      r.resolvido = {
        fonte: 'cliente', endereco: cru.endereco || '', numero: cru.numero || '',
        bairro: cru.bairro || '', cidade: cru.cidade || '', uf: cru.uf || '',
        cep: cru.cep || '', lat: cru.lat, lng: cru.lng,
      };
      r.escolhaBusca = { tipo: 'cliente', fonte: 'cliente', contaId: String(cru.id), cep: cru.cep || '', lat: cru.lat, lng: cru.lng };
      guardarRecenteDaBusca(cru.nome);
      armarPeDaBusca(tipo, i, cru.nome, distDaBusca(cru.distM), cru.cep || '');
      return;
    }

    if (tipo === 'rua') {
      /* RUA NÃO É PARADA. "Rua 8" sozinha são 214 portas do Censo: aqui abre o
         DEGRAU DO NÚMERO, e só depois dele existe pino, CEP e parada. Um degrau
         por vez — é o contrário do formulário de seis campos que ninguém
         termina em pé, com o carro ligado. */
      if (typeof window.usarDados === 'function') {
        window.usarDados('rapida', { numAberto: i, numValor: '', numSn: 0, pe: null, aviso: '', busca: esc(textoDaBusca()) });
      }
      return;
    }

    /* ------------------------------------------------------------------------
       COMÉRCIO (RFB × CnpjGeo).

       🔴 O PINO FRACO NÃO SE VESTE DE PORTA (F4). O `CnpjGeo` diz em que NÍVEL
       ele marcou aquele CNPJ: 1=porta, 2=rua, 3=bairro, 4=cidade. O cartão já
       avisava disso na lista — mas na hora de virar parada o ponto viajava
       IGUAL, e um comércio marcado no centro do bairro virava a coordenada pra
       onde o entregador dirige. Numa cidade de interior isso é quilômetro de
       erro, e a lei da casa é uma só: pino errado é PIOR que pino vazio.
       Do nível 3 pra baixo o pino fica em casa e quem resolve o lugar é o CEP,
       no servidor (CNEFE) — que acerta a RUA, e é mais do que o bairro sabe.

       🔴 E O NÚMERO DA RECEITA VEM JUNTO. O endereço da RFB é um campo só
       ("Av. 8, 415"); mandar `numero: ''` fazia a conta nascer S/N — e S/N
       DESLIGA o aviso de porta repetida, que exige número dos dois lados.
       ------------------------------------------------------------------------ */
    const pinoDePorta = Number(cru.nivelGeo) > 0 && Number(cru.nivelGeo) <= 2;
    const numeroDaLoja = numeroDoEnderecoDaBusca(cru.endereco);
    r.duplicado = null;
    r.origem = 'busca';
    r.nome = String(cru.nome || '');
    r.cep = String(cru.cep || '');
    r.numero = numeroDaLoja;
    r.resolvido = {
      fonte: 'rfb', endereco: cru.endereco || '', numero: numeroDaLoja,
      bairro: '', cidade: cru.cidade || '', uf: cru.uf || '',
      cep: cru.cep || '',
      lat: pinoDePorta ? cru.lat : null, lng: pinoDePorta ? cru.lng : null,
    };
    /* Pino de BASE não é fix de GPS. Sem dizer nada, o servidor decide pela
       `gpsAccuracy` que não veio e grava `gps_impreciso` — "houve um GPS, e ele
       era ruim". Não houve GPS nenhum: houve uma base. O nome honesto disso na
       escada da procedência é `geocode` ("nunca foi provado no chão"), e é o
       que as telas leem pra saber se ainda precisam pedir a porta ao motorista. */
    r.geoFonteEscolhida = pinoDePorta ? 'geocode' : null;
    r.escolhaBusca = {
      tipo: 'comercio', fonte: 'rfb', cnpj: String(cru.cnpj || ''), cep: cru.cep || '',
      numero: numeroDaLoja, lat: cru.lat, lng: cru.lng, nivelGeo: cru.nivelGeo,
    };
    r.aviso = pinoDePorta ? ''
      : `A Receita só tem ${avisoDoGeo(cru.nivelGeo) || 'ponto aproximado'} deste comércio: quem manda no lugar é o CEP.`;
    if (!digitos(cru.cep)) r.aviso = 'Sem o CEP deste comércio na Receita — confira o endereço antes de adicionar.';
    guardarRecenteDaBusca(cru.nome);
    armarPeDaBusca(tipo, i, cru.nome, distDaBusca(cru.distM), cru.cep || '');
    // quem já mora nesta porta? (best-effort — só avisa, nunca trava)
    void rapidaCheckarPorta();
  }

  /* ------------------------------------------------------------------------
     O DEGRAU DO NÚMERO — `GET /logistica/busca/porta`.

     🔴 SEM NÚMERO NÃO É ERRO. Metade do interior é S/N (posto, chácara, praça,
     estrada): o botão "S/N" trava o campo e a resposta vira o pino do TRECHO,
     com a `precisao` dizendo o que ela é. Exigir número travava o motorista
     parado num lugar que número não tem.
     ------------------------------------------------------------------------ */
  async function usarRuaDaBusca() {
    const r = rapida;
    const d = (typeof DADOS !== 'undefined' && DADOS.rapida) || {};
    const i = Number(d.numAberto);
    const cru = (buscaCrus.rua || [])[i];
    if (!r || !cru || r.salvando) return;
    if (!buscaEscopo.codMunicipio) {
      r.aviso = 'Não sei em que município procurar esta rua. Ligue o GPS e tente de novo.';
      return publicarRapida();
    }
    const sn = !!d.numSn;
    const numero = sn ? '' : digitos(campo('busca-numero'));
    const p = [
      `municipio=${encodeURIComponent(buscaEscopo.codMunicipio)}`,
      `via=${encodeURIComponent(cru.via)}`,
    ];
    if (numero) p.push(`numero=${encodeURIComponent(numero)}`);
    let porta = null;
    try { porta = await window.API.get(`/logistica/busca/porta?${p.join('&')}`); }
    catch (e) { r.aviso = humano(e); return publicarRapida(); }
    if (rapida !== r) return;
    if (!porta || porta.fonte !== 'cnefe' || !pinoValido(porta.lat, porta.lng)) {
      r.aviso = numero
        ? `Não achei o nº ${numero} nesta rua no Censo. Confira, ou marque S/N.`
        : 'Não achei o ponto desta rua no Censo.';
      return publicarRapida();
    }
    /* 🔴 O NÚMERO É O QUE O DEDO ESCREVEU — NUNCA O DO VIZINHO (F4).
       Com `precisao: 'rua'` o Censo responde com o número da porta VIZINHA (até
       200 números de distância): era ele que ia parar no cadastro. A pessoa
       digitava 1177, a conta nascia no 1175 e o entregador batia na casa
       errada — com a tela dizendo, uma linha abaixo, que o ponto era "o do
       vizinho mais perto". O vizinho é PINO de referência, não é endereço.
       Só a porta EXATA pode ditar o número (e aí ele é o mesmo que foi digitado
       — o Censo confirmando, não corrigindo). */
    const numeroDaPorta = porta.precisao === 'porta' && porta.numero
      ? String(porta.numero)
      : String(numero || '');
    const titulo = [viaBonita(porta.via || cru.via), numeroDaPorta || (sn ? 'S/N' : '')]
      .filter(Boolean).join(', ');
    r.duplicado = null;
    r.nome = titulo;
    r.numero = numeroDaPorta;
    r.cep = String(porta.cep || '');
    r.resolvido = {
      fonte: 'cnefe', endereco: viaBonita(porta.via || cru.via), numero: r.numero,
      bairro: '', cidade: cidadeBonita(buscaEscopo.cidade || ''), uf: buscaEscopo.uf || '',
      cep: r.cep, lat: porta.lat, lng: porta.lng,
    };
    /* 🔴 COM CEP NA MÃO, QUEM RESOLVE O PINO É O SERVIDOR (a lei do CEP).
       `origem:'cep'` faz o `rapidaConfirmar` mandar cep+número e NÃO mandar
       lat/lng: aí a conta nasce pelo CNEFE, com a `geoFonte` certa gravada na
       fonte. Mandar o pino junto carimbaria a conta como ponto marcado à mão —
       mentira sobre a procedência de um pino que é do Censo.
       Sem CEP na resposta o pino é a única coisa que temos: ele viaja. */
    r.origem = r.cep ? 'cep' : 'busca';
    /* Sem CEP o pino do Censo é tudo o que temos, então ele viaja — mas viaja
       com o nome certo. `geocode` é a procedência de quem saiu de uma BASE e
       nunca foi provado no chão; calar aqui faria o servidor gravar
       `gps_impreciso`, que conta a história de um GPS que não existiu. */
    r.geoFonteEscolhida = r.cep ? null : 'geocode';
    r.escolhaBusca = {
      tipo: 'endereco', fonte: 'cnefe', precisao: porta.precisao || null,
      codMunicipio: buscaEscopo.codMunicipio, via: porta.via || cru.via,
      numero: r.numero, cep: r.cep, lat: porta.lat, lng: porta.lng,
    };
    r.aviso = porta.precisao === 'porta' ? ''
      : porta.precisao === 'rua' ? 'O Censo não tem este número exato: o ponto (e o CEP) são os do vizinho mais perto.'
        : 'Sem número: o ponto é o da rua. Confira antes de adicionar.';
    /* 🔴 A TELA PEDE, NÃO CHUTA. Sem CEP o cadastro de CLIENTE não fecha (é a
       lei do dono, cobrada no servidor) — e até aqui a pessoa só descobria isso
       depois de tocar em "Adicionar à rota" e levar um erro cru na cara. */
    if (!r.cep) {
      r.aviso = 'O Censo não deu o CEP desta porta. Sem CEP não dá pra cadastrar cliente — confira o endereço.';
    }
    guardarRecenteDaBusca(titulo);
    armarPeDaBusca('rua', i, titulo, distDaBusca(cru.distM), r.cep);
    // quem já mora nesta porta? (best-effort — só avisa, nunca trava)
    await rapidaCheckarPorta();
  }

  /* ------------------------------------------------------------------------
     O TEXTO COLADO — o caminho ANTIGO, vivo, fora do fluxo por tecla.
     ------------------------------------------------------------------------ */
  async function colarNaBusca() {
    const r = rapida;
    if (!r || r.salvando) return;
    await rapidaBuscar();               // o mesmo /geo/link + /geo/cep de sempre
    const alvo = rapida;
    if (alvo !== r || !r.resolvido) return;
    const titulo = r.nome || [r.resolvido.endereco, r.resolvido.numero].filter(Boolean).join(', ') || 'Localização colada';
    guardarRecenteDaBusca(titulo);
    armarPeDaBusca('colado', -1, titulo, '', digitos(r.cep || r.resolvido.cep || ''));
  }

  /* ------------------------------------------------------------------------
     OS TOQUES PEQUENOS: limpar, S/N, recente.
     ------------------------------------------------------------------------ */
  /* 🔴 O PAINEL NASCE VAZIO E COM OS RECENTES DESTE APARELHO. Sem esta porta o
     painel abriria com o que o MOCK deixou no seam — três recentes de mentira
     ("Bar do Zé", "Rua 8", "Márcia") na tela de um motorista que nunca buscou
     nada. Dado de demonstração na mão de quem trabalha é a mesma doença do
     "João da Silva" que o boot apaga desde 07/08. */
  function zerarPainelDaBusca() {
    const r = rapida;
    if (r) {
      r.resolvido = null; r.duplicado = null; r.aviso = ''; r.buscaTexto = '';
      r.escolhaBusca = null; r.geoFonteEscolhida = null;
    }
    buscaCrus = { cli: [], rua: [], loja: [] };
    buscaEscopo = { codMunicipio: null, cidade: null, uf: null };
    buscaSerie += 1;                    // pedido em voo perde a vez
    clearTimeout(buscaTimerPainel);
    if (typeof window.usarDados !== 'function') return;
    window.usarDados('rapida', {
      busca: '', grupos: { clientes: [], enderecos: [], comercios: [] },
      semNada: 0, colar: '', numAberto: -1, numValor: '', numSn: 0, pe: null,
      aviso: '', recentes: recentesDaBusca().map(esc),
      vozDisponivel: vozNativaDisponivel() ? 1 : 0, vozOuvindo: 0,
    });
  }
  const abrirPainelDaBusca = zerarPainelDaBusca;
  const limparBusca = zerarPainelDaBusca;

  function virarSnDaBusca() {
    const d = (typeof DADOS !== 'undefined' && DADOS.rapida) || {};
    if (typeof window.usarDados !== 'function') return;
    // o que já estava digitado sobrevive ao S/N: desmarcar devolve o número
    const escrito = d.numSn ? String(d.numValor || '') : digitos(campo('busca-numero'));
    window.usarDados('rapida', { numSn: d.numSn ? 0 : 1, numValor: esc(escrito), busca: esc(textoDaBusca()) });
  }

  function usarRecenteDaBusca(rotulo) {
    const r = rapida;
    const texto = String(rotulo || '').trim();
    if (!r || !texto) return;
    r.buscaTexto = texto;
    // repinta com o texto no campo (toque, não tecla: aqui o seam é o caminho)
    if (typeof window.usarDados === 'function') window.usarDados('rapida', { busca: esc(texto), numAberto: -1, pe: null });
    clearTimeout(buscaTimerPainel);
    void procurarNaBusca(texto);
  }

  /* ------------------------------------------------------------------------
     OS TOQUES DO PAINEL — ouvinte PRÓPRIO, e isso é uma decisão, não descuido.

     O lugar canônico de `data-acao` é o mapa do `D0-porta-entrega.js`. Este
     painel fica FORA dele por um motivo de operação: em 12/08 há outra sessão
     escrevendo no D0 (o anexo do recado), e código meu misturado ao lote dela
     no mesmo arquivo é código que ninguém consegue entregar separado — ou eu
     comito o trabalho inacabado dela, ou o meu fica pendurado.

     Tecnicamente não há diferença de comportamento: o D0 já registra DOIS
     ouvintes de clique no documento, este é o terceiro, roda ANTES dele (ordem
     léxica da costura) e as chaves não se cruzam — quem não é minha segue o
     caminho de sempre.

     🔴 Quando o lote do anexo pousar, estas seis linhas voltam pro mapa do D0.
     Está anotado no relatório como pendência, e não como "assim está bom".
     ------------------------------------------------------------------------ */
  document.addEventListener('click', (ev) => {
    const alvo = ev.target && ev.target.closest ? ev.target.closest('[data-acao]') : null;
    if (!alvo || !temPonte()) return;
    const chave = alvo.dataset.acao;
    if (chave === 'busca-limpar') return limparBusca();
    if (chave === 'busca-voz') {
      if (window.HBX && window.HBX.speech && window.HBX.speech.start) window.HBX.speech.start();
      return;
    }
    if (chave === 'busca-sn') return virarSnDaBusca();
    if (chave === 'busca-usar-rua') return void comTrava(usarRuaDaBusca);
    if (chave === 'busca-colar') return void comTrava(colarNaBusca);
    if (chave === 'busca-escolher') return escolherDaBusca(alvo.dataset.tipo, alvo.dataset.i);
    if (chave === 'busca-recente') return usarRecenteDaBusca(alvo.dataset.rec);
    /* 🔴 TROCAR PRA PORTA "PROCURAR" É A ÚNICA ENTRADA DO PAINEL — e é por isso
       que ele se zera aqui. O seam do `rapida` nasce com o dado de
       DEMONSTRAÇÃO do mock (três recentes de mentira): sem isto o motorista
       abriria a busca vendo "Bar do Zé, Rua 8, Márcia" de gente que ele nunca
       procurou. Vai pro fim da fila (`setTimeout 0`) de propósito: quem troca
       o `rapida.porta` é o D0, que roda DEPOIS deste ouvinte. */
    if (chave === 'rapida-porta' && alvo.dataset.porta === 'endereco') {
      setTimeout(() => { if (rapida && rapida.porta === 'endereco') abrirPainelDaBusca(); }, 0);
    }
  });

  /* O Android já recebe geo:, VIEW do Google Maps e SEND text/plain. A fusão
     preservou essa porta nativa, mas perdeu o ouvinte que trazia o destino para
     a tela. Ele cai no fluxo existente de Direção: nada de tela ou gravação
     paralela, e iniciar a rota continua sendo um gesto separado. */
  async function receberDestinoExterno(bruto) {
    let destino = null;
    try { destino = typeof bruto === 'string' ? JSON.parse(bruto) : bruto; }
    catch (_) { destino = null; }
    if (!destino) return;

    const veioDe = telaAtual();
    if (veioDe === 'rapida') rapidaEmBranco('rota');
    else window.ir('rapida');
    const r = rapida;
    if (!r) return;
    r.porta = 'endereco';
    abrirPainelDaBusca();
    /* O reconciliador preserva o `.value` vivo de inputs para não apagar o que
       o dedo está digitando. Aqui a origem não é o dedo: um destino novo não
       pode herdar "bar do ze" (nem um cliente) da abertura anterior. */
    const buscaViva = naCamada('[data-campo="rapida-busca"]');
    if (buscaViva) buscaViva.value = '';
    const clienteVivo = naCamada('[data-campo="rapida-cliente-busca"]');
    if (clienteVivo) clienteVivo.value = '';
    r.buscando = true; r.aviso = '';
    publicarRapida();

    let lat = Number(destino.lat);
    let lng = Number(destino.lng);
    let rotulo = String(destino.rotulo || '').trim().slice(0, 120);
    const link = String(destino.link || '').trim();
    try {
      if (!pinoValido(lat, lng) && link) {
        const lido = await window.API.get(`/logistica/geo/link?u=${encodeURIComponent(link)}`);
        lat = Number(lido && lido.lat); lng = Number(lido && lido.lng);
        if (!rotulo) rotulo = String((lido && lido.rotulo) || '').trim().slice(0, 120);
      }
      if (!pinoValido(lat, lng)) throw new Error('destino_invalido');
      await rapidaFixarPonto(lat, lng, rotulo, 'ponto');
      if (rapida !== r || !r.resolvido) return;
      r.buscando = false;
      publicarRapida();
      await rapidaCheckarPorta();
      if (rapida !== r || !r.resolvido) return;
      const titulo = tituloDaPorta(r.resolvido, r.numero);
      guardarRecenteDaBusca(titulo);
      armarPeDaBusca('colado', -1, titulo, '', digitos(r.cep || r.resolvido.cep || ''));
    } catch (_) {
      if (rapida !== r) return;
      r.buscando = false;
      r.aviso = 'Não consegui ler essa localização. Tente o endereço escrito.';
      publicarRapida();
    }
  }
  const CHAVE_DESTINO_PENDENTE = '__hbxDestinoPendente';
  async function consumirDestinoExterno(bruto) {
    window[CHAVE_DESTINO_PENDENTE] = null;
    /* Na abertura fria, `carregarRota()` ainda vai pintar a fotografia do dia.
       Se o destino entrar antes, essa pintura restaura a tela anterior por
       cima dele. `bootFalta:dado` é o marco já usado pela própria abertura;
       o teto mantém o link útil também quando a primeira leitura emperra. */
    const limite = Date.now() + ABERTURA_TETO_PONTE + 500;
    while (bootFalta.has('dado') && Date.now() < limite) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await receberDestinoExterno(bruto);
  }
  document.addEventListener('hbx:destino', (ev) => { void consumirDestinoExterno(ev.detail); });
  /* A abertura fria pode revelar a WebView entre mock.js e ponte.js. Nesse
     intervalo o Android já disparou o evento; o recibo acima impede que um
     link correto vire apenas a tela normal de Rota. */
  if (window[CHAVE_DESTINO_PENDENTE]) void consumirDestinoExterno(window[CHAVE_DESTINO_PENDENTE]);
