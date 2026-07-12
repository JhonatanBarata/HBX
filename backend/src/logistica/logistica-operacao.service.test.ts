import test from 'node:test';
import assert from 'node:assert/strict';
import { scryptSync } from 'crypto';
import { LogisticaOperacaoService } from './logistica-operacao.service';
import { LogisticaConfigService } from './logistica-config.service';
import { LogisticaService } from './logistica.service';
import { serializeTeamPolicyModuleAndAccessRows } from '../team/team-policy-persistence';

const ADMIN = { id: 1, companyId: 7, role: 'ADMIN', isSystemMaster: false };

test('escopo do entregador exige DRIVER e filtra pela própria atribuição', async () => {
  const actor = { id: 42, companyId: 7, role: 'USER', isSystemMaster: false };
  const modulesJson = serializeTeamPolicyModuleAndAccessRows({
    access: {
      'workspace.vendas.access': false,
      'workspace.entregas.access': true,
    },
  });
  const prisma: any = {
    user: {
      findUnique: async () => ({ ...actor, company: { id: 7, companyKind: 'CUSTOMER' } }),
    },
    userTeamPolicy: {
      findUnique: async () => ({
        id: 'policy-42', userId: 42, companyId: 7, status: 'active', subjectKind: 'seller', modulesJson,
      }),
    },
  };
  const service = new LogisticaOperacaoService(prisma);
  assert.deepEqual(await service.whereForActor(actor), { entregadorId: 42 });
  assert.deepEqual(await service.whereForActor(ADMIN), {}, 'admin preserva visão da empresa inteira');
});

test('atribuição rejeita usuário de outra empresa sem vazar cadastro', async () => {
  const prisma: any = {
    entrega: { findFirst: async () => ({ id: 'ent-1', status: 'agendada' }) },
    user: { findFirst: async () => null },
  };
  const service = new LogisticaOperacaoService(prisma);
  await assert.rejects(
    () => service.atribuirEntrega(7, 'ent-1', 99, ADMIN),
    /Entregador não encontrado nesta empresa/,
  );
});

test('upload com clientKey repetida é replay e não exige regravar o Blob', async () => {
  const existente = {
    id: 'comp-1', entregaId: 'ent-1', tipo: 'foto', status: 'pendente',
    contentType: 'image/jpeg', byteSize: 123, createdAt: new Date('2026-07-12T12:00:00Z'),
  };
  const prisma: any = {
    entrega: { findFirst: async () => ({ id: 'ent-1', status: 'agendada', entregadorId: 42 }) },
    entregaComprovante: { findFirst: async () => existente },
  };
  const service = new LogisticaOperacaoService(prisma);
  const result = await service.uploadComprovante(7, 'ent-1', 'foto', null, ADMIN, 'offline-uuid-1');
  assert.equal(result.id, 'comp-1');
  assert.equal(result.replayed, true);
});

test('validação combinada exige foto, assinatura e confere código scrypt', async () => {
  const codigo = '083421';
  const salt = '00112233445566778899aabbccddeeff';
  const entrega = {
    id: 'ent-1',
    comprovanteCodigoSalt: salt,
    comprovanteCodigoHash: scryptSync(codigo, salt, 32).toString('hex'),
  };
  const proofById: Record<string, any> = {
    foto1: { id: 'foto1', tipo: 'foto' },
    ass1: { id: 'ass1', tipo: 'assinatura' },
  };
  const tx: any = {
    logisticaConfig: {
      findUnique: async () => ({
        comprovanteFotoObrigatoria: true,
        comprovanteAssinaturaObrigatoria: true,
        comprovanteCodigoObrigatorio: true,
      }),
    },
    entregaComprovante: {
      findFirst: async ({ where }: any) => {
        const row = proofById[where.id];
        return row?.tipo === where.tipo ? { id: row.id } : null;
      },
    },
  };
  const service = new LogisticaOperacaoService({} as any);
  const ok = await service.validarParaConfirmacao(tx, 7, entrega, {
    comprovanteFotoId: 'foto1',
    comprovanteAssinaturaId: 'ass1',
    comprovanteCodigo: codigo,
  }, ADMIN);
  assert.deepEqual(ok, { ids: ['foto1', 'ass1'], exigiuComprovante: true });

  await assert.rejects(
    () => service.validarParaConfirmacao(tx, 7, entrega, {
      comprovanteFotoId: 'foto1',
      comprovanteAssinaturaId: 'ass1',
      comprovanteCodigo: '999999',
    }, ADMIN),
    /Código de comprovante inválido/,
  );
});

