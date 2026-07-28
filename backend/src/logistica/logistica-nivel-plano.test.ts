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

// 28/07 (dono) — unidade de cobrança virou a PARADA: a franquia vendida em
// paradas é gasta 1:1 e nenhuma sobra se perde em arredondamento de bloco
// (antes, 302 paradas de franquia valiam 300).
test('franquia em paradas é 1:1 — nenhuma parada vendida se perde', () => {
  assert.equal(franquiaEmBlocos(300), 300);
  assert.equal(franquiaEmBlocos(302), 302, 'as 2 de sobra agora valem, não são arredondadas fora');
  assert.equal(franquiaEmBlocos(4), 4);
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

// 28/07 (dono) — Simples deixou de contar em bloco de 5: agora 1 claim = 1
// parada, a MESMA unidade da Rastreada. As duas somam direto, sem fator.
test('franquia do mês soma os DOIS caminhos na mesma unidade: Simples (×1) + Rastreada (×1)', async () => {
  limparOverlay();
  // ADVANCED = 600 paradas. 40 paradas Simples + 50 entregas rastreadas.
  const { service } = makeService({ blocosEssenciais: 40, entregasRastreadas: 50 });
  const f = await service.franquiaDoMes(7, '2026-07-13');
  assert.equal(f.paradasInclusas, 600);
  assert.equal(f.paradasUsadas, 90, '40 + 50 — sem multiplicar por bloco');
  assert.equal(f.paradasRestantes, 510);
  assert.equal(f.blocosRestantes, 510, 'unidade de cobrança = parada, conversão 1:1');
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
  const { service } = makeService({ nivel: 'BASIC', blocosEssenciais: 400 }); // 400 paradas > 300
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
  const { service } = makeService({ nivel: 'BASIC', blocosEssenciais: 500 });
  const visao = await service.franquiaDoMesEmParadas(7, '2026-07-13');
  assert.equal(visao.nivel, 'BASIC');
  assert.equal(visao.titulo, 'Rota Basic');
  assert.equal(visao.precoMensal, 99);
  assert.equal(visao.paradasInclusas, 300);
  assert.equal(visao.paradasUsadas, 300, 'usou tudo — nunca mostra 500 de 300');
  assert.equal(visao.paradasRestantes, 0);
});

// ── Painel do Master: uma linha por empresa (28/07) ──────────────────────────
// Pedido do dono: "quero controle sem depender de vc". Responde "quem está no
// crédito puro × quem está num plano" sem abrir ficha por ficha.
function makeServicePainel(opts: {
  configs: Array<{ companyId: number; logisticaNivel: string | null }>;
  essenciais?: Array<{ companyId: number; _count: { _all: number } }>;
  rastreadas?: Array<{ companyId: number; _count: { _all: number } }>;
}) {
  let queries = 0;
  const prisma: any = {
    logisticaConfig: { findMany: async () => { queries += 1; return opts.configs; } },
    logisticaEssentialCreditClaim: { groupBy: async () => { queries += 1; return opts.essenciais ?? []; } },
    logisticaTrackedCreditClaim: { groupBy: async () => { queries += 1; return opts.rastreadas ?? []; } },
  };
  return { service: new LogisticaNivelPlanoService(prisma), contarQueries: () => queries };
}

test('painel do master: 3 queries fixas, some quantas empresas forem (sem N+1)', async () => {
  limparOverlay();
  const configs = Array.from({ length: 50 }, (_, i) => ({ companyId: i + 1, logisticaNivel: 'ADVANCED' }));
  const { service, contarQueries } = makeServicePainel({ configs });
  const linhas = await service.listarEmpresasParaMaster('2026-07-13');
  assert.equal(linhas.length, 50);
  assert.equal(contarQueries(), 3, '1 config + 2 groupBy, com 50 empresas ou 5000');
});

test('painel do master: junta o consumo dos dois caminhos por empresa', async () => {
  limparOverlay();
  const { service } = makeServicePainel({
    configs: [
      { companyId: 41, logisticaNivel: 'ADVANCED' },
      { companyId: 48, logisticaNivel: 'BASIC' },
      { companyId: 5, logisticaNivel: 'FULL' },
    ],
    // Desde 28/07 a Simples cobra POR PARADA: 1 claim = 1 parada, igual à Rastreada.
    essenciais: [{ companyId: 41, _count: { _all: 410 } }, { companyId: 48, _count: { _all: 325 } }],
    rastreadas: [{ companyId: 5, _count: { _all: 5 } }],
  });
  const linhas = await service.listarEmpresasParaMaster('2026-07-13');
  const por = new Map(linhas.map((l) => [l.companyId, l]));

  // 41: 410 paradas de 600 (Advanced R$ 199).
  assert.equal(por.get(41)!.precoMensal, 199);
  assert.equal(por.get(41)!.paradasUsadas, 410);
  assert.equal(por.get(41)!.paradasRestantes, 190);

  // 48: 325 paradas, mas o Basic só inclui 300 → estourou.
  assert.equal(por.get(48)!.paradasInclusas, 300);
  assert.equal(por.get(48)!.paradasUsadas, 300, 'nunca mostra 325 de 300');
  assert.equal(por.get(48)!.paradasRestantes, 0, 'franquia esgotada = consumindo crédito');

  // 5: rastreada conta 1 parada por entrega — mesma unidade da Simples.
  assert.equal(por.get(5)!.paradasUsadas, 5);
  assert.equal(por.get(5)!.precoMensal, 299);
});

test('painel do master: empresa sem claim nenhum aparece com a franquia inteira', async () => {
  limparOverlay();
  const { service } = makeServicePainel({ configs: [{ companyId: 7, logisticaNivel: null }] });
  const [linha] = await service.listarEmpresasParaMaster('2026-07-13');
  assert.equal(linha.nivel, 'ADVANCED', 'nível sujo/ausente cai em ADVANCED');
  assert.equal(linha.paradasUsadas, 0);
  assert.equal(linha.paradasRestantes, 600);
});
