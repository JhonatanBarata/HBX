import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { withoutTenantScope } from '../prisma/tenant-context';
import { OpenMobileDeviceSessionDto } from './dto/mobile-device.dto';

type PresenceDeviceRow = {
  id: string;
  userId: number;
  companyId: number;
  name: string | null;
  platform: string | null;
  pushToken: string | null;
  revokedAt: Date | null;
  expiresAt: Date | null;
};

export type AuthenticatedMobileDevice = Pick<
  PresenceDeviceRow,
  'id' | 'userId' | 'companyId' | 'name' | 'platform' | 'pushToken'
>;

@Injectable()
export class MobileDevicePresenceService {
  private readonly onlineWindowMs = 90 * 1000;

  constructor(private readonly prisma: PrismaService) {}

  private hashOpaqueSecret(value: string) {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  /**
   * Valida a credencial duradoura do APK sem emitir JWT web. É a porta única para
   * heartbeat, push e fila de ações móveis. Nunca confia em deviceId vindo do cliente.
   */
  async authenticateDevice(
    dto: OpenMobileDeviceSessionDto,
    options: { touch?: boolean } = {},
  ): Promise<AuthenticatedMobileDevice> {
    const tokenHash = this.hashOpaqueSecret(String(dto.deviceToken || '').trim());
    const installationId = String(dto.installationId || '').trim();
    const now = new Date();

    return withoutTenantScope('mobile presence: autenticar credencial do aparelho', async () => {
      // tenant-raw-allow: tokenHash + installationId formam a credencial opaca do aparelho;
      // a empresa é validada antes de qualquer leitura ou escrita de ação móvel.
      const rows = await this.prisma.$queryRaw<PresenceDeviceRow[]>`
        SELECT
          "id", "userId", "companyId", "name", "platform", "pushToken",
          "revokedAt", "expiresAt"
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

      if (options.touch !== false) {
        await this.prisma.$executeRaw`
          UPDATE "MobileDevice"
          SET "lastUsedAt" = ${now}, "updatedAt" = ${now}
          WHERE "id" = ${row.id}
            AND "companyId" = ${row.companyId}
            AND "revokedAt" IS NULL
        `;
      }

      return {
        id: row.id,
        userId: row.userId,
        companyId: row.companyId,
        name: row.name,
        platform: row.platform,
        pushToken: row.pushToken,
      };
    });
  }

  async heartbeat(dto: OpenMobileDeviceSessionDto) {
    const now = new Date();
    const device = await this.authenticateDevice(dto);

    return {
      ok: true,
      deviceId: device.id,
      serverTime: now.toISOString(),
      onlineUntil: new Date(now.getTime() + this.onlineWindowMs).toISOString(),
    };
  }
}
