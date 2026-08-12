import test from 'node:test';
import assert from 'node:assert/strict';
import { LogisticaRotaService } from './logistica-rota.service';
import { ProspectorCorredorService } from './prospector-corredor.service';
import { tipoPorSlug } from './logistica-prospector-tipos';

/**
 * PROSPECTOR CNPJ — F1 do lado do SERVIDOR: o corredor ligado no INICIAR ROTA.
 * Plano: docs/PLANEJAMENTOS/PR07082026-PROSPECTOR-CNPJ.md (§0, §1, F0/F1).
 * PROSPECTOR v2 (12/08): a 5ª chave (a escolha da SEMANA, por PESSOA) e as DUAS
 * CORES (azul = ambiente mudo · verde = o tipo escolhido).
 *
 * O que se prova aqui é o que o iniciar-rota passou a decidir — e o que ele
 * JAMAIS pode deixar de fazer:
 *
 *  · AS 5 CHAVES, uma a uma: env global · prospectorAtivo do tenant · ATOR
 *    (admin sempre, funcionário só com prospectorEquipe) · A SEMANA DA PESSOA ·
 *    pino na região. Chave fechada = ZERO prospecto, sem erro, e o payload byte
 *    a byte o de hoje (a chave `prospector` nem existe).
 *  · AS DUAS CORES: `escolhida` sai do CÓDIGO do CNAE contra o tipo da semana, e
 *    `aceso` NUNCA cai em quem não é escolhida — azul é ambiente, e ambiente não
 *    fala.
 *  · ENFEITE NÃO DERRUBA ROTA: corredor quebrado (banco no chão), tabela
 *    ausente, exceção crua — a rota inicia IGUAL, e o alarme sai no log. A
 *    lição do CNEFE é essa: best-effort MUDO desligou 23M endereços por 5
 *    dias sem ninguém ver.
 *  · MULTI-TENANT: a company da rota é a company da consulta, sempre.
 *  · O DIA É O DE SÃO PAULO (`rotaDia`), nunca o UTC do container.
 *  · LEI DO VENDEDOR: telefone e porte NÃO viajam pro motorista.
 *  · NÃO DEBITA NADA (o crédito é da F2, no clique).
 *
 * Sem banco de propósito: o Postgres do corredor já foi medido em produção
 * (prospector-corredor.service.test.ts prova a SQL). Aqui a prova é a LIGAÇÃO.
 */

// ---------------------------------------------------------------------------
// Bancada: iniciar-rota inteiro com dublês. `ordemManual` de propósito — é o
// caminho PURO do planejador (planRouteManual), sem OSRM e sem rede.
// ---------------------------------------------------------------------------

type CenarioBancada = {
  companyId?: number;
  /** Config do tenant. `null` = empresa sem linha de LogisticaConfig. */
  config?: Record<string, unknown> | null;
  /** Erro na leitura da config (ex.: migration pendente = coluna inexistente). */
  erroConfig?: any;
  /** Dublê do corredor. Ausente = serviço não injetado. */
  prospector?: any;
  /**
   * Dublê da ESCOLHA DA SEMANA (chave nº4). `undefined` = a bancada injeta o
   * padrão (a pessoa escolheu "salao", que é o ramo da EMPRESA_SALAO); `null` =
   * serviço NÃO injetado, que tem que fechar o gate igual a "não escolheu".
   */
  semana?: any;
};

const PARADAS_RIO_CLARO = [
  { id: 'd1', lat: -22.4260477, lng: -47.578631, nome: 'Cliente A' },
  { id: 'd2', lat: -22.4139, lng: -47.5612, nome: 'Cliente B' },
  { id: 'd3', lat: -22.3768057, lng: -47.5788828, nome: 'Cliente C' },
];

function bancada(cenario: CenarioBancada = {}) {
  const companyId = cenario.companyId ?? 39;
  const logs: Array<{ nivel: string; msg: string }> = [];
  const configReads: Array<{ companyId: unknown; campos: string[] }> = [];

  const entregas = PARADAS_RIO_CLARO.map((p) => ({
    id: p.id,
    entregadorId: 7,
    status: 'agendada',
    rotaOrdem: null,
    scheduledAt: new Date('2026-08-07T12:00:00.000Z'),
    local: null,
    customerProfile: { name: p.nome, lat: p.lat, lng: p.lng },
  }));

  const prisma: any = {
    logisticaConfig: {
      findUnique: async (args: any) => {
        const campos = Object.keys(args?.select || {});
        // O planejador pede velocidade/tempo de parada; o prospector pede as
        // 2 chaves + as 2 réguas. Mesma porta, seleções diferentes.
        if (campos.includes('velocidadeMediaKmH')) return { velocidadeMediaKmH: 25, tempoParadaMin: 5 };
        configReads.push({ companyId: args?.where?.companyId, campos });
        if (cenario.erroConfig) throw cenario.erroConfig;
        return cenario.config === undefined ? null : cenario.config;
      },
    },
    entrega: {
      findMany: async () => entregas,
      // piso da numeração (maiorOrdemFechadaDoDia): bancada sem nada fechado,
      // então o piso é 0 e a régua segue 0..N-1 como sempre foi.
      aggregate: async () => ({ _max: { rotaOrdem: null } }),
      updateMany: async (args: any) => {
        const alvo = entregas.find((e) => e.id === args?.where?.id);
        if (alvo && args?.data?.status) Object.assign(alvo, args.data);
        return { count: 1 };
      },
    },
  };

  // ROTA v2 (10/08) — iniciarRota agora gerencia LogisticaRoute/Stop direto
  // (garantirLogisticaRoute/congelarStops, sem a máquina de billing velha).
  // Dublê MÍNIMO em memória: 1 rota nasce PLANNED, os stops congelam, o lock
  // (`$executeRawUnsafe`) e a transação (`$transaction`) são no-op síncronos.
  const routes: any[] = [];
  const stops: any[] = [];
  let routeSeq = 0;
  let stopSeq = 0;
  prisma.logisticaRoute = {
    updateMany: async () => ({ count: 0 }),
    findFirst: async ({ where }: any) => routes.find((r) => {
      if (r.companyId !== where.companyId) return false;
      if (where.id !== undefined) return r.id === where.id;
      return r.entregadorId === where.entregadorId && r.routeDate === where.routeDate;
    }) || null,
    create: async ({ data }: any) => {
      const row = { id: `route-${++routeSeq}`, createdAt: new Date(), operationalEndedAt: null, ...data };
      routes.push(row);
      return row;
    },
  };
  prisma.logisticaRouteStop = {
    findMany: async ({ where }: any) => stops.filter((s) => where.deliveryId?.in?.includes(s.deliveryId)),
    aggregate: async ({ where }: any) => ({
      _max: { snapshotOrder: Math.max(-1, ...stops.filter((s) => s.routeId === where.routeId).map((s) => s.snapshotOrder)) },
    }),
    create: async ({ data }: any) => {
      const row = { id: `stop-${++stopSeq}`, billingExempt: false, ...data };
      stops.push(row);
      return row;
    },
  };
  prisma.$executeRawUnsafe = async () => 0;
  prisma.$transaction = async (callback: any) => callback(prisma);

  const cobranca: any = {
    garantirDiaPago: async () => undefined,
    assertAssentoDoDia: async () => undefined,
    garantirPasseDoDia: async () => undefined,
  };

  const semana = cenario.semana === undefined ? semanaDuble().servico : cenario.semana ?? undefined;
  const rota = new LogisticaRotaService(
    prisma,
    cobranca,
    undefined, // tracking
    undefined, // osrm
    undefined, // cargaEstoque (B4)
    cenario.prospector,
    semana, // PROSPECTOR v2 — a escolha da semana (chave nº4)
  );
  (rota as any).logger = {
    log: (m: string) => logs.push({ nivel: 'log', msg: String(m) }),
    warn: (m: string) => logs.push({ nivel: 'warn', msg: String(m) }),
    error: (m: string) => logs.push({ nivel: 'error', msg: String(m) }),
    debug: () => {},
  };

  /* ⚠️ `date` NÃO tem valor padrão de propósito (achado em 08/08). Tinha:
     `date = '2026-08-07'`. Como default de parâmetro do JS também vale pra
     `undefined`, o teste do "sem data no pedido" passava a data de ontem e
     NUNCA exercitou o caminho que ele diz provar — ficou verde por um dia e
     quebrou sozinho na virada da meia-noite. É a armadilha "teste verde no meu
     fuso": quem quer omitir a data passa `null`, e omitir é omitir mesmo. */
  const iniciar = (actor?: any, date: string | null = '2026-08-07') =>
    rota.iniciarRota(
      companyId,
      { date: date ?? undefined, deliveryIds: PARADAS_RIO_CLARO.map((p) => p.id), ordemManual: PARADAS_RIO_CLARO.map((p) => p.id) },
      7,
      7,
      false,
      actor,
    );

  return { rota, iniciar, logs, configReads, companyId };
}

