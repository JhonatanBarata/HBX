import test from 'node:test';
import assert from 'node:assert/strict';

import { NucleoCadastroService } from './nucleo-cadastro.service';

// MULTILOCAL (10/07) — CRUD de LocalEntrega + telefones (via Contato):
//   locais: 1º nasce principal; trocar principal atômico; soft-delete + promoção;
//           barrar único-local-com-vínculo (400).
//   telefones: exige número; sem-nome usa o número; não zerar o principal único (400);
//              promover o próximo ao remover o principal.

// ── mock de banco pro CRUD de LOCAIS ──────────────────────────────────────────
function buildLocalMock(
  opts: {
    conta?: any; // customerProfile.findFirst (undefined → existe; null → 404)
    ativosCount?: number; // localEntrega.count
    found?: any; // localEntrega.findFirst
    outrosAtivos?: any[]; // localEntrega.findMany (demais ativos)
    vinculoAtivo?: any; // clienteProduto.findFirst
  } = {},
) {
  const store = {
    creates: [] as any[],
    updates: [] as any[],
    updateMany: [] as any[],
  };
  const prisma: any = {
    customerProfile: {
      findFirst: async (args: any) => (opts.conta === undefined ? { id: args?.where?.id } : opts.conta),
    },
    localEntrega: {
      count: async () => opts.ativosCount ?? 0,
      findFirst: async () => opts.found ?? null,
      findMany: async () => opts.outrosAtivos ?? [],
      create: async (a: any) => {
        store.creates.push(a.data);
        return { id: 'novo-local' };
      },
      update: async (a: any) => {
        store.updates.push(a);
        return { id: a.where.id };
      },
      updateMany: async (a: any) => {
        store.updateMany.push(a);
        return { count: 0 };
      },
    },
    clienteProduto: { findFirst: async () => opts.vinculoAtivo ?? null },
    $transaction: async (fn: any) => fn(prisma),
  };
  return { prisma, store };
}

// ── createLocal ───────────────────────────────────────────────────────────────
test('createLocal: 1º local do cliente NASCE principal (desmarca antes de criar)', async () => {
  const { prisma, store } = buildLocalMock({ ativosCount: 0 });
  const res = await new NucleoCadastroService(prisma).createLocal(7, 'c1', { endereco: 'Rua X' });
  assert.ok(res);
  assert.equal(store.creates[0].isPrincipal, true);
  assert.equal(store.creates[0].ativo, true);
  assert.equal(store.updateMany.length, 1, 'atômico: desmarca principais antes');
});

test('createLocal: 2º local sem isPrincipal → NÃO principal, não mexe no atual', async () => {
  const { prisma, store } = buildLocalMock({ ativosCount: 1 });
  await new NucleoCadastroService(prisma).createLocal(7, 'c1', { endereco: 'Rua Y' });
  assert.equal(store.creates[0].isPrincipal, false);
  assert.equal(store.updateMany.length, 0);
});

test('createLocal: isPrincipal=true no 2º → troca o principal (desmarca os outros)', async () => {
  const { prisma, store } = buildLocalMock({ ativosCount: 1 });
  await new NucleoCadastroService(prisma).createLocal(7, 'c1', { endereco: 'Rua Z', isPrincipal: true });
  assert.equal(store.creates[0].isPrincipal, true);
  assert.equal(store.updateMany.length, 1);
});

test('createLocal: cliente inexistente/de outro tenant → null (404)', async () => {
  const { prisma } = buildLocalMock({ conta: null });
  assert.equal(await new NucleoCadastroService(prisma).createLocal(7, 'x', { endereco: 'a' }), null);
});

// ── updateLocal ─────────────────────────────────────────────────────────────
test('updateLocal: promover a principal desmarca os outros (atômico)', async () => {
  const { prisma, store } = buildLocalMock({ found: { id: 'l2', customerProfileId: 'c1', isPrincipal: false } });
  await new NucleoCadastroService(prisma).updateLocal(7, 'l2', { isPrincipal: true });
  assert.equal(store.updateMany.length, 1, 'desmarca os demais');
  const upd = store.updates.find((u) => u.where.id === 'l2');
  assert.equal(upd.data.isPrincipal, true);
});

