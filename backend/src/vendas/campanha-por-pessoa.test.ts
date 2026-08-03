import test from 'node:test';
import assert from 'node:assert/strict';

import { VendasAutomationService } from './vendas-automation.service';

/**
 * 🔴 04/08/2026 — A CAMPANHA É DA PESSOA, NÃO DA EMPRESA.
 *
 * A campanha de prospecção era procurada por `findFirst({ companyId })`: UMA por
 * empresa. Só que é `createdByUserId` quem decide de qual chip a mensagem sai
 * (`senderUserId` no envio) e qual nome assina. Com cinco vendedoras, as cinco
 * escreviam na MESMA linha — a última salvava por cima das outras e todas
 * disparavam pelo chip do dono, assinando o nome dele.
 *
 * Decisão do dono (04/08): campanha por pessoa, **mas só o dono/gerente
 * configura**. As vendedoras não mexem em disparo — o 5º muro (triagem
 * confirmada por dono/gerente) fica de pé.
 *
 * Bordas que estes testes trancam:
 *  · a busca filtra pela dona, e sem dona continua sendo a da empresa (legado);
 *  · quem salva a campanha da Bianca grava a BIANCA como dona, não quem clicou;
 *  · vendedora (USER) não aponta pra campanha de ninguém;
 *  · ninguém aponta pra pessoa de outra empresa (lei multi-tenant);
 *  · a lista mostra quem AINDA NÃO tem campanha — é assim que o dono descobre
 *    antes do dia do disparo, não depois.
 */

const COMPANY = 5;

const DONO = { id: 6, companyId: COMPANY, role: 'ADMIN', name: 'Jhonatan' };
const BIANCA = { id: 59, companyId: COMPANY, role: 'USER', name: 'Bianca', username: 'bianca' };
const MARIA = { id: 60, companyId: COMPANY, role: 'USER', name: 'Maria Clara', username: 'mariaclara' };
const DE_OUTRA_EMPRESA = { id: 99, companyId: 41, role: 'USER', name: 'Alheia', username: 'alheia' };

type CampanhaSeed = {
  id: string;
  companyId: number;
  createdByUserId: number | null;
  status?: string;
  filtersJson?: string | null;
  updatedAt?: Date;
};

function buildService(seed: { campanhas?: CampanhaSeed[]; pessoas?: any[] } = {}) {
  const campanhas = seed.campanhas ?? [];
  const pessoas = seed.pessoas ?? [DONO, BIANCA, MARIA];
  const wheres: any[] = [];
  const prisma: any = {
    vendasAutomationCampaign: {
      findFirst: async ({ where }: any) => {
        wheres.push(where);
        return (
          campanhas.find(
            (c) =>
              c.companyId === where.companyId &&
              (where.createdByUserId === undefined || c.createdByUserId === where.createdByUserId),
          ) ?? null
        );
      },
      findMany: async ({ where }: any) => campanhas.filter((c) => c.companyId === where.companyId),
    },
    user: {
      findFirst: async ({ where }: any) =>
        pessoas.find((p) => p.id === where.id && p.companyId === where.companyId) ?? null,
      findMany: async ({ where }: any) => pessoas.filter((p) => p.companyId === where.companyId),
    },
  };
  const svc: any = Object.create(VendasAutomationService.prototype);
  svc.prisma = prisma;
  return { svc, wheres };
}

// ── A BUSCA ────────────────────────────────────────────────────────────────────

test('🔴 a busca da campanha filtra pela DONA', async () => {
  const { svc, wheres } = buildService({
    campanhas: [
      { id: 'c-dono', companyId: COMPANY, createdByUserId: 6 },
      { id: 'c-bianca', companyId: COMPANY, createdByUserId: 59 },
    ],
  });

  assert.equal((await svc.latestCampaign(COMPANY, 59))?.id, 'c-bianca');
  assert.equal((await svc.latestCampaign(COMPANY, 6))?.id, 'c-dono');
  assert.deepEqual(wheres[0], { companyId: COMPANY, createdByUserId: 59 });
});

test('sem dona, a busca continua sendo a da empresa (não-regressão)', async () => {
  const { svc, wheres } = buildService({
    campanhas: [{ id: 'c-legado', companyId: COMPANY, createdByUserId: null }],
  });

  assert.equal((await svc.latestCampaign(COMPANY))?.id, 'c-legado');
  assert.equal((await svc.latestCampaign(COMPANY, 0))?.id, 'c-legado');
  assert.deepEqual(wheres[0], { companyId: COMPANY }, 'sem dona o filtro NÃO entra no where');
});

