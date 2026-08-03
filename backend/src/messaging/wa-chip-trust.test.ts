import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CHIP_TRUST_BASE_PADRAO,
  CHIP_TRUST_MAX_PADRAO,
  espacamentoDoDia,
  janelaDeTrabalhoMs,
  tetoDoChip,
} from './wa-chip-trust';
import { WaColdContactGateService, coldQuotaTenantFilter } from './wa-cold-contact-gate.service';

/**
 * 🔴 CONFIANÇA DO CHIP (03/08/2026) — ordem do dono:
 *   "…884 pode usar os 10, respeitando o limite (o dia inteiro) 08 às 18:00.
 *    Os novos serão apenas 3, e este limite vai aumentando conforme recebe
 *    resposta, inicia conversa. 1 conversa frutífera já gera +1 limite."
 *
 * O que estes testes trancam:
 *  1. chip novo = 3, e sobe 1 por conversa que respondeu, teto 10;
 *  2. o …884 chega em 10 por MEDIÇÃO (60+ conversas com resposta), não por número
 *     cravado — e cairia sozinho se parasse de receber resposta;
 *  3. os 10 se espalham das 08:00 às 18:00 (1 por hora), em vez da rajada que
 *     esvaziava a cota até as 09:40;
 *  4. a cota é DO CHIP: 5 vendedoras na mesma empresa não dividem 10;
 *  5. leitura e escrita da cota usam a MESMA chave (não podem divergir).
 */

const HORA = 60 * 60 * 1000;
const JANELA_8_AS_18 = 10 * HORA;

// ── 1. O teto que se conquista ──────────────────────────────────────────────
test('🔴 chip recém-pareado começa em 3', () => {
  assert.equal(tetoDoChip({ conversasComResposta: 0 }), 3);
  assert.equal(CHIP_TRUST_BASE_PADRAO, 3);
});

test('🔴 1 conversa frutífera já gera +1 limite (e vale no mesmo dia)', () => {
  assert.equal(tetoDoChip({ conversasComResposta: 1 }), 4);
  assert.equal(tetoDoChip({ conversasComResposta: 2 }), 5);
  assert.equal(tetoDoChip({ conversasComResposta: 5 }), 8);
});

test('🔴 o teto para em 10 — confiança não vira barra livre', () => {
  assert.equal(tetoDoChip({ conversasComResposta: 7 }), 10);
  assert.equal(tetoDoChip({ conversasComResposta: 999 }), 10);
  assert.equal(CHIP_TRUST_MAX_PADRAO, 10);
});

test('🔴 o …884 chega nos 10 por MEDIÇÃO, não por número cravado', () => {
  // 60+ conversas com resposta, conferido em prod 03/08.
  assert.equal(tetoDoChip({ conversasComResposta: 60 }), 10);
  // E a prova de que é medido: sem histórico, o MESMO cálculo devolve 3.
  assert.equal(tetoDoChip({ conversasComResposta: 0 }), 3);
});

test('entrada podre não vira teto maluco', () => {
  assert.equal(tetoDoChip({ conversasComResposta: -5 }), 3, 'negativo não abaixa do piso');
  assert.equal(tetoDoChip({ conversasComResposta: Number.NaN }), 3);
  assert.equal(tetoDoChip({ base: 50, max: 10, conversasComResposta: 0 }), 10, 'base nunca passa o teto');
  assert.equal(tetoDoChip({}), 3);
});

// ── 2. O dia inteiro, não a rajada da manhã ─────────────────────────────────
test('🔴 10 frios se espalham das 08:00 às 18:00 — 1 por hora', () => {
  assert.equal(janelaDeTrabalhoMs('08:00', '18:00'), JANELA_8_AS_18);
  assert.equal(espacamentoDoDia({ teto: 10, janelaMs: JANELA_8_AS_18, minimoMs: 0 }), HORA);
});

test('chip novo aparece MAIS devagar: 3 em 10h = 1 a cada 3h20', () => {
  const esperado = Math.floor(JANELA_8_AS_18 / 3);
  assert.equal(espacamentoDoDia({ teto: 3, janelaMs: JANELA_8_AS_18, minimoMs: 0 }), esperado);
  assert.ok(esperado > HORA * 3, 'chip novo espaça mais que o chip antigo');
});

test('o piso antigo continua sendo chão, e nunca sai zero', () => {
  const piso = 10 * 60 * 1000;
  assert.equal(espacamentoDoDia({ teto: 100, janelaMs: JANELA_8_AS_18, minimoMs: piso }), piso);
  assert.equal(espacamentoDoDia({ teto: 10, janelaMs: 0, minimoMs: 0 }), 1, 'janela vazia não libera rajada');
});

