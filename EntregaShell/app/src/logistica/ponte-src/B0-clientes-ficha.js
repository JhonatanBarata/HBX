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
  async function abrirCliente(id, volta) {
    if (!id || typeof window.usarDados !== 'function') return;
    /* 🔴 CLIENTE FORA DA LISTA CARREGADA TAMBÉM ABRE (09/08). O `CLIENTES` é a
       PÁGINA de clientes que está na memória — 100 por vez, e ela encolhe
       quando há filtro de busca ou de dia. A montagem chama esta função com
       quem está na ROTA do dia, que não é o mesmo conjunto: com 120 clientes na
       base, o de número 101 tocava o cartão e NADA acontecia — o `return` calado
       de um `item` ausente. Sem o resumo da lista a ficha abre só com o nome e
       enche quando o detalhe chega, que é como ela já se comporta. */
    const item = CLIENTES.get(String(id)) || { id: String(id) };
    // A ficha abre JÁ com o que a lista sabe; o detalhe entra quando chegar.
    // Tela de cadastro que fica em branco esperando rede é tela quebrada.
    // rascunho ZERADO: cliente novo mostra o cadastro DELE, nunca sobra do anterior.
    ficha = {
      id: String(id),
      item,
      detalhe: null,
      local: null,
      telefone: null,
      rascunho: {},
      dias: (item.diasEntrega || []).slice(),
      // por onde ele entrou: é pra lá que o Voltar tem que devolver.
      volta: volta || 'clientes',
    };
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
    ligarCamposDeCep(camada);
  }

  /* 🔴 CEP É REGRA (10/08, ordem do dono): máscara #####-### em TODO campo de
     CEP, e CEP completo puxa o resto SOZINHO (geo/cep → rua e bairro entram na
     hora). O CEP manda no nome da rua — o que ele diz SOBRESCREVE o que estava
     no campo; quem digita CEP está pedindo exatamente isso. */
  const mascaraCep = (v) => {
    const d = String(v || '').replace(/\D/g, '').slice(0, 8);
    return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
  };
  async function preencherPeloCep(digitos, aplicar) {
    let r = null;
    try { r = await window.API.get(`/logistica/geo/cep?cep=${encodeURIComponent(digitos)}`); }
    catch (_) { r = null; }
    if (r && (r.endereco || r.bairro)) aplicar(r);
  }
  /** escreve os campos no DOM da camada viva e no rascunho do dono (se houver) */
  function aplicarEnderecoDoCep(porCampo, rascunhoDono) {
    for (const nome of Object.keys(porCampo)) {
      const valor = String(porCampo[nome] || '').trim();
      if (!valor) continue;
      const el = naCamada(`[data-campo="${nome}"]`);
      if (el) el.value = valor;
      if (rascunhoDono) {
        const alvo = rascunhoDono();
        if (alvo) { alvo.rascunho = alvo.rascunho || {}; alvo.rascunho[nome.replace(/^novo-/, '')] = valor; }
      }
    }
  }
  function ligarCamposDeCep(camada) {
    const ligarCep = (nomeCampo, aoCompletar, rascunhoDono) => {
      const el = camada.querySelector(`[data-campo="${nomeCampo}"]`);
      if (!el || el.__hbxCep) return;
      el.__hbxCep = true;
      el.addEventListener('input', () => {
        const mascarado = mascaraCep(el.value);
        if (el.value !== mascarado) el.value = mascarado;
        // o listener genérico do rascunho rodou ANTES com o valor cru — corrige
        // pro mascarado, senão o repinte devolveria o CEP sem máscara.
        if (rascunhoDono) {
          const alvo = rascunhoDono();
          if (alvo && alvo.rascunho && alvo.rascunho[nomeCampo] !== undefined) alvo.rascunho[nomeCampo] = mascarado;
        }
        const digitos = mascarado.replace(/\D/g, '');
        if (digitos.length === 8 && el.__hbxCepFeito !== digitos) {
          el.__hbxCepFeito = digitos;
          aoCompletar(digitos);
        }
      });
      // valor que chegou do servidor sem máscara ganha a máscara na hora
      const pronto = mascaraCep(el.value);
      if (pronto && pronto !== el.value) el.value = pronto;
    };
    ligarCep('cep', (digitos) => preencherPeloCep(digitos, (r) => {
      aplicarEnderecoDoCep({ rua: r.endereco, bairro: r.bairro }, () => ficha);
      if (ficha) ficha.cepInfo = { cidade: r.cidade || '', uf: r.uf || '' };
    }), () => ficha);
    ligarCep('novo-cep', (digitos) => preencherPeloCep(digitos, (r) => {
      aplicarEnderecoDoCep({ 'novo-rua': r.endereco, 'novo-bairro': r.bairro }, null);
      novoCepInfo = { cidade: r.cidade || '', uf: r.uf || '' };
    }), null);
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
      // O EXCLUIR é do dono, não do motorista: `DELETE /nucleo/contas/:id` é
      // ADMIN-only no servidor, e este é o MESMO sinal das 6 chaves do Avançado.
      // Config que não chegou (app sem rede no boot) = sem botão: esconder um
      // botão que o servidor talvez aceitasse é menos grave que oferecer uma
      // exclusão que volta 403 traduzido como "sua sessão expirou".
      admin: ehAdmin() ? 1 : 0,
      volta: ficha.volta || 'clientes',
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
      // banner do "GPS — usar onde estou" (10/08): só existe depois do toque.
      local: (ficha.gpsAviso && ficha.gpsAviso.local) || '',
      localOk: ficha.gpsAviso ? ficha.gpsAviso.ok : 0,
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

  /* ==========================================================================
     CADASTRAR CLIENTE NA PORTA — o "+" do cabeçalho (08/08, pedido do dono).

     🔴 POR QUE ISTO É DINHEIRO, não conforto: medido na empresa 41 em 04/08 —
     117 paradas SEM local nenhum e 130 com local empilhado no mesmo ponto. Foi
     o que apodreceu a rota do André. Endereço digitado no escritório não sabe
     onde a casa fica; cadastro feito com o entregador PARADO na frente dela
     nasce com a coordenada certa.

     Nada de endpoint novo: `POST /nucleo/contas` já aceita lat/lng/geoFonte/
     gpsAccuracy e já passa o porteiro do aparelho. Quem decide se a coordenada
     é boa é o SERVIDOR (fail-closed em 60 m → grava 'gps_impreciso'); o app só
     conta o que mediu. App que se autodeclara preciso é app que mente.
     ========================================================================== */
  let novoLocal = null;      // {lat,lng,precisaoM} do "Usar meu local"
  let novoCepInfo = null;    // {cidade,uf} que o geo/cep devolveu pro CEP digitado

  const novoEmBranco = () => {
    novoLocal = null;
    novoCepInfo = null;
    if (typeof window.usarDados === 'function') {
      window.usarDados('novocliente', {
        nome: '', telefone: '', cep: '', rua: '', numero: '', bairro: '',
        local: '', localOk: 0, salvando: 0,
      });
    }
  };

  /* O que o dedo já digitou tem que SOBREVIVER ao repinte do banner do GPS:
     `usarDados` remonta a camada, e sem devolver os campos o motorista veria o
     nome que acabou de escrever sumir na hora de pegar o local. */
  const novoRascunho = () => ({
    nome: campo('novo-nome'), telefone: campo('novo-telefone'), cep: campo('novo-cep'),
    rua: campo('novo-rua'), numero: campo('novo-numero'), bairro: campo('novo-bairro'),
  });

  /** "Usar meu local": crava a coordenada e, de brinde, sugere a rua. */
  async function usarMeuLocal() {
    const rascunho = novoRascunho();
    if (!ultimoFix) {
      // Sem fix ainda: pede a permissão (o mesmo caminho do Navegar) e explica.
      // `avisarSemGps` é só da navegação — aqui a fala é outra.
      garantirGps();
      return window.portao({
        tom: 'alerta', ico: 'gps', titulo: 'Ainda sem localização',
        sub: 'Libere o GPS e espere um instante do lado de fora. Você pode digitar o endereço à mão enquanto isso.',
        acoes: [['Fechar', '']],
      });
    }
    const precisao = Number(ultimoFix.precisaoM);
    const ok = Number.isFinite(precisao) && precisao <= 60;
    novoLocal = { lat: ultimoFix.lat, lng: ultimoFix.lng, precisaoM: Number.isFinite(precisao) ? precisao : null };
    // Sugestão de rua/bairro: é ENFEITE — 200 sempre, e falha não trava nada
    // (a mesma lei do "enfeite lento não derruba a tela").
    let sugestao = null;
    try {
      sugestao = await window.API.get(`/logistica/geo/reverse?lat=${encodeURIComponent(novoLocal.lat)}&lng=${encodeURIComponent(novoLocal.lng)}`);
    } catch (_) { sugestao = null; }
    const s = sugestao || {};
    window.usarDados('novocliente', {
      ...rascunho,
      // A sugestão só ENTRA em campo vazio: o que o motorista digitou vale mais
      // que o palpite do mapa.
      rua: rascunho.rua || esc(s.endereco || ''),
      bairro: rascunho.bairro || esc(s.bairro || ''),
      // O CEP é OBRIGATÓRIO no servidor (lei de 06/08) e é justamente o que
      // ninguém sabe de cor na porta do cliente — vir de graça aqui é o que
      // torna o cadastro na rua possível. Já mascarado: máscara é regra (10/08).
      cep: rascunho.cep || esc(mascaraCep(s.cep || '')),
      local: ok
        ? `Local marcado aqui${Number.isFinite(precisao) ? ` (${Math.round(precisao)} m)` : ''}.`
        : `Local marcado, mas fraco${Number.isFinite(precisao) ? ` (${Math.round(precisao)} m)` : ''} — chegue mais perto da porta e toque de novo.`,
      localOk: ok ? 1 : 0,
    });
  }

  /** "GPS — usar onde estou" NA FICHA (10/08, ordem literal do dono: "injetar o
      GPS que pega o endereço que a pessoa está, não estou vendo!"). Mesmo motor
      do novocliente: fix do aparelho → geo/reverse (o Censo responde primeiro,
      com o CEP da porta) → CEP/rua/bairro entram sozinhos; o pino viaja no
      Salvar como `gps_cadastro`, nunca antes (salvar é o único verbo que grava). */
  async function usarLocalFicha() {
    if (!ficha) return;
    if (!ultimoFix) {
      garantirGps();
      return window.portao({
        tom: 'alerta', ico: 'gps', titulo: 'Ainda sem localização',
        sub: 'Libere o GPS e espere um instante do lado de fora. Você pode digitar o endereço à mão enquanto isso.',
        acoes: [['Fechar', '']],
      });
    }
    const precisao = Number(ultimoFix.precisaoM);
    const ok = Number.isFinite(precisao) && precisao <= 60;
    ficha.gpsLocal = { lat: ultimoFix.lat, lng: ultimoFix.lng, precisaoM: Number.isFinite(precisao) ? precisao : null };
    let s = null;
    try {
      s = await window.API.get(`/logistica/geo/reverse?lat=${encodeURIComponent(ultimoFix.lat)}&lng=${encodeURIComponent(ultimoFix.lng)}`);
    } catch (_) { s = null; }
    s = s || {};
    ficha.rascunho = ficha.rascunho || {};
    if (s.cep) ficha.rascunho.cep = mascaraCep(s.cep);
    if (s.endereco) ficha.rascunho.rua = String(s.endereco);
    if (s.bairro) ficha.rascunho.bairro = String(s.bairro);
    if (s.cidade || s.uf) ficha.cepInfo = { cidade: s.cidade || '', uf: s.uf || '' };
    ficha.gpsAviso = {
      local: ok
        ? `Local marcado aqui${Number.isFinite(precisao) ? ` (${Math.round(precisao)} m)` : ''}.`
        : `Local marcado, mas fraco${Number.isFinite(precisao) ? ` (${Math.round(precisao)} m)` : ''} — chegue mais perto da porta e toque de novo.`,
      ok: ok ? 1 : 0,
    };
    encherFicha();
  }

  /** Salvar o cliente novo. Confere porta repetida ANTES de criar. */
  async function salvarNovoCliente() {
    await comTrava(async () => {
      const d = novoRascunho();
      if (!d.nome) {
        return window.portao({
          tom: 'alerta', ico: 'users', titulo: 'Falta o nome',
          sub: 'Escreva ao menos o nome do cliente.', acoes: [['Fechar', '']],
        });
      }
      /* 🔴 MESMA PORTA, CONTA NOVA = entrega indo pro cliente errado depois. A
         régua do servidor é fail-closed e mora no `mesmaPorta`: com a RUA dos
         dois lados, ela só confirma a porta se **o CEP ou a cidade baterem**.
         MEDIDO no aparelho (08/08, build publicado): eu mandava número + rua +
         bairro e NUNCA casava — cadastrei duas vezes no mesmo endereço sem um
         aviso. Bairro não entra na conta dela; o CEP é que decide. Por isso o
         aviso agora exige CEP e o manda junto: guarda que não dispara é pior
         que guarda nenhuma, porque dá sensação de conferência. */
      if (d.numero && d.rua && d.cep) {
        let repetidas = [];
        try {
          const p = new URLSearchParams({ numero: d.numero, endereco: d.rua, cep: d.cep });
          if (d.bairro) p.set('bairro', d.bairro);
          const r = await window.API.get(`/nucleo/contas/por-endereco?${p.toString()}`);
          repetidas = Array.isArray(r && r.contas) ? r.contas : [];
        } catch (_) { repetidas = []; }
        if (repetidas.length) {
          const nomes = repetidas.slice(0, 3).map((c) => esc(c.name || c.nome || '')).filter(Boolean).join(', ');
          /* O portão do mock não devolve resposta — ele FECHA. Então a segunda
             metade do caminho vira uma AÇÃO própria, e o botão a chama. Nada de
             promessa esperando um clique que pode nunca vir: portão fechado por
             fora deixaria o cadastro pendurado pra sempre. */
          return window.portao({
            tom: 'alerta', ico: 'alert', titulo: 'Já tem cliente nesta porta',
            sub: `${nomes || 'Outro cadastro'} já está neste endereço. Cadastrar de novo cria cliente repetido.`,
            acoes: [['Deixar pra lá', '', true], ['Cadastrar assim', 'principal']],
            acaoPrincipal: 'criar-cliente-assim',
          });
        }
      }
      await criarCliente(d);
    });
  }

  /** a criação de verdade — chamada direta ou depois do aviso de porta repetida */
  async function criarCliente(dado) {
    const d = dado || novoRascunho();
    if (!d.nome) return;
    window.usarDados('novocliente', { ...d, salvando: 1 });
    const corpo = { nome: d.nome, isCliente: true };
    if (d.telefone) { corpo.phone = d.telefone; corpo.whatsapp = d.telefone; }
    if (d.cep) corpo.cep = d.cep;
    if (d.rua) corpo.endereco = d.rua;
    if (d.numero) corpo.numero = d.numero;
    if (d.bairro) corpo.bairro = d.bairro;
    // cidade/UF que o CEP digitado trouxe (geo/cep): viajam junto, o cadastro
    // nasce completo sem campo novo na tela.
    if (novoCepInfo && novoCepInfo.cidade) corpo.cidade = novoCepInfo.cidade;
    if (novoCepInfo && novoCepInfo.uf) corpo.uf = novoCepInfo.uf;
    if (novoLocal) {
      corpo.lat = novoLocal.lat; corpo.lng = novoLocal.lng;
      corpo.geoFonte = 'gps_cadastro';
      if (Number.isFinite(novoLocal.precisaoM)) corpo.gpsAccuracy = novoLocal.precisaoM;
    }
    const tinhaLocal = !!novoLocal;
    let criado;
    try { criado = await window.API.post('/nucleo/contas', corpo); }
    catch (e) { window.usarDados('novocliente', { ...d, salvando: 0 }); return avisoErro(e); }
    novoEmBranco();
    await carregarClientes();
    // Cai na FICHA do cliente novo quando o servidor devolveu o id: é onde se
    // marca dia e produto, que é o passo seguinte natural de quem cadastrou.
    const id = criado && (criado.id || (criado.conta && criado.conta.id));
    // O `CLIENTES.get` que guardava esta porta caiu junto com o de dentro do
    // `abrirCliente`: cliente novo que nasce fora da página carregada (base com
    // mais de 100) caía na lista em vez da ficha dele.
    if (id) await abrirCliente(String(id));
    else window.ir('clientes');
    window.portao({
      tom: 'ok', ico: 'check', titulo: 'Cliente cadastrado',
      sub: tinhaLocal ? 'Com o local marcado na porta.' : 'Sem local marcado — dá pra marcar na primeira entrega.',
      acoes: [['Fechar', 'principal', true]],
    });
  }

  /* ==========================================================================
     PARADA AVULSA — o "+" da Montagem e da Rota (09/08, cobrança do dono:
     "cadê o + que eu adicionava uma rota avulsa, e tinha opções?").

     Ela existia no app antigo com o nome "Rota rápida" e foi apagada em 07/08
     pela regra do satélite morto, porque o MIOLO nunca tinha sido reescrito
     aqui — sobrou o ícone. Isto é o miolo. O motor no servidor ficou INTEIRO,
     e por isso esta seção não estreia endpoint nenhum:

       achar a porta   → /logistica/geo/link · /geo/cep · /geo/busca · /geo/reverse
       quem mora nela  → /nucleo/contas/por-endereco
       a conta         → POST /nucleo/contas (PATCH quando é stub de endereço)
       a entrega       → POST /logistica/entregas com `paraMinhaRota`
       o encaixe       → POST /logistica/rota/planejar com `ordemManual`

     💰 A parada é ABSORVIDA pela rota: quem cobra crédito é o Iniciar, e
     re-planejar o mesmo dia não debita de novo (claim único por
     empresa+motorista+data+bloco). Adicionar parada não gasta.
     ========================================================================== */
  let rapida = null;                 // o rascunho da tela; null = ninguém abriu

  const PAR_COORD = /(-?\d{1,2}[.,]\d{3,8})\s*,\s*(-?\d{1,3}[.,]\d{3,8})/;
  const digitos = (v) => String(v || '').replace(/\D/g, '');
  /* O `pontoOk` que morava aqui era a MESMA régua de pino com outro nome — e
     enquanto ela tinha dois nomes, a montagem foi consertada num e não no
     outro. Hoje é `pinoValido`, no topo do arquivo, para o app inteiro. */
  /** "13500-000 1067" → {cep:'13500000', numero:'1067'}. Sem CEP no texto, null. */
  function lerCepENumero(texto) {
    const t = String(texto || '');
    const cep = /(\d{5})-?(\d{3})/.exec(t);
    if (!cep) return null;
    const depois = t.slice(cep.index + cep[0].length);
    const num = /(\d{1,6})/.exec(depois) || /(\d{1,6})\s*[,-]?\s*$/.exec(t.slice(0, cep.index));
    return { cep: `${cep[1]}${cep[2]}`, numero: num ? num[1] : '' };
  }
  /* Conta SEM papel nenhum = stub de endereço (é assim que a parada "Direção"
     nasce). Quem cadastra por cima ASSUME o stub em vez de abrir linha nova. */
  const contaEhStub = (c) => !!c && !c.isCliente && !c.isLead && !c.isFornecedor;
  const nomeDaConta = (c) => (!c ? ''
    : String(c.nome || '').trim() || [c.endereco, c.numero].filter(Boolean).join(', ') || 'Cadastro sem nome');
  /* 🔴 CADASTRO NÃO ACEITA LIXO (dono, 28/07: "se a pessoa clicou em CADASTRO
     tem q cadastrar certinho, e comece a barrar lixo pra dentro do sistema").
     "1", "...", "-" não são nome. Em Direção o nome segue opcional — ali o
     pedido foi "só traçar rota mesmo, sem produto, sem valor nem nada". */
  function nomeDeCadastroValido(nome) {
    const limpo = String(nome || '').trim();
    if (limpo.length < 2) return false;
    return (limpo.match(/[a-zà-ÿ]/gi) || []).length >= 2;
  }
  /** as paradas do dia que ainda não foram resolvidas, na ordem do servidor */
  function paradasAbertas() {
    const abertas = [];
    ENTREGAS.forEach((e, id) => {
      const it = e && e.item;
      const st = String((it && it.status) || '');
      if (st !== 'entregue' && st !== 'cancelada') abertas.push({ id: String(id), item: it });
    });
    return abertas;
  }
  /* Parada ABERTA da mesma conta hoje. Entregue não conta: voltar no mesmo
     cliente depois de entregar é operação real ("esqueci o galão"). */
  const paradaAbertaDaConta = (contaId) => (!contaId ? null
    : paradasAbertas().find((p) => String((p.item && p.item.cliente && p.item.cliente.id) || '') === String(contaId)) || null);

  /* 🔴 DIREÇÃO × CADASTRO — e aqui o app novo CORRIGE o antigo. Lá, QUALQUER
     ponto resolvido virava `origem:'mapa'`, e `rapidaModo` devolvia 'direcao'
     pra todos eles: quem procurava um endereço ESCRITO e tocava em "Cadastro"
     não cadastrava nada — o botão existia e não fazia. A régua certa não é de
     onde veio o ponto, é se existe ENDEREÇO CONFERIDO pra guardar:
       · link do Maps / coordenada colada → é um PINO cru, sem endereço que a
         base possa confiar: só Direção (`soDirecao`), e a fileira nem aparece;
       · endereço escrito ou CEP+número → veio do geocodificador com rua,
         bairro e cidade: Cadastro é escolha legítima. */
  const modoDaRapida = (r) => (!r ? 'direcao'
    : (r.origem === 'ponto' ? 'direcao' : (r.modo === 'cadastro' ? 'cadastro' : 'direcao')));

  const tituloDaPorta = (res, numero) => {
    const n = digitos(numero) || String((res && res.numero) || '');
    return [String((res && res.endereco) || '').trim(), n].filter(Boolean).join(', ')
      || String((res && res.cidade) || '').trim() || 'Endereço marcado';
  };
  const detalheDaPorta = (res) => [
    String((res && res.bairro) || '').trim(),
    [String((res && res.cidade) || '').trim(), String((res && res.uf) || '').trim()].filter(Boolean).join(' — '),
  ].filter(Boolean).join(' · ');

  /** a tela nasce EM BRANCO — mesma lei do `novoEmBranco` do cadastro */
  function rapidaEmBranco(veioDe) {
    // Porta de entrada MARCADA, nunca deduzida (mesma lei do `ficha.volta`): quem
    // entrou pela Rota tem que voltar pra Rota, senão o Voltar do Android mente.
    const volta = veioDe === 'rotalista' || veioDe === 'rota' ? veioDe : 'montagem';
    rapida = {
      volta,
      origem: '',            // '' | 'ponto' | 'busca' | 'cep'
      resolvido: null, opcoes: [], duplicado: null,
      cep: '', numero: '', nome: '',
      modo: 'direcao', posicao: 'perto',
      aviso: '', buscando: false, salvando: false,
      /* A PORTA "MEUS CLIENTES" (09/08). Ela abre PRIMEIRO de propósito: a
         pergunta "quem entra na rota?" quase sempre se responde com gente que
         já está na base — digitar endereço é o caso raro, não o caminho. */
      porta: 'cadastro',
      buscaCliente: '', lista: [], escolhidos: [],
      listaCarregando: true, listaSemFonte: false,
    };
    if (typeof window.usarDados !== 'function') return;
    window.usarDados('rapida', {
      volta, busca: '', buscando: 0, salvando: 0, opcoes: [], achado: null,
      aviso: '', modo: 'direcao', soDirecao: 0, nome: '', pedeNome: 0,
      temRota: paradasAbertas().length ? 1 : 0, posicao: 'perto',
      porta: 'cadastro', buscaCliente: '', clientes: [], escolhidos: [],
      listaCarregando: 1, listaSemFonte: 0,
    });
  }

  /* A LISTA DA PORTA "MEUS CLIENTES" — mesma fonte da tela de Clientes
     (`/nucleo/clientes`, `isCliente` obrigatório: lead e fornecedor não entram
     na rota de quem vende). Fonte PRÓPRIA e bandeiras próprias: a busca de
     endereço da outra porta pode estar no chão sem apagar esta lista. */
  let clientesDaRapidaEmVoo = false;
  async function carregarClientesDaRapida() {
    const r = rapida;
    if (!r || !temPonte() || typeof window.usarDados !== 'function') return;
    if (clientesDaRapidaEmVoo) return;
    clientesDaRapidaEmVoo = true;
    try {
      const p = new URLSearchParams({ page: '1', pageSize: '100' });
      if (r.buscaCliente) p.set('query', r.buscaCliente);
      let resp;
      try { resp = await window.API.get(`/nucleo/clientes?${p.toString()}`); } catch (_) {
        if (rapida === r) { r.listaCarregando = false; r.listaSemFonte = true; publicarRapida(); }
        return;
      }
      if (rapida !== r) return;
      r.lista = (Array.isArray(resp && resp.items) ? resp.items : []).filter((c) => c && c.isCliente === true);
      r.listaCarregando = false; r.listaSemFonte = false;
      publicarRapida();
    } finally { clientesDaRapidaEmVoo = false; }
  }

  /* Publica o rascunho na tela. O que o dedo DIGITOU volta junto (`busca`,
     `nome`), pela mesma razão do `novoRascunho`: `usarDados` remonta a camada,
     e sem devolver os campos o motorista veria sumir o que acabou de escrever. */
  function publicarRapida() {
    const r = rapida;
    if (!r || typeof window.usarDados !== 'function') return;
    const res = r.resolvido;
    const modo = modoDaRapida(r);
    const vaiBatizar = !r.duplicado || contaEhStub(r.duplicado);
    window.usarDados('rapida', {
      volta: r.volta,
      busca: esc(campo('rapida-busca')),
      buscando: r.buscando ? 1 : 0,
      salvando: r.salvando ? 1 : 0,
      // lista e porta escolhida nunca convivem — quem escolheu, escolheu.
      opcoes: res ? [] : r.opcoes.map((o) => ({
        titulo: esc(o.nome || o.endereco || 'Endereço'),
        detalhe: esc(o.detalhe || detalheDaPorta(o)),
        dist: pinoValido(o.lat, o.lng) && ultimaPos
          ? emMetros(metrosEntre(ultimaPos, { lat: Number(o.lat), lng: Number(o.lng) })) : '',
      })),
      achado: res ? {
        titulo: esc(tituloDaPorta(res, r.numero)),
        detalhe: esc(detalheDaPorta(res)),
        quem: r.duplicado ? esc(nomeDaConta(r.duplicado)) : '',
      } : null,
      aviso: esc(r.aviso || ''),
      modo,
      soDirecao: r.origem === 'ponto' ? 1 : 0,
      nome: esc(campo('rapida-nome') || r.nome || ''),
      pedeNome: modo === 'cadastro' && vaiBatizar ? 1 : 0,
      temRota: paradasAbertas().length ? 1 : 0,
      posicao: r.posicao,
      /* A porta "Meus clientes" vai JUNTO em todo repinte — as duas portas são
         uma tela só, e publicar meia tela deixaria a lista sumindo cada vez que
         a busca de endereço escrevesse. */
      porta: r.porta === 'endereco' ? 'endereco' : 'cadastro',
      buscaCliente: esc(campo('rapida-cliente-busca') || r.buscaCliente || ''),
      listaCarregando: r.listaCarregando ? 1 : 0,
      listaSemFonte: r.listaSemFonte ? 1 : 0,
      escolhidos: (r.escolhidos || []).slice(),
      clientes: (r.lista || []).map((c) => ({
        id: String(c.id),
        ini: iniciais(c.name),
        nome: esc(c.name),
        endereco: [esc(c.endereco), esc(c.cidade)].filter(Boolean).join(' • '),
        // Quem já está na rota de hoje aparece marcado e DESLIGADO: a mesma
        // porta não entra 2× (o freio que o `rapidaConfirmar` já cobra), e
        // dizer isso na lista evita o toque que ia levar recusa.
        naRota: paradaAbertaDaConta(String(c.id)) ? 1 : 0,
      })),
    });
  }

  /* Um ponto vira porta: o reverse dá rua/bairro/CEP de graça. Ele é ENFEITE —
     falhar não trava nada, porque o pino sozinho já basta pra parada existir. */
  async function rapidaFixarPonto(lat, lng, rotulo, origem) {
    const r = rapida;
    if (!r) return;
    r.origem = origem; r.opcoes = [];
    if (rotulo && !String(r.nome || '').trim()) r.nome = String(rotulo).slice(0, 120);
    r.resolvido = { fonte: origem, endereco: rotulo || '', bairro: '', cidade: '', uf: '', cep: '', numero: '', lat, lng };
    let rev = null;
    try { rev = await window.API.get(`/logistica/geo/reverse?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`); }
    catch (_) { rev = null; }
    if (rapida !== r || !rev) return;
    r.resolvido = {
      fonte: origem, endereco: rev.endereco || rotulo || '', bairro: rev.bairro || '',
      cidade: rev.cidade || '', uf: rev.uf || '', cep: rev.cep || '', numero: rev.numero || '', lat, lng,
    };
    if (rev.cep) r.cep = rev.cep;
    if (rev.numero) r.numero = rev.numero;
  }

  /* 🔴 UM CAMPO SÓ, QUATRO CAMINHOS. É o conserto de 31/07 do app antigo ("criar
     uma rota simples já existe, mas tá ruim"): pedir CEP **e** número, os dois
     obrigatórios, não servia pra ir na casa de um amigo que mandou a
     localização pelo WhatsApp. Aqui o mesmo campo engole os quatro jeitos de
     dizer "é aqui" — link/coordenada, CEP com número, CEP sozinho e endereço
     escrito — e é o texto que decide qual porta do servidor atender. */
  async function rapidaBuscar() {
    const r = rapida;
    if (!r || r.buscando || r.salvando) return;
    const texto = campo('rapida-busca').trim();
    if (!texto) {
      r.aviso = 'Escreva o endereço, o CEP com número, ou cole a localização.';
      r.resolvido = null;
      return publicarRapida();
    }
    r.buscando = true; r.aviso = ''; r.duplicado = null; r.opcoes = []; r.resolvido = null;
    publicarRapida();
    try {
      const cn = lerCepENumero(texto);
      if (/https?:\/\//i.test(texto) || PAR_COORD.test(texto)) {
        // Só o SERVIDOR abre link curto do Maps: redirecionamento é rede, e o
        // WebView não segue esse salto sozinho.
        const lido = await window.API.get(`/logistica/geo/link?u=${encodeURIComponent(texto)}`);
        if (lido && pinoValido(lido.lat, lido.lng)) {
          await rapidaFixarPonto(Number(lido.lat), Number(lido.lng), String(lido.rotulo || ''), 'ponto');
        } else {
          r.aviso = 'Não consegui ler essa localização. Tente o endereço escrito.';
        }
      } else if (cn && cn.numero) {
        const res = await window.API.get(`/logistica/geo/cep?cep=${encodeURIComponent(cn.cep)}&numero=${encodeURIComponent(cn.numero)}`);
        if (res && (res.fonte === 'cnefe' || res.fonte === 'geocode' || res.endereco || res.cidade)) {
          r.origem = 'cep'; r.cep = cn.cep; r.numero = cn.numero; r.resolvido = res;
        } else {
          r.aviso = 'Não encontrei este endereço. Confira o CEP e o número.';
        }
      } else if (cn) {
        /* 🔴 CEP SEM NÚMERO NÃO É ERRO (01/08). Metade do país é S/N — posto,
           chácara, praça, comércio, estrada — e exigir número travava o
           motorista na rua, parado num lugar que número não tem. O servidor
           devolve o ponto do TRECHO; a tela avisa que é aproximado e quem
           confirma é a pessoa. */
        const res = await window.API.get(`/logistica/geo/cep?cep=${encodeURIComponent(cn.cep)}`);
        if (res && pinoValido(res.lat, res.lng)) {
          r.origem = 'cep'; r.cep = cn.cep; r.numero = ''; r.resolvido = res;
          r.aviso = 'Sem número: o ponto é o da rua. Confira antes de adicionar.';
        } else if (res && (res.endereco || res.cidade)) {
          r.aviso = `${res.endereco || 'Esta rua'} — não achei o ponto exato. Informe o número, se houver.`;
        } else {
          r.aviso = 'Não encontrei este CEP. Confira, ou escreva o endereço.';
        }
      } else {
        // Endereço escrito: o servidor devolve candidatas e QUEM ESCOLHE É ELE.
        const perto = ultimaPos && pinoValido(ultimaPos.lat, ultimaPos.lng)
          ? `&lat=${encodeURIComponent(ultimaPos.lat)}&lng=${encodeURIComponent(ultimaPos.lng)}` : '';
        const payload = await window.API.get(`/logistica/geo/busca?q=${encodeURIComponent(texto)}${perto}`);
        const itens = (payload && Array.isArray(payload.items) ? payload.items : [])
          .filter((it) => pinoValido(it.lat, it.lng)).slice(0, 4);
        if (itens.length === 1) await rapidaFixarPonto(Number(itens[0].lat), Number(itens[0].lng), String(itens[0].nome || ''), 'busca');
        else if (itens.length) r.opcoes = itens;
        else r.aviso = 'Não encontrei esse endereço.';
      }
    } catch (e) {
      r.resolvido = null;
      r.aviso = humano(e);
    }
    if (rapida !== r) return;                 // a tela trocou no meio da rede
    r.buscando = false;
    publicarRapida();
    if (r.resolvido) await rapidaCheckarPorta();
  }

  /** a candidata que o dedo escolheu vira A porta */
  async function rapidaEscolher(indice) {
    const r = rapida;
    const o = r && Array.isArray(r.opcoes) ? r.opcoes[Number(indice)] : null;
    if (!o || r.buscando || r.salvando) return;
    r.buscando = true; publicarRapida();
    await rapidaFixarPonto(Number(o.lat), Number(o.lng), String(o.nome || ''), 'busca');
    if (rapida !== r) return;
    r.buscando = false;
    publicarRapida();
    if (r.resolvido) await rapidaCheckarPorta();
  }

  /* 🔴 QUEM JÁ MORA NESTA PORTA? (dono, 28/07: "nem compara se já existe o
     endereço?"). A régua de "mesma porta" é do BACKEND e é fail-closed: na
     dúvida ele responde vazio. Best-effort — consulta que falha não trava o
     fluxo, só deixa de avisar. Sem número não dá pra perguntar: "Rua 3a" sem
     número casaria com a rua inteira. */
  async function rapidaCheckarPorta() {
    const r = rapida;
    const res = r && r.resolvido;
    if (!r || !res) return;
    const numero = digitos(r.numero) || digitos(res.numero);
    if (!numero) { r.duplicado = null; return publicarRapida(); }
    const cep = digitos(r.cep) || digitos(res.cep);
    const q = [`numero=${encodeURIComponent(numero)}`];
    if (cep.length === 8) q.push(`cep=${encodeURIComponent(cep)}`);
    if (res.endereco) q.push(`endereco=${encodeURIComponent(res.endereco)}`);
    if (res.bairro) q.push(`bairro=${encodeURIComponent(res.bairro)}`);
    if (res.cidade) q.push(`cidade=${encodeURIComponent(res.cidade)}`);
    if (res.uf) q.push(`uf=${encodeURIComponent(res.uf)}`);
    let achada = null;
    try {
      const resp = await window.API.get(`/nucleo/contas/por-endereco?${q.join('&')}`);
      achada = resp && Array.isArray(resp.contas) ? resp.contas[0] : null;
    } catch (_) { achada = null; }
    if (rapida !== r) return;
    r.duplicado = achada || null;
    publicarRapida();
  }

