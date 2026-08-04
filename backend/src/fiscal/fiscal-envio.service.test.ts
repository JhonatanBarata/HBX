// FISCAL DO TENANT F1b — teste do ENVIO do PDF+XML ao tomador (node --test,
// zero rede): mailer e ponte do WhatsApp FAKES. Exercita: opt-in do perfil,
// canais decididos pelos dados do doc, isolamento de falha por canal (e-mail
// cair não segura o Whats e o status FISCAL da nota nunca muda) e a trilha
// envio* gravada no documento.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
import { FiscalEnvioService } from './fiscal-envio.service';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

function makeFakePrisma(perfil: Record<string, any>, docs: any[]) {
  const profiles = [{ companyId: 7, emailAutoEnvio: false, whatsAutoEnvio: false, ...perfil }];
  const documentos = docs.map((d, i) => ({
    id: `doc${i + 1}`,
    companyId: 7,
    status: 'AUTORIZADA',
    tipo: 'NFSE',
    serie: '1',
    numero: i + 1,
    valorCents: 45000,
    competencia: '2026-08',
    ambiente: 'restrita',
    prestadorRazaoSocial: 'Manutencao Rio Claro LTDA',
    prestadorCnpj: '11222333000181',
    prestadorMunicipio: 'Rio Claro/SP',
    tomadorDoc: '19131243000197',
    tomadorNome: 'Empresa Grande SA',
    tomadorEmail: null,
    tomadorFone: null,
    descricao: 'Instalação',
    xmlGzB64: gzipSync(Buffer.from('<nfse/>')).toString('base64'),
    envioEmailEm: null,
    envioEmailErro: null,
    envioWhatsEm: null,
    envioWhatsErro: null,
    emitidaEm: new Date(),
    chaveAcesso: 'NFS'.padEnd(50, '0'),
    ...d,
  }));
  return {
    _data: { profiles, documentos },
    fiscalTenantProfile: {
      findUnique: async ({ where }: any) => profiles.find((p) => p.companyId === where.companyId) || null,
    },
    fiscalDocumento: {
      findFirst: async ({ where }: any) =>
        documentos.find((d) => d.id === where.id && d.companyId === where.companyId) || null,
      update: async ({ where, data }: any) => {
        const row = documentos.find((d) => d.id === where.id);
        Object.assign(row, data);
        return { ...row };
      },
    },
  };
}

function makeFakeMailer(modo: 'ok' | 'falha' | 'explode') {
  const enviados: any[] = [];
  return {
    enviados,
    sendForCompany: async (companyId: number, message: any) => {
      if (modo === 'explode') throw new Error('SMTP fora do ar');
      enviados.push({ companyId, message });
      if (modo === 'falha') {
        return { ok: false, errorCode: 'COMPANY_EMAIL_NOT_CONFIGURED', errorMessage: 'E-mail da empresa não configurado.' };
      }
      return { ok: true, errorCode: null, errorMessage: null };
    },
  };
}

function makeFakeWebwhats(modo: 'ok' | 'explode') {
  const enviados: any[] = [];
  return {
    enviados,
    sendMedia: async (companyId: number, input: any) => {
      if (modo === 'explode') throw new Error('Nenhuma sessão WhatsApp conectada.');
      enviados.push({ companyId, input });
      return { target: input.to, response: {}, rawMessageId: 'x', providerMessageId: 'y' };
    },
  };
}

const trilhaFake = { registros: [] as any[], registrar: async function (r: any) { this.registros.push(r); } } as any;

function montar(opts: {
  perfil?: Record<string, any>;
  doc?: Record<string, any>;
  mailer?: 'ok' | 'falha' | 'explode';
  whats?: 'ok' | 'explode';
} = {}) {
  const prisma = makeFakePrisma(opts.perfil || {}, [opts.doc || {}]);
  const mailer = makeFakeMailer(opts.mailer || 'ok');
  const webwhats = makeFakeWebwhats(opts.whats || 'ok');
  const service = new FiscalEnvioService(prisma as any, mailer as any, webwhats as any, trilhaFake);
  return { prisma, mailer, webwhats, service };
}

// ---------------------------------------------------------------------------
// Opt-in do perfil (envio automático)
// ---------------------------------------------------------------------------

test('enviarAutomatico sem opt-in nenhum não faz nada', async () => {
  const { service, mailer, webwhats } = montar({ doc: { tomadorEmail: 'a@b.com', tomadorFone: '19998887766' } });
  const r = await service.enviarAutomatico(7, 'doc1', 42);
  assert.equal(r, null);
  assert.equal(mailer.enviados.length, 0);
  assert.equal(webwhats.enviados.length, 0);
});