test('updateLocal: isPrincipal=false é IGNORADO (não rebaixa; troca é promovendo outro)', async () => {
  const { prisma, store } = buildLocalMock({ found: { id: 'l1', customerProfileId: 'c1', isPrincipal: true } });
  await new NucleoCadastroService(prisma).updateLocal(7, 'l1', { isPrincipal: false, apelido: 'Casa' });
  assert.equal(store.updateMany.length, 0);
  const upd = store.updates.find((u) => u.where.id === 'l1');
  assert.equal('isPrincipal' in upd.data, false, 'não mexe na flag');
  assert.equal(upd.data.apelido, 'Casa', 'demais campos são aplicados');
});

test('updateLocal: inexistente/de outro tenant → null', async () => {
  const { prisma } = buildLocalMock({ found: null });
  assert.equal(await new NucleoCadastroService(prisma).updateLocal(7, 'x', { apelido: 'a' }), null);
});

// ── deleteLocal ─────────────────────────────────────────────────────────────
test('deleteLocal: ÚNICO local ativo COM ClienteProduto ativo apontando → 400', async () => {
  const { prisma } = buildLocalMock({
    found: { id: 'l1', customerProfileId: 'c1', isPrincipal: true, ativo: true },
    outrosAtivos: [],
    vinculoAtivo: { id: 'cp1' },
  });
  await assert.rejects(
    () => new NucleoCadastroService(prisma).deleteLocal(7, 'l1'),
    (e: any) => {
      assert.equal(e?.constructor?.name, 'BadRequestException', 'HTTP 400');
      assert.equal(e?.getResponse?.()?.error, 'LOCAL_UNICO_COM_VINCULO');
      return true;
    },
  );
});

test('deleteLocal: único local ativo SEM vínculo → soft-delete (ativo=false)', async () => {
  const { prisma, store } = buildLocalMock({
    found: { id: 'l1', customerProfileId: 'c1', isPrincipal: true, ativo: true },
    outrosAtivos: [],
    vinculoAtivo: null,
  });
  const res = await new NucleoCadastroService(prisma).deleteLocal(7, 'l1');
  assert.equal(res?.id, 'l1');
  const upd = store.updates.find((u) => u.where.id === 'l1');
  assert.equal(upd.data.ativo, false);
  assert.equal(upd.data.isPrincipal, false);
});

test('deleteLocal: apagar o PRINCIPAL havendo outros → promove o mais antigo', async () => {
  const { prisma, store } = buildLocalMock({
    found: { id: 'l1', customerProfileId: 'c1', isPrincipal: true, ativo: true },
    outrosAtivos: [{ id: 'l2' }, { id: 'l3' }], // findMany já ordena createdAt asc no serviço
  });
  const res = await new NucleoCadastroService(prisma).deleteLocal(7, 'l1');
  assert.equal(res?.id, 'l1');
  assert.ok(store.updates.find((u) => u.where.id === 'l1' && u.data.ativo === false));
  assert.ok(
    store.updates.find((u) => u.where.id === 'l2' && u.data.isPrincipal === true),
    'promove o 1º da lista (mais antigo)',
  );
});

test('deleteLocal: já inativo → idempotente (no-op)', async () => {
  const { prisma, store } = buildLocalMock({
    found: { id: 'l1', customerProfileId: 'c1', isPrincipal: false, ativo: false },
  });
  const res = await new NucleoCadastroService(prisma).deleteLocal(7, 'l1');
  assert.equal(res?.id, 'l1');
  assert.equal(store.updates.length, 0);
});

