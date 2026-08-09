#!/usr/bin/env node
/**
 * PROVA FUNCIONAL do fluxo MONTAR → INICIAR (os 4 defeitos que o dono reprovou
 * no celular em 09/08).
 *
 *     node scripts/prova-fluxo-rota.js
 *     node scripts/prova-fluxo-rota.js --antes    (só MEDE, não reprova)
 *
 * Mesma receita do `prova-meus-clientes.js`: dirige a tela DE VERDADE (o
 * `ponte.js` do APK, sem dublê nenhum na frente) contra um servidor dublado —
 * mas aqui o servidor tem ESTADO. Sem estado não dá pra medir "voltar sem
 * salvar não persiste": a pergunta é justamente o que ficou no servidor.
 *
 * 🔴 CADA CENA RECARREGA A PÁGINA. `ENTREGAS`, `montarDia`, `previaCrua` e
 * `pularMontarAoAbrir` são estado de MÓDULO da ponte: mexer no servidor no meio
 * da corrida deixa a tela lembrando de uma rota que o dublê já esqueceu — e aí
 * a prova mede a si mesma, não o app.
 *
 * 🔴 O DUBLÊ ENTRA DEPOIS DO BOOT. O `native.js` cria o `window.HBX` de verdade
 * no load e engoliria um `addInitScript`. `temPonte`/`chamar` leem `window.HBX`
 * na hora da chamada, então trocar depois vale pro app inteiro.
 */
const path = require('path');
const { chromium } = require('playwright');

const APP = 'file:///' + path
  .join(__dirname, '..', 'EntregaShell/app/src/logistica/assets/app/index.html')
  .replace(/\\/g, '/');

/** o MESMO dia operacional que a ponte usa (São Paulo), calculado aqui fora */
const HOJE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
const DOW = (() => {
  const [a, m, d] = HOJE.split('-').map(Number);
  const js = new Date(Date.UTC(a, m - 1, d, 12)).getUTCDay();
  return js === 0 ? 7 : js;
})();
/* Dois dias da AGENDA que nunca são hoje: os chips que o dono clicou ("segunda,
   quarta...") precisam existir de verdade na fila, senão a prova mede a tela
   errada. */
const DIA_A = (DOW % 7) + 1;
const DIA_B = ((DOW + 2) % 7) + 1;

