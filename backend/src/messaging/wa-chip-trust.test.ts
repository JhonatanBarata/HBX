import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CHIP_TRUST_BASE_PADRAO,
  CHIP_TRUST_MAX_PADRAO,
  contatoContaConfianca,
  espacamentoDoDia,
  janelaDeTrabalhoMs,
  tetoDoChip,
} from './wa-chip-trust';
import { WaColdContactGateService, coldQuotaTenantFilter } from './wa-cold-contact-gate.service';

/**
 * 🔴 CONFIANÇA DO CHIP (03/08 → 04/08/2026) — ordens do dono, na sequência:
 *   03/08: "os novos serão apenas 3, e este limite vai aumentando conforme recebe
 *           resposta… 1 conversa frutífera já gera +1 limite."
 *   04/08: "aumente o teto de 3 de manhã, e 3 a noite (o mínimo vai ser 6), depois
 *           vamos aumentando até 12 (sempre dividir no meio o limite q a pessoa
 *           colocar, para chips novos e ter como remover essa trava no disparo
 *           automático se a pessoa quiser forçar… é um direito da pessoa)."
 *
 * O que estes testes trancam:
 *  1. chip novo = 6 (3 de manhã + 3 à tarde via espaçamento), sobe 1 por conversa
 *     respondida, rampa até 12;
 *  2. chip novo roda METADE do limite que a pessoa configurou (clampado 6→12);
 *  3. remover a trava é direito da pessoa: limite configurado vale CHEIO;
 *  4. os frios se espalham na janela inteira, em vez da rajada da manhã;
 *  5. a cota é DO CHIP: 5 vendedoras na mesma empresa não dividem a cota;
 *  6. leitura e escrita da cota usam a MESMA chave (não podem divergir).
 */

const HORA = 60 * 60 * 1000;
const JANELA_8_AS_18 = 10 * HORA;

// ── 1. O teto que se conquista (rampa 6 → 12) ───────────────────────────────
test('🔴 chip recém-pareado começa em 6 — 3 de manhã + 3 à tarde', () => {
  assert.equal(tetoDoChip({ conversasComResposta: 0 }), 6);
  assert.equal(CHIP_TRUST_BASE_PADRAO, 6);
});

test('🔴 1 conversa frutífera já gera +1 limite (e vale no mesmo dia)', () => {
  assert.equal(tetoDoChip({ conversasComResposta: 1 }), 7);
  assert.equal(tetoDoChip({ conversasComResposta: 2 }), 8);
  assert.equal(tetoDoChip({ conversasComResposta: 5 }), 11);
});

test('🔴 a rampa para em 12 — confiança não vira barra livre', () => {
  assert.equal(tetoDoChip({ conversasComResposta: 6 }), 12);
  assert.equal(tetoDoChip({ conversasComResposta: 999 }), 12);
  assert.equal(CHIP_TRUST_MAX_PADRAO, 12);
});

test('🔴 o …884 chega no teto por MEDIÇÃO, não por número cravado', () => {
  // 60+ conversas com resposta, conferido em prod 03/08.
  assert.equal(tetoDoChip({ conversasComResposta: 60 }), 12);
  // E a prova de que é medido: sem histórico, o MESMO cálculo devolve a base.
  assert.equal(tetoDoChip({ conversasComResposta: 0 }), 6);
});

// ── 1b. Metade do limite que a pessoa colocou (04/08) ───────────────────────
test('🔴 chip novo roda METADE do limite configurado pela pessoa', () => {
  // Pessoa colocou 16/dia → chip novo trabalha com teto 8, mesmo cheio de resposta.
  assert.equal(tetoDoChip({ conversasComResposta: 999, limiteConfigurado: 16 }), 8);
  // Pessoa colocou 40/dia → metade é 20, mas a rampa para em 12.
  assert.equal(tetoDoChip({ conversasComResposta: 999, limiteConfigurado: 40 }), 12);
  // Pessoa colocou 8/dia → metade é 4, mas o mínimo é 6.
  assert.equal(tetoDoChip({ conversasComResposta: 999, limiteConfigurado: 8 }), 6);
});

