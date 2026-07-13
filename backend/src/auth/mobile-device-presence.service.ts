import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { withoutTenantScope } from '../prisma/tenant-context';
import { OpenMobileDeviceSessionDto } from './dto/mobile-device.dto';

type PresenceDeviceRow = {
  id: string;
  userId: number;
  companyId: number;
  revokedAt: Date | null;
  expiresAt: Date | null;
};

@Injectable()
export class MobileDevicePresenceService {
  private readonly onlineWindowMs = 90 * 1000;

  constructor(private readonly prisma: PrismaService) {}

  private hashOpaqueSecret(value: string) {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  async heartbeat(dto: OpenMobileDeviceSessionDto) {
    const tokenHash = this.hashOpaqueSecret(String(dto.deviceToken || '').trim());
    const installationId = String(dto.installationId || '').trim();
    const now = new Date();

    const device = await withoutTenantScope('mobile presence: registrar heartbeat do aparelho', async () => {
      // tenant-raw-allow: tokenHash + installationId formam a credencial opaca do aparelho;
      // a empresa é validada antes de atualizar a presença.
      const rows = await this.prisma.$queryRaw<PresenceDeviceRow[]>`
        SELECT "id", "userId", "companyId", "revokedAt", "expiresAt"
        FROM "MobileDevice"
        WHERE "tokenHash" = ${tokenHash}
          AND "installationId" = ${installationId}
        LIMIT 1
      `;
      const row = rows[0];
      if (!row || row.revokedAt || (row.expiresAt && row.expiresAt.getTime() <= now.getTime())) {
        throw new UnauthorizedException('Aparelho não vinculado ou acesso revogado.');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: row.userId },
        select: { id: true, companyId: true, isActive: true },
      });
      if (!user || user.isActive === false || Number(user.companyId || 0) !== row.companyId) {
        throw new UnauthorizedException('A conta deste aparelho não está disponível.');
      }

      await this.prisma.$executeRaw`
        UPDATE "MobileDevice"
        SET "lastUsedAt" = ${now}, "updatedAt" = ${now}
        WHERE "id" = ${row.id}
          AND "companyId" = ${row.companyId}
          AND "revokedAt" IS NULL
      `;
      return row;
    });

    return {
      ok: true,
      deviceId: device.id,
      serverTime: now.toISOString(),
      onlineUntil: new Date(now.getTime() + this.onlineWindowMs).toISOString(),
    };
  }
}