/**
 * Dublê da ESCOLHA DA SEMANA. Registra QUEM perguntou (a escolha é por PESSOA, e a
 * prova disso é o `userId` chegando aqui) e devolve o tipo curado do slug — ou null,
 * que é "essa pessoa não escolheu nada nesta semana".
 */
function semanaDuble(slug: string | null = 'salao') {
  const chamadas: Array<{ companyId: unknown; userId: unknown }> = [];
  return {
    chamadas,
    servico: {
      escolhaVigente: async (companyId: unknown, userId: unknown) => {
        chamadas.push({ companyId, userId });
        // FIEL AO SERVIÇO DE VERDADE: sem ator identificado não há de quem ler a
        // escolha. Dublê mais frouxo que o original é dublê que esconde defeito.
        if (!Number(userId)) return null;
        return slug ? tipoPorSlug(slug) : null;
      },
    } as any,
  };
}

/** Dublê do corredor que registra as chamadas e devolve o que o teste mandar. */
function corredorDuble(resposta: any = {}, aoChamar?: (args: any) => void) {
  const chamadas: any[] = [];
  return {
    chamadas,
    servico: {
      embarcar: async (companyId: number, paradas: any[], opts: any) => {
        const args = { companyId, paradas, opts };
        chamadas.push(args);
        if (aoChamar) aoChamar(args);
        return {
          rotaDia: '2026-08-07',
          raioM: 150,
          maxDia: 4,
          acendeNoDia: 4,
          prospectos: [],
          ok: true,
          somenteMemoria: false,
          ...resposta,
        };
      },
    } as any,
  };
}

const EMPRESA_SALAO = {
  cnpj: '11111111000191',
  nome: 'Salão Bela Vista',
  cnae: '9602501',
  cnaeDescricao: 'Cabeleireiros, manicure e pedicure',
  porte: 'MICRO EMPRESA',
  phoneDigits: '551933334444',
  lat: -22.4261,
  lng: -47.5787,
  distM: 42,
  afinidade: true,
};

const CONFIG_LIGADA = {
  prospectorAtivo: true,
  prospectorEquipe: false,
  prospectorRaioM: 150,
  prospectorMaxDia: 4,
};

const ADMIN = { id: 7, role: 'USERMASTER', isSystemMaster: false, canViewBilling: true };
const GERENTE = { id: 8, role: 'ADMIN', isSystemMaster: false, canViewBilling: false };
const FUNCIONARIO = { id: 9, role: 'USER', isSystemMaster: false, canViewBilling: false };

/** Liga/desliga a env global só durante o teste (nunca vaza pro processo). */
async function comEnv(valor: string | undefined, callback: () => Promise<void>) {
  const antes = process.env.HBX_PROSPECTOR_ENABLED;
  if (valor === undefined) delete process.env.HBX_PROSPECTOR_ENABLED;
  else process.env.HBX_PROSPECTOR_ENABLED = valor;
  try {
    await callback();
  } finally {
    if (antes === undefined) delete process.env.HBX_PROSPECTOR_ENABLED;
    else process.env.HBX_PROSPECTOR_ENABLED = antes;
  }
}

// ---------------------------------------------------------------------------
// CHAVE 1 — a env global
// ---------------------------------------------------------------------------

test('CHAVE 1 (env global OFF): a rota inicia igual, sem consultar nada e sem o campo novo', async () => {
  await comEnv(undefined, async () => {
    const corredor = corredorDuble();
    const b = bancada({ config: CONFIG_LIGADA, prospector: corredor.servico });
    const r: any = await b.iniciar(ADMIN);

    assert.equal(r.total, 3, 'a rota tem que iniciar normal');
    assert.equal(Object.prototype.hasOwnProperty.call(r, 'prospector'), false, 'campo novo NÃO pode existir com a env OFF');
    assert.equal(corredor.chamadas.length, 0, 'nem uma chamada ao corredor');
    assert.equal(b.configReads.length, 0, 'nem uma ida ao banco pela config do prospector');
  });
});

test('CHAVE 1: valor lixo na env conta como OFF (só true/1/yes/on ligam)', async () => {
  await comEnv('talvez', async () => {
    const corredor = corredorDuble();
    const b = bancada({ config: CONFIG_LIGADA, prospector: corredor.servico });
    const r: any = await b.iniciar(ADMIN);
    assert.equal(r.prospector, undefined);
    assert.equal(corredor.chamadas.length, 0);
  });
});

// ---------------------------------------------------------------------------
// CHAVE 2 — prospectorAtivo do tenant
// ---------------------------------------------------------------------------

test('CHAVE 2 (prospectorAtivo=false): env ligada não basta — zero prospecto e zero corredor', async () => {
  await comEnv('true', async () => {
    const corredor = corredorDuble();
    const b = bancada({ config: { ...CONFIG_LIGADA, prospectorAtivo: false }, prospector: corredor.servico });
    const r: any = await b.iniciar(ADMIN);

    assert.equal(r.total, 3);
    assert.equal(r.prospector, undefined);
    assert.equal(corredor.chamadas.length, 0);
    assert.equal(b.configReads.length, 1, 'leu a config uma vez e parou ali');
  });
});

test('CHAVE 2: empresa SEM linha de LogisticaConfig fica fechada (opt-in, nunca por omissão)', async () => {
  await comEnv('true', async () => {
    const corredor = corredorDuble();
    const b = bancada({ config: null, prospector: corredor.servico });
    const r: any = await b.iniciar(ADMIN);
    assert.equal(r.prospector, undefined);
    assert.equal(corredor.chamadas.length, 0);
  });
});

// ---------------------------------------------------------------------------
// CHAVE 3 — o ATOR (molde do passeioEquipe)
// ---------------------------------------------------------------------------