// ── mock de banco pro CRUD de TELEFONES (via Contato) ─────────────────────────
function buildTelMock(
  opts: {
    conta?: any;
    found?: any; // contato.findFirst por id
    next?: any; // contato.findFirst da promoção (sem id no where)
    total?: number; // contato.count
  } = {},
) {
  const store = {
    creates: [] as any[],
    updates: [] as any[],
    updateMany: [] as any[],
    deletes: [] as string[],
    deletionRecords: [] as any[],
  };
  const prisma: any = {
    customerProfile: {
      findFirst: async (args: any) => (opts.conta === undefined ? { id: args?.where?.id } : opts.conta),
    },
    contato: {
      findFirst: async (args: any) => (args?.where?.id ? opts.found ?? null : opts.next ?? null),
      count: async () => opts.total ?? 1,
      create: async (a: any) => {
        store.creates.push(a.data);
        return { id: 'novo-contato' };
      },
      update: async (a: any) => {
        store.updates.push(a);
        return { id: a.where.id };
      },
      updateMany: async (a: any) => {
        store.updateMany.push(a);
        return { count: 0 };
      },
      delete: async (a: any) => {
        store.deletes.push(a.where.id);
        return { id: a.where.id };
      },
    },
    deletionRecord: {
      create: async (a: any) => {
        store.deletionRecords.push(a.data);
        return a.data;
      },
    },
    $transaction: async (fn: any) => fn(prisma),
  };
  return { prisma, store };
}

// ── addTelefone ─────────────────────────────────────────────────────────────
test('addTelefone: sem NENHUM número → 400 TELEFONE_SEM_NUMERO', async () => {
  const { prisma } = buildTelMock({});
  await assert.rejects(
    () => new NucleoCadastroService(prisma).addTelefone(7, 'c1', { nome: 'João' }),
    (e: any) => {
      assert.equal(e?.constructor?.name, 'BadRequestException');
      assert.equal(e?.getResponse?.()?.error, 'TELEFONE_SEM_NUMERO');
      return true;
    },
  );
});

test('addTelefone: com número e SEM nome → o número vira o rótulo', async () => {
  const { prisma, store } = buildTelMock({});
  const res = await new NucleoCadastroService(prisma).addTelefone(7, 'c1', { whatsapp: '(88) 99999-0000' });
  assert.ok(res);
  assert.equal(store.creates[0].nome, '88999990000');
  assert.equal(store.creates[0].whatsapp, '88999990000');
  assert.equal(store.creates[0].isPrincipal, false);
});

test('addTelefone: isPrincipal=true rebaixa o principal anterior', async () => {
  const { prisma, store } = buildTelMock({});
  await new NucleoCadastroService(prisma).addTelefone(7, 'c1', { whatsapp: '88999990000', isPrincipal: true });
  assert.equal(store.updateMany.length, 1, 'rebaixa o principal atual');
  assert.equal(store.creates[0].isPrincipal, true);
});

test('addTelefone: cliente inexistente/de outro tenant → null', async () => {
  const { prisma } = buildTelMock({ conta: null });
  assert.equal(await new NucleoCadastroService(prisma).addTelefone(7, 'x', { whatsapp: '88999990000' }), null);
});

// ── deleteTelefone ────────────────────────────────────────────────────────────
const contatoRow = (over: any = {}) => ({
  id: 'k1', companyId: 7, customerProfileId: 'c1', nome: 'João', cargo: null,
  whatsapp: '88999990000', phone: null, email: null, isPrincipal: true, source: 'manual', ...over,
});

test('deleteTelefone: principal ÚNICO → 400 (não zera o principal)', async () => {
  const { prisma } = buildTelMock({ found: contatoRow({ isPrincipal: true }), total: 1 });
  await assert.rejects(
    () => new NucleoCadastroService(prisma).deleteTelefone(7, 'k1'),
    (e: any) => {
      assert.equal(e?.constructor?.name, 'BadRequestException');
      assert.equal(e?.getResponse?.()?.error, 'TELEFONE_PRINCIPAL_UNICO');
      return true;
    },
  );
});

test('deleteTelefone: principal com OUTROS → snapshot + delete + promove o próximo', async () => {
  const { prisma, store } = buildTelMock({
    found: contatoRow({ isPrincipal: true }),
    total: 2,
    next: { id: 'k2' },
  });
  const res = await new NucleoCadastroService(prisma).deleteTelefone(7, 'k1');
  assert.equal(res?.id, 'k1');
  assert.equal(store.deletionRecords.length, 1, 'snapshot gravado');
  assert.ok(store.deletes.includes('k1'), 'removido');
  assert.ok(
    store.updates.find((u) => u.where.id === 'k2' && u.data.isPrincipal === true),
    'promove o próximo',
  );
});

