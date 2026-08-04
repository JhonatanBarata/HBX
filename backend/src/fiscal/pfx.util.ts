import { X509Certificate } from 'crypto';
import { execFile } from 'child_process';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

// ===========================================================================
// FISCAL DO TENANT — extração de PKCS#12 (.pfx) → PEM via OpenSSL.
// Mesma mecânica do cofre do contabil (nfse-cert.service.ts), reescrita como
// função PURA porque lá ela é privada e amarrada ao FiscalProfile singleton do
// dono; aqui serve N tenants. Senha SEMPRE por STDIN (nunca em argv — visível
// em `ps`); temporários apagados no finally; OpenSSL 3 pode exigir `-legacy`
// p/ .pfx antigos (RC2/3DES) — tentamos moderno e caímos pro legacy.
// ===========================================================================

export const MAX_PFX_BYTES = 512 * 1024; // A1 real é << 100KB; teto de sanidade.

export interface PfxMaterial {
  certPem: string;
  keyPem: string;
  expiresAt: Date;
  subject: string;
}

export async function extrairMaterialDoPfx(pfxBuffer: Buffer, senha: string): Promise<PfxMaterial> {
  const dir = await mkdtemp(join(tmpdir(), 'hbx-fiscal-cert-'));
  const pfxPath = join(dir, 'in.pfx');
  try {
    await writeFile(pfxPath, pfxBuffer);
    let bundlePem: string;
    try {
      bundlePem = await opensslPkcs12ToPem(pfxPath, senha, false);
    } catch {
      bundlePem = await opensslPkcs12ToPem(pfxPath, senha, true);
    }
    const certPem = extrairBloco(bundlePem, 'CERTIFICATE');
    const keyPem = extrairChavePrivada(bundlePem);
    if (!certPem || !keyPem) throw new Error('cert/key não encontrados no PKCS#12');

    const x509 = new X509Certificate(certPem);
    const expiresAt = new Date(x509.validTo);
    if (Number.isNaN(expiresAt.getTime())) throw new Error('validade do certificado ilegível');
    return { certPem, keyPem, expiresAt, subject: x509.subject };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => { /* noop */ });
  }
}

function opensslPkcs12ToPem(pfxPath: string, senha: string, legacy: boolean): Promise<string> {
  const openssl = process.env.HBX_OPENSSL_BIN || 'openssl';
  const args = ['pkcs12', '-in', pfxPath, '-nodes', '-passin', 'stdin'];
  if (legacy) args.push('-legacy');
  return new Promise<string>((resolve, reject) => {
    const child = execFile(openssl, args, { maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`openssl pkcs12 falhou${stderr ? `: ${String(stderr).slice(0, 80)}` : ''}`));
      resolve(String(stdout));
    });
    child.stdin?.end(`${senha}\n`);
  });
}

function extrairBloco(pem: string, tipo: 'CERTIFICATE'): string | null {
  const re = new RegExp(`-----BEGIN ${tipo}-----[\\s\\S]*?-----END ${tipo}-----`);
  const m = re.exec(pem);
  return m ? m[0] + '\n' : null;
}

function extrairChavePrivada(pem: string): string | null {
  const re = /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC )?PRIVATE KEY-----/;
  const m = re.exec(pem);
  return m ? m[0] + '\n' : null;
}