test('CHAVE 3: funcionário comum SEM prospectorEquipe não recebe prospecto', async () => {
  await comEnv('true', async () => {
    const corredor = corredorDuble({ prospectos: [EMPRESA_SALAO] });
    const b = bancada({ config: { ...CONFIG_LIGADA, prospectorEquipe: false }, prospector: corredor.servico });
    const r: any = await b.iniciar(FUNCIONARIO);

    assert.equal(r.total, 3, 'a rota do funcionário inicia normal');
    assert.equal(r.prospector, undefined);
    assert.equal(corredor.chamadas.length, 0);
  });
});

test('CHAVE 3: funcionário COM prospectorEquipe recebe', async () => {
  await comEnv('true', async () => {
    const corredor = corredorDuble({ prospectos: [EMPRESA_SALAO] });
    const b = bancada({ config: { ...CONFIG_LIGADA, prospectorEquipe: true }, prospector: corredor.servico });
    const r: any = await b.iniciar(FUNCIONARIO);

    assert.equal(corredor.chamadas.length, 1);
    assert.equal(r.prospector.empresas.length, 1);
  });
});

test('CHAVE 3: admin (dono e gerente) passa mesmo com prospectorEquipe=false', async () => {
  await comEnv('true', async () => {
    for (const ator of [ADMIN, GERENTE, { id: 1, role: 'USER', isSystemMaster: true }]) {
      const corredor = corredorDuble({ prospectos: [EMPRESA_SALAO] });
      const b = bancada({ config: { ...CONFIG_LIGADA, prospectorEquipe: false }, prospector: corredor.servico });
      const r: any = await b.iniciar(ator);
      assert.equal(corredor.chamadas.length, 1, `ator ${ator.role} deveria passar`);
      assert.equal(r.prospector.empresas.length, 1);
    }
  });
});

test('CHAVE 3: chamada SEM ator é fail-closed (tratada como funcionário comum)', async () => {
  await comEnv('true', async () => {
    const fechado = corredorDuble({ prospectos: [EMPRESA_SALAO] });
    const b1 = bancada({ config: { ...CONFIG_LIGADA, prospectorEquipe: false }, prospector: fechado.servico });
    const r1: any = await b1.iniciar(undefined);
    assert.equal(r1.prospector, undefined, 'sem ator e sem liberação de equipe = fechado');
    assert.equal(fechado.chamadas.length, 0);

    /* 🔴 12/08 — SEM ATOR AGORA É FECHADO ATÉ COM prospectorEquipe LIGADO, e é a
       chave nº4 que fecha: a escolha da semana é DA PESSOA, então chamada interna
       sem ator não tem de quem ler escolha nenhuma. Antes desta leva, `equipe:true`
       deixava passar uma chamada anônima — o que hoje seria acender prédio na tela
       de alguém que nunca disse o que queria caçar. */
    const aberto = corredorDuble({ prospectos: [EMPRESA_SALAO] });
    const b2 = bancada({ config: { ...CONFIG_LIGADA, prospectorEquipe: true }, prospector: aberto.servico });
    const r2: any = await b2.iniciar(undefined);
    assert.equal(r2.prospector, undefined, 'sem PESSOA não há escolha da semana — fechado');
    assert.equal(aberto.chamadas.length, 0, 'e o corredor (que varre a RFB) nem roda');
  });
});

// ---------------------------------------------------------------------------
// 🔴 CHAVE 4 — A ESCOLHA DA SEMANA, e ela é DA PESSOA (PROSPECTOR v2, 12/08)
//
// A decisão do dono: o prospector nasce DESLIGADO pra todo mundo e só acorda
// quando a PESSOA aciona e diz o TIPO que interessa a ela NESTA semana.
// ---------------------------------------------------------------------------

test('CHAVE 4: sem escolha na semana, o payload sai BYTE A BYTE o de sempre e o corredor nem roda', async () => {
  await comEnv('true', async () => {
    const corredor = corredorDuble({ prospectos: [EMPRESA_SALAO] });
    const semana = semanaDuble(null); // a pessoa não escolheu nada
    const b = bancada({ config: CONFIG_LIGADA, prospector: corredor.servico, semana: semana.servico });
    const r: any = await b.iniciar(ADMIN);

    assert.equal(r.total, 3, 'a rota inicia normal — o prospector é ENFEITE');
    assert.equal(
      Object.prototype.hasOwnProperty.call(r, 'prospector'),
      false,
      'a chave `prospector` nem pode existir: ausente ≠ vazio (a ponte lê `[]` como "apague a tela")',
    );
    assert.equal(corredor.chamadas.length, 0, 'a RFB não é varrida por quem não pediu nada');
    assert.equal(semana.chamadas.length, 1, 'e a escolha foi perguntada uma vez só');
    assert.equal(b.logs.filter((l) => l.nivel === 'error').length, 0, 'não escolher não é erro');
  });
});

test('CHAVE 4: a escolha é perguntada com a EMPRESA e a PESSOA — nunca só com a empresa', async () => {
  await comEnv('true', async () => {
    const semana = semanaDuble('salao');
    const b = bancada({
      companyId: 41,
      config: CONFIG_LIGADA,
      prospector: corredorDuble({ prospectos: [EMPRESA_SALAO] }).servico,
      semana: semana.servico,
    });
    await b.iniciar(GERENTE); // id 8

    assert.deepEqual(semana.chamadas[0], { companyId: 41, userId: 8 });
    // 🔴 Dois motoristas da mesma distribuidora escolhem coisas diferentes na mesma
    // segunda-feira. Ler a escolha só por empresa acenderia a tela de um com o
    // gosto do outro.
  });
});

test('CHAVE 4: serviço da semana NÃO injetado é FAIL-CLOSED (nada de "segue como antes")', async () => {
  await comEnv('true', async () => {
    const corredor = corredorDuble({ prospectos: [EMPRESA_SALAO] });
    const b = bancada({ config: CONFIG_LIGADA, prospector: corredor.servico, semana: null });
    const r: any = await b.iniciar(ADMIN);

    assert.equal(r.total, 3);
    assert.equal(r.prospector, undefined, 'sem a peça que sabe da escolha, o prospector fica QUIETO');
    assert.equal(corredor.chamadas.length, 0);
  });
});

// ---------------------------------------------------------------------------
// CHAVE 5 — pino na região (vazio HONESTO)
// ---------------------------------------------------------------------------

test('CHAVE 5: empresa sem pino na região devolve lista VAZIA — vazio honesto, não erro', async () => {
  await comEnv('true', async () => {
    const corredor = corredorDuble({ prospectos: [] });
    const b = bancada({ config: CONFIG_LIGADA, prospector: corredor.servico });
    const r: any = await b.iniciar(ADMIN);

    assert.equal(r.total, 3);
    assert.deepEqual(r.prospector.empresas, []);
    assert.equal(r.prospector.persistido, true);
    assert.equal(b.logs.filter((l) => l.nivel === 'error').length, 0, 'vazio honesto NÃO é erro');
  });
});

// ---------------------------------------------------------------------------
// O PAYLOAD — o que o app recebe (e o que ele NUNCA recebe)
// ---------------------------------------------------------------------------