test('a metade limita a RAMPA, não o começo: chip novo com config alta ainda nasce em 6', () => {
  assert.equal(tetoDoChip({ conversasComResposta: 0, limiteConfigurado: 40 }), 6);
  assert.equal(tetoDoChip({ conversasComResposta: 3, limiteConfigurado: 16 }), 8, 'cresce até a metade e para');
});

// ── 1c. Remover a trava é um DIREITO da pessoa (04/08) ──────────────────────
test('🔴 trava removida: o limite configurado vale CHEIO, sem rampa', () => {
  assert.equal(tetoDoChip({ conversasComResposta: 0, limiteConfigurado: 40, travaRemovida: true }), 40);
  assert.equal(tetoDoChip({ conversasComResposta: 0, limiteConfigurado: 16, travaRemovida: true }), 16);
});

test('trava removida SEM limite configurado não vira barra livre — cai na rampa', () => {
  assert.equal(tetoDoChip({ conversasComResposta: 0, travaRemovida: true }), 6);
  assert.equal(tetoDoChip({ conversasComResposta: 999, travaRemovida: true }), 12);
});

test('entrada podre não vira teto maluco', () => {
  assert.equal(tetoDoChip({ conversasComResposta: -5 }), 6, 'negativo não abaixa do piso');
  assert.equal(tetoDoChip({ conversasComResposta: Number.NaN }), 6);
  assert.equal(tetoDoChip({ base: 50, max: 12, conversasComResposta: 0 }), 12, 'base nunca passa o teto');
  assert.equal(tetoDoChip({ limiteConfigurado: -10, conversasComResposta: 999 }), 12, 'config negativa = sem config');
  assert.equal(tetoDoChip({}), 6);
});

// ── 2. O dia inteiro, não a rajada da manhã ─────────────────────────────────
test('🔴 12 frios se espalham das 08:00 às 18:00 — 1 a cada 50 min', () => {
  assert.equal(janelaDeTrabalhoMs('08:00', '18:00'), JANELA_8_AS_18);
  assert.equal(espacamentoDoDia({ teto: 12, janelaMs: JANELA_8_AS_18, minimoMs: 0 }), Math.floor(JANELA_8_AS_18 / 12));
});

test('🔴 chip novo (6) = 1 a cada ~1h40 — é isto que entrega "3 de manhã, 3 à tarde"', () => {
  const esperado = Math.floor(JANELA_8_AS_18 / 6);
  assert.equal(espacamentoDoDia({ teto: 6, janelaMs: JANELA_8_AS_18, minimoMs: 0 }), esperado);
  // 6 envios espaçados de 100 min a partir das 08:00: 3 caem antes das 13:00
  // (08:00, 09:40, 11:20) e 3 depois (13:00, 14:40, 16:20).
  const horarios = Array.from({ length: 6 }, (_, i) => 8 * HORA + i * esperado);
  const antesDas13 = horarios.filter((t) => t < 13 * HORA).length;
  assert.equal(antesDas13, 3, 'metade de manhã, metade à tarde — sem mecanismo novo');
});

test('o piso antigo continua sendo chão, e nunca sai zero', () => {
  const piso = 10 * 60 * 1000;
  assert.equal(espacamentoDoDia({ teto: 100, janelaMs: JANELA_8_AS_18, minimoMs: piso }), piso);
  assert.equal(espacamentoDoDia({ teto: 12, janelaMs: 0, minimoMs: 0 }), 1, 'janela vazia não libera rajada');
});

test('janela invertida ou podre devolve 0 — ninguém dispara de madrugada por acidente', () => {
  assert.equal(janelaDeTrabalhoMs('18:00', '08:00'), 0);
  assert.equal(janelaDeTrabalhoMs('08:00', '08:00'), 0);
  assert.equal(janelaDeTrabalhoMs('abacaxi', '18:00'), 0);
  assert.equal(janelaDeTrabalhoMs('99:99', '18:00'), 0);
});

