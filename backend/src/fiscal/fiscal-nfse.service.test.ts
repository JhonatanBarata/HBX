// FISCAL DO TENANT F1a — teste da CENA de emissão avulsa (node --test, zero rede).
// Transporte MOCKADO + cert de TESTE auto-assinado (fixture do contabil). O teste
// exercita: fluxo feliz (AUTORIZADA + XML assinado verificável), numeração
// atômica, gates do perfil/allowlist, DISJUNTOR (3 erros pausam; 4ª nem chama
// transporte), cancelamento com motivo e gate "sem estoque sem NF-e".
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { gunzipSync } from 'node:zlib';
import { NfseNationalClient, type NfseTransport, type NfseTransportResult } from '../contabil/nfse-national.client';
import { TEST_CERT_PEM, TEST_KEY_PEM } from '../contabil/nfse-test-cert.fixture';
import { vaultEncrypt } from '../contabil/contabil-vault.util';
import { FiscalProfileService } from './fiscal-profile.service';
import { FiscalNfseService } from './fiscal-nfse.service';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

function makeFakePrisma() {
  const profiles: any[] = [];
  const servicos: any[] = [];
  const documentos: any[] = [];
  const municipios: any[] = [];
  let seq = 1;
  const nextId = () => `id${seq++}`;

  const applyData = (row: any, data: Record<string, any>) => {
    for (const [k, v] of Object.entries(data)) {
      if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && 'increment' in v) {
        row[k] = (Number(row[k]) || 0) + Number((v as any).increment);
      } else {
        row[k] = v;
      }
    }
    row.updatedAt = new Date();
    return row;
  };
  const matches = (row: any, where: Record<string, any>) => Object.entries(where || {}).every(([k, v]) => row[k] === v);

  return {
    _data: { profiles, servicos, documentos, municipios },
    fiscalTenantProfile: {
      findUnique: async ({ where }: any) => profiles.find((p) => p.companyId === where.companyId) || null,
      create: async ({ data }: any) => {
        const row = {
          id: nextId(), regimeCrt: 1, ambiente: 'restrita', serieDps: '1', proximoNumeroDps: 1,
          escopoServico: false, escopoProduto: false, emailAutoEnvio: false, whatsAutoEnvio: false,
          estoqueAtivo: false, estoqueNegativo: 'avisar', errosConsecutivos: 0, disjuntorPausado: false,
          cnpj: null, razaoSocial: null, inscricaoMunicipal: null, municipioIbge: null,
          certA1Encrypted: null, certA1ExpiresAt: null, createdAt: new Date(), updatedAt: new Date(),
          ...data,
        };
        profiles.push(row);
        return { ...row };
      },
      update: async ({ where, data }: any) => {
        const row = profiles.find((p) => p.companyId === where.companyId);
        if (!row) throw new Error('perfil não encontrado');
        return { ...applyData(row, data) };
      },
    },
    fiscalServicoCatalogo: {
      findFirst: async ({ where }: any) => servicos.find((s) => matches(s, where)) || null,
      findMany: async ({ where }: any) => servicos.filter((s) => matches(s, where)),
      create: async ({ data }: any) => {
        const row = { id: nextId(), ativo: true, issRetido: false, aliquotaIss: null, createdAt: new Date(), updatedAt: new Date(), ...data };
        servicos.push(row);
        return { ...row };
      },
      update: async ({ where, data }: any) => {
        const row = servicos.find((s) => s.id === where.id);
        return { ...applyData(row, data) };
      },
    },
    fiscalDocumento: {
      findFirst: async ({ where }: any) => documentos.find((d) => matches(d, where)) || null,
      findMany: async ({ where }: any) => documentos.filter((d) => matches(d, where)),
      create: async ({ data }: any) => {
        const row = { id: nextId(), status: 'PENDENTE', tentativas: 0, chaveAcesso: null, xmlGzB64: null, erroMsg: null, emitidaEm: null, canceladaEm: null, motivoCancelamento: null, createdAt: new Date(), updatedAt: new Date(), ...data };
        documentos.push(row);
        return { ...row };
      },
      update: async ({ where, data }: any) => {
        const row = documentos.find((d) => d.id === where.id);
        return { ...applyData(row, data) };
      },
    },
    fiscalMunicipio: {
      findUnique: async ({ where }: any) => municipios.find((m) => m.ibge === where.ibge) || null,
      findMany: async () => [...municipios],
      upsert: async ({ where, create }: any) => {
        const found = municipios.find((m) => m.ibge === where.ibge);
        if (found) return { ...found };
        const row = { id: nextId(), rotaNfse: 'NACIONAL_DIRETO', status: 'EM_VALIDACAO', obs: null, createdAt: new Date(), updatedAt: new Date(), ...create };
        municipios.push(row);
        return { ...row };
      },
    },
    cnpjPublicCompany: {
      findFirst: async () => null,
    },
  };
}

