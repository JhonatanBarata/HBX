// B0 BALCÃO — RITO DE ATIVAÇÃO do modo HBX Gestão Fiscal (node --test, zero rede).
// Cobre: dígito verificador de verdade, conferência na base RFB fake (situação/
// CRT sugerido/allowlist), ativação com trilha, recusas (já ativo, política
// velha, situação BAIXADA, tipo inválido) e a TRAVA: desligar morre no primeiro
// lançamento; ligar por PUT de perfil morreu.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { FiscalProfileService } from './fiscal-profile.service';
import { cnpjDvValido } from './cnpj-dv.util';
import { POLITICA_GESTAO } from './politica-gestao';

// CNPJ com DV VÁLIDO (exemplo clássico) e a variação com DV errado.
const CNPJ_OK = '11222333000181';
const CNPJ_DV_ERRADO = '11222333000182';

function makeFakePrisma(opts: {
  rfbRow?: any | null;
  movimentos?: number;
  xmls?: number;
} = {}) {
  const profiles: any[] = [];
  let seq = 1;
  const criarPerfil = (data: Record<string, any>) => {
    const row = {
      id: `id${seq++}`, regimeCrt: 1, ambiente: 'restrita', serieDps: '1', proximoNumeroDps: 1,
      escopoServico: false, escopoProduto: false, emailAutoEnvio: false, whatsAutoEnvio: false,
      estoqueAtivo: false, estoqueNegativo: 'avisar', errosConsecutivos: 0, disjuntorPausado: false,
      cnpj: null, razaoSocial: null, inscricaoMunicipal: null, municipioIbge: null,
      certA1Encrypted: null, certA1ExpiresAt: null, tipoEmpresa: null,
      gestaoPoliticaVersao: null, gestaoPoliticaAceiteEm: null, gestaoPoliticaAceitePor: null,
      gestaoAtivadaEm: null, gestaoAtivadaPor: null,
      cnpjConferidoEm: null, cnpjSituacaoRfb: null, cnpjRfbAviso: null,
      createdAt: new Date(), updatedAt: new Date(),
      ...data,
    };
    profiles.push(row);
    return row;
  };
  const applyData = (row: any, data: Record<string, any>) => {
    Object.assign(row, data);
    row.updatedAt = new Date();
    return row;
  };
  const municipios = [{ ibge: '3543907', nome: 'Rio Claro', uf: 'SP', status: 'EM_VALIDACAO', rotaNfse: 'NACIONAL_DIRETO' }];
  return {
    _data: { profiles },
    fiscalTenantProfile: {
      findUnique: async ({ where }: any) => profiles.find((p) => p.companyId === where.companyId) || null,
      upsert: async ({ where, create }: any) => {
        const row = profiles.find((p) => p.companyId === where.companyId);
        return row ? { ...row } : { ...criarPerfil(create) };
      },
      update: async ({ where, data }: any) => {
        const row = profiles.find((p) => p.companyId === where.companyId);
        if (!row) throw new Error('perfil não encontrado');
        return { ...applyData(row, data) };
      },
    },
    fiscalMunicipio: {
      findMany: async () => municipios.map((m) => ({ ...m })),
      findUnique: async ({ where }: any) => municipios.find((m) => m.ibge === where.ibge) || null,
    },
    cnpjPublicCompany: {
      findFirst: async ({ where }: any) =>
        opts.rfbRow !== undefined ? (opts.rfbRow && opts.rfbRow.cnpj === where.cnpj ? { ...opts.rfbRow } : null) : null,
    },
    estoqueMovimento: { count: async () => opts.movimentos || 0 },
    fiscalCompraXml: { count: async () => opts.xmls || 0 },
  };
}

const RFB_RIO_CLARO = {
  cnpj: CNPJ_OK,
  razaoSocial: 'AGUA BOA DISTRIBUIDORA LTDA',
  nomeFantasia: 'Água Boa',
  situacao: 'ATIVA',
  city: 'RIO CLARO',
  state: 'SP',
  address: 'RUA 1, 100',
  email: 'contato@aguaboa.com',
  phoneDigits: '19998887766',
  simples: true,
  mei: false,
  cnae: '4723700',
  cnaeDescription: 'Comércio varejista de bebidas',
  porte: 'ME',
  naturezaJuridica: 'Sociedade Empresária Limitada',
  openedAt: new Date('2015-03-10'),
  matrizFilial: 'MATRIZ',
};

function makeTrilha() {
  const registros: any[] = [];
  return { registros, registrar: async (r: any) => { registros.push(r); } };
}