test('payload: aditivo, com nome/ramo/distância — e SEM telefone, porte ou qualquer valor (LEI DO VENDEDOR)', async () => {
  await comEnv('true', async () => {
    const corredor = corredorDuble({ prospectos: [EMPRESA_SALAO], rotaDia: '2026-08-07', raioM: 150, acendeNoDia: 4 });
    const b = bancada({ config: CONFIG_LIGADA, prospector: corredor.servico });
    const r: any = await b.iniciar(ADMIN);

    // Nada do payload de sempre se perdeu.
    assert.equal(r.date, '2026-08-07');
    assert.equal(r.total, 3);
    assert.equal(r.paradas.length, 3);
    assert.equal(r.routeId, 'route-1');

    assert.equal(r.prospector.rotaDia, '2026-08-07');
    assert.equal(r.prospector.raioM, 150);
    assert.equal(r.prospector.acendeNoDia, 4);
    // 12/08 — o TIPO da semana viaja pro app poder DIZER o que está caçando.
    assert.equal(r.prospector.tipo, 'salao');
    assert.equal(r.prospector.tipoRotulo, 'Salões e barbearias');

    const empresa = r.prospector.empresas[0];
    assert.deepEqual(
      Object.keys(empresa).sort(),
      ['aceso', 'afinidade', 'cnpj', 'distM', 'escolhida', 'id', 'lat', 'lng', 'nome', 'ramo'].sort(),
    );
    assert.equal(empresa.id, EMPRESA_SALAO.cnpj, 'o `id` é o gancho do prédio no mapa');
    assert.equal(empresa.nome, 'Salão Bela Vista');
    assert.equal(empresa.ramo, 'Cabeleireiros, manicure e pedicure');
    assert.equal(empresa.distM, 42);
    assert.equal(empresa.afinidade, true);
    assert.equal(empresa.escolhida, true, 'CNAE 9602501 é salão, e a pessoa escolheu salão');
    // `aceso` é decisão do SERVIDOR (08/08) e vale nos dois payloads: única do
    // dia com teto 4, ela nasce acesa. A ponte não escolhe nada.
    assert.equal(empresa.aceso, true);

    const bruto = JSON.stringify(r.prospector);
    assert.equal(bruto.includes('551933334444'), false, 'telefone NUNCA viaja pro motorista');
    assert.equal(bruto.includes('MICRO EMPRESA'), false, 'porte NUNCA viaja pro motorista');
  });
});

test('payload: sem cnaeDescricao, o ramo cai no rótulo da cesta (nunca vazio à toa)', async () => {
  await comEnv('true', async () => {
    const corredor = corredorDuble({ prospectos: [{ ...EMPRESA_SALAO, cnaeDescricao: null }] });
    const b = bancada({ config: CONFIG_LIGADA, prospector: corredor.servico });
    const r: any = await b.iniciar(ADMIN);
    assert.equal(r.prospector.empresas[0].ramo, 'salão / estética');
  });
});

// ---------------------------------------------------------------------------
// 🔴 AS DUAS CORES (PROSPECTOR v2) — AZUL é ambiente e é MUDO; VERDE é o tipo
// que a pessoa escolheu, e só ele acende.
// ---------------------------------------------------------------------------

/** Empresas de ramos diferentes, todas no mesmo corredor. Distância crescente. */
const RUA_MISTA = [
  { ...EMPRESA_SALAO, cnpj: '11111111000191', nome: 'Mercadinho da Praça', cnae: '4712100', distM: 20 },
  { ...EMPRESA_SALAO, cnpj: '22222222000192', nome: 'Salão Bela Vista', cnae: '9602501', distM: 40 },
  { ...EMPRESA_SALAO, cnpj: '33333333000193', nome: 'Loja de Roupas', cnae: '4781400', distM: 60 },
  { ...EMPRESA_SALAO, cnpj: '44444444000194', nome: 'Barbearia do Zé', cnae: '9602502', distM: 80 },
];

test('DUAS CORES: só quem bate no CNAE do tipo escolhido é `escolhida` — o resto vem AZUL', async () => {
  await comEnv('true', async () => {
    const corredor = corredorDuble({ prospectos: RUA_MISTA });
    const b = bancada({ config: CONFIG_LIGADA, prospector: corredor.servico, semana: semanaDuble('salao').servico });
    const r: any = await b.iniciar(ADMIN);

    assert.deepEqual(
      r.prospector.empresas.map((e: any) => [e.nome, e.escolhida]),
      [
        ['Mercadinho da Praça', false],
        ['Salão Bela Vista', true],
        ['Loja de Roupas', false],
        ['Barbearia do Zé', true],
      ],
    );
    // 🔴 O CORREDOR CONTINUA TRAZENDO TODO MUNDO. Filtrar aqui deixaria a rua vazia
    // e mataria a sensação de "tem mundo aí fora", que é metade do valor da cena.
    assert.equal(r.prospector.empresas.length, 4, 'as azuis são AMBIENTE — elas ficam');
  });
});

test('DUAS CORES: trocar o tipo da semana repinta a MESMA rua (a cor não é snapshot)', async () => {
  await comEnv('true', async () => {
    const pintarCom = async (slug: string) => {
      const b = bancada({
        config: CONFIG_LIGADA,
        prospector: corredorDuble({ prospectos: RUA_MISTA }).servico,
        semana: semanaDuble(slug).servico,
      });
      const r: any = await b.iniciar(ADMIN);
      return r.prospector.empresas.filter((e: any) => e.escolhida).map((e: any) => e.nome);
    };

    assert.deepEqual(await pintarCom('salao'), ['Salão Bela Vista', 'Barbearia do Zé']);
    assert.deepEqual(await pintarCom('mercado'), ['Mercadinho da Praça']);
    // Ninguém do tipo na rua: a rua fica azul e QUIETA — e isso é um desfecho
    // legítimo, não uma falha.
    assert.deepEqual(await pintarCom('farmacia'), []);
  });
});

test('DUAS CORES: `aceso` NUNCA cai em azul — o teto do dia é gasto só entre as escolhidas', async () => {
  await comEnv('true', async () => {
    const corredor = corredorDuble({ prospectos: RUA_MISTA, maxDia: 2, acendeNoDia: 2 });
    const b = bancada({
      config: { ...CONFIG_LIGADA, prospectorMaxDia: 2 },
      prospector: corredor.servico,
      semana: semanaDuble('salao').servico,
    });
    const r: any = await b.iniciar(ADMIN);

    /* 🔴 O DEFEITO QUE ISTO TRANCA: com o teto caindo nas N mais PERTO quaisquer,
       o mercadinho (20 m) e o salão (40 m) gastariam as 2 vagas — e o mercadinho é
       AZUL, mudo. A barbearia, que é o que a pessoa está caçando, ficaria apagada
       atrás de um prédio que ela nem pediu pra ver. */
    assert.deepEqual(
      r.prospector.empresas.map((e: any) => [e.nome, e.escolhida, e.aceso]),
      [
        ['Mercadinho da Praça', false, false],
        ['Salão Bela Vista', true, true],
        ['Loja de Roupas', false, false],
        ['Barbearia do Zé', true, true],
      ],
    );
    // A ORDEM da lista continua sendo a de DISTÂNCIA (é ela que a tela usa pra
    // empilhar prédio e brigar por rótulo) — o que mudou é só quem gasta vaga.
    assert.deepEqual(r.prospector.empresas.map((e: any) => e.distM), [20, 40, 60, 80]);
  });
});