test('deleteTelefone: NÃO-principal → delete direto (sem promoção)', async () => {
  const { prisma, store } = buildTelMock({ found: contatoRow({ id: 'k3', isPrincipal: false }) });
  const res = await new NucleoCadastroService(prisma).deleteTelefone(7, 'k3');
  assert.equal(res?.id, 'k3');
  assert.ok(store.deletes.includes('k3'));
  assert.equal(store.updates.length, 0, 'não promove ninguém');
});

test('deleteTelefone: inexistente/de outro tenant → null', async () => {
  const { prisma } = buildTelMock({ found: null });
  assert.equal(await new NucleoCadastroService(prisma).deleteTelefone(7, 'x'), null);
});

// ── getCliente: ficha traz locais[] + telefones[] (aditivo, sem quebrar o legado) ──
test('getCliente: inclui telefones[] (principal 1º) e locais[] (principal 1º)', async () => {
  const prisma: any = {
    customerProfile: {
      findFirst: async () => ({
        id: 'c1', name: 'Dona Maria', tipo: 'pf', cnpj: null, document: null,
        endereco: 'Rua A', numero: '10', bairro: 'Centro', cidade: 'For', uf: 'CE', cep: '600',
        lat: -4, lng: -38, geoFonte: 'gps_cadastro', phone: '5588000', email: null, status: 'active',
        isLead: false, isCliente: true, isFornecedor: false, formaPagamento: 'aberto',
        metodoPadrao: null, contabilizar: true, diaFechamento: null, limiteFiado: null,
        contatos: [
          { id: 'k1', nome: 'Maria', whatsapp: '5588111', phone: null, isPrincipal: true },
          { id: 'k2', nome: 'Filho', whatsapp: '5588222', phone: null, isPrincipal: false },
        ],
        locais: [
          { id: 'l1', apelido: 'Casa', endereco: 'Rua A', numero: '10', bairro: 'Centro', cidade: 'For', uf: 'CE', cep: '600', lat: -4, lng: -38, geoFonte: 'gps_cadastro', isPrincipal: true, ativo: true },
          { id: 'l2', apelido: 'Loja', endereco: 'Rua B', numero: '20', bairro: null, cidade: 'For', uf: 'CE', cep: null, lat: null, lng: null, geoFonte: null, isPrincipal: false, ativo: true },
        ],
      }),
    },
  };
  const res = await new NucleoCadastroService(prisma).getCliente(7, 'c1');
  assert.ok(res);
  assert.equal(res?.telefones.length, 2);
  assert.equal(res?.telefones[0].id, 'k1');
  assert.equal(res?.telefones[0].isPrincipal, true);
  // whatsapp/contatoPrincipalId da ficha = do principal (semântica preservada).
  assert.equal(res?.whatsapp, '5588111');
  assert.equal(res?.contatoPrincipalId, 'k1');
  assert.equal(res?.locais.length, 2);
  assert.equal(res?.locais[0].id, 'l1');
  assert.equal(res?.locais[0].isPrincipal, true);
  assert.equal(res?.locais[0].apelido, 'Casa');
});

test('getCliente: SEM contato principal → whatsapp cai pro phone da conta (legado)', async () => {
  const prisma: any = {
    customerProfile: {
      findFirst: async () => ({
        id: 'c1', name: 'X', tipo: 'pf', cnpj: null, document: null, endereco: null, numero: null,
        bairro: null, cidade: null, uf: null, cep: null, lat: null, lng: null, geoFonte: null,
        phone: '5588999', email: null, status: 'active', isLead: false, isCliente: true, isFornecedor: false,
        formaPagamento: 'aberto', metodoPadrao: null, contabilizar: true, diaFechamento: null, limiteFiado: null,
        contatos: [], locais: [],
      }),
    },
  };
  const res = await new NucleoCadastroService(prisma).getCliente(7, 'c1');
  assert.equal(res?.whatsapp, '5588999', 'sem principal → phone da conta');
  assert.equal(res?.contatoPrincipalId, null);
  assert.deepEqual(res?.telefones, []);
  assert.deepEqual(res?.locais, []);
});

