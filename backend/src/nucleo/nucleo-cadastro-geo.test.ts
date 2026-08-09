import test from 'node:test';
import assert from 'node:assert/strict';

import { NucleoCadastroService } from './nucleo-cadastro.service';
// A escada mudou de casa em 09/08 (era daqui): ela é o assunto de `geoFonte`, e a
// conferência, o semáforo e o fechamento do dia agora leem a MESMA.
import {
  FORCA_GEO_FONTE,
  GEO_FONTES_DA_PORTA,
  forcaGeoFonte,
  geoFonteDaPorta,
} from '../logistica/logistica-geo-fonte.util';

/* 🔴 O PINO PROVADO NA PORTA (09/08) — dois defeitos que eram o mesmo defeito.
 *
 * 1) `seedOrSyncLocalPrincipal` copiava perfil→local passando a fonte por uma allowlist
 *    que não conhecia `gps_entrega` nem `cnefe_cep`: a coordenada ia inteira, a
 *    PROCEDÊNCIA caía pra null. Como o sync roda a cada edição de QUALQUER campo de
 *    endereço, corrigir o bairro de um cliente derrubava a fonte do local — e fonte
 *    null é exatamente o que a cura do CNEFE tem permissão de sobrescrever. Medido em
 *    prod (09/08): 22 perfis com `gps_entrega` e local principal ativo, 2 com
 *    `cnefe_cep`. O pino que o entregador provou no chão virava candidato a palpite.
 * 2) `updateLocal` gravava lat/lng só com `!== undefined`, então o cockpit do desktop —
 *    que OMITE lat/lng quando o CEP muda e o geocode não prova ponto novo — salvava o
 *    endereço NOVO com o pino VELHO, calado. E nem `createLocal` nem `updateLocal`
 *    pediam pino ao servidor (só o perfil pedia), embora o LOCAL seja a porta por onde
 *    a maioria das entregas sai.
 *
 * Testes herméticos: CNEFE desligado por env (o resolver tem gate próprio) e o
 * Nominatim já é default-OFF (`HBX_GEO_SERVER_ENABLED`). Onde o teste precisa provar
 * que o servidor FOI consultado, o método privado é trocado por um espião. */
process.env.HBX_CNEFE_ENABLED = '0';
delete process.env.HBX_GEO_SERVER_ENABLED;

// ── mock mínimo: 1 perfil + 1 local principal ────────────────────────────────
function buildGeoMock(seed: { perfil?: any; local?: any } = {}) {
  const store = {
    perfilUpdates: [] as any[],
    localUpdates: [] as any[],
    localCreates: [] as any[],
  };
  const perfil = seed.perfil ? { ...seed.perfil } : null;
  const local = seed.local ? { ...seed.local } : null;

  const prisma: any = {
    customerProfile: {
      findFirst: async () => perfil,
      update: async (a: any) => {
        store.perfilUpdates.push(a.data);
        if (perfil) Object.assign(perfil, a.data);
        return { id: perfil.id };
      },
    },
    localEntrega: {
      findFirst: async () => local,
      count: async () => (local ? 1 : 0),
      create: async (a: any) => {
        store.localCreates.push(a.data);
        return { id: 'local-novo' };
      },
      update: async (a: any) => {
        store.localUpdates.push(a);
        if (local) Object.assign(local, a.data);
        return { id: a.where.id };
      },
      updateMany: async () => ({ count: 0 }),
    },
    clienteProduto: { findFirst: async () => null },
    $transaction: async (fn: any) => fn(prisma),
  };
  return { prisma, store, perfil, local };
}

const PERFIL_BASE = {
  id: 'c1',
  companyId: 7,
  name: 'Dona Maria',
  isCliente: true,
  endereco: 'Rua M-7',
  numero: '897',
  bairro: 'Centro',
  cidade: 'Rio Claro',
  uf: 'SP',
  cep: '13500000',
};

const LOCAL_BASE = {
  id: 'l1',
  companyId: 7,
  customerProfileId: 'c1',
  isPrincipal: true,
  ativo: true,
  endereco: 'Rua M-7',
  numero: '897',
  bairro: 'Centro',
  cidade: 'Rio Claro',
  uf: 'SP',
  cep: '13500000',
  customerProfile: { isCliente: true },
};