test('DUAS CORES: o teto continua sendo TETO — a 3ª escolhida não acende', async () => {
  await comEnv('true', async () => {
    const tresSaloes = [
      { ...EMPRESA_SALAO, cnpj: '11111111000191', cnae: '9602501', distM: 10 },
      { ...EMPRESA_SALAO, cnpj: '22222222000192', cnae: '9602501', distM: 20 },
      { ...EMPRESA_SALAO, cnpj: '33333333000193', cnae: '9602501', distM: 30 },
    ];
    const corredor = corredorDuble({ prospectos: tresSaloes, maxDia: 2, acendeNoDia: 2 });
    const b = bancada({
      config: { ...CONFIG_LIGADA, prospectorMaxDia: 2 },
      prospector: corredor.servico,
      semana: semanaDuble('salao').servico,
    });
    const r: any = await b.iniciar(ADMIN);
    assert.deepEqual(r.prospector.empresas.map((e: any) => e.aceso), [true, true, false]);
  });
});

test('DUAS CORES: empresa SEM cnae nasce azul — "não sei" nunca vira convite', async () => {
  await comEnv('true', async () => {
    const corredor = corredorDuble({ prospectos: [{ ...EMPRESA_SALAO, cnae: null }] });
    const b = bancada({ config: CONFIG_LIGADA, prospector: corredor.servico, semana: semanaDuble('salao').servico });
    const r: any = await b.iniciar(ADMIN);
    assert.equal(r.prospector.empresas[0].escolhida, false);
    assert.equal(r.prospector.empresas[0].aceso, false, 'prédio que ninguém classificou não pede parada');
  });
});

test('as PARADAS DO DIA são o corredor: só as com coordenada, e o raio/teto do tenant vão junto', async () => {
  await comEnv('true', async () => {
    const corredor = corredorDuble({ prospectos: [] });
    const b = bancada({
      config: { prospectorAtivo: true, prospectorEquipe: false, prospectorRaioM: 300, prospectorMaxDia: 6 },
      prospector: corredor.servico,
    });
    await b.iniciar(ADMIN);

    const chamada = corredor.chamadas[0];
    assert.equal(chamada.paradas.length, 3);
    assert.deepEqual(chamada.paradas[0], { lat: PARADAS_RIO_CLARO[0].lat, lng: PARADAS_RIO_CLARO[0].lng });
    assert.equal(chamada.opts.raioM, 300);
    assert.equal(chamada.opts.maxDia, 6);
  });
});

// ---------------------------------------------------------------------------
// MULTI-TENANT — nada atravessa empresa
// ---------------------------------------------------------------------------

test('MULTI-TENANT: a company da rota é a company da config E a do corredor', async () => {
  await comEnv('true', async () => {
    for (const companyId of [39, 41, 5]) {
      const corredor = corredorDuble({ prospectos: [EMPRESA_SALAO] });
      const b = bancada({ companyId, config: CONFIG_LIGADA, prospector: corredor.servico });
      await b.iniciar(ADMIN);
      assert.equal(b.configReads[0].companyId, companyId, 'config lida com a company da rota');
      assert.equal(corredor.chamadas[0].companyId, companyId, 'corredor consultado com a company da rota');
    }
  });
});

test('MULTI-TENANT: a config só é lida com as colunas do prospector, sempre escopada', async () => {
  await comEnv('true', async () => {
    const corredor = corredorDuble();
    const b = bancada({ companyId: 41, config: CONFIG_LIGADA, prospector: corredor.servico });
    await b.iniciar(ADMIN);
    assert.deepEqual(
      b.configReads[0].campos.sort(),
      ['prospectorAtivo', 'prospectorEquipe', 'prospectorMaxDia', 'prospectorRaioM'],
    );
  });
});

// ---------------------------------------------------------------------------
// ENFEITE NÃO DERRUBA ROTA — as 4 formas de o prospector falhar
// ---------------------------------------------------------------------------

test('ENFEITE: corredor devolvendo ok=false NÃO derruba a rota — e LOGA o alarme', async () => {
  await comEnv('true', async () => {
    const corredor = corredorDuble({ ok: false, prospectos: [] });
    const b = bancada({ config: CONFIG_LIGADA, prospector: corredor.servico });
    const r: any = await b.iniciar(ADMIN);

    assert.equal(r.total, 3, 'a rota INICIOU');
    assert.equal(r.routeId, 'route-1');
    assert.equal(r.prospector, undefined, 'falha não vira lista vazia mentirosa');
    const alarme = b.logs.filter((l) => l.nivel === 'error');
    assert.equal(alarme.length, 1, 'falha NUNCA é muda (lição CNEFE)');
    assert.match(alarme[0].msg, /prospector/i);
    assert.match(alarme[0].msg, /company=39/);
  });
});

test('ENFEITE: corredor que LANÇA exceção não sobe pro iniciar-rota — vira log', async () => {
  await comEnv('true', async () => {
    const explode: any = {
      embarcar: async () => {
        throw new Error('boom do corredor');
      },
    };
    const b = bancada({ config: CONFIG_LIGADA, prospector: explode });
    const r: any = await b.iniciar(ADMIN);

    assert.equal(r.total, 3);
    assert.equal(r.prospector, undefined);
    const alarme = b.logs.filter((l) => l.nivel === 'error');
    assert.equal(alarme.length, 1);
    assert.match(alarme[0].msg, /boom do corredor/, 'a mensagem ORIGINAL tem que aparecer');
  });
});

test('ENFEITE: banco no chão dentro do CORREDOR DE VERDADE — rota inicia, corredor devolve vazio', async () => {
  await comEnv('true', async () => {
    // Corredor REAL com um Prisma que só sabe cair: prova a ponta a ponta que
    // um defeito de banco no prospector não vira 500 no iniciar-rota.
    const prismaQuebrado: any = {
      $queryRaw: async () => {
        throw new Error('connection refused');
      },
      $executeRaw: async () => {
        throw new Error('connection refused');
      },
    };
    const corredorReal = new ProspectorCorredorService(prismaQuebrado);
    const errosDoCorredor: string[] = [];
    (corredorReal as any).logger = {
      error: (m: string) => errosDoCorredor.push(String(m)),
      warn: () => {},
      log: () => {},
      debug: () => {},
    };

    const b = bancada({ config: CONFIG_LIGADA, prospector: corredorReal });
    const r: any = await b.iniciar(ADMIN);

    assert.equal(r.total, 3, 'a rota INICIOU com o banco do corredor no chão');
    assert.equal(r.routeId, 'route-1');
    assert.ok(errosDoCorredor.length > 0, 'o corredor gritou');
    assert.ok(
      errosDoCorredor.some((m) => m.includes('connection refused')),
      'a mensagem original do banco aparece no log do corredor',
    );
    // O corredor devolve `ok:true` com lista vazia (a consulta engoliu o erro
    // com alarme, por contrato dele) — o iniciar-rota não inventa nada em cima.
    assert.deepEqual(r.prospector.empresas, []);
  });
});

test('ENFEITE: tabela ProspectoRota ausente não quebra — vem no payload com persistido=false e AVISO', async () => {
  await comEnv('true', async () => {
    const corredor = corredorDuble({ prospectos: [EMPRESA_SALAO], somenteMemoria: true });
    const b = bancada({ config: CONFIG_LIGADA, prospector: corredor.servico });
    const r: any = await b.iniciar(ADMIN);

    assert.equal(r.total, 3);
    assert.equal(r.prospector.empresas.length, 1, 'sem tabela, a lista do DIA continua valendo');
    assert.equal(r.prospector.persistido, false);
    assert.equal(b.logs.filter((l) => l.nivel === 'error').length, 0, 'migration pendente não é ERRO');
    assert.ok(
      b.logs.some((l) => l.nivel === 'warn' && /ProspectoRota/.test(l.msg)),
      'mas também não é silêncio',
    );
  });
});