const PONTE = ({ hoje, diaA, diaB, entregas, routeStatus, custo, mesmaBase, agendaHoje, hojeDow }) => {
  window.__chamadas = [];
  /* 🔴 A AGENDA É FEITA DA MESMA GENTE QUE O "MEUS CLIENTES" (`mesmaBase`).
     Com listas DISJUNTAS o defeito A não aparece — e disjunto é o que nenhuma
     base real é: os clientes que o dono marca à mão na porta "Meus clientes"
     são exatamente os que a agenda dele já agenda na segunda. */
  const S = {
    hoje,
    routeStatus: routeStatus || '',
    entregas: (entregas || []).map((e) => Object.assign({}, e)),
    seq: 100,
    // a AGENDA: quem entrega em cada dia da semana. Só estes dois dias têm gente.
    agenda: mesmaBase ? {
      [diaA]: [
        { customerProfileId: 'c1', nome: 'Larissa Ype', enderecoLinha: 'Rua 3a, 1354', bairro: 'Centro', lat: -22.40, lng: -47.55, itens: [] },
        { customerProfileId: 'c2', nome: 'Ademir', enderecoLinha: 'Av. 28a, 507', bairro: 'Centro', lat: -22.401, lng: -47.551, itens: [] },
        { customerProfileId: 'c3', nome: 'Alfredo', enderecoLinha: 'Rua 4-a, 93', bairro: 'Centro', lat: -22.402, lng: -47.552, itens: [] },
        { customerProfileId: 'c4', nome: 'Ana Alice', enderecoLinha: 'Av. 28a, 507', bairro: 'Centro', lat: -22.403, lng: -47.553, itens: [] },
        { customerProfileId: 'c5', nome: 'Andreia bicicletaria', enderecoLinha: 'Rua 8 JP, 210', bairro: 'Centro', lat: -22.404, lng: -47.554, itens: [] },
      ],
      [diaB]: [
        { customerProfileId: 'c1', nome: 'Larissa Ype', enderecoLinha: 'Rua 3a, 1354', bairro: 'Vila', lat: -22.40, lng: -47.55, itens: [] },
        { customerProfileId: 'c2', nome: 'Ademir', enderecoLinha: 'Av. 28a, 507', bairro: 'Vila', lat: -22.401, lng: -47.551, itens: [] },
      ],
    } : {
      [diaA]: [
        { customerProfileId: 'a1', nome: 'Ana Agenda', enderecoLinha: 'Rua A, 10', bairro: 'Centro', lat: -22.41, lng: -47.56, itens: [] },
        { customerProfileId: 'a2', nome: 'Bruno Agenda', enderecoLinha: 'Rua A, 20', bairro: 'Centro', lat: -22.42, lng: -47.56, itens: [] },
        { customerProfileId: 'a3', nome: 'Carla Agenda', enderecoLinha: 'Rua A, 30', bairro: 'Centro', lat: -22.43, lng: -47.56, itens: [] },
        { customerProfileId: 'a4', nome: 'Dario Agenda', enderecoLinha: 'Rua A, 40', bairro: 'Centro', lat: -22.44, lng: -47.56, itens: [] },
      ],
      [diaB]: [
        { customerProfileId: 'b1', nome: 'Elza Bagenda', enderecoLinha: 'Rua B, 10', bairro: 'Vila', lat: -22.45, lng: -47.57, itens: [] },
        { customerProfileId: 'b2', nome: 'Fabio Bagenda', enderecoLinha: 'Rua B, 20', bairro: 'Vila', lat: -22.46, lng: -47.57, itens: [] },
      ],
    },
    // O dia de HOJE também pode ter agenda: sem isto a Montagem abre vazia e o
    // pé nasce como "Adicionar parada", que é outra tela — não a que se mede.
    agendaHoje: agendaHoje || null,
    hojeDow,
    custo: custo || { blocosTotais: 3, blocosJaDebitados: 0, creditosAIniciar: 1.2, saldoAtual: 9340, saldoCobre: true },
  };
  window.__S = S;
  /* O DIALETO REAL do /nucleo/clientes (09/08): lat/lng (o map da resposta
     descartava os dois e este dublê, mais generoso que o servidor, escondia o
     buraco — o aparelho carimbava "sem trajeto" em todo escolhido) e
     `diasEntrega` (recorrência ativa, de onde o rascunho tira o
     `resolveSozinho` da régua do desktop). c6/c7 são o par da vacina:
     sem pino COM recorrência × sem pino SEM recorrência. */
  const CLIENTES = [
    { id: 'c1', name: 'Larissa Ype', isCliente: true, endereco: 'Rua 3a, 1354', cidade: 'Rio Claro', lat: -22.40, lng: -47.55, diasEntrega: [6] },
    { id: 'c2', name: 'Ademir', isCliente: true, endereco: 'Av. 28a, 507', cidade: 'Rio Claro', lat: -22.401, lng: -47.551, diasEntrega: [] },
    { id: 'c3', name: 'Alfredo', isCliente: true, endereco: 'Rua 4-a, 93', cidade: 'Rio Claro', lat: -22.402, lng: -47.552, diasEntrega: [] },
    { id: 'c4', name: 'Ana Alice', isCliente: true, endereco: 'Av. 28a, 507', cidade: 'Rio Claro', lat: -22.403, lng: -47.553, diasEntrega: [] },
    { id: 'c5', name: 'Andreia bicicletaria', isCliente: true, endereco: 'Rua 8 JP, 210', cidade: 'Rio Claro', lat: -22.404, lng: -47.554, diasEntrega: [] },
    { id: 'c6', name: 'Rosa recorrente', isCliente: true, endereco: 'Av 60, 586', cidade: 'Rio Claro', lat: null, lng: null, diasEntrega: [6] },
    { id: 'c7', name: 'Zeca sem porta', isCliente: true, endereco: 'Rua 19, 880', cidade: 'Rio Claro', lat: null, lng: null, diasEntrega: [] },
  ];
  const porId = new Map(CLIENTES.map((c) => [c.id, c]));

  const diaDe = (ymd) => {
    const [a, m, d] = String(ymd).split('-').map(Number);
    const js = new Date(Date.UTC(a, m - 1, d, 12)).getUTCDay();
    return js === 0 ? 7 : js;
  };
  const abertas = () => S.entregas.filter((e) => e.status !== 'entregue' && e.status !== 'cancelada');

  window.HBX = {
    api(caminho, opcoes) {
      const metodo = (opcoes && opcoes.method) || 'GET';
      const corpo = (opcoes && opcoes.body) || null;
      window.__chamadas.push([metodo, String(caminho).split('?')[0], corpo]);
      const q = (nome) => {
        const m = new RegExp(`[?&]${nome}=([^&]*)`).exec(caminho);
        return m ? decodeURIComponent(m[1]) : '';
      };
      const R = (v) => Promise.resolve(JSON.parse(JSON.stringify(v)));

      if (caminho.indexOf('/logistica/config') === 0) {
        // `modoRotaPadrao` é a chave que faz `ehAdmin()` dizer sim — e sem admin
        // os chips de dia nem nascem, que é metade do defeito A.
        return R({ modoRotaPadrao: 'essencial', appModulosDesativados: '' });
      }
      if (caminho.indexOf('/logistica/rota/custo-preview') === 0) return R(S.custo);
      // ANTES do genérico '/logistica/rota' (prefixo engole o específico —
      // foi exatamente assim que este stub nasceu devolvendo rota no historico)
      if (caminho.indexOf('/logistica/rota/historico') === 0) {
        // o dialeto REAL do historicoDeRotas: dias sem date; clientes com date
        const d = q('date');
        if (d) {
          return R({
            data: d,
            clientes: [
              { customerProfileId: 'c3', nome: 'Alfredo', endereco: 'Rua 4-a, 93', bairro: '', cidade: 'Rio Claro', lat: -22.402, lng: -47.552, recorrente: true },
              { customerProfileId: 'c7', nome: 'Zeca sem porta', endereco: 'Rua 19, 880', bairro: '', cidade: 'Rio Claro', lat: null, lng: null, recorrente: false },
            ],
          });
        }
        return R({ dias: [{ data: '2026-08-08', paradas: 2 }] });
      }
      if (caminho.indexOf('/logistica/rota/planejar') === 0 && metodo === 'POST') {
        const manual = corpo && Array.isArray(corpo.ordemManual) ? corpo.ordemManual.map(String) : null;
        const fila = abertas();
        const ordem = manual
          ? manual.filter((id) => fila.some((e) => e.id === id))
            .concat(fila.map((e) => e.id).filter((id) => manual.indexOf(id) < 0))
          : fila.map((e) => e.id);
        ordem.forEach((id, i) => {
          const e = S.entregas.find((x) => x.id === id);
          if (e) e.rotaOrdem = i;
        });
        return R({ stops: ordem.map((id) => ({ id })) });
      }
      if (caminho.indexOf('/logistica/rota/conferir') === 0) return R({ items: [] });
      if (caminho.indexOf('/logistica/rota/checar-enderecos') === 0) return R({ problemas: [] });
      if (caminho.indexOf('/logistica/rota/iniciar') === 0 && metodo === 'POST') {
        if (!abertas().length) return Promise.reject(new Error('Não há entregas abertas para iniciar.'));
        abertas().forEach((e, i) => { e.rotaOrdem = i; });
        S.routeStatus = 'ACTIVE';
        S.custo = Object.assign({}, S.custo, { blocosJaDebitados: S.custo.blocosTotais, creditosAIniciar: 0 });
        return R({ ok: true });
      }
      if (caminho.indexOf('/logistica/rota/limpar-dia') === 0) {
        S.entregas = []; S.routeStatus = '';
        return R({ ok: true });
      }
      if (caminho.indexOf('/logistica/rota-modelos') === 0) return R([]);
      if (caminho.indexOf('/logistica/rota') === 0 && metodo === 'GET') {
        return R({
          routeStatus: S.routeStatus,
          items: S.entregas.map((e) => ({
            id: e.id, status: e.status, rotaOrdem: e.rotaOrdem, origem: e.origem,
            cliente: e.cliente, quantidade: 1,
          })),
          moduloFinanceiroAtivo: false, avisoChegandoAtivo: false,
        });
      }
      if (caminho.indexOf('/logistica/dia-preview') === 0) {
        const d = q('date') || S.hoje;
        if (d === S.hoje && S.agendaHoje) return R({ clientes: S.agendaHoje });
        return R({ clientes: (S.agenda[diaDe(d)] || []) });
      }
      if (caminho.indexOf('/logistica/agenda') === 0) {
        return R({
          dias: [1, 2, 3, 4, 5, 6, 7].map((n) => ({
            diaSemana: n,
            totalClientesDia: (n === S.hojeDow && S.agendaHoje)
              ? S.agendaHoje.length : (S.agenda[n] || []).length,
          })),
        });
      }
      if (caminho.indexOf('/logistica/entregas') === 0 && metodo === 'POST') {
        const c = porId.get(String(corpo.customerProfileId)) || { id: corpo.customerProfileId, name: 'Avulso' };
        S.seq += 1;
        const id = `e${S.seq}`;
        S.entregas.push({
          id, status: 'agendada', rotaOrdem: null, origem: 'avulsa',
          cliente: { id: String(c.id), nome: c.name, endereco: c.endereco, cidade: c.cidade, lat: c.lat, lng: c.lng },
        });
        return R({ id });
      }
      if (caminho.indexOf('/nucleo/clientes') === 0) {
        const alvo = q('query').toLowerCase();
        const items = alvo ? CLIENTES.filter((c) => c.name.toLowerCase().indexOf(alvo) >= 0) : CLIENTES;
        return R({ items, total: items.length });
      }
      if (caminho.indexOf('/credits/me') === 0) return R({ saldo: S.custo.saldoAtual });
      return R({});
    },
    requestLocationPermission() {}, manterTelaAcesa() {}, modoNavegacao() {}, speak() {},
    soundPrefs: { get: () => ({}), set: () => {} },
  };
  window.HBXApp = window.HBXApp || {};
};

