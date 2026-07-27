import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

import { alvoCuraCnefe, LogisticaConferenciaService } from './logistica-conferencia.service';
import { limparCacheBuscaCep, limparCacheCep } from './logistica-cep.util';
import { __setCnefeQueryForTests } from '../nucleo/cnefe-resolver.util';
import { LogisticaRouteBillingService } from './logistica-route-billing.service';
import { haversineKm, type Coord } from './logistica-rota.service';

/**
 * S3 (25/07, PR25072026-ROTA-CONFERIDA) — prova a fiação do SERVIÇO (mock de Prisma +
 * OSRM determinístico, ZERO rede real — a suite não pode nunca tentar
 * `router.project-osrm.org` de verdade) e, principalmente, o TESTE-INVARIANTE da Lei
 * nº3: conferir é DRY-RUN ABSOLUTO — nenhum `update`/`updateMany` em Entrega, nenhuma
 * chamada a `LogisticaRouteBillingService.prepareRoute`.
 *
 * Fixture: 4 "entregas" abertas (estilo empresa 41) — cli-1/cli-2/cli-3 num cluster
 * apertado (~150-300m entre si), cli-4 isolada a dezenas de km (fora do casulo):
 *   e1 (cli-1): fonte provada, JÁ entregue antes, histórico de GPS bate com o pino atual.
 *   e2 (cli-2): fonte provada (LOCAL), JÁ entregue antes, mas o histórico de GPS
 *               diverge >300m do pino atual → diverge_gps_ouro.
 *   e3 (cli-3): fonte provada, NUNCA teve entrega concluída → nunca_entregue.
 *   e4 (cli-4): isolada, fora do casulo do dia.
 */

const ROWS = [
  {
    id: 'e1',
    status: 'agendada',
    rotaOrdem: null,
    customerProfileId: 'cli-1',
    localId: null,
    local: null,
    customerProfile: { name: 'Maria', lat: -22.400, lng: -47.550, geoFonte: 'gps_entrega' },
  },
  {
    id: 'e2',
    status: 'agendada',
    rotaOrdem: null,
    customerProfileId: 'cli-2',
    localId: 'loc-2',
    local: { apelido: 'Casa', lat: -22.401, lng: -47.551, geoFonte: 'gps_entrega' },
    customerProfile: { name: 'João', lat: -22.9, lng: -47.9, geoFonte: 'geocode' }, // ofuscado pelo local
  },
  {
    id: 'e3',
    status: 'em_rota',
    rotaOrdem: null,
    customerProfileId: 'cli-3',
    localId: null,
    local: null,
    customerProfile: { name: 'Pedro', lat: -22.402, lng: -47.552, geoFonte: 'gps_entrega' },
  },
  {
    id: 'e4',
    status: 'agendada',
    rotaOrdem: null,
    customerProfileId: 'cli-4',
    localId: null,
    local: null,
    customerProfile: { name: 'Ana', lat: -22.700, lng: -47.900, geoFonte: 'gps_entrega' },
  },
];

// groupBy: quantas 'entregue' cada (cliente, local) já teve. cli-3 fica de FORA de
// propósito (nunca entregue).
const ENTREGUES_CONCLUIDAS = [
  { customerProfileId: 'cli-1', localId: null },
  { customerProfileId: 'cli-1', localId: null },
  { customerProfileId: 'cli-2', localId: 'loc-2' },
  { customerProfileId: 'cli-4', localId: null },
];

// $queryRaw (DISTINCT ON): última entrega CONCLUÍDA por (cliente, local). cli-1/cli-4
// batem com o pino atual (divergência 0); cli-2 diverge ~1.4km (>300m); cli-3 não
// aparece (consistente com nunca ter sido entregue).
const HISTORICO = [
  { customerProfileId: 'cli-1', localId: null, deliveredLat: -22.400, deliveredLng: -47.550 },
  { customerProfileId: 'cli-2', localId: 'loc-2', deliveredLat: -22.410, deliveredLng: -47.561 },
  { customerProfileId: 'cli-4', localId: null, deliveredLat: -22.700, deliveredLng: -47.900 },
];

