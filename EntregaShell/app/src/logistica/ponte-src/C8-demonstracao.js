
  /* ══════════════════════════════════════════════════════════════════════════
     MODO DEMONSTRAÇÃO — o app CHEIO, no bairro de quem abriu, sem uma linha
     no servidor (17/08/2026, ordem do dono).

     A encomenda: *"novo cliente normalmente vai ter dificuldades para entender
     clientes e tals, e eu queria demonstrar ao instalar o app com clientes de
     vdd e possibilidade de montar rota (…) DEMO RELIGÁVEL, e todos clientes
     aproveitam da mesma (assim não lota de lixo o server) — porém tem q adaptar
     o endereço"*.

     ┌────────────────────────────────────────────────────────────────────────┐
     │ 🔴 A DEMONSTRAÇÃO NÃO NASCE NO SERVIDOR. Ela nasce AQUI, na memória do  │
     │ aparelho, e o servidor nunca fica sabendo que ela existiu.              │
     └────────────────────────────────────────────────────────────────────────┘

     Por que assim, e não com um tenant ou registros de exemplo no banco:

     · CUSTO ZERO. Dez mil aparelhos abrindo a demonstração ao mesmo tempo =
       zero INSERT, zero tabela, zero migration, zero query. O dono pediu
       explicitamente "sem REBENTAR o servidor" — este é o único desenho em que
       a conta não cresce com o número de clientes.
     · "AO FECHAR ELE DELETA?" — NÃO TEM O QUE DELETAR. Nada foi criado. Sair da
       demonstração é `apagarDemonstracao()` (a rotina que o boot já roda desde
       sempre) mais uma recarga: o seam volta ao estado de app vazio porque ele
       nunca deixou de ser. Sem vestígio é PROPRIEDADE DA CONSTRUÇÃO, não uma
       faxina que alguém precisa lembrar de rodar — a mesma lei do anexo de
       recado que se nega ("negar não limpa nada porque nada foi criado").
     · "TODOS APROVEITAM DA MESMA" — é o mesmo arquivo dentro do mesmo APK.
       Literalmente a mesma; o que muda por aparelho é só a ÂNCORA (o GPS).

     🔴 COMO O SERVIDOR FALSO FUNCIONA, E POR QUE ELE É UM SÓ. A interceptação
     mora num ponto único — `chamar()`, no núcleo — e responde no CONTRATO do
     backend, não no formato da tela. Isso não é detalhe: significa que os
     carregadores de verdade (`carregarRota`, `encherMontagem`, `carregarClientes`,
     …) rodam INTEIROS, traduzem e pintam sem saber que estão numa demonstração.
     Montar rota, iniciar, arrastar cartão, abrir a folha da chegada — tudo pelo
     caminho real. Escrever direto no seam pintaria as telas e deixaria todo
     verbo morto: o dono pediu "possibilidade de montar rota", e rota que não
     monta é foto, não demonstração.

     🔴 E É A MESMA LINHA QUE SERVE DE TRAVA. Com a demonstração no ar NENHUM
     POST/PATCH/DELETE alcança a rede — nem o `rota/iniciar`, que DEBITA CRÉDITO.
     Um cliente conhecendo o app não pode gastar dinheiro de verdade pra ver a
     tela mexer. A trava não é uma lista de verbos que alguém lembrou de barrar
     (essa lista sempre esquece um): é o cano inteiro fechado, e o que passa é o
     que esta tabela devolve.

     🔴 O ENDEREÇO É ANCORADO, NUNCA INVENTADO. Cada cliente do molde guarda um
     deslocamento em METROS (dx/dy), não uma coordenada — a coordenada nasce
     quando a demonstração abre, somando o deslocamento ao GPS de quem abriu. O
     desenho da rota é sempre o mesmo (é o que faz "todos aproveitarem da
     mesma"); o LUGAR é de quem está olhando. E o texto da linha não inventa rua
     nenhuma: nasce com a distância honesta ("a 700 m · norte") e só vira nome
     de rua de verdade quando o mapa já tem o tile na mão (`ruaDoTile`), que é
     leitura do que JÁ foi baixado pra desenhar — zero rede a mais.

     🔴 SEM GPS NÃO HÁ DEMONSTRAÇÃO. Ancorar num ponto qualquer poria a rota do
     cliente de Manaus em São Paulo — pior que não ter demonstração nenhuma,
     porque a primeira impressão do app passa a ser um endereço que não existe
     pra ele. Sem fix, o cartão da tela Tutorial nem aparece (`demoDisponivel`).
     ══════════════════════════════════════════════════════════════════════════ */

  /** a demonstração está no ar NESTA sessão (nunca no aparelho — ver abaixo) */
  let demoNoAr = false;
  /** o que a demonstração já mexeu: some inteiro quando ela fecha */
  let demoEstado = null;

  /* 🔴 A DEMONSTRAÇÃO NÃO SOBREVIVE AO FECHAMENTO DO APP, DE PROPÓSITO. Gravar
     "estou em demonstração" no aparelho cria o pior estado possível: o cliente
     cadastra os clientes de verdade, abre o app no dia seguinte e vê os de
     mentira — com a chave escondida num canto que ele não sabe que existe. O
     que É do aparelho é o contrário disto: se ele JÁ VIU a demonstração, pra ela
     não se oferecer sozinha uma segunda vez. Religar continua a um toque, na
     tela Tutorial (o dono pediu religável, e religável é um botão, não um
     estado grudado). */
  const DEMO_VISTA = 'demo-vista';
  const demoJaVista = () => {
    try { return !!(window.HBX && window.HBX.cache && window.HBX.cache.get(DEMO_VISTA, 0)); } catch (_) { return false; }
  };
  const marcarDemoVista = () => {
    try { if (window.HBX && window.HBX.cache) window.HBX.cache.set(DEMO_VISTA, 1); } catch (_) { /* sem cache */ }
  };

  /** o ponto onde a demonstração se ancora — só o GPS de verdade serve */
  function ancoraDemo() {
    const eu = ultimaPos || ultimoFix;
    return (eu && pinoValido(eu.lat, eu.lng)) ? { lat: Number(eu.lat), lng: Number(eu.lng) } : null;
  }

  /* ------------------------------------------------------------------------
     O MOLDE — oito clientes, um dia de trabalho.

     Os nomes são os que o dono cravou ("Cliente 1, 2, 3… Produto 1, 2, 3, não
     crie nomes, nem produtos, nem fale de água ou gás"): a demonstração serve
     distribuidora, padaria, gráfica ou lavanderia sem prometer nada do ramo
     errado. `dx`/`dy` são METROS a leste e ao norte da âncora — um circuito de
     ~4 km que cabe numa tela de mapa e parece um dia real de rua, não oito
     pinos empilhados na mesma esquina.
     ------------------------------------------------------------------------ */
  const DEMO_PRODUTOS = [
    { id: 'demo-p1', nome: 'Produto 1', valorUnit: 21, unidade: 'unidade' },
    { id: 'demo-p2', nome: 'Produto 2', valorUnit: 24, unidade: 'unidade' },
    { id: 'demo-p3', nome: 'Produto 3', valorUnit: 12, unidade: 'unidade' },
  ];
  const DEMO_MOLDE = [
    { dx: -260, dy: 340, qtd: 2, p: 0, obs: 'Portão azul · deixar na área' },
    { dx: 420, dy: 610, qtd: 4, p: 0, obs: '' },
    { dx: 980, dy: 240, qtd: 1, p: 1, obs: '' },
    { dx: 1240, dy: -380, qtd: 2, p: 0, obs: 'Tocar a campainha do fundo' },
    { dx: 640, dy: -880, qtd: 3, p: 2, obs: '' },
    { dx: -180, dy: -1020, qtd: 4, p: 0, obs: '' },
    { dx: -820, dy: -520, qtd: 2, p: 1, obs: '' },
    { dx: -1100, dy: 180, qtd: 6, p: 0, obs: 'Entregar até as 11h' },
  ];

  /* Metros → grau. A latitude é constante; a longitude encolhe com o cosseno da
     latitude, e ignorar isso entorta o circuito quanto mais longe do Equador
     (em Porto Alegre daria ~25% de erro no eixo leste-oeste). */
  const M_POR_GRAU = 111320;
  function deslocar(base, dx, dy) {
    const lat = base.lat + (dy / M_POR_GRAU);
    const cos = Math.cos((base.lat * Math.PI) / 180) || 1;
    return { lat, lng: base.lng + (dx / (M_POR_GRAU * cos)) };
  }

  const RUMOS = ['norte', 'nordeste', 'leste', 'sudeste', 'sul', 'sudoeste', 'oeste', 'noroeste'];
  /** "a 700 m · norte" — a linha honesta de quem ainda não tem nome de rua */
  function linhaDoRumo(dx, dy) {
    const m = Math.round(Math.hypot(dx, dy));
    const dist = m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${m} m`;
    const ang = (Math.atan2(dx, dy) * 180) / Math.PI;
    return `a ${dist} · ${RUMOS[(Math.round(((ang + 360) % 360) / 45)) % 8]}`;
  }

  /* 🔴 A RUA DE VERDADE SAI DO TILE QUE O MAPA JÁ BAIXOU. `queryRenderedFeatures`
     lê o que está DESENHADO na tela — o basemap já foi buscado pra pintar o
     mapa, então o nome sai de graça. Nenhuma chamada nova, nenhum geocoder,
     nenhuma chave de API. Se não houver mapa vivo, tile carregado ou camada com
     nome, devolve vazio e a linha do rumo continua valendo: inventar rua é
     exatamente o que esta função existe pra não fazer. */
  function ruaDoTile(lat, lng) {
    try {
      const casa = (typeof GARAGEM !== 'undefined' && GARAGEM.length) ? GARAGEM[GARAGEM.length - 1] : null;
      const mapa = casa && casa.mapa;
      if (!mapa || typeof mapa.queryRenderedFeatures !== 'function') return '';
      const p = mapa.project([lng, lat]);
      const caixa = [[p.x - 28, p.y - 28], [p.x + 28, p.y + 28]];
      const achados = mapa.queryRenderedFeatures(caixa) || [];
      for (let i = 0; i < achados.length; i += 1) {
        const f = achados[i];
        const props = (f && f.properties) || {};
        const nome = props.name || props['name:pt'];
        /* `class` de rua no estilo do basemap; sem ela, qualquer polígono com
           nome (um parque, um bairro, um município) viraria "endereço" — que é
           mentira com cara de dado. */
        const cls = String(props.class || props.subclass || '');
        if (nome && /street|motorway|trunk|primary|secondary|tertiary|residential|service|road|path/i.test(cls)) {
          return String(nome);
        }
      }
    } catch (_) { /* mapa fora de cena, estilo ainda carregando */ }
    return '';
  }

  /** o dia inteiro da demonstração, já ancorado. Uma vez por abertura. */
  function montarDiaDemo(base) {
    return DEMO_MOLDE.map((m, i) => {
      const p = deslocar(base, m.dx, m.dy);
      const prod = DEMO_PRODUTOS[m.p];
      const rua = ruaDoTile(p.lat, p.lng);
      return {
        id: `demo-e${i + 1}`,
        customerProfileId: `demo-c${i + 1}`,
        nome: `Cliente ${i + 1}`,
        lat: p.lat,
        lng: p.lng,
        /* Com rua do tile o número vem do MOLDE, e ele não é o número de
           ninguém: é o deslocamento virado em dígito, então nunca cai na casa
           de uma pessoa de verdade a ponto de alguém bater lá. */
        enderecoLinha: rua ? `${rua}, ${100 + (i * 37)}` : linhaDoRumo(m.dx, m.dy),
        bairro: rua ? '' : 'perto de você',
        observacoes: m.obs,
        quantidade: m.qtd,
        valorHoje: prod.valorUnit * m.qtd,
        produto: prod,
        status: 'pendente',
      };
    });
  }

  /* ------------------------------------------------------------------------
     O SERVIDOR FALSO.

     Cada entrada responde no contrato do BACKEND (o que o carregador de verdade
     espera receber), e é só isso que precisa estar certo aqui — a tradução, a
     ordem, o desenho e as regras continuam sendo os do app.

     Endpoint sem entrada nesta tabela devolve `null`, que todo carregador desta
     casa já trata como "sem fonte" (é lei antiga: ausente ≠ vazio, e nenhuma
     tela quebra por uma porta que não respondeu). Isso é de propósito: uma
     demonstração que precisasse conhecer as 60 portas do app envelheceria mal e
     mentiria na primeira porta nova.
     ------------------------------------------------------------------------ */
  function respostaDemo(metodo, caminho) {
    const via = String(caminho || '').split('?')[0];
    const e = demoEstado;
    if (!e) return null;

    // ── as portas que enchem as telas ───────────────────────────────────────
    if (metodo === 'GET' && via === '/logistica/config') {
      return {
        empresaNome: 'Sua Empresa',
        moduloFinanceiroAtivo: true,
        aceitaNaHora: true,
        aceitaMensal: false,
        aceitaFiado: false,
        cobrancaSimples: false,
        precoPorClienteAtivo: false,
        avisoChegandoEnabled: false,
        avisoChegandoDistanciaM: 500,
        raioChegadaM: 60,
        /* O prospector fica FORA da demonstração: ele cobra crédito por lead e
           é o único recurso do app cuja aula termina em "isso custa dinheiro".
           Ensinar a gastar antes de a pessoa ter um cliente é a ordem errada. */
        prospectorAtivo: false,
        prospectorDisponivel: false,
        prospectorEquipe: false,
        appModulosDesativados: '',
      };
    }
    if (metodo === 'GET' && via === '/logistica/rota') {
      return {
        date: e.dia,
        routeStatus: e.routeStatus,
        moduloFinanceiroAtivo: true,
        avisoChegandoAtivo: false,
        items: e.itens.map((it, i) => ({
          id: it.id,
          status: it.status,
          mapStatus: '',
          rotaOrdem: i,
          quantidade: it.quantidade,
          valorHoje: it.valorHoje,
          arrivedAt: null,
          legDistanceM: i > 0 ? 600 + (i * 210) : null,
          legDurationS: i > 0 ? 180 + (i * 60) : null,
          semCoordenada: false,
          cliente: {
            id: it.customerProfileId,
            nome: it.nome,
            enderecoLinha: it.enderecoLinha,
            bairro: it.bairro,
            cidade: '',
            lat: it.lat,
            lng: it.lng,
            observacoes: it.observacoes,
          },
        })),
      };
    }
    if (metodo === 'GET' && via === '/logistica/dia-preview') {
      return {
        clientes: e.itens.map((it) => ({
          customerProfileId: it.customerProfileId,
          nome: it.nome,
          enderecoLinha: it.enderecoLinha,
          bairro: it.bairro,
          cidade: '',
          lat: it.lat,
          lng: it.lng,
          observacoes: it.observacoes,
          itens: [{ nome: it.produto.nome, qtd: it.quantidade, valorUnit: it.produto.valorUnit }],
        })),
      };
    }
    if (metodo === 'GET' && via === '/nucleo/clientes') {
      return {
        total: e.itens.length,
        items: e.itens.map((it, i) => ({
          id: it.customerProfileId,
          isCliente: true,
          nome: it.nome,
          enderecoLinha: it.enderecoLinha,
          bairro: it.bairro,
          /* Um dia da semana por cliente, espalhado: é o que faz os chips de
             dia da Montagem existirem de verdade, em vez de um dia só com tudo
             dentro (e o chip é o passo 2 do tutorial obrigatório). */
          diasEntrega: [1 + (i % 5)],
          debitoAtual: 0,
        })),
      };
    }
    if (metodo === 'GET' && via === '/logistica/produtos') {
      return {
        items: DEMO_PRODUTOS.map((p) => ({
          id: p.id,
          nome: p.nome,
          unidade: p.unidade,
          precoCentavos: Math.round(p.valorUnit * 100),
          ativo: true,
        })),
      };
    }
    if (metodo === 'GET' && via === '/credits/me') return { balance: 240, lots: [], packages: [] };
    if (metodo === 'GET' && via === '/logistica/rota/custo-preview') {
      return { creditos: e.itens.length, custo: e.itens.length };
    }
    if (metodo === 'GET' && via === '/logistica/fechamento/resumo') {
      const feitas = e.itens.filter((it) => it.status === 'entregue');
      const soma = feitas.reduce((s, it) => s + it.valorHoje, 0);
      return {
        fechamento: {
          entregues: feitas.length,
          totalCentavos: Math.round(soma * 100),
          formas: soma ? { dinheiro: Math.round(soma * 100) } : null,
        },
      };
    }
    // A continuidade responde SEMPRE vazio: a demonstração não tem ontem.
    if (metodo === 'GET' && via === '/logistica/rota/continuidade') return { pendentes: [] };
    if (metodo === 'GET' && via === '/logistica/rota-modelos') return { items: [] };
    if (metodo === 'GET' && via === '/logistica/tutorial') return { obrigatorioVisto: true };

    // ── os VERBOS. Nenhum sai do aparelho; todos mexem só no estado local ───
    if (metodo === 'POST' && (via === '/logistica/mobile/materialize' || via === '/logistica/rota/planejar')) {
      e.routeStatus = 'PLANNED';
      return { ok: true, paradas: e.itens.length };
    }
    if (metodo === 'POST' && via === '/logistica/rota/iniciar') {
      /* 🔴 AQUI ESTÁ O CRÉDITO QUE NÃO FOI DEBITADO. Este é o verbo que cobra no
         app de verdade (`garantirDiaPago`); na demonstração ele nunca chega ao
         servidor, e é por isso que a trava tinha que ser no cano e não numa
         lista de exceções. */
      e.routeStatus = 'ACTIVE';
      return { ok: true, cobrado: 0, empresas: [] };
    }
    if (metodo === 'POST' && via === '/logistica/rota/encerrar') {
      e.routeStatus = 'ENCERRADA';
      return { ok: true };
    }
    if (metodo === 'POST' && /^\/logistica\/entregas\/[^/]+\/confirmar$/.test(via)) {
      const alvo = e.itens.find((it) => it.id === via.split('/')[3]);
      if (alvo) alvo.status = 'entregue';
      return { ok: true };
    }
    if (metodo === 'POST' && /^\/logistica\/entregas\/[^/]+\/cancelar$/.test(via)) {
      const alvo = e.itens.find((it) => it.id === via.split('/')[3]);
      if (alvo) alvo.status = 'cancelada';
      return { ok: true };
    }
    /* 🔴 O SILÊNCIO EDUCADO. Toda porta que a demonstração não conhece responde
       "sem fonte" — e o app inteiro já sabe conviver com isso. */
    return null;
  }

  /* ── A FRESTA DAS RUAS (21/08/2026) ───────────────────────────────────────
     🔴 O CANO FECHADO DEIXAVA A TELA DE DIRIGIR PELA METADE. Medido no g15 com
     o binário da Play: rota da demonstração iniciada, e o terço de cima da cena
     VAZIO — sem instrução de curva, sem próxima parada, sem ETA — e o mapa sem
     a fita verde. A causa não é o OSRM: é que `__demoIntercepta` respondia por
     TODA porta, e `/logistica/osrm/route` é de onde saem o traçado e as
     manobras (`pedirRota`, § 60-prospector-nav). Recebendo `null`, ela lança
     "Rota viária não encontrada", e a cena fica sem fita — sem fita não há
     catraca, sem catraca não há manobra (§ 7d, 70-traco-camera).

     E o alarme "O caminho veio sem desenho" NÃO acende neste caso: ele é do
     ramo "respondeu SEM geometria", não do ramo "não respondeu". Por isso o
     defeito era mudo, e só apareceu quando alguém olhou a tela.

     ── POR QUE ESTAS DUAS PORTAS PODEM PASSAR, E SÓ ELAS ────────────────────
     `/logistica/osrm/route` e `/logistica/osrm/table` são GEOMETRIA PURA
     (`logistica-osrm.controller.ts`): recebem coordenadas, devolvem ruas. Não
     leem nem escrevem registro de empresa, não criam nada e **não debitam
     crédito** — o verbo que cobra é o `/logistica/rota/iniciar`, que continua
     barrado aqui em cima. As paradas da demonstração são ancoradas no GPS de
     verdade, então o traçado que volta é o do bairro real de quem abriu.

     ⚠️ E A LEI DO CANO CONTINUA DE PÉ: a fresta é **GET**, e só para o par
     exato do regex. Nenhum POST/PATCH/DELETE alcança a rede com a demonstração
     no ar — que é a coisa que a trava existe para garantir. Porta nova de
     escrita não entra aqui por engano: ela nem é GET.

     ⚠️ Custo no servidor, que foi o medo que desenhou a trava: os freios já
     existem e são do app real — 15 s de piso entre pedidos, só repede se andou
     120 m, teto de 400/dia (`navGastar`), mais cache e rate-limit no próprio
     service. Quem está em demonstração está parado olhando o app, não rodando
     a cidade. ------------------------------------------------------------- */
  const PORTAS_DE_RUA = /^\/logistica\/osrm\/(route|table)(\?|$)/;

  /* A porta que o núcleo consulta ANTES de ir à rede. `undefined` = "não sou eu,
     pode ir"; uma Promise = "eu respondo por esta". */
  window.__demoIntercepta = function (metodo, caminho, corpo) {
    if (!demoNoAr) return undefined;
    if (metodo === 'GET' && PORTAS_DE_RUA.test(String(caminho || ''))) return undefined;
    let r = null;
    try { r = respostaDemo(metodo, caminho, corpo); } catch (_) { r = null; }
    return Promise.resolve(r);
  };

  /* ------------------------------------------------------------------------
     ABRIR E FECHAR
     ------------------------------------------------------------------------ */
  function publicarDemo() {
    if (typeof window.usarDados !== 'function') return;
    window.usarDados('tutorial', {
      demoAberta: demoNoAr ? 1 : 0,
      demoDisponivel: ancoraDemo() ? 1 : 0,
    });
  }

  async function abrirDemo() {
    if (demoNoAr) return;
    const base = ancoraDemo();
    /* Sem GPS a demonstração não abre — e o cartão que a oferece já some
       sozinho (`demoDisponivel`), então aqui é só não fazer nada: não existe
       dedo pra avisar, porque não existe botão na tela. */
    if (!base) { publicarDemo(); return; }
    demoEstado = { dia: diaOperacional(), routeStatus: 'PLANNED', itens: montarDiaDemo(base) };
    demoNoAr = true;
    marcarDemoVista();
    publicarDemo();
    /* Os carregadores de VERDADE rodam de novo — só que agora quem responde é a
       tabela acima. Nenhum deles sabe que mudou alguma coisa, e é isso que faz
       montar/iniciar/entregar funcionarem pelo caminho real. */
    try { await carregarRota(); } catch (_) { /* a demonstração não depende de rede */ }
    try { carregarBarra(); } catch (_) { /* idem */ }
    try { if (typeof window.ir === 'function') window.ir('rota'); } catch (_) { /* sem roteador */ }
    /* A rua só existe depois que o mapa desenhou o tile. Uma passada tardia
       troca "a 700 m · norte" pelo nome de verdade — e se o tile não vier, a
       linha honesta fica. UMA vez, sem relógio de repetição: o que não carregou
       em 4 s não carrega por insistência, e um tique a mais na abertura é
       exatamente o tipo de peso que o dono já mandou tirar desta tela. */
    setTimeout(() => {
      if (!demoNoAr || !demoEstado) return;
      let mudou = false;
      demoEstado.itens.forEach((it, i) => {
        const rua = ruaDoTile(it.lat, it.lng);
        if (!rua) return;
        it.enderecoLinha = `${rua}, ${100 + (i * 37)}`;
        it.bairro = '';
        mudou = true;
      });
      if (mudou) { try { carregarRota(); } catch (_) { /* idem */ } }
    }, 4000);
  }

  /* 🔴 FECHAR A DEMONSTRAÇÃO É A PARTE QUE NÃO PODE DAR ERRADO, e ela é curta
     POR CONSTRUÇÃO: derruba a bandeira, joga o estado fora e chama a MESMA
     rotina de boot que sempre limpou o exemplo do desenho. Não há varredura,
     não há lista de campos pra lembrar, não há linha no banco. Depois dela o
     app é o app de um cliente que acabou de instalar — que é exatamente o que
     ele é. */
  async function fecharDemo(irParaCaptura) {
    if (!demoNoAr) return;
    demoNoAr = false;
    demoEstado = null;
    publicarDemo();
    try { apagarDemonstracao(); } catch (_) { /* seam ausente */ }
    try { await carregarRota(); } catch (_) { /* o servidor de verdade agora */ }
    try { carregarBarra(); } catch (_) { /* idem */ }
    try { carregarTutorial(); } catch (_) { /* idem */ }
    if (irParaCaptura && typeof window.ir === 'function') {
      try { window.ir('semclientes'); } catch (_) { /* sem roteador */ }
    }
  }

  /* ------------------------------------------------------------------------
     A OFERTA AUTOMÁTICA — o pedido do dono: *"quando o cliente entra e cadastra
     a primeira vez, aí o tutorial já vem com dados falsos"*.

     🔴 UMA PERGUNTA, UMA VEZ NA VIDA DO APARELHO. O gatilho é "esta empresa não
     tem cliente nenhum", e ele custa UM `take=1` — pedido só por quem nunca viu
     a demonstração. Quem já tem clientes nunca paga essa consulta, e quem já viu
     a demonstração também não: sem esse freio, seria uma query por abertura de
     app pra responder uma pergunta que muda uma vez na vida.

     E o "0 clientes" é lido do TOTAL do servidor, nunca da tela: dia sem entrega
     não é empresa sem cliente, e abrir a demonstração por cima do dia vazio de
     quem tem 200 clientes seria trocar o dia dele por oito mentiras. */
  async function talvezOferecerDemo() {
    if (demoNoAr || demoJaVista() || !temPonte()) return;
    let r = null;
    try { r = await window.API.get('/nucleo/clientes?take=1'); } catch (_) { return; }
    const bruto = r && (r.total != null ? r.total : (Array.isArray(r.items) ? r.items.length : null));
    const total = Number(bruto);
    if (!Number.isFinite(total) || total > 0) return;
    /* Sem GPS não há demonstração — e não há por que insistir: `demoDisponivel`
       já conta isso na tela Tutorial, com a porta lá pra quando houver sinal. */
    if (!ancoraDemo()) { publicarDemo(); return; }
    abrirDemo();
  }

  /* ------------------------------------------------------------------------
     OS DEDOS — a tela Tutorial.
     ------------------------------------------------------------------------ */
  document.addEventListener('click', (ev) => {
    const alvo = ev.target && ev.target.closest && ev.target.closest('[data-acao]');
    if (!alvo) return;
    if (alvo.dataset.acao === 'demo-abrir') { ev.preventDefault(); abrirDemo(); return; }
    /* Sair da demonstração cai na tela que pede os clientes de verdade: o buraco
       que a demonstração abre é dela, e fechá-lo é parte de abri-la. */
    if (alvo.dataset.acao === 'demo-sair') { ev.preventDefault(); fecharDemo(true); }
  });

  /* O estado inicial do cartão (tem GPS? está no ar?) precisa chegar à tela
     Tutorial mesmo que ninguém abra a demonstração — senão ele nasceria com o
     valor do DESENHO, que é a mentira que o `apagarDemonstracao` existe pra
     matar. E a oferta automática espera o mesmo relógio: antes disso o primeiro
     fix ainda não chegou, e sem âncora ela desistiria à toa. */
  setTimeout(() => { publicarDemo(); talvezOferecerDemo(); }, 4500);
