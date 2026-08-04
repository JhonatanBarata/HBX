import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { vaultDecrypt as contabilVaultDecrypt, vaultEncrypt as contabilVaultEncrypt } from '../contabil/contabil-vault.util';

// ===========================================================================
// FISCAL DO TENANT — cofre com CHAVE PRÓPRIA (revisão adversarial M1, 04/08).
// Antes o cert do tenant dividia HBX_CONTABIL_VAULT_KEY com o cofre do DONO —
// blast radius desnecessário. Agora:
//   - `HBX_FISCAL_VAULT_KEY` presente → cifra com a chave FISCAL (prefixo `f1`).
//   - env ausente → delega pro cofre do contabil (prefixo `v1`) — instalação
//     antiga continua funcionando SEM quebra; injetar a env na VPS migra os
//     PRÓXIMOS uploads (os antigos seguem decriptando pelo v1).
//   - decrypt aceita os DOIS prefixos — upload antigo e novo convivem.
// NUNCA logar valor decriptado; decrypt só em memória no momento do uso.
// ===========================================================================

export const FISCAL_VAULT_KEY_ENV = 'HBX_FISCAL_VAULT_KEY';

function fiscalKeySource(): string | null {
  const source = String(process.env[FISCAL_VAULT_KEY_ENV] || '').trim();
  if (source) return source;
  const nodeEnv = String(process.env.NODE_ENV || '').trim().toLowerCase();
  if (nodeEnv === 'test') return 'fiscal-vault-test-key-do-not-use-in-prod';
  return null; // sem env fora de teste → fallback contabil (sem quebra)
}

function deriveFiscalKey(source: string): Buffer {
  return createHash('sha256').update(source).digest();
}

export function fiscalVaultEncrypt(value: Buffer | string | null | undefined): string | null {
  if (value == null) return null;
  const source = fiscalKeySource();
  if (!source) return contabilVaultEncrypt(value);
  const buf = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');
  if (buf.length === 0) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveFiscalKey(source), iv);
  const encrypted = Buffer.concat([cipher.update(buf), cipher.final()]);
  return ['f1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.');
}

export function fiscalVaultDecrypt(value: string | null | undefined): string | null {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  if (!normalized.startsWith('f1.')) return contabilVaultDecrypt(normalized); // legado v1
  const source = fiscalKeySource();
  if (!source) {
    throw new Error(`${FISCAL_VAULT_KEY_ENV} ausente — impossível abrir segredo fiscal cifrado com a chave própria.`);
  }
  const [, ivB64, tagB64, dataB64] = normalized.split('.');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Formato de segredo do cofre fiscal inválido.');
  const decipher = createDecipheriv('aes-256-gcm', deriveFiscalKey(source), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}