function buildPrismaMock() {
  return {
    entrega: {
      findMany: async () => ROWS,
      groupBy: async (args: any) => {
        const ids: string[] = args?.where?.customerProfileId?.in ?? [];
        const counts = new Map<string, number>();
        for (const e of ENTREGUES_CONCLUIDAS) {
          if (!ids.includes(e.customerProfileId)) continue;
          const key = `${e.customerProfileId}|${e.localId ?? ''}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        return [...counts.entries()].map(([key, count]) => {
          const [customerProfileId, localIdRaw] = key.split('|');
          return { customerProfileId, localId: localIdRaw || null, _count: { _all: count } };
        });
      },
      // Espiões-guarda (mesmo padrão de logistica-rota-encerrar.service.test.ts,
      // `financeiroChargeGuard`): se o serviço algum dia tentar gravar, o teste
      // quebra na hora com uma mensagem que aponta a Lei violada — não é só um
      // contador silencioso.
      update: async () => {
        throw new Error('LEI Nº3 VIOLADA: conferir NUNCA pode chamar entrega.update');
      },
      updateMany: async () => {
        throw new Error('LEI Nº3 VIOLADA: conferir NUNCA pode chamar entrega.updateMany');
      },
    },
    // Ignora a query SQL de verdade (Prisma.sql) — devolve o histórico fabricado.
    // Suficiente pra provar a PLUMAGEM (o service usa o resultado corretamente);
    // a query em si é só SQL parametrizado, não tem lógica pra testar aqui.
    $queryRaw: async () => HISTORICO,
  };
}

const configMock = { getConfig: async () => ({ velocidadeMediaKmH: 25, tempoParadaMin: 5 }) } as any;

/**
 * OSRM FALSO determinístico — nunca bate na rede real. Constrói uma matriz de
 * distância/duração AUTOCONSISTENTE via Haversine entre os pontos recebidos (mesma
 * fórmula pura já testada em logistica-rota.service.test.ts), então
 * `planRouteByRoads` sempre resolve no DEGRAU 1 (engine='osrm') sem jamais tentar o
 * degrau 2 (fetch ao `router.project-osrm.org`) — exigência dura do contrato do
 * worker: zero teste ao vivo, zero rede externa.
 */
function buildFakeOsrm() {
  return {
    table: async (_companyId: number, coordsRaw: string) => {
      const pontos: Coord[] = coordsRaw.split(';').map((par) => {
        const [lng, lat] = par.split(',').map(Number);
        return { lat, lng };
      });
      const n = pontos.length;
      const distances: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
      const durations: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const distM = haversineKm(pontos[i], pontos[j]) * 1000;
          distances[i][j] = distM;
          durations[i][j] = distM / (25_000 / 3600); // 25km/h constante — só p/ ser determinístico
        }
      }
      return { code: 'Ok', distances, durations };
    },
  };
}

test('Lei nº3 (invariante) — conferir NUNCA grava rotaOrdem/etaAt nem chama billing (dry-run absoluto)', async () => {
  const service = new LogisticaConferenciaService(buildPrismaMock() as any, configMock, buildFakeOsrm() as any);
  const spy = mock.method(LogisticaRouteBillingService.prototype, 'prepareRoute', async () => {
    throw new Error('LEI Nº3 VIOLADA: conferir chamou LogisticaRouteBillingService.prepareRoute');
  });
  try {
    const resultado = await service.conferir(41, { date: '2026-07-25' });
    // Se update/updateMany tivessem sido chamados, a Promise acima já teria rejeitado
    // (guard lança) — chegar aqui já é metade da prova. A outra metade é o spy:
    assert.equal(resultado.total, ROWS.length);
    assert.equal(spy.mock.callCount(), 0, 'prepareRoute/billing NUNCA deve ser chamado por conferir');
  } finally {
    spy.mock.restore();
  }
});

test('composição: engine=osrm (degrau 1 via proxy fake), contagens batem e nunca_entregue vem do groupBy', async () => {
  const service = new LogisticaConferenciaService(buildPrismaMock() as any, configMock, buildFakeOsrm() as any);
  const resultado = await service.conferir(41, { date: '2026-07-25' });

  assert.equal(resultado.engine, 'osrm');
  assert.equal(resultado.degradedReason, null);
  assert.equal(resultado.total, 4);
  assert.equal(resultado.verdes + resultado.vermelhas, resultado.total, 'só 2 cores desde 26/07 — amarelo morreu');
  assert.equal(resultado.comAviso, resultado.vermelhas, 'comAviso conta quem tem motivo IMPEDITIVO');

  const e3 = resultado.paradas.find((p) => p.id === 'e3')!;
  assert.ok(e3.motivos.includes('nunca_entregue'), 'cli-3 está ausente do groupBy de entregues → nunca_entregue');
  assert.equal(e3.semaforo, 'verde', 'nunca_entregue é informativo: não pinta e não aparece');
  assert.deepEqual(e3.motivosVisiveis, []);

  const e4 = resultado.paradas.find((p) => p.id === 'e4')!;
  assert.equal(e4.semaforo, 'vermelho');
  assert.ok(e4.motivos.includes('fora_do_casulo'), 'cli-4 está a dezenas de km do cluster do dia');
  // e4 está isolada: fora do casulo E com a perna gigante até ela. Os dois são
  // impeditivos e saem na ORDEM DE GRAVIDADE (casulo antes de perna), não na de apuração.
  assert.deepEqual(e4.motivosVisiveis, ['fora_do_casulo', 'perna_outlier']);
});

test('diverge_gps_ouro: DISTINCT ON traz o histórico de cli-2 divergindo ~1.4km do pino atual → vermelho', async () => {
  const service = new LogisticaConferenciaService(buildPrismaMock() as any, configMock, buildFakeOsrm() as any);
  const resultado = await service.conferir(41, { date: '2026-07-25' });

  const e2 = resultado.paradas.find((p) => p.id === 'e2')!;
  assert.ok(e2.motivos.includes('diverge_gps_ouro'));
  assert.equal(e2.semaforo, 'vermelho');

  // e1: histórico bate com o pino atual (divergência 0) → não deveria acusar.
  const e1 = resultado.paradas.find((p) => p.id === 'e1')!;
  assert.ok(!e1.motivos.includes('diverge_gps_ouro'));
});

/**
 * S5 (25/07, PR25072026-ROTA-CONFERIDA) — furo achado pela própria S4: uma rota com
 * ordem manual ativa (aprovada na conferência) precisa ser AUDITADA nessa mesma ordem,
 * não na ordem que o motor automático (NN+2-opt/OSRM) escolheria. `ordemManual` embaralha
 * de propósito a ordem geográfica natural (e4 isolada vem PRIMEIRO) — se o service
 * ignorasse o parâmetro e caísse no planRouteByRoads de sempre, a asserção de ORDEM abaixo
 * quebraria (e1/e2/e3 sempre venceriam e4 no cluster/NN).
 */
test('ordemManual: conferir pula NN/2-opt/OSRM e roda planRouteManual (mesmo desvio do planejar)', async () => {
  const osrm = buildFakeOsrm();
  const tableSpy = mock.method(osrm, 'table');
  const service = new LogisticaConferenciaService(buildPrismaMock() as any, configMock, osrm as any);
  const ordemManual = ['e4', 'e1', 'e3', 'e2'];

  const resultado = await service.conferir(41, { date: '2026-07-25', ordemManual });

  assert.equal(tableSpy.mock.callCount(), 0, 'ordemManual não deve nem tentar a matriz OSRM (nem proxy nem público)');
  assert.equal(resultado.engine, 'haversine', 'ordem manual é Haversine por ESCOLHA do entregador, não falha de rede');
  assert.equal(resultado.degradedReason, null, 'ordem manual nunca preenche degradedReason (planRouteManual não é degradação)');
  assert.deepEqual(resultado.paradas.map((p) => p.id), ordemManual, 'a ordem devolvida é EXATAMENTE a ordem manual dada, não a geográfica');

  // O semáforo (motivos) continua rodando por cima da ordem manual normalmente —
  // e4 segue vermelha (fora_do_casulo não depende de QUEM ordenou, só da distância).
  const e4 = resultado.paradas.find((p) => p.id === 'e4')!;
  assert.equal(e4.semaforo, 'vermelho');
});

/**
 * 26/07 (ordem do dono) — fiação da checagem CEP × ENDEREÇO. Dois pontos que só o
 * SERVIÇO pode errar (o util puro não tem como):
 *  1. o endereço tem que sair da MESMA fonte que deu o pino (local, quando o local tem
 *     coordenada) — nunca o CEP de um com a rua do outro;
 *  2. veredito 'nao_bate' vira `cep_endereco_divergente` visível e pinta a parada.
 * `fetch` global trocado por dublê: ZERO rede.
 */
test('CEP × endereço: usa o endereço da MESMA fonte do pino e o divergente vira aviso visível', async () => {
  const ROWS_CEP = [
    {
      // Local COM coordenada → fonte = LOCAL. O CEP do local (13990000/Pinhal) bate com o
      // endereço do local; o perfil carrega um CEP de OUTRA cidade de propósito — se o
      // serviço misturasse as fontes, esta parada acusaria divergência à toa.
      id: 'c1',
      status: 'agendada',
      rotaOrdem: null,
      customerProfileId: 'cli-1',
      localId: 'loc-1',
      local: {
        apelido: 'Casa', lat: -22.4, lng: -47.55, geoFonte: 'gps_entrega',
        cep: '13990000', endereco: 'Rua das Flores', numero: '10', bairro: null, cidade: 'Pinhal', uf: 'SP',
      },
      customerProfile: {
        name: 'Maria', lat: -22.9, lng: -47.9, geoFonte: 'geocode',
        cep: '99999999', endereco: 'Avenida Brasil', numero: '1', bairro: null, cidade: 'Outra Cidade', uf: 'MG',
      },
    },
    {
      // Sem local → fonte = PERFIL, e o CEP dele aponta pra outra UF → nao_bate.
      id: 'c2',
      status: 'agendada',
      rotaOrdem: null,
      customerProfileId: 'cli-2',
      localId: null,
      local: null,
      customerProfile: {
        name: 'João', lat: -22.401, lng: -47.551, geoFonte: 'gps_entrega',
        cep: '99999999', endereco: 'Rua das Flores', numero: '20', bairro: null, cidade: 'Pinhal', uf: 'SP',
      },
    },
    {
      // CEP bate, mas o endereço não tem número em lugar nenhum (nem coluna, nem texto).
      id: 'c3',
      status: 'agendada',
      rotaOrdem: null,
      customerProfileId: 'cli-3',
      localId: null,
      local: null,
      customerProfile: {
        name: 'Ana', lat: -22.402, lng: -47.552, geoFonte: 'gps_entrega',
        cep: '13990000', endereco: 'Rua das Flores', numero: null, bairro: null, cidade: 'Pinhal', uf: 'SP',
      },
    },
  ];
  const prisma = {
    ...buildPrismaMock(),
    entrega: { ...buildPrismaMock().entrega, findMany: async () => ROWS_CEP },
    $queryRaw: async () => [],
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: any) => {
    const cep = String(input).replace(/\D+/g, '').slice(-8);
    const payload =
      cep === '13990000'
        ? { cep, logradouro: 'Rua das Flores', localidade: 'Pinhal', uf: 'SP' }
        : { cep, logradouro: 'Rua Outra', localidade: 'Cidade Distante', uf: 'MG' };
    return { ok: true, json: async () => payload } as any;
  }) as any;
  try {
    limparCacheCep();
    const service = new LogisticaConferenciaService(prisma as any, configMock, buildFakeOsrm() as any);
    const resultado = await service.conferir(41, { date: '2026-07-25' });

    const c1 = resultado.paradas.find((p) => p.id === 'c1')!;
    assert.ok(!c1.motivos.includes('cep_endereco_divergente'), 'endereço e CEP vieram os DOIS do local — não diverge');
    assert.equal(c1.semaforo, 'verde');

    const c2 = resultado.paradas.find((p) => p.id === 'c2')!;
    assert.ok(c2.motivos.includes('cep_endereco_divergente'));
    assert.deepEqual(c2.motivosVisiveis, ['cep_endereco_divergente'], 'é impeditivo: o motorista VÊ');
    assert.equal(c2.semaforo, 'vermelho');

    const c3 = resultado.paradas.find((p) => p.id === 'c3')!;
    assert.deepEqual(c3.motivosVisiveis, ['endereco_sem_numero'], 'CEP bate, mas falta o número da porta');
    assert.equal(c3.semaforo, 'vermelho');

    assert.equal(resultado.comAviso, 2);
    assert.equal(resultado.verdes, 1);
  } finally {
    globalThis.fetch = originalFetch;
    limparCacheCep();
  }
});

/**
 * R9 (27/07, frente APK-rota) — CURA DO PINO via base CNEFE: parada sem coordenada em
 * NENHUMA fonte mas com CEP+número resolve sozinha ("Não sei onde fica este endereço"
 * só sobra quando nem o CEP resolve). É a ÚNICA escrita permitida do conferir, e é de
 * CADASTRO (LocalEntrega/CustomerProfile) — os espiões-guarda da Lei nº3 (Entrega/
 * billing) continuam armados neste mesmo teste e NÃO podem disparar.
 */
test('cura CNEFE: sem_pino com CEP+número vira pino gravado (fonte cnefe) e a parada sai do vermelho', async () => {
  const ROWS_CURA = [
    {
      // Elegível via PERFIL: sem coordenada em fonte nenhuma, CEP+número presentes.
      id: 'h1',
      status: 'agendada',
      rotaOrdem: null,
      customerProfileId: 'cli-h1',
      localId: null,
      local: null,
      customerProfile: {
        name: 'Rita', lat: null, lng: null, geoFonte: null,
        cep: '13990000', endereco: 'Rua das Flores', numero: '10', bairro: null, cidade: 'Pinhal', uf: 'SP',
      },
    },
    {
      // Elegível via LOCAL (endereço mora no local pós-multilocal): grava NO LOCAL.
      id: 'h2',
      status: 'agendada',
      rotaOrdem: null,
      customerProfileId: 'cli-h2',
      localId: 'loc-h2',
      local: {
        apelido: 'Casa', lat: null, lng: null, geoFonte: null,
        cep: '13990000', endereco: 'Rua das Flores', numero: '22', bairro: null, cidade: 'Pinhal', uf: 'SP',
      },
      customerProfile: { name: 'Beto', lat: null, lng: null, geoFonte: null, cep: null, endereco: null, numero: null, bairro: null, cidade: null, uf: null },
    },
    {
      // NÃO elegível: sem número em lugar nenhum — continua sem_pino (honesto).
      id: 'h3',
      status: 'agendada',
      rotaOrdem: null,
      customerProfileId: 'cli-h3',
      localId: null,
      local: null,
      customerProfile: {
        name: 'Sem Numero', lat: null, lng: null, geoFonte: null,
        cep: '13990000', endereco: 'Rua das Flores', numero: null, bairro: null, cidade: 'Pinhal', uf: 'SP',
      },
    },
  ];
  const gravadas: Array<{ tabela: string; where: any; data: any }> = [];
  const prisma = {
    ...buildPrismaMock(),
    entrega: { ...buildPrismaMock().entrega, findMany: async () => ROWS_CURA, groupBy: async () => [] },
    $queryRaw: async () => [],
    localEntrega: {
      updateMany: async (args: any) => { gravadas.push({ tabela: 'localEntrega', where: args.where, data: args.data }); return { count: 1 }; },
    },
    customerProfile: {
      updateMany: async (args: any) => { gravadas.push({ tabela: 'customerProfile', where: args.where, data: args.data }); return { count: 1 }; },
    },
  };
  __setCnefeQueryForTests(async (sql: string, params: unknown[]) => {
    if (sql.includes('FROM cnefe_uf')) return [{ status: 'carregada' }];
    if (sql.includes('cep = $1 AND numero = $2')) {
      const numero = Number(params[1]);
      return [{ logradouro: 'Rua das Flores', numero, lat: -22.41 - numero / 100000, lng: -47.56, nivel_geo: 1, municipio: 'Pinhal' }];
    }
    return [];
  });
  const originalFetch = globalThis.fetch;
  // ViaCEP dublê coerente (CEP bate) — zero rede real.
  globalThis.fetch = (async () => ({ ok: true, json: async () => ({ cep: '13990000', logradouro: 'Rua das Flores', localidade: 'Pinhal', uf: 'SP' }) })) as any;
  try {
    limparCacheCep();
    const service = new LogisticaConferenciaService(prisma as any, configMock, buildFakeOsrm() as any);
    const resultado = await service.conferir(41, { date: '2026-07-27' });

    const h1 = resultado.paradas.find((p) => p.id === 'h1')!;
    assert.ok(!h1.motivos.includes('sem_pino'), 'h1 resolveu pela base CNEFE nesta MESMA conferência');
    assert.ok(typeof h1.lat === 'number' && Number.isFinite(h1.lat));

    const h2 = resultado.paradas.find((p) => p.id === 'h2')!;
    assert.ok(!h2.motivos.includes('sem_pino'));

    const h3 = resultado.paradas.find((p) => p.id === 'h3')!;
    assert.ok(h3.motivos.includes('sem_pino'), 'sem número não cura — pendência honesta fica');

    const noLocal = gravadas.find((g) => g.tabela === 'localEntrega');
    assert.ok(noLocal, 'endereço que mora no LOCAL grava no local');
    assert.equal(noLocal!.where.id, 'loc-h2');
    assert.equal(noLocal!.where.lat, null, 'só grava quem AINDA não tem pino (nunca sobrescreve)');
    assert.equal(noLocal!.data.geoFonte, 'cnefe');

    const noPerfil = gravadas.find((g) => g.tabela === 'customerProfile');
    assert.ok(noPerfil, 'endereço que mora no PERFIL grava no perfil');
    assert.equal(noPerfil!.where.id, 'cli-h1');
    assert.equal(noPerfil!.data.geoFonte, 'cnefe');
    assert.equal(gravadas.length, 2, 'h3 não gera escrita nenhuma');
  } finally {
    globalThis.fetch = originalFetch;
    limparCacheCep();
    __setCnefeQueryForTests(null);
  }
});

/**
 * 27/07 (ordem do dono, "sanitização funcional") — O CASO QUE ABRIU A MUDANÇA: cliente
 * SEM CEP com endereço perfeito. Antes caía em "Sem CEP e número" e ficava vermelho pra
 * sempre; agora o CEP se descobre pela rua (ViaCEP busca reversa), o CNEFE prova a porta
 * e o CEP descoberto AINDA é gravado no cadastro — o furo some, não volta na próxima rota.
 */
test('cura sem CEP: endereço perfeito acha o CEP pela rua, cura o pino e GRAVA o CEP no cadastro', async () => {
  const ROWS_SEM_CEP = [
    {
      id: 's1',
      status: 'agendada',
      rotaOrdem: null,
      customerProfileId: 'cli-s1',
      localId: null,
      local: null,
      customerProfile: {
        name: 'Dona Sem Cep', lat: null, lng: null, geoFonte: null,
        cep: null, endereco: 'Rua das Flores', numero: '350', bairro: null, cidade: 'Pinhal', uf: 'SP',
      },
    },
    {
      // Rua de OUTRA cidade na resposta do ViaCEP não pode virar CEP deste cadastro:
      // sem cidade no cadastro não há busca nenhuma (fail-closed).
      id: 's2',
      status: 'agendada',
      rotaOrdem: null,
      customerProfileId: 'cli-s2',
      localId: null,
      local: null,
      customerProfile: {
        name: 'Sem Cidade', lat: null, lng: null, geoFonte: null,
        cep: null, endereco: 'Rua das Flores', numero: '12', bairro: null, cidade: null, uf: 'SP',
      },
    },
  ];
  const gravadas: Array<{ tabela: string; where: any; data: any }> = [];
  const prisma = {
    ...buildPrismaMock(),
    entrega: { ...buildPrismaMock().entrega, findMany: async () => ROWS_SEM_CEP, groupBy: async () => [] },
    $queryRaw: async () => [],
    localEntrega: { updateMany: async () => ({ count: 0 }) },
    customerProfile: {
      updateMany: async (args: any) => { gravadas.push({ tabela: 'customerProfile', where: args.where, data: args.data }); return { count: 1 }; },
    },
  };
  const consultasCnefe: string[] = [];
  __setCnefeQueryForTests(async (sql: string, params: unknown[]) => {
    consultasCnefe.push(sql);
    if (sql.includes('FROM cnefe_uf')) return [{ status: 'carregada' }];
    // Consulta em LOTE (todos os trechos da rua de uma vez): só o CEP descoberto tem
    // porta — prova que quem resolveu foi a busca pela rua, numa ida só ao banco.
    if (sql.includes('cep IN (') && params.includes('13990100')) {
      return [{ cep: '13990100', logradouro: 'RUA DAS FLORES', numero: 350, lat: -22.415, lng: -47.561, nivel_geo: 1, municipio: 'Pinhal' }];
    }
    return [];
  });
  const urlsChamadas: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any) => {
    urlsChamadas.push(String(url));
    // Busca por rua: /ws/UF/cidade/logradouro/json/ → lista de ruas.
    return {
      ok: true,
      json: async () => [
        // Cidade DIFERENTE — tem que ser descartada mesmo vindo do ViaCEP.
        { cep: '13400-000', logradouro: 'Rua das Flores', localidade: 'Piracicaba', uf: 'SP' },
        { cep: '13990-100', logradouro: 'Rua das Flores', localidade: 'Pinhal', uf: 'SP' },
      ],
    };
  }) as any;
  try {
    limparCacheCep();
    limparCacheBuscaCep();
    const service = new LogisticaConferenciaService(prisma as any, configMock, buildFakeOsrm() as any);
    const resultado = await service.conferir(41, { date: '2026-07-27' });

    const s1 = resultado.paradas.find((p) => p.id === 's1')!;
    assert.ok(!s1.motivos.includes('sem_pino'), 'endereço perfeito sem CEP CURA — era o bug');
    assert.equal(s1.lat, -22.415);

    const s2 = resultado.paradas.find((p) => p.id === 's2')!;
    assert.ok(s2.motivos.includes('sem_pino'), 'sem cidade não há busca de rua — pendência honesta fica');

    const cepGravado = gravadas.find((g) => g.data.cep);
    assert.ok(cepGravado, 'o CEP descoberto entra no cadastro (o furo some de vez)');
    assert.equal(cepGravado!.data.cep, '13990100', 'grava o CEP da cidade CERTA, nunca o da outra');
    assert.deepEqual(cepGravado!.where.OR, [{ cep: null }, { cep: '' }], 'só preenche buraco: nunca troca CEP digitado pelo dono');

    const pinoGravado = gravadas.find((g) => g.data.geoFonte === 'cnefe');
    assert.ok(pinoGravado, 'pino curado gravado no perfil');
    assert.equal(pinoGravado!.where.id, 'cli-s1');
    assert.equal(pinoGravado!.where.lat, null, 'nunca sobrescreve pino existente');

    assert.equal(consultasCnefe.filter((q) => q.includes('cnefe_endereco')).length, 1, 'UMA consulta cobre todos os trechos da rua (nunca um laço por CEP)');
    assert.equal(urlsChamadas.length, 1, 's2 nem consulta (fail-closed antes da rede)');
    assert.ok(urlsChamadas[0].includes('/SP/'), `busca por rua, não por CEP: ${urlsChamadas[0]}`);
  } finally {
    globalThis.fetch = originalFetch;
    limparCacheCep();
    limparCacheBuscaCep();
    __setCnefeQueryForTests(null);
  }
});

test('alvoCuraCnefe (puro): elegibilidade e dono do endereço', () => {
  const semNada = alvoCuraCnefe({
    id: 'x', status: 'agendada', rotaOrdem: null, customerProfileId: 'c', localId: null, local: null,
    customerProfile: { name: 'X', lat: -22.4, lng: -47.5, geoFonte: 'gps_entrega' },
  } as any);
  assert.equal(semNada, null, 'quem já tem pino não é alvo');

  const legado = alvoCuraCnefe({
    id: 'x', status: 'agendada', rotaOrdem: null, customerProfileId: 'c', localId: null, local: null,
    customerProfile: { name: 'X', lat: null, lng: null, geoFonte: null, cep: '13.990-000', endereco: 'Rua das Flores, 77', numero: null, cidade: 'Pinhal', uf: 'SP' },
  } as any);
  assert.ok(legado, 'número dentro do texto legado ("Rua X, 77") vale');
  assert.equal(legado!.numero, 77);
  assert.equal(legado!.tipo, 'perfil');
  assert.equal(legado!.cep, '13990000');
});
