import { BadRequestException } from '@nestjs/common';

export function assertPasswordPolicy(password: string) {
  const normalized = String(password || '');
  if (normalized.length < 8) {
    throw new BadRequestException('Senha fraca. Use no mínimo 8 caracteres.');
  }
}