// ── a escada da procedência ──────────────────────────────────────────────────
test('escada da procedência: gps_entrega > gps_cadastro > cnefe > cnefe_cep > geocode > nada', () => {
  assert.ok(forcaGeoFonte('gps_entrega') > forcaGeoFonte('gps_cadastro'));
  assert.ok(forcaGeoFonte('gps_cadastro') > forcaGeoFonte('cnefe'));
  assert.ok(forcaGeoFonte('cnefe') > forcaGeoFonte('cnefe_cep'));
  assert.ok(forcaGeoFonte('cnefe_cep') > forcaGeoFonte('geocode'));
  assert.equal(forcaGeoFonte('geocode'), forcaGeoFonte('gps_impreciso'), 'nenhum dos dois foi provado no chão');
  assert.equal(forcaGeoFonte(null), 0, 'sem procedência vale ZERO');
  assert.equal(forcaGeoFonte(''), 0);
  assert.equal(forcaGeoFonte('toString'), 0, 'string do banco não pode cair no prototype');
  assert.equal(forcaGeoFonte('inventada'), 0);
});

test('escada da procedência: só as 3 fontes da PORTA blindam o pino', () => {
  assert.deepEqual([...GEO_FONTES_DA_PORTA], ['gps_entrega', 'gps_cadastro', 'cnefe']);
  assert.ok(geoFonteDaPorta('gps_entrega'));
  assert.ok(geoFonteDaPorta('cnefe'));
  assert.equal(geoFonteDaPorta('cnefe_cep'), false, 'ponto do trecho de CEP acerta a rua, não a casa');
  assert.equal(geoFonteDaPorta('geocode'), false);
  assert.equal(geoFonteDaPorta(null), false);
  // a allowlist da cópia interna é a MESMA escada — fonte nova entra em UM lugar só.
  assert.ok('gps_entrega' in FORCA_GEO_FONTE && 'cnefe_cep' in FORCA_GEO_FONTE);
});

// ── (1) o defeito grave: editar o endereço não pode apagar a PROCEDÊNCIA ─────
test('perfil gps_entrega + edição de endereço: o local principal NÃO perde a fonte', async () => {
  const { prisma, store } = buildGeoMock({
    perfil: { ...PERFIL_BASE, lat: -22.41, lng: -47.56, geoFonte: 'gps_entrega' },
    local: { ...LOCAL_BASE, lat: -22.41, lng: -47.56, geoFonte: 'gps_entrega' },
  });
  await new NucleoCadastroService(prisma).updateConta(7, 'c1', { bairro: 'Jardim Cervezão' });

  const sync = store.localUpdates.at(-1);
  assert.ok(sync, 'o sync do principal rodou (editou campo de endereço)');
  assert.equal(sync.data.bairro, 'Jardim Cervezão', 'o TEXTO acompanha o perfil');
  assert.equal(sync.data.geoFonte, 'gps_entrega', 'a procedência sobrevive à cópia (era null antes de 09/08)');
  assert.equal(sync.data.lat, -22.41);
  assert.equal(sync.data.lng, -47.56);
});

test('perfil cnefe_cep: a cópia perfil→local também preserva a fonte do trecho de CEP', async () => {
  const { prisma, store } = buildGeoMock({
    perfil: { ...PERFIL_BASE, numero: 'SN', lat: -22.4, lng: -47.5, geoFonte: 'cnefe_cep' },
    local: { ...LOCAL_BASE, numero: 'SN', lat: -22.4, lng: -47.5, geoFonte: 'cnefe_cep' },
  });
  await new NucleoCadastroService(prisma).updateConta(7, 'c1', { bairro: 'Distrito Industrial' });
  assert.equal(store.localUpdates.at(-1).data.geoFonte, 'cnefe_cep');
});