class FakeTransport implements NfseTransport {
  calls = 0;
  constructor(private readonly modo: 'ok' | 'falha') {}
  async postNfse(): Promise<NfseTransportResult> {
    this.calls += 1;
    if (this.modo === 'ok') {
      return { httpStatus: 201, ok: true, chaveAcesso: 'NFS'.padEnd(50, '0'), xmlRetornoGzB64: null, erro: null };
    }
    return { httpStatus: 500, ok: false, chaveAcesso: null, xmlRetornoGzB64: null, erro: 'indisponivel' };
  }
}

const trilhaFake = { registrar: async () => undefined } as any;

async function montarCenario(modo: 'ok' | 'falha', overridesPerfil: Record<string, any> = {}) {
  const prisma = makeFakePrisma();
  const profile = new FiscalProfileService(prisma as any);
  const transport = new FakeTransport(modo);
  const client = new NfseNationalClient(transport);
  const service = new FiscalNfseService(prisma as any, profile, client, trilhaFake);

  await profile.onModuleInit(); // seed Rio Claro na allowlist

  const envelope = JSON.stringify({ v: 1, certPem: vaultEncrypt(TEST_CERT_PEM), keyPem: vaultEncrypt(TEST_KEY_PEM), senha: vaultEncrypt('teste') });
  await prisma.fiscalTenantProfile.create({
    data: {
      companyId: 7,
      cnpj: '11222333000181',
      razaoSocial: 'Manutencao Rio Claro LTDA',
      municipioIbge: '3543907',
      escopoServico: true,
      certA1Encrypted: envelope,
      certA1ExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      ...overridesPerfil,
    },
  });
  const servico = await prisma.fiscalServicoCatalogo.create({
    data: { companyId: 7, descricao: 'Instalação de ar-condicionado', codigoTributacaoNacional: '14.01', cnae: '4322302', aliquotaIss: 0.02 },
  });
  return { prisma, profile, transport, client, service, servico };
}

const inputBase = (servicoId: string) => ({
  tomadorDoc: '19131243000197',
  tomadorNome: 'Empresa Grande SA',
  servicoId,
  valorCents: 45000,
});

// ---------------------------------------------------------------------------
// CENA feliz
// ---------------------------------------------------------------------------

test('emissão avulsa feliz: AUTORIZADA, chave salva, XML assinado verificável, numeração avança', async () => {
  const { prisma, service, client, servico } = await montarCenario('ok');

  const doc = await service.emitirAvulsa(7, 42, inputBase(servico.id));
  assert.equal(doc.status, 'AUTORIZADA');
  assert.equal(doc.numero, 1);
  assert.ok(doc.chaveAcesso);
  assert.equal(doc.competencia.length, 7); // YYYY-MM
  assert.match(doc.competencia, /^\d{4}-\d{2}$/);

  // XML guardado é o ASSINADO — assinatura fecha contra o cert de teste.
  const raw = prisma._data.documentos[0];
  const xml = gunzipSync(Buffer.from(raw.xmlGzB64, 'base64')).toString('utf8');
  assert.ok(client.verificarAssinatura(xml), 'assinatura da DPS deve verificar');
  assert.ok(xml.includes('<tpAmb>2</tpAmb>'), 'restrita => tpAmb 2');

  const doc2 = await service.emitirAvulsa(7, 42, inputBase(servico.id));
  assert.equal(doc2.numero, 2, 'numeração atômica avança');
  assert.equal(prisma._data.profiles[0].proximoNumeroDps, 3);
});

// ---------------------------------------------------------------------------
// Gates do perfil e da allowlist
// ---------------------------------------------------------------------------

test('perfil incompleto ou escopo desligado recusam ANTES de qualquer transporte', async () => {
  const { service, transport, servico } = await montarCenario('ok', { escopoServico: false });
  await assert.rejects(() => service.emitirAvulsa(7, null, inputBase(servico.id)), /desligada/);
  assert.equal(transport.calls, 0);
});

test('município fora da allowlist recusa; produção exige HOMOLOGADO; restrita aceita EM_VALIDACAO', async () => {
  const { prisma, service, servico } = await montarCenario('ok', { municipioIbge: '9999999' });
  await assert.rejects(() => service.emitirAvulsa(7, null, inputBase(servico.id)), /não liberado/);

  prisma._data.profiles[0].municipioIbge = '3543907';
  prisma._data.profiles[0].ambiente = 'producao';
  await assert.rejects(() => service.emitirAvulsa(7, null, inputBase(servico.id)), /homologação/);

  prisma._data.profiles[0].ambiente = 'restrita';
  const doc = await service.emitirAvulsa(7, null, inputBase(servico.id));
  assert.equal(doc.status, 'AUTORIZADA');
});

test('cidade roteada para PROVEDOR responde o stub honesto (tomada da F2b)', async () => {
  const { prisma, service, servico } = await montarCenario('ok');
  prisma._data.municipios.find((m: any) => m.ibge === '3543907').rotaNfse = 'PROVEDOR';
  await assert.rejects(() => service.emitirAvulsa(7, null, inputBase(servico.id)), /PROVEDOR_NAO_CONTRATADO/);
});

// ---------------------------------------------------------------------------
// DISJUNTOR
// ---------------------------------------------------------------------------

