import { Injectable } from '@nestjs/common';

@Injectable()
export class RadarHbxEngineErrorsService {
  extractHbxHttpStatus(error: unknown) {
    const direct = Number((error as any)?.httpStatus ?? (error as any)?.response?.httpStatus ?? 0);
    return Number.isFinite(direct) && direct > 0 ? direct : null;
  }

  extractHbxErrorMessage(error: unknown) {
    const response = (error as any)?.response;
    const message = response?.message || (error as any)?.rawMessage || (error as any)?.message || error || 'Falha no lote.';
    return String(message || 'Falha no lote.').trim();
  }

  isRetryableHbxError(error: unknown) {
    const httpStatus = this.extractHbxHttpStatus(error);
    if ([500, 502, 503, 504].includes(Number(httpStatus))) return true;
    if ((error as any)?.retryable === true || (error as any)?.response?.retryable === true) return true;
    const normalized = this.extractHbxErrorMessage(error).toLowerCase();
    return [
      'timeout',
      'econnreset',
      'fetch failed',
      'socket hang up',
      'etimedout',
      'network',
    ].some((part) => normalized.includes(part));
  }
}
