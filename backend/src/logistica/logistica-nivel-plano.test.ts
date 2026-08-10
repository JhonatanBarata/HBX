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
 * PR28072026 HÍBRIDO (28/07) / ROTA v2 (10/08) — o catálogo comercial dos 4
 * níveis (CREDITO entrou na v2). Preço, franquia (só vitrine, ver
 * logistica-nivel-catalog.ts) e assentos editáveis pelo master.
 * ⛔ A conta de "consumo do mês" morreu na v2: plano com nível virou rota
 * ILIMITADA — o que resta pra medir é ASSENTO, não parada.
 */

function limparOverlay() {
  applyLogisticaNivelOverrides([]);
}

test('catálogo de fábrica: os 4 preços (CREDITO entrou na ROTA v2) e as franquias', () => {
  limparOverlay();
  const catalogo = listLogisticaNiveisCatalog();
  assert.deepEqual(
    catalogo.map((n) => [n.nivel, n.precoMensal, n.franquiaParadasMes]),
    [
      ['CREDITO', 0, 0],
      ['BASIC', 99, 300],
      ['ADVANCED', 199, 600],
      ['FULL', 299, 1000],
    ],
  );
});

test('ROTA v2: assentosInclusos por nível — CREDITO/BASIC=1, ADVANCED=2, FULL=3', () => {
  limparOverlay();
  const catalogo = listLogisticaNiveisCatalog();
  assert.deepEqual(
    catalogo.map((n) => [n.nivel, n.assentosInclusos]),
    [
      ['CREDITO', 1],
      ['BASIC', 1],
      ['ADVANCED', 2],
      ['FULL', 3],
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

// ── Status do nível (tela do tenant) ─────────────────────────────────────────
// ⛔ ROTA v2 (10/08) — franquiaDoMes/franquiaDoMesEmParadas morreram: plano
// com nível virou rota ILIMITADA, não existe mais consumo de paradas a somar.
// `statusDoNivel` é a sucessora: nível + assentos, sem contar claim nenhum.
function makeService(opts: { nivel?: string } = {}) {
  const prisma: any = {
    logisticaConfig: {
      findUnique: async () => ({ logisticaNivel: opts.nivel ?? 'ADVANCED', logisticaAssentos: null }),
    },
  };
  return { service: new LogisticaNivelPlanoService(prisma) };
}

test('statusDoNivel: nível + assentos inclusos, sem consumo de paradas', async () => {
  limparOverlay();
  const { service } = makeService({ nivel: 'BASIC' });
  const status = await service.statusDoNivel(7);
  assert.equal(status.nivel, 'BASIC');
  assert.equal(status.titulo, 'Rota Basic');
  assert.equal(status.precoMensal, 99);
  assert.equal(status.assentosInclusos, 1);
  assert.equal(status.logisticaAssentos, null, 'sem override — herda do nível');
});

test('statusDoNivel: override de assentos da empresa aparece explícito', async () => {
  limparOverlay();
  const prisma: any = {
    logisticaConfig: { findUnique: async () => ({ logisticaNivel: 'ADVANCED', logisticaAssentos: 5 }) },
  };
  const service = new LogisticaNivelPlanoService(prisma);
  const status = await service.statusDoNivel(7);
  assert.equal(status.assentosInclusos, 2, 'default do nível continua exposto');
  assert.equal(status.logisticaAssentos, 5, 'override da empresa vem junto');
});

test('statusDoNivel: nível sujo/ausente cai em ADVANCED (grandfathering)', async () => {
  limparOverlay();
  const prisma: any = { logisticaConfig: { findUnique: async () => null } };
  const service = new LogisticaNivelPlanoService(prisma);
  const status = await service.statusDoNivel(7);
  assert.equal(status.nivel, 'ADVANCED');
});

// ── Painel do Master: uma linha por empresa (28/07, ROTA v2 10/08) ──────────
// Pedido do dono: "quero controle sem depender de vc". Responde "quem está no
// crédito puro × quem está num plano" — hoje só com nível+assentos, sem franquia.
function makeServicePainel(configs: Array<{ companyId: number; logisticaNivel: string | null; logisticaAssentos?: number | null }>) {
  let queries = 0;
  const prisma: any = {
    logisticaConfig: { findMany: async () => { queries += 1; return configs; } },
  };
  return { service: new LogisticaNivelPlanoService(prisma), contarQueries: () => queries };
}

test('painel do master: 1 query fixa, some quantas empresas forem (sem N+1)', async () => {
  limparOverlay();
  const configs = Array.from({ length: 50 }, (_, i) => ({ companyId: i + 1, logisticaNivel: 'ADVANCED' }));
  const { service, contarQueries } = makeServicePainel(configs);
  const linhas = await service.listarEmpresasParaMaster();
  assert.equal(linhas.length, 50);
  assert.equal(contarQueries(), 1, 'sem claim pra somar — 1 leitura de config basta, com 50 empresas ou 5000');
});

test('painel do master: cada linha mostra nível, mensalidade e assentos (override quando houver)', async () => {
  limparOverlay();
  const { service } = makeServicePainel([
    { companyId: 41, logisticaNivel: 'ADVANCED' },
    { companyId: 48, logisticaNivel: 'BASIC', logisticaAssentos: 3 },
    { companyId: 5, logisticaNivel: 'FULL' },
    { companyId: 9, logisticaNivel: 'CREDITO' },
  ]);
  const linhas = await service.listarEmpresasParaMaster();
  const por = new Map(linhas.map((l) => [l.companyId, l]));

  assert.equal(por.get(41)!.precoMensal, 199);
  assert.equal(por.get(41)!.assentosInclusos, 2);
  assert.equal(por.get(41)!.logisticaAssentos, null);

  assert.equal(por.get(48)!.assentosInclusos, 1, 'default do BASIC continua exposto');
  assert.equal(por.get(48)!.logisticaAssentos, 3, 'override da empresa aparece separado');

  assert.equal(por.get(5)!.precoMensal, 299);
  assert.equal(por.get(5)!.assentosInclusos, 3);

  assert.equal(por.get(9)!.nivel, 'CREDITO');
  assert.equal(por.get(9)!.precoMensal, 0);
});

test('painel do master: nível sujo/ausente cai em ADVANCED', async () => {
  limparOverlay();
  const { service } = makeServicePainel([{ companyId: 7, logisticaNivel: null }]);
  const [linha] = await service.listarEmpresasParaMaster();
  assert.equal(linha.nivel, 'ADVANCED', 'nível sujo/ausente cai em ADVANCED');
});

// ── Vitrine pública do site (/rota) ─────────────────────────────────────────
// A página do site lê GET /public/logistica/planos. O ponto do endpoint é NÃO
// existir preço escrito à mão no HTML: mudou no Master, muda no site.

test('vitrine pública: os 4 níveis com preço, franquia, título, slogan e assentos', () => {
  limparOverlay();
  const { service } = makeService({});
  const niveis = service.listPublico();
  assert.deepEqual(niveis.map((n) => n.nivel), ['CREDITO', 'BASIC', 'ADVANCED', 'FULL']);
  const credito = niveis[0];
  assert.equal(credito.precoMensal, 0);
  assert.equal(credito.titulo, 'Rota Avulsa');
  assert.equal(credito.assentosInclusos, 1);
  const advanced = niveis[2];
  assert.equal(advanced.precoMensal, 199);
  assert.equal(advanced.franquiaParadasMes, 600);
  assert.equal(advanced.titulo, 'Rota Advanced');
  assert.equal(advanced.slogan, 'O app cobra por você');
  assert.equal(advanced.assentosInclusos, 2);
});

test('vitrine pública: preço editado no Master aparece no site (é o motivo do endpoint)', () => {
  limparOverlay();
  applyLogisticaNivelOverrides([
    { nivel: 'FULL', override: { precoMensal: 349, franquiaParadasMes: 1200, slogan: 'Rastreio de ponta a ponta' } },
  ]);
  const { service } = makeService({});
  const full = service.listPublico().find((n) => n.nivel === 'FULL')!;
  assert.equal(full.precoMensal, 349);
  assert.equal(full.franquiaParadasMes, 1200);
  assert.equal(full.slogan, 'Rastreio de ponta a ponta');
});

test('vitrine pública: só material de anúncio — nada de dado interno vaza', () => {
  limparOverlay();
  const { service } = makeService({});
  for (const nivel of service.listPublico()) {
    assert.deepEqual(
      Object.keys(nivel).sort(),
      ['assentosInclusos', 'franquiaParadasMes', 'nivel', 'precoMensal', 'slogan', 'titulo'],
      'campo novo no catálogo entrou na vitrine pública sem ninguém decidir',
    );
  }
});
