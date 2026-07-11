import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

// ===========================================================================
// LEADS-FINAL/06 — E-MAIL v1: cofre de credencial SMTP do usuário.
//
// AES-256-GCM com secret DEDICADO (`HBX_EMAIL_CRED_SECRET`, env da VPS). Mesma
// construção do IntegrationSecretsService/contabil-vault (`v1.iv.tag.data` em
// base64, chave = sha256 do env), porém com uma diferença de POLÍTICA:
//   - Segredo AUSENTE => feature DESLIGA GRACIOSO (padrão website-kit pós-P0).
//     NUNCA fail-hard no boot: o backend sobe, o módulo apenas se reporta OFF e
//     recusa gravar/enviar. Cifrar credencial com chave ausente/fraca é proibido
//     — sem chave, não há como conectar conta.
//
// A senha SMTP em claro só existe em memória no instante do envio; NUNCA vai
// pra log/erro (ver `sanitizeSmtpError`) e o endpoint de leitura NUNCA a devolve
// (nem cifrada).
// ===========================================================================

export const EMAIL_CRED_SECRET_ENV = 'HBX_EMAIL_CRED_SECRET';

function rawSecret(): string {
  return String(process.env[EMAIL_CRED_SECRET_ENV] || '').trim();
}

/**
 * Feature liga SÓ com o secret presente. Sem ele, o módulo de e-mail fica OFF
 * gracioso (endpoints respondem `{ enabled:false }`, gravação/teste/envio
 * recusam com mensagem clara — sem crash no boot).
 */
export function emailCredConfigured(): boolean {
  return Boolean(rawSecret());
}

function deriveKey(): Buffer {
  const source = rawSecret();
  if (!source) {
    // Só é chamado quando a feature já está ON (configured()); guarda de sanidade.
    throw new Error(`${EMAIL_CRED_SECRET_ENV} ausente — cofre de e-mail indisponível.`);
  }
  return createHash('sha256').update(source).digest();
}

/** Cifra a senha SMTP. `null`/vazio => `null` (campo não-configurado). */
export function encryptCred(value: string | null | undefined): string | null {
  const normalized = String(value ?? '').trim();
  if (!normalized) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(), iv);
  const encrypted = Buffer.concat([cipher.update(normalized, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join('.');
}

/** Decifra p/ a senha em claro (uso só no instante do envio). Lança se formato/chave não bater. */
export function decryptCred(value: string | null | undefined): string | null {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  const [version, ivB64, tagB64, dataB64] = normalized.split('.');
  if (version !== 'v1' || !ivB64 || !tagB64 || !dataB64) {
    throw new Error('Formato de credencial de e-mail inválido.');
  }
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Remove segredos (senha, e cifra opaca) de uma mensagem de erro do SMTP antes
 * de gravar/retornar/logar. Alguns servidores ecoam a credencial na resposta de
 * auth — este filtro garante que ela NUNCA vaze. Também limita o tamanho.
 */
export function sanitizeSmtpError(message: unknown, ...secrets: Array<string | null | undefined>): string {
  let out = message instanceof Error ? message.message : String(message ?? '');
  for (const secret of secrets) {
    const s = String(secret || '');
    if (s.length >= 3) out = out.split(s).join('***');
  }
  // Remove qualquer bloco que se pareça com a cifra `v1.iv.tag.data` por precaução.
  out = out.replace(/v1\.[A-Za-z0-9+/=]{8,}\.[A-Za-z0-9+/=]{8,}\.[A-Za-z0-9+/=]{8,}/g, '***');
  return out.replace(/\s+/g, ' ').trim().slice(0, 500);
}
