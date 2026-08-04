// FISCAL DO TENANT F1a — teste da CENA de emissão avulsa (node --test, zero rede).
// Transporte MOCKADO + cert de TESTE auto-assinado (fixture do contabil). O teste
// exercita: fluxo feliz (AUTORIZADA + XML assinado verificável), numeração
// atômica, gates do perfil/allowlist, DISJUNTOR (3 erros pausam; 4ª nem chama
// transporte), cancelamento com motivo e gate "sem estoque sem NF-e".
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { gunzipSync, gzipSync } from 'node:zlib';
import { NfseNationalClient, type NfseGetResult, type NfseTransport, type NfseTransportResult } from '../contabil/nfse-national.client';
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

  const criarPerfil = (data: Record<string, any>) => {
    const row = {
      id: nextId(), regimeCrt: 1, ambiente: 'restrita', serieDps: '1', proximoNumeroDps: 1,
      escopoServico: false, escopoProduto: false, emailAutoEnvio: false, whatsAutoEnvio: false,
      estoqueAtivo: false, estoqueNegativo: 'avisar', errosConsecutivos: 0, disjuntorPausado: false,
      cnpj: null, razaoSocial: null, inscricaoMunicipal: null, municipioIbge: null,
      certA1Encrypted: null, certA1ExpiresAt: null, createdAt: new Date(), updatedAt: new Date(),
      ...data,
    };
    profiles.push(row);
    return row;
  };

  return {
    _data: { profiles, servicos, documentos, municipios },
    fiscalTenantProfile: {
      findUnique: async ({ where }: any) => profiles.find((p) => p.companyId === where.companyId) || null,
      create: async ({ data }: any) => ({ ...criarPerfil(data) }),
      upsert: async ({ where, create, update }: any) => {
        const row = profiles.find((p) => p.companyId === where.companyId);
        if (row) {
          if (update && Object.keys(update).length) applyData(row, update);
          return { ...row };
        }
        return { ...criarPerfil(create) };
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
        // UNIQUEs do schema (originKey/chaveAcesso) — o dedup do FECHAMENTO vai
        // depender do P2002; fake sem unique seria teatro (achado do verificador).
        for (const campo of ['originKey', 'chaveAcesso'] as const) {
          if (data[campo] != null && documentos.some((d) => d[campo] === data[campo])) {
            const err: any = new Error('unique');
            err.code = 'P2002';
            throw err;
          }
        }
        const row = { id: nextId(), status: 'PENDENTE', tentativas: 0, chaveAcesso: null, xmlGzB64: null, erroMsg: null, emitidaEm: null, canceladaEm: null, motivoCancelamento: null, createdAt: new Date(), updatedAt: new Date(), ...data };
        documentos.push(row);
        return { ...row };
      },
      update: async ({ where, data }: any) => {
        const row = documentos.find((d) => d.id === where.id);
        return { ...applyData(row, data) };
      },
      updateMany: async ({ where, data }: any) => {
        const rows = documentos.filter((d) => {
          if (where.id != null && d.id !== where.id) return false;
          if (where.companyId != null && d.companyId !== where.companyId) return false;
          if (where.OR) {
            return where.OR.some((cond: any) => {
              if (cond.status && typeof cond.status === 'object' && 'in' in cond.status) {
                return cond.status.in.includes(d.status);
              }
              if (typeof cond.status === 'string') {
                if (d.status !== cond.status) return false;
                if (cond.updatedAt?.lt) return new Date(d.updatedAt).getTime() < new Date(cond.updatedAt.lt).getTime();
                return true;
              }
              return false;
            });
          }
          return true;
        });
        for (const r of rows) applyData(r, data);
        return { count: rows.length };
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
  constructor(protected readonly modo: 'ok' | 'falha' | 'timeout') {}
  async postNfse(): Promise<NfseTransportResult> {
    this.calls += 1;
    if (this.modo === 'ok') {
      return { httpStatus: 201, ok: true, chaveAcesso: 'NFS'.padEnd(50, '0'), xmlRetornoGzB64: null, erro: null };
    }
    if (this.modo === 'timeout') {
      return { httpStatus: 0, ok: false, chaveAcesso: null, xmlRetornoGzB64: null, erro: 'timeout' };
    }
    return { httpStatus: 500, ok: false, chaveAcesso: null, xmlRetornoGzB64: null, erro: 'indisponivel' };
  }
}

const trilhaFake = { registrar: async () => undefined } as any;

async function montarCenario(modo: 'ok' | 'falha' | 'timeout', overridesPerfil: Record<string, any> = {}) {
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
// A3 — timeout não prova falha: aviso anti-duplicata + snapshot do prestador
// ---------------------------------------------------------------------------

test('timeout carrega aviso anti-duplicata; erro comum não; snapshot do prestador fica no doc', async () => {
  const cenTimeout = await montarCenario('timeout');
  const docTimeout = await cenTimeout.service.emitirAvulsa(7, null, inputBase(cenTimeout.servico.id));
  assert.equal(docTimeout.status, 'ERRO');
  assert.match(String((docTimeout as any).aviso || ''), /PODE ter sido emitida/i);

  const cenFalha = await montarCenario('falha');
  const docFalha = await cenFalha.service.emitirAvulsa(7, null, inputBase(cenFalha.servico.id));
  assert.equal(docFalha.status, 'ERRO');
  assert.equal((docFalha as any).aviso, undefined);

  // A2: snapshot do prestador gravado na emissão (a DANFSe não muda com o perfil).
  const raw = cenTimeout.prisma._data.documentos[0];
  assert.equal(raw.prestadorRazaoSocial, 'Manutencao Rio Claro LTDA');
  assert.equal(raw.prestadorCnpj, '11222333000181');
  assert.equal(raw.prestadorMunicipio, 'Rio Claro/SP');
});

// ---------------------------------------------------------------------------
// F1b — RECONCILIAÇÃO PÓS-TIMEOUT (conferir na Sefin) + envio automático
// ---------------------------------------------------------------------------

/** Transporte que também responde a CONSULTA (getJson) — cenário da reconciliação. */
class FakeTransportConsulta extends FakeTransport {
  constructor(modo: 'ok' | 'falha' | 'timeout', private readonly consulta: 'achou' | 'nao-achou' | 'indisponivel') {
    super(modo);
  }
  async getJson(input: { path: string }): Promise<NfseGetResult> {
    if (this.consulta === 'indisponivel') return { httpStatus: 0, bodyJson: null, erro: 'timeout' };
    if (input.path.startsWith('/dps/')) {
      if (this.consulta === 'achou') return { httpStatus: 200, bodyJson: { chaveAcesso: 'NFS'.padEnd(50, '9') }, erro: null };
      return { httpStatus: 404, bodyJson: null, erro: null };
    }
    if (input.path.startsWith('/nfse/')) {
      return { httpStatus: 200, bodyJson: { nfseXmlGZipB64: gzipSync(Buffer.from('<nfse-recuperada/>')).toString('base64') }, erro: null };
    }
    return { httpStatus: 500, bodyJson: null, erro: 'HTTP 500' };
  }
}

/** Monta um 2º service sobre o MESMO estado fake, trocando só o transporte. */
function serviceComConsulta(cenario: Awaited<ReturnType<typeof montarCenario>>, consulta: 'achou' | 'nao-achou' | 'indisponivel') {
  const transport = new FakeTransportConsulta('timeout', consulta);
  const client = new NfseNationalClient(transport);
  return new FiscalNfseService(cenario.prisma as any, cenario.profile, client, trilhaFake);
}

test('chave da DPS segue o layout nacional (45 chars, derivável dos dados do doc)', () => {
  const chave = NfseNationalClient.chaveDps({ municipioIbge: '3543907', documento: '11222333000181', serie: '1', numero: 7 });
  assert.equal(chave, 'DPS3543907211222333000181' + '00001' + '000000000000007');
  assert.equal(chave.length, 45);
});

test('conferir na Sefin: nota EXISTE → doc recuperado como AUTORIZADA, XML salvo, disjuntor desarmado, sem reemissão', async () => {
  const cenario = await montarCenario('timeout');
  const docTimeout = await cenario.service.emitirAvulsa(7, null, inputBase(cenario.servico.id));
  assert.equal(docTimeout.status, 'ERRO');

  // Simula o pior caso: os timeouts armaram o disjuntor antes da conferência.
  cenario.prisma._data.profiles[0].errosConsecutivos = 3;
  cenario.prisma._data.profiles[0].disjuntorPausado = true;

  const svc = serviceComConsulta(cenario, 'achou');
  const conferido = await svc.conferirNaSefin(7, 42, docTimeout.id);
  assert.equal(conferido.status, 'AUTORIZADA');
  assert.ok(conferido.chaveAcesso);
  assert.equal((conferido as any).sefinTemNota, true);
  assert.match(String((conferido as any).aviso || ''), /NÃO reemita/i);

  const raw = cenario.prisma._data.documentos[0];
  assert.equal(gunzipSync(Buffer.from(raw.xmlGzB64, 'base64')).toString('utf8'), '<nfse-recuperada/>');
  assert.equal(raw.erroMsg, null);
  // Falso alarme comprovado: contador zerado e disjuntor desarmado.
  assert.equal(cenario.prisma._data.profiles[0].errosConsecutivos, 0);
  assert.equal(cenario.prisma._data.profiles[0].disjuntorPausado, false);
});

test('conferir na Sefin: nota NÃO existe → segue ERRO, aviso anti-duplicata sai de cena e reemitir fica liberado', async () => {
  const cenario = await montarCenario('timeout');
  const docTimeout = await cenario.service.emitirAvulsa(7, null, inputBase(cenario.servico.id));

  const svc = serviceComConsulta(cenario, 'nao-achou');
  const conferido = await svc.conferirNaSefin(7, null, docTimeout.id);
  assert.equal(conferido.status, 'ERRO');
  assert.equal((conferido as any).sefinTemNota, false);
  assert.match(String((conferido as any).aviso || ''), /reemitir com segurança/i);

  // erroMsg reescrito SEM "timeout": na listagem o aviso anti-duplicata some.
  const listado = (await svc.listarDocumentos(7))[0];
  assert.equal((listado as any).aviso, undefined);
  assert.match(String(listado.erroMsg || ''), /não consta/i);
});

test('conferir na Sefin: consulta indisponível não muda o documento; AUTORIZADA recusa conferência', async () => {
  const cenario = await montarCenario('timeout');
  const docTimeout = await cenario.service.emitirAvulsa(7, null, inputBase(cenario.servico.id));

  const svc = serviceComConsulta(cenario, 'indisponivel');
  const conferido = await svc.conferirNaSefin(7, null, docTimeout.id);
  assert.equal(conferido.status, 'ERRO');
  assert.equal((conferido as any).sefinTemNota, null);
  assert.match(String((conferido as any).aviso || ''), /não respondeu/i);

  const cenOk = await montarCenario('ok');
  const docOk = await cenOk.service.emitirAvulsa(7, null, inputBase(cenOk.servico.id));
  const svcOk = serviceComConsulta(cenOk, 'achou');
  await assert.rejects(() => svcOk.conferirNaSefin(7, null, docOk.id), /ERRO/);
});

test('M2: guarda de corrida — transmitir por cima de AUTORIZADA é recusado (2º clique não sobrescreve)', async () => {
  const cenario = await montarCenario('ok');
  const doc = await cenario.service.emitirAvulsa(7, null, inputBase(cenario.servico.id));
  assert.equal(doc.status, 'AUTORIZADA');
  await assert.rejects(
    () => (cenario.service as any).transmitir(7, null, doc.id),
    /em transmissão ou finalizado/,
  );
  assert.equal(cenario.prisma._data.documentos[0].status, 'AUTORIZADA', 'nada sobrescreveu');
});

test('M5: PENDENTE/TRANSMITINDO travado (>5min — restart no meio do POST) pode reemitir', async () => {
  const cenario = await montarCenario('ok');
  const velho = new Date(Date.now() - 10 * 60 * 1000);
  cenario.prisma._data.documentos.push({
    id: 'travado', companyId: 7, tipo: 'NFSE', origem: 'AVULSA', originKey: 'avulsa:travado',
    status: 'TRANSMITINDO', tentativas: 1, serie: '1', numero: 99, competencia: '2026-08',
    tomadorDoc: '19131243000197', tomadorNome: 'Empresa Grande SA', tomadorEmail: null, tomadorFone: null,
    servicoId: cenario.servico.id, descricao: 'Instalação', valorCents: 45000, ambiente: 'restrita',
    chaveAcesso: null, xmlGzB64: null, erroMsg: null, emitidaEm: null, canceladaEm: null,
    motivoCancelamento: null, createdAt: velho, updatedAt: velho,
  });
  const re = await cenario.service.reemitir(7, null, 'travado');
  assert.equal(re.status, 'AUTORIZADA', 'doc travado destravou pela reemissão');
});

test('M2: REJEITADA (reemiti sem conferir → Sefin recusou duplicidade) TEM saída — conferir recupera a nota', async () => {
  const cenario = await montarCenario('timeout');
  const doc = await cenario.service.emitirAvulsa(7, null, inputBase(cenario.servico.id));
  cenario.prisma._data.documentos[0].status = 'REJEITADA'; // desfecho do reemitir às cegas
  const svc = serviceComConsulta(cenario, 'achou');
  const conferido = await svc.conferirNaSefin(7, null, doc.id);
  assert.equal(conferido.status, 'AUTORIZADA');
  assert.equal((conferido as any).sefinTemNota, true);
});

test('município BLOQUEADO recusa emissão antes do transporte (cidade "desmoronada")', async () => {
  const { prisma, service, transport, servico } = await montarCenario('ok');
  prisma._data.municipios.find((m: any) => m.ibge === '3543907').status = 'BLOQUEADO';
  await assert.rejects(() => service.emitirAvulsa(7, null, inputBase(servico.id)), /não liberado/);
  assert.equal(transport.calls, 0);
});

test('perfil trocou de CNPJ depois do timeout → conferência recusa (chave sairia errada; 404 falso = duplicata)', async () => {
  const cenario = await montarCenario('timeout');
  const docTimeout = await cenario.service.emitirAvulsa(7, null, inputBase(cenario.servico.id));

  cenario.prisma._data.profiles[0].cnpj = '19131243000197'; // trocou depois da emissão
  const svc = serviceComConsulta(cenario, 'nao-achou');
  await assert.rejects(() => svc.conferirNaSefin(7, null, docTimeout.id), /portal gov\.br\/nfse/);
  assert.equal(cenario.prisma._data.documentos[0].status, 'ERRO', 'documento fica como estava');
});

test('M1: município trocado pós-timeout NÃO gera 404 falso — a chave usa o IBGE do SNAPSHOT', async () => {
  const cenario = await montarCenario('timeout');
  const docTimeout = await cenario.service.emitirAvulsa(7, null, inputBase(cenario.servico.id));
  assert.equal(cenario.prisma._data.documentos[0].prestadorMunicipioIbge, '3543907', 'snapshot gravado na emissão');

  cenario.prisma._data.profiles[0].municipioIbge = '3550308'; // mudança cadastral legítima (mesmo CNPJ)
  const svc = serviceComConsulta(cenario, 'achou');
  const conferido = await svc.conferirNaSefin(7, null, docTimeout.id);
  assert.equal(conferido.status, 'AUTORIZADA', 'nota recuperada pela chave do snapshot — sem "reemitir é seguro" falso');
});

test('emissão AUTORIZADA dispara o envio automático (fire-and-forget) com a empresa e o doc certos', async () => {
  const cenario = await montarCenario('ok');
  const chamadas: any[] = [];
  const envioFake = { enviarAutomatico: async (...args: any[]) => { chamadas.push(args); return null; } } as any;
  const service = new FiscalNfseService(cenario.prisma as any, cenario.profile, cenario.client, trilhaFake, envioFake);

  const doc = await service.emitirAvulsa(7, 42, { ...inputBase(cenario.servico.id), tomadorFone: '19998887766' });
  assert.equal(doc.status, 'AUTORIZADA');
  assert.equal((doc as any).tomadorFone, '19998887766');
  await new Promise((r) => setImmediate(r));
  assert.equal(chamadas.length, 1);
  assert.deepEqual(chamadas[0], [7, doc.id, 42]);

  // Fone torto recusa ANTES de reservar numeração.
  await assert.rejects(
    () => service.emitirAvulsa(7, null, { ...inputBase(cenario.servico.id), tomadorFone: '999' }),
    /WhatsApp do tomador/,
  );
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