test('config sem requisitos mantém confirmação legada liberada', async () => {
  let provaConsultada = false;
  const tx: any = {
    logisticaConfig: { findUnique: async () => null },
    entregaComprovante: { findFirst: async () => { provaConsultada = true; return null; } },
  };
  const service = new LogisticaOperacaoService({} as any);
  const result = await service.validarParaConfirmacao(tx, 7, { id: 'ent-1' }, {}, ADMIN);
  assert.deepEqual(result, { ids: [], exigiuComprovante: false });
  assert.equal(provaConsultada, false);
});

test('config do tenant persiste qualquer combinação de requisitos', async () => {
  let updateData: any = null;
  const prisma: any = {
    logisticaConfig: {
      upsert: async ({ update }: any) => {
        updateData = update;
        return {
          ...update,
          raioChegadaM: 60,
          velocidadeMediaKmH: 25,
          tempoParadaMin: 5,
          avisoChegandoDistanciaM: 500,
          resumoDiarioHora: 7,
        };
      },
    },
  };
  const service = new LogisticaConfigService(prisma);
  const result = await service.updateConfig(7, {
    comprovanteFotoObrigatoria: true,
    comprovanteAssinaturaObrigatoria: false,
    comprovanteCodigoObrigatorio: true,
  });
  assert.deepEqual(updateData, {
    comprovanteFotoObrigatoria: true,
    comprovanteAssinaturaObrigatoria: false,
    comprovanteCodigoObrigatorio: true,
  });
  assert.equal(result.comprovanteFotoObrigatoria, true);
  assert.equal(result.comprovanteAssinaturaObrigatoria, false);
  assert.equal(result.comprovanteCodigoObrigatorio, true);
});

test('confirmar persiste comprovante e ator na mesma transação do status entregue', async () => {
  const prev = process.env.HBX_LOGISTICA_ENABLED;
  delete process.env.HBX_LOGISTICA_ENABLED;
  const entregaUpdates: any[] = [];
  const comprovanteUpdates: any[] = [];
  const entrega = {
    id: 'ent-1', status: 'em_rota', customerProfileId: 'cli-1', contatoId: null,
    valor: 0, localId: null, cobrancaStatus: 'pendente', idempotencyKey: null,
    whatsappStatus: null, cobrancaOutcome: null,
    comprovanteCodigoHash: null, comprovanteCodigoSalt: null,
  };
  const tx: any = {
    logisticaConfig: { findUnique: async () => ({ comprovanteFotoObrigatoria: true }) },
    entregaComprovante: {
      findFirst: async ({ where }: any) => where.id === 'foto-1' && where.tipo === 'foto' ? { id: 'foto-1' } : null,
      updateMany: async (args: any) => { comprovanteUpdates.push(args); return { count: 1 }; },
    },
    entrega: { update: async ({ data }: any) => { entregaUpdates.push(data); return { ...entrega, ...data }; } },
    entregaItem: {
      updateMany: async () => ({ count: 0 }),
      count: async () => 0,
      findMany: async () => [],
      create: async () => null,
    },
    product: { findFirst: async () => null },
  };
  const prisma: any = {
    entrega: { findFirst: async () => entrega },
    customerProfile: { findFirst: async () => ({ formaPagamento: 'aberto', metodoPadrao: null }) },
    $transaction: async (fn: any) => fn(tx),
  };
  const operacao = new LogisticaOperacaoService(prisma);
  const rota: any = { recalcularEtaRestantes: async () => ({ recalculadas: 0 }) };
  const service = new LogisticaService(
    prisma,
    {} as any,
    rota,
    {} as any,
    undefined,
    undefined,
    undefined,
    operacao,
  );
  const result = await service.confirmarEntrega(7, 'ent-1', { comprovanteFotoId: 'foto-1' }, ADMIN);
  assert.equal(result?.status, 'entregue');
  assert.equal(entregaUpdates[0].confirmadoPorUserId, ADMIN.id);
  assert.ok(entregaUpdates[0].comprovanteConfirmadoAt instanceof Date);
  assert.deepEqual(comprovanteUpdates[0].where.id.in, ['foto-1']);
  assert.equal(comprovanteUpdates[0].data.status, 'confirmado');

  if (prev === undefined) delete process.env.HBX_LOGISTICA_ENABLED;
  else process.env.HBX_LOGISTICA_ENABLED = prev;
});