test('vendedora sem campanha própria não herda a de outra pessoa', async () => {
  const { svc } = buildService({
    campanhas: [{ id: 'c-bianca', companyId: COMPANY, createdByUserId: 59 }],
  });

  assert.equal(await svc.latestCampaign(COMPANY, 60), null, 'a Maria Clara não pode achar a campanha da Bianca');
});

// ── DE QUEM É A CAMPANHA DESTA CHAMADA ────────────────────────────────────────

test('sem pedido explícito, a campanha é de quem está logado', async () => {
  const { svc } = buildService();
  const contexto = { companyId: COMPANY, userId: 6 };

  assert.equal(await svc.resolveCampaignOwnerId(DONO, contexto, undefined), 6);
  assert.equal(await svc.resolveCampaignOwnerId(DONO, contexto, 0), 6);
  // Vendedora abrindo a própria tela não precisa de permissão nenhuma.
  assert.equal(await svc.resolveCampaignOwnerId(BIANCA, { companyId: COMPANY, userId: 59 }, 59), 59);
});

test('🔴 o dono aponta pra campanha da vendedora', async () => {
  const { svc } = buildService();

  assert.equal(await svc.resolveCampaignOwnerId(DONO, { companyId: COMPANY, userId: 6 }, 59), 59);
});

test('🔒 vendedora NÃO aponta pra campanha de outra pessoa', async () => {
  const { svc } = buildService();

  await assert.rejects(
    () => svc.resolveCampaignOwnerId(BIANCA, { companyId: COMPANY, userId: 59 }, 60),
    /dono\/gerente/i,
    'quem não configura prospecção não escolhe campanha de ninguém',
  );
});

test('🔒 ninguém aponta pra pessoa de OUTRA empresa (multi-tenant)', async () => {
  const { svc } = buildService({ pessoas: [DONO, BIANCA, DE_OUTRA_EMPRESA] });

  await assert.rejects(
    () => svc.resolveCampaignOwnerId(DONO, { companyId: COMPANY, userId: 6 }, 99),
    /não faz parte desta empresa/i,
  );
});

// ── A LISTA DA EQUIPE ─────────────────────────────────────────────────────────

const variantes = (...textos: string[]) => JSON.stringify({ firstContactVariants: textos });

test('🔴 a lista mostra de quem AINDA falta montar a campanha', async () => {
  const { svc } = buildService({
    campanhas: [
      { id: 'c-bianca', companyId: COMPANY, createdByUserId: 59, status: 'paused', filtersJson: variantes('a', 'b') },
    ],
  });

  const out = await svc.listProspectingCampaignsForUser({ ...DONO, isSystemMaster: false });
  const porId = new Map<number, any>(out.pessoas.map((p: any) => [p.userId, p] as [number, any]));

  assert.equal(porId.get(59)?.campanha?.id, 'c-bianca');
  assert.equal(porId.get(59)?.campanha?.variantesPrimeiroContato, 2);
  assert.equal(porId.get(60)?.campanha, null, 'a Maria Clara aparece SEM campanha, não some da lista');
  assert.equal(porId.get(60)?.nome, 'Maria Clara');
});

test('variante PAUSADA não conta como texto pronto', async () => {
  const { svc } = buildService({
    campanhas: [
      {
        id: 'c-bianca',
        companyId: COMPANY,
        createdByUserId: 59,
        // O caractere de controle no início é como o dono desliga uma variante
        // sem perder o texto — o motor não usa, então a tela não pode contar.
        filtersJson: variantes('valendo', 'desligada', '   '),
      },
    ],
  });

  const out = await svc.listProspectingCampaignsForUser(DONO);
  const bianca = out.pessoas.find((p: any) => p.userId === 59);
  assert.equal(bianca.campanha.variantesPrimeiroContato, 1, 'a tela não pode prometer 3 e o motor ter 1');
});

test('🔒 vendedora não enxerga a lista de campanhas da equipe', async () => {
  const { svc } = buildService();

  await assert.rejects(() => svc.listProspectingCampaignsForUser(BIANCA), /dono\/gerente/i);
});

test('campanha órfã (sem dona) aparece à parte, não some da tela', async () => {
  const { svc } = buildService({
    campanhas: [{ id: 'c-legado', companyId: COMPANY, createdByUserId: null, status: 'paused', filtersJson: variantes('x') }],
  });

  const out = await svc.listProspectingCampaignsForUser(DONO);
  assert.equal(out.semDono.length, 1);
  assert.equal(out.semDono[0].id, 'c-legado');
  assert.equal(out.pessoas.every((p: any) => p.campanha === null), true);
});