test('ENFEITE: coluna do prospector inexistente (migration pendente) fecha o gate com AVISO, sem erro', async () => {
  await comEnv('true', async () => {
    const erro: any = new Error(
      'The column `LogisticaConfig.prospectorAtivo` does not exist in the current database.',
    );
    erro.code = 'P2022';
    const corredor = corredorDuble({ prospectos: [EMPRESA_SALAO] });
    const b = bancada({ erroConfig: erro, prospector: corredor.servico });
    const r: any = await b.iniciar(ADMIN);

    assert.equal(r.total, 3, 'produção sem a migration inicia rota normal');
    assert.equal(r.prospector, undefined);
    assert.equal(corredor.chamadas.length, 0, 'sem política lida, o corredor nem é chamado');
    assert.equal(b.logs.filter((l) => l.nivel === 'error').length, 0);
    assert.ok(b.logs.some((l) => l.nivel === 'warn' && /migration pendente/i.test(l.msg)));
  });
});

test('ENFEITE: erro DE VERDADE na config vira ERRO no log (não se disfarça de transição)', async () => {
  await comEnv('true', async () => {
    const b = bancada({ erroConfig: new Error('deadlock detected'), prospector: corredorDuble().servico });
    const r: any = await b.iniciar(ADMIN);

    assert.equal(r.total, 3);
    assert.equal(r.prospector, undefined);
    const alarme = b.logs.filter((l) => l.nivel === 'error');
    assert.equal(alarme.length, 1);
    assert.match(alarme[0].msg, /deadlock detected/);
  });
});

test('ENFEITE: serviço do corredor NÃO injetado (instância antiga) inicia rota igual', async () => {
  await comEnv('true', async () => {
    const b = bancada({ config: CONFIG_LIGADA });
    const r: any = await b.iniciar(ADMIN);
    assert.equal(r.total, 3);
    assert.equal(r.prospector, undefined);
    assert.equal(b.configReads.length, 0, 'sem serviço, nem lê config');
  });
});

// ---------------------------------------------------------------------------
// O DIA É O DE SÃO PAULO
// ---------------------------------------------------------------------------

test('rotaDia é o dia OPERACIONAL da rota, no formato de São Paulo', async () => {
  await comEnv('true', async () => {
    const corredor = corredorDuble({ prospectos: [] });
    const b = bancada({ config: CONFIG_LIGADA, prospector: corredor.servico });
    await b.iniciar(ADMIN, '2026-08-07');
    assert.equal(corredor.chamadas[0].opts.rotaDia, '2026-08-07');
  });
});

test('rotaDia sem data no pedido cai no HOJE de São Paulo, nunca no UTC do container', async () => {
  await comEnv('true', async () => {
    const corredor = corredorDuble({ prospectos: [] });
    const b = bancada({ config: CONFIG_LIGADA, prospector: corredor.servico });
    await b.iniciar(ADMIN, null);

    const hojeSP = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    assert.equal(corredor.chamadas[0].opts.rotaDia, hojeSP);
  });
});

// ---------------------------------------------------------------------------
// NÃO DEBITA NADA (o crédito é da F2)
// ---------------------------------------------------------------------------

test('embarcar é DE GRAÇA: o prospector não toca em carteira nem em cobrança', async () => {
  await comEnv('true', async () => {
    const corredor = corredorDuble({ prospectos: [EMPRESA_SALAO] });
    const b = bancada({ config: CONFIG_LIGADA, prospector: corredor.servico });
    // A bancada não injeta CreditWalletService em lugar nenhum: se o caminho
    // do prospector tentasse debitar, o teste quebraria com "undefined".
    const r: any = await b.iniciar(ADMIN);
    assert.equal(r.prospector.empresas.length, 1);
    assert.equal(
      b.logs.some((l) => /credit|debit|carteira/i.test(l.msg)),
      false,
    );
  });
});

// ===========================================================================
// A RELEITURA DO DIA (08/08) — `lerProspectosDoDia`, a porta que faltava.
//
// O defeito que estes testes trancam: o `prospector` só existia na resposta do
// `POST /rota/iniciar`, e essa resposta é EFÊMERA. Fechou o app, trocou de
// tela, acabou a bateria — na volta quem roda é o `GET /logistica/rota`, que
// não sabia do assunto. Medido em produção em 08/08: 8 empresas embarcadas na
// company 41, ZERO prédios na tela de navegação.
//
// A régua aqui é a MESMA do embarque (as 4 chaves), mais duas próprias:
//  · NÃO EMBARCA: o `listRota` é hot-path de polling — o corredor (que varre a
//    RFB) não pode rodar aqui, nunca;
//  · O QUE ACENDE É IGUAL nos dois payloads, senão reabrir o app trocaria os
//    prédios acesos sem nada ter acontecido na rua.
// ===========================================================================

type CenarioReleitura = {
  companyId?: number;
  config?: Record<string, unknown> | null;
  erroConfig?: any;
  /** Linhas de ProspectoRota. `Error` no lugar do array = banco no chão. */
  linhas?: any[] | Error;
  /** Escolha da semana. `undefined` = padrão ('salao'); `null` = serviço ausente. */
  semana?: any;
};

const LINHA = (over: Record<string, unknown> = {}) => ({
  cnpj: '11111111000191',
  nome: 'Salão Bela Vista',
  // 12/08 — o CÓDIGO do CNAE passou a ser gravado no embarque: é ele que deixa a
  // releitura responder "é do tipo escolhido?" com a MESMA régua do iniciar.
  cnae: '9602501',
  cnaeDescricao: 'Cabeleireiros, manicure e pedicure',
  lat: -22.4261,
  lng: -47.5787,
  distM: 42,
  ...over,
});

function bancadaReleitura(cenario: CenarioReleitura = {}) {
  const companyId = cenario.companyId ?? 41;
  const logs: Array<{ nivel: string; msg: string }> = [];
  const buscas: any[] = [];

  const prisma: any = {
    logisticaConfig: {
      findUnique: async () => {
        if (cenario.erroConfig) throw cenario.erroConfig;
        return cenario.config === undefined ? null : cenario.config;
      },
    },
    prospectoRota: {
      findMany: async (args: any) => {
        buscas.push(args);
        if (cenario.linhas instanceof Error) throw cenario.linhas;
        return cenario.linhas ?? [];
      },
    },
  };

  // Corredor NÃO injetado de propósito: a releitura não pode depender dele —
  // se algum dia alguém fizer o `listRota` embarcar, estes testes quebram.
  const semanaDub = cenario.semana === undefined ? semanaDuble().servico : cenario.semana ?? undefined;
  const rota = new LogisticaRotaService(
    prisma,
    {} as any,
    undefined,
    undefined,
    undefined,
    undefined,
    semanaDub,
  );
  (rota as any).logger = {
    log: (m: string) => logs.push({ nivel: 'log', msg: String(m) }),
    warn: (m: string) => logs.push({ nivel: 'warn', msg: String(m) }),
    error: (m: string) => logs.push({ nivel: 'error', msg: String(m) }),
    debug: () => {},
  };

  return {
    logs,
    buscas,
    companyId,
    ler: (actor?: any, dia = '2026-08-08') => rota.lerProspectosDoDia(companyId, dia, actor),
  };
}

