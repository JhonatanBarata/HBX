// PERSONA IA + ENTREVISTA FORÇADA (31/07/2026) — a tranca que substitui os
// bloqueios velhos: sem as 3 respostas (o que faz · o que vende · quem é a IA)
// nenhum bot liga. Cobre também a lei multi-tenant do se_passa_por.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PENDENCIA_CATALOGO,
  PENDENCIA_EMPRESA_FAZ,
  PENDENCIA_IDENTIDADE,
  PersonaIaService,
} from './persona-ia.service';

const CATALOGO_PRONTO = JSON.stringify({
  oQueVendemos: 'Sistema de rota para entregadores',
  capacidades: [{ ganho: 'Entrega no mesmo dia', resolve: ['atraso'] }],
  paraQuem: ['Distribuidoras'],
  ancoraDePreco: null,
});

function makePrisma(row: Record<string, unknown> | null, users: Array<{ id: number; companyId: number; name?: string; username?: string }> = []) {
  const upserts: Array<Record<string, any>> = [];
  let current = row ? { ...row } : null;
  return {
    upserts,
    prisma: {
      vendasComercialConfig: {
        findUnique: async () => current,
        upsert: async ({ create, update }: any) => {
          current = current ? { ...current, ...update } : { ...create };
          upserts.push({ create, update });
          return current;
        },
      },
      user: {
        findFirst: async ({ where }: any) =>
          users.find((u) => u.id === Number(where?.id) && u.companyId === Number(where?.companyId)) || null,
      },
    },
  };
}

test('perfil vazio: 3 pendências, entrevista incompleta', async () => {
  const { prisma } = makePrisma(null);
  const svc = new PersonaIaService(prisma as any);
  const perfil = await svc.getPerfil(7);
  assert.equal(perfil.entrevistaCompleta, false);
  assert.deepEqual(perfil.pendencias, [PENDENCIA_EMPRESA_FAZ, PENDENCIA_CATALOGO, PENDENCIA_IDENTIDADE]);
  assert.equal(perfil.persona.completa, false);
});

test('entrevista completa: nome próprio + o que faz + catálogo pronto liberam', async () => {
  const { prisma } = makePrisma({
    aiNome: 'Sofia',
    aiIdentidade: 'nome_proprio',
    aiUserId: null,
    empresaFazTexto: 'Distribuímos água mineral em Curitiba.',
    catalogoJson: CATALOGO_PRONTO,
  });
  const svc = new PersonaIaService(prisma as any);
  const perfil = await svc.getPerfil(7);
  assert.equal(perfil.entrevistaCompleta, true);
  assert.deepEqual(perfil.pendencias, []);
  assert.equal(perfil.persona.nome, 'Sofia');
  assert.equal(perfil.persona.modo, 'nome_proprio');
});

test('se_passa_por: assina com o nome VIVO do usuário — e só da MESMA empresa', async () => {
  const base = {
    aiNome: null,
    aiIdentidade: 'se_passa_por',
    aiUserId: 99,
    empresaFazTexto: 'Vendemos software.',
    catalogoJson: CATALOGO_PRONTO,
  };
  // Usuário da empresa: vale.
  const ok = makePrisma(base, [{ id: 99, companyId: 7, name: 'Jhonatan' }]);
  const perfilOk = await new PersonaIaService(ok.prisma as any).getPerfil(7);
  assert.equal(perfilOk.persona.nome, 'Jhonatan');
  assert.equal(perfilOk.entrevistaCompleta, true);

  // Usuário de OUTRA empresa: identidade NÃO resolve (multi-tenant é lei).
  const cross = makePrisma(base, [{ id: 99, companyId: 8, name: 'Intruso' }]);
  const perfilCross = await new PersonaIaService(cross.prisma as any).getPerfil(7);
  assert.equal(perfilCross.persona.nome, null);
  assert.equal(perfilCross.entrevistaCompleta, false);
  assert.ok(perfilCross.pendencias.includes(PENDENCIA_IDENTIDADE));
});

test('savePerfil: recusa aiUserId de outra empresa; grava e devolve o perfil novo', async () => {
  const { prisma } = makePrisma(null, [{ id: 5, companyId: 7, name: 'Ana' }]);
  const svc = new PersonaIaService(prisma as any);

  await assert.rejects(
    () => svc.savePerfil(7, { aiIdentidade: 'se_passa_por', aiUserId: 999 }),
    /não pertence a esta empresa/,
  );

  const salvo = await svc.savePerfil(7, {
    aiIdentidade: 'se_passa_por',
    aiUserId: 5,
    empresaFazTexto: '  Entregamos gás e água.  ',
  });
  assert.equal(salvo.persona.nome, 'Ana');
  assert.equal(salvo.empresaFaz, 'Entregamos gás e água.');
});

test('assinatura: persona vence; sem persona cai no fallback do chamador', async () => {
  const comPersona = makePrisma({ aiNome: 'Sofia', aiIdentidade: 'nome_proprio', aiUserId: null, empresaFazTexto: null, catalogoJson: null });
  assert.equal(await new PersonaIaService(comPersona.prisma as any).assinatura(7, 'Fulano'), 'Sofia');

  const semPersona = makePrisma(null);
  assert.equal(await new PersonaIaService(semPersona.prisma as any).assinatura(7, 'Fulano'), 'Fulano');
  assert.equal(await new PersonaIaService(semPersona.prisma as any).assinatura(7, ''), 'time comercial');
});

test('catálogo com JSON podre não completa a entrevista (mesma lei do catalogoJson)', async () => {
  const { prisma } = makePrisma({
    aiNome: 'Sofia',
    aiIdentidade: 'nome_proprio',
    aiUserId: null,
    empresaFazTexto: 'Vendemos coisas.',
    catalogoJson: '{isso nao é json',
  });
  const perfil = await new PersonaIaService(prisma as any).getPerfil(7);
  assert.equal(perfil.catalogoPronto, false);
  assert.equal(perfil.entrevistaCompleta, false);
});