// ---------------------------------------------------------------------------
// Dígito verificador
// ---------------------------------------------------------------------------

test('cnpjDvValido: DV oficial fecha; DV errado, repetido e curto reprovam', () => {
  assert.equal(cnpjDvValido(CNPJ_OK), true);
  assert.equal(cnpjDvValido('11.222.333/0001-81'), true); // com máscara
  assert.equal(cnpjDvValido(CNPJ_DV_ERRADO), false);
  assert.equal(cnpjDvValido('00000000000000'), false);
  assert.equal(cnpjDvValido('1122233300018'), false);
});

// ---------------------------------------------------------------------------
// Conferência (EXIGIR E CONFERIR)
// ---------------------------------------------------------------------------

test('conferirCnpjGestao: DV inválido recusa ANTES de consultar a base', async () => {
  const profile = new FiscalProfileService(makeFakePrisma() as any);
  await assert.rejects(() => profile.conferirCnpjGestao(CNPJ_DV_ERRADO), /dígito verificador/i);
});

test('conferirCnpjGestao: puxa TUDO da base (situação, CRT sugerido, allowlist do município)', async () => {
  const profile = new FiscalProfileService(makeFakePrisma({ rfbRow: RFB_RIO_CLARO }) as any);
  const r: any = await profile.conferirCnpjGestao(CNPJ_OK);
  assert.equal(r.encontrada, true);
  assert.equal(r.razaoSocial, 'AGUA BOA DISTRIBUIDORA LTDA');
  assert.equal(r.situacaoAtiva, true);
  assert.equal(r.crtSugerido, 1); // Simples e não-MEI
  assert.equal(r.cnaeDescricao, 'Comércio varejista de bebidas');
  assert.equal(r.abertura, '2015-03-10');
  assert.equal(r.municipioAllowlist?.ibge, '3543907'); // RIO CLARO/SP casa com a allowlist
});

test('conferirCnpjGestao: fora da base NÃO explode — devolve aviso honesto', async () => {
  const profile = new FiscalProfileService(makeFakePrisma({ rfbRow: null }) as any);
  const r: any = await profile.conferirCnpjGestao(CNPJ_OK);
  assert.equal(r.encontrada, false);
  assert.match(r.aviso, /não localizado/i);
});

// ---------------------------------------------------------------------------
// Ativação (rito completo)
// ---------------------------------------------------------------------------

test('ativarGestao: fluxo feliz liga o modo, grava aceite/quem/quando, auto-preenche e deixa trilha', async () => {
  const prisma = makeFakePrisma({ rfbRow: RFB_RIO_CLARO });
  const trilha = makeTrilha();
  const profile = new FiscalProfileService(prisma as any, trilha as any);
  const r: any = await profile.ativarGestao(7, 42, { cnpj: CNPJ_OK, politicaVersao: POLITICA_GESTAO.versao, tipoEmpresa: 'agua' });

  assert.equal(r.ativado, true);
  assert.equal(r.aviso, null);
  assert.equal(r.perfil.modo, 'gestao');
  const row = prisma._data.profiles[0];
  assert.equal(row.estoqueAtivo, true);
  assert.equal(row.tipoEmpresa, 'agua');
  assert.equal(row.gestaoPoliticaVersao, POLITICA_GESTAO.versao);
  assert.equal(row.gestaoPoliticaAceitePor, '42');
  assert.equal(row.gestaoAtivadaPor, '42');
  assert.ok(row.cnpjConferidoEm instanceof Date);
  assert.equal(row.cnpjSituacaoRfb, 'ATIVA');
  assert.equal(row.cnpjRfbAviso, null);
  // Dados PUXADOS: razão social, CRT do Simples, município da allowlist.
  assert.equal(row.razaoSocial, 'AGUA BOA DISTRIBUIDORA LTDA');
  assert.equal(row.regimeCrt, 1);
  assert.equal(row.municipioIbge, '3543907');
  // Trilha com quem/quando.
  assert.equal(trilha.registros.length, 1);
  assert.equal(trilha.registros[0].operacao, 'ATIVAR_GESTAO_FISCAL');
  assert.equal(trilha.registros[0].aprovadoPor, '42');
});

