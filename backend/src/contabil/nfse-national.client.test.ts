import test from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync } from 'zlib';
import { NfseNationalClient, type DpsInput, type NfseTransport } from './nfse-national.client';
import { TEST_CERT_PEM, TEST_KEY_PEM } from './nfse-test-cert.fixture';
import { vaultEncrypt, vaultDecrypt, vaultDecryptBuffer } from './contabil-vault.util';

// ===========================================================================
// ACEITE — CONTABIL S6 (nfse-national.client + cofre). SEM rede: o transporte é
// MOCKADO (fake). A assinatura XMLDSIG é validada CONTRA um cert de teste
// auto-assinado (createVerify embutido em verificarAssinatura), NUNCA há chamada
// HTTP real. O cofre (AES-256-GCM) é exercitado direto (encrypt/decrypt).
// ===========================================================================

const CERT = { certPem: TEST_CERT_PEM, keyPem: TEST_KEY_PEM };

function makeDps(over: Partial<DpsInput> = {}): DpsInput {
  return {
    serie: 'HBX1',
    numero: 1,
    competencia: '2026-07',
    prestador: { cnpj: '12.345.678/0001-90', razaoSocial: 'HBX Sistemas LTDA', codigoMunicipio: '2304400' },
    tomador: { documento: '98.765.432/0001-99', nome: 'Cliente Teste' },
    servico: {
      descricao: 'Licenciamento de uso de software (SaaS HBX)',
      valorCents: 5_000_00,
      codigoTributacaoNacional: '01.05',
      cnae: '6203100',
      codigoMunicipio: '2304400',
      aliquotaIss: 0,
    },
    ambiente: 'restrita',
    ...over,
  };
}

// ---------------------------------------------------------------------------
// MONTAGEM DA DPS — dados do prestador + serviço (licenciamento CNAE 6203-1/00)
// + tomador, valores em reais, ambiente correto.
// ---------------------------------------------------------------------------

test('montarDps — inclui prestador, tomador, serviço de licenciamento e valor em reais', () => {
  const client = new NfseNationalClient(fakeTransport());
  const { xml, infId } = client.montarDps(makeDps());

  assert.ok(infId.startsWith('DPS'), 'Id do infDPS começa com DPS');
  assert.match(xml, /^<DPS xmlns="http:\/\/www\.sped\.fazenda\.gov\.br\/nfse" versao="1\.00">/);
  assert.ok(xml.includes(`<infDPS Id="${infId}">`), 'infDPS carrega o Id de referência');
  // Prestador (CNPJ só dígitos) e tomador.
  assert.ok(xml.includes('<CNPJ>12345678000190</CNPJ>'), 'CNPJ do prestador sem máscara');
  assert.ok(xml.includes('<CNPJ>98765432000199</CNPJ>'), 'CNPJ do tomador sem máscara');
  assert.ok(xml.includes('HBX Sistemas LTDA'), 'razão social do prestador');
  // Serviço: licenciamento de software (CNAE 6203-1/00 → 6203100) + código nacional.
  assert.ok(xml.includes('<CNAE>6203100</CNAE>'), 'CNAE 6203-1/00');
  assert.ok(xml.includes('<cTribNac>01.05</cTribNac>'), 'código de tributação nacional (licenciamento)');
  // Valor em REAIS com 2 casas.
  assert.ok(xml.includes('<vServ>5000.00</vServ>'), 'valor do serviço em reais');
  // Ambiente restrita → tpAmb 2.
  assert.ok(xml.includes('<tpAmb>2</tpAmb>'), 'produção-restrita = tpAmb 2');
});

test('montarDps — produção usa tpAmb 1; tomador PF (11 díg) vira CPF', () => {
  const client = new NfseNationalClient(fakeTransport());
  const { xml } = client.montarDps(makeDps({ ambiente: 'producao', tomador: { documento: '111.444.777-35', nome: 'Fulano' } }));
  assert.ok(xml.includes('<tpAmb>1</tpAmb>'), 'produção = tpAmb 1');
  assert.ok(xml.includes('<CPF>11144477735</CPF>'), 'tomador PF vira CPF');
});

test('montarDps — Id é determinístico por (prestador, série, número) e único entre notas', () => {
  const client = new NfseNationalClient(fakeTransport());
  const a = client.montarDps(makeDps({ numero: 1 })).infId;
  const a2 = client.montarDps(makeDps({ numero: 1 })).infId;
  const b = client.montarDps(makeDps({ numero: 2 })).infId;
  assert.equal(a, a2, 'mesmo (prestador,série,número) → mesmo Id');
  assert.notEqual(a, b, 'números diferentes → Ids diferentes');
});

// ---------------------------------------------------------------------------
// ASSINATURA XMLDSIG — assina com o cert de teste e VALIDA a assinatura.
// ---------------------------------------------------------------------------

test('assinarDps — injeta Signature enveloped e a assinatura é VÁLIDA contra o cert de teste', () => {
  const client = new NfseNationalClient(fakeTransport());
  const { xml, infId } = client.montarDps(makeDps());
  const assinado = client.assinarDps(xml, infId, CERT);

  assert.ok(assinado.includes('<Signature'), 'Signature presente');
  assert.ok(assinado.includes('<SignatureValue>'), 'SignatureValue presente');
  assert.ok(assinado.includes(`<Reference URI="#${infId}">`), 'Reference aponta pro infDPS');
  assert.ok(assinado.includes('rsa-sha256'), 'RSA-SHA256');
  assert.ok(assinado.includes('<X509Certificate>'), 'cert embutido no KeyInfo');
  // A assinatura fecha contra o cert de teste (round-trip completo, sem rede).
  assert.equal(client.verificarAssinatura(assinado), true, 'assinatura válida contra o cert de teste');
});

