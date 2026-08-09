import test from 'node:test';
import assert from 'node:assert/strict';

import { __setCnefeQueryForTests } from '../nucleo/cnefe-resolver.util';
import { LogisticaImportacaoService } from './logistica-importacao.service';

/**
 * F4 (27/07, PR27072026-ROTA-3-NIVEIS) — prova a ORQUESTRAÇÃO da quarentena
 * (service), com Prisma/NucleoCadastroService/LogisticaAgendaService FALSOS —
 * zero rede, zero banco real, zero fs real fora do diretório de upload de foto
 * (gitignored, mesmo padrão de logistica-operacao.service.ts). O que a régua
 * verde/vermelho FAZ já está provado em logistica-importacao-sanitizacao.util.test.ts;
 * aqui é sobre o CICLO DE VIDA do lote/item: nasce rascunho → nunca efetiva
 * vermelho → efetivar é idempotente → descartar nunca desfaz cliente já criado.
 */

// ── Prisma falso, em memória — só o suficiente pros métodos do service ───────────
function buildFakePrisma() {
  let loteSeq = 0;
  let itemSeq = 0;
  const lotes = new Map<string, any>();
  const itens = new Map<string, any>();

  function matches(row: any, where: any): boolean {
    for (const [k, v] of Object.entries(where || {})) {
      if (v && typeof v === 'object' && !(v instanceof Date)) {
        if ('in' in (v as any)) { if (!(v as any).in.includes(row[k])) return false; continue; }
        if ('not' in (v as any)) { if (row[k] === (v as any).not) return false; continue; }
      }
      if (row[k] !== v) return false;
    }
    return true;
  }

  return {
    __itens: itens,
    __lotes: lotes,
    logisticaImportacaoLote: {
      create: async ({ data }: any) => {
        loteSeq += 1;
        const row = {
          id: `lote-${loteSeq}`, status: 'RASCUNHO',
          totalItens: 0, totalVerdes: 0, totalVermelhos: 0, totalPendentes: 0, totalEfetivados: 0,
          nomeArquivo: null, cidadePadrao: null, ufPadrao: null,
          createdAt: new Date(), updatedAt: new Date(),
          ...data,
        };
        lotes.set(row.id, row);
        return { ...row };
      },
      findFirst: async ({ where }: any) => {
        for (const row of lotes.values()) if (matches(row, where)) return { ...row };
        return null;
      },
      findMany: async ({ where, skip = 0, take = 1000 }: any) =>
        [...lotes.values()].filter((r) => matches(r, where)).slice(skip, skip + take).map((r) => ({ ...r })),
      count: async ({ where }: any) => [...lotes.values()].filter((r) => matches(r, where)).length,
      update: async ({ where, data }: any) => {
        const row = lotes.get(where.id);
        Object.assign(row, data, { updatedAt: new Date() });
        return { ...row };
      },
    },
    logisticaImportacaoItem: {
      create: async ({ data }: any) => {
        itemSeq += 1;
        // Mesmo default de COLUNA NULLABLE ausente que o Postgres/Prisma real
        // devolve (sempre presente como `null`, nunca `undefined`) — sem isto o
        // mock mentiria "campo não existe" em vez de "campo vazio".
        const row = {
          id: `item-${itemSeq}`, createdAt: new Date(), updatedAt: new Date(),
          nome: null, telefone: null, endereco: null, numero: null, bairro: null,
          cidade: null, uf: null, cep: null, diasSemana: null,
          produtoTexto: null, produtoId: null, qtd: null, valorUnit: null,
          lat: null, lng: null, geoFonte: null, motivoProblema: null,
          customerProfileId: null, efetivadoAt: null,
          fotoOriginalFilename: null, fotoStoredFilename: null, fotoStoragePath: null,
          fotoContentType: null, fotoByteSize: null,
          ...data,
        };
        itens.set(row.id, row);
        return { ...row };
      },
      findFirst: async ({ where }: any) => {
        for (const row of itens.values()) if (matches(row, where)) return { ...row };
        return null;
      },
      findMany: async ({ where, orderBy, take = 100000 }: any) => {
        let rows = [...itens.values()].filter((r) => matches(r, where));
        if (orderBy?.linha) rows = rows.sort((a, b) => a.linha - b.linha);
        return rows.slice(0, take).map((r) => ({ ...r }));
      },
      count: async ({ where }: any) => [...itens.values()].filter((r) => matches(r, where)).length,
      update: async ({ where, data }: any) => {
        const row = itens.get(where.id);
        Object.assign(row, data, { updatedAt: new Date() });
        return { ...row };
      },
      groupBy: async ({ where }: any) => {
        const rows = [...itens.values()].filter((r) => matches(r, where));
        const porStatus = new Map<string, number>();
        for (const r of rows) porStatus.set(r.statusSanitizacao, (porStatus.get(r.statusSanitizacao) ?? 0) + 1);
        return [...porStatus.entries()].map(([statusSanitizacao, count]) => ({ statusSanitizacao, _count: { _all: count } }));
      },
    },
    customerProfile: { updateMany: async () => ({ count: 1 }) },
    localEntrega: { updateMany: async () => ({ count: 0 }) },
    product: {
      findMany: async () => [] as any[],
      findFirst: async () => null,
    },
    logisticaPlanoEntrega: { findFirst: async () => null },
  };
}