const CLI_C1 = { id: 'c1', nome: 'Larissa Ype', endereco: 'Rua 3a, 1354', lat: -22.40, lng: -47.55 };
const CLI_C5 = { id: 'c5', nome: 'Andreia bicicletaria', endereco: 'Rua 8 JP, 210', lat: -22.404, lng: -47.554 };
/** a agenda de HOJE que casa com as entregas c1/c5 das cenas do Iniciar */
const AGENDA_HOJE = [
  { customerProfileId: 'c1', nome: 'Larissa Ype', enderecoLinha: 'Rua 3a, 1354', bairro: 'Centro', lat: -22.40, lng: -47.55, itens: [] },
  { customerProfileId: 'c5', nome: 'Andreia bicicletaria', enderecoLinha: 'Rua 8 JP, 210', bairro: 'Centro', lat: -22.404, lng: -47.554, itens: [] },
];

const ok = [];
const falhou = [];
const notas = [];
const eh = (nome, cond) => (cond ? ok : falhou).push(nome);
const nota = (t) => notas.push(t);
const SO_MEDIR = process.argv.includes('--antes');

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 940 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => falhou.push('ERRO DE PAGINA: ' + e.message));

  /** uma CENA: página nova, dublê novo, estado de servidor novo */
  const cena = async (estado) => {
    await p.goto(APP);
    await p.waitForTimeout(400);
    await p.evaluate(PONTE, Object.assign({ hoje: HOJE, diaA: DIA_A, diaB: DIA_B, hojeDow: DOW }, estado || {}));
    // `carregarBarra` tem trava de 3 s e já queimou a dela no boot (contra o
    // servidor real, que aqui não existe). O evento de foco é o atalho que a
    // própria ponte declara; passada a trava, ele vale.
    await p.waitForTimeout(3200);
    await p.evaluate(() => window.dispatchEvent(new Event('focus')));
    await p.waitForTimeout(700);
  };

  const espiar = () => p.evaluate(() => ({
    tela: (function () { try { return atual; } catch (e) { return null; } })(),
    linhas: [...document.querySelectorAll('.stops .stop .who strong')].map((e) => e.textContent.trim()),
    // a ROUPA da rota de hoje: hora prevista e pílula de status. Numa PRÉVIA de
    // outro dia nada disso pode existir — a entrega daquele dia nem nasceu.
    horas: [...document.querySelectorAll('.stops .stop .hh')].map((e) => e.textContent.trim()).filter(Boolean),
    pills: [...document.querySelectorAll('.stops .stop .pill')].map((e) => e.textContent.trim()).filter(Boolean),
    pernas: [...document.querySelectorAll('.stops .perna, .stops .leg')].map((e) => e.textContent.trim()).filter(Boolean),
    nStops: document.querySelectorAll('.stops .stop').length,
    chips: [...document.querySelectorAll('[data-acao="montar-dia"]')].map((e) => [e.textContent.trim(), e.classList.contains('on') ? 1 : 0]),
    pe: (document.querySelector('.pe-montagem .go b') || {}).textContent || '',
    vazio: (document.querySelector('.vazio strong') || {}).textContent || '',
    portao: (document.querySelector('.portao h3') || {}).textContent || '',
    aviso: (document.querySelector('.aviso-card strong, .aviso strong') || {}).textContent || '',
    dock: (document.querySelector('.tmx-main b, .tmx-main .rot') || {}).textContent || '',
    entregasNoServidor: window.__S.entregas.length,
    routeStatus: window.__S.routeStatus,
  }));
  const posts = () => p.evaluate(() => window.__chamadas.filter((c) => c[0] === 'POST').map((c) => c[1]));
  const zerar = () => p.evaluate(() => { window.__chamadas = []; });
  const marcar = async (i) => {
    // a lista da porta "Meus clientes" chega da rede: esperar o BOTÃO existir é
    // a única espera honesta (tempo fixo dá prova intermitente).
    await p.waitForSelector('[data-acao="rapida-marcar"]', { timeout: 8000 });
    await p.evaluate((n) => {
      const lista = document.querySelectorAll('[data-acao="rapida-marcar"]');
      if (!lista[n]) throw new Error(`sem cliente no indice ${n} (tem ${lista.length})`);
      lista[n].click();
    }, i);
    await p.waitForTimeout(120);
  };
  const tocarChip = async (n) => {
    await p.evaluate((d) => {
      const x = [...document.querySelectorAll('[data-acao="montar-dia"]')].find((e) => Number(e.dataset.dia) === d);
      if (!x) throw new Error(`chip do dia ${d} nao existe`);
      x.click();
    }, n);
    await p.waitForTimeout(1500);
  };
  const irPara = async (tela, ms) => {
    await p.evaluate((t) => window.ir(t), tela);
    await p.waitForTimeout(ms || 1400);
  };

  /* ===================================================================
     CENA A — MONTAGEM: 3 avulsas de hoje + os chips de dia
     =================================================================== */
  await cena({ mesmaBase: true });
  await irPara('montagem');
  await irPara('rapida', 900);
  await marcar(0); await marcar(1); await marcar(2);
  await zerar();
  await p.evaluate(() => document.querySelector('[data-acao="rapida-adicionar-escolhidos"]').click());
  await p.waitForTimeout(2000);
  // o recibo tapa a tela; fechar é o que o dedo faz
  await p.evaluate(() => {
    const x = document.querySelector('.portao-wrap .principal');
    if (x) x.click();
  });
  await p.waitForTimeout(600);

  const tA0 = await espiar();
  nota(`[A] apos "Adicionar 3 na rota": tela=${tA0.tela} · stops=${tA0.nStops} · entregas no servidor=${tA0.entregasNoServidor}`);
  nota(`    linhas: ${tA0.linhas.join(' | ')}`);
  nota(`    horas=${JSON.stringify(tA0.horas)} · pills=${JSON.stringify(tA0.pills)}`);
  nota(`    chips: ${tA0.chips.map((c) => c[0] + (c[1] ? '*' : '')).join(' ')} · pe="${tA0.pe}"`);

  await zerar();
  await tocarChip(DIA_A);
  const tA1 = await espiar();
  nota(`[A] chip dia ${DIA_A} (5 na agenda): stops=${tA1.nStops} · linhas: ${tA1.linhas.join(' | ')}`);
  nota(`    horas=${JSON.stringify(tA1.horas)} · pills=${JSON.stringify(tA1.pills)}`);
  nota(`    POSTs no toque do chip: ${(await posts()).join(' , ') || '(nenhum)'} · entregas=${tA1.entregasNoServidor} · pe="${tA1.pe}"`);

  await zerar();
  await tocarChip(DIA_B);
  const tA2 = await espiar();
  nota(`[A] chip dia ${DIA_B} (2 na agenda): stops=${tA2.nStops} · linhas: ${tA2.linhas.join(' | ')}`);
  nota(`    horas=${JSON.stringify(tA2.horas)} · pills=${JSON.stringify(tA2.pills)}`);
  nota(`    POSTs: ${(await posts()).join(' , ') || '(nenhum)'} · entregas=${tA2.entregasNoServidor}`);

  await zerar();
  await tocarChip(DIA_B);                     // 2º toque no mesmo chip = volta pra HOJE
  const tA3 = await espiar();
  nota(`[A] volta pra HOJE: stops=${tA3.nStops} · linhas: ${tA3.linhas.join(' | ')}`);
  nota(`    POSTs: ${(await posts()).join(' , ') || '(nenhum)'} · entregas=${tA3.entregasNoServidor} · pe="${tA3.pe}"`);

  eh('A1 · chip de outro dia mostra a lista DAQUELE dia', tA1.nStops === 5);
  eh('A2 · trocar de chip troca a fileira INTEIRA', tA2.nStops === 2);
  eh('A3 · voltar pra hoje devolve a tela EXATA de antes', tA3.nStops === tA0.nStops && tA3.linhas.join('|') === tA0.linhas.join('|'));
  eh('A4 · tocar chip NAO materializa entrega nova', tA3.entregasNoServidor === tA0.entregasNoServidor);
  /* 🔴 O CORAÇÃO DO DEFEITO A: a prévia de OUTRO dia não pode vestir a roupa da
     rota de HOJE. Hora prevista e pílula de status são da ENTREGA — e a entrega
     da segunda-feira não existe ainda. */
  eh('A5 · prévia de outro dia NAO mostra hora da rota de hoje', tA1.horas.length === 0 && tA2.horas.length === 0);
  /* 🔴 CHIP É DA AGENDA, E SÓ DELA (dono, 09/08: "vc meio q criou um 'dom'
     como se tivesse cliente de domingo, totalmente fora de semantica... isso
     aqui é AVULSO, crie uma parte avulsa"). A 1ª versão desta prova cobrava o
     contrário — o chip de HOJE nascendo de parada/rascunho — e foi exatamente
     o "Dom" fantasma que ele reprovou na tela. Agora: com avulsas de hoje e
     agenda vazia no dia, NENHUM chip inventado; quem mostra o trabalho é a
     PARTE AVULSA, com cabeçalho próprio no topo da lista. */
  const cabA = await p.evaluate(() => [...document.querySelectorAll('.grupo')]
    .map((e) => e.textContent.trim()).filter((t) => /avulsa/i.test(t)).length);
  eh('A6 · chip de dia so nasce da AGENDA (nenhum "Dom" fantasma de avulsa)',
    !tA0.chips.some((c) => c[0] === 'Dom' || c[0] === 'Hoje'), tA0.chips.map((c) => c[0]).join(' '));
  eh('A6b · a PARTE AVULSA existe com cabecalho proprio', cabA >= 1, `cabecalhos=${cabA}`);

  /* ===================================================================
     CENA B — VOLTAR SEM SALVAR: o rascunho não persiste
     =================================================================== */
  await cena({});
  await irPara('rota', 900);
  await irPara('montagem');
  await irPara('rapida', 900);
  await marcar(0); await marcar(1); await marcar(2);
  await zerar();
  await p.evaluate(() => document.querySelector('[data-acao="rapida-adicionar-escolhidos"]').click());
  await p.waitForTimeout(2000);
  const pB = await posts();
  const tB0 = await espiar();
  nota(`[B] rascunho: POSTs do "Adicionar" = ${pB.join(' , ') || '(nenhum)'} · entregas no servidor=${tB0.entregasNoServidor}`);
  nota(`    montagem: stops=${tB0.nStops} · linhas: ${tB0.linhas.join(' | ')} · pe="${tB0.pe}"`);
  eh('B1 · escolher clientes NAO cria entrega no servidor', tB0.entregasNoServidor === 0);
  eh('B1b · nenhum POST /logistica/entregas no rascunho', pB.indexOf('/logistica/entregas') < 0);
  eh('B1c · o rascunho APARECE na montagem', tB0.nStops === 3);

  await p.evaluate(() => {
    const x = document.querySelector('.portao-wrap .principal');
    if (x) x.click();
  });
  await p.waitForTimeout(400);
  await irPara('rota', 1200);
  const tB1 = await espiar();
  nota(`[B] voltar sem salvar: tela=${tB1.tela} · entregas=${tB1.entregasNoServidor} · stops na rota=${tB1.nStops} · dock="${tB1.dock}"`);
  eh('B2 · voltar sem salvar deixa o servidor limpo', tB1.entregasNoServidor === 0);
  eh('B3 · a tela inicial NAO mostra paradas', tB1.nStops === 0);

  /* materializar: voltar pra montagem e INICIAR grava o rascunho */
  await irPara('montagem');
  const tB2 = await espiar();
  nota(`[B] montagem de novo: stops=${tB2.nStops} (rascunho descartado no voltar) · entregas=${tB2.entregasNoServidor}`);
  eh('B4 · voltar DESCARTA o rascunho', tB2.nStops === 0 && tB2.entregasNoServidor === 0);

  /* ===================================================================
     CENA B5 — A MESMA LÍNGUA (dono, 09/08: "é a mesma tela... a gente
     combinou de fazer tudo com a mesma casca, mesmas regras"). A linha do
     rascunho é lida pela MESMA régua da linha da agenda (`pernaDaPrevia`):
     COM pino fica quieta; SEM pino mas recorrente fica quieta
     (`resolveSozinho` — a 1ª entrega grava a porta); SEM pino e SEM
     recorrência é a ÚNICA que avisa, e o aviso é honesto.
     =================================================================== */
  await cena({});
  await irPara('rota', 900);
  await irPara('montagem');
  await irPara('rapida', 900);
  await marcar(1); await marcar(5); await marcar(6);
  await p.evaluate(() => document.querySelector('[data-acao="rapida-adicionar-escolhidos"]').click());
  await p.waitForTimeout(2000);
  const tB5 = await espiar();
  const flagsB5 = tB5.pernas.filter((t) => /não sei onde fica/i.test(t));
  nota(`[B5] mesma língua: stops=${tB5.nStops} · avisos="${flagsB5.join(' | ') || '(nenhum)'}"`);
  eh('B5a · os 3 escolhidos estão na montagem', tB5.nStops === 3, `stops=${tB5.nStops}`);
  eh('B5b · cliente COM pino não leva "não sei onde fica"; recorrente sem pino também não',
    flagsB5.length === 1, `avisos=${flagsB5.length}`);
  eh('B5c · o único aviso é do sem pino SEM recorrência (aviso honesto)',
    flagsB5.length === 1, flagsB5[0] || '(nenhum)');
  await p.evaluate(() => {
    const x = document.querySelector('.portao-wrap .principal');
    if (x) x.click();
  });
  await p.waitForTimeout(400);

  /* ===================================================================
     CENA H — HISTÓRICO 14 DIAS (dono, 09/08: "criar um histórico, salva por
     14 dias... E tem como reutilizar"). A seção lista os dias que já rodaram;
     o toque enche o RASCUNHO (nada gravado) com a MESMA bagagem — o Alfredo
     com pino fica quieto, o Zeca sem porta leva o aviso honesto.
     =================================================================== */
  await cena({});
  await irPara('rota', 900);
  await irPara('montagem');
  const temHist = await p.evaluate(() => document.querySelectorAll('[data-acao="historico-usar"]').length);
  eh('H1 · a secao do historico aparece na montagem', temHist >= 1, `linhas=${temHist}`);
  await zerar();
  await p.evaluate(() => document.querySelector('[data-acao="historico-usar"]').click());
  await p.waitForTimeout(2200);
  const tH = await espiar();
  const flagsH = tH.pernas.filter((t) => /não sei onde fica/i.test(t));
  nota(`[H] reutilizar 08/08: stops=${tH.nStops} · entregas=${tH.entregasNoServidor} · portao="${tH.portao}" · avisos=${flagsH.length}`);
  eh('H2 · reutilizar poe os clientes do dia na lista', tH.nStops === 2, `stops=${tH.nStops}`);
  eh('H3 · e NAO grava nada no servidor', tH.entregasNoServidor === 0
    && (await posts()).indexOf('/logistica/entregas') < 0);
  eh('H4 · o recibo diz o verbo do estado (na lista)', /na lista/i.test(tH.portao), tH.portao);
  eh('H5 · mesma lingua: so o sem-porta-sem-recorrencia avisa', flagsH.length === 1, `avisos=${flagsH.length}`);

  /* ===================================================================
     CENA B2 — SALVAR/INICIAR materializa o rascunho
     =================================================================== */
  await cena({});
  await irPara('montagem');
  await irPara('rapida', 900);
  await marcar(0); await marcar(1);
  await p.evaluate(() => document.querySelector('[data-acao="rapida-adicionar-escolhidos"]').click());
  await p.waitForTimeout(2000);
  await p.evaluate(() => {
    const x = document.querySelector('.portao-wrap .principal');
    if (x) x.click();
  });
  await p.waitForTimeout(500);
  await zerar();
  await p.evaluate(() => {
    const x = document.querySelector('.pe-montagem [data-acao="iniciar-rota"], .pe-montagem [data-acao="montar-agora"]');
    if (x) x.click();
  });
  await p.waitForTimeout(2600);
  const tB3 = await espiar();
  nota(`[B] INICIAR pela montagem: POSTs=${(await posts()).join(' , ') || '(nenhum)'}`);
  nota(`    entregas no servidor=${tB3.entregasNoServidor} · routeStatus=${tB3.routeStatus} · tela=${tB3.tela}`);
  eh('B5 · iniciar MATERIALIZA o rascunho', tB3.entregasNoServidor === 2);
  eh('B6 · iniciar de fato iniciou', tB3.routeStatus === 'ACTIVE');

  /* ===================================================================
     CENA C — ROTA RODANDO + avulsa = imediato, como antes
     =================================================================== */
  await cena({
    routeStatus: 'ACTIVE',
    entregas: [{ id: 'ex1', status: 'agendada', rotaOrdem: 0, origem: 'recorrente', cliente: CLI_C5 }],
  });
  await irPara('rota', 1300);
  await irPara('rapida', 900);
  await marcar(0);
  await zerar();
  await p.evaluate(() => document.querySelector('[data-acao="rapida-adicionar-escolhidos"]').click());
  await p.waitForTimeout(2200);
  const pC = await posts();
  const tC = await espiar();
  nota(`[C] rota RODANDO + avulsa: POSTs=${pC.join(' , ') || '(nenhum)'} · entregas=${tC.entregasNoServidor}`);
  eh('C1 · rota rodando: a avulsa entra NA HORA', tC.entregasNoServidor === 2 && pC.indexOf('/logistica/entregas') >= 0);

  /* ===================================================================
     CENA D — INICIAR com saldo que cobre: sem portão, sem tela remontando
     =================================================================== */
  await cena({
    routeStatus: 'PLANNED',
    entregas: [
      { id: 'i1', status: 'agendada', rotaOrdem: 0, origem: 'avulsa', cliente: CLI_C1 },
      { id: 'i2', status: 'agendada', rotaOrdem: 1, origem: 'avulsa', cliente: CLI_C5 },
    ],
    custo: { blocosTotais: 2, blocosJaDebitados: 0, creditosAIniciar: 0.8, saldoAtual: 9340, saldoCobre: true },
    agendaHoje: AGENDA_HOJE,
  });
  // 🔴 PASSA PELA MONTAGEM ANTES. O `carregarRota` do boot correu contra o
  // servidor REAL (o dublê só entra depois do load) e voltou no catch: sem esta
  // passagem `estadoRota` fica em 'carregando' e o dock nasce SEM o Iniciar —
  // a prova mediria a tela de esqueleto, não a tela do dono.
  await irPara('montagem');
  await irPara('rota', 1600);
  // conta as PINTURAS da tela a partir daqui: `pintar` monta uma camada nova a
  // cada escrita, e "tela remontando tela" é isso ficando visível.
  await p.evaluate(() => {
    window.__pinturas = 0;
    window.__obs = new MutationObserver((ms) => {
      ms.forEach((m) => m.addedNodes.forEach((n) => {
        if (n.nodeType === 1 && n.classList && n.classList.contains('tela')) window.__pinturas += 1;
      }));
    });
    window.__obs.observe(document.getElementById('app'), { childList: true });
  });
  await zerar();
  const tD0 = await espiar();
  nota(`[D] antes do iniciar: tela=${tD0.tela} · dock="${tD0.dock}"`);
  await p.evaluate(() => {
    const x = document.querySelector('.tmx-main [data-estado="iniciar"], .tmx-main [data-acao="iniciar-rota"]');
    if (!x) throw new Error('sem botao Iniciar no dock da rota; dock=' + ((document.querySelector('.transmux')||{}).outerHTML||'(sem transmux)').slice(0,300));
    x.click();
  });
  await p.waitForTimeout(1000);
  const tD1 = await espiar();
  const temPortaoIniciar = /Iniciar a rota/.test(tD1.portao);
  nota(`[D] toque no Iniciar: portao="${tD1.portao || '(nenhum)'}" · routeStatus=${tD1.routeStatus}`);
  if (temPortaoIniciar) {
    nota('    ⚠ O PORTAO APARECEU — o dono pediu iniciar DIRETO. Confirmando pra medir o resto.');
    await p.evaluate(() => {
      const x = document.querySelector('.portao-wrap .principal');
      if (x) x.click();
    });
    await p.waitForTimeout(2000);
  }
  const tD2 = await espiar();
  const pinturas = await p.evaluate(() => window.__pinturas);
  nota(`[D] depois do iniciar: tela=${tD2.tela} · routeStatus=${tD2.routeStatus} · dock="${tD2.dock}" · camadas novas=${pinturas}`);
  nota(`    POSTs: ${(await posts()).join(' , ') || '(nenhum)'}`);

  eh('D1 · saldo cobre ⇒ NENHUM portao antes de iniciar', !temPortaoIniciar);
  eh('D2 · o POST /logistica/rota/iniciar saiu', (await posts()).indexOf('/logistica/rota/iniciar') >= 0);
  eh('D3 · a rota ficou ACTIVE', tD2.routeStatus === 'ACTIVE');
  eh('D4 · o dock MORFOU pra Navegar', /Navegar/.test(tD2.dock));
  eh('D5 · continua na tela rota', tD2.tela === 'rota');
  eh('D6 · sem tela remontando tela (nenhuma camada NOVA de troca)', pinturas <= 2);

  /* ===================================================================
     CENA D2 — INICIAR pelo pé da MONTAGEM (o caminho que o dono fez).
     "iniciei, ele abre outra tela, olha q tosco" — aqui se conta quantas
     CAMADAS a tela monta entre o dedo e a rota rodando.
     =================================================================== */
  await cena({
    routeStatus: 'PLANNED',
    entregas: [
      { id: 'm1', status: 'agendada', rotaOrdem: 0, origem: 'avulsa', cliente: CLI_C1 },
      { id: 'm2', status: 'agendada', rotaOrdem: 1, origem: 'avulsa', cliente: CLI_C5 },
    ],
    custo: { blocosTotais: 2, blocosJaDebitados: 0, creditosAIniciar: 0.8, saldoAtual: 9340, saldoCobre: true },
    agendaHoje: AGENDA_HOJE,
  });
  await irPara('montagem');
  await p.evaluate(() => {
    window.__pinturas = 0; window.__telas = [];
    window.__obs = new MutationObserver((ms) => {
      ms.forEach((m) => m.addedNodes.forEach((n) => {
        if (n.nodeType === 1 && n.classList && n.classList.contains('tela')) {
          window.__pinturas += 1;
          try { window.__telas.push(atual); } catch (e) { window.__telas.push('?'); }
        }
      }));
    });
    window.__obs.observe(document.getElementById('app'), { childList: true });
  });
  await zerar();
  const tF0 = await espiar();
  nota(`[D2] antes do iniciar: tela=${tF0.tela} · pe="${tF0.pe}"`);
  await p.evaluate(() => {
    const x = document.querySelector('.pe-montagem [data-acao="iniciar-rota"]');
    if (!x) throw new Error('sem "Iniciar rota" no pe da montagem');
    x.click();
  });
  await p.waitForTimeout(1000);
  const tF1 = await espiar();
  const portaoNaMontagem = /Iniciar a rota/.test(tF1.portao);
  if (portaoNaMontagem) {
    nota(`[D2] ⚠ portao="${tF1.portao}" — confirmando pra medir o resto`);
    await p.evaluate(() => {
      const x = document.querySelector('.portao-wrap .principal');
      if (x) x.click();
    });
    await p.waitForTimeout(2200);
  }
  const tF2 = await espiar();
  const pinturasF = await p.evaluate(() => window.__pinturas);
  const telasF = await p.evaluate(() => window.__telas);
  nota(`[D2] depois: tela=${tF2.tela} · routeStatus=${tF2.routeStatus} · dock="${tF2.dock}"`);
  nota(`    camadas montadas=${pinturasF} · sequencia de telas: ${telasF.join(' > ')}`);
  nota(`    POSTs: ${(await posts()).join(' , ') || '(nenhum)'}`);
  eh('F1 · iniciar pela montagem NAO abre portao (saldo cobre)', !portaoNaMontagem);
  eh('F2 · iniciar pela montagem leva pra rota RODANDO', tF2.routeStatus === 'ACTIVE');

  /* ===================================================================
     CENA E — saldo NÃO cobre: a trava continua
     =================================================================== */
  await cena({
    routeStatus: 'PLANNED',
    entregas: [{ id: 'j1', status: 'agendada', rotaOrdem: 0, origem: 'avulsa', cliente: CLI_C1 }],
    custo: { blocosTotais: 1, blocosJaDebitados: 0, creditosAIniciar: 0.4, saldoAtual: 0, saldoCobre: false },
  });
  await irPara('montagem');
  await irPara('rota', 1600);
  await zerar();
  await p.evaluate(() => {
    const x = document.querySelector('.tmx-main [data-estado="iniciar"], .tmx-main [data-acao="iniciar-rota"]');
    if (!x) throw new Error('sem botao Iniciar no dock da rota; dock=' + ((document.querySelector('.transmux')||{}).outerHTML||'(sem transmux)').slice(0,300));
    x.click();
  });
  await p.waitForTimeout(1400);
  const tE = await espiar();
  nota(`[E] saldo curto: portao="${tE.portao || '(nenhum)'}" · routeStatus=${tE.routeStatus}`);
  eh('E1 · saldo curto ⇒ a trava aparece', /insuficiente/i.test(tE.portao));
  eh('E2 · saldo curto ⇒ NAO iniciou', tE.routeStatus !== 'ACTIVE');

  await b.close();
  console.log('\n=== MEDIDAS ===');
  notas.forEach((n) => console.log('  · ' + n));
  console.log('\n=== PROVA: fluxo montar -> iniciar ===');
  ok.forEach((n) => console.log('  ok  ' + n));
  falhou.forEach((n) => console.log('  XX  ' + n));
  console.log('\n' + ok.length + '/' + (ok.length + falhou.length));
  process.exit(SO_MEDIR ? 0 : (falhou.length ? 1 : 0));
})();