// ── (2) o sync NUNCA rebaixa o pino do local ─────────────────────────────────
test('local gps_entrega + perfil geocode: sync preserva o PINO do local e troca só o texto', async () => {
  const { prisma, store } = buildGeoMock({
    perfil: { ...PERFIL_BASE, lat: -22.39, lng: -47.55, geoFonte: 'geocode' },
    local: { ...LOCAL_BASE, endereco: 'Rua M-7', lat: -22.41, lng: -47.56, geoFonte: 'gps_entrega' },
  });
  await new NucleoCadastroService(prisma).updateConta(7, 'c1', { endereco: 'Rua M-Sete' });

  const sync = store.localUpdates.at(-1).data;
  assert.equal(sync.endereco, 'Rua M-Sete', 'o texto do endereço é copiado');
  assert.equal('lat' in sync, false, 'o pino provado no chão NEM ENTRA no update');
  assert.equal('lng' in sync, false);
  assert.equal('geoFonte' in sync, false);
});

test('local gps_cadastro + perfil cnefe: fonte forte também não é rebaixada por outra forte menor', async () => {
  const { prisma, store } = buildGeoMock({
    perfil: { ...PERFIL_BASE, lat: -22.39, lng: -47.55, geoFonte: 'cnefe' },
    local: { ...LOCAL_BASE, lat: -22.41, lng: -47.56, geoFonte: 'gps_cadastro' },
  });
  await new NucleoCadastroService(prisma).updateConta(7, 'c1', { bairro: 'Centro Novo' });
  assert.equal('lat' in store.localUpdates.at(-1).data, false, 'decisão humana fica onde está');
});

test('local geocode + perfil gps_entrega: pino FRACO é trocado pelo forte (o cadastro converge)', async () => {
  const { prisma, store } = buildGeoMock({
    perfil: { ...PERFIL_BASE, lat: -22.41, lng: -47.56, geoFonte: 'gps_entrega' },
    local: { ...LOCAL_BASE, lat: -22.39, lng: -47.55, geoFonte: 'geocode' },
  });
  await new NucleoCadastroService(prisma).updateConta(7, 'c1', { bairro: 'Centro Novo' });

  const sync = store.localUpdates.at(-1).data;
  assert.equal(sync.lat, -22.41);
  assert.equal(sync.geoFonte, 'gps_entrega');
});

// ── (3) local SEM pino: copia tudo (comportamento de sempre) ─────────────────
test('local SEM pino: o sync copia endereço E pino do perfil', async () => {
  const { prisma, store } = buildGeoMock({
    perfil: { ...PERFIL_BASE, lat: -22.41, lng: -47.56, geoFonte: 'gps_cadastro' },
    local: { ...LOCAL_BASE, lat: null, lng: null, geoFonte: 'gps_entrega' },
  });
  await new NucleoCadastroService(prisma).updateConta(7, 'c1', { bairro: 'Centro Novo' });

  const sync = store.localUpdates.at(-1).data;
  assert.equal(sync.lat, -22.41, 'fonte forte sem coordenada NÃO é pino — não blinda nada');
  assert.equal(sync.lng, -47.56);
  assert.equal(sync.geoFonte, 'gps_cadastro');
});

// ── (4) apagar o pino é EXPLÍCITO ────────────────────────────────────────────
test('updateLocal com lat:null e lng:null → apaga pino E procedência juntos', async () => {
  const { prisma, store } = buildGeoMock({
    local: { ...LOCAL_BASE, lat: -22.41, lng: -47.56, geoFonte: 'gps_entrega' },
  });
  await new NucleoCadastroService(prisma).updateLocal(7, 'l1', { lat: null, lng: null });

  const upd = store.localUpdates.at(-1).data;
  assert.equal(upd.lat, null);
  assert.equal(upd.lng, null);
  assert.equal(upd.geoFonte, null, 'procedência sem ponto é mentira');
});

test('updateLocal com lat:null e lng numérico → o resultado não é pino: apaga os dois', async () => {
  const { prisma, store } = buildGeoMock({
    local: { ...LOCAL_BASE, lat: -22.41, lng: -47.56, geoFonte: 'geocode' },
  });
  await new NucleoCadastroService(prisma).updateLocal(7, 'l1', { lat: null, lng: -47.56 });

  const upd = store.localUpdates.at(-1).data;
  assert.equal(upd.lat, null);
  assert.equal(upd.lng, null, 'meio pino não existe');
  assert.equal(upd.geoFonte, null);
});

