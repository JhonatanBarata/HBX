import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

// ===========================================================================
// CONTABIL — cofre de segredos (Lei do Contabil nº3). AES-256-GCM, chave em env
// `HBX_CONTABIL_VAULT_KEY` (VPS). Mesma construção do IntegrationSecretsService
// (formato `v1.iv.tag.data` em base64, chave = sha256 do env) — mantida separada
// porque o segredo fiscal (certificado A1 / credencial Serpro) NUNCA compartilha
// chave com o cofre de integrações de cliente: chaves distintas, blast radius
// menor. NUNCA logamos o valor decriptado; decrypt só em memória no momento do uso.
// ===========================================================================

export const CONTABIL_VAULT_KEY_ENV = 'HBX_CONTABIL_VAULT_KEY';

/**
 * Resolve a chave do cofre. Em NODE_ENV=test permite uma chave sintética fixa
 * (os testes exercitam a criptografia sem depender do segredo real da VPS);
 * em qualquer outro ambiente a env é OBRIGATÓRIA (fail-hard — nunca criptografar
 * segredo fiscal com chave ausente/fraca).
 */
export function resolveVaultKeySource(): string {
  const source = String(process.env[CONTABIL_VAULT_KEY_ENV] || '').trim();
  if (source) return source;
  const nodeEnv = String(process.env.NODE_ENV || '').trim().toLowerCase();
  if (nodeEnv === 'test') return 'contabil-vault-test-key-do-not-use-in-prod';
  throw new Error(
    `${CONTABIL_VAULT_KEY_ENV} é obrigatória para o cofre do Contabil (certificado A1/Serpro). Gere e guarde fora do repo (env da VPS).`,
  );
}

function deriveKey(): Buffer {
  return createHash('sha256').update(resolveVaultKeySource()).digest();
}

/**
 * Criptografa um Buffer OU string arbitrária (o .pfx é binário → Buffer; a senha
 * é string). Retorna a string opaca `v1.iv.tag.data` (base64) — o que vai pro
 * banco. `null`/vazio → `null` (campo fica não-configurado).
 */
export function vaultEncrypt(value: Buffer | string | null | undefined): string | null {
  if (value == null) return null;
  const buf = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');
  if (buf.length === 0) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(), iv);
  const encrypted = Buffer.concat([cipher.update(buf), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join('.');
}

/** Decripta p/ Buffer (uso genérico — binário do .pfx). Lança se o formato/chave não bater. */
export function vaultDecryptBuffer(value: string | null | undefined): Buffer | null {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  const [version, ivB64, tagB64, dataB64] = normalized.split('.');
  if (version !== 'v1' || !ivB64 || !tagB64 || !dataB64) {
    throw new Error('Formato de segredo do cofre inválido.');
  }
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
}

/** Decripta p/ string (senha, PEM). */
export function vaultDecrypt(value: string | null | undefined): string | null {
  const buf = vaultDecryptBuffer(value);
  return buf == null ? null : buf.toString('utf8');
}
