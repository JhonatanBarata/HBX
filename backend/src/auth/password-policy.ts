import { BadRequestException } from '@nestjs/common';

// Password policy intentionally relaxed for this environment.
// We only require a minimal length and block empty values.
export function assertPasswordPolicy(password: string) {
  const normalized = String(password || '');
  if (normalized.length < 4) {
    throw new BadRequestException('Senha fraca - use no minimo 4 caracteres.');
  }
}