// ── SEED/SYNC do LOCAL PRINCIPAL a partir do PERFIL (11/07) ───────────────────
// Conta criada/editada FORA da ficha (createConta manual/import) nascia sem
// LocalEntrega → o card do /entrega acendia pendência falsa; e editar o endereço
// no perfil não refletia no local. createConta com endereço semeia 1 principal;
// updateConta mexendo em endereço sincroniza o principal (sem duplicar).
function buildSyncMock(seed: { profiles?: any[]; locais?: any[]; contatos?: any[] } = {}) {
  const store = {
    profiles: (seed.profiles ?? []).map((p) => ({ ...p })),
    locais: (seed.locais ?? []).map((l) => ({ ...l })),
    contatos: (seed.contatos ?? []).map((c) => ({ ...c })),
  };
  let pid = store.profiles.length;
  let lid = store.locais.length;
  let cid = store.contatos.length;

  const prisma: any = {
    customerProfile: {
      findFirst: async (args: any) => {
        const w = args?.where || {};
        return (
          store.profiles.find(
            (p) =>
              (w.companyId == null || p.companyId === w.companyId) &&
              (w.id == null || p.id === w.id) &&
              (w.cnpj == null || p.cnpj === w.cnpj) &&
              (w.document == null || p.document === w.document) &&
              (w.phoneNormalized == null || p.phoneNormalized === w.phoneNormalized),
          ) || null
        );
      },
      create: async (args: any) => {
        const row = { id: `p${++pid}`, companyId: 7, ...args.data };
        store.profiles.push(row);
        return { id: row.id };
      },
      update: async (args: any) => {
        const row = store.profiles.find((p) => p.id === args.where.id);
        if (row) Object.assign(row, args.data);
        return { id: args.where.id };
      },
    },
    contato: {
      findFirst: async (args: any) => {
        const w = args?.where || {};
        return (
          store.contatos.find(
            (c) =>
              (w.companyId == null || c.companyId === w.companyId) &&
              (w.customerProfileId == null || c.customerProfileId === w.customerProfileId) &&
              (w.isPrincipal == null || c.isPrincipal === w.isPrincipal),
          ) || null
        );
      },
      create: async (args: any) => {
        const row = { id: `k${++cid}`, ...args.data };
        store.contatos.push(row);
        return { id: row.id };
      },
      update: async (args: any) => {
        const row = store.contatos.find((c) => c.id === args.where.id);
        if (row) Object.assign(row, args.data);
        return { id: args.where.id };
      },
      updateMany: async () => ({ count: 0 }),
    },
    localEntrega: {
      findFirst: async (args: any) => {
        const w = args?.where || {};
        return (
          store.locais.find(
            (l) =>
              (w.companyId == null || l.companyId === w.companyId) &&
              (w.customerProfileId == null || l.customerProfileId === w.customerProfileId) &&
              (w.ativo == null || l.ativo === w.ativo) &&
              (w.isPrincipal == null || l.isPrincipal === w.isPrincipal),
          ) || null
        );
      },
      count: async (args: any) => {
        const w = args?.where || {};
        return store.locais.filter(
          (l) =>
            (w.companyId == null || l.companyId === w.companyId) &&
            (w.customerProfileId == null || l.customerProfileId === w.customerProfileId) &&
            (w.ativo == null || l.ativo === w.ativo),
        ).length;
      },
      create: async (args: any) => {
        const row = { id: `l${++lid}`, ...args.data };
        store.locais.push(row);
        return { id: row.id };
      },
      update: async (args: any) => {
        const row = store.locais.find((l) => l.id === args.where.id);
        if (row) Object.assign(row, args.data);
        return { id: args.where.id };
      },
    },
  };
  return { prisma, store };
}

test('createConta: com endereço → semeia 1 LOCAL PRINCIPAL a partir do perfil', async () => {
  const { prisma, store } = buildSyncMock();
  const svc = new NucleoCadastroService(prisma as any);
  await svc.createConta(7, {
    nome: 'Dona Maria',
    whatsapp: '85999990000',
    endereco: 'Rua A',
    numero: '10',
    bairro: 'Centro',
    cidade: 'Fortaleza',
    uf: 'ce',
    cep: '60000-000',
    lat: -3.73,
    lng: -38.52,
    geoFonte: 'gps_cadastro',
  });
  assert.equal(store.locais.length, 1, 'exatamente 1 local semeado');
  const l = store.locais[0];
  assert.equal(l.isPrincipal, true);
  assert.equal(l.ativo, true);
  assert.equal(l.endereco, 'Rua A');
  assert.equal(l.numero, '10');
  assert.equal(l.uf, 'CE', 'uf normalizada no perfil');
  assert.equal(l.lat, -3.73);
  assert.equal(l.lng, -38.52);
  assert.equal(l.geoFonte, 'gps_cadastro', 'geoFonte do local = a do perfil');
});

