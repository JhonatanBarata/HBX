// Gerar o código PARA outra pessoa da equipe (decisão do dono 02/08/2026).
//
// A cena: o dono abre Configurações → Aplicativo móvel, escolhe "Gerar código
// para: João (Entregador)", entrega o número, e o celular do João entra NA CONTA
// DO JOÃO — com o nível que o cadastro do João diz, nunca um nível escolhido
// nesta tela.
//
// O que estes testes GRITAM se quebrar:
//   1. funcionário comum não gera código do colega (seria escalada de acesso);
//   2. admin não alcança gente de OUTRA empresa (muro multi-tenant);
//   3. o código nasce no userId do ALVO, não no de quem clicou;
//   4. o nível exibido vem do cadastro (role/policy), não da tela;
//   5. admin desconecta aparelho da equipe; funcionário comum, só o dele.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { serializeTeamPolicyModuleAndAccessRows } from '../team/team-policy-persistence';
import { MobileDeviceService } from './mobile-device.service';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'teste-pairing-target';

const EMPRESA = 71;

const dono = {
  id: 1,
  name: 'Jhonatan',
  username: 'dono',
  email: 'dono@hbx.test',
  companyId: EMPRESA,
  isActive: true,
  isSystemMaster: false,
  role: 'USERMASTER',
  canViewBilling: true,
  teamPolicy: null,
};

const entregador = {
  id: 2,
  name: 'João',
  username: 'joao',
  email: 'joao@hbx.test',
  companyId: EMPRESA,
  isActive: true,
  isSystemMaster: false,
  role: 'USER',
  canViewBilling: false,
  // Serializado pelo MESMO escritor que a política real usa — assim o fixture
  // não pode divergir do formato gravado no banco.
  teamPolicy: {
    modulesJson: serializeTeamPolicyModuleAndAccessRows({
      access: { 'workspace.vendas.access': false, 'workspace.entregas.access': true },
    }),
  },
};

const deOutraEmpresa = { ...entregador, id: 9, name: 'Estranho', companyId: 999 };

type Harness = {
  service: MobileDeviceService;
  calls: {
    pairingCodeInserts: Array<{ userId: number; companyId: number }>;
    revoke: Array<{ deviceId: string; companyId: number; companyWide: boolean; actorId: number }>;
    deviceListCompanyWide: boolean | null;
  };
};

function buildHarness(pessoas: any[]): Harness {
  const calls: Harness['calls'] = {
    pairingCodeInserts: [],
    revoke: [],
    deviceListCompanyWide: null,
  };
  const acharPorId = (id: number) => pessoas.find((p) => Number(p.id) === Number(id)) || null;

  const prisma: any = {
    user: {
      findUnique: async (input: any) => acharPorId(Number(input?.where?.id)),
      findFirst: async (input: any) => {
        const alvo = acharPorId(Number(input?.where?.id));
        // Espelha o filtro real: o WHERE carrega companyId, então gente de
        // outra empresa simplesmente não é encontrada.
        if (!alvo || Number(alvo.companyId) !== Number(input?.where?.companyId)) return null;
        return alvo;
      },
      findMany: async (input: any) => pessoas.filter(
        (p) => Number(p.companyId) === Number(input?.where?.companyId)
          && p.isActive !== false
          && !p.isSystemMaster,
      ),
    },
    $queryRaw: async (strings: TemplateStringsArray, ...values: any[]) => {
      const sql = strings.join(' ');
      if (sql.includes('GROUP BY "userId"')) return [];
      if (sql.includes('FROM "MobileDevice" d')) {
        calls.deviceListCompanyWide = Boolean(values[1]);
        return [];
      }
      return [];
    },
    $executeRaw: async (strings: TemplateStringsArray, ...values: any[]) => {
      const sql = strings.join(' ');
      if (sql.includes('INSERT INTO "MobilePairingCode"')) {
        calls.pairingCodeInserts.push({ userId: Number(values[1]), companyId: Number(values[2]) });
        return 1;
      }
      if (sql.includes('UPDATE "MobileDevice"')) {
        calls.revoke.push({
          deviceId: String(values[0]),
          companyId: Number(values[1]),
          companyWide: Boolean(values[2]),
          actorId: Number(values[3]),
        });
        return 1;
      }
      return 1;
    },
  };

  const service = new MobileDeviceService(prisma, {} as any, {} as any);
  return { service, calls };
}