function buildFakeNucleoCadastro() {
  const calls: any[] = [];
  let seq = 0;
  return {
    calls,
    async createConta(companyId: number, input: any) {
      seq += 1;
      calls.push({ companyId, input });
      return { contaId: `conta-${seq}`, contatoId: `contato-${seq}` };
    },
  };
}

function buildFakeAgenda() {
  const calls: any[] = [];
  let seq = 0;
  return {
    calls,
    async createPlan(companyId: number, input: any) {
      seq += 1;
      calls.push({ companyId, input });
      return { id: `plano-${seq}` };
    },
  };
}

function buildService() {
  const prisma = buildFakePrisma();
  const nucleo = buildFakeNucleoCadastro();
  const agenda = buildFakeAgenda();
  const service = new LogisticaImportacaoService(prisma as any, nucleo as any, agenda as any);
  return { service, prisma, nucleo, agenda };
}

const COMPANY_ID = 41;
const USER_ID = 7;

test('criarLoteTexto: linha completa nasce PENDENTE (candidata a verde); linha sem endereço nasce VERMELHO', async () => {
  const { service } = buildService();
  const lote = await service.criarLoteTexto(COMPANY_ID, USER_ID, {
    texto: 'Dona Maria - Rua das Flores, 123 - Rio Claro - SP\nSó um nome solto sem endereço nenhum',
  });
  assert.equal(lote.origem, 'TEXTO');
  assert.equal(lote.totalItens, 2);

  const detalhe = await service.obterLote(COMPANY_ID, lote.id, {});
  const [item1, item2] = detalhe.itens;
  assert.equal(item1.statusSanitizacao, 'PENDENTE', 'campos básicos completos — aguarda CNEFE');
  assert.equal(item2.statusSanitizacao, 'VERMELHO', 'sem endereço reconhecível — vermelho na hora, sem gastar CNEFE');
  assert.ok(item2.bruto.includes('Só um nome solto'), 'bruto original SEMPRE preservado, mesmo em item vermelho');
});

test('criarLoteFoto: nasce com item(ns) PENDENTE "aguardando transcrição" — nunca chama API de visão nenhuma', async () => {
  const { service } = buildService();
  // JPEG mínimo (assinatura de bytes válida: FF D8 FF) — não precisa ser uma
  // imagem de verdade pro detectarArquivoFoto aceitar, só a assinatura.
  const fakeJpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x00, 0x00, 0x00, 0x00]);
  const lote = await service.criarLoteFoto(COMPANY_ID, USER_ID, [
    { buffer: fakeJpeg, originalname: 'caderno-pagina1.jpg' },
  ]);
  assert.equal(lote.origem, 'FOTO');
  assert.equal(lote.totalPendentes, 1);

  const detalhe = await service.obterLote(COMPANY_ID, lote.id, {});
  assert.equal(detalhe.itens.length, 1);
  assert.equal(detalhe.itens[0].statusSanitizacao, 'PENDENTE');
  assert.equal(detalhe.itens[0].temFoto, true);
  assert.match(detalhe.itens[0].motivoProblema ?? '', /transcri/i);
});

