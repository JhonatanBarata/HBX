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
const { regenerarGerados } = require('./_regenerar');

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

const PONTE = ({
  hoje, diaA, diaB, entregas, routeStatus, custo, mesmaBase, agendaHoje, hojeDow, custoComoServidor,
  outroMotorista, assentos,
  // A ROTA FANTASMA (15/08): `routeId` é OPT-IN por cena — sem ele o GET
  // continua sem publicar `routeId` nenhum (byte a byte o dublê de sempre), e
  // a ref cai no `draft:` como sempre caiu. Só as cenas que precisam medir a
  // lápide (`route:` morta) passam este par.
  routeId, cancelarRejeita,
  // LOTE 1.3 — "as abertas estão CONGELADAS nos stops desta rota?". É o dado
  // que o servidor de verdade usa pra decidir quem `route:`/`draft:` enxerga;
  // sem ele o dublê chutava pelo `routeStatus` (ver o POST de cancelar).
  stopsPresos,
}) => {
  window.__chamadas = [];
  /* 🔴 PROMESSA QUE MORRE SOZINHA NÃO ACENDE `pageerror`. Quase tudo da ponte é
     chamado sem `await` (`montarRota()` no abrir da tela, `void sanitizarPrevia`):
     um erro lá dentro vira unhandledrejection, some do console do aparelho e
     deixa a tela num estado intermediário — foi assim que o "Montando…" ficou
     preso com o botão do pé sumido. Aqui ele fica GUARDADO pra prova poder
     mostrar de quem é a culpa. */
  window.__erros = [];
  window.addEventListener('unhandledrejection', (e) => {
    window.__erros.push(String((e.reason && (e.reason.stack || e.reason.message)) || e.reason));
  });
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
    /* cena G: o custo-preview responde como o SERVIDOR de verdade — 400 com
       "Nenhuma entrega aberta" enquanto o dia está vazio. Atrás de bandeira
       porque as outras cenas medem a Lei do IF (custo no chão = linha some),
       não este contrato. */
    custoComoServidor: !!custoComoServidor,
    /* cenas R/S: os dois contratos NOVOS do servidor (409/402, 10/08) — cada
       um dispara UMA vez só (`usado` trava a repetição), pra medir exatamente
       o gesto do dono: falhou nomeado, forçou/comprou, refez sozinho. Depois
       da 1ª rejeição o bloqueio se solta (limpar-dia limpa o outroMotorista;
       comprar o passe apaga o assentos) — é assim que a 2ª tentativa entra. */
    outroMotorista: outroMotorista ? Object.assign({ usado: false }, outroMotorista) : null,
    assentos: assentos ? Object.assign({ usado: false }, assentos) : null,
    passeComprado: 0,
    // quantas vezes o dia foi REGISTRADO (o `fechamento/finalizar`). É por ele
    // que a cena V prova o "1x só": fechar duas vezes não existe mais.
    fechou: 0,
    // A ROTA FANTASMA (15/08) — o `routeId` de uma rota que NUNCA tem stop
    // neste dublê (é sempre a lápide); e a rejeição fixa do cancelar pras
    // cenas de resync (409 sem/com código nomeado).
    routeId: routeId || null,
    cancelarRejeita: cancelarRejeita || null,
    stopsPresos: !!stopsPresos,
  };
  window.__S = S;
  /* O DIALETO REAL do /nucleo/clientes (09/08): lat/lng (o map da resposta
     descartava os dois e este dublê, mais generoso que o servidor, escondia o
     buraco — o aparelho carimbava "sem trajeto" em todo escolhido),
     `numero` em COLUNA PRÓPRIA e `diasEntrega` (recorrência ativa, de onde o
     rascunho tira o `resolveSozinho` da régua do desktop). NÃO tem `bairro`,
     `complemento` nem locais — dublê mais generoso que o servidor esconde
     exatamente o buraco que a vacina existe pra achar.
     c6/c7 são o par da vacina do aviso: sem pino COM recorrência × sem pino
     SEM recorrência. c8 é o número que SÓ mora na coluna (44 dos 225 clientes
     da empresa 41 são assim — o cartao dizia "Rua M-7" e o computador
     "Rua M-7, 897") e c9 é o (0,0) que NÃO é pino.
     🔴 A ORDEM É CONTRATO: as cenas marcam por ÍNDICE (`marcar(0)`…), então
     gente nova entra no FIM da fila, nunca no meio. */
  const CLIENTES = [
    { id: 'c1', name: 'Larissa Ype', isCliente: true, endereco: 'Rua 3a, 1354', numero: '1354', cidade: 'Rio Claro', lat: -22.40, lng: -47.55, diasEntrega: [6] },
    { id: 'c2', name: 'Ademir', isCliente: true, endereco: 'Av. 28a, 507', numero: '507', cidade: 'Rio Claro', lat: -22.401, lng: -47.551, diasEntrega: [] },
    { id: 'c3', name: 'Alfredo', isCliente: true, endereco: 'Rua 4-a, 93', numero: '93', cidade: 'Rio Claro', lat: -22.402, lng: -47.552, diasEntrega: [] },
    { id: 'c4', name: 'Ana Alice', isCliente: true, endereco: 'Av. 28a, 507', numero: '507', cidade: 'Rio Claro', lat: -22.403, lng: -47.553, diasEntrega: [] },
    { id: 'c5', name: 'Andreia bicicletaria', isCliente: true, endereco: 'Rua 8 JP, 210', numero: '210', cidade: 'Rio Claro', lat: -22.404, lng: -47.554, diasEntrega: [] },
    { id: 'c6', name: 'Rosa recorrente', isCliente: true, endereco: 'Av 60, 586', numero: '586', cidade: 'Rio Claro', lat: null, lng: null, diasEntrega: [6] },
    { id: 'c7', name: 'Zeca sem porta', isCliente: true, endereco: 'Rua 19, 880', numero: '880', cidade: 'Rio Claro', lat: null, lng: null, diasEntrega: [] },
    { id: 'c8', name: 'Marcos M-7', isCliente: true, endereco: 'Rua M-7', numero: '897', cidade: 'Rio Claro', lat: -22.405, lng: -47.555, diasEntrega: [] },
    { id: 'c9', name: 'Nilda zero zero', isCliente: true, endereco: 'Rua Zero', numero: '10', cidade: 'Rio Claro', lat: 0, lng: 0, diasEntrega: [] },
  ];
  const porId = new Map(CLIENTES.map((c) => [c.id, c]));
  /* 🔴 O SERVIDOR MONTA A LINHA, E ESTE DUBLÊ É O SERVIDOR. Espelho de
     `linhaEnderecoDaFonte` (backend/src/logistica/logistica-geo-fonte.util.ts):
     sem rua é "nº 123"; número já escrito dentro da rua não repete. Stub que
     concatenasse na força bruta devolveria "Rua 3a, 1354, 1354" e a prova
     passaria a medir o dublê, não o app. */
  const linhaDoServidor = (endereco, numero) => {
    const rua = String(endereco == null ? '' : endereco).trim();
    const num = String(numero == null ? '' : numero).trim();
    if (!rua) return num ? `nº ${num}` : '';
    if (!num) return rua;
    const numEsc = num.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^0-9])${numEsc}([^0-9]|$)`).test(rua) ? rua : `${rua}, ${num}`;
  };

  const diaDe = (ymd) => {
    const [a, m, d] = String(ymd).split('-').map(Number);
    const js = new Date(Date.UTC(a, m - 1, d, 12)).getUTCDay();
    return js === 0 ? 7 : js;
  };
  const abertas = () => S.entregas.filter((e) => e.status !== 'entregue' && e.status !== 'cancelada');

  window.HBX = {
    /* 🔴 O DUBLÊ SUBSTITUI O `HBX` INTEIRO — e o caminho do CONFIRMAR precisa de
       `cache` (idempotência + carimbo de chegada) e `uuid`. Sem eles a cena X
       morria num TypeError antes de provar qualquer coisa. Espelho fiel do
       native.js (localStorage com prefixo `hbx:`), porque a cena X também lê a
       marca `fim-visto` ATRAVÉS de navegações — memória de página não serve. */
    cache: {
      get(key, fallback) {
        try { const raw = localStorage.getItem(`hbx:${key}`); return raw ? JSON.parse(raw) : fallback; }
        catch (_) { return fallback; }
      },
      set(key, value) {
        try { localStorage.setItem(`hbx:${key}`, JSON.stringify(value)); } catch (_) {}
      },
      remove(key) { try { localStorage.removeItem(`hbx:${key}`); } catch (_) {} },
    },
    info() { return { sessionScope: 'prova-fluxo:7:9' }; },
    uuid() { window.__uuidSeq = (window.__uuidSeq || 0) + 1; return `prova-${window.__uuidSeq}`; },
    api(caminho, opcoes) {
      const metodo = (opcoes && opcoes.method) || 'GET';
      const corpo = (opcoes && opcoes.body) || null;
      /* O 4º campo é o caminho INTEIRO, com querystring. O 2º continua sem ela
         (todas as cenas comparam rota por igualdade), mas quem precisa provar
         que um GET saiu SEM recorte — o `custo-preview` da cena P — não tem
         outro lugar pra olhar: o `deliveryIds` dele viaja na URL. */
      /* O 5º campo é O VÉU NO INSTANTE DA CHAMADA (16/08). Amostrar o
         `.veu-montar` por relógio não mede nada contra um dublê que responde em
         microtask — a corrente inteira nasce e morre entre duas leituras do
         Playwright (medido: 42 amostras de 120 ms, todas zero, com o véu tendo
         existido de verdade). Carimbar aqui é medir NO EVENTO: o que a cena
         precisa provar é que entre o toque e a rota na rua não houve UMA
         chamada com a tela livre — que é onde caberia o 2º toque que o dono
         mandou matar. */
      window.__chamadas.push([metodo, String(caminho).split('?')[0], corpo, String(caminho),
        !!document.querySelector('.veu-montar')]);
      const q = (nome) => {
        const m = new RegExp(`[?&]${nome}=([^&]*)`).exec(caminho);
        return m ? decodeURIComponent(m[1]) : '';
      };
      const R = (v) => Promise.resolve(JSON.parse(JSON.stringify(v)));
      /* 🔴 O DUBLÊ TAMBÉM PRECISA REJEITAR COM CORPO (10/08). Os contratos
         novos (409 `ROTA_DE_OUTRO_MOTORISTA`, 402 `ASSENTOS_ESGOTADOS`) viajam
         no `body`, não só na mensagem — é o `chamar()` de `00-nucleo.js` que
         copia `e.status`/`e.body` pra frente quando eles existem no motivo da
         rejeição. Um `new Error(texto)` puro (os outros 400 deste dublê)
         chega igual sempre chegou: sem `body`, cai no genérico. */
      const REJ = (status, body) => Promise.reject(Object.assign(
        new Error(String((body && body.message) || '')), { status, body },
      ));

      if (caminho.indexOf('/logistica/config') === 0) {
        // `modoRotaPadrao` é a chave que faz `ehAdmin()` dizer sim — e sem admin
        // os chips de dia nem nascem, que é metade do defeito A.
        return R({ modoRotaPadrao: 'essencial', appModulosDesativados: '' });
      }
      if (caminho.indexOf('/logistica/rota/custo-preview') === 0) {
        if (S.custoComoServidor && !abertas().length) {
          return Promise.reject(new Error('Nenhuma entrega aberta neste dia. Monte a rota antes de iniciar.'));
        }
        return R(S.custo);
      }
      // ANTES do genérico '/logistica/rota' (prefixo engole o específico —
      // foi exatamente assim que este stub nasceu devolvendo rota no historico)
      if (caminho.indexOf('/logistica/rota/historico') === 0) {
        /* O DIALETO REAL do historicoDeRotas (09/08, contrato novo): dias sem
           `date`; com `date`, UMA LINHA POR PORTA, com a bagagem inteira —
           `localId`, as partes do endereço, a `enderecoLinha` já MONTADA pelo
           servidor, pino e `recorrente`. Dublê que devolvesse só `endereco`
           cru (como este devolvia) é vacina que não vacina: o app passaria
           lendo o campo errado e a prova ficaria verde. */
        const d = q('date');
        if (d === '2026-08-07') {
          /* 🔴 O MESMO CLIENTE EM DUAS PORTAS NO MESMO DIA. É o caso que a
             chave por cliente engolia: a segunda porta sumia da lista e a
             entrega nascia no endereço do perfil. Os dois com pino e SEM
             recorrência — assim o silêncio da linha só pode vir do PINO. */
          return R({
            data: d,
            clientes: [
              {
                customerProfileId: 'c8', localId: 'L1', nome: 'Marcos M-7',
                endereco: 'Rua M-7', numero: '897', complemento: '', bairro: 'Cervezao',
                cidade: 'Rio Claro', uf: 'SP', cep: '13503543',
                enderecoLinha: 'Rua M-7, 897',
                lat: -22.405, lng: -47.555, geoFonte: 'gps_cadastro', recorrente: false,
              },
              {
                customerProfileId: 'c8', localId: 'L2', nome: 'Marcos M-7',
                endereco: 'Av 60', numero: '586', complemento: 'Fundos', bairro: 'Centro',
                cidade: 'Rio Claro', uf: 'SP', cep: '13500000',
                enderecoLinha: 'Av 60, 586',
                lat: -22.410, lng: -47.560, geoFonte: 'geocode', recorrente: false,
              },
            ],
          });
        }
        if (d) {
          return R({
            data: d,
            clientes: [
              {
                customerProfileId: 'c3', localId: 'L3', nome: 'Alfredo',
                endereco: 'Rua 4-a', numero: '93', complemento: '', bairro: '',
                cidade: 'Rio Claro', uf: 'SP', cep: '13500111',
                enderecoLinha: 'Rua 4-a, 93',
                lat: -22.402, lng: -47.552, geoFonte: 'gps_cadastro', recorrente: true,
              },
              {
                customerProfileId: 'c7', localId: null, nome: 'Zeca sem porta',
                endereco: 'Rua 19', numero: '880', complemento: '', bairro: '',
                cidade: 'Rio Claro', uf: 'SP', cep: '',
                enderecoLinha: 'Rua 19, 880',
                lat: null, lng: null, geoFonte: null, recorrente: false,
              },
            ],
          });
        }
        return R({ dias: [{ data: '2026-08-08', paradas: 2 }, { data: '2026-08-07', paradas: 2 }] });
      }
      if (caminho.indexOf('/logistica/rota/planejar') === 0 && metodo === 'POST') {
        /* cena R: a 1ª tentativa de planejar bate no 409 — outro motorista já
           montou o dia. `usado` garante que é SÓ a primeira; a que vem depois
           do "Forçar cancelamento e puxar" (que já chamou limpar-dia) entra
           normal. */
        if (S.outroMotorista && !S.outroMotorista.usado) {
          S.outroMotorista.usado = true;
          return REJ(409, {
            code: 'ROTA_DE_OUTRO_MOTORISTA',
            message: `Essa rota já foi montada por: ${S.outroMotorista.motorista}.`,
            montadaPor: S.outroMotorista.motorista,
            podeForcar: !!S.outroMotorista.podeForcar,
            montadores: [{ userId: Number(S.outroMotorista.userId) || 77, nome: S.outroMotorista.motorista }],
            date: S.hoje,
          });
        }
        const manual = corpo && Array.isArray(corpo.ordemManual) ? corpo.ordemManual.map(String) : null;
        // O RECORTE da rota avulsa: com `deliveryIds`, só eles são ordenados —
        // o resto do dia fica como está (é o contrato real do planejar).
        const soIds = corpo && Array.isArray(corpo.deliveryIds) ? corpo.deliveryIds.map(String) : null;
        const fila = abertas().filter((e) => !soIds || soIds.indexOf(String(e.id)) >= 0);
        const ordem = manual
          ? manual.filter((id) => fila.some((e) => e.id === id))
            .concat(fila.map((e) => e.id).filter((id) => manual.indexOf(id) < 0))
          : fila.map((e) => e.id);
        ordem.forEach((id, i) => {
          const e = S.entregas.find((x) => x.id === id);
          if (e) e.rotaOrdem = i;
        });
        /* o servidor REAL deixa a rota PLANNED ao planejar — e é o routeStatus
           que o `estadoDaRota` lê PRIMEIRO. Sem isto o dublê era mais generoso
           que o servidor ao contrário: um montar com recorte deixava a agenda
           de hoje sem ordem e o dock caía em 'montar' (sem o Cancelar), estado
           que o aparelho de verdade nunca vê depois de planejar. */
        S.routeStatus = 'PLANNED';
        return R({ stops: ordem.map((id) => ({ id })) });
      }
      if (caminho.indexOf('/logistica/rota/conferir') === 0) return R({ items: [] });
      if (caminho.indexOf('/logistica/rota/checar-enderecos') === 0) return R({ problemas: [] });
      if (caminho.indexOf('/logistica/rota/continuidade/puxar') === 0 && metodo === 'POST') {
        S.routeStatus = 'PLANNED';
        S.outroMotorista = null;
        return R({ ok: true, date: S.hoje, moved: abertas().length, planningPending: false });
      }
      if (caminho.indexOf('/logistica/rota/continuidade/cancelar') === 0 && metodo === 'POST') {
        /* CENA AA: as cenas W4/W5 medem o RESYNC de 409 — a rejeição é fixa
           (não `usado`, não flip): o toque que a prova faz é sempre o mesmo. */
        if (S.cancelarRejeita) {
          const { status, code, message } = S.cancelarRejeita;
          return REJ(status, Object.assign({ message: message || 'Conflito.' }, code ? { code } : {}));
        }
        const ref = String((corpo && corpo.ref) || '');
        /* 🔴 O DUBLÊ DO CANCELAR MEDE O SERVIDOR, NÃO UMA RÉGUA INVENTADA
           (LOTE 1.3 — a 1ª versão desta parte, do lote 1.2, media a si mesma:
           ver a nota da CENA AD). Espelho literal do
           `logistica-rota-continuidade.service`, e o que decide TUDO é uma
           coisa só: as abertas estão PRESAS nos stops desta rota, ou soltas
           no dia?

             `route:<id>` → `resolve()` monta o alvo com as entregas dos STOPS
                 da rota. Com aberta presa: cancela EXATAMENTE essas. Sem
                 nenhuma (a lápide, e também a PLANNED que um Iniciar
                 abortado deixou pra trás): cai no `diaDoAlvoMorto`, que
                 deriva o DIA e limpa o que estiver aberto nele.
             `draft:<dono>:<data>` → `resolve()` EXCLUI de propósito toda
                 entrega presa em stop de rota com `operationalEndedAt` NULO.
                 Se as abertas estiverem presas numa rota viva, nada resolve:
                 NotFound → a saída graciosa do F5 → `{ok:true, canceladas:0}`
                 SEM cancelar nada. É o NO-OP MUDO, e é ele que a CENA AD
                 existe pra pegar.

           `stopsPresos` é a cena dizendo se a rota congelou os stops
           (Iniciar que chegou até o congelamento) ou não (Iniciar que morreu
           antes / lápide já esvaziada). Sem esse dado o dublê tinha que
           CHUTAR — e chutava pelo `routeStatus`, que é justamente o que o
           servidor real NÃO usa aqui. */
        const rotaViva = () => !!S.routeId && String(S.routeStatus || '').toUpperCase() !== 'ENCERRADA';
        const presasNaRota = () => (S.routeId && S.stopsPresos ? abertas() : []);
        /* o `limparDia` real tira a entrega do DIA (ela sai da resposta de
           `/logistica/rota`) — por isso a linha some daqui, como sempre somiu
           neste dublê. O que muda é só QUAIS linhas: as do alvo, não "todas". */
        const esvaziar = (alvo) => {
          const ids = alvo.map((e) => String(e.id));
          S.entregas = S.entregas.filter((e) => ids.indexOf(String(e.id)) < 0);
          return ids.length;
        };
        if (S.routeId && ref === `route:${S.routeId}`) {
          const presas = presasNaRota();
          if (presas.length) {
            const n = esvaziar(presas);
            /* 🔴 O DUBLÊ ESQUECIA DE ENCERRAR A ROTA NESTE RAMO (16/08). O
               servidor real carimba `operationalEndedAt` na rota VIVA ao
               cancelar (`logistica-rota-continuidade.service`, provado em
               `logistica-rota-continuidade.service.test.ts`, FURO 4: "a rota
               VIVA realmente fica ENCERRADA depois do cancelar") e o
               `/logistica/rota` passa a reportar `routeStatus:'ENCERRADA'`
               (logistica-admin-route-view.service.ts:72). Aqui o status ficava
               como estava — e com uma rota ACTIVE isso vestia o dia cancelado
               de rota na rua ("Dirigindo" no dock). O ramo de baixo já fazia a
               metade certa disto; faltava esta. Só apareceu quando o Montar
               passou a deixar a rota ACTIVE: antes deste lote todo cancelar
               desta cena caía sobre uma PLANNED e o defeito não tinha como
               falar. */
            S.routeStatus = 'ENCERRADA';
            return R({ ok: true, resumo: { canceladas: n } });
          }
          const havia = abertas().length;
          if (!havia) return R({ ok: true, resumo: { canceladas: 0 } });
          const n = esvaziar(abertas());
          // A LINHA da rota fica de pé, só ENCERRADA (operationalEndedAt) —
          // igual ao servidor: `status` comercial não muda por causa do
          // cancelar. 'PLANNED' aqui é só pra provar a W3 (fix C): zero
          // aberta com uma rota não-ACTIVE tem que desenhar "Montar rota".
          S.routeStatus = 'PLANNED';
          return R({ ok: true, resumo: { canceladas: n } });
        }
        if (ref.indexOf('draft:') === 0) {
          // o `resolve()` do ramo draft: só enxerga o que NÃO está preso em
          // stop de rota viva. Zero visível = NotFound = saída graciosa do F5.
          const soltas = rotaViva() && S.stopsPresos ? [] : abertas();
          if (!soltas.length) return R({ ok: true, resumo: { canceladas: 0 } });
          return R({ ok: true, resumo: { canceladas: esvaziar(soltas) } });
        }
        S.entregas = []; S.routeStatus = '';
        return R({ ok: true, resumo: { canceladas: 1 } });
      }
      if (caminho.indexOf('/logistica/rota/continuidade') === 0 && metodo === 'GET') {
        const refAtual = `draft:9:${S.hoje}`;
        const outro = S.outroMotorista && S.outroMotorista.usado ? {
          ref: `draft:${Number(S.outroMotorista.userId) || 77}:${S.hoje}`,
          date: S.hoje,
          dateLabel: 'Hoje',
          owner: { id: Number(S.outroMotorista.userId) || 77, name: S.outroMotorista.motorista },
          remaining: abertas().length,
          state: 'planned',
          canOpen: true,
          canContinue: false,
          canPull: true,
          canCancel: true,
        } : null;
        return R({
          today: S.hoje,
          scopeKey: '7:9',
          ownedRefs: abertas().length && S.routeStatus ? [refAtual] : [],
          items: outro ? [outro] : [],
          primary: outro,
          hiddenCount: 0,
          hasMore: false,
        });
      }
      if (caminho.indexOf('/logistica/rota/iniciar') === 0 && metodo === 'POST') {
        /* cena S: a 1ª tentativa de iniciar bate no 402 — assentos esgotados
           hoje. `usado` garante que é SÓ a primeira; comprar o passe zera
           `S.assentos` (ver `passe-do-dia` abaixo) e a 2ª tentativa entra. */
        if (S.assentos && !S.assentos.usado) {
          S.assentos.usado = true;
          return REJ(402, {
            code: 'ASSENTOS_ESGOTADOS',
            message: S.assentos.message || 'Assentos esgotados hoje.',
            podeComprarPasse: !!S.assentos.podeComprarPasse,
            passeCreditos: Number(S.assentos.passeCreditos) || 0,
          });
        }
        if (!abertas().length) return Promise.reject(new Error('Não há entregas abertas para iniciar.'));
        const soIniciar = corpo && Array.isArray(corpo.deliveryIds) ? corpo.deliveryIds.map(String) : null;
        abertas().filter((e) => !soIniciar || soIniciar.indexOf(String(e.id)) >= 0)
          .forEach((e, i) => { e.rotaOrdem = i; });
        S.routeStatus = 'ACTIVE';
        S.custo = Object.assign({}, S.custo, { blocosJaDebitados: S.custo.blocosTotais, creditosAIniciar: 0 });
        return R({ ok: true });
      }
      /* 🔴 AS PORTAS DO FIM DO DIA (12/08). Nenhuma das três existia aqui: elas
         caíam no `R({})` do fim do dublê, então TODO fechar dava certo — até o
         do dia sem venda nenhuma — e o `routeStatus` nunca mudava. Dublê
         complacente é prova que não reprova.

         `encerrar` é o espelho do `encerrarRota` do servidor: devolve a aberta
         pra pendência SEM ordem (`rotaOrdem: null`) e encerra a rota
         operacionalmente — o app lê qualquer coisa != ACTIVE como encerrada. */
      if (caminho.indexOf('/logistica/rota/encerrar') === 0 && metodo === 'POST') {
        abertas().forEach((e) => { e.rotaOrdem = null; e.status = 'agendada'; });
        S.routeStatus = 'ENCERRADA';
        return R({ ok: true });
      }
      /* `finalizar` salva a página do dia como Rota salva — e o servidor REJEITA
         com 400 quando não há nada entregue pra salvar. É o beco em que ficava
         preso quem rodou o dia inteiro sem vender. */
      if (caminho.indexOf('/logistica/fechamento/finalizar') === 0 && metodo === 'POST') {
        if (!S.entregas.some((e) => e.status === 'entregue')) {
          return REJ(400, { message: 'Nada registrado neste dia ainda.' });
        }
        S.fechou += 1;
        return R({ ok: true, dia: corpo && corpo.dia, clientes: 1 });
      }
      /* O DESFECHO DE UMA PARADA — é ele que zera as abertas e faz a última
         entrega ser A ÚLTIMA. Precisa vir ANTES do `/logistica/entregas` POST
         genérico (que CRIA entrega): os dois caminhos começam igual, e na ordem
         errada "confirmar" cadastraria gente nova. */
      if (metodo === 'POST' && /^\/logistica\/entregas\/[^/?]+\/confirmar/.test(caminho)) {
        const id = caminho.split('?')[0].split('/')[3];
        const alvo = S.entregas.find((e) => String(e.id) === decodeURIComponent(id));
        if (alvo) alvo.status = 'entregue';
        return R({ ok: true });
      }
      if (caminho.indexOf('/logistica/rota/limpar-dia') === 0) {
        S.entregas = []; S.routeStatus = '';
        // cena R: forçar cancelamento resolve o conflito — a próxima montagem
        // (o "refaz o montar automaticamente" do portão) não bate mais no 409.
        if (S.outroMotorista) S.outroMotorista.usado = true;
        return R({ ok: true });
      }
      /* cena S: o passe do dia — a única ação do portão 402. Compra libera o
         bloqueio (`S.assentos = null`) e a "ação original" que o portão refaz
         sozinho encontra o caminho livre. */
      if (caminho.indexOf('/logistica/rota/passe-do-dia') === 0 && metodo === 'POST') {
        S.assentos = null;
        S.passeComprado += 1;
        return R({ ok: true });
      }
      /* O GERADOR ÚNICO do servidor (`materializeForRoute`): cria a entrega do
         dia a partir da AGENDA, idempotente por cliente — quem já tem entrega
         aberta hoje não ganha outra (espelho da chave de ocorrência). É a porta
         que o montar do app passou a chamar em 10/08, quando um limpar-dia
         deixou a segunda com 102 canceladas e o Iniciar preso no "Nenhuma
         entrega aberta". */
      if (caminho.indexOf('/logistica/mobile/materialize') === 0 && metodo === 'POST') {
        /* 🔴 CONTRATO NOVO (10/08): `criadas` sozinho não dizia POR QUE alguém
           ficou de fora — e foi essa a frase genérica que travou o dono. Agora
           quem tem `pausado`/`semEndereco` na agenda vira AVISO nomeado, não
           silêncio; é este `avisos` que a cena Q mede chegando no portão. */
        const alvo = (S.agendaHoje || []);
        let criadas = 0; let puladas = 0; const avisos = [];
        alvo.forEach((c) => {
          const aberta = S.entregas.some((e) => e.status !== 'entregue' && e.status !== 'cancelada'
            && e.cliente && String(e.cliente.id) === String(c.customerProfileId));
          if (aberta) { puladas += 1; return; }
          if (c.pausado) { puladas += 1; avisos.push(`${c.nome}: cliente pausado`); return; }
          if (c.semEndereco) { puladas += 1; avisos.push(`${c.nome}: sem endereço cadastrado`); return; }
          S.seq += 1;
          criadas += 1;
          S.entregas.push({
            id: `g${S.seq}`, status: 'agendada', rotaOrdem: null, origem: 'recorrente',
            cliente: {
              id: String(c.customerProfileId), nome: c.nome, enderecoLinha: c.enderecoLinha,
              lat: c.lat, lng: c.lng,
            },
          });
        });
        return R({ criadas, puladas, avisos });
      }
      if (caminho.indexOf('/logistica/rota-modelos') === 0) return R([]);
      if (caminho.indexOf('/logistica/rota') === 0 && metodo === 'GET') {
        return R({
          date: S.hoje,
          routeStatus: S.routeStatus,
          // A ROTA FANTASMA (15/08): o servidor de verdade publica `routeId`
          // pra QUALQUER rota do motorista+dia, viva ou morta (é exatamente o
          // que fabricava a ref fantasma) — o dublê passa a fazer o mesmo,
          // opt-in por cena (ver `routeId` no destructuring da PONTE).
          routeId: S.routeId,
          items: S.entregas.map((e) => ({
            id: e.id, status: e.status, rotaOrdem: e.rotaOrdem, origem: e.origem,
            cliente: e.cliente, quantidade: 1,
            entregador: { id: 9, nome: 'Motorista Prova' },
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
          // MULTILOCAL: o servidor guarda a porta que veio no corpo (o DTO já
          // aceita `localId`) — sem ela a entrega nasce no endereço do perfil.
          localId: corpo.localId ? String(corpo.localId) : null,
          cliente: {
            id: String(c.id), nome: c.name, endereco: c.endereco, numero: c.numero,
            cidade: c.cidade, lat: c.lat, lng: c.lng,
            // o `listRota` manda a linha PRONTA (linhaEnderecoDaFonte) — é ela
            // que o cartão lê, na montagem e na lista da rota.
            enderecoLinha: linhaDoServidor(c.endereco, c.numero),
          },
        });
        return R({ id });
      }
      /* ---- O PAINEL DA BUSCA (F2, 12/08 — PR12082026) --------------------
         O dialeto REAL da F1: três grupos + `escopo`. A tela do painel tem
         prova própria (`prova-painel-avulsa.js`) e não é medida aqui; o dublê
         responde para que abrir a porta "Procurar" no meio de qualquer cena
         daqui não vire silêncio de rede — dublê que devolve `{}` numa porta
         que existe é o defeito que faz a prova medir uma tela quebrada e
         chamar de comportamento.
         A ORDEM IMPORTA: `/busca/porta` antes de `/busca`, senão o prefixo
         engole o específico (a mesma pegadinha do `/rota/historico`). */
      if (caminho.indexOf('/logistica/busca/porta') === 0) {
        const n = Number(String(q('numero')).replace(/\D+/g, ''));
        return R({
          fonte: 'cnefe', precisao: n ? 'porta' : 'via', via: q('via'),
          numero: n || null, lat: -22.4102, lng: -47.5602, cep: '13500123',
        });
      }
      if (caminho.indexOf('/logistica/busca') === 0) {
        const alvo = q('q').toLowerCase();
        const achados = alvo ? CLIENTES.filter((c) => c.name.toLowerCase().indexOf(alvo) >= 0) : [];
        return R({
          q: q('q'),
          grupos: {
            clientes: achados.map((c) => ({
              id: String(c.id), nome: c.name, endereco: c.endereco, numero: c.numero || null,
              bairro: null, cidade: c.cidade || 'Rio Claro', uf: 'SP', cep: null,
              lat: c.lat, lng: c.lng, distM: 500, ultimaEntregaEm: null, score: 0.9,
            })),
            enderecos: [],
            comercios: [],
          },
          fontes: { clientes: achados.length ? 'ok' : 'vazio', enderecos: 'vazio', comercios: 'vazio' },
          escopo: { comGps: true, codMunicipio: '3543907', cidade: 'rio claro', uf: 'SP' },
        });
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
/* cena Q: uma agenda de hoje onde NINGUÉM vira entrega — os dois têm motivo,
   e o motivo tem nome. É o dia que o dono viveu em 10/08: o materialize passa
   vazio e o "Nenhuma entrega aberta" genérico precisa virar recado nomeado. */
const AGENDA_SO_AVISOS = [
  { customerProfileId: 'w1', nome: 'Wagner Pausado', enderecoLinha: 'Rua W, 1', bairro: 'Centro', lat: -22.40, lng: -47.55, itens: [], pausado: true },
  { customerProfileId: 'w2', nome: 'Wanda Sem Endereco', enderecoLinha: '', bairro: '', lat: null, lng: null, itens: [], semEndereco: true },
];

const ok = [];
const falhou = [];
const notas = [];
const eh = (nome, cond) => (cond ? ok : falhou).push(nome);
const nota = (t) => notas.push(t);
const SO_MEDIR = process.argv.includes('--antes');

(async () => {
  /* 🔴 O GERADO PRIMEIRO (LOTE 1.4): esta prova abre `assets/app/**`, que é
     SAÍDA de `ponte-costurar`/`casca-injetar`. Sem regenerar, ela mede o
     gerado que estiver no disco — e um red-first feito na FONTE sai VERDE
     sobre código velho. Ver `scripts/_regenerar.js`. */
  regenerarGerados();
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
    /* O boot real faz `carregarRota` contra a API de verdade; aqui o dublê
       chegou DEPOIS do boot, então a releitura é pedida pela mesma porta que a
       ponte já expõe. Antes de 10/08 quem tapava este buraco era o auto-montar
       da entrada da Montagem — que morreu de propósito (entrar não grava). */
    await p.evaluate(() => window.HBXRota && window.HBXRota.carregar());
    await p.waitForTimeout(700);
  };

  const espiar = () => p.evaluate(() => ({
    tela: (function () { try { return atual; } catch (e) { return null; } })(),
    linhas: [...document.querySelectorAll('.stops .stop .who strong')].map((e) => e.textContent.trim()),
    /* A LINHA DE ENDEREÇO DO CARTÃO. No `stop()` do mock o `.who` é
       <strong>nome</strong><span>rua</span><span>bairro</span> — a rua é o 2º
       filho. É este texto que o dono compara com o computador; medir só o nome
       deixaria o endereço divergir sem ninguém ver. */
    ruas: [...document.querySelectorAll('.stops .stop .who')]
      .map((e) => ((e.children[1] || {}).textContent || '').trim()),
    // a ROUPA da rota de hoje: hora prevista e pílula de status. Numa PRÉVIA de
    // outro dia nada disso pode existir — a entrega daquele dia nem nasceu.
    horas: [...document.querySelectorAll('.stops .stop .hh')].map((e) => e.textContent.trim()).filter(Boolean),
    pills: [...document.querySelectorAll('.stops .stop .pill')].map((e) => e.textContent.trim()).filter(Boolean),
    pernas: [...document.querySelectorAll('.stops .perna, .stops .leg')].map((e) => e.textContent.trim()).filter(Boolean),
    nStops: document.querySelectorAll('.stops .stop').length,
    // as três peças que o dono mandou tirar da Montagem em 09/08. Ficam MEDIDAS
    // (e não apagadas da prova): portão que só cobra o que existe não percebe
    // desenho voltando sozinho numa fusão.
    chips: [...document.querySelectorAll('[data-acao="montar-dia"]')].map((e) => [e.textContent.trim(), e.classList.contains('on') ? 1 : 0]),
    creditos: document.querySelectorAll('.creditos').length,
    gruposAvulsa: [...document.querySelectorAll('.grupo')]
      .map((e) => e.textContent.trim()).filter((t) => /avulsa/i.test(t)).length,
    pe: (document.querySelector('.pe-montagem .go b') || {}).textContent || '',
    vazio: (document.querySelector('.vazio strong') || {}).textContent || '',
    portao: (document.querySelector('.portao h3') || {}).textContent || '',
    /* 🔴 O RECADO DO PORTÃO MORA NO SUB, NÃO NO TÍTULO. A 1ª versão da cena M
       cobrava a ausência do aviso lendo só o `h3` — e passava com o portão
       ABERTO na tela, porque a frase que o dono fotografou ("Ela abre sozinha
       quando o dia chegar") é o subtítulo. Asserção de ausência que lê o lugar
       errado é asserção que nunca reprova. */
    portaoSub: (document.querySelector('.portao .sub') || {}).textContent || '',
    // cena Q: os avisos nomeados do materialize vão no `corpo` (não no `sub`
    // — é lista, uma linha por cliente, `<br>` entre elas).
    portaoCorpo: (document.querySelector('.portao .corpo') || {}).innerHTML || '',
    portaoBotoes: [...document.querySelectorAll('.portao-wrap button')].map((e) => e.textContent.trim()),
    aviso: (document.querySelector('.aviso-card strong, .aviso strong') || {}).textContent || '',
    // 16/08 — o rotulo do meio saiu de DENTRO do botao (era `<b>`) e virou o
    // `<small>` de fora, igual ao dos sateites: o botao hoje so tem o icone.
    // O `<b>` fica na lista por seguranca, mas quem responde e o `small`.
    dock: (document.querySelector('.tmx-main small, .tmx-main b, .tmx-main .rot') || {}).textContent || '',
    entregasNoServidor: window.__S.entregas.length,
    routeStatus: window.__S.routeStatus,
    // cena V/W: quantas vezes o dia foi REGISTRADO, e as peças do fim.
    fechou: window.__S.fechou,
    heroi: (document.querySelector('.vazio strong') || {}).textContent || '',
    heroiSub: [...document.querySelectorAll('.vazio span')].map((e) => e.textContent.trim()).filter(Boolean),
    // 16/08 — o satelite do dock deixou de ser o "Finalizar" (porta) e virou o
    // "Encerrar dia", no MESMO gancho do botao da tela de Fechamento. Por isso
    // os dois espioes abaixo sao ESCOPADOS: sem escopo, `[data-acao=fechar-dia]`
    // passou a casar em dois lugares e o querySelector pegaria o primeiro do
    // DOM — a prova mediria o satelite achando que media a tela.
    // 🔴 E NO MESMO DIA ELE MUDOU DE FILEIRA (ordem do dono): saiu do dock e
    // virou o cadeado da COLUNA lateral, que e a mesma peca nos dois modos
    // (`.plano-lado` no 2D, `.gps-lado` no 3D). O escopo acompanha o botao —
    // continua escopado pela mesma razao, so que no lugar onde ele mora hoje.
    temEncerrarDia: document.querySelectorAll(
      /* 🔴 O CADEADO MUDOU DE FILEIRA DE NOVO EM 17/08, e agora e o "Finalizar"
         do RODAPE (item 8 do dono: *"os botoes de navegacao vao precisar incluir
         +1, q e o finalizar... painel de 4 botoes"*). Em 16/08 ele tinha ido pra
         COLUNA porque o dock tinha 3 lugares e o Registrar ficou com a vaga do
         satelite; com QUATRO lugares nao ha disputa. O escopo acompanha o botao:
         o cru `[data-acao="fechar-dia"]` casaria tambem no portao do fim do dia,
         e o primeiro do DOM nem sempre e o que a cena quer tocar. */
      '.gps-rodape [data-acao="fechar-dia"]').length,
    // O `dock` acima lê só o botão do MEIO; o rótulo do satélite mora no <small>
    // ao lado dele, e é ele que o dono lê na tela.
    satelites: [...document.querySelectorAll('.tmx-sat small')].map((e) => e.textContent.trim()),
    temFecharDia: document.querySelectorAll('.act[data-acao="fechar-dia"]').length,
  }));
  const posts = () => p.evaluate(() => window.__chamadas.filter((c) => c[0] === 'POST').map((c) => c[1]));
  /* os POSTs COM O CORPO. "Saiu o POST" não prova nada quando o defeito é um
     campo faltando dentro dele — era assim que a entrega nascia na porta
     errada com a lista mostrando a certa. */
  const postsDe = (rota) => p.evaluate((r) => window.__chamadas
    .filter((c) => c[0] === 'POST' && c[1] === r).map((c) => c[2]), rota);
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
  /* 🔴 ENTRAR NÃO CARREGA MAIS O DIA (dono, 10/08, com a foto: "ao entrar no
     montagem de rota, não carregar o dia automaticamente"). A Montagem abre no
     estado SEM DIA (a rota avulsa), e a lista do dia é um TOQUE no chip — então a
     cena que fala do DIA passa a fazer o gesto que o dono faz. Quem fala do
     rascunho/avulsa continua entrando direto: é lá que ela mora. */
  const abrirDiaDeHoje = async (ms) => {
    await irPara('montagem', ms);
    await tocarChip(0);
  };

  /* ===================================================================
     CENA A — MONTAGEM: 3 avulsas de hoje + os chips de dia

     🔴 OS CHIPS SAÍRAM E VOLTARAM NO MESMO DIA (09/08): o dono mandou tirar
     ("remova os dias da semana, estamos em avulsas") e, vendo a tela sem eles,
     mandou devolver ("os dias tem q ficar sim"). Esta cena voltou inteira com
     eles. O que a faxina deixou de herança são as duas asserções de AUSÊNCIA
     no fim (A7/A8): a linha de crédito e o cabeçalho "Rota avulsa" seguem
     FORA, e peça removida vira asserção negativa no portão que a dirigia —
     senão o desenho volta sozinho numa fusão, calado.
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
  nota(`    linha de credito=${tA0.creditos} · cabecalho avulsa=${tA0.gruposAvulsa}`);

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
     o "Dom" fantasma que ele reprovou na tela. */
  eh('A6 · chip de dia só nasce da AGENDA (a avulsa de hoje não cria outro chip)',
    tA0.chips.length === 2 && !tA0.chips.some((c) => c[0] === 'Hoje'), tA0.chips.map((c) => c[0]).join(' '));
  /* As duas HERANÇAS da faxina: o que o dono mandou tirar continua fora. O
     avulso segue no TOPO sem precisar de rótulo — quem ordena é a partição da
     ponte (`clientesOrdenados`), nunca o cabeçalho. */
  eh('A7 · nenhum cabecalho "Rota avulsa" na lista', tA0.gruposAvulsa === 0, `cabecalhos=${tA0.gruposAvulsa}`);
  eh('A8 · nenhuma linha de credito na Montagem', tA0.creditos === 0, `linhas=${tA0.creditos}`);

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
  /* 🔴 A LINHA É A DO SERVIDOR, INTEIRA. O histórico manda `enderecoLinha`
     montada lá (rua + número) e as partes ao lado. O app lia o `endereco` cru
     e o cartão perdia o número — "Rua 4-a" onde o computador diz "Rua 4-a, 93". */
  eh('H6 · o cartao mostra a enderecoLinha DO SERVIDOR (com numero)',
    tH.ruas[0] === 'Rua 4-a, 93' && tH.ruas[1] === 'Rua 19, 880', tH.ruas.join(' | '));

  /* ===================================================================
     CENA J — REUTILIZAR UM DIA LEVA A PORTA JUNTO (09/08).

     Duas coisas na mesma cena, porque são o mesmo defeito visto de dois
     lados: o dia 07/08 tem o MESMO cliente em DUAS portas (`localId` L1 e
     L2), os dois com pino e SEM recorrência.
     · A chave por cliente engolia a segunda porta — a lista mostrava 1 onde
       o dia teve 2.
     · O `POST /logistica/entregas` ia SEM `localId` — a entrega nascia no
       endereço do PERFIL sabendo de qual porta o dia veio, e o motorista
       ia pra porta errada com a tela mostrando a certa.
     Sem recorrência nenhuma, o silêncio da linha só pode vir do PINO: é
     assim que esta cena prova que a bagagem viajou, e não o `resolveSozinho`.
     =================================================================== */
  await cena({});
  await irPara('rota', 900);
  await irPara('montagem');
  await zerar();
  await p.evaluate(() => {
    const lista = document.querySelectorAll('[data-acao="historico-usar"]');
    if (lista.length < 2) throw new Error(`o historico so tem ${lista.length} dia(s)`);
    lista[1].click();                      // 07/08 — o dia das duas portas
  });
  await p.waitForTimeout(2200);
  const tJ = await espiar();
  const flagsJ = tJ.pernas.filter((t) => /não sei onde fica/i.test(t));
  const trechosJ = tJ.pernas.filter((t) => /\d\s*(m|km)/.test(t));
  nota(`[J] reutilizar 07/08 (2 portas do mesmo cliente): stops=${tJ.nStops} · linhas: ${tJ.linhas.join(' | ')}`);
  nota(`    ruas: ${tJ.ruas.join(' | ')} · avisos=${flagsJ.length} · trechos medidos=${JSON.stringify(trechosJ)}`);
  eh('J1 · o mesmo cliente em DUAS portas vira DUAS linhas', tJ.nStops === 2, `stops=${tJ.nStops}`);
  eh('J2 · cada porta com o SEU endereco (a linha do servidor)',
    tJ.ruas[0] === 'Rua M-7, 897' && tJ.ruas[1] === 'Av 60, 586', tJ.ruas.join(' | '));
  eh('J3 · o pino viajou junto: nenhuma linha diz "nao sei onde fica"',
    flagsJ.length === 0, `avisos=${flagsJ.length}`);
  eh('J4 · e o trecho entre as duas portas foi MEDIDO (so ha trecho com os 2 pinos)',
    trechosJ.length >= 1, JSON.stringify(trechosJ));

  await zerar();
  /* 🔴 ESPERAR O BOTÃO EXISTIR, NUNCA UM RELÓGIO (mesma lei do `marcar`). Abrir
     a Montagem já MANDA montar (o otimizador roda no carregamento), e enquanto
     ela monta o pé é o "Montando…" — um botão sem gancho, de propósito. Sono
     fixo aqui dá prova intermitente que culpa o app pelo relógio da bancada. */
  await p.waitForSelector('.pe-montagem [data-acao="iniciar-rota"], .pe-montagem [data-acao="montar-agora"]', { timeout: 8000 })
    .catch(async () => {
      // e quando ele REALMENTE não vier, o erro diz o que a tela mostrava.
      const oQueTinha = await p.evaluate(() => [...document.querySelectorAll('.pe-montagem')]
        .map((e, i) => `pe#${i}:` + [...e.querySelectorAll('button')]
          .map((x) => `[${x.dataset.acao || x.dataset.ir || '(sem gancho)'}]`).join('')).join(' ')
        + ' | montando=' + JSON.stringify((DADOS.rota || {}).montando)
        + ' | erros=' + JSON.stringify(window.__erros));
      throw new Error(`sem "Iniciar rota"/"Montar rota" no pe da montagem; ${oQueTinha}`);
    });
  await p.evaluate(() => {
    document.querySelector('.pe-montagem [data-acao="iniciar-rota"], .pe-montagem [data-acao="montar-agora"]').click();
  });
  await p.waitForTimeout(2800);
  const corposJ = await postsDe('/logistica/entregas');
  const tJ2 = await espiar();
  nota(`[J] materializar: POSTs /logistica/entregas=${corposJ.length} · localIds=${JSON.stringify(corposJ.map((c) => c && c.localId))}`);
  nota(`    entregas no servidor=${tJ2.entregasNoServidor} · routeStatus=${tJ2.routeStatus}`);
  eh('J5 · as DUAS portas viraram entrega', corposJ.length === 2, `posts=${corposJ.length}`);
  eh('J6 · e cada POST levou o SEU localId',
    corposJ.length === 2 && String(corposJ[0].localId) === 'L1' && String(corposJ[1].localId) === 'L2',
    JSON.stringify(corposJ.map((c) => c && c.localId)));

  /* ===================================================================
     CENA K — O NÚMERO QUE SÓ MORA NA COLUNA `numero` (09/08).

     44 dos 225 clientes da empresa 41 (20%) têm o número só ali. O cartão
     do celular mostrava "Rua M-7" onde o computador mostra "Rua M-7, 897" —
     endereço é DADO, e dado não pode mudar de valor conforme a tela.
     A cena cobra a MESMA linha nas TRÊS origens da lista: a da AGENDA
     (`dia-preview`, linha pronta do servidor), a do RASCUNHO (escolher na
     mão em "Meus clientes", onde só chegam as PARTES) e a do HISTÓRICO
     (linha pronta do servidor, medida na cena J e repetida aqui de perto).
     =================================================================== */
  const AGENDA_M7 = [{
    customerProfileId: 'c8', localId: 'L1', nome: 'Marcos M-7',
    endereco: 'Rua M-7', numero: '897', bairro: 'Cervezao', cidade: 'Rio Claro',
    enderecoLinha: 'Rua M-7, 897', lat: -22.405, lng: -47.555, resolveSozinho: true, itens: [],
  }];
  await cena({ agendaHoje: AGENDA_M7 });
  await abrirDiaDeHoje();     // a linha medida aqui é a da AGENDA: o dia é um toque (F4)
  const tK0 = await espiar();
  nota(`[K] agenda: ruas=${JSON.stringify(tK0.ruas)}`);
  eh('K1 · AGENDA: o cartao mostra "Rua M-7, 897"', tK0.ruas[0] === 'Rua M-7, 897', tK0.ruas.join(' | '));

  await cena({});
  await irPara('montagem');
  await irPara('rapida', 900);
  await marcar(7);                          // c8 — numero so na coluna
  await p.evaluate(() => document.querySelector('[data-acao="rapida-adicionar-escolhidos"]').click());
  await p.waitForTimeout(2000);
  const tK1 = await espiar();
  nota(`[K] rascunho ("Meus clientes"): ruas=${JSON.stringify(tK1.ruas)}`);
  eh('K2 · RASCUNHO: a porta "Meus clientes" monta a linha com o numero',
    tK1.ruas[0] === 'Rua M-7, 897', tK1.ruas.join(' | '));
  /* 🔴 E NÃO REPETE O QUE JÁ ESTÁ ESCRITO. O legado grava "Rua 3a, 1354" na
     rua E 1354 na coluna; concatenar na força bruta viraria
     "Rua 3a, 1354, 1354" na cara do motorista. */
  await p.evaluate(() => {
    const x = document.querySelector('.portao-wrap .principal');
    if (x) x.click();
  });
  await p.waitForTimeout(400);
  await irPara('rapida', 900);
  await marcar(0);                          // c1 — numero JÁ dentro do texto da rua
  await p.evaluate(() => document.querySelector('[data-acao="rapida-adicionar-escolhidos"]').click());
  await p.waitForTimeout(2000);
  const tK2 = await espiar();
  nota(`[K] numero ja no texto: ruas=${JSON.stringify(tK2.ruas)}`);
  eh('K3 · numero ja escrito na rua NAO é repetido',
    tK2.ruas.indexOf('Rua 3a, 1354') >= 0 && !tK2.ruas.some((r) => /1354.*1354/.test(r)),
    tK2.ruas.join(' | '));

  /* ===================================================================
     CENA L — (0,0) NÃO É PINO, E A RÉGUA É UMA SÓ (09/08).

     `pinoValido` nasceu porque esta mesma pergunta estava escrita de seis
     jeitos no `ponte.js` — e as cópias da montagem deixavam o par (0,0)
     passar: zero é FINITO, então `isFinite` não barra o que o `truthy`
     barrava de graça. Um cliente com (0,0) virava um ponto no Golfo da
     Guiné e a câmera abria de Rio Claro até o Senegal (medido no g15).
     Aqui a régua se mede pela TELA: os dois clientes são iguais em tudo
     (sem recorrência, endereço completo) — só a coordenada muda.
     =================================================================== */
  await cena({});
  await irPara('montagem');
  await irPara('rapida', 900);
  await marcar(7); await marcar(8);         // c8 (pino real) e c9 (0,0)
  await p.evaluate(() => document.querySelector('[data-acao="rapida-adicionar-escolhidos"]').click());
  await p.waitForTimeout(2000);
  const tL = await espiar();
  const flagsL = tL.pernas.filter((t) => /não sei onde fica/i.test(t));
  nota(`[L] pino real x (0,0): stops=${tL.nStops} · linhas: ${tL.linhas.join(' | ')} · avisos=${flagsL.length}`);
  eh('L1 · os dois entraram na lista', tL.nStops === 2, `stops=${tL.nStops}`);
  eh('L2 · (0,0) é recusado como pino: UMA linha avisa "nao sei onde fica"',
    flagsL.length === 1, `avisos=${flagsL.length}`);
  /* quem sobra em cima é quem TEM pino: sem pino a linha vai pro FIM da fila
     (`encadearPorDistancia`), então o (0,0) tem que ser o ÚLTIMO. */
  eh('L3 · coordenada real é aceita e ordena na frente do (0,0)',
    /Marcos/.test(tL.linhas[0] || '') && /Nilda/.test(tL.linhas[1] || ''), tL.linhas.join(' | '));
  await p.evaluate(() => {
    const x = document.querySelector('.portao-wrap .principal');
    if (x) x.click();
  });
  await p.waitForTimeout(400);

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
  /* 🔴 INICIAR É UM GESTO SÓ (dono, 10/08: "clico em iniciar, o botão muda para
     navegar NÃO QUERO — é iniciar de uma vez só"). O contrato antigo — dock
     morfando pra "Navegar" e esperando um 2º toque — morreu; o toque entra
     DIRETO na navegação. */
  eh('D4 · o toque entra DIRETO na navegação (tela mapa)', tD2.tela === 'mapa', `tela=${tD2.tela}`);
  /* O véu pedido soma duas pinturas controladas: entrar e sair. A régua
     continua pegando repinte livre — qualquer sexta camada volta a gritar. */
  /* 🔴 5 VIROU 6 EM 16/08, e a camada tem NOME: o cadeado do "Encerrar dia",
     que desceu do dock pra coluna lateral por ordem do dono. Cada botao de
     `.gps-lado` anima sozinho (`mvPop`, regra la no alto do mock), entao a
     coluna de 3 virou 4 e a conta subiu 1 — nao e repinte solto, e uma peca a
     mais na cena, CONFERIDA olhando a regra que anima e nao chutando o teto.
     O tempo NAO regrediu junto: `prova-navegar` seguiu 17/17 com a maior tarefa
     em 252ms (teto 400) e `prova-ir-e-vir` 9/9. A regua continua pegando
     repinte livre — qualquer SETIMA camada volta a gritar. */
  eh('D6 · só as 2 pinturas do véu além da troca rota→mapa',
    pinturas <= 6,
    `camadas=${pinturas}`);

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
  await abrirDiaDeHoje();
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
  eh('F2 · iniciar pela montagem tambem cai DIRETO na navegação, rota ACTIVE',
    tF2.routeStatus === 'ACTIVE' && tF2.tela === 'mapa', `tela=${tF2.tela} status=${tF2.routeStatus}`);

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

  /* ===================================================================
     CENA G — O DIA CANCELADO EM MASSA RENASCE NO MONTAR (10/08, madrugada).

     A cena real do dono: um `limpar-dia` às 00:44 deixou a segunda-feira com
     102 canceladas e ZERO abertas; a Montagem seguia mostrando a prévia da
     AGENDA (6 nomes) e o Iniciar respondia *"Nenhuma entrega aberta neste
     dia. Monte a rota antes de iniciar."* — e NENHUM botão do app novo
     materializava (o app velho falava `/logistica/gerar-dia`; o fio morreu
     na fusão; o cron do servidor é 1×/dia).
     O contrato novo: entrar na Montagem chama `mobile/materialize` ANTES do
     planejar — a agenda vira entrega, o pé vira "Iniciar rota" de verdade e
     o Iniciar sai pra rua sem tocar no 400.
     =================================================================== */
  await cena({ entregas: [], agendaHoje: AGENDA_HOJE, custoComoServidor: true, mesmaBase: true });
  await zerar();
  // entrar + TOCAR O CHIP DE HOJE: desde 10/08 é o toque que traz o dia (F4).
  await abrirDiaDeHoje(2600);
  const tG0 = await espiar();
  const postsG = await posts();
  nota(`[G] dia morto → montagem: stops=${tG0.nStops} · entregas no servidor=${tG0.entregasNoServidor} · pe="${tG0.pe}"`);
  nota(`    POSTs da entrada: ${postsG.join(' , ') || '(nenhum)'} · portao="${tG0.portao}"`);
  /* 🔴 ENTRAR NÃO GRAVA (dono, 10/08: "montar rota, voltar. ROTA JÁ FOI
     GERADA. pq?"). A 1ª versão desta cena cobrava o contrário — materialize na
     ENTRADA — e foi exatamente o comportamento que o dono reprovou na tela no
     mesmo dia: abrir e voltar deixava rota montada, e cancelar deixava de
     valer (o dia renascia sozinho, "fica piscando"). O materialize é do DEDO. */
  eh('G1 · entrar + escolher o dia NAO cria nada no servidor',
    postsG.indexOf('/logistica/mobile/materialize') < 0
    && postsG.indexOf('/logistica/rota/planejar') < 0
    && tG0.entregasNoServidor === 0, `posts=${postsG.join(',')} entregas=${tG0.entregasNoServidor}`);
  eh('G2 · o dia escolhido mostra a AGENDA pra decidir (prévia, não entrega)',
    tG0.nStops === AGENDA_HOJE.length, `stops=${tG0.nStops}`);
  await zerar();
  await p.waitForSelector('.pe-montagem [data-acao="iniciar-rota"]', { timeout: 8000 });
  await p.evaluate(() => document.querySelector('.pe-montagem [data-acao="iniciar-rota"]').click());
  await p.waitForTimeout(2200);
  const tG1 = await espiar();
  const postsG1 = await posts();
  nota(`[G] iniciar: POSTs=${postsG1.join(' , ')} · portao="${tG1.portao || '(nenhum)'}" · routeStatus=${tG1.routeStatus} · tela=${tG1.tela}`);
  eh('G3 · o INICIAR materializa o dia morto (a porta que faltava, no dedo)',
    postsG1.indexOf('/logistica/mobile/materialize') >= 0
    && tG1.entregasNoServidor === AGENDA_HOJE.length,
    `posts=${postsG1.join(',')} entregas=${tG1.entregasNoServidor}`);
  eh('G4 · o Iniciar NAO morre mais no "Nenhuma entrega aberta"',
    !/Não deu certo|Nenhuma entrega aberta/i.test(tG1.portao), tG1.portao);
  eh('G5 · a rota do dia renascido ficou ACTIVE e caiu na navegação',
    tG1.routeStatus === 'ACTIVE' && tG1.tela === 'mapa', `status=${tG1.routeStatus} tela=${tG1.tela}`);

  /* ===================================================================
     CENA I — A ROTA AVULSA MORA NO CHIP DESLIGADO (dono, 10/08: "eu aperto
     SEG, para remover segunda, ela não some — se ela saísse apareceria essa
     rota avulsa").

     O dia JÁ EXISTE no servidor (o cron materializou a agenda, sem ordem).
     Toque no chip aceso → a agenda SOME da tela e a Montagem vira a rota
     avulsa: lista só com o que o dedo puser, e o Iniciar sai SÓ com ela —
     `deliveryIds` recorta planejar/custo/iniciar, e o materialize NÃO roda
     (rodar traria a agenda de volta pra tela que ele acabou de esvaziar).
     =================================================================== */
  await cena({
    entregas: [
      { id: 'ag1', status: 'agendada', rotaOrdem: null, origem: 'recorrente', cliente: CLI_C1 },
      { id: 'ag2', status: 'agendada', rotaOrdem: null, origem: 'recorrente', cliente: CLI_C5 },
    ],
    agendaHoje: AGENDA_HOJE, mesmaBase: true,
  });
  // a tela abre SEM dia (F4); pra provar que o 2º toque DESLIGA, o 1º tem que ligar.
  await abrirDiaDeHoje(2200);
  const tI0 = await espiar();
  nota(`[I] montagem com agenda: stops=${tI0.nStops} · chips=${tI0.chips.map((c) => c[0] + (c[1] ? '*' : '')).join(' ')}`);
  eh('I0 · o chip de hoje TRAZ a agenda (o dia é um toque, não a entrada)',
    tI0.nStops === AGENDA_HOJE.length, `stops=${tI0.nStops}`);
  await zerar();
  await p.evaluate(() => {
    const x = [...document.querySelectorAll('[data-acao="montar-dia"]')].find((e) => Number(e.dataset.dia) === 0);
    if (!x) throw new Error('sem chip do dia de hoje');
    x.click();
  });
  await p.waitForTimeout(900);
  const tI1 = await espiar();
  nota(`[I] chip desligado: stops=${tI1.nStops} · vazio="${tI1.vazio}" · POSTs=${(await posts()).join(',') || '(nenhum)'}`);
  eh('I1 · tocar o chip aceso APAGA a agenda da tela', tI1.nStops === 0, `stops=${tI1.nStops}`);
  eh('I2 · a tela se apresenta como Rota avulsa', /Rota avulsa/i.test(tI1.vazio), tI1.vazio);
  eh('I3 · desligar o chip nao grava nada', (await posts()).length === 0, (await posts()).join(','));
  // o construtor: um cliente que NÃO está na agenda de hoje (Alfredo)
  await irPara('rapida', 900);
  await p.waitForSelector('[data-acao="rapida-marcar"]', { timeout: 8000 });
  await p.evaluate(() => {
    const alvo = [...document.querySelectorAll('[data-acao="rapida-marcar"]')]
      .find((e) => /Alfredo/.test(e.textContent));
    if (!alvo) throw new Error('sem Alfredo na lista');
    alvo.click();
  });
  await p.waitForTimeout(200);
  await p.evaluate(() => document.querySelector('[data-acao="rapida-adicionar-escolhidos"]').click());
  await p.waitForTimeout(1800);
  await p.evaluate(() => { const x = document.querySelector('.portao-wrap .principal'); if (x) x.click(); });
  await p.waitForTimeout(600);
  const tI2 = await espiar();
  nota(`[I] avulsa com 1 escolhido: stops=${tI2.nStops} · pe="${tI2.pe}" · linhas: ${tI2.linhas.join(' | ')}`);
  eh('I4 · so o escolhido esta na lista (a agenda continua fora)', tI2.nStops === 1 && /Alfredo/.test(tI2.linhas[0] || ''), tI2.linhas.join('|'));
  await zerar();
  await p.waitForSelector('.pe-montagem [data-acao="iniciar-rota"]', { timeout: 8000 });
  await p.evaluate(() => document.querySelector('.pe-montagem [data-acao="iniciar-rota"]').click());
  await p.waitForTimeout(2400);
  const tI3 = await espiar();
  const postsI = await posts();
  const corpoIniciar = (await postsDe('/logistica/rota/iniciar'))[0] || {};
  const idsIniciar = Array.isArray(corpoIniciar.deliveryIds) ? corpoIniciar.deliveryIds : [];
  const agendaIntocada = await p.evaluate(() => window.__S.entregas
    .filter((e) => e.id.indexOf('ag') === 0).every((e) => e.rotaOrdem === null || e.rotaOrdem === undefined));
  nota(`[I] iniciar avulsa: deliveryIds=${JSON.stringify(idsIniciar)} · POSTs=${postsI.join(',')}`);
  nota(`    tela=${tI3.tela} · routeStatus=${tI3.routeStatus} · agenda intocada=${agendaIntocada}`);
  eh('I5 · o Iniciar leva o RECORTE: deliveryIds so da avulsa', idsIniciar.length === 1 && !idsIniciar.some((id) => String(id).indexOf('ag') === 0), JSON.stringify(idsIniciar));
  eh('I6 · avulsa NAO materializa a agenda', postsI.indexOf('/logistica/mobile/materialize') < 0, postsI.join(','));
  eh('I7 · a agenda do dia fica como estava (sem ordem carimbada)', agendaIntocada);
  eh('I8 · a avulsa inicia e cai na navegacao', tI3.routeStatus === 'ACTIVE' && tI3.tela === 'mapa', `tela=${tI3.tela} status=${tI3.routeStatus}`);

  /* ===================================================================
     CENA M — O CHIP DE OUTRO DIA ENTREGA HOJE (dono, 10/08, com a foto do
     portão "Rota de Qua montada · Ela abre sozinha quando o dia chegar"):
     *"se eu clicar no 'qua', e hoje for segunda, ele monta e inicia a rota
     normalmente, não é para abrir esse aviso"* · *"se for uma segunda, e eu
     quiser entregar clientes de domingo, qual problema?"*

     O chip escolhe GENTE, não DATA. Tocar outro dia e mandar montar tem que
     virar a rota de HOJE com aquela gente — e a agenda de hoje que o cron já
     materializou fica de fora, porque a tela não a está mostrando (a mesma lei
     do recorte da cena I: quem sai é o que está na tela).

     Esta cena existe porque a régua de 09/08 ("a rota nasce no dia dela",
     `admin-route/prepare`) sobreviveu à noite em que a Montagem inteira mudou
     de contrato — e ela era a ÚNICA porta desta tela que ainda gravava num dia
     que não é hoje.
     =================================================================== */
  await cena({
    // o cron já materializou a agenda de HOJE (c1/c5): é ela que não pode ser
    // varrida pra dentro da rota que o dono recortou no chip.
    entregas: [{ id: 'ag1', status: 'agendada', rotaOrdem: null, origem: 'recorrente', cliente: CLI_C5 }],
    agendaHoje: AGENDA_HOJE, mesmaBase: true, custoComoServidor: true,
  });
  await irPara('montagem', 2200);
  await zerar();
  await tocarChip(DIA_B);          // "Qua" numa segunda: 2 pessoas (c1, c2)
  const tM0 = await espiar();
  nota(`[M] chip de outro dia: stops=${tM0.nStops} · pe="${tM0.pe}" · linhas: ${tM0.linhas.join(' | ')}`);
  nota(`    POSTs do toque: ${(await posts()).join(',') || '(nenhum)'}`);
  eh('M0 · o chip de outro dia mostra a gente DAQUELE dia', tM0.nStops === 2, `stops=${tM0.nStops}`);
  eh('M1 · escolher o dia continua sem gravar nada', (await posts()).length === 0, (await posts()).join(','));

  await zerar();
  /* 🔴 A PREMISSA DESTA CENA É O APARELHO SEM MODO LEMBRADO (17/08). O `cache`
     do dublê é localStorage (espelho fiel do native.js) e SOBREVIVE ao `goto`
     de cada cena — se uma cena anterior tivesse gravado `mapa-modo`, esta aqui
     mediria o pouso de uma decisão que não é dela. Premissa de cena se DECLARA;
     prova que herda estado de vizinho não mede o app, mede a ordem do arquivo.
     A chave é lida logo depois de propósito: ela entra na asserção do pouso, e
     é o que separa "pousou no 3D porque é o default" de "pousou no 3D por
     acaso". */
  await p.evaluate(() => window.HBX.cache.remove('mapa-modo'));
  const modoLembradoM = await p.evaluate(() => window.HBX.cache.get('mapa-modo', null));
  await p.waitForSelector('.pe-montagem [data-acao="montar-agora"], .pe-montagem [data-acao="iniciar-rota"]', { timeout: 8000 });
  await p.evaluate(() => document.querySelector('.pe-montagem [data-acao="montar-agora"], .pe-montagem [data-acao="iniciar-rota"]').click());
  await p.waitForTimeout(4000);
  /* 🔴 O VÉU É UM SÓ, E ISSO SE MEDE NO EVENTO (dono, 16/08, com as duas fotos
     do g15 na mão: *"clicou em montar rota, já carrega tudo q tem q carregar no
     loading; quando entrar no mapa, já é a visão 2d. TUDO TEM Q SER CARREGADO
     ALI"*). O que ele viu foram DOIS carregamentos com a mesma cara: o do
     Montar e, depois do pouso, o do Iniciar — que veste o MESMO "Montando…"
     porque a bandeira do seam é uma só (`DADOS.rota.montando`).
     A régua é o 5º campo do `__chamadas` (ver o carimbo no dublê): da 1ª
     chamada até o `rota/iniciar`, TODA ida ao servidor tem que ter acontecido
     com o véu de pé. Uma chamada com a tela livre é a janela em que o app
     devolvia o dedo pro motorista — e é justamente ela que este lote matou. */
  const chamadasM = await p.evaluate(() => window.__chamadas.map((c) => [c[1], c[4] ? 1 : 0]));
  const ateIniciarM = chamadasM.slice(0, chamadasM.map((c) => c[0]).lastIndexOf('/logistica/rota/iniciar') + 1);
  const semVeuM = ateIniciarM.filter((c) => !c[1]).map((c) => c[0]);
  /* A leitura do pouso vem ANTES de voltar pra Montagem medir o resto. */
  const tMr = await espiar();
  const iniciarNoMontarM = await postsDe('/logistica/rota/iniciar');
  nota(`[M] veu por chamada ate o iniciar: ${ateIniciarM.map((c) => `${c[0]}=${c[1]}`).join(' ') || '(nenhuma)'}`);
  nota(`    pouso: tela=${tMr.tela} · status=${tMr.routeStatus} · dock="${tMr.dock}" · POSTs de iniciar=${iniciarNoMontarM.length}`);
  nota(`    modo lembrado no aparelho no instante do toque: ${JSON.stringify(modoLembradoM)} (null = default 3D)`);
  /* 🔴 A LEI NOVA (16/08) SUBSTITUI A DE 11/08 ("montar pousa na rota com o
     dock Iniciar"). O "um status só" continua de pé — o que mudou é QUAL: o
     dono decidiu que o pouso já é o dia RODANDO, e o 2D é o modo iniciado
     (ordem dele no mesmo dia: *"eu já montei a rota, não tenho q clicar em
     iniciar se o 2d já é um modo iniciado"*). Dock de rota na rua =
     Cancelar · Dirigindo · Encerrar dia; "Iniciar" ali seria o segundo toque
     que este lote matou.
     🔴 E EM 17/08 MUDOU A ALTURA DO POUSO: a pergunta "pousou na tela 'rota'
     (2D)?" virou "pousou no MODO LEMBRADO?" — aqui, o default. Queixa do dono
     com as 8 fotos do g15 na mão: *"vc removeu o efeito ao montar a rota"*. O
     efeito nunca foi removido, ficou SEM PORTA: a coreografia inteira
     (escurece na cor do mapa → tela cheia → ruas desenhando com brilho →
     câmera DESCENDO) mora no caminho de `ir('mapa')` — quem a toca é o
     `entrarNaDescida` (§ 80-gps-rotas-salvas.js), e pousando sempre no 2D ele
     nunca corria. Hoje `pousarNaRota` (§ 32-verbos-montar-iniciar.js) lê
     `mapa-modo` do aparelho com DEFAULT 'mapa' (3D), e quem nunca trocou de
     modo é exatamente o dono da queixa.
     NADA AFROUXOU — a asserção ganhou régua e passou a cobrar as duas metades:
     a premissa (aparelho sem modo lembrado, lida acima) e o pouso no 3D. O
     resto da regra tem cena própria logo abaixo: 2D lembrado ⇒ 2D (MD1), e dia
     que NÃO ficou na rua ⇒ 2D sempre (MD2/MD3). O "um carregamento só" continua
     inteiro nesta mesma linha (ACTIVE + dock sem "Iniciar"). */
  eh('M7a · sem modo lembrado, o montar POUSA NO 3D com o dia JA RODANDO (o efeito que o dono cobrou)',
    modoLembradoM === null && tMr.tela === 'mapa' && tMr.routeStatus === 'ACTIVE' && !/Iniciar/i.test(tMr.dock),
    `mapa-modo=${JSON.stringify(modoLembradoM)} tela=${tMr.tela} status=${tMr.routeStatus} dock="${tMr.dock}"`);
  eh('M7b · quem iniciou foi o PROPRIO montar — um toque, um POST de iniciar',
    iniciarNoMontarM.length === 1, `POSTs de iniciar no montar=${iniciarNoMontarM.length}`);
  eh('M7c · UM carregamento so: nenhuma ida ao servidor com a tela livre, ate a rota sair',
    ateIniciarM.length > 0 && semVeuM.length === 0,
    `chamadas ate o iniciar=${ateIniciarM.length} · sem veu: ${semVeuM.join(',') || '(nenhuma)'}`);
  // quem VOLTA à Montagem ainda encontra o dia aceso e o pé de "Iniciar rota"
  await irPara('montagem', 2200);
  const tM1 = await espiar();
  const postsM = await posts();
  const corposM = await postsDe('/logistica/entregas');
  const planejarM = (await postsDe('/logistica/rota/planejar'))[0] || {};
  const idsPlanejar = Array.isArray(planejarM.deliveryIds) ? planejarM.deliveryIds : [];
  const agendaIntocadaM = await p.evaluate(() => window.__S.entregas
    .filter((e) => e.id.indexOf('ag') === 0).every((e) => e.rotaOrdem === null || e.rotaOrdem === undefined));
  const nascidasHoje = await p.evaluate(() => window.__S.entregas
    .filter((e) => e.id.indexOf('e') === 0).map((e) => e.cliente.id));
  nota(`[M] montar: POSTs=${postsM.join(' , ')} · pousou em tela=${tMr.tela} dock="${tMr.dock}" · de volta, pe="${tM1.pe}"`);
  nota(`    portao no pouso="${tMr.portao || '(nenhum)'}" · sub="${tMr.portaoSub || '(nenhum)'}"`);
  nota(`    entregas criadas hoje=${JSON.stringify(nascidasHoje)} · deliveryIds no planejar=${JSON.stringify(idsPlanejar)}`);
  nota(`    chips=${tM1.chips.map((c) => c[0] + (c[1] ? '*' : '')).join(' ')} · agenda de hoje intocada=${agendaIntocadaM}`);
  /* 🔴 A ASSERÇÃO DE AUSÊNCIA É O CORAÇÃO DESTA CENA. O portão e o `prepare`
     não são "comportamento antigo que some sozinho": foram uma decisão de
     produto que uma sessão pode reintroduzir de boa-fé. Peça removida vira
     asserção negativa no portão que a dirigia (mesma lei do A7/A8). */
  eh('M2 · NAO existe mais o aviso "abre sozinha quando o dia chegar"',
    !/abre sozinha|quando o dia chegar|Rota de .* montada/i.test(`${tMr.portao} ${tMr.portaoSub}`),
    `${tMr.portao} · ${tMr.portaoSub}`);
  eh('M3 · o celular NAO fala mais com o admin-route/prepare',
    postsM.indexOf('/logistica/admin-route/prepare') < 0, postsM.join(','));
  eh('M4 · a gente do outro dia virou entrega DE HOJE',
    corposM.length === 2 && nascidasHoje.indexOf('c1') >= 0 && nascidasHoje.indexOf('c2') >= 0,
    `posts=${corposM.length} clientes=${JSON.stringify(nascidasHoje)}`);
  eh('M5 · o planejar leva o RECORTE (a agenda de hoje fica fora)',
    idsPlanejar.length === 2 && !idsPlanejar.some((id) => String(id).indexOf('ag') === 0),
    JSON.stringify(idsPlanejar));
  eh('M6 · a agenda de hoje NAO e materializada nem carimbada',
    postsM.indexOf('/logistica/mobile/materialize') < 0 && agendaIntocadaM,
    `posts=${postsM.join(',')} intocada=${agendaIntocadaM}`);
  /* O chip fica ACESO de propósito: a lista na tela é exatamente a rota que
     acabou de nascer. Apagar o dia aqui trocaria a lista por baixo do dedo.
     🔴 O QUE MUDOU EM 16/08 É O VERBO. Enquanto o Montar parava na rota
     montada, o pé virar "Iniciar rota" era a verdade — faltava sair. Agora o
     Montar já leva o dia até a rua, e um "Iniciar" verde sobre uma rota ACTIVE
     é botão que mente. Rodando, o que sobra é REMONTAR. */
  eh('M7 · o dia continua aceso e o pe NAO oferece "Iniciar" sobre rota que ja saiu',
    !/Iniciar/i.test(tM1.pe) && tM1.chips.some((c) => c[1] === 1),
    `pe="${tM1.pe}" chips=${JSON.stringify(tM1.chips)}`);
  eh('M8 · a lista continua sendo a mesma gente do dia escolhido', tM1.nStops === 2, `stops=${tM1.nStops}`);

  /* 🔴 O RECORTE DO INICIAR SE MEDE NO POST DO PRÓPRIO MONTAR (16/08). Antes
     esta parte tocava o pé uma 2ª vez pra fazer o Iniciar acontecer; hoje ele
     já aconteceu dentro do carregamento único, e é ESSE corpo que vale. Tocar
     de novo mediria um segundo começo do mesmo dia — coisa que o app agora
     recusa de propósito (ver a guarda de rota já rodando em `montarRota`). */
  const idsIniciarM = Array.isArray(iniciarNoMontarM[0] && iniciarNoMontarM[0].deliveryIds)
    ? iniciarNoMontarM[0].deliveryIds : [];
  const agendaIntocadaM2 = await p.evaluate(() => window.__S.entregas
    .filter((e) => e.id.indexOf('ag') === 0).every((e) => e.rotaOrdem === null || e.rotaOrdem === undefined));
  nota(`[M] iniciar do proprio montar: deliveryIds=${JSON.stringify(idsIniciarM)}`);
  eh('M9 · o Iniciar leva o mesmo RECORTE',
    idsIniciarM.length === 2 && !idsIniciarM.some((id) => String(id).indexOf('ag') === 0), JSON.stringify(idsIniciarM));
  eh('M10 · a rota do outro dia inicia HOJE, no mesmo toque',
    tMr.routeStatus === 'ACTIVE', `status=${tMr.routeStatus}`);
  eh('M11 · e a agenda de hoje segue intocada depois de sair pra rua', agendaIntocadaM2);
  /* 🔴 A CENA DEVOLVE O CHIP COMO ENCONTROU (16/08). Quem apagava o dia aqui
     era o 2º toque desta cena (o `iniciarRota` recortado faz `montarDia = -1`),
     e ele saiu junto com o segundo carregamento. Sem esta linha o chip de "Qua"
     fica aceso para TODAS as cenas seguintes — e catorze asserções de dock
     reprovam por herdarem uma tela que nunca foi delas. Estado de tela não é
     do teste, é do app: quem acende, apaga. */
  await tocarChip(DIA_B);

  /* ===================================================================
     CENA MD — O POUSO DO MONTAR OBEDECE O MODO LEMBRADO (17/08).

     Queixa do dono, com as 8 fotos do g15 na mão: *"vc removeu o efeito ao
     montar a rota"*. A cena M acima mede o DEFAULT (aparelho sem modo lembrado
     ⇒ desce pro 3D, que é a porta da coreografia inteira). Aqui ficam as duas
     metades que o default não alcança — e as duas são FREIO, não enfeite:

     · quem escolheu o 2D (Panorâmica) POUSA NO 2D. O modo é do dono da mão, e
       `lembrarModo` (§ 45-troca-de-modo.js) grava a escolha no aparelho; um
       Montar que ignorasse isso desfaria a decisão dele a cada rota nova — e o
       dono voltaria com a queixa espelhada ("por que ele me joga no 3D?").
     · dia que NÃO FICOU NA RUA pousa no 2D SEMPRE, mesmo com o 3D lembrado. O
       3D é a tela de DIRIGIR (manobra, velocímetro, e o rodapé de
       Cancelar/Registrar/Finalizar): entregá-la sobre uma rota que ninguém
       começou é o BECO de 14/08 vestido de efeito, com quatro verbos apontando
       pra um dia que não existe. E o pouso do fracasso é o mesmo gesto do
       sucesso no código (`pousarNaRota` é chamado nos 4 desfechos), então sem
       esta metade a regra do beco não tem quem a segure.

     🔴 O CACHE É ESTADO DO APARELHO E SOBREVIVE ENTRE CENAS (localStorage no
     dublê, espelho do native.js). Por isso cada metade GRAVA a premissa dela
     antes do toque e DEVOLVE a chave como encontrou depois de medir: cena que
     deixa modo lembrado pra trás faz a cena seguinte medir outra coisa — é a
     mesma lição do chip aceso, logo acima ("quem acende, apaga").
     =================================================================== */
  const MD_CENA = (extra) => cena(Object.assign({
    entregas: [{ id: 'ag1', status: 'agendada', rotaOrdem: null, origem: 'recorrente', cliente: CLI_C5 }],
    agendaHoje: AGENDA_HOJE, mesmaBase: true, custoComoServidor: true,
  }, extra || {}));
  /** grava o modo lembrado (ou apaga, pra medir o default), monta pelo chip de
   *  outro dia — o mesmo gesto da cena M — e devolve o pouso + a chave. */
  const MD_MONTAR = async (modo) => {
    await p.evaluate((m) => (m
      ? window.HBX.cache.set('mapa-modo', m)
      : window.HBX.cache.remove('mapa-modo')), modo || '');
    await irPara('montagem', 2200);
    await tocarChip(DIA_B);
    await zerar();
    await p.waitForSelector('.pe-montagem [data-acao="montar-agora"]', { timeout: 8000 });
    await p.evaluate(() => document.querySelector('.pe-montagem [data-acao="montar-agora"]').click());
    await p.waitForTimeout(4000);
    const t = await espiar();
    // a chave é lida DEPOIS do pouso: pousar não é trocar de modo, e o Montar
    // que reescrevesse `mapa-modo` estaria decidindo pelo dono.
    const lembrado = await p.evaluate(() => window.HBX.cache.get('mapa-modo', null));
    await p.evaluate(() => window.HBX.cache.remove('mapa-modo'));
    // devolve o chip como encontrou (mesma razão da linha acima da cena M)
    await irPara('montagem', 2200);
    await tocarChip(DIA_B);
    return { t, lembrado };
  };

  // MD1 — o 2D LEMBRADO ganha: a rota sai pra rua igual, o pouso é o 2D.
  await MD_CENA();
  const md1 = await MD_MONTAR('rota');
  nota(`[MD1] 2D lembrado: tela=${md1.t.tela} · status=${md1.t.routeStatus} · dock="${md1.t.dock}" · mapa-modo depois=${JSON.stringify(md1.lembrado)}`);
  eh('MD1 · com o 2D lembrado (Panoramica) o montar POUSA NO 2D, e a rota sai pra rua igual',
    md1.t.tela === 'rota' && md1.t.routeStatus === 'ACTIVE' && md1.lembrado === 'rota',
    `tela=${md1.t.tela} status=${md1.t.routeStatus} mapa-modo=${JSON.stringify(md1.lembrado)}`);

  /* MD2/MD3 — o dia que NÃO SAIU: saldo curto trava o Iniciar depois do
     planejar, a rota fica MONTADA e PARADA, e o 3D está lembrado. É o pior caso
     da regra nova, porque o modo lembrado empurra pro 3D e a verdade do dia
     empurra pro 2D — e a verdade do dia manda. */
  await MD_CENA({
    custo: { blocosTotais: 2, blocosJaDebitados: 0, creditosAIniciar: 0.8, saldoAtual: 0, saldoCobre: false },
  });
  const md2 = await MD_MONTAR('mapa');
  nota(`[MD2] sem saldo com o 3D lembrado: tela=${md2.t.tela} · status=${md2.t.routeStatus} · portao="${md2.t.portao || '(nenhum)'}" · mapa-modo depois=${JSON.stringify(md2.lembrado)}`);
  eh('MD2 · a premissa aconteceu: a rota NAO ficou na rua e a trava de credito apareceu',
    md2.t.routeStatus !== 'ACTIVE' && /insuficiente/i.test(md2.t.portao),
    `status=${md2.t.routeStatus} portao="${md2.t.portao}"`);
  eh('MD3 · com o 3D LEMBRADO, o dia que nao comecou pousa no 2D — tela de dirigir nao se entrega sobre rota parada',
    md2.t.tela === 'rota' && md2.lembrado === 'mapa',
    `tela=${md2.t.tela} mapa-modo=${JSON.stringify(md2.lembrado)}`);

  /* ===================================================================
     CENA P — A PORTA SUJA: o Iniciar do MAPA não é o da MONTAGEM (10/08).

     Medido em produção hoje, company 41: 51 paradas `agendada` no dia, dia por
     montar, e o Iniciar do dock do MAPA respondia *"A rota avulsa está vazia.
     Adicione uma parada antes de iniciar."* — com o dia CHEIO do outro lado do
     fio. A causa não era a rota: era a PORTA. O `iniciarRota` decidia se a rota
     era avulsa lendo `montarDia`, estado da tela MONTAGEM, cujo default é -1
     desde que "a Montagem abre sem dia". Quem nunca abriu a Montagem herdava
     o -1 de uma tela que não visitou.

     Esta cena entra na Rota e toca o Iniciar SEM PASSAR PELA MONTAGEM — é o
     gesto exato do dono. O que ela cobra é a lei nova (INTENÇÃO VIAJA COMO
     ARGUMENTO): a porta do mapa manda `{escopo:'dia'}`, então o dia inteiro
     materializa, planeja e sai pra rua SEM RECORTE NENHUM — planejar, custo e
     iniciar, os três sem `deliveryIds`.

     🔴 E a asserção de AUSÊNCIA é o coração dela (mesma lei do M2/M3): o erro
     de avulsa não é comportamento que some sozinho, é o sintoma da leitura
     suja. Enquanto ele não puder aparecer por esta porta, a regressão não
     volta calada.
     =================================================================== */
  await cena({
    // o dia que o servidor já tem: paradas ABERTAS e SEM ordem = "por montar".
    entregas: [
      { id: 'ag1', status: 'agendada', rotaOrdem: null, origem: 'recorrente', cliente: CLI_C1 },
      { id: 'ag2', status: 'agendada', rotaOrdem: null, origem: 'recorrente', cliente: CLI_C5 },
    ],
    agendaHoje: AGENDA_HOJE, mesmaBase: true, custoComoServidor: true,
  });
  // A MONTAGEM NUNCA É ABERTA nesta cena: é isso que deixa `montarDia` em -1 e
  // a prévia vazia. Ir pra lá pra "preparar" o estado seria apagar o defeito.
  await irPara('rota', 1500);
  await zerar();
  const tP0 = await espiar();
  const dockP = await p.evaluate(() => {
    // 16/08: o rotulo saiu de dentro do botao — ele hoje so tem o icone, e a
    // palavra e o `<small>` irmao. Ler o textContent do botao devolveria ''.
    const b2 = document.querySelector('.tmx-main button[data-estado]');
    const rot = document.querySelector('.tmx-main small');
    return b2 ? [b2.dataset.estado, ((rot || {}).textContent || '').trim()] : ['(sem dock)', ''];
  });
  nota(`[P] rota por montar, Montagem nunca aberta: tela=${tP0.tela} · stops=${tP0.nStops} · dock=${JSON.stringify(dockP)}`);
  eh('P0 · o dock do MAPA oferece "Iniciar" no dia por montar',
    dockP[0] === 'iniciar' && /Iniciar/i.test(dockP[1]), JSON.stringify(dockP));

  await p.evaluate(() => {
    const b2 = document.querySelector('.tmx-main button[data-estado="iniciar"]');
    if (!b2) throw new Error('sem o Iniciar no dock da rota');
    b2.click();
  });
  await p.waitForTimeout(2800);
  const tP1 = await espiar();
  const postsP = await posts();
  const planejarP = (await postsDe('/logistica/rota/planejar'))[0] || {};
  const iniciarP = (await postsDe('/logistica/rota/iniciar'))[0] || {};
  const custoP = await p.evaluate(() => (window.__chamadas
    .filter((c) => c[0] === 'GET' && c[1] === '/logistica/rota/custo-preview')
    .map((c) => c[3])[0] || ''));
  nota(`[P] iniciar pelo MAPA: POSTs=${postsP.join(' , ') || '(nenhum)'}`);
  nota(`    portao="${tP1.portao || '(nenhum)'}" · sub="${tP1.portaoSub || '(nenhum)'}" · aviso="${tP1.aviso || '(nenhum)'}"`);
  nota(`    planejar=${JSON.stringify(planejarP)} · iniciar=${JSON.stringify(iniciarP)}`);
  nota(`    custo-preview="${custoP}" · tela=${tP1.tela} · status=${tP1.routeStatus}`);
  /* 🔴 A ASSERÇÃO QUE NOMEIA O DEFEITO. O erro de avulsa é do verbo da
     Montagem com a lista vazia — nunca desta porta, que fala do DIA. */
  eh('P1 · o erro "A rota avulsa está vazia" NAO existe por esta porta',
    !/rota avulsa está vazia|rota avulsa esta vazia/i.test(
      `${tP1.portao} ${tP1.portaoSub} ${tP1.aviso}`),
    `${tP1.portao} · ${tP1.portaoSub} · ${tP1.aviso}`);
  eh('P2 · o Iniciar do MAPA materializa o dia',
    postsP.indexOf('/logistica/mobile/materialize') >= 0, postsP.join(','));
  eh('P3 · e planeja SEM recorte (o dia inteiro, não a prévia de ninguém)',
    postsP.indexOf('/logistica/rota/planejar') >= 0 && !('deliveryIds' in planejarP),
    JSON.stringify(planejarP));
  eh('P4 · o custo-preview tambem vai SEM recorte',
    !!custoP && custoP.indexOf('deliveryIds') < 0, custoP);
  eh('P5 · o iniciar sai SEM recorte', postsP.indexOf('/logistica/rota/iniciar') >= 0 && !('deliveryIds' in iniciarP),
    JSON.stringify(iniciarP));
  eh('P6 · a rota do dia ficou ACTIVE e o toque caiu na navegacao',
    tP1.routeStatus === 'ACTIVE' && tP1.tela === 'mapa', `tela=${tP1.tela} status=${tP1.routeStatus}`);

  /* ===================================================================
     CENA Q — O DIA VAZIO FALA NOME (10/08, a madrugada que travou o dono).

     `AGENDA_SO_AVISOS` tem dois clientes e NENHUM vira entrega: um pausado,
     um sem endereço. O materialize devolve `avisos` nomeando os dois; o
     custo-preview (atrás da bandeira `custoComoServidor`, o mesmo contrato
     REAL da cena G) rejeita com "Nenhuma entrega aberta neste dia" — e é
     ESSA frase genérica que o portão de erro tinha que trocar pelos avisos
     guardados na MESMA tentativa (`ultimosAvisosMaterialize`, ver
     `30-verbos-rota.js`).
     =================================================================== */
  await cena({ entregas: [], agendaHoje: AGENDA_SO_AVISOS, custoComoServidor: true, mesmaBase: true });
  await zerar();
  await abrirDiaDeHoje(2600);
  await zerar();
  await p.waitForSelector('.pe-montagem [data-acao="iniciar-rota"]', { timeout: 8000 });
  await p.evaluate(() => document.querySelector('.pe-montagem [data-acao="iniciar-rota"]').click());
  await p.waitForTimeout(2400);
  const tQ = await espiar();
  const postsQ = await posts();
  nota(`[Q] dia so com avisos: POSTs=${postsQ.join(' , ')} · entregas=${tQ.entregasNoServidor}`);
  nota(`    portao="${tQ.portao}" · sub="${tQ.portaoSub}" · corpo="${tQ.portaoCorpo}"`);
  eh('Q1 · o materialize rodou e ninguem virou entrega (os dois tem aviso)',
    postsQ.indexOf('/logistica/mobile/materialize') >= 0 && tQ.entregasNoServidor === 0,
    `posts=${postsQ.join(',')} entregas=${tQ.entregasNoServidor}`);
  eh('Q2 · o portao NAO mostra mais a frase generica',
    !/Nenhuma entrega aberta/i.test(`${tQ.portao} ${tQ.portaoSub}`), `${tQ.portao} · ${tQ.portaoSub}`);
  eh('Q3 · o portao nomeia os DOIS avisos do materialize, um por linha',
    /Wagner Pausado/.test(tQ.portaoCorpo) && /Wanda Sem Endereco/.test(tQ.portaoCorpo)
    && tQ.portaoCorpo.indexOf('<br>') >= 0, tQ.portaoCorpo);

  /* ===================================================================
     CENA R — 409 ROTA_DE_OUTRO_MOTORISTA: FORÇAR CANCELA E REMONTA SOZINHO
     (10/08, contrato novo do servidor).

     O primeiro `planejar` desta tentativa bate no motorista que já montou o
     dia. O portão tem que FALAR quem foi (não "Não deu certo" genérico) e,
     com `podeForcar`, oferecer "Forçar cancelamento e puxar" — que abre a
     MESMA confirmação da casa do Cancelar, chama `limpar-dia` e refaz o
     MONTAR sozinho, sem pedir o toque duas vezes.
     =================================================================== */
  await cena({
    entregas: [], agendaHoje: AGENDA_HOJE, mesmaBase: true,
    outroMotorista: { motorista: 'Carlos Motorista', podeForcar: true },
  });
  await zerar();
  await abrirDiaDeHoje(2600);
  await zerar();
  await p.waitForSelector('.pe-montagem [data-acao="iniciar-rota"]', { timeout: 8000 });
  await p.evaluate(() => document.querySelector('.pe-montagem [data-acao="iniciar-rota"]').click());
  await p.waitForTimeout(1600);
  const tR0 = await espiar();
  nota(`[R] 409 outro motorista: portao="${tR0.portao}" · sub="${tR0.portaoSub}" · botoes=${JSON.stringify(tR0.portaoBotoes)}`);
  eh('R1 · o portao fala QUEM montou a rota, com titulo proprio',
    tR0.portao === 'Rota já montada' && /Carlos Motorista/.test(tR0.portaoSub), `${tR0.portao} | ${tR0.portaoSub}`);
  eh('R2 · com podeForcar, o botao "Puxar rota" existe',
    tR0.portaoBotoes.some((b) => /Puxar rota/.test(b)), JSON.stringify(tR0.portaoBotoes));

  await p.evaluate(() => {
    const alvo = [...document.querySelectorAll('.portao-wrap button')].find((b) => /Puxar rota/.test(b.textContent));
    if (!alvo) throw new Error('sem o botao "Puxar rota"');
    alvo.click();
  });
  await p.waitForTimeout(500);
  const tR1 = await espiar();
  nota(`[R] apos forcar: portao="${tR1.portao}"`);
  eh('R3 · puxar abre confirmação explícita sem prometer apagar a rota antiga',
    /Puxar esta rota/i.test(tR1.portao), tR1.portao);

  await zerar();
  await p.evaluate(() => {
    const x = document.querySelector('.portao-wrap .principal');
    if (x) x.click();
  });
  await p.waitForTimeout(2800);
  const tR2 = await espiar();
  const postsR = await posts();
  nota(`[R] apos confirmar "Sim": POSTs=${postsR.join(' , ')} · stops=${tR2.nStops} · entregas=${tR2.entregasNoServidor}`);
  eh('R4 · confirmar chama a transferência exata',
    postsR.indexOf('/logistica/rota/continuidade/puxar') >= 0, postsR.join(','));
  eh('R5 · puxar nunca chama a limpeza ampla do dia',
    postsR.indexOf('/logistica/rota/limpar-dia') < 0, postsR.join(','));
  eh('R6 · a rota transferida não ficou vazia',
    tR2.entregasNoServidor === AGENDA_HOJE.length, `entregas=${tR2.entregasNoServidor}`);

  /* ===================================================================
     CENA S — 402 ASSENTOS_ESGOTADOS: COMPRAR O PASSE REFAZ A AÇÃO ORIGINAL
     (10/08, contrato novo do servidor).

     A rota já está montada (igual a cena D); o `iniciar` bate no 402. O
     portão mostra a frase do servidor e, com `podeComprarPasse`, o botão
     "Liberar hoje (N créditos)" com o N que o servidor mandou. Comprado
     (`passe-do-dia`), a AÇÃO ORIGINAL — iniciar, não montar — se refaz
     sozinha e a rota sai pra rua.
     =================================================================== */
  await cena({
    routeStatus: 'PLANNED',
    entregas: [{ id: 'as1', status: 'agendada', rotaOrdem: 0, origem: 'avulsa', cliente: CLI_C1 }],
    custo: { blocosTotais: 1, blocosJaDebitados: 0, creditosAIniciar: 0.4, saldoAtual: 9340, saldoCobre: true },
    assentos: { podeComprarPasse: true, passeCreditos: 2, message: 'Assentos esgotados para hoje.' },
  });
  await irPara('montagem');
  await irPara('rota', 1600);
  await zerar();
  await p.evaluate(() => {
    const x = document.querySelector('.tmx-main [data-estado="iniciar"], .tmx-main [data-acao="iniciar-rota"]');
    if (!x) throw new Error('sem botao Iniciar no dock da rota');
    x.click();
  });
  await p.waitForTimeout(1400);
  const tS0 = await espiar();
  nota(`[S] 402 assentos esgotados: portao="${tS0.portao}" · sub="${tS0.portaoSub}" · botoes=${JSON.stringify(tS0.portaoBotoes)}`);
  eh('S1 · o portao mostra a frase do servidor', tS0.portaoSub === 'Assentos esgotados para hoje.', tS0.portaoSub);
  eh('S2 · o botao mostra os creditos que o SERVIDOR mandou (2)',
    tS0.portaoBotoes.some((b) => b === 'Liberar hoje (2 créditos)'), JSON.stringify(tS0.portaoBotoes));

  await zerar();
  await p.evaluate(() => {
    const alvo = [...document.querySelectorAll('.portao-wrap button')].find((b) => /Liberar hoje/.test(b.textContent));
    if (!alvo) throw new Error('sem o botao "Liberar hoje"');
    alvo.click();
  });
  await p.waitForTimeout(2600);
  const tS1 = await espiar();
  const postsS = await posts();
  nota(`[S] apos comprar o passe: POSTs=${postsS.join(' , ')} · routeStatus=${tS1.routeStatus} · tela=${tS1.tela}`);
  eh('S3 · comprar chama o passe-do-dia', postsS.indexOf('/logistica/rota/passe-do-dia') >= 0, postsS.join(','));
  eh('S4 · e refaz a ACAO ORIGINAL sozinho — iniciar de novo, sem novo toque',
    postsS.indexOf('/logistica/rota/iniciar') >= 0, postsS.join(','));
  eh('S5 · a rota iniciou de verdade na 2a tentativa e caiu na navegacao',
    tS1.routeStatus === 'ACTIVE' && tS1.tela === 'mapa', `status=${tS1.routeStatus} tela=${tS1.tela}`);

  /* ===================================================================
     CENA U — CANCELAR LIMPA SEM RASTRO DE CENA (11/08).

     O PISCA visual do cancelar mora na `prova-pisca-cancelar` (é da camada,
     não do dado). Aqui fica o DADO da mesma cena do dono: montar arma um
     pedido de cena de "rota nova" (`pedirCena('rota')`, validade 60 s);
     cancelar mata a rota nesse meio tempo — o pedido NÃO pode sobreviver,
     senão o próximo repinte toca a cidade nascendo por cima do dia limpo.
     E a tela termina na rota em estado de montar, limpa, sem desvio.
     =================================================================== */
  /* o caminho é o da cena M (dia de OUTRA data): com agenda de HOJE o pé é
     "Iniciar rota" (o Iniciar monta sozinho, cena G) e o toque cairia no GPS —
     o Cancelar desta cena mora no dock da ROTA, onde o montar pousa. */
  /* 🔴 A CENA GANHOU `routeId` + `stopsPresos` (16/08) porque a PREMISSA dela
     mudou: desde que o Montar leva o dia até a rua, o que o Cancelar encontra
     aqui é uma rota ACTIVE com os stops congelados — e rota ACTIVE no servidor
     de verdade SEMPRE publica `routeId` (logistica-admin-route-view.service.ts:71).
     Sem isso o dublê ficava num estado que produção nunca produz (ACTIVE sem
     routeId), o app mandava `draft:` e o ramo errado do cancelar respondia. */
  await cena({
    entregas: [{ id: 'ag1', status: 'agendada', rotaOrdem: null, origem: 'recorrente', cliente: CLI_C5 }],
    agendaHoje: AGENDA_HOJE, mesmaBase: true, custoComoServidor: true,
    routeId: 'route-u-do-montar', stopsPresos: true,
  });
  await irPara('montagem', 2200);
  await tocarChip(DIA_B);
  await zerar();
  await p.waitForSelector('.pe-montagem [data-acao="montar-agora"]', { timeout: 8000 });
  await p.evaluate(() => document.querySelector('.pe-montagem [data-acao="montar-agora"]').click());
  await p.waitForTimeout(2800);
  const pendenteU = await p.evaluate(() => !!(window.HBXCena && window.HBXCena.pendente()));
  const tUpre = await espiar();
  nota(`[U] antes do cancelar: tela=${tUpre.tela} · dock="${tUpre.dock}" · status=${tUpre.routeStatus}`);
  await zerar();
  /* o achado nao vira crash (licao do M9): toca no que existir e deixa as
     asserções falarem com a medida na mao */
  const achouCancelarU = await p.evaluate(() => {
    const x = document.querySelector('.tmx-sat [data-acao="cancelar-rota"]');
    if (x) { x.click(); return true; }
    return false;
  });
  await p.waitForTimeout(500);
  const tU0 = await espiar();
  eh('U1 · o Cancelar abre a confirmacao da casa',
    achouCancelarU && /Tem certeza que deseja cancelar/i.test(tU0.portao),
    `achou=${achouCancelarU} portao="${tU0.portao}" tela=${tU0.tela}`);
  /* 🔴 U5/U6 (correção 15/08, revisão adversarial ao 1º fix deste bloco). O
     cache do APARELHO tem DUAS chaves por parada, e só UMA pode morrer no
     cancelar: `chegada:<id>` é carimbo de UI (a hora que a folha abriu) e some
     com a rota; `entrega-confirmar:<id>` é a idempotencyKey do POST de
     confirmar — DINHEIRO — e só morre no desfecho BEM-SUCEDIDO (senão um
     retry gera uuid novo: risco de confirmar/cobrar em dobro). Semeia as duas
     ANTES do "Sim" — simula uma parada que chegou a abrir a folha e tinha um
     confirmar em voo no instante do cancelar. */
  await p.evaluate(() => {
    window.HBX.cache.set('chegada:ag1', new Date().toISOString());
    window.HBX.cache.set('entrega-confirmar:ag1', 'idem-ag1-em-voo');
  });
  await p.evaluate(() => {
    const x = document.querySelector('.portao-wrap .principal');
    if (x) x.click();
  });
  await p.waitForTimeout(2800);
  const tU1 = await espiar();
  const postsU = await posts();
  const pendenteU1 = await p.evaluate(() => !!(window.HBXCena && window.HBXCena.pendente()));
  const cacheU = await p.evaluate(() => ({
    chegada: window.HBX.cache.get('chegada:ag1', null),
    confirmar: window.HBX.cache.get('entrega-confirmar:ag1', null),
  }));
  nota(`[U] cancelar: POSTs=${postsU.join(' , ')} · tela=${tU1.tela} · dock="${tU1.dock}"`);
  nota(`    pedido de cena: apos montar=${pendenteU} · apos cancelar=${pendenteU1}`);
  nota(`    cache apos cancelar: chegada:ag1=${JSON.stringify(cacheU.chegada)} · entrega-confirmar:ag1=${JSON.stringify(cacheU.confirmar)}`);
  eh('U2 · confirmar chama o cancelamento exato da continuidade',
    postsU.indexOf('/logistica/rota/continuidade/cancelar') >= 0
      && postsU.indexOf('/logistica/rota/limpar-dia') < 0, postsU.join(','));
  eh('U3 · a tela termina na ROTA, limpa, no estado de montar',
    tU1.tela === 'rota' && /Montar rota/i.test(tU1.dock), `tela=${tU1.tela} dock="${tU1.dock}"`);
  eh('U4 · o pedido de cena NAO sobrevive ao cancelar', pendenteU1 === false,
    `apos montar=${pendenteU} apos cancelar=${pendenteU1}`);
  eh('U5 · cancelar apaga o carimbo de CHEGADA da parada esquecida',
    cacheU.chegada === null, `chegada:ag1=${JSON.stringify(cacheU.chegada)}`);
  eh('U6 · cancelar NAO apaga a idempotencyKey de CONFIRMAR (dinheiro nao se apaga em limpeza de rota)',
    cacheU.confirmar === 'idem-ag1-em-voo', `entrega-confirmar:ag1=${JSON.stringify(cacheU.confirmar)}`);

  /* ===================================================================
     CENA V — O FIM DO DIA ACONTECE UMA VEZ (12/08).

     O dono, com o print da tela de dirigir: *"ao finalizar (última rota), criar
     uma tela de finalizou… fecha bonitinho, e não volta pra essa tela"* e
     *"ela aparece algumas vezes no final, sem necessidade, transforme isso em
     1x só"*.

     O que havia: o "Finalizar" do dock e o "Fechar o dia" da tela de Fechamento
     eram O MESMO gancho (`fechar-dia`). O toque abria um portão, mandava o
     `fechamento/finalizar` — que NÃO encerra rota nenhuma — e terminava em
     `ir('fechamento')`, ou seja, na tela que tem o botão. Anel: fecha, cai onde
     fecha, fecha outra vez; e a rota seguia ACTIVE atrás de tudo.

     A corrente agora tem três tempos com um dono cada, e é isto que a cena mede:
     o Finalizar ABRE (sem POST), o Fechar o dia FECHA (encerra + registra, uma
     vez) e o recibo é o fim da linha — sem botão de fechar de novo.
     =================================================================== */
  await cena({
    entregas: [
      { id: 'v1', status: 'entregue', rotaOrdem: 0, origem: 'recorrente', cliente: CLI_C1 },
      { id: 'v2', status: 'agendada', rotaOrdem: 1, origem: 'recorrente', cliente: CLI_C5 },
    ],
    routeStatus: 'ACTIVE', mesmaBase: true,
  });
  const tV0 = await espiar();
  nota(`[V] rota na rua: tela=${tV0.tela} · dock="${tV0.dock}" · cadeado Encerrar dia=${tV0.temEncerrarDia} · satelites=${JSON.stringify(tV0.satelites)}`);
  /* 🔴 V1 MUDOU DE ALVO DUAS VEZES EM 16/08, e a segunda foi de LUGAR. De manha
     o satelite era "Finalizar" e apontava pro `ir-fechamento`, um gancho que so
     ABRIA a tela — verbo que nao cumpre o proprio nome; virou "Encerrar dia" no
     `fechar-dia`, que e quem encerra de verdade. A tarde o dono trocou a fileira
     dele: encerrar o dia acontece UMA vez e cedeu a vaga do satelite ao
     Registrar, que e o verbo de toda porta. O cadeado foi pra COLUNA lateral.
     O que a prova cobra continua sendo o mesmo par — o verbo existe UMA vez e no
     gancho que ENCERRA —, mas agora tambem cobra que ele nao ficou nos DOIS
     lugares: dock e coluna ao mesmo tempo e o "botao repetido a 60px de si
     mesmo" que o proprio mock ja proibiu. */
  /* 🔴 E EM 17/08 ELE VOLTOU PRA FILEIRA, COM O NOME QUE O DONO DEU: "Finalizar"
     (item 8). A pergunta desta linha NAO mudou desde 16/08 — o verbo existe UMA
     vez e no gancho que ENCERRA (`fechar-dia`, o unico que manda
     `POST /logistica/rota/encerrar`) —, so o ENDERECO mudou: rodape, nao coluna.
     E ela continua cobrando que ele nao ficou nos DOIS lugares: cadeado no dock
     E na coluna e o "botao repetido a 60px de si mesmo" que esta casa proibiu em
     12/08. A metade nova e justamente essa — a coluna tem que estar LIMPA. */
  const cadeadoNaColuna = await p.evaluate(() => document.querySelectorAll(
    '.plano-lado [data-acao="fechar-dia"], .gps-lado [data-acao="fechar-dia"]').length);
  eh('V1 · o Finalizar mora no RODAPE (uma vez so), usa o gancho que ENCERRA e a coluna ficou limpa',
    tV0.temEncerrarDia === 1 && cadeadoNaColuna === 0,
    `noRodape=${tV0.temEncerrarDia} naColuna=${cadeadoNaColuna} satelites=${JSON.stringify(tV0.satelites)}`);
  /* 🔴 V1a MUDOU DE PERGUNTA COM O PAINEL DE 4 (17/08). Ela cobrava que a vaga
     deixada pelo cadeado tinha virado o Registrar — vaga que deixou de existir
     quando a fileira passou a ter QUATRO lugares. Hoje o que se cobra e a
     FILEIRA INTEIRA na ordem do dono: Cancelar (esquerda) · Registrar e
     Finalizar (centro) · o verbo de trocar de camera (direita). Ordem e a regua:
     "esquerda cancelar, no centro registrar e finalizar, na direita Panoramica e
     direcao" — palavra por palavra. */
  eh('V1a · e a fileira e a do dono: Cancelar · Registrar · Finalizar · trocar de camera',
    tV0.satelites.length === 3
      && /Cancelar/i.test(tV0.satelites[0])
      && /Registrar/i.test(tV0.satelites[1])
      && /Finalizar/i.test(tV0.satelites[2]),
    `satelites=${JSON.stringify(tV0.satelites)}`);
  /* O verbo do meio nao pode voltar a prometer navegacao que ja esta
     acontecendo ("Navegar" era `ir('mapa')` e mais nada). "Direcao" e o rotulo
     de 16/08 e diz o que o toque FAZ: troca a camera. */
  eh('V1b · e o verbo do meio deixou de prometer navegacao que ja esta acontecendo',
    /Dire[çc][ãa]o/i.test(tV0.dock) && !/Navegar/i.test(tV0.dock), `dock="${tV0.dock}"`);
  await zerar();
  const achouFimV = await p.evaluate(() => {
    // ESCOPADO no rodape (17/08): e onde o Finalizar mora desde o painel de 4.
    const x = document.querySelector('.gps-rodape [data-acao="fechar-dia"]');
    if (x) { x.click(); return true; }
    return false;
  });
  await p.waitForTimeout(900);
  const tV1 = await espiar();
  const postsV1 = await posts();
  nota(`[V] toque no Encerrar dia: tela=${tV1.tela} · portao="${tV1.portao}" · POSTs=${postsV1.length ? postsV1.join(' , ') : '(nenhum)'}`);
  /* 🔴 "ZERO POST" NAO E A ASSERÇÃO — e a 1ª versão desta linha reprovou por
     isso. O app tem trânsito de fundo próprio (o poll de recados sai no seu
     tempo, não no meu dedo), então exigir a lista vazia é medir o relógio dele.
     O que este toque promete é não FECHAR nada ANTES DA CONFIRMAÇÃO: então o que
     se cobra é a ausência das DUAS portas do fechar, nominalmente. */
  const FIM_DO_DIA = ['/logistica/rota/encerrar', '/logistica/fechamento/finalizar'];
  /* 🔴 V2 INVERTEU O SENTIDO. Antes o satelite navegava e nao perguntava nada;
     hoje ele PERGUNTA e nao navega — o dia so acaba depois do "Encerrar dia" do
     portao. O que continua igual e a promessa de dinheiro: nenhum POST de fim
     de dia sai do primeiro toque. */
  eh('V2 · o Finalizar do rodape ABRE O PORTAO e nao fecha nada sozinho',
    achouFimV && /Encerrar o dia\?/i.test(tV1.portao) && !postsV1.some((x) => FIM_DO_DIA.indexOf(x) >= 0),
    `tela=${tV1.tela} portao="${tV1.portao}" posts=${postsV1.join(',')}`);
  await zerar();
  await p.evaluate(() => {
    // ESCOPADO no rodape: `[data-acao="fechar-dia"]` cru casa em dois lugares
    // (a fileira e o portao do fim do dia), e o primeiro do DOM nem sempre e o
    // que a cena quer tocar. Desde 17/08 o botao e o "Finalizar" do painel de 4.
    const x = document.querySelector('.gps-rodape [data-acao="fechar-dia"]');
    if (x) x.click();
  });
  await p.waitForTimeout(600);
  const tV2 = await espiar();
  nota(`[V] portao: "${tV2.portao}" · sub="${tV2.portaoSub}"`);
  eh('V3 · o portao avisa QUEM fica pra amanha antes de encerrar',
    /Encerrar o dia\?/i.test(tV2.portao) && /1 parada fica pra amanh/i.test(tV2.portaoSub),
    `portao="${tV2.portao}" sub="${tV2.portaoSub}"`);
  await p.evaluate(() => {
    const x = document.querySelector('.portao-wrap .principal');
    if (x) x.click();
  });
  await p.waitForTimeout(2600);
  const tV3 = await espiar();
  const postsV3 = await posts();
  nota(`[V] fechar: POSTs=${postsV3.join(' , ')} · tela=${tV3.tela} · status=${tV3.routeStatus} · dock="${tV3.dock}"`);
  nota(`    recibo: "${tV3.heroi}" · ${tV3.heroiSub.join(' · ')} · registrou ${tV3.fechou}x`);
  eh('V4 · fechar ENCERRA a rota de verdade (a porta que ninguem chamava)',
    postsV3.indexOf('/logistica/rota/encerrar') >= 0 && tV3.routeStatus === 'ENCERRADA',
    `posts=${postsV3.join(',')} status=${tV3.routeStatus}`);
  eh('V5 · e registra a pagina do dia — UMA vez',
    postsV3.filter((x) => x === '/logistica/fechamento/finalizar').length === 1 && tV3.fechou === 1,
    `posts=${postsV3.join(',')} fechou=${tV3.fechou}`);
  eh('V6 · a tela termina no RECIBO, nao volta pro mapa nem pro fechamento',
    tV3.tela === 'terminou' && /Dia encerrado/i.test(tV3.heroi),
    `tela=${tV3.tela} heroi="${tV3.heroi}"`);
  eh('V7 · o recibo diz quem ficou pra amanha, e a hora',
    tV3.heroiSub.some((s) => /ficou pra amanh/i.test(s)) && tV3.heroiSub.some((s) => /Fechado às/i.test(s)),
    tV3.heroiSub.join(' | '));
  eh('V8 · o recibo NAO tem botao de fechar de novo — o verbo tem UM dono',
    tV3.temFecharDia === 0 && /Montar rota/i.test(tV3.dock),
    `fecharDia=${tV3.temFecharDia} dock="${tV3.dock}"`);

  /* ===================================================================
     CENA W — DIA SEM VENDA TAMBÉM ACABA (o 400 deixou de ser beco).

     `fechamento/finalizar` responde 400 "Nada registrado neste dia ainda."
     quando não há entrega entregue pra virar Rota salva. Como ele era o ÚNICO
     passo do fechar, quem rodou o dia inteiro sem vender ficava PRESO: o erro
     na tela e a rota viva pra sempre. Hoje quem encerra o dia é o passo de
     cima, que já aconteceu — não ter o que salvar não é erro de quem trabalhou.
     =================================================================== */
  await cena({
    entregas: [{ id: 'w1', status: 'agendada', rotaOrdem: 0, origem: 'recorrente', cliente: CLI_C1 }],
    routeStatus: 'ACTIVE', mesmaBase: true,
  });
  await irPara('fechamento', 1200);
  await zerar();
  await p.evaluate(() => {
    const x = document.querySelector('[data-acao="fechar-dia"]');
    if (x) x.click();
  });
  await p.waitForTimeout(600);
  await p.evaluate(() => {
    const x = document.querySelector('.portao-wrap .principal');
    if (x) x.click();
  });
  await p.waitForTimeout(2600);
  const tW = await espiar();
  const postsW = await posts();
  nota(`[W] dia sem venda: POSTs=${postsW.join(' , ')} · tela=${tW.tela} · status=${tW.routeStatus} · aviso="${tW.aviso || '(nenhum)'}"`);
  eh('W1 · o 400 do "Nada registrado" NAO segura o fim do dia',
    tW.tela === 'terminou', `tela=${tW.tela} aviso="${tW.aviso}"`);
  eh('W2 · e a rota foi encerrada do mesmo jeito',
    tW.routeStatus === 'ENCERRADA' && postsW.indexOf('/logistica/rota/encerrar') >= 0,
    `status=${tW.routeStatus} posts=${postsW.join(',')}`);
  eh('W3 · sem venda, o recibo nao inventa numero de dinheiro', tW.fechou === 0, `fechou=${tW.fechou}`);

  /* ===================================================================
     CENA X — A PORTA AUTOMÁTICA ABRE UMA VEZ (12/08).

     O pedido literal: *"ao finalizar (última rota) … JÁ ABRINDO o fechamento"*
     + *"transforme isso em 1x só"*. A cena V provou o caminho do DEDO
     (Finalizar → Fechar o dia → recibo); esta prova o da MÁQUINA: o desfecho
     da ÚLTIMA parada cai no Fechamento sozinho — e SÓ o primeiro fim de dia
     ganha isso. A marca é `fim-visto:<dia>` no cache do aparelho; quem a
     apaga é o `iniciar` (2ª leva = dia novo de trabalho, recibo novo).

     Os desfechos aqui passam pela FOLHA DE VERDADE (abrir a parada → confirmar
     venda), não por atalho de estado — é o caminho do dedo do motorista, com
     idempotência e carimbo de chegada no meio.
     =================================================================== */
  await cena({
    entregas: [
      { id: 'x1', status: 'agendada', rotaOrdem: 0, origem: 'recorrente', cliente: CLI_C1 },
      { id: 'x2', status: 'agendada', rotaOrdem: 1, origem: 'recorrente', cliente: CLI_C5 },
    ],
    routeStatus: 'ACTIVE', mesmaBase: true,
  });
  const CHAVE_FIM = `fim-visto:${HOJE}`;
  // o cache é localStorage e SOBREVIVE entre cenas — o dia começa sem marca.
  await p.evaluate((k) => window.HBX.cache.remove(k), CHAVE_FIM);
  const confirmarNaFolha = async (id) => {
    await irPara('rotalista', 900);
    await p.waitForSelector(`[data-acao="abrir-parada"][data-parada="${id}"]`, { timeout: 8000 });
    await p.evaluate((i) => document.querySelector(`[data-acao="abrir-parada"][data-parada="${i}"]`).click(), id);
    await p.waitForSelector('[data-acao="confirmar-venda"]', { timeout: 8000 });
    await p.evaluate(() => document.querySelector('[data-acao="confirmar-venda"]').click());
    await p.waitForTimeout(2000);
  };
  await confirmarNaFolha('x1');
  const tX1 = await espiar();
  nota(`[X] confirmou a 1a de 2: tela=${tX1.tela} · pendentes no servidor=${tX1.entregasNoServidor - 1}`);
  eh('X1 · desfecho com parada SOBRANDO volta pra rota (a porta nao abre cedo)',
    tX1.tela === 'rota', `tela=${tX1.tela}`);
  await zerar();
  await confirmarNaFolha('x2');
  const tX2 = await espiar();
  const postsX2 = await posts();
  const marcaX2 = await p.evaluate((k) => window.HBX.cache.get(k, ''), CHAVE_FIM);
  nota(`[X] confirmou a ULTIMA: tela=${tX2.tela} · marca=${marcaX2 || '(nenhuma)'} · POSTs=${postsX2.join(' , ')}`);
  eh('X2 · a ultima parada JA ABRE o fechamento sozinha',
    tX2.tela === 'fechamento' && !!marcaX2, `tela=${tX2.tela} marca=${marcaX2}`);
  eh('X3 · e a maquina so ABRE — fechar continua sendo do dedo',
    !postsX2.some((x) => FIM_DO_DIA.indexOf(x) >= 0), postsX2.join(','));
  /* o 2º fim do MESMO dia: uma avulsa entra depois do primeiro recibo e é
     entregue. `paradasPendentes` volta a zerar — e a porta NÃO pode reabrir,
     senão é a mesma tela "aparecendo algumas vezes" por caminho novo. */
  await p.evaluate(() => {
    window.__S.entregas.push({
      id: 'x3', status: 'agendada', rotaOrdem: 2, origem: 'avulsa',
      cliente: { id: 'c9', nome: 'Zé do Fim', enderecoLinha: 'Rua Z, 9', lat: -22.406, lng: -47.556 },
    });
  });
  await p.evaluate(() => window.HBXRota.carregar());
  await p.waitForTimeout(900);
  await confirmarNaFolha('x3');
  const tX4 = await espiar();
  nota(`[X] 2o fim do mesmo dia (avulsa entregue): tela=${tX4.tela}`);
  eh('X4 · o SEGUNDO fim do dia NAO reabre o fechamento — 1x so',
    tX4.tela === 'rota', `tela=${tX4.tela}`);

  /* ===================================================================
     CENA X2 — O INICIAR APAGA A MARCA (a 2ª leva ganha recibo).

     A marca de "já mostrei o fim deste dia" sobrevive no aparelho — inclusive
     a esta troca de página, que é o app fechando e abrindo. Sem o iniciar
     apagá-la, quem sai pra 2ª leva terminaria a rota no mapa mudo. O gesto é
     o da cena G (o caminho real: chip do dia → Iniciar rota).
     =================================================================== */
  await cena({ entregas: [], agendaHoje: AGENDA_HOJE, custoComoServidor: true, mesmaBase: true });
  const marcaAntes = await p.evaluate((k) => window.HBX.cache.get(k, ''), CHAVE_FIM);
  await abrirDiaDeHoje(2600);
  await p.waitForSelector('.pe-montagem [data-acao="iniciar-rota"]', { timeout: 8000 });
  await p.evaluate(() => document.querySelector('.pe-montagem [data-acao="iniciar-rota"]').click());
  await p.waitForTimeout(2600);
  const tX5 = await espiar();
  const marcaDepois = await p.evaluate((k) => window.HBX.cache.get(k, ''), CHAVE_FIM);
  nota(`[X2] iniciar de novo: status=${tX5.routeStatus} · marca antes="${marcaAntes}" depois="${marcaDepois || '(nenhuma)'}"`);
  eh('X5 · a marca do dia fechado SOBREVIVE a fechar e abrir o app',
    marcaAntes === '1', `antes="${marcaAntes}"`);
  eh('X6 · o iniciar APAGA a marca — a 2a leva ganha o recibo dela',
    tX5.routeStatus === 'ACTIVE' && !marcaDepois,
    `status=${tX5.routeStatus} depois="${marcaDepois}"`);

  /* ===================================================================
     CENA Y — O TOQUE RESPONDE NO MESMO QUADRO (12/08).

     A dor do dono: toca em "Montar rota" e NADA acontece por segundos — o
     primeiro recibo visual (`montando(1)`) só sai depois do materializar,
     que é rede — e gente fica tocando de novo até aparecer algo.

     O conserto tem duas peças e as duas se medem AQUI: a classe `aguarde`
     entra no botão vivo AINDA NO TOQUE (mesmo quadro, antes de qualquer
     await, com pointer-events desligado); e a trava é variável DA PONTE —
     dois toques rápidos despacham UM montar, medido nos POSTs contra o
     controle de um toque só. Y0 é o controle: a MESMA cena com um toque,
     porque "quantos POSTs um montar legítimo faz" é contrato do fluxo, não
     desta prova.
     =================================================================== */
  const Y_CENA = () => cena({
    entregas: [{ id: 'ag1', status: 'agendada', rotaOrdem: null, origem: 'recorrente', cliente: CLI_C5 }],
    agendaHoje: AGENDA_HOJE, mesmaBase: true, custoComoServidor: true,
  });
  const Y_ABRIR = async () => {
    await irPara('montagem', 2200);
    await tocarChip(DIA_B);
    /* 🔴 A CENA DECLARA O APARELHO SEM MODO LEMBRADO (17/08). O pouso do Montar
       agora obedece `mapa-modo` (§ `pousarNaRota`), e o cache é localStorage —
       sobrevive ao `goto` de cada cena. Sem esta linha, quem mede o pouso aqui
       ficaria à mercê do que a cena anterior gravou. Ver a cena MD. */
    await p.evaluate(() => window.HBX.cache.remove('mapa-modo'));
    await zerar();
    await p.waitForSelector('.pe-montagem [data-acao="montar-agora"]', { timeout: 8000 });
  };
  const contar = (lista, rota) => lista.filter((x) => x === rota).length;

  // Y0 — o CONTROLE: um toque só, e a régua do que um montar dispara.
  await Y_CENA();
  await Y_ABRIR();
  await p.evaluate(() => document.querySelector('.pe-montagem [data-acao="montar-agora"]').click());
  await p.waitForTimeout(2800);
  const postsY0 = await posts();
  const y0Planejar = contar(postsY0, '/logistica/rota/planejar');
  const y0Entregas = contar(postsY0, '/logistica/entregas');
  nota(`[Y0] UM toque no Montar: planejar=${y0Planejar} · entregas=${y0Entregas} · POSTs=${postsY0.join(' , ')}`);

  // Y — DOIS toques rápidos: o recibo é síncrono e o pedido é UM.
  await Y_CENA();
  await Y_ABRIR();
  const yToque = await p.evaluate(() => {
    const botao = document.querySelector('.pe-montagem [data-acao="montar-agora"]');
    botao.click();
    /* medido NO MESMO TICK do toque: se o recibo dependesse de repinte ou de
       resposta de rede, isto aqui ainda seria falso. */
    const noMesmoQuadro = botao.classList.contains('aguarde');
    const semDedo = getComputedStyle(botao).pointerEvents === 'none';
    botao.click();               // o dedo ansioso — de novo, no mesmo quadro
    return { noMesmoQuadro, semDedo };
  });
  await p.waitForTimeout(2800);
  const postsY = await posts();
  const yPlanejar = contar(postsY, '/logistica/rota/planejar');
  const yEntregas = contar(postsY, '/logistica/entregas');
  const tY = await espiar();
  const modoY = await p.evaluate(() => window.HBX.cache.get('mapa-modo', null));
  nota(`[Y] DOIS toques no Montar: sincrono=${yToque.noMesmoQuadro} semDedo=${yToque.semDedo} · planejar=${yPlanejar} · entregas=${yEntregas} · tela=${tY.tela} · mapa-modo=${JSON.stringify(modoY)}`);
  eh('Y1 · o botao ganha o estado "aguarde" NO MESMO quadro do toque', yToque.noMesmoQuadro);
  eh('Y2 · e o proprio no ja nao aceita segundo dedo (pointer-events)', yToque.semDedo);
  eh('Y3 · dois toques rapidos = UM montar (POSTs iguais ao controle de 1 toque)',
    yPlanejar === y0Planejar && yEntregas === y0Entregas,
    `2 toques: planejar=${yPlanejar}/${y0Planejar} entregas=${yEntregas}/${y0Entregas}`);
  /* 🔴 O DESTINO DO POUSO SUBIU PRO 3D (17/08) — mesma queixa do dono das 8
     fotos: *"vc removeu o efeito ao montar a rota"*. Esta cena fala de DOIS
     DEDOS, não de altura de pouso; mas o pouso é a última coisa que ela vê, e a
     pergunta tinha que acompanhar a regra: sem modo lembrado o Montar desce pro
     3D (`pousarNaRota`, default 'mapa' — § 32-verbos-montar-iniciar.js), que é
     por onde a coreografia da entrada acontece. A premissa (aparelho sem modo
     lembrado) é declarada no `Y_ABRIR`.
     E A ASSERÇÃO GANHOU A SEGUNDA METADE, que é o que interessa a ESTA cena:
     dedo ansioso não pode mudar o MODO LEMBRADO do aparelho. Se o caminho do
     duplo toque escrevesse `mapa-modo` (por exemplo pousando "pelo modo atual"
     em vez de ler o lembrado), o dono perderia a escolha dele por ter tocado
     duas vezes — e nenhuma outra prova olha pra isso. */
  eh('Y4 · o montar pousou no 3D, e os dois dedos NAO mexeram no modo lembrado',
    tY.tela === 'mapa' && modoY === null, `tela=${tY.tela} mapa-modo=${JSON.stringify(modoY)}`);

  /* ===================================================================
     CENA Z — ERRO SOLTA A TRAVA: o botao volta inteiro pra tentar de novo.
     O 409 de outro motorista e o erro mais real do montar (cena R); aqui ele
     so precisa falhar UMA vez — a 2a tentativa tem que sair, com POST novo.
     =================================================================== */
  await cena({
    entregas: [{ id: 'ag1', status: 'agendada', rotaOrdem: null, origem: 'recorrente', cliente: CLI_C5 }],
    agendaHoje: AGENDA_HOJE, mesmaBase: true, custoComoServidor: true,
    outroMotorista: { motorista: 'Ana Motorista', podeForcar: false },
  });
  await Y_ABRIR();
  await p.evaluate(() => document.querySelector('.pe-montagem [data-acao="montar-agora"]').click());
  await p.waitForTimeout(2800);
  /* o pé pode ter TROCADO de verbo no meio: o materializar (que veio antes do
     planejar falhar) já fez da lista a rota de hoje, e aí `pronta` vira 1 e o
     botão vivo é "Iniciar rota" (comportamento do app, não desta cena). O que
     se mede é o BOTÃO VIVO DO PÉ, com o verbo que ele tiver. */
  const Z_PE = '.pe-montagem [data-acao="montar-agora"], .pe-montagem [data-acao="iniciar-rota"]';
  const zDepoisDoErro = await p.evaluate((sel) => {
    const botao = document.querySelector(sel);
    return {
      existe: !!botao,
      verbo: botao ? (botao.dataset.acao || '') : '',
      aguardePreso: !!(botao && botao.classList.contains('aguarde')),
      portao: (document.querySelector('.portao h3') || {}).textContent || '',
    };
  }, Z_PE);
  const zPlanejar1 = contar(await posts(), '/logistica/rota/planejar');
  /* o gesto real do dedo: FECHAR o portão do erro antes de tentar de novo —
     medido em 12/08 que o clique com o portão aberto é dele (fecha e some). */
  await p.evaluate(() => {
    const x = document.querySelector('.portao-wrap button');
    if (x) x.click();
  });
  await p.waitForTimeout(400);
  await p.evaluate((sel) => {
    const botao = document.querySelector(sel);
    if (botao) botao.click();
  }, Z_PE);
  await p.waitForTimeout(2800);
  const zPlanejar2 = contar(await posts(), '/logistica/rota/planejar');
  const tZ = await espiar();
  nota(`[Z] montar falhou (409): portao="${zDepoisDoErro.portao}" · pe=${zDepoisDoErro.verbo} · aguardePreso=${zDepoisDoErro.aguardePreso} · planejar 1a=${zPlanejar1} 2a(total)=${zPlanejar2} · tela final=${tZ.tela}`);
  eh('Z1 · no ERRO a trava solta e o botao do pe volta ao normal (sem aguarde pendurado)',
    zDepoisDoErro.existe && !zDepoisDoErro.aguardePreso,
    `existe=${zDepoisDoErro.existe} (${zDepoisDoErro.verbo}) aguarde=${zDepoisDoErro.aguardePreso}`);
  eh('Z2 · e o toque seguinte DISPARA de novo (POST novo de planejar)',
    zPlanejar2 > zPlanejar1, `1a=${zPlanejar1} depois da 2a=${zPlanejar2}`);

  /* o IRMÃO DO MESMO DOCK: "Iniciar rota" (outro estado do mesmo pé) tem o
     mesmo formato de handler e ganhou a MESMA mecânica — só o síncrono se
     mede aqui; o resto é a mesma função. */
  await cena({ entregas: [], agendaHoje: AGENDA_HOJE, custoComoServidor: true, mesmaBase: true });
  await abrirDiaDeHoje(2600);
  await p.waitForSelector('.pe-montagem [data-acao="iniciar-rota"]', { timeout: 8000 });
  const yIniciar = await p.evaluate(() => {
    const postReal = window.API.post.bind(window.API);
    window.__veuAntesDoPrimeiroPost = null;
    window.API.post = (...args) => {
      if (window.__veuAntesDoPrimeiroPost === null) {
        window.__veuAntesDoPrimeiroPost = !!document.querySelector('.veu-montar');
      }
      return postReal(...args);
    };
    const botao = document.querySelector('.pe-montagem [data-acao="iniciar-rota"]');
    botao.click();
    return botao.classList.contains('aguarde');
  });
  await p.waitForTimeout(2600);
  const yIniciarVeu = await p.evaluate(() => ({
    antesDoPrimeiroPost: window.__veuAntesDoPrimeiroPost,
    presoNoEstado: !!(DADOS.rota && DADOS.rota.montando),
    aindaNaTela: !!document.querySelector('.veu-montar'),
  }));
  eh('Y5 · o "Iniciar rota" do mesmo dock responde no toque igual (padronizar = igualar)', yIniciar);
  eh('Y6 · o veu de carregamento nasce ANTES do primeiro pedido do Iniciar',
    yIniciarVeu.antesDoPrimeiroPost === true,
    `antesDoPrimeiroPost=${yIniciarVeu.antesDoPrimeiroPost}`);
  eh('Y7 · ao concluir, o Iniciar nao deixa o veu nem o estado presos',
    !yIniciarVeu.presoNoEstado && !yIniciarVeu.aindaNaTela,
    `estado=${yIniciarVeu.presoNoEstado} tela=${yIniciarVeu.aindaNaTela}`);

  /* Y8/Y9 — A VACINA DO BLOCO 1 DO LOTE 2 (15/08): o `montar-agora` em si,
     não só o irmão `iniciar-rota` medido acima. Até este lote o véu do
     `montarRota` só acendia DEPOIS do `materializarRascunho` (rede) — a rota
     grande do dono parecia travada por segundos. Mesma régua do Y6/Y7. */
  await Y_CENA();
  await Y_ABRIR();
  await p.evaluate(() => {
    const postReal = window.API.post.bind(window.API);
    window.__veuAntesDoPrimeiroPostMontar = null;
    window.API.post = (...args) => {
      if (window.__veuAntesDoPrimeiroPostMontar === null) {
        window.__veuAntesDoPrimeiroPostMontar = !!document.querySelector('.veu-montar');
      }
      return postReal(...args);
    };
  });
  await p.evaluate(() => document.querySelector('.pe-montagem [data-acao="montar-agora"]').click());
  await p.waitForTimeout(2800);
  const yMontarVeu = await p.evaluate(() => ({
    antesDoPrimeiroPost: window.__veuAntesDoPrimeiroPostMontar,
    presoNoEstado: !!(DADOS.rota && DADOS.rota.montando),
    aindaNaTela: !!document.querySelector('.veu-montar'),
  }));
  nota(`[Y8] veu do Montar antes do 1o POST=${yMontarVeu.antesDoPrimeiroPost}`);
  eh('Y8 · o veu de carregamento nasce ANTES do primeiro pedido do MONTAR (a vacina deste lote)',
    yMontarVeu.antesDoPrimeiroPost === true,
    `antesDoPrimeiroPost=${yMontarVeu.antesDoPrimeiroPost}`);
  eh('Y9 · ao concluir, o Montar nao deixa o veu nem o estado presos',
    !yMontarVeu.presoNoEstado && !yMontarVeu.aindaNaTela,
    `estado=${yMontarVeu.presoNoEstado} tela=${yMontarVeu.aindaNaTela}`);

  /* ===================================================================
     CENA AA — A ROTA FANTASMA: O DIA REMONTADO SOBRE A ROTA ENCERRADA
     (15/08, LOTE 1.1 — a "CENA W" do desenho; renomeada pra AA porque W já
     existe neste arquivo desde 12/08, "DIA SEM VENDA TAMBÉM ACABA").

     O print do dono: 16:57 Iniciar, 16:59 Cancelar — a rota fica ACTIVE,
     ZERO `LogisticaRouteStop`, `operationalEndedAt` carimbado; NO MESMO
     MINUTO o dia é remontado (51 entregas novas, com ordem). O `routeId`
     que o servidor publica continua apontando pra essa lápide: o Cancelar
     seguinte batia contra ela e virava no-op mudo — o dono ficava preso
     olhando "3 entregas de pé" com o pé "Iniciar" (a tela do print).

     Sem o dublê "respeitar o ref" (ver o POST de cancelar acima) e sem o
     `routeId` opt-in no GET, esta cena nunca reproduz o defeito (era
     exatamente por isso que ele ficava invisível):
       W1 (app, A1)  — a ref POSTADA é a do DIA, nunca a da rota morta
                        (`route:` só nasce de rota VIVA — `estadoDaRota()`).
       W2 (backend, C) — depois do "Sim" o dia ZERA e o dock volta pra
                        "Montar rota" (hoje, sem a cura: 3 entregas de pé
                        e "Iniciar" — a tela do print).
       W3 (backend, C) — zero aberta desenha "Montar rota" mesmo com uma
                        `LogisticaRoute` de pé (não-ACTIVE) — a prova que
                        faltava pro fix C.

     🔴 COMENTÁRIO CORRIGIDO (LOTE 1.2, revisão adversarial): "mede as DUAS
     curas juntas" era MENTIRA — só AA1 depende de qual ref o app manda.
     AA2/AA3/AA4 passam mesmo com o app quebrado (route: em vez de draft:),
     porque o dublê do cancelar (linha acima) já trata `route:<S.routeId>` e
     `draft:...` do MESMO jeito nesta cena (rota ENCERRADA, sem regressão do
     furo 1 no meio — ver CENA AD): os dois esvaziam o dia igual. Medido:
     revertendo só o fix da ponte (furo1), a corrida inteira dá 135/136 —
     SÓ AA1 reprova. AA2-4 são medida honesta do estado ENCERRADA (fix C do
     lote 1.1, que continua de pé), não da escolha de ref — é a CENA AD, logo
     abaixo, que prova a ref numa rota VIVA não-ENCERRADA. */
  const CLI_AA3 = { id: 'af3', nome: 'Zeca Fantasma', endereco: 'Rua Z, 3', lat: -22.406, lng: -47.556 };
  await cena({
    routeId: 'route-fantasma-1',
    routeStatus: 'ENCERRADA',
    // as 3 abertas JÁ remontadas (rotaOrdem gravado) — o dia que sobrou por
    // cima da lápide, exatamente como o banco de produção mediu.
    entregas: [
      { id: 'af1', status: 'agendada', rotaOrdem: 0, origem: 'recorrente', cliente: CLI_C1 },
      { id: 'af2', status: 'agendada', rotaOrdem: 1, origem: 'recorrente', cliente: CLI_C5 },
      { id: 'af3', status: 'agendada', rotaOrdem: 2, origem: 'recorrente', cliente: CLI_AA3 },
    ],
  });
  // mesma passagem da cena D: o boot correu contra o servidor REAL antes do
  // dublê existir — passar pela Montagem garante que `estadoRota` releu.
  await irPara('montagem');
  await irPara('rota', 1600);
  const tAApre = await espiar();
  nota(`[AA] antes do cancelar: tela=${tAApre.tela} · dock="${tAApre.dock}" · entregas=${tAApre.entregasNoServidor} · routeStatus=${tAApre.routeStatus}`);
  await zerar();
  const achouCancelarAA = await p.evaluate(() => {
    const x = document.querySelector('.tmx-sat [data-acao="cancelar-rota"]');
    if (x) { x.click(); return true; }
    return false;
  });
  await p.waitForTimeout(500);
  await p.evaluate(() => {
    const x = document.querySelector('.portao-wrap .principal');
    if (x) x.click();
  });
  await p.waitForTimeout(2800);
  const tAA1 = await espiar();
  const cancelarAABodies = await postsDe('/logistica/rota/continuidade/cancelar');
  nota(`[AA] cancelar: achouBotao=${achouCancelarAA} · refPostada=${JSON.stringify(cancelarAABodies)} · tela=${tAA1.tela} · dock="${tAA1.dock}" · entregas=${tAA1.entregasNoServidor} · routeStatus=${tAA1.routeStatus}`);
  eh('AA1 (W1) · a ref POSTADA e a do DIA, nunca a da rota morta (route: so nasce de rota VIVA)',
    achouCancelarAA && cancelarAABodies.length === 1 && /^draft:/.test(String(cancelarAABodies[0] && cancelarAABodies[0].ref)),
    `ref=${JSON.stringify(cancelarAABodies)}`);
  eh('AA2 (W2) · depois do Sim o dia ZERA — nao sobram as 3 entregas de pe do print',
    tAA1.entregasNoServidor === 0, `entregas=${tAA1.entregasNoServidor}`);
  eh('AA3 (W2) · e o dock volta para "Montar rota" (nao fica "Iniciar" sobre o dia morto)',
    tAA1.tela === 'rota' && /Montar rota/i.test(tAA1.dock), `tela=${tAA1.tela} dock="${tAA1.dock}"`);
  eh('AA4 (W3) · zero aberta desenha Montar rota mesmo com uma LogisticaRoute de pe, nao-ACTIVE (fix C — antes sem prova)',
    tAA1.routeStatus !== 'ACTIVE' && tAA1.routeStatus !== 'INITIALIZING' && /Montar rota/i.test(tAA1.dock),
    `routeStatus=${tAA1.routeStatus} dock="${tAA1.dock}"`);

  /* ===================================================================
     CENA AD — A REGRESSÃO DO FURO 1 (LOTE 1.2), CENA TROCADA NO LOTE 1.3.

     🔴 POR QUE A CENA MUDOU (revisão adversarial ao 1.2): a AD original usava
     uma rota PLANNED e contava com o dublê recusar `draft:` "porque a rota
     está viva". Só que ISSO É RÉGUA DO DUBLÊ, não do servidor: no backend
     real uma PLANNED deixada por um Iniciar que falhou NÃO TEM STOP NENHUM,
     então as abertas são linhas SOLTAS do dia — o ramo `draft:` acharia todas
     e o cancelar funcionaria. A cena reprovava contra uma ficção.

     O CASO VERDADEIRO é a rota que SEGURA as abertas nos stops dela e não
     está encerrada: a COMPLETED com paradas abertas presas dentro ("a rota
     COMPLETED com 14 paradas abertas presas" que existe em produção, §5 do
     desenho). Aí o `resolve()` do ramo `draft:` EXCLUI de propósito toda
     entrega presa em stop de rota com `operationalEndedAt` nulo — nada
     resolve, NotFound, e a saída graciosa do F5 devolve `{ok:true,
     canceladas:0}` SEM cancelar nada. O no-op mudo, que parece sucesso.

     `estadoDaRota` chama uma COMPLETED-com-abertas-montadas de 'pronta' (não
     'rodando'), então com a régua do lote 1.1 (`route:` só pra 'rodando') a
     ref cai em `draft:` — e a cena REPROVA nos dois: ref errada (AD1) e
     no-op mudo (AD2). Com a régua do 1.2 (rota VIVA = qualquer coisa !=
     ENCERRADA) sai `route:` e o cancelar cancela de verdade.

     AE, logo abaixo, é o par que faltava: a PLANNED-fantasma SEM stop —
     `route:` também, mas resolvendo pelo DIA (`diaDoAlvoMorto`).
     =================================================================== */
  const CLI_AD2 = { id: 'ad2', nome: 'Duda Viva', endereco: 'Rua D, 2', lat: -22.407, lng: -47.557 };
  await cena({
    routeId: 'route-completed-com-presas',
    routeStatus: 'COMPLETED',
    // as abertas estão CONGELADAS nos stops desta rota — é isto que faz o
    // ramo `draft:` do servidor não enxergar nenhuma delas.
    stopsPresos: true,
    entregas: [
      { id: 'ad1', status: 'agendada', rotaOrdem: 0, origem: 'recorrente', cliente: CLI_C1 },
      { id: 'ad2', status: 'agendada', rotaOrdem: 1, origem: 'recorrente', cliente: CLI_AD2 },
    ],
  });
  await irPara('montagem');
  await irPara('rota', 1600);
  await zerar();
  const achouCancelarAD = await p.evaluate(() => {
    const x = document.querySelector('.tmx-sat [data-acao="cancelar-rota"]');
    if (x) { x.click(); return true; }
    return false;
  });
  await p.waitForTimeout(500);
  await p.evaluate(() => {
    const x = document.querySelector('.portao-wrap .principal');
    if (x) x.click();
  });
  await p.waitForTimeout(2800);
  const tAD1 = await espiar();
  const cancelarADBodies = await postsDe('/logistica/rota/continuidade/cancelar');
  nota(`[AD] cancelar (COMPLETED com as abertas PRESAS nos stops, 'pronta' != 'rodando'): achouBotao=${achouCancelarAD} · refPostada=${JSON.stringify(cancelarADBodies)} · entregas=${tAD1.entregasNoServidor} · routeStatus=${tAD1.routeStatus}`);
  eh('AD1 (FURO 1) · rota VIVA nao-ENCERRADA segurando as abertas manda route:, mesmo sem estar rodando',
    achouCancelarAD && cancelarADBodies.length === 1
      && cancelarADBodies[0] && cancelarADBodies[0].ref === 'route:route-completed-com-presas',
    `ref=${JSON.stringify(cancelarADBodies)}`);
  eh('AD2 (FURO 1) · o cancelar cancela de verdade — nao vira no-op mudo (as abertas somem do servidor)',
    tAD1.entregasNoServidor === 0, `entregas=${tAD1.entregasNoServidor}`);

  /* ===================================================================
     CENA AE (LOTE 1.3) — O PAR HONESTO DA AD: a PLANNED-FANTASMA, aquela
     que o Iniciar abortado deixou pra trás SEM stop nenhum. A ref também
     sai `route:` (rota viva, não-ENCERRADA), e é o `diaDoAlvoMorto` do
     servidor que deriva o DIA e limpa as abertas soltas. Sem esta cena, a
     régua "rota viva ⇒ route:" ficaria provada só no caso com stop — e o
     caso SEM stop é o mais comum dos dois em produção.
     =================================================================== */
  await cena({
    routeId: 'route-planned-fantasma',
    routeStatus: 'PLANNED',
    // NENHUM stop: o Iniciar morreu antes do congelamento.
    entregas: [
      { id: 'ae1', status: 'agendada', rotaOrdem: 0, origem: 'recorrente', cliente: CLI_C1 },
      { id: 'ae2', status: 'agendada', rotaOrdem: 1, origem: 'recorrente', cliente: CLI_AD2 },
    ],
  });
  await irPara('montagem');
  await irPara('rota', 1600);
  await zerar();
  await p.evaluate(() => {
    const x = document.querySelector('.tmx-sat [data-acao="cancelar-rota"]');
    if (x) x.click();
  });
  await p.waitForTimeout(500);
  await p.evaluate(() => {
    const x = document.querySelector('.portao-wrap .principal');
    if (x) x.click();
  });
  await p.waitForTimeout(2800);
  const tAE = await espiar();
  const cancelarAEBodies = await postsDe('/logistica/rota/continuidade/cancelar');
  nota(`[AE] cancelar (PLANNED-fantasma, ZERO stop): refPostada=${JSON.stringify(cancelarAEBodies)} · entregas=${tAE.entregasNoServidor} · dock="${tAE.dock}"`);
  eh('AE1 · a PLANNED-fantasma (sem stop) tambem manda route: — rota viva e rota viva',
    cancelarAEBodies.length === 1 && cancelarAEBodies[0]
      && cancelarAEBodies[0].ref === 'route:route-planned-fantasma',
    `ref=${JSON.stringify(cancelarAEBodies)}`);
  eh('AE2 · e o dia esvazia pelo diaDoAlvoMorto — a rota sem stop nao vira beco',
    tAE.entregasNoServidor === 0, `entregas=${tAE.entregasNoServidor}`);

  /* ===================================================================
     CENA AB/AC — O RESYNC DE 409 NO CANCELAR (15/08, W4/W5 do desenho;
     molde nas cenas U5/U6 do mesmo arquivo).

     AB (W4): 409 SEM código nomeado → o resync BRANDO (`avisoErroContinuidade`)
     recarrega e abre "Este dia mudou" — e a chave de idempotência do
     CONFIRMAR (dinheiro) SOBREVIVE, porque `esquecerRotaCarregada` já não a
     apaga (correção 15/08, U6 é o molde).
     AC (W5): o MESMO 409, mas COM código nomeado (ROTA_DE_OUTRO_MOTORISTA)
     — o resync genérico não pode engolir o portão próprio do código.
     =================================================================== */
  await cena({
    entregas: [{ id: 'ab1', status: 'agendada', rotaOrdem: null, origem: 'recorrente', cliente: CLI_C5 }],
    agendaHoje: AGENDA_HOJE, mesmaBase: true, custoComoServidor: true,
    cancelarRejeita: { status: 409, message: 'A rota mudou enquanto você decidia.' },
  });
  await irPara('montagem', 2200);
  await tocarChip(DIA_B);
  await p.waitForSelector('.pe-montagem [data-acao="montar-agora"]', { timeout: 8000 });
  await p.evaluate(() => document.querySelector('.pe-montagem [data-acao="montar-agora"]').click());
  await p.waitForTimeout(2800);
  await p.evaluate(() => { window.HBX.cache.set('entrega-confirmar:ab1', 'idem-ab1-em-voo'); });
  await zerar();
  await p.evaluate(() => {
    const x = document.querySelector('.tmx-sat [data-acao="cancelar-rota"]');
    if (x) x.click();
  });
  await p.waitForTimeout(500);
  await p.evaluate(() => {
    const x = document.querySelector('.portao-wrap .principal');
    if (x) x.click();
  });
  await p.waitForTimeout(2800);
  const tAB = await espiar();
  const cacheAB = await p.evaluate(() => window.HBX.cache.get('entrega-confirmar:ab1', null));
  nota(`[AB] 409 sem codigo: portao="${tAB.portao}" sub="${tAB.portaoSub}" · entrega-confirmar sobrevive=${JSON.stringify(cacheAB)}`);
  eh('AB1 (W4) · 409 SEM codigo nomeado abre o portao "Este dia mudou" (resync brando)',
    tAB.portao === 'Este dia mudou', `portao="${tAB.portao}"`);
  eh('AB2 (W4, LEI 15/08) · a chave de idempotencia do CONFIRMAR sobrevive ao resync (dinheiro nao se apaga em limpeza de tela)',
    cacheAB === 'idem-ab1-em-voo', `entrega-confirmar:ab1=${JSON.stringify(cacheAB)}`);

  await cena({
    entregas: [{ id: 'ac1', status: 'agendada', rotaOrdem: null, origem: 'recorrente', cliente: CLI_C5 }],
    agendaHoje: AGENDA_HOJE, mesmaBase: true, custoComoServidor: true,
    cancelarRejeita: {
      status: 409, code: 'ROTA_DE_OUTRO_MOTORISTA',
      message: 'Essa rota já foi montada por: Outro Motorista.',
    },
  });
  await irPara('montagem', 2200);
  await tocarChip(DIA_B);
  await p.waitForSelector('.pe-montagem [data-acao="montar-agora"]', { timeout: 8000 });
  await p.evaluate(() => document.querySelector('.pe-montagem [data-acao="montar-agora"]').click());
  await p.waitForTimeout(2800);
  await zerar();
  await p.evaluate(() => {
    const x = document.querySelector('.tmx-sat [data-acao="cancelar-rota"]');
    if (x) x.click();
  });
  await p.waitForTimeout(500);
  await p.evaluate(() => {
    const x = document.querySelector('.portao-wrap .principal');
    if (x) x.click();
  });
  await p.waitForTimeout(2800);
  const tAC = await espiar();
  nota(`[AC] 409 com codigo nomeado: portao="${tAC.portao}"`);
  eh('AC1 (W5) · 409 COM codigo nomeado segue o portao proprio dele ("Rota já montada") — o resync generico nao o engole',
    tAC.portao === 'Rota já montada', `portao="${tAC.portao}"`);

  await b.close();
  console.log('\n=== MEDIDAS ===');
  notas.forEach((n) => console.log('  · ' + n));
  console.log('\n=== PROVA: fluxo montar -> iniciar ===');
  ok.forEach((n) => console.log('  ok  ' + n));
  falhou.forEach((n) => console.log('  XX  ' + n));
  console.log('\n' + ok.length + '/' + (ok.length + falhou.length));
  process.exit(SO_MEDIR ? 0 : (falhou.length ? 1 : 0));
})();