test('enviarAutomatico respeita o opt-in POR canal (só e-mail ligado → só e-mail sai)', async () => {
  const { service, mailer, webwhats, prisma } = montar({
    perfil: { emailAutoEnvio: true },
    doc: { tomadorEmail: 'a@b.com', tomadorFone: '19998887766' },
  });
  const r = await service.enviarAutomatico(7, 'doc1', 42);
  assert.equal(r?.email.ok, true);
  assert.equal(r?.whats.tentado, false);
  assert.equal(mailer.enviados.length, 1);
  assert.equal(webwhats.enviados.length, 0);
  assert.ok(prisma._data.documentos[0].envioEmailEm, 'carimbo do e-mail gravado no doc');
});

// ---------------------------------------------------------------------------
// Conteúdo e canais decididos pelos dados
// ---------------------------------------------------------------------------

test('e-mail leva PDF + XML anexos; Whats leva o PDF como documento base64', async () => {
  const { service, mailer, webwhats } = montar({
    doc: { tomadorEmail: 'a@b.com', tomadorFone: '19998887766' },
  });
  const r = await service.enviar(7, 'doc1', { email: true, whats: true }, 42, 'manual');
  assert.equal(r.email.ok, true);
  assert.equal(r.whats.ok, true);

  const anexos = mailer.enviados[0].message.attachments;
  assert.equal(anexos.length, 2);
  assert.equal(anexos[0].filename, 'nfse-1-1.pdf');
  assert.equal(anexos[0].contentType, 'application/pdf');
  assert.ok(Buffer.isBuffer(anexos[0].content) && anexos[0].content.slice(0, 4).toString() === '%PDF');
  assert.equal(anexos[1].filename, 'nfse-1-1.xml');

  const media = webwhats.enviados[0].input;
  assert.equal(media.mediaType, 'document');
  assert.equal(media.fileName, 'nfse-1-1.pdf');
  assert.equal(media.mimeType, 'application/pdf');
  assert.equal(Buffer.from(media.media, 'base64').slice(0, 4).toString(), '%PDF');
});

test('canal não informado = decide pelos dados do doc (sem fone → só e-mail); sem contato nenhum recusa', async () => {
  const soEmail = montar({ doc: { tomadorEmail: 'a@b.com' } });
  const r = await soEmail.service.enviar(7, 'doc1', {}, null, 'manual');
  assert.equal(r.email.tentado, true);
  assert.equal(r.whats.tentado, false);

  const semNada = montar();
  await assert.rejects(() => semNada.service.enviar(7, 'doc1', {}, null, 'manual'), /sem e-mail e sem WhatsApp/i);
});

// ---------------------------------------------------------------------------
// Falha isolada por canal — status FISCAL intacto
// ---------------------------------------------------------------------------

test('e-mail falhando não segura o Whats; erro fica na trilha do doc e o status fiscal NÃO muda', async () => {
  const { service, prisma } = montar({
    mailer: 'falha',
    doc: { tomadorEmail: 'a@b.com', tomadorFone: '19998887766' },
  });
  const r = await service.enviar(7, 'doc1', { email: true, whats: true }, null, 'manual');
  assert.equal(r.email.ok, false);
  assert.match(String(r.email.erro), /não configurado/i);
  assert.equal(r.whats.ok, true);

  const doc = prisma._data.documentos[0];
  assert.equal(doc.status, 'AUTORIZADA', 'falha de envio nunca toca o status fiscal');
  assert.match(String(doc.envioEmailErro), /não configurado/i);
  assert.ok(doc.envioWhatsEm);
});

test('exceção do transporte (SMTP/ponte fora) vira erro registrado, nunca exceção pro caller', async () => {
  const { service, prisma } = montar({
    mailer: 'explode',
    whats: 'explode',
    doc: { tomadorEmail: 'a@b.com', tomadorFone: '19998887766' },
  });
  const r = await service.enviar(7, 'doc1', { email: true, whats: true }, null, 'auto');
  assert.equal(r.email.ok, false);
  assert.equal(r.whats.ok, false);
  assert.match(String(prisma._data.documentos[0].envioEmailErro), /SMTP/);
  assert.match(String(prisma._data.documentos[0].envioWhatsErro), /sessão/i);
});

// ---------------------------------------------------------------------------
// Guardas
// ---------------------------------------------------------------------------

test('só nota AUTORIZADA envia; doc de outra empresa é invisível; fone curto explica', async () => {
  const erro = montar({ doc: { status: 'ERRO', tomadorEmail: 'a@b.com' } });
  await assert.rejects(() => erro.service.enviar(7, 'doc1', { email: true }, null, 'manual'), /AUTORIZADA/);

  const outra = montar({ doc: { tomadorEmail: 'a@b.com' } });
  await assert.rejects(() => outra.service.enviar(8, 'doc1', { email: true }, null, 'manual'), /não encontrado/i);

  const foneCurto = montar({ doc: { tomadorFone: '999' } });
  const r = await foneCurto.service.enviar(7, 'doc1', { whats: true }, null, 'manual');
  assert.equal(r.whats.ok, false);
  assert.match(String(r.whats.erro), /incompleto/i);
});
