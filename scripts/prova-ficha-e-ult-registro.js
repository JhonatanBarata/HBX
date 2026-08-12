#!/usr/bin/env node
/**
 * PROVA das TRÊS regressões que o dono reportou em 12/08:
 *
 *     node scripts/prova-ficha-e-ult-registro.js
 *
 *   1. MONTAGEM — o "Pendente" repetido virou ÚLTIMO REGISTRO do cliente
 *      (DD/MM da última entrega CONCLUÍDA; "Pendente" só pra quem nunca teve).
 *   2. MONTAGEM — o valor deixou de se chamar "Marcado" (a palavra do FIADO) e
 *      passou a ser "Valor" — o mesmo número, o significado certo.
 *   3. FICHA — o Financeiro do cliente voltou (some com o módulo desligado), e
 *      os produtos do cliente voltaram a ser EDITÁVEIS (o vínculo, nunca o
 *      catálogo).
 *
 * Dirige o `ponte.js` de verdade contra um servidor DUBLADO: a pergunta aqui
 * não é "pinta igual ao mock?" (isso é o `casca-conferir`) e sim "o dedo aperta
 * e o servidor CERTO é chamado, com o corpo certo?".
 *
 * 🔴 O DUBLÊ ENTRA DEPOIS DO BOOT — `native.js` cria o `window.HBX` real no load
 * e engoliria um `addInitScript`; `temPonte`/`chamar` leem `window.HBX` na hora
 * da chamada, então trocar depois vale pro app inteiro.
 */
const path = require('path');
const { chromium } = require('playwright');

const APP = 'file:///' + path
  .join(__dirname, '..', 'EntregaShell/app/src/logistica/assets/app/index.html')
  .replace(/\\/g, '/');

