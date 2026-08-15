  /* ------------------------------------------------------------------------
     🔴 O ENCAIXE (dono, 28/07): "se tiver perto, ele entra na logística — entre
     1 e 10, se está mais perto do 5, vira o 6 e ficam 11".

     Custo de inserção clássico: em cada perna (anterior → próxima) mede quanto
     CUSTA passar pelo ponto novo no meio — d(ant,novo) + d(novo,prox) −
     d(ant,prox) — e ganha a perna mais barata. Pelas RUAS quando o OSRM
     responde (a mesma matriz do planejador), linha reta quando não: sem rede a
     parada entra num lugar razoável em vez de não entrar.

     Parada ÚNICA também planeja. Sair antes do `/rota/planejar` por "não tem
     perna pra medir" deixava a parada sem `rotaOrdem` — e sem ordem o estado do
     dia volta pra "montar", então o botão travava em "Montar rota" e o Iniciar
     só aparecia depois do 2º endereço.
     ------------------------------------------------------------------------ */
  async function matrizViaria(pontos) {
    if (!Array.isArray(pontos) || pontos.length < 2) return null;
    const coords = pontos.map((p) => `${Number(p.lng)},${Number(p.lat)}`).join(';');
    try {
      const payload = await window.API.get(`/logistica/osrm/table?coords=${encodeURIComponent(coords)}`);
      const m = payload && payload.durations;
      if (payload.code !== 'Ok' || !Array.isArray(m) || m.length !== pontos.length) return null;
      return m;
    } catch (_) { return null; }
  }

  async function encaixarAvulsa(novoId, posicao) {
    const abertas = paradasAbertas();
    const novo = abertas.find((p) => p.id === String(novoId));
    if (!novo) return { aplicado: false, anterior: null };
    const base = abertas.filter((p) => p.id !== String(novoId));
    const ids = base.map((p) => p.id);
    const pontoDe = (p) => {
      const c = (p && p.item && p.item.cliente) || {};
      return pinoValido(c.lat, c.lng) ? { lat: Number(c.lat), lng: Number(c.lng) } : null;
    };
    const pNovo = pontoDe(novo);
    let indice = ids.length;
    /* 🔴 O RECIBO TEM QUE DIZER O QUE FOI MEDIDO (12/08). O portão do fim
       prometia "encaixa na melhor posição sozinho" e devolvia só o nome de
       quem ficou antes — a POSIÇÃO e o CUSTO ficavam aqui dentro, calculados e
       jogados fora. Recibo que não mostra a conta é recibo decorativo: quem
       está na calçada não tem como saber se o encaixe fez sentido.
       A unidade é honesta: com o OSRM de pé a matriz é de DURAÇÃO (segundos);
       sem rede a conta cai pra linha reta (metros). Misturar as duas num "+1,1"
       sem unidade seria mentir com número. */
    let desvioValor = null;
    let desvioEmSegundos = false;
    if (posicao === 'primeira') indice = 0;
    else if (pNovo && base.length) {
      const pOrigem = ultimaPos && pinoValido(ultimaPos.lat, ultimaPos.lng)
        ? { lat: ultimaPos.lat, lng: ultimaPos.lng } : null;
      // nós[0] = de onde eu saio (pode não existir), depois as paradas na
      // ordem, e o ponto novo no fim.
      const nos = [pOrigem, ...base.map(pontoDe), pNovo];
      const validos = nos.map((p, i) => (p ? i : -1)).filter((i) => i >= 0);
      const matriz = await matrizViaria(validos.map((i) => nos[i]));
      const naMatriz = new Map(validos.map((no, k) => [no, k]));
      const d = (a, b) => {
        if (a == null || b == null || !nos[a] || !nos[b]) return Infinity;
        if (matriz && naMatriz.has(a) && naMatriz.has(b)) {
          const v = matriz[naMatriz.get(a)][naMatriz.get(b)];
          if (Number.isFinite(v)) return v;
        }
        return metrosEntre(nos[a], nos[b]);
      };
      const iNovo = nos.length - 1;
      let melhor = Infinity;
      for (let k = 0; k <= base.length; k++) {
        const ant = k === 0 ? (pOrigem ? 0 : null) : k;
        const prox = k < base.length ? k + 1 : null;
        const entrada = ant == null ? 0 : d(ant, iNovo);
        const saida = prox == null ? 0 : d(iNovo, prox);
        const antiga = ant == null || prox == null ? 0 : d(ant, prox);
        const custo = entrada + saida - antiga;
        if (Number.isFinite(custo) && custo < melhor) { melhor = custo; indice = k; }
      }
      if (Number.isFinite(melhor)) { desvioValor = Math.max(0, melhor); desvioEmSegundos = !!matriz; }
    }
    const ordem = [...ids.slice(0, indice), String(novoId), ...ids.slice(indice)];
    await window.API.post('/logistica/rota/planejar', {
      date: hojeISO(), deliveryIds: ordem, ordemManual: ordem, ...origemGps(),
    });
    const anterior = indice > 0 ? base[indice - 1] : null;
    const nomeAnterior = anterior && anterior.item && anterior.item.cliente && anterior.item.cliente.nome;
    return {
      aplicado: true,
      anterior: nomeAnterior || null,
      // 1-based: a pessoa conta paradas a partir de 1, não de 0.
      posicao: indice + 1,
      deTotal: ordem.length,
      desvio: desvioValor == null ? '' : (desvioEmSegundos ? emMinutos(desvioValor) : emMetros(desvioValor)),
    };
  }

  /* 🔴 O PORTÃO SÓ NASCE DEPOIS QUE A TELA PAROU DE SE PINTAR (09/08, medido).
     `portao()` monta na camada VIVA — e `ir('montagem')` dispara um
     `encherMontagem()` que termina DEPOIS: quando termina, `usarDados` repinta
     e leva embora a camada inteira, com o portão dentro. O aviso simplesmente
     não aparecia, e no caminho do ERRO isso apagava a única frase que dizia que
     a parada tinha sido criada. É a mesma receita do `criarCliente`, que espera
     a ficha carregar antes de avisar: navega, ESPERA o dado da tela, e só
     então fala. */
  async function voltarDaAvulsa(volta) {
    window.ir(volta);
    if (volta !== 'montagem') return;
    try { await encherMontagem(); } catch (_) { /* o aviso vale mais que a lista */ }
  }

  async function rapidaConfirmar() {
    const r = rapida;
    if (!r || r.salvando || r.buscando || !r.resolvido) return;
    const res = r.resolvido;
    const modo = modoDaRapida(r);
    const dup = r.duplicado;
    const nomeDigitado = (campo('rapida-nome') || String(r.nome || '')).trim();
    /* 🔴 TRÊS FREIOS ANTES DE ESCREVER QUALQUER COISA NA BASE:
       1. a mesma porta não entra 2× na rota do dia;
       2. Cadastro sem nome de gente não passa (Direção passa, é só direção);
       3. endereço que já tem conta REUSA a conta — nada de linha nova. */
    if (dup && paradaAbertaDaConta(dup.id)) {
      r.aviso = `${nomeDaConta(dup)} já está na rota de hoje.`;
      return publicarRapida();
    }
    const vaiBatizar = !dup || contaEhStub(dup);
    const pedeNome = modo === 'cadastro' && vaiBatizar;
    if (pedeNome && !nomeDeCadastroValido(nomeDigitado)) {
      r.aviso = 'Escreva o nome do cliente.';
      return publicarRapida();
    }
    const posicao = r.posicao;
    const volta = r.volta;
    /* 🔴 DEPOIS DE CRIAR, NÃO DÁ PRA VOLTAR ATRÁS — e o `catch` tem que saber
       disso. A conta e a entrega já existem no servidor; se a rede cair no
       ENCAIXE (que vem depois), tratar como "não deu certo" seria mentira:
       a parada está lá. Sem este marcador o `catch` tentava repintar um
       rascunho já apagado, e a tela ficava travada em "Adicionando…" pra
       sempre — com a parada criada por trás. */
    let criou = false;
    r.salvando = true; r.aviso = ''; publicarRapida();
    try {
      const numero = digitos(r.numero) || String(res.numero || '');
      const nome = nomeDigitado || [res.endereco, numero].filter(Boolean).join(', ') || 'Parada avulsa';
      let contaId = dup ? String(dup.id) : '';
      if (dup && pedeNome) {
        // Stub de endereço vira CADASTRO de verdade: MESMA conta, agora com nome
        // e papel de cliente. Cadastro que JÁ tem nome nunca é renomeado daqui —
        // quem edita ficha de cliente é a ficha.
        await window.API.patch(`/nucleo/contas/${encodeURIComponent(dup.id)}`, { nome, isCliente: true });
      }
      if (!contaId) {
        const corpo = {
          /* 🔴 DIREÇÃO NÃO VIRA CLIENTE. A conta existe só pra segurar o
             endereço da parada (a entrega precisa de uma), mas fica FORA do
             Cadastro — a lista de Clientes filtra `isCliente`, a rota não. Sem
             isto, cada parada avulsa virava um "cliente" chamado
             "Rua 14 JP, 1682" na base do dono. */
          nome, tipo: 'pf', isCliente: modo === 'cadastro', isLead: false,
          endereco: res.endereco, numero, bairro: res.bairro, cidade: res.cidade, uf: res.uf,
          cep: digitos(r.cep) || res.cep,
        };
        /* O pino viaja quando ELE é a intenção (link colado, candidata escolhida
           na lista). Em CEP+número não: ali o servidor resolve pela base CNEFE,
           que é a fonte certa e grava a `geoFonte` certa junto. */
        if (r.origem !== 'cep' && pinoValido(res.lat, res.lng)) {
          corpo.lat = Number(res.lat); corpo.lng = Number(res.lng);
          /* 🔴 PINO DE BASE NÃO É FIX DE GPS (F4, 12/08). Quem escolheu no painel
             sabe DE ONDE o ponto veio (Censo, Receita) e diz. Calando, o servidor
             decide pela `gpsAccuracy` que não veio e grava `gps_impreciso` — que
             conta a história de um GPS ruim onde não houve GPS nenhum, e é por
             esse rótulo que as telas decidem se ainda precisam pedir a porta ao
             motorista. Quem MEDE a qualidade continua sendo o servidor: 'geocode'
             é justamente a fonte que ele aceita sem provar nada (força 1). */
          if (r.geoFonteEscolhida) corpo.geoFonte = r.geoFonteEscolhida;
        }
        Object.keys(corpo).forEach((k) => {
          if (corpo[k] === undefined || corpo[k] === null || corpo[k] === '') delete corpo[k];
        });
        const criado = await window.API.post('/nucleo/contas', corpo);
        contaId = criado && (criado.contaId || criado.customerProfileId || criado.id);
      }
      if (!contaId) throw new Error('Não consegui criar o cadastro desta porta.');
      /* 🔴 `paraMinhaRota` FAZ A ENTREGA NASCER COM MOTORISTA. Sem ele ela nasce
         órfã e o Iniciar responde "Atribua as entregas a exatamente um
         motorista" pro dia INTEIRO — uma parada avulsa envenenava o dia. */
      const entrega = await window.API.post('/logistica/entregas', {
        customerProfileId: String(contaId),
        quantidade: 1,
        scheduledAt: `${hojeISO()}T12:00:00.000Z`,
        paraMinhaRota: true,
      });
      criou = true;
      rapida = null;
      // A rota tem que ser relida ANTES do encaixe: é dela que sai a lista de
      // abertas em que a parada nova vai entrar.
      await carregarRota();
      let encaixe = { aplicado: false, anterior: null };
      const novoId = entrega && entrega.id ? String(entrega.id) : '';
      if (novoId) encaixe = await encaixarAvulsa(novoId, posicao);
      // A escolha dele já está gravada — e desde 10/08 a Montagem não
      // reotimiza nada sozinha ao abrir, então ninguém passa por cima.
      await carregarRota();
      await voltarDaAvulsa(volta);
      window.portao({
        tom: 'ok', ico: 'check', titulo: 'Parada adicionada',
        /* O RECIBO MOSTRA A CONTA QUE FOI FEITA — posição, de quantas, depois
           de quem, e quanto custou o encaixe. Tudo saído da resposta do
           `encaixarAvulsa`; nada aqui é enfeite escrito à mão. */
        sub: !encaixe.aplicado ? 'Ela entrou na rota de hoje.'
          : [
            `Parada ${encaixe.posicao} de ${encaixe.deTotal}`,
            encaixe.anterior ? `, depois de ${encaixe.anterior}` : ', como primeira',
            encaixe.desvio ? ` · menor desvio: +${encaixe.desvio}` : '',
          ].join('') + '.',
        acoes: [['Fechar', 'principal', true]],
      });
    } catch (e) {
      if (!criou) {
        // Nada foi escrito: devolve a tela como estava e o dedo tenta de novo.
        if (rapida === r) { r.salvando = false; publicarRapida(); }
        return avisoErro(e);
      }
      // A parada EXISTE; o que falhou foi a ordem. Dizer "não deu certo" aqui
      // faria ele adicionar o mesmo endereço duas vezes.
      rapida = null;
      try { await carregarRota(); } catch (_) { /* já estamos no desvio */ }
      await voltarDaAvulsa(volta);
      window.portao({
        tom: 'alerta', ico: 'alert', titulo: 'A parada entrou',
        sub: 'Mas não consegui reordenar a rota agora. Ela acha o lugar dela no Iniciar.',
        acoes: [['Fechar', 'principal', true]],
      });
    }
  }

  /* ==========================================================================
     "MONTAR ROTA AGORA, 5 PONTOS" (dono, 09/08) — a porta "Meus clientes".

     🔴 O VERBO SÓ CUMPRE SE OS PONTOS PUDEREM SER ESCOLHIDOS. Até aqui a única
     entrada avulsa era digitar endereço, uma por vez: montar 5 pontos do
     próprio cadastro custava 5 buscas de endereço, mesmo com os 5 na base.
     Aqui a lista é a base, marca-se quem entra e o toque faz as duas metades do
     verbo — cria as paradas e MONTA a ordem — deixando o pé da Montagem em
     "Iniciar rota".

     Sem endpoint novo: `paraMinhaRota` (a entrega nasce com motorista, senão o
     Iniciar recusa o dia inteiro) e o `planejar` de sempre.

     🔴 UMA DE CADA VEZ, e não `Promise.all`. Cinco POSTs em paralelo disputam a
     mesma rota no servidor, e o que eu ganharia em segundos eu perderia em não
     saber QUEM entrou quando um falha. Aqui a falha é por NOME.
     ========================================================================== */
  async function rapidaAdicionarEscolhidos() {
    const r = rapida;
    if (!r || r.salvando || r.buscando) return;
    const nomePorId = new Map((r.lista || []).map((c) => [String(c.id), String(c.name || 'Cliente')]));
    // A mesma porta não entra 2× na rota do dia — mesmo freio do `rapidaConfirmar`.
    const ids = (r.escolhidos || []).map(String).filter((id) => !paradaAbertaDaConta(id));
    if (!ids.length) {
      r.aviso = 'Marque quem entra na rota.';
      return publicarRapida();
    }
    const volta = r.volta;

    /* ------------------------------------------------------------------------
       🔴 ROTA POR MONTAR ⇒ ISTO É RASCUNHO, NÃO GRAVAÇÃO (dono, 09/08: "eu ainda
       nem confirmei q queria nada, ele meio q já adiciona").
       Entrou pela Montagem e a rota ainda não saiu pra rua? Então marcar cliente
       é DECIDIR, e decidir não escreve na base: os escolhidos vão pro rascunho,
       aparecem na lista da Montagem, e viram entrega no "Salvar rota" / "Montar
       rota" / "Iniciar rota" (ver `materializarRascunho`). Voltar joga fora.
       A exceção mora logo abaixo e é do domínio: com a rota VIVA na rua o
       propósito do gesto é somar a ela agora — lá não existe momento "salvar". */
    if (volta === 'montagem' && !rotaNaRua()) {
      const nomes = new Map((r.lista || []).map((c) => [String(c.id), c]));
      /* Aqui a chave é o CLIENTE, e de propósito: `/nucleo/clientes` não fala
         de locais, então marcar alguém nesta porta quer dizer "este cliente",
         no endereço do perfil. Chavear por `cliente|localId` faria quem já
         entrou pelo histórico numa porta nascer DE NOVO no perfil — uma
         segunda visita que ninguém pediu. Porta que não conhece porta
         deduplica por quem ela conhece. */
      const jaNoRascunho = new Set(RASCUNHO.map((c) => String(c.id)));
      let novos = 0;
      ids.forEach((id) => {
        if (jaNoRascunho.has(String(id))) return;
        const c = nomes.get(String(id)) || {};
        /* 🔴 MESMA CASCA ⇒ MESMA BAGAGEM (dono, 09/08: "a gente combinou de
           fazer tudo com a mesma casca, mesmas regras"). A linha do rascunho
           senta no MESMO cartão da prévia da agenda e é lida pela MESMA régua
           (`pernaDaPrevia`) — então ela viaja com o PINO e com o
           `resolveSozinho` que a linha da agenda já traz do servidor. Sem
           isso a mesma tela falava duas línguas: a semana quieta e a avulsa
           gritando "não sei onde fica" pra cliente com porta marcada.
           Recorrência ativa = a régua de `logistica-base-saude` ("a 1ª
           entrega grava a porta pelo GPS do entregador"), lida do
           `diasEntrega` que o card de clientes já manda. Zero não é pino
           (a lição do mapa na África).

           🔴 E O ENDEREÇO SE MONTA COM O NÚMERO. Esta é a ÚNICA das três
           origens da lista que não recebe `enderecoLinha` pronta: o
           `/nucleo/clientes` manda `endereco` e `numero` em campos separados,
           e o `numero` era simplesmente ignorado aqui. Medido na empresa 41:
           44 dos 225 clientes têm o número só nessa coluna — o cartão dizia
           "Rua M-7" e o computador, "Rua M-7, 897". A régua é a mesma do
           servidor (`linhaDeEndereco` = `linhaEnderecoDaFonte`). */
        RASCUNHO.push({
          id: String(id),
          nome: String(c.name || 'Cliente'),
          enderecoLinha: linhaDeEndereco(c.endereco, c.numero),
          bairro: String(c.cidade || ''),
          ...(pinoValido(c.lat, c.lng) ? { lat: Number(c.lat), lng: Number(c.lng) } : {}),
          resolveSozinho: Array.isArray(c.diasEntrega) && c.diasEntrega.length > 0,
          // "Ult. Registro" (12/08) — o `/nucleo/clientes` manda o campo; a porta
          // "Meus clientes" é a 3ª origem da mesma lista e escreve a mesma data.
          ...(c.ultimaEntregaAt ? { ultimaEntregaAt: String(c.ultimaEntregaAt) } : {}),
        });
        novos += 1;
      });
      rapida = null;
      // O chip de HOJE pode passar a existir só por causa do rascunho — é ele
      // que dá a porta de volta quando o dedo for espiar outro dia.
      publicarMontarDias();
      await voltarDaAvulsa(volta);
      const q = `${novos} ${novos === 1 ? 'parada' : 'paradas'}`;
      return window.portao({
        tom: 'ok', ico: 'check', titulo: `${q} na lista`,
        // O verbo do recibo é o verbo do estado: nada foi gravado ainda, e
        // prometer "está na rota" seria a mesma mentira de antes com outra cara.
        sub: 'Ainda dá pra mexer. Toque em "Iniciar rota" pra valer.',
        acoes: [['Fechar', 'principal', true]],
      });
    }

    r.salvando = true; r.aviso = ''; publicarRapida();

    const entraram = [];
    const falharam = [];
    for (const id of ids) {
      try {
        await window.API.post('/logistica/entregas', {
          customerProfileId: id,
          quantidade: 1,
          scheduledAt: `${hojeISO()}T12:00:00.000Z`,
          paraMinhaRota: true,
        });
        entraram.push(id);
      } catch (_) { falharam.push(nomePorId.get(id) || 'Cliente'); }
    }

    /* NINGUÉM ENTROU = nada foi escrito: devolve a tela como estava e o dedo
       tenta de novo. É o único caminho em que "não deu certo" é verdade. */
    if (!entraram.length) {
      if (rapida === r) { r.salvando = false; publicarRapida(); }
      return avisoErro(new Error('Não consegui adicionar agora. Tente de novo.'));
    }

    rapida = null;
    /* A ORDEM É A SEGUNDA METADE DO VERBO. Falhar aqui não desfaz nada — as
       paradas existem —, então o recibo muda de tom em vez de mentir. */
    let ordenou = true;
    try {
      await carregarRota();
      await window.API.post('/logistica/rota/planejar', { date: hojeISO(), ...origemGps() });
    } catch (_) { ordenou = false; }
    await carregarRota();
    await voltarDaAvulsa(volta);

    const n = entraram.length;
    const quantas = `${n} ${n === 1 ? 'parada' : 'paradas'}`;
    if (falharam.length) {
      return window.portao({
        tom: 'alerta', ico: 'alert', titulo: `${quantas} na rota`,
        sub: `Não consegui: ${falharam.join(', ')}.`,
        acoes: [['Fechar', 'principal', true]],
      });
    }
    window.portao({
      tom: 'ok', ico: 'check', titulo: `${quantas} na rota`,
      sub: ordenou ? 'A ordem já está montada — é só iniciar.'
        : 'Toque em "Montar rota" pra achar a ordem delas.',
      acoes: [['Fechar', 'principal', true]],
    });
  }

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

      // O toque no GPS da ficha conta como mudança de endereço mesmo que o texto
      // não mude: o que ele traz de novo é o PINO (e o pino viaja no salvar).
      const g = ficha.gpsLocal || null;
      const mudouEndereco = !!g
        || cep !== String(loc.cep || '')
        || rua !== String(loc.endereco || '')
        || numero !== String(loc.numero == null ? '' : loc.numero)
        || bairro !== String(loc.bairro || '');

      const diasAgora = [1, 2, 3, 4, 5, 6, 7].filter((n) => (ficha.dias || []).indexOf(n) >= 0);
      const diasAntes = (it.diasEntrega || []).slice().sort().join(',');
      const mudouDias = diasAgora.slice().sort().join(',') !== diasAntes;
      /* 🔴 O FINANCEIRO SALVA COM A FICHA (12/08) — mesmo botão, porta própria.
         `corpoFinanceiro` devolve SÓ o que mudou, e null quando nada mudou; sem
         essa disciplina, abrir e salvar qualquer ficha reescreveria o contrato
         de cobrança de todo cliente legado da base sem ninguém pedir.
         Só quem PODE editar manda: com o módulo desligado ou sem admin a seção
         nem existe na tela, e um PATCH daqui voltaria 403. */
      const fin = (config && config.moduloFinanceiroAtivo && ehAdmin()) ? corpoFinanceiro() : null;

      if (!Object.keys(conta).length && !mudouEndereco && !mudouDias && !fin) {
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
          const info = ficha.cepInfo || {};
          await window.API.patch(`/nucleo/locais/${encodeURIComponent(loc.id)}`, {
            endereco: rua, numero, bairro, cep,
            cidade: info.cidade || loc.cidade || '', uf: info.uf || loc.uf || '',
            // 🔴 O PINO MORRE COM O ENDEREÇO VELHO — SALVO quando o GPS da ficha
            // acabou de marcar a porta: aí o pino novo é o do dedo (10/08).
            ...(g
              ? { lat: g.lat, lng: g.lng, geoFonte: 'gps_cadastro',
                  ...(Number.isFinite(g.precisaoM) ? { gpsAccuracy: g.precisaoM } : {}) }
              : { lat: null, lng: null }),
          });
        } else if (g) {
          // sem LocalEntrega, o pino do GPS entra pela CONTA (mesma porta do
          // cadastro novo) — updateConta decide a fonte com o mesmo freio.
          await window.API.patch(`/nucleo/contas/${encodeURIComponent(ficha.id)}`, {
            lat: g.lat, lng: g.lng, geoFonte: 'gps_cadastro',
            ...(Number.isFinite(g.precisaoM) ? { gpsAccuracy: g.precisaoM } : {}),
          });
        }
        if (mudouDias) {
          await window.API.patch(`/logistica/clientes/${encodeURIComponent(ficha.id)}/dias`, { dias: diasAgora });
        }
        if (fin) {
          await window.API.patch(`/logistica/clientes/${encodeURIComponent(ficha.id)}/financeiro`, fin);
        }
      } catch (e) { return avisoErro(e); }
      await carregarClientes();
      // Rascunho MORRE no salvamento: daqui pra frente quem manda é o servidor
      // (foi ele que decidiu o que aceitou), senão a tela mostraria pra sempre
      // o que eu digitei mesmo que a gravação tenha ajustado o valor.
      // Reabrir a ficha não troca a porta de saída: quem salvou veio de algum
      // lugar, e o Voltar continua devolvendo pra lá.
      await abrirCliente(ficha.id, ficha.volta);
      window.portao({
        tom: 'ok', ico: 'check', titulo: 'Ficha salva',
        // Lei 8: a palavra "pino" é PROIBIDA em tela — é jargão de motor. Quem
        // lê é o motorista, e pra ele o que mudou é o LOCAL.
        sub: mudouEndereco ? 'O endereço mudou — o local vai ser conferido de novo.' : '',
        acoes: [['Fechar', '']],
      });
    });
  }

  /* 🔴 O EXCLUIR DA FICHA ERA CENÁRIO (medido no aparelho, 08/08). O botão era
     `data-superficie="confirmar"` — a confirmação DECORATIVA da maquete: na
     ficha de um cliente real ele abria "Retirar da rota de hoje? Mercado
     Estrela · volta na próxima quarta". Nome de outro cliente, verbo de outra
     ação, e nada era excluído. Três defeitos numa peça só.

     Agora a pergunta cita QUEM está aberto, e o "Excluir" chama a porta de
     verdade. Duas coisas o servidor decide e a tela obedece:
     · quem pode — `DELETE /nucleo/contas/:id` é ADMIN-only; o botão só nasce
       pra `admin` (ver `encherFicha`), então o 403 não chega aqui por desenho;
     · dívida trava — cliente com valor em aberto volta 409 CLIENTE_COM_DEBITO,
       COM o saldo. Esse número vira frase: "Fulano deve R$ 84,00", e não o
       `Falha 409` cru que o envelope entregava antes de o status viajar.
     É soft-delete no servidor (guarda um retrato antes de esconder), por isso a
     frase é "sai do cadastro", nunca "apaga pra sempre" — a tela não promete
     mais do que o banco faz. */
  async function excluirCliente() {
    if (!ficha || typeof window.portao !== 'function') return;
    const id = ficha.id;
    const d = ficha.detalhe || {};
    const it = ficha.item || {};
    // O nome vem do MESMO lugar que a tela está mostrando (detalhe > lista);
    // sem nome não se pergunta, porque a pergunta sem nome é a de antes.
    const nome = String(d.name || it.name || '').trim();
    if (!nome) return;
    // Já montada, a parada de hoje é da ROTA, não do cadastro: apagar o cliente
    // não a tira de lá. Dizer isso aqui evita o motorista sair pra rua achando
    // que a parada sumiu — e é de graça (`PARADAS_SALVAR` já está na memória).
    const naRotaDeHoje = PARADAS_SALVAR.some((p) => String(p.customerProfileId) === String(id));
    window.portao({
      tom: 'alerta', ico: 'trash', titulo: `Excluir ${esc(nome)}?`,
      sub: `Sai do cadastro e não entra mais em rota. As entregas já feitas ficam no histórico.${
        naRotaDeHoje ? ' A parada de hoje continua na rota até você retirar.' : ''}`,
      acoes: [['Não', ''], ['Excluir', 'principal']], classe: 'duas',
    });
    const botao = naCamada('.portao-wrap .principal');
    if (!botao) return;
    botao.addEventListener('click', () => comTrava(async () => {
      try { await window.API.del(`/nucleo/contas/${encodeURIComponent(id)}`); }
      catch (e) { return erroDeExcluir(e, nome); }
      ficha = null;
      await carregarClientes();
      if (typeof window.ir === 'function') window.ir('clientes');
      window.portao({
        tom: 'ok', ico: 'check', titulo: 'Cliente excluído',
        sub: `${esc(nome)} saiu do cadastro.`, acoes: [['Fechar', '']],
      });
    }), { once: true });
  }

  /** as duas respostas que o servidor dá aqui e que o aviso genérico estraga */
  function erroDeExcluir(e, nome) {
    const corpo = (e && e.body) || {};
    if (String(corpo.error || '') === 'CLIENTE_COM_DEBITO') {
      // `saldo` vem em REAIS (o serviço arredonda em 2 casas), não em centavos.
      const saldo = typeof corpo.saldo === 'number' ? corpo.saldo : null;
      return window.portao({
        tom: 'trava', ico: 'cash', titulo: 'Tem valor em aberto',
        sub: saldo != null
          ? `${esc(nome)} deve ${dinheiro(saldo)}. Receba ou baixe a dívida antes de excluir.`
          : `${esc(nome)} tem valor em aberto. Receba ou baixe a dívida antes de excluir.`,
        acoes: [['Fechar', '']],
      });
    }
    // 403 aqui não é sessão vencida (é o que o tradutor diria): é o servidor
    // dizendo que esta conta não manda no cadastro. O botão nem devia estar na
    // tela — se apareceu, a frase tem que ser a verdadeira.
    if (Number(e && e.status) === 403) {
      return window.portao({
        tom: 'trava', ico: 'lock', titulo: 'Isso é do escritório',
        sub: 'Excluir cliente é no computador, com a conta do dono.',
        acoes: [['Fechar', '']],
      });
    }
    return avisoErro(e);
  }

  /* ------------------------------------------------------------------------
     L5 — O FECHAMENTO DO DIA E A SEMANA.

     Tudo sai de UMA porta (`/logistica/fechamento/resumo`), que já era pedida
     pra encher o caixa do topo da Rota — o fechamento não custa requisição nova.
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

  function encherFechamento(caixa, itens, entregues) {
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
    window.usarDados('fechamento', {
      // O esqueleto/aviso saem no MESMO repinte do dado — mesmo par que
      // TODA seção com `carregando`/`semFonte` usa quando a resposta chega
      // (ver `fonteVoltou` em 10-geofence-montagem.js). Sem isto, a Fechamento
      // ficaria PRESA no esqueleto pra sempre depois da 1ª carga: nada mais
      // neste método zerava `carregando`.
      ...fonteVoltou,
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
        ['note', 'var(--amber)', 'Marcado', centavosSeTiver(formas.fiadoCents)],
      ].filter((x) => x[3]) : [],
      formaTotal: f ? centavosSeTiver(f.totalCents) : '',
      clientes: seTiver(clientes),
      // 🔴 PRODUTOS SÃO DO FECHAMENTO, NÃO DA ROTA. Estavam lendo
      // `DADOS.rota.*` — e aí uma venda de 2 galões aparecia como "0 produtos"
      // porque a ROTA de hoje estava vazia. São duas contas diferentes com o
      // mesmo nome; a desta tela é a das VENDAS da página.
      produtos: pagina && Array.isArray(pagina.vendas)
        ? seTiver(pagina.vendas.reduce((s, v) => s
            + (Array.isArray(v.itens) ? v.itens.reduce((n, it) => n + (Number(it.qtd) || 0), 0) : 0), 0))
        : '',
      // 🔴 O "marcado" NÃO VIAJA MAIS (09/08). Ele é o `fiadoCents` — exatamente
      // o mesmo número que a grade de formas já mostra como "Marcado". Estava
      // escrito duas vezes na MESMA tela, e dado em 2 cards é bug de produto: a
      // grade é o lugar dele, ao lado de Dinheiro/Pix/Cartão, porque "marcou" é
      // uma forma de desfecho como as outras.
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

  /* ------------------------------------------------------------------------
     🔴 O ÚNICO VERBO QUE FECHA O DIA (12/08, dono: *"ela aparece algumas vezes
     no final, sem necessidade, transforme isso em 1x só"*).

     Eram DOIS botões no mesmo gancho — o "Finalizar" do dock da rota e o
     "Fechar o dia" desta tela — e nenhum dos dois fechava coisa alguma:
     `fechamento/finalizar` carimba a página do dia e salva a Rota salva, mas
     NÃO encerra rota nenhuma. Ela seguia `ACTIVE`, o rodapé voltava a oferecer
     "Navegar" sobre um dia terminado, e o caminho acabava em `ir('fechamento')`
     — a tela do próprio botão. Anel fechado: fecha, cai onde fecha, fecha de
     novo. Foi isso que o dono viu "aparecendo algumas vezes".

     Hoje a corrente tem TRÊS TEMPOS e um dono cada: o "Finalizar" do dock ABRE
     esta tela (`ir-fechamento`), este botão FECHA o dia, e o `terminou` é o
     recibo. É o desenho de todo app de rota do mercado — o dia só fecha depois
     que o motorista viu o número.

     O fechar faz as duas coisas do dia, na ordem que importa:
       1) ENCERRA A ROTA (`rota/encerrar` — porta que já existia inteira e já
          estava na allowlist do Kotlin). É ela que marca `operationalEndedAt`,
          e é por isso que o dock vira "Montar rota" SOZINHO depois: sem parada
          aberta, `estadoDaRota` cai em 'montar' e `dockDaRota` deriva
          `semparada`. O estado de recomeço não é novo — ele já existia e nunca
          era alcançado, porque ninguém encerrava.
          Só é chamada com a rota VIVA: esta tela também abre pelos Ajustes e
          pelo caixa da Rota, e mandar encerrar um dia que não começou é POST
          sem dono.
       2) REGISTRA A PÁGINA (`fechamento/finalizar`) — o dinheiro.

     🔴 E O 400 DEIXOU DE SER BECO. Dia sem nenhuma venda faz o servidor
     responder "Nada registrado neste dia ainda." — e com isso quem rodou o dia
     inteiro sem vender ficava PRESO, sem conseguir fechar. Quem encerra o dia é
     o passo 1, que já aconteceu; o passo 2 salva a rota como modelo, e não ter
     o que salvar não é erro de quem trabalhou. Erro de verdade (rede, sessão,
     403, 500) continua falando alto — o `!== 400` é o corte.

     🔴 O ESTADO É LIDO NO CLIQUE, NÃO NA ABERTURA DO PORTÃO. Entre desenhar a
     pergunta e o dedo responder cabe um `carregarRota` (o poll, um recado, o
     desfecho de outra parada) — decidir com o estado de dois segundos atrás é
     como o dock do mapa herdava o dia da montagem.
     ------------------------------------------------------------------------ */
  async function fecharDia() {
    if (typeof window.portao !== 'function') return;
    const dia = diaDaSemana();
    const sobrando = paradasPendentes().length;
    window.portao({
      tom: 'info', ico: 'lock', titulo: 'Fechar o dia?',
      /* Quem sobrou é dito ANTES, não depois: encerrar devolve a parada aberta
         pra pendência (sem ordem) e ainda vira recado no escritório. Quem tem
         direito de saber disso é quem está apertando o botão. */
      sub: sobrando
        ? `${sobrando} ${sobrando === 1 ? 'parada fica' : 'paradas ficam'} pra amanhã · registrar como ${DIAS_SEMANA[dia]}`
        : `Registrar como ${DIAS_SEMANA[dia]}`,
      acoes: [['Agora não', ''], ['Fechar o dia', 'principal']], classe: 'duas',
    });
    const botao = naCamada('.portao-wrap .principal');
    if (!botao) return;
    botao.addEventListener('click', () => comTrava(async () => {
      if (estadoRota === 'rodando' || estadoRota === 'pausada') {
        try { await window.API.post('/logistica/rota/encerrar', { date: hojeISO() }); }
        catch (e) { return avisoErro(e); }
      }
      try { await window.API.post('/logistica/fechamento/finalizar', { dia }); }
      catch (e) { if (Number(e && e.status) !== 400) return avisoErro(e); }
      await carregarRota();
      encherTerminou();
      window.ir('terminou');
    }), { once: true });
  }

  /* O RECIBO SE ESCREVE DEPOIS DO `carregarRota`, com o dia já do jeito que
     ficou: quem sobrou aqui é a contagem REAL pós-encerramento (as abertas
     voltaram 'agendada'), não a que eu li antes de mandar o POST.
     A hora é a do APARELHO de propósito — é a hora em que ESTE dedo fechou,
     não um fato do servidor; nada é comparado nem gravado com ela. */
  function encherTerminou() {
    if (typeof window.usarDados !== 'function') return;
    let hora = '';
    try {
      hora = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit',
      }).format(new Date());
    } catch (_) { hora = ''; }
    const sobrou = paradasPendentes().length;
    window.usarDados('terminou', {
      quando: hora ? `Fechado às ${hora}` : '',
      sobra: sobrou ? `${sobrou} ${sobrou === 1 ? 'parada ficou' : 'paradas ficaram'} pra amanhã` : '',
    });
  }