// ── (5) corpo SEM lat/lng não encosta no pino ────────────────────────────────
test('updateLocal sem lat/lng no corpo → NÃO mexe no pino nem na fonte', async () => {
  const { prisma, store } = buildGeoMock({
    local: { ...LOCAL_BASE, lat: -22.41, lng: -47.56, geoFonte: 'gps_entrega' },
  });
  await new NucleoCadastroService(prisma).updateLocal(7, 'l1', { apelido: 'Loja' });

  const upd = store.localUpdates.at(-1).data;
  assert.equal(upd.apelido, 'Loja');
  assert.equal('lat' in upd, false, 'campo ausente NUNCA apaga pino de ouro');
  assert.equal('lng' in upd, false);
  assert.equal('geoFonte' in upd, false);
});

// ── a PORTA também pede pino ao servidor ─────────────────────────────────────
test('createLocal sem coordenada → pergunta ao servidor e grava o pino provado', async () => {
  const { prisma, store } = buildGeoMock({ perfil: { ...PERFIL_BASE } });
  const svc = new NucleoCadastroService(prisma);
  const pedidos: any[] = [];
  (svc as any).maybeResolveServerGeo = async (input: any, existing: any) => {
    pedidos.push({ input, existing });
    return { lat: -22.4, lng: -47.5, geoFonte: 'cnefe' };
  };

  await svc.createLocal(7, 'c1', { endereco: 'Rua M-7', numero: '897', cep: '13500000', uf: 'SP' });

  assert.equal(pedidos.length, 1, 'a porta passou a pedir pino (antes só o perfil pedia)');
  assert.equal(pedidos[0].existing, null, 'no create não há registro anterior');
  const criado = store.localCreates.at(-1);
  assert.equal(criado.lat, -22.4);
  assert.equal(criado.geoFonte, 'cnefe');
});

test('createLocal COM coordenada do navegador → não pergunta nada ao servidor', async () => {
  const { prisma, store } = buildGeoMock({ perfil: { ...PERFIL_BASE } });
  const svc = new NucleoCadastroService(prisma);
  let perguntou = false;
  (svc as any).maybeResolveServerGeo = async () => {
    perguntou = true;
    return { lat: 0, lng: 0, geoFonte: 'cnefe' };
  };

  await svc.createLocal(7, 'c1', {
    endereco: 'Rua M-7', numero: '897', cep: '13500000', uf: 'SP',
    lat: -22.41, lng: -47.56, geoFonte: 'gps_cadastro', gpsAccuracy: 8,
  });

  assert.equal(perguntou, false);
  assert.equal(store.localCreates.at(-1).lat, -22.41);
  assert.equal(store.localCreates.at(-1).geoFonte, 'gps_cadastro');
});

test('updateLocal: apagar o pino abre caminho pro servidor provar o do endereço NOVO', async () => {
  const { prisma, store } = buildGeoMock({
    local: { ...LOCAL_BASE, lat: -22.39, lng: -47.55, geoFonte: 'geocode' },
  });
  const svc = new NucleoCadastroService(prisma);
  const pedidos: any[] = [];
  (svc as any).maybeResolveServerGeo = async (input: any, existing: any) => {
    pedidos.push({ input, existing });
    return { lat: -22.41, lng: -47.56, geoFonte: 'cnefe' };
  };

  await svc.updateLocal(7, 'l1', { lat: null, lng: null });

  assert.equal(pedidos.length, 1);
  assert.equal(pedidos[0].existing.lat, null, 'o servidor julga o registro RESULTANTE, sem o pino velho');
  assert.equal(pedidos[0].existing.geoFonte, 'geocode', 'mas a procedência SALVA vai junto — é ela que blinda gps_cadastro');
  const upd = store.localUpdates.at(-1).data;
  assert.equal(upd.lat, -22.41);
  assert.equal(upd.geoFonte, 'cnefe');
});

test('updateLocal com pino intacto → o servidor nem é consultado', async () => {
  const { prisma } = buildGeoMock({
    local: { ...LOCAL_BASE, lat: -22.41, lng: -47.56, geoFonte: 'gps_entrega' },
  });
  const svc = new NucleoCadastroService(prisma);
  let perguntou = false;
  (svc as any).maybeResolveServerGeo = async () => {
    perguntou = true;
    return null;
  };

  await svc.updateLocal(7, 'l1', { apelido: 'Casa' });
  assert.equal(perguntou, false, 'já tem pino: não há o que resolver');
});