test('ativarGestao: recusas — já ativo, política velha, tipo inválido, situação BAIXADA', async () => {
  // Situação BAIXADA na Receita → bloqueia.
  const baixada = new FiscalProfileService(
    makeFakePrisma({ rfbRow: { ...RFB_RIO_CLARO, situacao: 'BAIXADA' } }) as any,
  );
  await assert.rejects(
    () => baixada.ativarGestao(7, 42, { cnpj: CNPJ_OK, politicaVersao: POLITICA_GESTAO.versao, tipoEmpresa: 'agua' }),
    /BAIXADA.*ATIVA/,
  );

  const prisma = makeFakePrisma({ rfbRow: RFB_RIO_CLARO });
  const profile = new FiscalProfileService(prisma as any);
  await assert.rejects(
    () => profile.ativarGestao(7, 42, { cnpj: CNPJ_OK, politicaVersao: '0.9', tipoEmpresa: 'agua' }),
    /política.*mudou/i,
  );
  await assert.rejects(
    () => profile.ativarGestao(7, 42, { cnpj: CNPJ_OK, politicaVersao: POLITICA_GESTAO.versao, tipoEmpresa: 'padaria' }),
    /tipo de empresa/i,
  );
  await profile.ativarGestao(7, 42, { cnpj: CNPJ_OK, politicaVersao: POLITICA_GESTAO.versao, tipoEmpresa: 'agua' });
  await assert.rejects(
    () => profile.ativarGestao(7, 42, { cnpj: CNPJ_OK, politicaVersao: POLITICA_GESTAO.versao, tipoEmpresa: 'agua' }),
    /já está ativo/i,
  );
});

test('ativarGestao: CNPJ fora da base ativa COM aviso GRAVADO (base defasada não trava empresa nova)', async () => {
  const prisma = makeFakePrisma({ rfbRow: null });
  const trilha = makeTrilha();
  const profile = new FiscalProfileService(prisma as any, trilha as any);
  const r: any = await profile.ativarGestao(7, 42, { cnpj: CNPJ_OK, politicaVersao: POLITICA_GESTAO.versao, tipoEmpresa: 'gas' });
  assert.equal(r.ativado, true);
  assert.match(r.aviso, /não localizado/i);
  assert.match(prisma._data.profiles[0].cnpjRfbAviso, /não localizado/i);
  assert.match(trilha.registros[0].requestResumo, /AVISO_RFB/);
});

// ---------------------------------------------------------------------------
// A TRAVA (decisão 12): ligar só pelo rito; desligar morre no 1º lançamento
// ---------------------------------------------------------------------------

test('trava: ligar por PUT de perfil recusa; desligar VIRGEM pode; com lançamento NUNCA', async () => {
  // Ligar por fora do rito: recusa.
  const p1 = makeFakePrisma();
  const prof1 = new FiscalProfileService(p1 as any);
  await assert.rejects(() => prof1.updatePerfil(7, { estoqueAtivo: true }), /rito|Ativar HBX/i);

  // Virgem (zero movimento/XML): desligar é permitido — "liguei por engano".
  const p2 = makeFakePrisma({ rfbRow: RFB_RIO_CLARO, movimentos: 0, xmls: 0 });
  const prof2 = new FiscalProfileService(p2 as any);
  await prof2.ativarGestao(7, 42, { cnpj: CNPJ_OK, politicaVersao: POLITICA_GESTAO.versao, tipoEmpresa: 'agua' });
  const off = await prof2.updatePerfil(7, { estoqueAtivo: false });
  assert.equal(off.modo, 'comum');

  // Com lançamento: NUNCA mais desliga.
  const p3 = makeFakePrisma({ rfbRow: RFB_RIO_CLARO, movimentos: 3, xmls: 1 });
  const prof3 = new FiscalProfileService(p3 as any);
  await prof3.ativarGestao(7, 42, { cnpj: CNPJ_OK, politicaVersao: POLITICA_GESTAO.versao, tipoEmpresa: 'agua' });
  await assert.rejects(() => prof3.updatePerfil(7, { estoqueAtivo: false }), /não pode mais ser desligado/i);
  assert.equal(p3._data.profiles[0].estoqueAtivo, true);
});

test('trava: trocar o CNPJ depois derruba o carimbo da conferência (carimbo é do número conferido)', async () => {
  const prisma = makeFakePrisma({ rfbRow: RFB_RIO_CLARO });
  const profile = new FiscalProfileService(prisma as any);
  await profile.ativarGestao(7, 42, { cnpj: CNPJ_OK, politicaVersao: POLITICA_GESTAO.versao, tipoEmpresa: 'agua' });
  assert.ok(prisma._data.profiles[0].cnpjConferidoEm);

  await profile.updatePerfil(7, { cnpj: '99888777000166' });
  assert.equal(prisma._data.profiles[0].cnpjConferidoEm, null);
  assert.equal(prisma._data.profiles[0].cnpjSituacaoRfb, null);
});
