import test from 'node:test';
import assert from 'node:assert/strict';

import { PersonaIaService } from './persona-ia.service';

/**
 * 🔴 03/08/2026 — UM NÚMERO, UM NOME (a régua que a identidade por EMPRESA não
 * sabia expressar).
 *
 * A identidade da IA nasceu presa à empresa porque a empresa tinha UM chip.
 * Agora cada vendedora tem o número dela (`company-N-user-M`): com a persona
 * ainda presa à empresa, as cinco assinariam "Jhonatan" — o lead é abordado pela
 * Bianca e respondido por outro nome, no MESMO número. Ordem do dono: *"a persona
 * tem q puxar o nome da pessoa logada"*.
 *
 * Bordas que estes testes trancam:
 *  · com pessoa e com `name`: o nome é dela;
 *  · sem pessoa: continua sendo a empresa, exatamente como antes;
 *  · login NÃO vira nome ("mariaclara" é o mesmo teatro por outro caminho);
 *  · pessoa de OUTRA empresa não empresta nome nenhum (lei multi-tenant).
 */

const COMPANY = 5;

function buildService(seed: {
  aiIdentidade?: string;
  aiNome?: string | null;
  aiUserId?: number | null;
  users?: Array<{ id: number; companyId: number; name?: string | null; username?: string | null }>;
}) {
  const users = seed.users ?? [];
  const prisma: any = {
    vendasComercialConfig: {
      findUnique: async () => ({
        aiNome: seed.aiNome ?? null,
        aiIdentidade: seed.aiIdentidade ?? 'nome_proprio',
        aiUserId: seed.aiUserId ?? null,
        empresaFazTexto: 'Sistema pra distribuidora de água e gás.',
        catalogoJson: null,
      }),
    },
    user: {
      findFirst: async ({ where }: any) =>
        users.find((u) => u.id === where.id && u.companyId === where.companyId) ?? null,
    },
  };
  return new PersonaIaService(prisma);
}

// A empresa 5 como está hoje: se_passa_por → o dono.
const EMPRESA_ASSINA_O_DONO = {
  aiIdentidade: 'se_passa_por',
  aiUserId: 6,
  users: [
    { id: 6, companyId: COMPANY, name: 'Jhonatan' },
    { id: 59, companyId: COMPANY, name: 'Bianca', username: 'bianca' },
    { id: 60, companyId: COMPANY, name: 'Maria Clara', username: 'mariaclara' },
    { id: 61, companyId: COMPANY, name: null, username: 'flavia' },
  ],
};

test('🔴 cada vendedora assina com o nome DELA, não com o do dono', async () => {
  const service = buildService(EMPRESA_ASSINA_O_DONO);

  assert.equal(await service.assinaturaDaPessoa(COMPANY, 59, 'time comercial'), 'Bianca');
  assert.equal(await service.assinaturaDaPessoa(COMPANY, 60, 'time comercial'), 'Maria Clara');
});

test('sem pessoa atrás do envio, a identidade continua sendo a da empresa', async () => {
  const service = buildService(EMPRESA_ASSINA_O_DONO);

  assert.equal(await service.assinaturaDaPessoa(COMPANY, null, 'time comercial'), 'Jhonatan');
  assert.equal(await service.assinaturaDaPessoa(COMPANY, 0, 'time comercial'), 'Jhonatan');
  // E a porta velha não mudou de comportamento.
  assert.equal(await service.assinatura(COMPANY, 'time comercial'), 'Jhonatan');
});

test('🔒 login NÃO vira nome — sem `name` preenchido, a empresa responde', async () => {
  const service = buildService(EMPRESA_ASSINA_O_DONO);

  const assinou = await service.assinaturaDaPessoa(COMPANY, 61, 'time comercial');
  assert.notEqual(assinou, 'flavia', '"flavia" em minúscula no lugar de "Flávia" é o mesmo teatro');
  assert.equal(assinou, 'Jhonatan', 'cai na identidade da empresa, que é gente de verdade');
});

test('🔒 pessoa de OUTRA empresa não empresta nome (multi-tenant)', async () => {
  const service = buildService({
    aiIdentidade: 'nome_proprio',
    aiNome: 'Lia',
    users: [{ id: 77, companyId: 999, name: 'Intrusa' }],
  });

  assert.equal(await service.assinaturaDaPessoa(COMPANY, 77, 'time comercial'), 'Lia');
});

test('empresa com nome próprio de IA: a vendedora ainda ganha da empresa', async () => {
  const service = buildService({
    aiIdentidade: 'nome_proprio',
    aiNome: 'Lia',
    users: [{ id: 59, companyId: COMPANY, name: 'Bianca' }],
  });

  assert.equal(await service.assinaturaDaPessoa(COMPANY, 59, 'time comercial'), 'Bianca');
  assert.equal(await service.assinaturaDaPessoa(COMPANY, null, 'time comercial'), 'Lia');
});

test('sem identidade nenhuma: o fallback do chamador continua valendo', async () => {
  const service = buildService({ aiIdentidade: 'nome_proprio', aiNome: null, users: [] });

  assert.equal(await service.assinaturaDaPessoa(COMPANY, 59, 'time comercial'), 'time comercial');
});
