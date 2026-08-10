import test from 'node:test';
import assert from 'node:assert/strict';

import { LogisticaAgendaService } from './logistica-agenda.service';

/**
 * F0 (27/07) — MOTOR CONFIÁVEL: `generateDay` NUNCA MAIS avança `proximaData`
 * (incidente "a sexta que não volta" — montagem abortada/pulada comia uma
 * semana do plano em silêncio). Estes testes travam os dois comportamentos
 * novos:
 *   1) gerar o MESMO dia duas vezes não avança o plano (era o bug raiz).
 *   5) guard anti-dupla-aberta: sem o avanço-na-geração, nada mais impedia
 *      duas ocorrências abertas do mesmo plano ao mesmo tempo.
 *
 * TRIPWIRE deliberado: `logisticaPlanoEntrega.updateMany` NÃO é mockado. Se
 * `generateDay` voltar a chamá-lo (regressão do fix), o teste quebra com
 * "Cannot read properties of undefined" em vez de passar calado.
 */

const SEXTA = 5;
const SEXTA_31_07 = '2026-07-31';
const SEXTA_24_07 = '2026-07-24'; // sexta ANTERIOR

function buildPlano(overrides: Record<string, any> = {}) {
  return {
    id: `plano-${Math.random().toString(36).slice(2)}`,
    companyId: 7,
    customerProfileId: 'cliente-1',
    localId: null,
    diaSemana: SEXTA,
    ativo: true,
    proximaData: null,
    frequencia: 'SEMANAL',
    intervaloDias: null,
    revisao: 1,
    janelaInicio: null,
    janelaFim: null,
    janelaTipo: null,
    tempoParadaMin: null,
    instrucoes: null,
    acessoTipo: null,
    acessoAndares: null,
    acessoTemElevador: null,
    acessoObservacao: null,
    adicionalTipo: null,
    adicionalValor: null,
    adicionalMotivo: null,
    customerProfile: { id: 'cliente-1', name: 'Dona Maria', endereco: null, numero: null, bairro: null, cidade: null, uf: null, cep: null, lat: null, lng: null },
    local: null,
    itens: [{ id: 'item-1', productId: 1, qtd: 2, valorUnit: 10, product: { id: 1, name: 'Galão 20L', unidade: 'UN' } }],
    ...overrides,
  };
}

function buildHarness(planos: any[], entregasSeed: any[] = []) {
  const entregas = new Map<string, any>(entregasSeed.map((row) => [row.id, { ...row }]));
  let seq = entregasSeed.length;

  const prisma: any = {
    // F1 (09/08) — `generateDay` não consulta mais `LogisticaConfig`: não existe
    // flag pra perguntar. A agenda é O gerador, sem porteiro.
    logisticaPlanoEntrega: {
      findMany: async ({ where }: any) => planos.filter((p) => p.companyId === where.companyId && p.diaSemana === where.diaSemana && p.ativo === true),
      // DE PROPÓSITO sem updateMany — ver comentário do arquivo (tripwire).
    },
    logisticaRotaModelo: {
      findFirst: async () => null,
    },
    entrega: {
      findFirst: async ({ where }: any) => {
        if (typeof where.agendaOcorrenciaKey === 'string') {
          // Caminho "existing": chave EXATA da ocorrência sendo gerada.
          const row = [...entregas.values()].find(
            (r) => r.companyId === where.companyId && r.agendaOcorrenciaKey === where.agendaOcorrenciaKey,
          );
          return row ? { id: row.id, status: row.status } : null;
        }
        // Caminho "pendurada" (guard anti-dupla-aberta): qualquer 'agendada' do
        // mesmo plano com ALGUMA chave, a mais antiga primeiro.
        const candidatos = [...entregas.values()]
          .filter(
            (r) =>
              r.companyId === where.companyId &&
              r.planoEntregaId === where.planoEntregaId &&
              r.status === 'agendada' &&
              r.agendaOcorrenciaKey,
          )
          .sort((a, b) => (a.scheduledAt?.getTime() ?? 0) - (b.scheduledAt?.getTime() ?? 0));
        const row = candidatos[0];
        return row ? { id: row.id, agendaOcorrenciaKey: row.agendaOcorrenciaKey } : null;
      },
      create: async ({ data }: any) => {
        seq += 1;
        const id = `entrega-${seq}`;
        entregas.set(id, { id, ...data });
        return { id };
      },
    },
  };

  return { service: new LogisticaAgendaService(prisma), entregas };
}