/** @param {{financeiro:boolean, admin:boolean}} cfg */
const PONTE = (cfg) => {
  window.__chamadas = [];
  const hoje = new Date();
  const iso = (d) => new Date(d).toISOString();
  // 10/08 e 04/08 do ano corrente: datas FIXAS não sobrevivem à virada do ano.
  const dias = (n) => iso(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - n, 15, 0, 0));

  const PREVIA = {
    clientes: [
      {
        customerProfileId: 'c1', nome: 'Ademir', enderecoLinha: 'Rua 16, 199', bairro: 'Mãe preta',
        lat: -22.41, lng: -47.56, resolveSozinho: true,
        itens: [{ productId: 1, nome: 'Galão 20Litros', qtd: 1, valorUnit: 11 }],
        // quem JÁ recebeu: a data tem que virar DD/MM
        ultimaEntregaAt: dias(2),
      },
      {
        customerProfileId: 'c2', nome: 'Larissa', enderecoLinha: 'Rua 21, 783', bairro: 'Cervezão',
        lat: -22.42, lng: -47.57, resolveSozinho: true,
        itens: [{ productId: 1, nome: 'Galão 20Litros', qtd: 1, valorUnit: 11 }],
        // quem NUNCA recebeu: o campo não vem, e a tela diz "Pendente"
      },
    ],
  };
  const DETALHE = {
    id: 'c1', name: 'Ademir', tipo: 'pf', document: null,
    endereco: 'Rua 16', numero: '199', bairro: 'Mãe preta', cidade: 'Rio Claro', uf: 'SP', cep: '13500-000',
    whatsapp: '(19) 99999-0000', observacoes: '', isCliente: true,
    formaPagamento: 'mensal', metodoPadrao: null, contabilizar: true,
    diaFechamento: 10, limiteFiado: 150, avisarCobranca: false,
    debitoAtual: 36, entregasCount: 42, ultimaEntregaAt: dias(2),
    locais: [{ id: 'l1', apelido: 'Casa', endereco: 'Rua 16', numero: '199', bairro: 'Mãe preta', cidade: 'Rio Claro', uf: 'SP', cep: '13500-000', isPrincipal: true, ativo: true }],
    telefones: [{ id: 'k1', nome: 'Ademir', whatsapp: '(19) 99999-0000', phone: null, isPrincipal: true }],
  };
  const VINCULOS = [
    { id: 'v1', customerProfileId: 'c1', productId: 1, qtdPadrao: 2, precoAcordado: 22, ativo: true, localId: null,
      produto: { id: 1, nome: 'Galão 20Litros', unidade: 'galão', precoCatalogo: 11 } },
  ];

  window.HBX = {
    api(caminho, opcoes) {
      const metodo = (opcoes && opcoes.method) || 'GET';
      window.__chamadas.push([metodo, caminho, (opcoes && opcoes.body) || null]);
      if (caminho.indexOf('/logistica/config') === 0) {
        const base = {
          moduloFinanceiroAtivo: cfg.financeiro, cobrancaSimples: false, precoPorClienteAtivo: true,
          aceitaNaHora: true, aceitaMensal: true, aceitaFiado: true,
          avisoChegandoEnabled: false, avisoChegandoDistanciaM: 500,
        };
        // ADMIN = o servidor manda o bloco comercial (`modoRotaPadrao`). É o
        // MESMO sinal que o app usa de verdade — nada inventado pro teste.
        return Promise.resolve(cfg.admin ? Object.assign({ modoRotaPadrao: 'NORMAL' }, base) : base);
      }
      if (caminho.indexOf('/logistica/dia-preview') === 0) return Promise.resolve(JSON.parse(JSON.stringify(PREVIA)));
      if (caminho.indexOf('/logistica/cliente-produtos') === 0 && metodo === 'GET') {
        return Promise.resolve(JSON.parse(JSON.stringify(VINCULOS)));
      }
      if (caminho.indexOf('/logistica/cliente-produtos') === 0) return Promise.resolve({ ok: true });
      if (caminho.indexOf('/nucleo/clientes/c1') === 0) return Promise.resolve(JSON.parse(JSON.stringify(DETALHE)));
      if (caminho.indexOf('/nucleo/clientes') === 0) {
        // a LISTA de clientes: a porta pela qual o motorista (não-admin) chega
        // na ficha — sem chip de dia, a Montagem não é caminho pra ele.
        return Promise.resolve({
          items: [{
            id: 'c1', name: 'Ademir', isCliente: true, endereco: 'Rua 16, 199', cidade: 'Rio Claro',
            diasEntrega: [1], pendencias: [], entregasCount: 42, debitoAtual: 36, ultimaEntregaAt: dias(2),
          }],
          total: 1,
        });
      }
      if (caminho.indexOf('/logistica/produtos') === 0) {
        return Promise.resolve([{ id: 1, nome: 'Galão 20Litros', ativo: true, precoCatalogo: 11 },
          { id: 2, nome: 'Água c/ gás 1,5L', ativo: true, precoCatalogo: 24 }]);
      }
      if (caminho.indexOf('/logistica/clientes/') === 0) return Promise.resolve({ ok: true });
      if (caminho.indexOf('/logistica/rota/historico') === 0) return Promise.resolve({ dias: [] });
      if (caminho.indexOf('/logistica/rota') === 0) return Promise.resolve({ items: [], estado: 'montar' });
      if (caminho.indexOf('/logistica/agenda') === 0) {
        // TODO dia tem gente: o chip precisa existir pra o dedo tocar (a
        // Montagem abre SEM dia desde 10/08 — a lista é um TOQUE, não o boot).
        return Promise.resolve({ dias: [1, 2, 3, 4, 5, 6, 7].map((n) => ({ diaSemana: n, totalClientesDia: 2 })) });
      }
      if (caminho.indexOf('/credits/me') === 0) return Promise.resolve({ balance: 100 });
      return Promise.resolve({});
    },
    requestLocationPermission() {}, manterTelaAcesa() {}, modoNavegacao() {}, speak() {},
    soundPrefs: { get: () => ({ master: true, voz: true }), set() {} },
  };
  window.HBXApp = window.HBXApp || {};
};

