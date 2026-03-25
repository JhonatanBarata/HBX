export type WebscrapingRuntimeDiagnostic = {
  status: 'online' | 'degraded' | 'offline';
  code: string;
  message: string;
  checkedAt: string;
  publicUrl: string;
  internalUrl: string | null;
  healthUrl: string | null;
  usingFallbackInternalUrl: boolean;
  serviceReachable: boolean;
  httpStatus: number | null;
  googleApiKeyConfigured: boolean | null;
  mockMode: boolean;
};

type WebscrapingTargetResolution = {
  publicUrl: string;
  rawInternalUrl: string;
  target: string;
  healthUrl: string | null;
  usingFallbackInternalUrl: boolean;
  configError:
    | {
        code: string;
        message: string;
      }
    | null;
};

const DEFAULT_WEBSCRAPING_PUBLIC_URL = '/hbx/webscraping';
const DEFAULT_WEBSCRAPING_INTERNAL_URL = 'http://localhost:8501';

function normalizeServiceUrl(value: string | null | undefined): string | null {
  const normalized = String(value || '').trim();
  if (!normalized) return null;

  const withProtocol = /^https?:\/\//i.test(normalized) ? normalized : `http://${normalized}`;

  try {
    const parsed = new URL(withProtocol);
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

export function resolveWebscrapingTarget(env: NodeJS.ProcessEnv = process.env): WebscrapingTargetResolution {
  const publicUrl = String(env.WEBSCRAPING_URL || DEFAULT_WEBSCRAPING_PUBLIC_URL).trim() || DEFAULT_WEBSCRAPING_PUBLIC_URL;
  const rawInternalUrl = String(env.WEBSCRAPING_INTERNAL_URL || '').trim();

  if (rawInternalUrl) {
    const normalizedInternalUrl = normalizeServiceUrl(rawInternalUrl);
    if (!normalizedInternalUrl) {
      return {
        publicUrl,
        rawInternalUrl,
        target: DEFAULT_WEBSCRAPING_INTERNAL_URL,
        healthUrl: null,
        usingFallbackInternalUrl: false,
        configError: {
          code: 'invalid_internal_url',
          message: 'WEBSCRAPING_INTERNAL_URL esta configurada, mas nao e uma URL/host valido.',
        },
      };
    }

    return {
      publicUrl,
      rawInternalUrl,
      target: normalizedInternalUrl,
      healthUrl: `${normalizedInternalUrl}/healthz`,
      usingFallbackInternalUrl: false,
      configError: null,
    };
  }

  return {
    publicUrl,
    rawInternalUrl,
    target: DEFAULT_WEBSCRAPING_INTERNAL_URL,
    healthUrl: `${DEFAULT_WEBSCRAPING_INTERNAL_URL}/healthz`,
    usingFallbackInternalUrl: true,
    configError: null,
  };
}

export async function probeWebscrapingRuntime(
  env: NodeJS.ProcessEnv = process.env,
): Promise<WebscrapingRuntimeDiagnostic> {
  const checkedAt = new Date().toISOString();
  const resolution = resolveWebscrapingTarget(env);

  if (resolution.configError) {
    return {
      status: 'offline',
      code: resolution.configError.code,
      message: resolution.configError.message,
      checkedAt,
      publicUrl: resolution.publicUrl,
      internalUrl: resolution.rawInternalUrl || null,
      healthUrl: null,
      usingFallbackInternalUrl: resolution.usingFallbackInternalUrl,
      serviceReachable: false,
      httpStatus: null,
      googleApiKeyConfigured: null,
      mockMode: false,
    };
  }

  try {
    const response = await fetch(resolution.healthUrl || resolution.target, {
      headers: { Accept: 'text/plain,application/json,text/html' },
      signal: AbortSignal.timeout(4000),
    });
    await response.text();

    if (!response.ok) {
      return {
        status: 'offline',
        code: 'upstream_http_error',
        message: `Servico webscraping respondeu HTTP ${response.status} durante a verificacao de saude.`,
        checkedAt,
        publicUrl: resolution.publicUrl,
        internalUrl: resolution.target,
        healthUrl: resolution.healthUrl,
        usingFallbackInternalUrl: resolution.usingFallbackInternalUrl,
        serviceReachable: false,
        httpStatus: response.status,
        googleApiKeyConfigured: null,
        mockMode: false,
      };
    }

    return {
      status: 'online',
      code: resolution.usingFallbackInternalUrl ? 'reachable_via_fallback' : 'ok',
      message: resolution.usingFallbackInternalUrl
        ? 'Servico webscraping online pela URL local padrao; confirme WEBSCRAPING_INTERNAL_URL no ambiente online.'
        : 'Servico webscraping online e respondendo ao healthz.',
      checkedAt,
      publicUrl: resolution.publicUrl,
      internalUrl: resolution.target,
      healthUrl: resolution.healthUrl,
      usingFallbackInternalUrl: resolution.usingFallbackInternalUrl,
      serviceReachable: true,
      httpStatus: response.status,
      googleApiKeyConfigured: null,
      mockMode: false,
    };
  } catch (error) {
    const isAbort = error instanceof Error && error.name === 'TimeoutError';
    return {
      status: 'offline',
      code: isAbort ? 'upstream_timeout' : 'upstream_unreachable',
      message: isAbort
        ? 'Servico webscraping nao respondeu dentro do tempo limite do proxy.'
        : 'Nao foi possivel alcancar o servico webscraping configurado.',
      checkedAt,
      publicUrl: resolution.publicUrl,
      internalUrl: resolution.target,
      healthUrl: resolution.healthUrl,
      usingFallbackInternalUrl: resolution.usingFallbackInternalUrl,
      serviceReachable: false,
      httpStatus: null,
      googleApiKeyConfigured: null,
      mockMode: false,
    };
  }
}