test('funcionário comum NÃO gera código de outra pessoa (403)', async () => {
  const { service, calls } = buildHarness([dono, entregador]);
  await assert.rejects(
    () => service.createPairingCode(entregador.id, dono.id),
    (err: unknown) => err instanceof ForbiddenException,
  );
  assert.equal(calls.pairingCodeInserts.length, 0, 'nenhum código pode ter sido gravado');
});

test('admin NÃO alcança pessoa de outra empresa (muro multi-tenant)', async () => {
  const { service, calls } = buildHarness([dono, entregador, deOutraEmpresa]);
  await assert.rejects(
    () => service.createPairingCode(dono.id, deOutraEmpresa.id),
    (err: unknown) => err instanceof NotFoundException,
  );
  assert.equal(calls.pairingCodeInserts.length, 0);
});

test('admin gera para o entregador: o código nasce no userId do ALVO', async () => {
  const { service, calls } = buildHarness([dono, entregador]);
  const res: any = await service.createPairingCode(dono.id, entregador.id);

  assert.equal(calls.pairingCodeInserts.length, 1);
  assert.equal(calls.pairingCodeInserts[0].userId, entregador.id, 'o código é DO João, não de quem clicou');
  assert.equal(calls.pairingCodeInserts[0].companyId, EMPRESA);
  assert.match(res.code, /^\d{6}$/);
  // O nível vem do CADASTRO (role USER + policy só de entregas), nunca da tela.
  assert.equal(res.target.id, entregador.id);
  assert.equal(res.target.isSelf, false);
  assert.equal(res.target.levelLabel, 'Membro operacional');
  assert.equal(res.target.operationalLabel, 'Entregador');
});

test('sem alvo o comportamento é o de sempre: o código é da própria conta', async () => {
  const { service, calls } = buildHarness([dono, entregador]);
  const res: any = await service.createPairingCode(entregador.id);

  assert.equal(calls.pairingCodeInserts[0].userId, entregador.id);
  assert.equal(res.target.isSelf, true);
});

test('lista de alvos: funcionário só se enxerga; admin enxerga a equipe', async () => {
  const doVendedor: any = await buildHarness([dono, entregador]).service.listPairingTargets(entregador.id);
  assert.equal(doVendedor.canPairOthers, false);
  assert.deepEqual(doVendedor.targets.map((t: any) => t.id), [entregador.id]);

  const doAdmin: any = await buildHarness([dono, entregador, deOutraEmpresa]).service.listPairingTargets(dono.id);
  assert.equal(doAdmin.canPairOthers, true);
  // O próprio usuário encabeça a lista e ninguém de fora da empresa entra.
  assert.equal(doAdmin.targets[0].isSelf, true);
  assert.deepEqual(doAdmin.targets.map((t: any) => t.id).sort(), [dono.id, entregador.id]);
  assert.equal(doAdmin.targets.find((t: any) => t.id === dono.id).levelLabel, 'Administrador');
});

test('desconectar: admin alcança a equipe; funcionário comum só o aparelho dele', async () => {
  const admin = buildHarness([dono, entregador]);
  await admin.service.revokeDevice(dono.id, 'device-do-joao');
  assert.equal(admin.calls.revoke[0].companyWide, true);
  assert.equal(admin.calls.revoke[0].companyId, EMPRESA);

  const vendedor = buildHarness([dono, entregador]);
  await vendedor.service.revokeDevice(entregador.id, 'device-do-joao');
  assert.equal(vendedor.calls.revoke[0].companyWide, false, 'sem isso o vendedor derrubaria o celular do colega');
  assert.equal(vendedor.calls.revoke[0].actorId, entregador.id);
});

test('lista de aparelhos: escopo de empresa só sai para administrador', async () => {
  const admin = buildHarness([dono, entregador]);
  await admin.service.listDevices(dono.id, 'company');
  assert.equal(admin.calls.deviceListCompanyWide, true);

  const vendedor = buildHarness([dono, entregador]);
  await vendedor.service.listDevices(entregador.id, 'company');
  assert.equal(vendedor.calls.deviceListCompanyWide, false, 'pedir scope=company não promove ninguém');
});