test('efetivarLote: item VERMELHO nunca vira cliente, mesmo pedido explicitamente por id', async () => {
  const { service, nucleo } = buildService();
  const lote = await service.criarLoteTexto(COMPANY_ID, USER_ID, { texto: 'Nome solto sem endereço' });
  const antes = await service.obterLote(COMPANY_ID, lote.id, {});
  const itemVermelho = antes.itens[0];
  assert.equal(itemVermelho.statusSanitizacao, 'VERMELHO');

  const resultado = await service.efetivarLote(COMPANY_ID, USER_ID, lote.id, [itemVermelho.id]);
  assert.equal(resultado.efetivados, 0);
  assert.equal(resultado.jaEfetivados, 0);
  assert.equal(nucleo.calls.length, 0, 'createConta NUNCA é chamado pra item vermelho');

  const depois = await service.obterLote(COMPANY_ID, lote.id, {});
  assert.equal(depois.itens[0].customerProfileId, null, 'item vermelho segue sem conta vinculada');
});

test('efetivarLote: idempotente — chamar 2x no MESMO item não duplica a conta', async () => {
  const { service, prisma, nucleo } = buildService();
  const lote = await service.criarLoteTexto(COMPANY_ID, USER_ID, { texto: 'Dona Maria - Rua das Flores, 123 - Rio Claro - SP' });
  const antes = await service.obterLote(COMPANY_ID, lote.id, {});
  const item = antes.itens[0];

  // Simula "sanitização já rodou e achou o pino" (a régua CNEFE em si já tem
  // cobertura própria em logistica-importacao-sanitizacao.util.test.ts).
  await prisma.logisticaImportacaoItem.update({
    where: { id: item.id },
    data: { statusSanitizacao: 'VERDE', motivoProblema: null, lat: -22.41, lng: -47.56, geoFonte: 'cnefe' },
  });

  const r1 = await service.efetivarLote(COMPANY_ID, USER_ID, lote.id);
  assert.equal(r1.efetivados, 1);
  assert.equal(r1.jaEfetivados, 0);
  assert.equal(nucleo.calls.length, 1, '1ª efetivação cria a conta');

  const r2 = await service.efetivarLote(COMPANY_ID, USER_ID, lote.id);
  assert.equal(r2.efetivados, 0);
  assert.equal(r2.jaEfetivados, 1, '2ª chamada reconhece "já efetivado" — chave por lote+item');
  assert.equal(nucleo.calls.length, 1, 'createConta NÃO foi chamado de novo — zero conta duplicada');

  const depois = await service.obterLote(COMPANY_ID, lote.id, {});
  assert.equal(depois.itens[0].customerProfileId, 'conta-1');
  assert.equal(depois.lote.status, 'EFETIVADO', 'lote fecha sozinho quando não sobra verde nem pendente pra agir');
});

test('efetivarLote: dia da semana + produto resolvido cria o plano de entrega (LogisticaAgendaService#createPlan)', async () => {
  const { service, prisma, agenda } = buildService();
  const lote = await service.criarLoteTexto(COMPANY_ID, USER_ID, { texto: 'João - Rua B, 50 - Rio Claro - SP' });
  const antes = await service.obterLote(COMPANY_ID, lote.id, {});
  const item = antes.itens[0];

  await prisma.logisticaImportacaoItem.update({
    where: { id: item.id },
    data: {
      statusSanitizacao: 'VERDE', lat: -22.4, lng: -47.5, geoFonte: 'cnefe',
      diasSemana: '1,4', produtoId: 99, qtd: 2, valorUnit: 12.5,
    },
  });

  await service.efetivarLote(COMPANY_ID, USER_ID, lote.id);
  assert.equal(agenda.calls.length, 2, '2 dias da semana (1 e 4) = 2 planos');
  assert.deepEqual(agenda.calls.map((c: any) => c.input.diaSemana).sort(), [1, 4]);
  for (const c of agenda.calls) {
    assert.equal(c.input.frequencia, 'SEMANAL');
    assert.deepEqual(c.input.itens, [{ productId: 99, qtd: 2, valorUnit: 12.5 }]);
  }
});

