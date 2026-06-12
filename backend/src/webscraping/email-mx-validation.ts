import { resolveMx } from 'node:dns/promises';

export type EmailMxStatus = 'ok' | 'no_mx' | 'unknown';

const CACHE_TTL_MS = 12 * 60 * 60_000;
const MX_TIMEOUT_MS = 2_500;
const cache = new Map<string, { status: EmailMxStatus; expiresAt: number }>();

function emailDomain(email: string) {
  const domain = String(email || '').split('@')[1]?.trim().toLowerCase().replace(/\.$/, '') || '';
  return domain.includes('.') ? domain : '';
}

async function resolveDomainMx(domain: string): Promise<EmailMxStatus> {
  try {
    const records = await Promise.race([
      resolveMx(domain),
      new Promise<never>((_, reject) => {
        const timer = setTimeout(() => reject(new Error('mx_timeout')), MX_TIMEOUT_MS);
        (timer as any).unref?.();
      }),
    ]);
    return Array.isArray(records) && records.length > 0 ? 'ok' : 'no_mx';
  } catch (error: any) {
    // Só domínio comprovadamente sem MX é terminal; timeout/falha de rede não condena o e-mail.
    return ['ENOTFOUND', 'ENODATA'].includes(String(error?.code || '')) ? 'no_mx' : 'unknown';
  }
}

export async function checkEmailDomainMx(
  email: string,
  resolver: (domain: string) => Promise<EmailMxStatus> = resolveDomainMx,
): Promise<EmailMxStatus> {
  const domain = emailDomain(email);
  if (!domain) return 'no_mx';
  const now = Date.now();
  const cached = cache.get(domain);
  if (cached && cached.expiresAt > now) return cached.status;
  const status = await resolver(domain);
  if (status !== 'unknown') cache.set(domain, { status, expiresAt: now + CACHE_TTL_MS });
  return status;
}
