import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

@Injectable()
export class IntegrationSecretsService {
  private deriveKey() {
    const source = String(process.env.INTEGRATION_SECRET_KEY || process.env.JWT_SECRET || 'hbx-local-secret').trim();
    return createHash('sha256').update(source).digest();
  }

  normalizeSecret(value: unknown) {
    const normalized = String(value || '').trim();
    return normalized || null;
  }

  previewSecret(value: unknown) {
    const normalized = this.normalizeSecret(value);
    if (!normalized) return null;
    return `***${normalized.slice(-6)}`;
  }

  encryptSecret(value: unknown) {
    const normalized = this.normalizeSecret(value);
    if (!normalized) return null;

    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.deriveKey(), iv);
    const encrypted = Buffer.concat([cipher.update(normalized, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return ['v1', iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join('.');
  }

  decryptSecret(value: unknown) {
    const normalized = this.normalizeSecret(value);
    if (!normalized) return null;

    const [version, ivBase64, tagBase64, dataBase64] = normalized.split('.');
    if (version !== 'v1' || !ivBase64 || !tagBase64 || !dataBase64) {
      throw new Error('Formato de segredo criptografado invalido.');
    }

    const decipher = createDecipheriv('aes-256-gcm', this.deriveKey(), Buffer.from(ivBase64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagBase64, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataBase64, 'base64')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }

  redactObject<T extends Record<string, any>>(value: T | null | undefined, secretKeys: string[]) {
    if (!value) return value;
    const cloned = { ...value } as Record<string, any>;
    for (const key of secretKeys) {
      if (key in cloned) delete cloned[key];
    }
    return cloned as T;
  }
}