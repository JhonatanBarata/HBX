import test from 'node:test';
import assert from 'node:assert/strict';
import { LogisticaRotaService } from './logistica-rota.service';
import { ProspectorCorredorService } from './prospector-corredor.service';

/**
 * PROSPECTOR CNPJ — F1 do lado do SERVIDOR: o corredor ligado no INICIAR ROTA.
 * Plano: docs/PLANEJAMENTOS/PR07082026-PROSPECTOR-CNPJ.md (§0, §1, F0/F1).
 *
 * O que se prova aqui é o que o iniciar-rota passou a decidir — e o que ele
 * JAMAIS pode deixar de fazer:
 *
 *  · AS 4 CHAVES, uma a uma: env global · prospectorAtivo do tenant · ATOR
 *    (admin sempre, funcionário só com prospectorEquipe) · pino na região.
 *    Chave fechada = ZERO prospecto, sem erro, e o payload byte a byte o de
 *    hoje (a chave `prospector` nem existe).
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
      updateMany: async (args: any) => {
        const alvo = entregas.find((e) => e.id === args?.where?.id);
        if (alvo && args?.data?.status) Object.assign(alvo, args.data);
        return { count: 1 };
      },
    },
    logisticaRoute: { updateMany: async () => ({ count: 0 }) },
  };

  const routeBilling: any = {
    prepareRoute: async () => ({
      routeId: 'route-1',
      mode: 'ESSENTIAL',
      status: 'PLANNED',
      routeDate: '2026-08-07',
      deliveryCount: entregas.length,
      requiredBlocks: 0,
      newlyDebitedBlocks: 0,
      billingRevision: 0,
    }),
    beginInitialization: async () => ({ token: 'lease-1', alreadyActive: false }),
    activateRoute: async () => undefined,
    failInitialization: async () => undefined,
    abortPreparedRoute: async () => undefined,
  };

  const rota = new LogisticaRotaService(
    prisma,
    routeBilling,
    undefined, // tracking
    undefined, // osrm
    undefined, // cargaEstoque (B4)
    cenario.prospector,
  );
  (rota as any).logger = {
    log: (m: string) => logs.push({ nivel: 'log', msg: String(m) }),
    warn: (m: string) => logs.push({ nivel: 'warn', msg: String(m) }),
    error: (m: string) => logs.push({ nivel: 'error', msg: String(m) }),
    debug: () => {},
  };

  const iniciar = (actor?: any, date = '2026-08-07') =>
    rota.iniciarRota(
      companyId,
      { date, deliveryIds: PARADAS_RIO_CLARO.map((p) => p.id), ordemManual: PARADAS_RIO_CLARO.map((p) => p.id) },
      7,
      7,
      false,
      actor,
    );

  return { rota, iniciar, logs, configReads, companyId };
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

    const aberto = corredorDuble({ prospectos: [EMPRESA_SALAO] });
    const b2 = bancada({ config: { ...CONFIG_LIGADA, prospectorEquipe: true }, prospector: aberto.servico });
    const r2: any = await b2.iniciar(undefined);
    assert.equal(aberto.chamadas.length, 1, 'com equipe liberada, chamada interna passa');
    assert.equal(r2.prospector.empresas.length, 1);
  });
});

// ---------------------------------------------------------------------------
// CHAVE 4 — pino na região (vazio HONESTO)
// ---------------------------------------------------------------------------

test('CHAVE 4: empresa sem pino na região devolve lista VAZIA — vazio honesto, não erro', async () => {
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

    const empresa = r.prospector.empresas[0];
    assert.deepEqual(Object.keys(empresa).sort(), ['afinidade', 'cnpj', 'distM', 'id', 'lat', 'lng', 'nome', 'ramo'].sort());
    assert.equal(empresa.id, EMPRESA_SALAO.cnpj, 'o `id` é o gancho do prédio no mapa');
    assert.equal(empresa.nome, 'Salão Bela Vista');
    assert.equal(empresa.ramo, 'Cabeleireiros, manicure e pedicure');
    assert.equal(empresa.distM, 42);
    assert.equal(empresa.afinidade, true);

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
    await b.iniciar(ADMIN, undefined as any);

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
