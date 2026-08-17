#!/usr/bin/env node
/**
 * PROVA DOS VAZIOS DA PORTA (VASILHAME onda 2, 17/08).
 *
 *     node scripts/prova-vasilhame-vazios.js
 *     node scripts/prova-vasilhame-vazios.js --antes    (só MEDE, não reprova)
 *
 * A onda 1 do vasilhame subiu SEM que ninguém tivesse visto a tela — está
 * anotado como pendência ("a tela nunca foi vista"). Esta prova existe pra que
 * a onda 2 não repita isso: ela dirige o `ponte.js` DE VERDADE (a costura da
 * fonte, regenerada na primeira linha) contra um servidor dublado, e mede as
 * quatro coisas que decidem se o casco anda certo:
 *
 *   1. a linha "Vazios recolhidos" nasce SÓ pra produto com casco;
 *   2. o − e o + contam de verdade, e o piso é ZERO (nunca negativo);
 *   3. o desfecho leva `vasilhameRetornado` do item com casco…
 *   4. …e NÃO leva `qtdEntregue` — contar vazio não pode reprecificar a
 *      entrega (`mexeuNoDinheiro` em logistica.service.ts).
 *
 * O 4 é o mais importante e o menos óbvio: mandar quantidade junto faria o
 * servidor recalcular `Entrega.valor` pela soma dos itens. Casco é patrimônio,
 * nunca preço.
 */
const path = require('path');
const { chromium } = require('playwright');
const { regenerarGerados } = require('./_regenerar');

const APP = 'file:///' + path
  .join(__dirname, '..', 'EntregaShell/app/src/logistica/assets/app/index.html')
  .replace(/\\/g, '/');

const HOJE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

const PORTA = { lat: -22.4000, lng: -47.5500 };

const PONTE = ({ hoje, entregas }) => {
  window.__chamadas = [];
  window.__erros = [];
  window.addEventListener('unhandledrejection', (e) => {
    window.__erros.push(String((e.reason && (e.reason.stack || e.reason.message)) || e.reason));
  });

  const S = { hoje, entregas: (entregas || []).map((e) => JSON.parse(JSON.stringify(e))) };
  window.__S = S;
  const abertas = () => S.entregas.filter((e) => e.status !== 'entregue' && e.status !== 'cancelada');

  const antigo = window.HBX || {};
  window.HBX = Object.assign({}, antigo, {
    activateRoute() {}, stopRoute() {}, requestLocationPermission() {},
    api(caminho, opcoes) {
      const metodo = (opcoes && opcoes.method) || 'GET';
      window.__chamadas.push([metodo, String(caminho).split('?')[0], (opcoes && opcoes.body) || null]);
      const R = (v) => Promise.resolve(JSON.parse(JSON.stringify(v)));

      // 🔴 financeiro ON e cobrança simples OFF = a folha COMPLETA (a que tem
      // a conferência item a item). É lá que os vazios moram.
      if (caminho.indexOf('/logistica/config') === 0) {
        return R({ modoRotaPadrao: 'essencial', raioChegadaM: 60, moduloFinanceiroAtivo: true, cobrancaSimples: false });
      }
      if (caminho.indexOf('/logistica/rota/custo-preview') === 0) return R({ creditosAIniciar: 1, saldoAtual: 900, saldoCobre: true });
      if (caminho.indexOf('/logistica/fechamento/resumo') === 0) return R({ fechamento: { totalCents: 0, formas: [] } });
      if (caminho.indexOf('/credits/me') === 0) return R({ saldo: 900 });
      if (caminho.indexOf('/logistica/agenda') === 0) return R({ dias: [] });
      if (caminho.indexOf('/nucleo/clientes') === 0) return R({ items: [] });
      if (caminho.indexOf('/logistica/cliente-produtos') === 0) return R({ items: [] });

      const mConf = /^\/logistica\/entregas\/([^/]+)\/confirmar/.exec(caminho);
      if (mConf) {
        const alvo = S.entregas.find((e) => e.id === mConf[1]);
        if (alvo) alvo.status = 'entregue';
        return R({ ok: true });
      }
      if (caminho.indexOf('/logistica/rota') === 0) {
        return R({
          date: S.hoje, total: abertas().length, routeStatus: 'ACTIVE', routeId: 'rota-op-1',
          trackingRequired: false, trackingSessionId: null, moduloFinanceiroAtivo: true,
          avisoChegandoAtivo: false, avisoChegandoDistanciaM: 500,
          items: S.entregas.map((e) => JSON.parse(JSON.stringify(e))),
        });
      }
      return R({});
    },
  });
};

/* A parada: DOIS itens, e é a diferença entre eles que a prova mede.
   · i1 = galão 20L, `possuiVasilhame: true`  → ganha a linha dos vazios
   · i2 = água c/ gás,`possuiVasilhame: false` → não ganha nada */
