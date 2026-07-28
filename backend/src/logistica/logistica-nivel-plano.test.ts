import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyLogisticaNivelOverrides,
  franquiaEmBlocos,
  getLogisticaNivelDefinition,
  listLogisticaNiveisCatalog,
  normalizeLogisticaNivelKey,
  sanitizeLogisticaNivelOverride,
} from './logistica-nivel-catalog';
import { LogisticaNivelPlanoService } from './logistica-nivel-plano.service';

/**
 * PR28072026 HÍBRIDO (28/07) — o catálogo comercial dos 3 níveis e a conta da
 * franquia do mês. Aqui vive a matemática do dinheiro: preço editável pelo
 * master, franquia em paradas e a soma dos DOIS jeitos de queimar crédito
 * (bloco da Essencial = 5 paradas, entrega da Rastreada = 1 parada).
 */

function limparOverlay() {
  applyLogisticaNivelOverrides([]);
}

test('catálogo de fábrica: os 3 preços batidos pelo dono (28/07) e as franquias', () => {
  limparOverlay();
  const catalogo = listLogisticaNiveisCatalog();
  assert.deepEqual(
    catalogo.map((n) => [n.nivel, n.precoMensal, n.franquiaParadasMes]),
    [
      ['BASIC', 99, 300],
      ['ADVANCED', 199, 600],
      ['FULL', 299, 1000],
    ],
  );
});

test('overlay do master manda: preço e franquia editados vencem a base', () => {
  limparOverlay();
  applyLogisticaNivelOverrides([
    { nivel: 'ADVANCED', override: { precoMensal: 179, franquiaParadasMes: 750 } },
  ]);
  const advanced = getLogisticaNivelDefinition('ADVANCED');
  assert.equal(advanced.precoMensal, 179);
  assert.equal(advanced.franquiaParadasMes, 750);
  // Nível não editado continua no catálogo.
  assert.equal(getLogisticaNivelDefinition('BASIC').precoMensal, 99);
  limparOverlay();
  assert.equal(getLogisticaNivelDefinition('ADVANCED').precoMensal, 199, 'restaurar volta pra base');
});

test('nível sujo/ausente cai em ADVANCED (mesma regra de grandfathering do storedNivel)', () => {
  limparOverlay();
  assert.equal(getLogisticaNivelDefinition(null).nivel, 'ADVANCED');
  assert.equal(getLogisticaNivelDefinition('lixo').nivel, 'ADVANCED');
  assert.equal(normalizeLogisticaNivelKey('lixo'), null, 'normalize é estrito — quem decide o fallback é o getter');
  assert.equal(normalizeLogisticaNivelKey(' full '), 'FULL');
});

test('sanitize recusa lixo e trava tetos (erro de digitação do master não vira preço)', () => {
  assert.deepEqual(sanitizeLogisticaNivelOverride({ precoMensal: 'muito' }), {});
  assert.deepEqual(sanitizeLogisticaNivelOverride({ precoMensal: -5 }), {});
  assert.deepEqual(sanitizeLogisticaNivelOverride({ precoMensal: 999999 }), {}, 'acima do teto é recusado');
  assert.deepEqual(sanitizeLogisticaNivelOverride({ franquiaParadasMes: 12.7 }), { franquiaParadasMes: 12 });
  assert.deepEqual(sanitizeLogisticaNivelOverride({ precoMensal: 199.999 }), { precoMensal: 200 });
  assert.deepEqual(sanitizeLogisticaNivelOverride(null), {});
});

test('bloco é indivisível: sobra de paradas não dá bloco de graça', () => {
  assert.equal(franquiaEmBlocos(300), 60);
  assert.equal(franquiaEmBlocos(302), 60, '2 paradas de sobra não compram o bloco 61');
  assert.equal(franquiaEmBlocos(4), 0);
  assert.equal(franquiaEmBlocos(0), 0);
  assert.equal(franquiaEmBlocos(-10), 0);
});

// ── Conta do mês ────────────────────────────────────────────────────────────
function makeService(opts: { nivel?: string; blocosEssenciais?: number; entregasRastreadas?: number } = {}) {
  const queries: any[] = [];
  const prisma: any = {
    logisticaConfig: {
      findUnique: async () => ({ logisticaNivel: opts.nivel ?? 'ADVANCED' }),
    },
    logisticaEssentialCreditClaim: {
      count: async (args: any) => { queries.push({ tabela: 'essential', args }); return opts.blocosEssenciais ?? 0; },
    },
    logisticaTrackedCreditClaim: {
      count: async (args: any) => { queries.push({ tabela: 'tracked', args }); return opts.entregasRastreadas ?? 0; },
    },
  };
  return { service: new LogisticaNivelPlanoService(prisma), queries };
}

test('franquia do mês soma os DOIS caminhos: bloco Essencial (×5) + entrega Rastreada (×1)', async () => {
  limparOverlay();
  // ADVANCED = 600 paradas. 40 blocos (200 paradas) + 50 entregas rastreadas.
  const { service } = makeService({ blocosEssenciais: 40, entregasRastreadas: 50 });
  const f = await service.franquiaDoMes(7, '2026-07-13');
  assert.equal(f.paradasInclusas, 600);
  assert.equal(f.paradasUsadas, 250, '40×5 + 50');
  assert.equal(f.paradasRestantes, 350);
  assert.equal(f.blocosRestantes, 70);
});

test('franquia do mês usa o mês da ROTA (fuso da operação), nunca o relógio do container', async () => {
  limparOverlay();
  const { service, queries } = makeService({ blocosEssenciais: 1 });
  await service.franquiaDoMes(7, '2026-07-13');
  const essential = queries.find((q) => q.tabela === 'essential');
  assert.equal(essential.args.where.routeDate.startsWith, '2026-07');
  const tracked = queries.find((q) => q.tabela === 'tracked');
  assert.equal(tracked.args.where.route.routeDate.startsWith, '2026-07');
});

test('franquia estourada nunca fica negativa', async () => {
  limparOverlay();
  const { service } = makeService({ nivel: 'BASIC', blocosEssenciais: 100 }); // 500 paradas > 300
  const f = await service.franquiaDoMes(7, '2026-08-02');
  assert.equal(f.paradasRestantes, 0);
  assert.equal(f.blocosRestantes, 0);
});

test('nível sem franquia (editado pra 0) desliga o benefício sem quebrar a conta', async () => {
  limparOverlay();
  applyLogisticaNivelOverrides([{ nivel: 'ADVANCED', override: { franquiaParadasMes: 0 } }]);
  const { service, queries } = makeService({ blocosEssenciais: 10 });
  const f = await service.franquiaDoMes(7, '2026-07-13');
  assert.equal(f.paradasInclusas, 0);
  assert.equal(f.blocosRestantes, 0);
  assert.equal(queries.length, 0, 'sem franquia nem consulta o banco — caminho de sempre, custo zero');
  limparOverlay();
});

test('tela do tenant fala em PARADAS e nunca passa do total do plano', async () => {
  limparOverlay();
  const { service } = makeService({ nivel: 'BASIC', blocosEssenciais: 100 });
  const visao = await service.franquiaDoMesEmParadas(7, '2026-07-13');
  assert.equal(visao.nivel, 'BASIC');
  assert.equal(visao.titulo, 'Rota Basic');
  assert.equal(visao.precoMensal, 99);
  assert.equal(visao.paradasInclusas, 300);
  assert.equal(visao.paradasUsadas, 300, 'usou tudo — nunca mostra 500 de 300');
  assert.equal(visao.paradasRestantes, 0);
});