test('janela invertida ou podre devolve 0 — ninguém dispara de madrugada por acidente', () => {
  assert.equal(janelaDeTrabalhoMs('18:00', '08:00'), 0);
  assert.equal(janelaDeTrabalhoMs('08:00', '08:00'), 0);
  assert.equal(janelaDeTrabalhoMs('abacaxi', '18:00'), 0);
  assert.equal(janelaDeTrabalhoMs('99:99', '18:00'), 0);
});

// ── 3. A cota é DO CHIP ─────────────────────────────────────────────────────
function buildGate(seed: { respostasPorChip?: Record<string, number> } = {}) {
  const contagens: any[] = [];
  const prisma: any = {
    companyMessage: {
      findFirst: async () => null,
      findMany: async ({ where }: any) => {
        const n = seed.respostasPorChip?.[String(where?.sourceTenantKey)] ?? 0;
        return Array.from({ length: n }, (_, i) => ({ conversationId: i + 1 }));
      },
    },
    companyConversation: { findMany: async () => [] },
    whatsAppAuditLog: {
      count: async (args: any) => { contagens.push(args?.where); return 0; },
      findFirst: async () => null,
      findMany: async () => [],
      create: async () => ({}),
    },
  };
  return { gate: new WaColdContactGateService(prisma), contagens };
}

test('🔴 5 vendedoras na mesma empresa NÃO dividem a mesma cota de 10', async () => {
  const { gate } = buildGate({ respostasPorChip: { 'company-5-user-6': 60, 'company-5-user-59': 0 } });

  const dono = await gate.planoDoChip(5, 'company-5-user-6');
  const bianca = await gate.planoDoChip(5, 'company-5-user-59');

  assert.equal(dono.teto, 10, 'o chip com histórico trabalha');
  assert.equal(bianca.teto, 3, 'o chip novo entra devagar');
  assert.equal(dono.porChip, true);
  assert.ok(bianca.espacamentoMs > dono.espacamentoMs, 'quanto menor a confiança, mais espaçado');
});

test('a contagem do dia é filtrada POR CHIP (senão um chip come a cota do outro)', async () => {
  const { gate, contagens } = buildGate({ respostasPorChip: { 'company-5-user-59': 0 } });

  await gate.evaluate({
    companyId: 5,
    conversationId: null,
    to: '5511999998888',
    sourceModule: 'vendas_prospeccao_bot',
    senderType: 'bot',
    body: 'Vi que vocês entregam água aqui na região, posso te mostrar uma coisa?',
    tenantKey: 'company-5-user-59',
  });

  const doDia = contagens.find((w) => w?.event === 'cold_contact_sent' && w?.createdAt);
  assert.ok(doDia, 'a contagem do dia aconteceu');
  assert.deepEqual(doDia.metadata, coldQuotaTenantFilter('company-5-user-59'));
});

test('🔒 chamada legada sem tenantKey mantém o comportamento antigo (empresa inteira)', async () => {
  const { gate } = buildGate();

  const plano = await gate.planoDoChip(5, null);

  assert.equal(plano.porChip, false);
  assert.equal(plano.teto, 10, 'cai no teto do env, como antes');
  assert.equal(plano.conversasComResposta, 0);
});

// ── 4. Leitura e escrita não podem divergir ─────────────────────────────────
test('🔒 o filtro da cota casa com o JSON que o próprio gate grava', () => {
  const gravado = JSON.stringify({ extra: { to: '5511999998888', tenantKey: 'company-5-user-59' } });
  const filtro = coldQuotaTenantFilter('company-5-user-59');

  assert.ok(gravado.includes(filtro.contains), 'o trecho procurado existe no metadata gravado');
  // E não casa com o chip do vizinho, que é o erro que esvaziaria a cota errada.
  assert.ok(!gravado.includes(coldQuotaTenantFilter('company-5-user-6').contains));
});

test('banco fora ao medir confiança = chip tratado como novo (erra pro lado seguro)', async () => {
  const prisma: any = {
    companyMessage: { findFirst: async () => null, findMany: async () => { throw new Error('banco fora'); } },
    companyConversation: { findMany: async () => [] },
    whatsAppAuditLog: { count: async () => 0, findFirst: async () => null, findMany: async () => [], create: async () => ({}) },
  };
  const gate = new WaColdContactGateService(prisma);

  const plano = await gate.planoDoChip(5, 'company-5-user-6');
  assert.equal(plano.teto, 3, 'sem conseguir medir, o chip vale o piso — nunca o teto');
});
