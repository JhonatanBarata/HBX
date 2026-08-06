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

// ============================================================================
// 🔴 06/08/2026 — O NOME SEGUE O CHIP (aprovado pelo dono: "cada chip fala com o
// nome da dona dele").
//
// O que faltava: `assinaturaDaPessoa` resolvia a dona pela CAMPANHA, e a fase de
// treino vive no CONTATO MANUAL, que não tem campanha nenhuma. Medido em prod:
// a Maria Clara manda do chip company-5-user-60 e, sem campanha, a resposta caía
// na persona da EMPRESA (se_passa_por → aiUserId 6) e assinava "Jhonatan".
// ============================================================================

function buildServiceComConversas(
  seed: Parameters<typeof buildService>[0],
  conversas: Array<{ id: number; companyId: number; sourceTenantKey: string | null }>,
) {
  const service: any = buildService(seed);
  service.prisma.companyConversation = {
    findFirst: async ({ where }: any) =>
      conversas.find((c) => c.id === where.id && c.companyId === where.companyId) ?? null,
  };
  return service as PersonaIaService;
}

test('🔴 chip da vendedora assina com o nome DELA, mesmo sem campanha', async () => {
  const service = buildService(EMPRESA_ASSINA_O_DONO);

  assert.equal(
    await service.assinaturaDoChip(COMPANY, 'company-5-user-60', null, 'time comercial'),
    'Maria Clara',
    'o chip diz de quem e o numero — nao precisa de campanha pra saber',
  );
  assert.equal(await service.assinaturaDoChip(COMPANY, 'company-5-user-59', null, 'time comercial'), 'Bianca');
});

test('o CHIP ganha da campanha: quem manda e de quem e o numero', async () => {
  const service = buildService(EMPRESA_ASSINA_O_DONO);

  // Campanha da Bianca, mas o texto saiu pelo chip da Maria Clara.
  assert.equal(await service.assinaturaDoChip(COMPANY, 'company-5-user-60', 59, 'time comercial'), 'Maria Clara');
});

test('chip principal da empresa (sem -user-) nao muda nada: cai na campanha, depois na empresa', async () => {
  const service = buildService(EMPRESA_ASSINA_O_DONO);

  assert.equal(await service.assinaturaDoChip(COMPANY, 'company-5', 59, 'time comercial'), 'Bianca');
  assert.equal(await service.assinaturaDoChip(COMPANY, 'company-5', null, 'time comercial'), 'Jhonatan');
  assert.equal(await service.assinaturaDoChip(COMPANY, null, null, 'time comercial'), 'Jhonatan');
  assert.equal(await service.assinaturaDoChip(COMPANY, 'lixo', null, 'time comercial'), 'Jhonatan');
});

test('🔒 multi-tenant: chip de OUTRA empresa nao empresta nome', async () => {
  const service = buildService(EMPRESA_ASSINA_O_DONO);

  assert.equal(
    await service.assinaturaDoChip(COMPANY, 'company-9-user-60', null, 'time comercial'),
    'Jhonatan',
    'chip da empresa 9 nao pode assinar na empresa 5',
  );
});

test('chip de vendedora SEM name preenchido nao vira login — a empresa responde', async () => {
  const service = buildService(EMPRESA_ASSINA_O_DONO);

  assert.equal(
    await service.assinaturaDoChip(COMPANY, 'company-5-user-61', null, 'time comercial'),
    'Jhonatan',
    '"flavia" nao e nome proprio; e o mesmo teatro por outro caminho',
  );
});

test('🔴 pela CONVERSA (o caminho do webhook de resposta): le o chip da conversa', async () => {
  const service = buildServiceComConversas(EMPRESA_ASSINA_O_DONO, [
    { id: 2683, companyId: COMPANY, sourceTenantKey: 'company-5-user-60' },
    { id: 2634, companyId: COMPANY, sourceTenantKey: 'company-5-user-6' },
    { id: 2644, companyId: COMPANY, sourceTenantKey: null },
  ]);

  assert.equal(await service.assinaturaDaConversa(COMPANY, 2683, null, 'time comercial'), 'Maria Clara');
  assert.equal(await service.assinaturaDaConversa(COMPANY, 2634, null, 'time comercial'), 'Jhonatan');
  // Conversa sem chip gravado (legado): cai na campanha, como antes.
  assert.equal(await service.assinaturaDaConversa(COMPANY, 2644, 59, 'time comercial'), 'Bianca');
  // Conversa inexistente não inventa nome nem explode.
  assert.equal(await service.assinaturaDaConversa(COMPANY, 999999, null, 'time comercial'), 'Jhonatan');
  assert.equal(await service.assinaturaDaConversa(COMPANY, null, null, 'time comercial'), 'Jhonatan');
});

test('banco fora ao ler a conversa nao derruba a assinatura', async () => {
  const service: any = buildService(EMPRESA_ASSINA_O_DONO);
  service.prisma.companyConversation = {
    findFirst: async () => { throw new Error('banco fora'); },
  };

  assert.equal(await service.assinaturaDaConversa(COMPANY, 2683, 59, 'time comercial'), 'Bianca');
});