// ── 3. A cota é DO CHIP ─────────────────────────────────────────────────────
function buildGate(seed: {
  respostasPorChip?: Record<string, number>;
  casa?: { dailyLimitPerSender?: number; coldWarmupOff?: boolean } | null;
} = {}) {
  const contagens: any[] = [];
  const prisma: any = {
    companyMessage: {
      findFirst: async () => null,
      findMany: async ({ where }: any) => {
        const n = seed.respostasPorChip?.[String(where?.sourceTenantKey)] ?? 0;
        // Contato de PESSOA de verdade: desde 06/08 grupo (@g.us) e lixo não
        // contam confiança, então o harness precisa entregar um telefone 1:1.
        return Array.from({ length: n }, (_, i) => ({
          conversationId: i + 1,
          conversation: { contact: `55199${String(90000000 + i).slice(0, 8)}` },
        }));
      },
    },
    companyConversation: { findMany: async () => [] },
    vendasComercialConfig: { findUnique: async () => seed.casa ?? null },
    whatsAppAuditLog: {
      count: async (args: any) => { contagens.push(args?.where); return 0; },
      findFirst: async () => null,
      findMany: async () => [],
      create: async () => ({}),
    },
  };
  return { gate: new WaColdContactGateService(prisma), contagens };
}

test('🔴 5 vendedoras na mesma empresa NÃO dividem a mesma cota', async () => {
  const { gate } = buildGate({ respostasPorChip: { 'company-5-user-6': 60, 'company-5-user-59': 0 } });

  const dono = await gate.planoDoChip(5, 'company-5-user-6');
  const bianca = await gate.planoDoChip(5, 'company-5-user-59');

  assert.equal(dono.teto, 12, 'o chip com histórico trabalha');
  assert.equal(bianca.teto, 6, 'o chip novo entra devagar');
  assert.equal(dono.porChip, true);
  assert.ok(bianca.espacamentoMs > dono.espacamentoMs, 'quanto menor a confiança, mais espaçado');
});

test('🔴 o gate lê a CASA: metade do configurado vale no plano do chip', async () => {
  const { gate } = buildGate({
    respostasPorChip: { 'company-5-user-6': 60 },
    casa: { dailyLimitPerSender: 16, coldWarmupOff: false },
  });

  const plano = await gate.planoDoChip(5, 'company-5-user-6');
  assert.equal(plano.teto, 8, '16 configurados ÷ 2 = 8, mesmo com 60 respostas');
});

test('🔴 trava removida na casa: o gate libera o limite configurado cheio', async () => {
  const { gate } = buildGate({
    respostasPorChip: { 'company-5-user-59': 0 },
    casa: { dailyLimitPerSender: 30, coldWarmupOff: true },
  });

  const plano = await gate.planoDoChip(5, 'company-5-user-59');
  assert.equal(plano.teto, 30, 'direito da pessoa — o freio nosso sai da frente');
});

test('casa fora do ar não derruba o plano — cai na rampa padrão (lado seguro)', async () => {
  const { gate } = buildGate({ respostasPorChip: { 'company-5-user-59': 0 } });
  (gate as any).prisma.vendasComercialConfig = { findUnique: async () => { throw new Error('banco fora'); } };

  const plano = await gate.planoDoChip(5, 'company-5-user-59');
  assert.equal(plano.teto, 6, 'sem conseguir ler a casa, vale a rampa — nunca barra livre');
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
  assert.equal(plano.teto, 12, 'cai no teto do env, como antes');
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
    vendasComercialConfig: { findUnique: async () => null },
    whatsAppAuditLog: { count: async () => 0, findFirst: async () => null, findMany: async () => [], create: async () => ({}) },
  };
  const gate = new WaColdContactGateService(prisma);

  const plano = await gate.planoDoChip(5, 'company-5-user-6');
  assert.equal(plano.teto, 6, 'sem conseguir medir, o chip vale o piso — nunca o teto');
});

// ── 7. GRUPO NÃO É RESPOSTA (06/08/2026) ────────────────────────────────────
// Medido em prod, empresa 5: 19 das 67 "conversas que responderam" do chip
// company-5-user-28 eram GRUPOS (@g.us) — avisos de igreja, escala, nota de
// falecimento. E a ÚNICA "resposta" do chip novo da Maria Clara (user 60) era
// `contact = "0"` com o texto "Welcome to WhatsApp Business", que o próprio
// WhatsApp manda ao parear: o chip ganhou confiança de si mesmo.
test('confiança: grupo, broadcast e lixo NÃO contam como resposta', () => {
  assert.equal(contatoContaConfianca('5519996106268-1569892875@g.us'), false, 'grupo de WhatsApp');
  assert.equal(contatoContaConfianca('120363041327423981@g.us'), false, 'grupo novo (id longo)');
  assert.equal(contatoContaConfianca('status@broadcast'), false, 'lista de transmissão');
  assert.equal(contatoContaConfianca('0'), false, 'o "Welcome to WhatsApp Business" do pareamento');
  assert.equal(contatoContaConfianca(''), false);
  assert.equal(contatoContaConfianca(null), false);
  assert.equal(contatoContaConfianca(undefined), false);
});