const PARADA = {
  id: 'e1', status: 'agendada', rotaOrdem: 1, origem: 'recorrente', valorHoje: 46,
  itens: [
    { id: 'i1', qtdPrevista: 2, qtdEntregue: null, valorUnit: 11, vasilhameRetornado: null,
      produto: { id: 1, nome: 'Galao 20 Litros', unidade: 'galao', possuiVasilhame: true } },
    { id: 'i2', qtdPrevista: 1, qtdEntregue: null, valorUnit: 24, vasilhameRetornado: null,
      produto: { id: 2, nome: 'Agua c/ gas 1,5L', unidade: 'caixa', possuiVasilhame: false } },
  ],
  cliente: { id: 'c1', nome: 'Maria Aparecida', endereco: 'R. Sargento Silva Nunes, 72', cidade: 'Moema', lat: PORTA.lat, lng: PORTA.lng },
};

const ok = [];
const falhou = [];
const notas = [];
const eh = (nome, cond, detalhe) => (cond ? ok : falhou).push(nome + (cond || !detalhe ? '' : `  [${detalhe}]`));
const nota = (t) => notas.push(t);
const SO_MEDIR = process.argv.includes('--antes');

(async () => {
  // 🔴 O GERADO PRIMEIRO: esta prova abre `assets/app/**`, que é SAÍDA da
  // costura. Sem isto ela mediria o gerado de ontem. Ver `scripts/_regenerar.js`.
  regenerarGerados();
  const b = await chromium.launch();
  const ctx = await b.newContext({
    viewport: { width: 412, height: 940 },
    permissions: ['geolocation'],
    geolocation: { latitude: PORTA.lat, longitude: PORTA.lng, accuracy: 12 },
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => falhou.push('ERRO DE PAGINA: ' + e.message));

  await p.goto(APP);
  await p.waitForTimeout(400);
  await p.evaluate(PONTE, { hoje: HOJE, entregas: [PARADA] });
  await p.waitForTimeout(3200);
  await p.evaluate(() => window.dispatchEvent(new Event('focus')));
  await p.evaluate(() => window.HBXRota && window.HBXRota.carregar());
  await p.waitForTimeout(900);
  await p.evaluate(() => window.ir('rota'));
  await p.waitForTimeout(500);
  await p.evaluate(() => window.ir('rotalista'));
  await p.waitForTimeout(700);

  // toque na parada → folha completa
  await p.evaluate(() => document.querySelector('[data-acao="abrir-parada"]').click());
  await p.waitForTimeout(800);

  const lerFolha = () => p.evaluate(() => ({
    tela: (function () { try { return atual; } catch (e) { return null; } })(),
    linhasVazio: document.querySelectorAll('.item-vazio').length,
    itens: document.querySelectorAll('.item-linha').length,
    contador: [...document.querySelectorAll('.item-vazio .passo b')].map((n) => n.textContent.trim()),
    itemDoBotao: (document.querySelector('.item-vazio [data-acao="vazio-mais"]') || {}).dataset?.item || '',
    nomes: [...document.querySelectorAll('.item-linha strong')].map((n) => n.textContent.trim()),
  }));

  const f0 = await lerFolha();
  nota(`[F1] folha aberta: tela=${f0.tela} · linhas=${f0.itens} · vazios=${f0.linhasVazio} · nomes=${f0.nomes.join(' | ')}`);
  eh('F1.1 · o toque abre a folha COMPLETA (a da conferencia item a item)', f0.tela === 'folha', `tela=${f0.tela}`);
  eh('F1.2 · a linha de vazios nasce UMA vez — so pro produto com casco',
    f0.linhasVazio === 1, `linhas de vazio=${f0.linhasVazio} (esperado 1: so o galao)`);
  eh('F1.3 · o botao de vazio sabe de QUAL item ele e', f0.itemDoBotao === 'i1', `data-item="${f0.itemDoBotao}"`);
  eh('F1.4 · a contagem comeca em zero (ninguem contou ainda)',
    f0.contador[0] === '0', `contador=${JSON.stringify(f0.contador)}`);

  /* ===================================================================
     F2 — O DEDO CONTA, E O PISO É ZERO
     Um contador que aceita negativo mandaria patrimônio pro lado errado
     sem ninguém ver — a mesma cicatriz da manobra fantasma (distância
     sem sinal). Aqui o sinal mora no VERBO do servidor, nunca no número.
     =================================================================== */
  const tocar = async (acao, vezes) => {
    for (let i = 0; i < vezes; i += 1) {
      await p.evaluate((a) => document.querySelector(`.item-vazio [data-acao="${a}"]`).click(), acao);
      await p.waitForTimeout(180);
    }
  };
  await tocar('vazio-mais', 2);
  const f1 = await lerFolha();
  nota(`[F2] dois toques no + : contador=${JSON.stringify(f1.contador)}`);
  eh('F2.1 · o + conta de verdade', f1.contador[0] === '2', `contador=${f1.contador[0]}`);

  await tocar('vazio-menos', 5);
  const f2 = await lerFolha();
  nota(`[F2] cinco toques no − a partir de 2: contador=${JSON.stringify(f2.contador)}`);
  eh('F2.2 · o − para no ZERO (vazio recolhido nunca e negativo)', f2.contador[0] === '0', `contador=${f2.contador[0]}`);

  await tocar('vazio-mais', 2);
  const f3 = await lerFolha();
  eh('F2.3 · volta a contar depois de zerar', f3.contador[0] === '2', `contador=${f3.contador[0]}`);

  /* ===================================================================
     F3 — O QUE VIAJA NO DESFECHO
     =================================================================== */
  /* A forma de pagamento vem ANTES do confirmar: com o financeiro ON, o
     "Entregue e pagou" sem método escolhido abre o portão "Como o cliente
     pagou?" e não manda nada (regra da folha, não deste lote). O toque em
     "Dinheiro" é o mesmo do motorista — e ele REPINTA a folha, o que de quebra
     prova que a contagem de vazios sobrevive ao repinte. */
  await p.evaluate(() => document.querySelector('[data-acao="forma"][data-forma="dinheiro"]').click());
  await p.waitForTimeout(400);
  const f4 = await lerFolha();
  nota(`[F3] depois de escolher a forma: contador=${JSON.stringify(f4.contador)}`);
  /* `--foto <caminho>`: a folha como o motorista vê. A onda 1 subiu sem
     ninguém ter olhado a tela — aqui a foto sai do MESMO estado que a prova
     acabou de medir, não de uma cena montada à parte. */
  const iFoto = process.argv.indexOf('--foto');
  if (iFoto > 0 && process.argv[iFoto + 1]) {
    await p.screenshot({ path: process.argv[iFoto + 1], fullPage: false });
    nota(`[F3] foto da folha: ${process.argv[iFoto + 1]}`);
  }
  eh('F3.0 · a contagem de vazios sobrevive ao repinte da folha', f4.contador[0] === '2', `contador=${f4.contador[0]}`);

  await p.evaluate(() => {
    const alvo = [...document.querySelectorAll('[data-acao]')]
      .find((e) => /^(entregue-pagou|confirmar-venda)$/.test(e.dataset.acao || ''));
    if (!alvo) throw new Error('sem botao de confirmar: ' + [...document.querySelectorAll('[data-acao]')].map((e) => e.dataset.acao).join(','));
    alvo.click();
  });
  await p.waitForTimeout(1400);

  const corpo = await p.evaluate(() => {
    const c = window.__chamadas.find((x) => x[0] === 'POST' && x[1] === '/logistica/entregas/e1/confirmar');
    return c ? c[2] : null;
  });
  nota(`[F3] corpo do confirmar: ${JSON.stringify(corpo)}`);
  const itens = (corpo && corpo.itens) || [];
  eh('F3.1 · o desfecho leva os itens de casco', Array.isArray(itens) && itens.length === 1,
    `itens=${JSON.stringify(itens)}`);
  eh('F3.2 · leva o item CERTO, com o numero que o dedo contou',
    itens[0] && itens[0].id === 'i1' && itens[0].vasilhameRetornado === 2, `item=${JSON.stringify(itens[0])}`);
  eh('F3.3 · o produto SEM casco nao entra no payload',
    !itens.some((i) => i && i.id === 'i2'), `itens=${JSON.stringify(itens)}`);
  eh('F3.4 · NAO leva qtdEntregue — contar vazio nao reprecifica a entrega',
    itens.every((i) => i && i.qtdEntregue === undefined), `itens=${JSON.stringify(itens)}`);
  eh('F3.5 · a chegada e a idempotencia continuam no mesmo desfecho',
    !!(corpo && corpo.arrivedAt && corpo.idempotencyKey), `arrivedAt=${corpo && corpo.arrivedAt}`);

  const erros = await p.evaluate(() => window.__erros || []);
  eh('F3.6 · nenhuma promessa quebrada no caminho', erros.length === 0, erros.join(' | '));

  await b.close();
  console.log('\n=== MEDIDAS ===');
  notas.forEach((n) => console.log('  · ' + n));
  console.log('\n=== PROVA: vasilhame — os vazios da porta ===');
  ok.forEach((n) => console.log('  ok  ' + n));
  falhou.forEach((n) => console.log('  XX  ' + n));
  console.log('\n' + ok.length + '/' + (ok.length + falhou.length));
  process.exit(SO_MEDIR ? 0 : (falhou.length ? 1 : 0));
})();