test('efetivarLote: SEM produto resolvido, cria a conta mas NUNCA inventa plano/carrinho', async () => {
  const { service, prisma, nucleo, agenda } = buildService();
  const lote = await service.criarLoteTexto(COMPANY_ID, USER_ID, { texto: 'Ana - Rua C, 10 - Rio Claro - SP' });
  const antes = await service.obterLote(COMPANY_ID, lote.id, {});
  const item = antes.itens[0];
  await prisma.logisticaImportacaoItem.update({
    where: { id: item.id },
    data: { statusSanitizacao: 'VERDE', lat: -22.4, lng: -47.5, geoFonte: 'cnefe', diasSemana: '1' }, // sem produtoId
  });

  const r = await service.efetivarLote(COMPANY_ID, USER_ID, lote.id);
  assert.equal(r.efetivados, 1);
  assert.equal(nucleo.calls.length, 1, 'conta é criada mesmo sem produto — cliente existe, só sem rota ainda');
  assert.equal(agenda.calls.length, 0, 'sem produto resolvido, createPlan nunca é chamado (nada de carrinho inventado)');
});

test('descartarLote: fecha o lote mas NUNCA desfaz cliente já efetivado', async () => {
  const { service, prisma } = buildService();
  const lote = await service.criarLoteTexto(COMPANY_ID, USER_ID, { texto: 'Dona Maria - Rua das Flores, 123 - Rio Claro - SP' });
  const antes = await service.obterLote(COMPANY_ID, lote.id, {});
  await prisma.logisticaImportacaoItem.update({
    where: { id: antes.itens[0].id },
    data: { statusSanitizacao: 'VERDE', lat: -22.4, lng: -47.5, geoFonte: 'cnefe' },
  });
  await service.efetivarLote(COMPANY_ID, USER_ID, lote.id);

  const descartado = await service.descartarLote(COMPANY_ID, lote.id);
  assert.equal(descartado.status, 'DESCARTADO');

  const depois = await service.obterLote(COMPANY_ID, lote.id, {});
  assert.equal(depois.itens[0].customerProfileId, 'conta-1', 'conta criada continua existindo — descartar não é desfazer');
});

test('corrigirItem: PATCH revalida na hora e pode virar VERDE quando o CNEFE confirma o pino', async () => {
  const { service } = buildService();
  const lote = await service.criarLoteTexto(COMPANY_ID, USER_ID, { texto: 'Maria sem número nenhum na rua' });
  const antes = await service.obterLote(COMPANY_ID, lote.id, {});
  const item = antes.itens[0];
  assert.equal(item.statusSanitizacao, 'VERMELHO');

  __setCnefeQueryForTests(async (sql: string, params: unknown[]) => {
    if (sql.includes('FROM cnefe_uf')) return [{ status: 'carregada' }];
    if (sql.includes('cep = $1::bpchar AND numero = $2')) {
      const numero = Number(params[1]);
      return [{ logradouro: 'Rua das Flores', numero, lat: -22.41, lng: -47.56, nivel_geo: 1, municipio: 'Rio Claro' }];
    }
    return [];
  });
  try {
    const corrigido = await service.corrigirItem(COMPANY_ID, lote.id, item.id, {
      nome: 'Maria', endereco: 'Rua das Flores', numero: '123', cidade: 'Rio Claro', uf: 'SP', cep: '13990000',
    } as any);
    assert.equal(corrigido.statusSanitizacao, 'VERDE');
    assert.equal(corrigido.motivoProblema, null);
  } finally {
    __setCnefeQueryForTests(null);
  }
});

test('corrigirItem: item já efetivado não aceita mais correção (edite pela ficha do cliente)', async () => {
  const { service, prisma } = buildService();
  const lote = await service.criarLoteTexto(COMPANY_ID, USER_ID, { texto: 'Dona Maria - Rua das Flores, 123 - Rio Claro - SP' });
  const antes = await service.obterLote(COMPANY_ID, lote.id, {});
  await prisma.logisticaImportacaoItem.update({
    where: { id: antes.itens[0].id },
    data: { statusSanitizacao: 'VERDE', lat: -22.4, lng: -47.5, geoFonte: 'cnefe' },
  });
  await service.efetivarLote(COMPANY_ID, USER_ID, lote.id);

  await assert.rejects(
    () => service.corrigirItem(COMPANY_ID, lote.id, antes.itens[0].id, { nome: 'Outro nome' } as any),
    /já efetivado/i,
  );
});