test('assinarDps — adulterar o XML QUEBRA a verificação da assinatura (digest não bate)', () => {
  const client = new NfseNationalClient(fakeTransport());
  const { xml, infId } = client.montarDps(makeDps());
  const assinado = client.assinarDps(xml, infId, CERT);

  const adulterado = assinado.replace('<vServ>5000.00</vServ>', '<vServ>9000.00</vServ>');
  assert.equal(client.verificarAssinatura(adulterado), false, 'valor adulterado invalida a assinatura');
});

// ---------------------------------------------------------------------------
// PAYLOAD — GZip+Base64 do XML assinado (o corpo do POST /nfse).
// ---------------------------------------------------------------------------

test('montarPayload — empacota o XML assinado como GZip+Base64 (round-trip)', () => {
  const client = new NfseNationalClient(fakeTransport());
  const { xml, infId } = client.montarDps(makeDps());
  const assinado = client.assinarDps(xml, infId, CERT);
  const payload = JSON.parse(client.montarPayload(assinado));

  assert.ok(payload.dpsXmlGZipB64, 'payload tem dpsXmlGZipB64');
  const desempacotado = gunzipSync(Buffer.from(payload.dpsXmlGZipB64, 'base64')).toString('utf8');
  assert.equal(desempacotado, assinado, 'GZip+Base64 desempacota exatamente o XML assinado');
});

// ---------------------------------------------------------------------------
// EMISSÃO ponta-a-ponta com transporte MOCKADO — nenhuma rede real.
// ---------------------------------------------------------------------------

test('emitir — usa o transporte injetado (mock) e devolve a chave de acesso; nada de rede', async () => {
  let capturado: any = null;
  const transport: NfseTransport = {
    async postNfse(input) {
      capturado = input;
      return { httpStatus: 200, ok: true, chaveAcesso: '3'.repeat(50), xmlRetornoGzB64: null };
    },
  };
  const client = new NfseNationalClient(transport);
  const { result, xmlAssinado } = await client.emitir(makeDps(), CERT);

  assert.equal(result.ok, true);
  assert.equal(result.chaveAcesso, '3'.repeat(50));
  assert.ok(capturado, 'transporte foi chamado');
  assert.ok(capturado.baseUrl.includes('producaorestrita'), 'ambiente restrita → base URL de produção-restrita');
  assert.equal(client.verificarAssinatura(xmlAssinado), true, 'o XML enviado estava assinado e válido');
});

// ---------------------------------------------------------------------------
// FLAG mestra — default OFF (deploy inerte).
// ---------------------------------------------------------------------------

test('isEnabled — default OFF (sem env) e liga com HBX_CONTABIL_NFSE_ENABLED=1', () => {
  delete process.env.HBX_CONTABIL_NFSE_ENABLED;
  assert.equal(NfseNationalClient.isEnabled(), false, 'default OFF');
  process.env.HBX_CONTABIL_NFSE_ENABLED = '1';
  assert.equal(NfseNationalClient.isEnabled(), true);
  delete process.env.HBX_CONTABIL_NFSE_ENABLED;
});

test('ambiente/baseUrl — default restrita; producao muda a base URL', () => {
  delete process.env.HBX_CONTABIL_NFSE_ENV;
  assert.equal(NfseNationalClient.ambiente(), 'restrita');
  assert.ok(NfseNationalClient.baseUrl('restrita').includes('producaorestrita'));
  assert.ok(NfseNationalClient.baseUrl('producao').includes('sefin.nfse.gov.br'));
  assert.ok(!NfseNationalClient.baseUrl('producao').includes('producaorestrita'));
});

// ---------------------------------------------------------------------------
// COFRE (AES-256-GCM) — segredo criptografado, nunca em claro; round-trip.
// ---------------------------------------------------------------------------

test('cofre — criptografa a senha/PFX e NUNCA guarda em claro; decripta de volta', () => {
  const senha = 'senha-super-secreta-123';
  const enc = vaultEncrypt(senha);
  assert.ok(enc, 'valor criptografado presente');
  assert.ok(!String(enc).includes(senha), 'texto cifrado não contém a senha em claro');
  assert.ok(String(enc).startsWith('v1.'), 'formato versionado v1.iv.tag.data');
  assert.equal(vaultDecrypt(enc), senha, 'decripta de volta ao original');

  // Binário (o .pfx é buffer).
  const pfx = Buffer.from([0x30, 0x82, 0x01, 0x02, 0xff, 0x00]);
  const encBin = vaultEncrypt(pfx);
  assert.deepEqual(vaultDecryptBuffer(encBin), pfx, 'buffer binário round-trip');
});

test('cofre — envelope corrompido lança (não devolve lixo silencioso)', () => {
  assert.throws(() => vaultDecrypt('v1.aaa.bbb.ccc'), /.*/);
  assert.throws(() => vaultDecrypt('formato-invalido'), /inválido/i);
  assert.equal(vaultDecrypt(''), null, 'vazio → null (campo não-configurado)');
});

function fakeTransport(): NfseTransport {
  return { async postNfse() { return { httpStatus: 200, ok: true, chaveAcesso: '3'.repeat(50) }; } };
}