test('generateDay: gerar o MESMO dia 2x cria uma vez e NÃO avança o plano', async () => {
  const plano = buildPlano();
  const h = buildHarness([plano]);

  const primeira = await h.service.generateDay(7, SEXTA_31_07);
  assert.equal(primeira.criadas, 1);
  assert.equal(primeira.puladas, 0);
  assert.equal(primeira.avancados, 0, 'avanço NUNCA mais acontece na geração');
  assert.equal(primeira.deliveryIds.length, 1);

  const criada = h.entregas.get(primeira.deliveryIds[0])!;
  assert.equal(criada.agendaOcorrenciaKey, `agenda:${plano.id}:${SEXTA_31_07}`);
  assert.equal(criada.status, 'agendada');

  const segunda = await h.service.generateDay(7, SEXTA_31_07);
  assert.equal(segunda.criadas, 0, '2ª vez não cria de novo — já existe');
  assert.equal(segunda.puladas, 1);
  assert.equal(segunda.avancados, 0);
  assert.deepEqual(segunda.deliveryIds, [primeira.deliveryIds[0]], 'devolve a MESMA entrega, sem duplicar');
});

test('generateDay: guard anti-dupla-aberta — pendurada de uma sexta anterior barra a nova, sem criar 2ª ocorrência aberta', async () => {
  const plano = buildPlano();
  // A sexta ANTERIOR (24/07) ficou aberta — ninguém confirmou/cancelou/descartou.
  const h = buildHarness([plano], [
    {
      id: 'entrega-presa',
      companyId: 7,
      status: 'agendada',
      planoEntregaId: plano.id,
      agendaOcorrenciaKey: `agenda:${plano.id}:${SEXTA_24_07}`,
      scheduledAt: new Date('2026-07-24T12:00:00-03:00'),
    },
  ]);

  const resultado = await h.service.generateDay(7, SEXTA_31_07);

  assert.equal(resultado.criadas, 0, 'NÃO nasce 2ª ocorrência aberta do mesmo plano');
  assert.equal(resultado.puladas, 1);
  assert.equal(resultado.avancados, 0);
  assert.deepEqual(resultado.deliveryIds, ['entrega-presa'], 'devolve a pendurada, não cria nova');
  assert.equal(resultado.avisos.length, 1);
  assert.match(resultado.avisos[0], /24\/07/, 'avisa a data da pendurada');
  assert.match(resultado.avisos[0], /pendente/i);

  // Nenhuma entrega nova entrou no "banco".
  assert.equal(h.entregas.size, 1);
});

// ROTA v2 F1a (10/08) — o guard `ocorrenciaCanceladaRecente` morreu (só fazia
// sentido enquanto existia o gerador automático no boot; hoje só GENTE chama
// generateDay). Decisão humana mais RECENTE (remontar) vence decisão humana
// mais ANTIGA (cancelar).
test('generateDay: dia CANCELADO é RECRIADO quando alguém manda gerar de novo — o guard de 24h morreu', async () => {
  const plano = buildPlano();
  // TRIPWIRE deliberado (mesmo espírito do updateMany acima): o mock NÃO tem
  // `logisticaAgendaEvento`. Se o guard morto ainda existisse, ele consultaria
  // essa tabela (prova da trilha de cancelamento) e o teste quebraria com
  // "Cannot read properties of undefined" em vez de passar calado.
  // Nenhuma entrega em `entregasSeed`: o corpo já foi apagado (cancelar apaga
  // o não-processado) — é exatamente o estado de um dia cancelado.
  const h = buildHarness([plano]);

  const resultado = await h.service.generateDay(7, SEXTA_31_07);

  assert.equal(resultado.criadas, 1, 'sem o guard, o dia cancelado nasce de novo quando gente manda gerar');
  assert.equal(resultado.puladas, 0);
  assert.equal(
    resultado.avisos.length,
    0,
    'nenhum aviso "foi cancelado neste dia — não vou recriar" (a frase do guard morto nunca dispara)',
  );
});