test('RELEITURA: o dia embarcado volta no payload — o defeito de 08/08 fechado', async () => {
  await comEnv('true', async () => {
    const b = bancadaReleitura({
      config: CONFIG_LIGADA,
      linhas: [LINHA(), LINHA({ cnpj: '22222222000192', nome: 'Padaria Avenida', distM: 88 })],
    });
    const r = await b.ler(ADMIN);

    assert.ok(r, 'a releitura tem que devolver payload');
    assert.equal(r!.empresas.length, 2);
    assert.equal(r!.rotaDia, '2026-08-08');
    assert.equal(r!.persistido, true, 'veio da tabela: por definição está persistido');
    // O contrato do seam da ponte: sem id/nome/lat/lng o prédio não entra na tela.
    const primeira = r!.empresas[0];
    assert.equal(primeira.id, '11111111000191');
    assert.equal(primeira.id, primeira.cnpj, 'id e cnpj são o mesmo, pra ponte não adivinhar');
    assert.equal(primeira.nome, 'Salão Bela Vista');
    assert.equal(primeira.lat, -22.4261);
    assert.equal(primeira.distM, 42);
  });
});

test('RELEITURA: NÃO EMBARCA — o corredor (que varre a RFB) nunca roda no hot-path do polling', async () => {
  await comEnv('true', async () => {
    // A bancada não injeta o ProspectorCorredorService: se a releitura tentasse
    // embarcar, isto viraria "Cannot read properties of undefined".
    const b = bancadaReleitura({ config: CONFIG_LIGADA, linhas: [LINHA()] });
    const r = await b.ler(ADMIN);
    assert.equal(r!.empresas.length, 1);
    assert.equal(b.buscas.length, 1, 'uma leitura só, e é a da tabela');
  });
});

test('RELEITURA: a COR é recomputada contra a escolha de AGORA — nunca é snapshot', async () => {
  await comEnv('true', async () => {
    const rua = [
      LINHA({ cnpj: '11111111000191', nome: 'Mercadinho', cnae: '4712100', distM: 20 }),
      LINHA({ cnpj: '22222222000192', nome: 'Salão', cnae: '9602501', distM: 40 }),
    ];
    /* 🔴 O DEFEITO QUE ISTO TRANCA: sem o `cnae` gravado, a releitura não teria como
       responder a pergunta da cor — e reabrir o app repintaria de azul o que estava
       verde. Tela mudando sozinha sem nada ter acontecido na rua é bug de produto
       (é a MESMA lei do `aceso` de 08/08). */
    const comSalao = await bancadaReleitura({ config: CONFIG_LIGADA, linhas: rua }).ler(ADMIN);
    assert.deepEqual(comSalao!.empresas.map((e) => [e.nome, e.escolhida, e.aceso]), [
      ['Mercadinho', false, false],
      ['Salão', true, true],
    ]);

    // A pessoa trocou pra "mercado" na quarta-feira: a MESMA linha do banco muda de
    // cor no próximo poll, sem esperar a semana virar.
    const comMercado = await bancadaReleitura({
      config: CONFIG_LIGADA,
      linhas: rua,
      semana: semanaDuble('mercado').servico,
    }).ler(ADMIN);
    assert.deepEqual(comMercado!.empresas.map((e) => [e.nome, e.escolhida, e.aceso]), [
      ['Mercadinho', true, true],
      ['Salão', false, false],
    ]);
  });
});

test('RELEITURA: linha antiga (embarcada antes da coluna cnae) é AZUL, nunca acesa', async () => {
  await comEnv('true', async () => {
    const b = bancadaReleitura({ config: CONFIG_LIGADA, linhas: [LINHA({ cnae: null })] });
    const r = await b.ler(ADMIN);
    assert.equal(r!.empresas[0].escolhida, false);
    assert.equal(r!.empresas[0].aceso, false);
  });
});

test('RELEITURA: as 5 chaves valem aqui também — desligar apaga a tela, não só para de embarcar', async () => {
  // Chave 1 — env global
  await comEnv(undefined, async () => {
    const b = bancadaReleitura({ config: CONFIG_LIGADA, linhas: [LINHA()] });
    assert.equal(await b.ler(ADMIN), null);
    assert.equal(b.buscas.length, 0, 'env OFF não gasta nem uma consulta');
  });
  await comEnv('true', async () => {
    // Chave 2 — o tenant
    const desligada = bancadaReleitura({ config: { ...CONFIG_LIGADA, prospectorAtivo: false }, linhas: [LINHA()] });
    assert.equal(await desligada.ler(ADMIN), null);
    assert.equal(desligada.buscas.length, 0);

    // Chave 2 — empresa sem linha de config nenhuma (opt-in, nunca por omissão)
    const semConfig = bancadaReleitura({ config: null, linhas: [LINHA()] });
    assert.equal(await semConfig.ler(ADMIN), null);

    // Chave 3 — funcionário comum sem prospectorEquipe
    const semEquipe = bancadaReleitura({ config: CONFIG_LIGADA, linhas: [LINHA()] });
    assert.equal(await semEquipe.ler(FUNCIONARIO), null);
    assert.equal(semEquipe.buscas.length, 0);

    // Chave 3 — fail-closed: chamada SEM ator é funcionário comum
    const semAtor = bancadaReleitura({ config: CONFIG_LIGADA, linhas: [LINHA()] });
    assert.equal(await semAtor.ler(undefined), null);

    // Chave 3 — com prospectorEquipe ligado o funcionário passa
    const comEquipe = bancadaReleitura({
      config: { ...CONFIG_LIGADA, prospectorEquipe: true },
      linhas: [LINHA()],
    });
    assert.equal((await comEquipe.ler(FUNCIONARIO))!.empresas.length, 1);

    // Chave 3 — gerente é admin-tier: passa sem prospectorEquipe
    const gerente = bancadaReleitura({ config: CONFIG_LIGADA, linhas: [LINHA()] });
    assert.equal((await gerente.ler(GERENTE))!.empresas.length, 1);

    // Chave 4 — a PESSOA não escolheu nada nesta semana: a tela APAGA. Não basta
    // parar de embarcar novos; o que já está no banco também some da vista.
    const semEscolha = bancadaReleitura({
      config: CONFIG_LIGADA,
      linhas: [LINHA()],
      semana: semanaDuble(null).servico,
    });
    assert.equal(await semEscolha.ler(ADMIN), null);
    assert.equal(semEscolha.buscas.length, 0, 'sem escolha não gasta nem a consulta da tabela');

    // Chave 4 — serviço da semana ausente é FAIL-CLOSED
    const semServico = bancadaReleitura({ config: CONFIG_LIGADA, linhas: [LINHA()], semana: null });
    assert.equal(await semServico.ler(ADMIN), null);

    // Chave 5 — nenhuma linha embarcada no dia
    const vazio = bancadaReleitura({ config: CONFIG_LIGADA, linhas: [] });
    assert.equal(await vazio.ler(ADMIN), null, 'dia sem embarque não inventa chave no payload');
  });
});