test('createConta: SEM nenhum campo de endereço → NÃO semeia local', async () => {
  const { prisma, store } = buildSyncMock();
  const svc = new NucleoCadastroService(prisma as any);
  await svc.createConta(7, { nome: 'Sem Endereço', whatsapp: '85988880000' });
  assert.equal(store.locais.length, 0, 'nada a semear');
});

test('updateConta: mexeu no endereço e conta SEM principal → cria principal (seed)', async () => {
  const { prisma, store } = buildSyncMock({
    profiles: [{ id: 'c1', companyId: 7, name: 'Zé', tipo: 'pf' }],
  });
  const svc = new NucleoCadastroService(prisma as any);
  await svc.updateConta(7, 'c1', {
    endereco: 'Rua Nova',
    numero: '99',
    cidade: 'Fortaleza',
    uf: 'CE',
    lat: -3.73,
    lng: -38.52,
    geoFonte: 'gps_cadastro',
  });
  assert.equal(store.locais.length, 1, 'passou a ter endereço → cria principal');
  assert.equal(store.locais[0].isPrincipal, true);
  assert.equal(store.locais[0].endereco, 'Rua Nova');
});

test('updateConta: mexeu no endereço e JÁ tem principal → atualiza, NÃO duplica', async () => {
  const { prisma, store } = buildSyncMock({
    profiles: [{ id: 'c1', companyId: 7, name: 'Zé', tipo: 'pf', endereco: 'Rua Velha', numero: '1' }],
    locais: [
      { id: 'l1', companyId: 7, customerProfileId: 'c1', endereco: 'Rua Velha', numero: '1', isPrincipal: true, ativo: true },
    ],
  });
  const svc = new NucleoCadastroService(prisma as any);
  await svc.updateConta(7, 'c1', { endereco: 'Rua Nova', numero: '99' });
  assert.equal(store.locais.length, 1, 'não duplica — sincroniza o principal existente');
  assert.equal(store.locais[0].id, 'l1');
  assert.equal(store.locais[0].endereco, 'Rua Nova');
  assert.equal(store.locais[0].numero, '99');
});

test('updateConta: NÃO mexeu em endereço → não toca em local nenhum', async () => {
  const { prisma, store } = buildSyncMock({
    profiles: [{ id: 'c1', companyId: 7, name: 'Zé', tipo: 'pf', endereco: 'Rua Velha' }],
  });
  const svc = new NucleoCadastroService(prisma as any);
  await svc.updateConta(7, 'c1', { nome: 'Zé da Silva' });
  assert.equal(store.locais.length, 0, 'update só de nome não semeia local');
});

test('createConta idempotente: conta reimportada que JÁ tem principal → sincroniza sem duplicar', async () => {
  const { prisma, store } = buildSyncMock({
    profiles: [{ id: 'c1', companyId: 7, name: 'Zé', tipo: 'pf', phoneNormalized: '85999990000', endereco: 'Rua Velha' }],
    locais: [
      { id: 'l1', companyId: 7, customerProfileId: 'c1', endereco: 'Rua Velha', isPrincipal: true, ativo: true },
    ],
  });
  const svc = new NucleoCadastroService(prisma as any);
  await svc.createConta(7, {
    nome: 'Zé',
    whatsapp: '85999990000',
    endereco: 'Rua Nova',
    numero: '99',
    lat: -3.73,
    lng: -38.52,
    geoFonte: 'gps_cadastro',
  });
  assert.equal(store.locais.length, 1, 'não cria 2º local');
  assert.equal(store.locais[0].endereco, 'Rua Nova', 'principal sincronizado');
  assert.equal(store.locais[0].numero, '99');
});