test('confiança: pessoa de verdade CONTA — telefone 1:1 e LID (telefone oculto)', () => {
  assert.equal(contatoContaConfianca('+5519989431379'), true);
  assert.equal(contatoContaConfianca('5519989431379'), true);
  assert.equal(contatoContaConfianca('5519989431379@s.whatsapp.net'), true);
  assert.equal(contatoContaConfianca('72481901699271:1@lid'), true, 'o caso Atacadão: gente real com número oculto');
  assert.equal(contatoContaConfianca('224485642866739@lid'), true);
});

test('🔴 o teto anti-ban NÃO sobe por causa de grupo (a cena medida em prod)', async () => {
  const prisma: any = {
    companyMessage: {
      findFirst: async () => null,
      findMany: async () => [
        { conversationId: 1, conversation: { contact: '5519996106268-1569892875@g.us' } },
        { conversationId: 2, conversation: { contact: '120363041327423981@g.us' } },
        { conversationId: 3, conversation: { contact: '0' } },
        { conversationId: 4, conversation: { contact: '+5519989431379' } },
      ],
    },
    companyConversation: { findMany: async () => [] },
    vendasComercialConfig: { findUnique: async () => null },
    whatsAppAuditLog: { count: async () => 0, findFirst: async () => null, findMany: async () => [], create: async () => ({}) },
  };
  const gate = new WaColdContactGateService(prisma);

  const plano = await gate.planoDoChip(5, 'company-5-user-60');
  assert.equal(plano.conversasComResposta, 1, '3 grupos/lixo descartados, 1 pessoa de verdade');
  assert.equal(plano.teto, CHIP_TRUST_BASE_PADRAO + 1, 'teto sobe SÓ pela conversa que existiu');
});

test('chip só de grupo continua valendo o piso (não é chip querido, é chip em grupo)', async () => {
  const prisma: any = {
    companyMessage: {
      findFirst: async () => null,
      findMany: async () => Array.from({ length: 40 }, (_, i) => ({
        conversationId: i,
        conversation: { contact: `12036304132742398${i}@g.us` },
      })),
    },
    companyConversation: { findMany: async () => [] },
    vendasComercialConfig: { findUnique: async () => null },
    whatsAppAuditLog: { count: async () => 0, findFirst: async () => null, findMany: async () => [], create: async () => ({}) },
  };
  const gate = new WaColdContactGateService(prisma);

  const plano = await gate.planoDoChip(5, 'company-5-user-28');
  assert.equal(plano.conversasComResposta, 0);
  assert.equal(plano.teto, CHIP_TRUST_BASE_PADRAO, 'nada de 40 grupos virarem teto 12');
});

test('a leitura de confiança pede a conversa junto e vem do mais recente', async () => {
  const argsVistos: any[] = [];
  const prisma: any = {
    companyMessage: {
      findFirst: async () => null,
      findMany: async (args: any) => {
        argsVistos.push(args);
        return [];
      },
    },
    companyConversation: { findMany: async () => [] },
    vendasComercialConfig: { findUnique: async () => null },
    whatsAppAuditLog: { count: async () => 0, findFirst: async () => null, findMany: async () => [], create: async () => ({}) },
  };
  const gate = new WaColdContactGateService(prisma);
  await gate.planoDoChip(5, 'company-5-user-60');

  const args = argsVistos[0];
  assert.ok(args?.select?.conversation, 'sem o contato da conversa não dá pra separar grupo de pessoa');
  assert.equal(args?.orderBy?.timestamp, 'desc', 'confiança é sinal de agora');
  assert.ok(
    args.take > CHIP_TRUST_MAX_PADRAO,
    'o corte de leitura precisa de folga: grupo é descartado DEPOIS de ler',
  );
});