test('disjuntor: 3 erros consecutivos pausam; 4ª emissão recusa SEM chamar transporte; rearmar libera', async () => {
  const { prisma, profile, service, transport, servico } = await montarCenario('falha');

  for (let i = 0; i < 3; i += 1) {
    const doc = await service.emitirAvulsa(7, null, inputBase(servico.id));
    assert.equal(doc.status, 'ERRO');
  }
  assert.equal(transport.calls, 3);
  assert.equal(prisma._data.profiles[0].disjuntorPausado, true, '3º erro arma o disjuntor');

  await assert.rejects(() => service.emitirAvulsa(7, null, inputBase(servico.id)), /disjuntor/i);
  assert.equal(transport.calls, 3, '4ª tentativa NÃO chega no transporte');

  await profile.rearmarDisjuntor(7);
  assert.equal(prisma._data.profiles[0].disjuntorPausado, false);
  assert.equal(prisma._data.profiles[0].errosConsecutivos, 0);
});

test('sucesso zera a contagem de erros consecutivos', async () => {
  const cenario = await montarCenario('falha');
  const docErro = await cenario.service.emitirAvulsa(7, null, inputBase(cenario.servico.id));
  assert.equal(docErro.status, 'ERRO');
  assert.equal(cenario.prisma._data.profiles[0].errosConsecutivos, 1);

  // Troca o transporte por um que funciona (mesmo client — transporte é injetado só no construtor,
  // então montamos um client novo apontando pro MESMO estado fake).
  const transportOk = new FakeTransport('ok');
  const clientOk = new NfseNationalClient(transportOk);
  const serviceOk = new FiscalNfseService(cenario.prisma as any, cenario.profile, clientOk, trilhaFake);
  const doc = await serviceOk.emitirAvulsa(7, null, inputBase(cenario.servico.id));
  assert.equal(doc.status, 'AUTORIZADA');
  assert.equal(cenario.prisma._data.profiles[0].errosConsecutivos, 0);
});

// ---------------------------------------------------------------------------
// Reemissão e cancelamento
// ---------------------------------------------------------------------------

test('reemitir só ERRO/REJEITADA e respeita o teto de tentativas', async () => {
  const cenario = await montarCenario('falha');
  const docErro = await cenario.service.emitirAvulsa(7, null, inputBase(cenario.servico.id));
  assert.equal(docErro.status, 'ERRO');
  assert.equal(docErro.tentativas, 1);

  const docErro2 = await cenario.service.emitirAvulsa(7, null, inputBase(cenario.servico.id));
  await cenario.profile.rearmarDisjuntor(7); // 2 erros ainda não pausam; garante estado limpo
  assert.equal(docErro2.status, 'ERRO');

  const re = await cenario.service.reemitir(7, null, docErro.id);
  assert.equal(re.tentativas, 2);

  const re2 = await cenario.service.reemitir(7, null, docErro.id);
  assert.equal(re2.tentativas, 3);
  await cenario.profile.rearmarDisjuntor(7);
  await assert.rejects(() => cenario.service.reemitir(7, null, docErro.id), /tentativas/);
});

test('cancelamento exige motivo e só AUTORIZADA; rastro fica no documento', async () => {
  const { service, servico } = await montarCenario('ok');
  const doc = await service.emitirAvulsa(7, null, inputBase(servico.id));

  await assert.rejects(() => service.cancelar(7, doc.id, '  '), /motivo/i);
  const cancelada = await service.cancelar(7, doc.id, 'Cliente pediu o serviço de volta');
  assert.equal(cancelada.status, 'CANCELADA');
  assert.equal(cancelada.motivoCancelamento, 'Cliente pediu o serviço de volta');
  await assert.rejects(() => service.cancelar(7, doc.id, 'De novo'), /AUTORIZADA/);
});

// ---------------------------------------------------------------------------
// Gate do estoque (decisão do dono: sem controle sem NF-e)
// ---------------------------------------------------------------------------

test('gate duro: escopoProduto sem estoqueAtivo é recusado e NÃO fica ligado', async () => {
  const { prisma, profile } = await montarCenario('ok');
  await assert.rejects(() => profile.updatePerfil(7, { escopoProduto: true }), /estoque/i);
  assert.equal(prisma._data.profiles[0].escopoProduto, false);

  const ok = await profile.updatePerfil(7, { estoqueAtivo: true, escopoProduto: true });
  assert.equal(ok.escopoProduto, true);
});

// ---------------------------------------------------------------------------
// Isolamento multi-tenant (nada atravessa empresa)
// ---------------------------------------------------------------------------

test('documento e serviço de outra empresa são invisíveis (404/recusa)', async () => {
  const { prisma, service, servico } = await montarCenario('ok');
  const doc = await service.emitirAvulsa(7, null, inputBase(servico.id));

  await assert.rejects(() => service.cancelar(8, doc.id, 'tentativa de outra empresa'), /não encontrado/i);
  await assert.rejects(() => service.getXml(8, doc.id), /não encontrado/i);
  const listaOutra = await service.listarDocumentos(8);
  assert.equal(listaOutra.length, 0);
  assert.equal(prisma._data.documentos.length, 1);
});
