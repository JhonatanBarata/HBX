
  /* ==========================================================================
     EMPRESAS — a carteira (a base PJ do tenant) e a FICHA de uma delas.

     TRÊS PORTAS:
       GET  /nucleo/empresas?query=&uf=&page=&pageSize=   → a lista paginada
       GET  /nucleo/empresas/:id                          → a ficha + as pessoas
       POST /vendas/manual                                → vira lead e abre a conversa

     🔴 PAGINAÇÃO CONCATENA, NUNCA SUBSTITUI. "Carregar mais" que troca a página
     joga fora o que a pessoa já rolou: ela toca esperando ver MAIS e vê OUTRAS,
     com o dedo no meio da lista. A página 1 é a única que recomeça a lista — e
     ela recomeça sempre que o filtro muda, porque aí o conjunto é outro.

     🔴 OS CHIPS DE UF SÃO DA PONTE, não da API. O `listEmpresas` não devolve
     faceta nenhuma; 27 siglas chutadas na casca seriam filtro prometendo base
     que não existe (o desenho já some com a fileira quando `ufs` vem vazio).
     Aqui eles nascem do que JÁ CHEGOU — e nunca encolhem, senão o chip somiria
     debaixo do dedo justamente quando ele acabou de filtrar por ele.

     🔴 404 NA FICHA NÃO É "NÃO CONSEGUI CARREGAR". O controller do núcleo
     responde 404 tanto pra conta inexistente quanto pra conta de OUTRO tenant
     (de propósito: 403 vazaria a existência do registro). Nos dois casos a
     resposta certa não é uma ficha vazia com "não informado" em toda linha —
     isso lê como app quebrado. É voltar pra lista e dizer o que houve.
     ========================================================================== */

  const TAMANHO_DA_PAGINA_DA_CARTEIRA = 30;    // o mesmo default do servidor: página curta rola rápido

  let empresasVez = 0;             // ficha de corrida: resposta atrasada de filtro velho é ignorada
  let empresasCrua = [];           // o acumulado CRU das páginas (o `esc` é só pra pintar)
  let empresasPagina = 1;
  const ufsVistasNaCarteira = new Set();
  let fichaDaEmpresaCrua = null;            // a resposta CRUA da ficha — é dela que sai o POST
  let empresaMandando = false;       // reentrância do "Mandar pra Vendas"

  /* 🔴 A FICHA NASCE VAZIA A CADA ABERTURA, E ZERA INTEIRA. O que a ponte não
     escreve FICA: sem esta limpeza, abrir a segunda empresa mostraria o nome
     dela com o TELEFONE da primeira até a resposta chegar — e esta tela termina
     em "Falar no WhatsApp". A lista é a mesma do `apagarDemonstracao`; ela mora
     aqui de novo porque aquilo é a faxina do BOOT, e esta é a de cada toque. */
  const FICHA_DE_EMPRESA_ZERADA = {
    id: '', ini: '', nome: '', cnpj: '', documento: '', cidade: '', uf: '',
    endereco: '', numero: '', cep: '', pino: '', telefone: '', email: '',
    origem: '', desde: '', cliente: 0, lead: 0, fornecedor: 0,
    leadId: '', mandando: 0, contatos: [],
  };

  /** "00.000.000/0001-01" — 14 dígitos ou nada. O que não for CNPJ volta como
   *  veio: máscara aplicada a número torto escreve um documento que não existe. */
  const cnpjDaCarteira = (bruto) => {
    const d = String(bruto || '').replace(/\D/g, '');
    if (d.length !== 14) return String(bruto || '');
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  };
  const cepDaCarteira = (bruto) => {
    const d = String(bruto || '').replace(/\D/g, '');
    return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : String(bruto || '');
  };
  /** "03/2026" — o mês em que a conta entrou na carteira, no fuso da operação. */
  const mesNaCarteira = (iso) => {
    const ymd = diaEmSp(iso);
    return ymd ? `${ymd.slice(5, 7)}/${ymd.slice(0, 4)}` : '';
  };

  const filtroDaCarteira = () => {
    let d = {};
    try { d = DADOS.empresas || {}; } catch (_) { d = {}; }
    return { busca: String(d.busca || '').trim(), uf: String(d.ufSel || '').trim().toUpperCase() };
  };

  function traduzirEmpresaDaCarteira(e) {
    const x = e || {};
    const nome = String(x.name || '').trim();
    return {
      id: String(x.id || ''),
      ini: esc(iniciais(nome)),
      nome: esc(nome),
      // a segunda linha é composta pela TELA (ela sabe dizer "sem CNPJ e sem
      // cidade" quando faltam os dois); aqui cada pedaço vai inteiro ou vazio
      cnpj: esc(cnpjDaCarteira(x.cnpj)),
      cidade: esc(String(x.cidade || '').trim()),
      uf: esc(String(x.uf || '').trim()),
      cliente: x.isCliente ? 1 : 0,
      lead: x.isLead ? 1 : 0,
      fornecedor: x.isFornecedor ? 1 : 0,
      contatos: Math.max(0, Math.trunc(Number(x.contatosCount) || 0)),
      origem: esc(String(x.origin || '').trim()),
    };
  }

  /**
   * `pagina > 1` CONCATENA; qualquer outra coisa recomeça a lista.
   * Toda chamada carimba uma vez (`empresasVez`): a resposta de um filtro que a
   * pessoa já trocou chega depois e seria a lista errada com o chip certo aceso
   * — o defeito que parece "o filtro não funciona" e é só uma corrida perdida.
   */
  function carregarEmpresas(pagina) {
    if (!temPonte()) return Promise.resolve();
    const alvo = Math.max(1, Math.trunc(Number(pagina) || 1));
    const mais = alvo > 1;
    const f = filtroDaCarteira();
    const vez = ++empresasVez;

    if (mais) usar('empresas', { carregandoMais: 1 });
    const q = [`page=${alvo}`, `pageSize=${TAMANHO_DA_PAGINA_DA_CARTEIRA}`];
    if (f.busca) q.push(`query=${encodeURIComponent(f.busca)}`);
    if (f.uf) q.push(`uf=${encodeURIComponent(f.uf)}`);

    return window.API.get(`/nucleo/empresas?${q.join('&')}`).then((r) => {
      if (vez !== empresasVez) return;                 // filtro velho: a resposta não vale mais
      if (!r || !Array.isArray(r.items)) { fonteCaiu('empresas'); return; }
      empresasCrua = mais ? empresasCrua.concat(r.items) : r.items.slice();
      empresasPagina = Math.max(1, Math.trunc(Number(r.page) || alvo));
      r.items.forEach((e) => {
        const uf = String((e && e.uf) || '').trim().toUpperCase();
        if (uf) ufsVistasNaCarteira.add(uf);
      });
      usar('empresas', Object.assign({}, fonteVoltou, {
        lista: empresasCrua.map(traduzirEmpresaDaCarteira),
        ufs: Array.from(ufsVistasNaCarteira).sort(),
        /* `total` e `totalPaginas` são do SERVIDOR, nunca `lista.length`: somar
           a página na mão é como lista paginada mente ("30 na carteira" com 128
           lá dentro). O rodapé mostra os dois números de propósito — um é a
           carteira, o outro é o que coube nesta tela. */
        total: String(Math.max(0, Math.trunc(Number(r.total) || 0))),
        pagina: empresasPagina,
        totalPaginas: Math.max(1, Math.trunc(Number(r.totalPages) || 1)),
        carregandoMais: 0,
      }));
    }).catch((e) => {
      if (vez !== empresasVez) return;
      // O "Carregar mais" que falhou solta o botão ANTES do aviso: botão preso
      // em "Carregando…" pra sempre é o defeito que a pessoa resolve fechando o app.
      usar('empresas', { carregandoMais: 0 });
      fonteCaiu('empresas', e);
    });
  }

  /* Filtro novo = lista nova. O esqueleto volta porque o conjunto vai mudar
     inteiro — sem ele a lista antiga fica de pé mentindo até a resposta. */
  function refiltrarCarteira() {
    usar('empresas', { carregando: true, semFonte: false, carregandoMais: 0 });
    empresasCrua = [];
    return carregarEmpresas(1);
  }

  /* ------------------------------------------------------------------------
     A FICHA.
     ------------------------------------------------------------------------ */
  function traduzirPessoaDaEmpresa(c) {
    const x = c || {};
    /* PODE FALAR é DERIVADO do que existe (WhatsApp ou telefone), nunca uma
       bandeira que a ponte liga na mão — bandeira paralela ao dado é como as
       duas discordam. O desenho usa isso pra decidir se a linha é clicável. */
    const fone = telefoneBonito(x.whatsapp || x.phone);
    const partes = [String(x.cargo || '').trim(), fone || 'sem WhatsApp'].filter(Boolean);
    return {
      id: String(x.id || ''),
      ini: esc(iniciais(x.nome)),
      nome: esc(String(x.nome || '').trim()),
      sub: esc(partes.join(' · ')),
      principal: x.isPrincipal ? 1 : 0,
      podeFalar: (x.whatsapp || x.phone) ? 1 : 0,
    };
  }

  function vestirFichaDaEmpresa(e) {
    fichaDaEmpresaCrua = e;
    const contatos = Array.isArray(e && e.contatos) ? e.contatos : [];
    usar('empresaficha', Object.assign({}, fonteVoltou, {
      id: String(e.id || ''),
      ini: esc(iniciais(e.name)),
      nome: esc(String(e.name || '').trim()),
      cnpj: esc(cnpjDaCarteira(e.cnpj)),
      documento: esc(String(e.document || '').trim()),
      cidade: esc(String(e.cidade || '').trim()),
      uf: esc(String(e.uf || '').trim()),
      endereco: esc(String(e.endereco || '').trim()),
      numero: esc(String(e.numero || '').trim()),
      cep: esc(cepDaCarteira(e.cep)),
      /* `pino` é COPY curta feita a partir de lat/lng — a ficha não desenha
         mapa (este app não tem tela de mapa, e botão que abre o nada é o botão
         morto que esta casa já matou três vezes). Sem coordenada, a linha some:
         "local não confirmado" seria alarme sobre uma ausência banal. */
      pino: (e.lat != null && e.lng != null) ? 'coordenada confirmada' : '',
      telefone: esc(telefoneBonito(e.phone)),
      email: esc(String(e.email || '').trim()),
      origem: esc(String(e.origin || '').trim()),
      desde: mesNaCarteira(e.createdAt),
      cliente: e.isCliente ? 1 : 0,
      lead: e.isLead ? 1 : 0,
      fornecedor: e.isFornecedor ? 1 : 0,
      /* 🔴 `leadId` VAZIO NÃO É ESQUECIMENTO: a porta do núcleo é de CADASTRO e
         não devolve o vínculo com o funil (a conversa é por LEAD, não por
         conta). Vazio é a verdade que o servidor contou, e o desenho já
         responde a ela com o verbo certo — "Mandar pra Vendas", que CRIA o
         vínculo. Chutar um id aqui abriria uma conversa com o lead errado. */
      leadId: '',
      mandando: 0,
      contatos: contatos.map(traduzirPessoaDaEmpresa),
    }));
  }

  function fichaDaEmpresaSumiu() {
    let volta = 'empresas';
    try { volta = String((DADOS.empresaficha && DADOS.empresaficha.volta) || 'empresas'); } catch (_) {}
    // Sai da ficha ANTES de falar: cena própria quer dizer que a tela vazia
    // nunca chega a existir — a pessoa volta pra lista, que é o que vale.
    if (typeof window.ir === 'function') window.ir(volta);
    if (typeof window.portao !== 'function') return;
    window.portao({
      tom: 'alerta', ico: 'store', titulo: 'Empresa não encontrada',
      sub: 'Ela saiu da carteira da sua empresa (ou nunca foi dela). A lista aqui atrás é a que vale.',
      acoes: [['Entendi', 'principal', true]],
    });
  }

  function carregarFichaDaEmpresa() {
    if (!temPonte()) return Promise.resolve();
    let id = '';
    try { id = String((DADOS.empresaficha && DADOS.empresaficha.id) || ''); } catch (_) {}
    if (!id) return Promise.resolve();
    return window.API.get(`/nucleo/empresas/${encodeURIComponent(id)}`).then((e) => {
      if (!e || !e.id) { fonteCaiu('empresaficha'); return; }
      vestirFichaDaEmpresa(e);
    }).catch((erro) => {
      if (erro && erro.status === 404) { fichaDaEmpresaSumiu(); return; }
      fonteCaiu('empresaficha', erro);
    });
  }

  function abrirFichaDaEmpresa(id, volta) {
    if (!id) return;
    fichaDaEmpresaCrua = null;
    usar('empresaficha', Object.assign({}, FICHA_DE_EMPRESA_ZERADA, {
      id, volta: volta || 'empresas', carregando: true, semFonte: false,
    }));
    if (typeof window.ir === 'function') window.ir('empresaficha');
  }

  /* ------------------------------------------------------------------------
     A PORTA PRA CONVERSA — o centro desta tela.
     ------------------------------------------------------------------------ */

  /* 🔴 A PORTA DA CONVERSA TEM UM DONO SÓ, E NÃO É ESTE ARQUIVO. Quem abre um
     lead é o módulo da conversa (`abrir-lead`, em `50-conversas.js`): é lá que
     mora o estado do fio (qual lead está aberto, o rascunho, as mensagens
     cruas), e reescrever a abertura aqui seria a SEGUNDA cópia da mesma cena —
     a que ficar pra trás no dia em que o cabeçalho mudar é a que mente. Pior:
     escrever só no seam e chamar `ir('conversas')` abriria a tela com "Abra um
     lead no Funil para conversar aqui", porque quem manda lá é a variável do
     módulo, não o `DADOS`.

     Então esta função só resolve o NÓ que aquele dono espera — ele lê
     `dataset.lead` e faz o resto: limpa o lead anterior, pinta o cabeçalho,
     navega, e diz a frase certa quando o admin desligou o módulo Conversas. O
     `volta` sai de graça e certo: ele carimba a tela de onde o dedo veio, que
     aqui é a ficha da empresa. */
  function abrirConversaVindaDaCarteira(no, leadId) {
    const id = String(leadId || '').trim();
    if (!id) return;
    const alvo = (no && no.dataset) ? no : document.createElement('button');
    alvo.dataset.lead = id;
    abrirConversaDoLead(alvo);
  }

  /* Um e-mail torto derruba o POST INTEIRO (`@IsEmail` no DTO) e a pessoa
     perderia a criação do lead por causa de um campo que nem é obrigatório.
     Manda só o que tem cara de e-mail; o resto viaja sem ele. */
  const emailQueOServidorAceita = (v) => {
    const e = String(v || '').trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? e : '';
  };

  /**
   * Cria o lead a partir da FICHA CRUA (nunca do seam: lá o texto já passou pelo
   * `esc()`, e gravar "BAR &amp; CIA" no funil é um nome errado pra sempre) e só
   * então abre a conversa. `telefone` opcional troca o número da conta pelo da
   * pessoa que o dedo escolheu.
   */
  function mandarEmpresaParaVendas(el, telefone) {
    if (!temPonte()) return;
    if (empresaMandando) return;
    if (!fichaDaEmpresaCrua) { avisoErro(new Error('A ficha ainda não terminou de carregar.')); return; }

    const contatos = Array.isArray(fichaDaEmpresaCrua.contatos) ? fichaDaEmpresaCrua.contatos : [];
    const doContato = contatos.map((c) => (c && (c.whatsapp || c.phone)) || '').filter(Boolean)[0] || '';
    const fone = String(telefone || fichaDaEmpresaCrua.phone || doContato || '').trim();
    const nome = String(fichaDaEmpresaCrua.name || '').trim();
    const email = emailQueOServidorAceita(fichaDaEmpresaCrua.email);
    if (!nome && !fone && !email) {
      avisoErro(new Error('Esta empresa não tem nome, telefone nem e-mail — não há o que mandar pra Vendas.'));
      return;
    }

    empresaMandando = true;
    // O "aguarde" entra no MESMO quadro do dedo, no nó tocado — e o seam faz o
    // rótulo do botão virar "Mandando…" pra quem estiver olhando o repinte.
    if (el) { el.setAttribute('aria-busy', 'true'); el.classList.add('aguarde'); if ('disabled' in el) el.disabled = true; }
    usar('empresaficha', { mandando: 1 });

    const corpo = {
      name: nome || undefined,
      phone: fone ? fone.slice(0, 24) : undefined,
      address: [fichaDaEmpresaCrua.endereco, fichaDaEmpresaCrua.numero, fichaDaEmpresaCrua.cidade, fichaDaEmpresaCrua.uf]
        .map((p) => String(p || '').trim()).filter(Boolean).join(', ').slice(0, 280) || undefined,
    };
    if (email) corpo.email = email;

    window.API.post('/vendas/manual', corpo).then((r) => {
      const leadId = String((r && r.lead && r.lead.id) || '');
      usar('empresaficha', { mandando: 0, leadId, lead: 1 });
      if (!leadId) {
        // O servidor confirmou sem dizer QUEM nasceu: abrir a conversa de um id
        // vazio seria uma tela em branco com cara de travamento.
        avisoErro(new Error('O lead foi criado, mas o servidor não devolveu o número dele. Ele já está no funil.'));
        return;
      }
      abrirConversaVindaDaCarteira(el, leadId);
    }).catch((erro) => {
      usar('empresaficha', { mandando: 0 });
      avisoErro(erro);
    }).finally(() => {
      empresaMandando = false;
      if (el) { el.removeAttribute('aria-busy'); el.classList.remove('aguarde'); }
    });
  }

  /* ------------------------------------------------------------------------
     OS REGISTROS.
     ------------------------------------------------------------------------ */
  registrarTelas({
    /* Entrar na carteira relê a PÁGINA 1 — e as páginas extras que a pessoa
       tinha carregado não voltam. É de propósito: a alternativa seria refazer N
       requisições pra reconstruir uma rolagem que o celular já perdeu de
       qualquer jeito, ou mostrar dado velho de quando ela saiu. Voltar da ficha
       de uma empresa que acabou de virar lead tem que mostrar o selo novo. */
    empresas: () => carregarEmpresas(1),
    empresaficha: carregarFichaDaEmpresa,
  });

  registrarAcoes({
    'abrir-empresa': (el) => abrirFichaDaEmpresa(String((el.dataset && el.dataset.empresa) || ''), 'empresas'),
    'recarregar-empresas': () => retentar('empresas', () => carregarEmpresas(1)),
    'recarregar-empresa': () => retentar('empresaficha', carregarFichaDaEmpresa),

    'empresa-uf': (el) => {
      const uf = String((el.dataset && el.dataset.uf) || '').trim().toUpperCase();
      let atual = '';
      try { atual = String((DADOS.empresas && DADOS.empresas.ufSel) || ''); } catch (_) {}
      if (uf === atual) return;                       // tocar no chip aceso não repete a busca
      usar('empresas', { ufSel: uf });
      refiltrarCarteira();
    },
    'empresas-limpar': () => {
      usar('empresas', { busca: '', ufSel: '' });
      refiltrarCarteira();
    },
    'empresas-mais': () => {
      let d = {};
      try { d = DADOS.empresas || {}; } catch (_) { d = {}; }
      // Um toque, uma página: o botão já está em "Carregando…" e o segundo toque
      // duplicaria a MESMA página no meio da lista.
      if (d.carregandoMais) return;
      if (Number(d.pagina || 1) >= Number(d.totalPaginas || 1)) return;
      carregarEmpresas(Number(d.pagina || 1) + 1);
    },

    // Já é lead: a conversa está a um toque, sem criar nada e sem cobrar nada.
    'abrir-conversa-empresa': (el) => abrirConversaVindaDaCarteira(el, String((el.dataset && el.dataset.lead) || '')),
    'mandar-para-vendas': (el) => mandarEmpresaParaVendas(el, ''),

    /* Tocar na PESSOA é o mesmo destino com outro número: falar com a empresa
       POR ELA. Se a conta já virou lead, abre a conversa; se não, ela nasce com
       o telefone desta pessoa — que é justamente por onde o dedo escolheu
       falar. Nunca um segundo lead por contato: a conversa é da EMPRESA. */
    'falar-contato': (el) => {
      const id = String((el.dataset && el.dataset.contato) || '');
      let leadId = '';
      try { leadId = String((DADOS.empresaficha && DADOS.empresaficha.leadId) || ''); } catch (_) {}
      if (leadId) { abrirConversaVindaDaCarteira(el, leadId); return; }
      const contatos = Array.isArray(fichaDaEmpresaCrua && fichaDaEmpresaCrua.contatos) ? fichaDaEmpresaCrua.contatos : [];
      const pessoa = contatos.find((c) => String((c && c.id) || '') === id);
      const fone = String((pessoa && (pessoa.whatsapp || pessoa.phone)) || '').trim();
      if (!fone) return;                              // o desenho só marca quem TEM por onde falar
      mandarEmpresaParaVendas(el, fone);
    },
  });

  registrarCampos({
    /* 🔴 ESTA BUSCA VAI AO SERVIDOR — e é por isso que ela espera mais que a do
       funil (180 ms lá, porque lá o filtro é local e só custa um repinte). Aqui
       cada letra sem respiro seria uma varredura de CustomerProfile por tecla:
       "distribuidora" são 13 consultas na base inteira do tenant. 320 ms é o
       tempo de tirar o dedo da tecla; o caret sobrevive porque a casca mede e
       devolve o foco. */
    'busca-empresa': {
      espera: 320,
      ao: (valor) => {
        let antes = '';
        try { antes = String((DADOS.empresas && DADOS.empresas.busca) || ''); } catch (_) {}
        if (String(valor || '') === antes) return;
        usar('empresas', { busca: valor });
        refiltrarCarteira();
      },
    },
  });