const ok = [];
const falhou = [];
const eh = (nome, cond) => (cond ? ok : falhou).push(nome);
const ddmm = (n) => {
  const h = new Date();
  const d = new Date(h.getFullYear(), h.getMonth(), h.getDate() - n);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/* 🔴 A MONTAGEM ABRE SEM DIA (10/08, ordem do dono: "ao entrar no montagem de
   rota, não carregar o dia automaticamente"). A lista do dia é um TOQUE no chip
   — e é esse gesto que a prova precisa fazer, senão ela mede a tela vazia. */
async function abrirDia(p) {
  await p.evaluate(() => window.ir('montagem'));
  await p.waitForTimeout(900);
  const tocou = await p.evaluate(() => {
    const c = document.querySelector('[data-acao="montar-dia"]');
    if (!c) return false;
    c.click();
    return true;
  });
  if (!tocou) throw new Error('a Montagem nasceu sem chip de dia — o dublê da agenda nao respondeu');
  await p.waitForTimeout(1500);
}

/** o toque no cartão da Montagem — a porta que o dono usa pra chegar na ficha */
async function abrirFicha(p) {
  const achou = await p.evaluate(() => {
    const el = document.querySelector('.stops .stop[data-acao="abrir-cliente"]');
    if (!el) return false;
    el.click();
    return true;
  });
  if (!achou) {
    const onde = await p.evaluate(() => ({
      tela: (function () { try { return atual; } catch (e) { return null; } })(),
      stops: document.querySelectorAll('.stops .stop').length,
    }));
    throw new Error(`nenhum cartao com abrir-cliente na Montagem (tela=${onde.tela} stops=${onde.stops})`);
  }
  await p.waitForTimeout(1200);
  const tela = await p.evaluate(() => { try { return atual; } catch (e) { return null; } });
  if (tela !== 'ficha') throw new Error(`o toque no cartao nao abriu a ficha (ficou em ${tela})`);
}

/** clica e explica quando o alvo não existe — "null.click" não diz nada */
async function tocar(p, seletor) {
  const achou = await p.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return false;
    el.click();
    return true;
  }, seletor);
  if (!achou) {
    const tela = await p.evaluate(() => { try { return atual; } catch (e) { return null; } });
    throw new Error(`nao achei "${seletor}" (tela=${tela})`);
  }
}