test('RELEITURA: a busca é ESCOPADA na company e no DIA, e ignora lead/dispensado', async () => {
  await comEnv('true', async () => {
    const b = bancadaReleitura({ companyId: 41, config: CONFIG_LIGADA, linhas: [LINHA()] });
    await b.ler(ADMIN, '2026-08-08');

    const where = b.buscas[0].where;
    assert.equal(where.companyId, 41, 'multi-tenant: nada atravessa empresa');
    assert.equal(where.rotaDia, '2026-08-08', 'o dia da rota, nunca o histórico inteiro');
    // Quem virou lead saiu do corredor pra sempre; quem foi dispensado está de
    // castigo. Os dois voltarem como prédio seria o app reoferecendo o que o
    // motorista já resolveu.
    assert.deepEqual(where.estado, { notIn: ['lead', 'dispensado'] });
  });
});

test('RELEITURA: LEI DO VENDEDOR — telefone NUNCA sai do servidor', async () => {
  await comEnv('true', async () => {
    const b = bancadaReleitura({ config: CONFIG_LIGADA, linhas: [LINHA()] });
    const r = await b.ler(ADMIN);

    assert.equal(b.buscas[0].select.phoneDigits, undefined, 'o SELECT nem pede o telefone');
    assert.equal(/phone/i.test(JSON.stringify(r)), false, 'e ele não aparece no payload de jeito nenhum');
  });
});

test('RELEITURA: quem ACENDE é o servidor, pelo teto do dia, do mais PERTO pro mais longe', async () => {
  await comEnv('true', async () => {
    const b = bancadaReleitura({
      config: { ...CONFIG_LIGADA, prospectorMaxDia: 2 },
      // de propósito fora de ordem: quem ordena é o servidor, não o banco.
      linhas: [
        LINHA({ cnpj: '33333333000193', distM: 300 }),
        LINHA({ cnpj: '11111111000191', distM: 40 }),
        LINHA({ cnpj: '22222222000192', distM: 120 }),
      ],
    });
    const r = await b.ler(ADMIN);

    assert.equal(r!.acendeNoDia, 2, 'o teto do dia é o da config do tenant');
    assert.deepEqual(
      r!.empresas.map((e) => [e.distM, e.aceso]),
      [[40, true], [120, true], [300, false]],
      'as 2 mais perto acendem; o resto é reserva do clique',
    );
  });
});

test('RELEITURA: relida DUAS vezes acende os MESMOS prédios (nada sorteado, nada da ordem do banco)', async () => {
  await comEnv('true', async () => {
    const linhas = [
      LINHA({ cnpj: '33333333000193', distM: 90 }),
      LINHA({ cnpj: '11111111000191', distM: 90 }),
      LINHA({ cnpj: '22222222000192', distM: 90 }),
    ];
    const primeira = await bancadaReleitura({
      config: { ...CONFIG_LIGADA, prospectorMaxDia: 1 },
      linhas,
    }).ler(ADMIN);
    const segunda = await bancadaReleitura({
      config: { ...CONFIG_LIGADA, prospectorMaxDia: 1 },
      linhas: [...linhas].reverse(),
    }).ler(ADMIN);

    assert.deepEqual(
      primeira!.empresas.map((e) => [e.cnpj, e.aceso]),
      segunda!.empresas.map((e) => [e.cnpj, e.aceso]),
      'empate no distM desempata por cnpj — a ordem do banco não decide nada',
    );
    assert.equal(primeira!.empresas[0].cnpj, '11111111000191');
    assert.equal(primeira!.empresas[0].aceso, true);
  });
});

test('O QUE ACENDE É A MESMA RÉGUA no iniciar e na releitura', async () => {
  await comEnv('true', async () => {
    const empresas = [
      { ...EMPRESA_SALAO, cnpj: '33333333000193', distM: 300 },
      { ...EMPRESA_SALAO, cnpj: '11111111000191', distM: 40 },
      { ...EMPRESA_SALAO, cnpj: '22222222000192', distM: 120 },
    ];
    const corredor = corredorDuble({ prospectos: empresas, maxDia: 2, acendeNoDia: 2 });
    const doIniciar: any = await bancada({
      config: { ...CONFIG_LIGADA, prospectorMaxDia: 2 },
      prospector: corredor.servico,
    }).iniciar(ADMIN);

    const daReleitura = await bancadaReleitura({
      config: { ...CONFIG_LIGADA, prospectorMaxDia: 2 },
      linhas: empresas.map((e) => LINHA({ cnpj: e.cnpj, distM: e.distM })),
    }).ler(ADMIN);

    // 🔴 É ISTO que impede a tela mudar sozinha: reabrir o app não pode trocar
    // quais prédios estão acesos se nada aconteceu na rua.
    assert.deepEqual(
      doIniciar.prospector.empresas.map((e: any) => [e.cnpj, e.aceso]),
      daReleitura!.empresas.map((e) => [e.cnpj, e.aceso]),
    );
  });
});

test('RELEITURA: sem cnaeDescricao o ramo fica NULO — rótulo não se inventa na releitura', async () => {
  await comEnv('true', async () => {
    const b = bancadaReleitura({ config: CONFIG_LIGADA, linhas: [LINHA({ cnaeDescricao: null })] });
    const r = await b.ler(ADMIN);
    assert.equal(r!.empresas[0].ramo, null);
    // `afinidade` é do CNAE, que a tabela não guarda: AUSENTE ("não sei"),
    // nunca `false` ("apurei e não tem").
    assert.equal('afinidade' in r!.empresas[0], false);
  });
});

test('RELEITURA: raio e teto sem config caem nos PADRÕES, não em zero', async () => {
  await comEnv('true', async () => {
    const b = bancadaReleitura({
      config: { prospectorAtivo: true, prospectorEquipe: false, prospectorRaioM: null, prospectorMaxDia: null },
      linhas: [LINHA()],
    });
    const r = await b.ler(ADMIN);
    assert.equal(r!.raioM, 150, 'RAIO_PADRAO_M');
    assert.equal(r!.acendeNoDia, 4, 'MAX_DIA_PADRAO — teto zero deixaria a tela toda apagada');
  });
});

test('ENFEITE: banco no chão na releitura NÃO derruba a rota do dia — e não é mudo', async () => {
  await comEnv('true', async () => {
    const b = bancadaReleitura({ config: CONFIG_LIGADA, linhas: new Error('connection refused') });
    assert.equal(await b.ler(ADMIN), null, 'falha não vira lista vazia mentirosa');
    const alarme = b.logs.filter((l) => l.nivel === 'error');
    assert.equal(alarme.length, 1, 'lição CNEFE: best-effort mudo desligou 23M endereços por 5 dias');
    assert.match(alarme[0].msg, /connection refused/, 'a mensagem ORIGINAL do banco aparece');
    assert.match(alarme[0].msg, /company=41/);
  });
});

test('ENFEITE: tabela ProspectoRota ausente (migration pendente) é AVISO, nunca erro', async () => {
  await comEnv('true', async () => {
    const erro: any = new Error('The table `public.ProspectoRota` does not exist in the current database.');
    erro.code = 'P2021';
    const b = bancadaReleitura({ config: CONFIG_LIGADA, linhas: erro });
    assert.equal(await b.ler(ADMIN), null);
    assert.equal(b.logs.filter((l) => l.nivel === 'error').length, 0, 'transição esperada não é defeito');
    assert.ok(b.logs.some((l) => l.nivel === 'warn' && /migration pendente/i.test(l.msg)), 'mas não é silêncio');
  });
});