/** abre o app com a config pedida e devolve a página já com o dublê no ar */
async function abrir(ctx, cfg) {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => falhou.push('ERRO DE PAGINA: ' + e.message));
  await p.goto(APP);
  await p.waitForTimeout(400);
  await p.evaluate(PONTE, cfg);
  /* 🔴 A ORDEM IMPORTA, e ela é a mesma do aparelho: PRIMEIRO a config (é ela
     que diz quem é admin e se o Financeiro está ligado), DEPOIS a agenda — o
     `publicarMontarDias` tem portão de admin, e publicar os chips antes de
     saber quem é o ator os deixaria fora da tela pra sempre. */
  await p.evaluate(() => window.ir('ajustes'));
  await p.waitForTimeout(800);
  /* `carregarBarra` tem trava de 3 s e já queimou a dela no BOOT (contra o
     servidor real, que aqui não existe) — é ele quem traz a agenda que acende
     os chips. O foco é o atalho que a própria ponte declara. */
  await p.waitForTimeout(3200);
  await p.evaluate(() => window.dispatchEvent(new Event('focus')));
  await p.waitForTimeout(900);
  await p.evaluate(() => window.HBXRota && window.HBXRota.carregar());
  await p.waitForTimeout(700);
  return p;
}

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 940 } });

  /* ===== 1 e 2 — A DIREITA DO CARTÃO DA MONTAGEM ===================== */
  const p = await abrir(ctx, { financeiro: true, admin: true });
  await abrirDia(p);

  const m = await p.evaluate(() => {
    const linhas = [...document.querySelectorAll('.stops .stop')].map((el) => ({
      nome: (el.querySelector('.who strong') || {}).textContent,
      rotulos: [...el.querySelectorAll('.side .marc small')].map((x) => x.textContent),
      valores: [...el.querySelectorAll('.side .marc b')].map((x) => x.textContent),
      pill: (el.querySelector('.side .pill') || {}).textContent || '',
    }));
    return { linhas, corpo: document.body.innerText };
  });

  eh('a Montagem desenhou as 2 linhas do dia', m.linhas.length === 2);
  const l1 = m.linhas[0] || { rotulos: [], valores: [] };
  const l2 = m.linhas[1] || { rotulos: [], valores: [] };
  eh('o dinheiro se chama VALOR, nao "Marcado"', l1.rotulos[0] === 'Valor');
  eh('e o NUMERO nao mudou (qtd x preco = 11,00)', l1.valores[0] === 'R$ 11,00');
  eh('a palavra "Marcado" sumiu da Montagem', m.corpo.indexOf('Marcado') < 0);
  eh('o 2o slot e o ULTIMO REGISTRO', l1.rotulos[1] === 'Ult. Registro');
  eh('quem ja recebeu mostra a DATA em DD/MM', l1.valores[1] === ddmm(2));
  eh('quem NUNCA recebeu continua "Pendente"', l2.rotulos[1] === 'Ult. Registro' && l2.valores[1] === 'Pendente');
  /* 🔴 A PILULA NAO SUMIU — ela so parou de repetir "Pendente" em todo mundo.
     Sem desfecho ela nao aparece; com desfecho ela volta (é a ordem de 09/08,
     "os botões do status não estão aparecendo", que continua valendo). */
  eh('sem desfecho, nenhuma pilula de status na Montagem', !l1.pill && !l2.pill);

  /* ===== 3 — A FICHA: FINANCEIRO E PRODUTOS ========================== */
  await abrirFicha(p);

  const f = await p.evaluate(() => {
    const grupos = [...document.querySelectorAll('.grupo')].map((g) => g.textContent.trim());
    const chaves = [...document.querySelectorAll('[data-acao^="chave-"]')].map((c) => ({
      acao: c.dataset.acao, on: !!c.querySelector('.chave.on'),
    }));
    return {
      tela: (function () { try { return atual; } catch (e) { return null; } })(),
      grupos,
      saldo: (document.querySelector('.rowline b') || {}).textContent,
      formaOn: (document.querySelector('[data-acao="forma-cliente"].on b') || {}).textContent,
      dia: (document.querySelector('[data-campo="dia-fechamento"]') || {}).value,
      limite: (document.querySelector('[data-campo="limite-fiado"]') || {}).value,
      chaves,
      produtoTemPorta: !!document.querySelector('[data-acao="abrir-vinculo"]'),
      novoTemPorta: !!document.querySelector('[data-acao="novo-vinculo"]'),
      resumo: (document.querySelector('.stop-top span span') || {}).textContent,
    };
  });

  eh('o cartao da Montagem abre a FICHA do cliente', f.tela === 'ficha');
  eh('a ficha tem a secao Financeiro', f.grupos.indexOf('Financeiro') >= 0);
  eh('e o SALDO do cliente aparece (debitoAtual)', f.saldo === 'R$ 36,00');
  eh('a forma vigente ja vem acesa (mensal)', f.formaOn === 'Mensal');
  eh('o dia de fechamento veio do servidor', f.dia === '10');
  eh('o limite de fiado veio do servidor', f.limite === '150,00');
  eh('a chave Contabilizar veio LIGADA', (f.chaves.find((c) => c.acao === 'chave-contabilizar') || {}).on === true);
  eh('a chave Avisar cobranca veio DESLIGADA (avisarCobranca:false)',
    (f.chaves.find((c) => c.acao === 'chave-avisar-cobranca') || {}).on === false);
  eh('o "42 entregas" do cabecalho veio do DETALHE', /42 entregas/.test(f.resumo || ''));
  eh('a linha do produto tem PORTA (abrir-vinculo)', f.produtoTemPorta === true);
  eh('o "Novo produto / entrega" tem VERBO', f.novoTemPorta === true);

  /* O Salvar manda o financeiro — e SÓ o que mudou. */
  await p.evaluate(() => { window.__chamadas = []; });
  await tocar(p, '[data-acao="salvar-cliente"]');
  await p.waitForTimeout(900);
  const semMudanca = await p.evaluate(() => ({
    patches: window.__chamadas.filter((c) => c[0] === 'PATCH').map((c) => c[1]),
    titulo: (document.querySelector('.portao h3') || {}).textContent,
  }));
  eh('abrir e salvar SEM mexer em nada nao reescreve contrato nenhum', semMudanca.patches.length === 0);
  eh('e a tela diz "Nada mudou"', semMudanca.titulo === 'Nada mudou');

  await p.evaluate(() => {
    const b0 = document.querySelector('.portao [data-fechar]');
    if (b0) b0.click();
  });
  await p.waitForTimeout(300);
  await tocar(p, '[data-acao="chave-avisar-cobranca"]');
  await p.waitForTimeout(300);
  await p.evaluate(() => { window.__chamadas = []; });
  await tocar(p, '[data-acao="salvar-cliente"]');
  await p.waitForTimeout(1200);
  const salvou = await p.evaluate(() => window.__chamadas.filter((c) => c[0] === 'PATCH' && /\/financeiro$/.test(c[1])));
  eh('mexer numa chave manda o PATCH do financeiro', salvou.length === 1);
  eh('e o corpo leva SO o campo que mudou', salvou.length === 1
    && JSON.stringify(salvou[0][2]) === JSON.stringify({ avisarCobranca: true }));

  /* O VÍNCULO: a linha do produto abre a tela do vínculo, não o catálogo. */
  await p.evaluate(() => {
    const b0 = document.querySelector('.portao [data-fechar]');
    if (b0) b0.click();
  });
  await p.waitForTimeout(400);
  await tocar(p, '[data-acao="abrir-vinculo"]');
  await p.waitForTimeout(900);
  const v = await p.evaluate(() => ({
    tela: (function () { try { return atual; } catch (e) { return null; } })(),
    titulo: (document.querySelector('.stop-top strong') || {}).textContent,
    cliente: (document.querySelector('.stop-top span span') || {}).textContent,
    qtd: (document.querySelector('[data-campo="vinculo-qtd"]') || {}).value,
    preco: (document.querySelector('[data-campo="vinculo-preco"]') || {}).value,
    remover: !!document.querySelector('[data-acao="remover-vinculo"]'),
  }));
  eh('a linha do produto abre a tela do VINCULO', v.tela === 'fichavinculo');
  eh('e ela fala do produto DAQUELE cliente', v.titulo === 'Galão 20Litros' && v.cliente === 'Ademir');
  eh('a quantidade do vinculo veio do servidor', v.qtd === '2');
  eh('o preco combinado com ELE veio do servidor', v.preco === '22,00');
  eh('existe o Remover (vinculo que existe pode sair)', v.remover === true);

  await p.evaluate(() => {
    const el = document.querySelector('[data-campo="vinculo-qtd"]');
    el.value = '3'; el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await p.evaluate(() => { window.__chamadas = []; });
  await tocar(p, '[data-acao="salvar-vinculo"]');
  await p.waitForTimeout(1200);
  const gravou = await p.evaluate(() => window.__chamadas.filter((c) => c[0] === 'PATCH' && c[1].indexOf('/logistica/cliente-produtos/') === 0));
  eh('salvar o vinculo faz PATCH em /logistica/cliente-produtos/:id', gravou.length === 1);
  eh('e o corpo leva SO a quantidade que mudou', gravou.length === 1
    && JSON.stringify(gravou[0][2]) === JSON.stringify({ qtdPadrao: 3 }));
  const naoTocouCatalogo = await p.evaluate(() => window.__chamadas
    .filter((c) => c[0] !== 'GET' && /\/logistica\/produtos/.test(c[1])).length);
  eh('e o CATALOGO da empresa nao foi tocado', naoTocouCatalogo === 0);

  await p.close();

  /* ===== 3b — FINANCEIRO DESLIGADO: a secao inteira SOME ============= */
  const p2 = await abrir(ctx, { financeiro: false, admin: true });
  await abrirDia(p2);
  await abrirFicha(p2);
  const off = await p2.evaluate(() => ({
    grupos: [...document.querySelectorAll('.grupo')].map((g) => g.textContent.trim()),
    chaves: document.querySelectorAll('[data-acao="chave-contabilizar"]').length,
    produtoTemPorta: !!document.querySelector('[data-acao="abrir-vinculo"]'),
    reg: [...document.querySelectorAll('.grupo')].length,
  }));
  eh('financeiro DESLIGADO: nenhuma secao Financeiro na ficha', off.grupos.indexOf('Financeiro') < 0);
  eh('e nenhuma chave de dinheiro sobrou pendurada', off.chaves === 0);
  eh('mas os PRODUTOS continuam editaveis (nao sao dinheiro)', off.produtoTemPorta === true);
  await p2.close();

  /* ===== 3c — NAO-ADMIN: ve o saldo, nao edita o contrato ============ */
  const p3 = await abrir(ctx, { financeiro: true, admin: false });
  /* Motorista não tem chip de dia (a Montagem é tela de admin) — ele chega na
     ficha pela lista de Clientes, que é a porta dele de verdade. */
  await p3.evaluate(() => window.ir('clientes'));
  await p3.waitForTimeout(1200);
  await tocar(p3, '[data-acao="abrir-cliente"]');
  await p3.waitForTimeout(1200);
  const naoAdmin = await p3.evaluate(() => ({
    temSecao: [...document.querySelectorAll('.grupo')].map((g) => g.textContent.trim()).indexOf('Financeiro') >= 0,
    saldo: (document.querySelector('.rowline b') || {}).textContent,
    editaveis: document.querySelectorAll('[data-acao="forma-cliente"], [data-campo="limite-fiado"], [data-acao="chave-contabilizar"]').length,
  }));
  eh('motorista VE o saldo do cliente (ele bate na porta)', naoAdmin.temSecao === true && naoAdmin.saldo === 'R$ 36,00');
  eh('mas NAO ganha campo nenhum que o servidor recusaria (403)', naoAdmin.editaveis === 0);
  await p3.close();

  await b.close();
  console.log('\n=== PROVA: ficha do cliente + Ult. Registro (12/08) ===');
  ok.forEach((n) => console.log('  ok  ' + n));
  falhou.forEach((n) => console.log('  XX  ' + n));
  console.log('\n' + ok.length + '/' + (ok.length + falhou.length));
  process.exit(falhou.length ? 1 : 0);
})();
