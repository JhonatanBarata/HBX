import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { withoutTenantScope } from '../prisma/tenant-context';
import { resolveCompanyAccessState } from '../modules/company-access-state';
import { resolveOperationalAccessProjection } from '../team/operational-capabilities';
import {
  loadUserTeamPolicyRuntime,
  resolveTeamPolicyAccessAllowed,
} from '../team/team-policy-persistence';
import {
  ConsumeMobileWebTicketDto,
  GooglePairMobileDeviceDto,
  OpenMobileDeviceSessionDto,
  PairMobileDeviceDto,
} from './dto/mobile-device.dto';
import {
  GoogleIdTokenVerifierService,
  type VerifiedGoogleIdentity,
} from './google-id-token-verifier.service';
import { MAX_MOBILE_DEVICES_PER_USER } from './session-policy';

type PairingCodeRow = {
  id: string;
  userId: number;
  companyId: number;
  expiresAt: Date;
  consumedAt: Date | null;
};

type MobileDeviceRow = {
  id: string;
  userId: number;
  companyId: number;
  installationId: string;
  name: string | null;
  platform: string;
  tokenHash: string;
  tokenVersion: number;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  webTicketExpiresAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type ExistingInstallationRow = {
  id: string;
  userId: number;
  companyId: number;
  revokedAt: Date | null;
};

type LockedPairingUserRow = {
  id: number;
  companyId: number | null;
  isActive: boolean;
  isSystemMaster: boolean;
};

type MobilePairingUserRow = {
  id: number;
  email: string | null;
  emailConfirmedAt: Date | null;
  googleId: string | null;
  companyId: number | null;
  isActive: boolean;
  isSystemMaster: boolean;
  mustChangePassword: boolean;
};

type PreparedDevicePairing = {
  rawDeviceToken: string;
  tokenHash: string;
  installationId: string;
  deviceName: string;
  platform: string;
  now: Date;
};

@Injectable()
export class MobileDeviceService {
  private readonly pairingTtlMs = 10 * 60 * 1000;
  private readonly webTicketTtlMs = 60 * 1000;
  private readonly maxDevicesPerUser = MAX_MOBILE_DEVICES_PER_USER;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly googleIdTokens: GoogleIdTokenVerifierService,
  ) {}

  /** Hash para segredos aleatórios de alta entropia (token do aparelho/ticket). */
  private hashOpaqueSecret(value: string) {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  /**
   * O código tem apenas 6 dígitos; SHA puro seria quebrável offline em segundos
   * por quem obtivesse uma cópia do banco. HMAC usa o JWT_SECRET com separação de
   * domínio, permitindo busca por igualdade sem guardar o código recuperável.
   */
  private hashPairingCode(code: string) {
    const serverSecret = String(process.env.JWT_SECRET || '').trim();
    if (!serverSecret) {
      throw new Error('JWT_SECRET is required for mobile device pairing');
    }
    return crypto
      .createHmac('sha256', `${serverSecret}:hbx-mobile-pairing:v1`)
      .update(code)
      .digest('hex');
  }

  private frontendBaseUrl() {
    return String(process.env.FRONTEND_URL || 'https://www.hbxsystem.com.br')
      .trim()
      .replace(/\/+$/, '');
  }

  private normalizePlatform(value: unknown) {
    const normalized = String(value || 'android').trim().toLowerCase();
    return normalized.replace(/[^a-z0-9_-]/g, '').slice(0, 32) || 'android';
  }

  private async resolvePairingOwner(userIdInput: unknown) {
    const userId = Number(userIdInput || 0);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new UnauthorizedException('Sessão inválida.');
    }

    const user = await withoutTenantScope(
      'mobile pairing: carregar o próprio usuário autenticado',
      () => this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          companyId: true,
          isActive: true,
          isSystemMaster: true,
        },
      }),
    );

    if (!user || user.isActive === false) {
      throw new UnauthorizedException('Usuário inválido ou desativado.');
    }
    if (user.isSystemMaster || !user.companyId) {
      throw new BadRequestException('Vinculação móvel exige uma conta vinculada a uma empresa.');
    }

    return { userId: user.id, companyId: Number(user.companyId) };
  }

  async createPairingCode(userIdInput: unknown) {
    const owner = await this.resolvePairingOwner(userIdInput);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.pairingTtlMs);

    return withoutTenantScope('mobile pairing: gerar código descartável', async () => {
      await this.prisma.$executeRaw`
        DELETE FROM "MobilePairingCode"
        WHERE "userId" = ${owner.userId}
           OR (
             "companyId" = ${owner.companyId}
             AND ("expiresAt" <= ${now} OR "consumedAt" IS NOT NULL)
           )
      `;

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
        const codeHash = this.hashPairingCode(code);
        try {
          await this.prisma.$executeRaw`
            INSERT INTO "MobilePairingCode"
              ("id", "userId", "companyId", "codeHash", "expiresAt", "createdAt")
            VALUES
              (${crypto.randomUUID()}, ${owner.userId}, ${owner.companyId}, ${codeHash}, ${expiresAt}, ${now})
          `;
          return {
            code,
            expiresAt: expiresAt.toISOString(),
            expiresInSeconds: Math.floor(this.pairingTtlMs / 1000),
          };
        } catch (error) {
          if (attempt === 4) throw error;
        }
      }

      throw new ConflictException('Não foi possível gerar o código agora. Tente novamente.');
    });
  }

  async listDevices(userIdInput: unknown) {
    const owner = await this.resolvePairingOwner(userIdInput);
    return withoutTenantScope('mobile pairing: listar aparelhos do próprio usuário', async () => {
      const rows = await this.prisma.$queryRaw<Array<{
        id: string;
        name: string | null;
        platform: string;
        lastUsedAt: Date | null;
        revokedAt: Date | null;
        createdAt: Date;
      }>>`
        SELECT "id", "name", "platform", "lastUsedAt", "revokedAt", "createdAt"
        FROM "MobileDevice"
        WHERE "userId" = ${owner.userId}
          AND "companyId" = ${owner.companyId}
        ORDER BY "createdAt" DESC
      `;
      return rows.map((row) => ({
        ...row,
        active: !row.revokedAt,
      }));
    });
  }

  async revokeDevice(userIdInput: unknown, deviceId: string) {
    const owner = await this.resolvePairingOwner(userIdInput);
    const id = String(deviceId || '').trim();
    if (!id) throw new BadRequestException('Aparelho inválido.');

    const changed = await withoutTenantScope('mobile pairing: revogar aparelho do próprio usuário', () =>
      this.prisma.$executeRaw`
        UPDATE "MobileDevice"
        SET
          "revokedAt" = CURRENT_TIMESTAMP,
          "webTicketHash" = NULL,
          "webTicketExpiresAt" = NULL,
          "tokenVersion" = "tokenVersion" + 1,
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${id}
          AND "userId" = ${owner.userId}
          AND "companyId" = ${owner.companyId}
          AND "revokedAt" IS NULL
      `,
    );

    if (Number(changed) <= 0) {
      throw new NotFoundException('Aparelho não encontrado ou já desconectado.');
    }
    return { ok: true };
  }

  private prepareDevicePairing(dto: {
    installationId: string;
    deviceName?: string;
    platform?: string;
  }): PreparedDevicePairing {
    const rawDeviceToken = `hbx_device_${crypto.randomBytes(32).toString('base64url')}`;
    return {
      rawDeviceToken,
      tokenHash: this.hashOpaqueSecret(rawDeviceToken),
      installationId: String(dto.installationId || '').trim(),
      deviceName: String(dto.deviceName || 'Aparelho Android').trim().slice(0, 120) || 'Aparelho Android',
      platform: this.normalizePlatform(dto.platform),
      now: new Date(),
    };
  }

  private async lockPairingInstallationTx(
    tx: Prisma.TransactionClient,
    installationId: string,
  ) {
    // A instalação ainda pode não ter linha para receber FOR UPDATE. A trava
    // transacional por chave serializa também o primeiro INSERT concorrente.
    // O CTE projeta inteiro porque o Prisma não desserializa o retorno void de
    // pg_advisory_xact_lock. Parâmetros continuam separados do SQL.
    await tx.$queryRawUnsafe(
      'WITH pairing_lock AS (SELECT pg_advisory_xact_lock($1::integer, hashtext($2::text))) SELECT 1::integer AS locked FROM pairing_lock',
      0x4842584d,
      installationId,
    );
  }

  /**
   * Única implementação de limite, transferência da installationId e rotação da
   * credencial. Tanto o código de seis dígitos quanto o Google passam por aqui.
   */
  private async upsertPairedInstallationTx(
    tx: Prisma.TransactionClient,
    user: { id: number; companyId: number },
    prepared: PreparedDevicePairing,
  ) {
    const {
      installationId,
      deviceName,
      platform,
      tokenHash,
      now,
    } = prepared;

    // Serializa a contagem por usuário. Sem esta trava, duas instalações novas
    // poderiam enxergar a mesma vaga e ultrapassar juntas o limite.
    // tenant-raw-allow: usuário/empresa foram resolvidos por identidade móvel autenticada; a linha é travada por PK + tenant.
    const lockedUsers = await tx.$queryRaw<LockedPairingUserRow[]>`
      SELECT "id", "companyId", "isActive", "isSystemMaster"
      FROM "User"
      WHERE "id" = ${user.id}
        AND "companyId" = ${user.companyId}
      FOR UPDATE
    `;
    const lockedUser = lockedUsers[0];
    if (!lockedUser || lockedUser.isActive === false || lockedUser.isSystemMaster) {
      throw new UnauthorizedException('A conta vinculada não está disponível.');
    }

    // tenant-raw-allow: installationId é chave global do hardware; um
    // pareamento autenticado pode transferi-la entre contas.
    const existingRows = await tx.$queryRaw<ExistingInstallationRow[]>`
      SELECT "id", "userId", "companyId", "revokedAt"
      FROM "MobileDevice"
      WHERE "installationId" = ${installationId}
      FOR UPDATE
    `;
    const existing = existingRows[0];

    // Conta todos os OUTROS aparelhos ativos. Reemitir a credencial para esta
    // instalação não consome vaga; transferi-la de outra conta não burla o teto.
    const counts = await tx.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS "count"
      FROM "MobileDevice"
      WHERE "userId" = ${user.id}
        AND "companyId" = ${user.companyId}
        AND "revokedAt" IS NULL
        AND (${existing?.id || null}::text IS NULL OR "id" <> ${existing?.id || null})
    `;
    if (Number(counts[0]?.count || 0) >= this.maxDevicesPerUser) {
      throw new ConflictException(`Limite de ${this.maxDevicesPerUser} aparelhos ativos atingido. Desconecte um aparelho pelo HBX web.`);
    }

    const deviceId = existing?.id || crypto.randomUUID();
    const rows = await tx.$queryRaw<MobileDeviceRow[]>`
      INSERT INTO "MobileDevice"
        ("id", "userId", "companyId", "installationId", "name", "platform", "tokenHash", "tokenVersion", "lastUsedAt", "revokedAt", "createdAt", "updatedAt")
      VALUES
        (${deviceId}, ${user.id}, ${user.companyId}, ${installationId}, ${deviceName}, ${platform}, ${tokenHash}, 1, ${now}, NULL, ${now}, ${now})
      ON CONFLICT ("installationId") DO UPDATE SET
        "userId" = EXCLUDED."userId",
        "companyId" = EXCLUDED."companyId",
        "name" = EXCLUDED."name",
        "platform" = EXCLUDED."platform",
        "tokenHash" = EXCLUDED."tokenHash",
        "tokenVersion" = "MobileDevice"."tokenVersion" + 1,
        "lastUsedAt" = EXCLUDED."lastUsedAt",
        "expiresAt" = NULL,
        "revokedAt" = NULL,
        "webTicketHash" = NULL,
        "webTicketExpiresAt" = NULL,
        "updatedAt" = EXCLUDED."updatedAt"
      RETURNING *
    `;
    return rows[0];
  }

  private async completeDevicePairing(device: MobileDeviceRow | undefined, rawDeviceToken: string) {
    if (!device) throw new UnauthorizedException('Não foi possível vincular este aparelho.');
    const entry = await this.issueWebTicket(device.id, device.companyId);
    return {
      ok: true,
      deviceToken: rawDeviceToken,
      entryUrl: entry.entryUrl,
      device: {
        id: device.id,
        name: device.name,
        platform: device.platform,
      },
    };
  }

  private assertGooglePairingUserAvailable(user: MobilePairingUserRow | null | undefined) {
    if (!user) {
      throw new UnauthorizedException('Não existe uma conta HBX vinculada a este e-mail Google.');
    }
    if (user.isActive === false) {
      throw new UnauthorizedException('Conta desativada. Contate seu Administrador.');
    }
    if (user.isSystemMaster) {
      throw new ForbiddenException('A conta Master do sistema não pode ser vinculada ao aplicativo móvel.');
    }
    const companyId = Number(user.companyId || 0);
    if (!Number.isInteger(companyId) || companyId <= 0) {
      throw new BadRequestException('Vinculação móvel exige uma conta vinculada a uma empresa.');
    }
    return { id: user.id, companyId };
  }

  private async clearPasswordGateForGoogleTx(
    tx: Prisma.TransactionClient,
    user: MobilePairingUserRow,
  ) {
    if (!user.mustChangePassword) return;
    // A identidade federada já foi provada pelo Google; reproduz a regra do
    // login Google web sem criar/revogar qualquer AuthSession.
    await tx.user.update({
      where: { id: user.id },
      data: { mustChangePassword: false },
    });
  }

  private async resolveGooglePairingUserTx(
    tx: Prisma.TransactionClient,
    identity: VerifiedGoogleIdentity,
  ) {
    const select = {
      id: true,
      email: true,
      emailConfirmedAt: true,
      googleId: true,
      companyId: true,
      isActive: true,
      isSystemMaster: true,
      mustChangePassword: true,
    } as const;

    const byGoogleId = await tx.user.findUnique({
      where: { googleId: identity.googleId },
      select,
    });
    if (byGoogleId) {
      const owner = this.assertGooglePairingUserAvailable(byGoogleId);
      await this.clearPasswordGateForGoogleTx(tx, byGoogleId);
      return owner;
    }

    // `email @unique` no legado é sensível a maiúsculas. Se houver duas contas
    // equivalentes por caixa, não escolhemos uma arbitrariamente.
    // tenant-scope-allow: identidade Google verificada ainda não possui companyId; a empresa vem da única conta encontrada.
    const byEmail = await tx.user.findMany({
      where: { email: { equals: identity.email, mode: 'insensitive' } },
      select,
      orderBy: { id: 'asc' },
      take: 2,
    });
    if (byEmail.length === 0) {
      throw new UnauthorizedException('Não existe uma conta HBX vinculada a este e-mail Google.');
    }
    if (byEmail.length > 1) {
      throw new ConflictException('Há mais de uma conta HBX com este e-mail. Contate o suporte antes de vincular o aparelho.');
    }

    const user = byEmail[0] as MobilePairingUserRow;
    const owner = this.assertGooglePairingUserAvailable(user);
    if (user.googleId && user.googleId !== identity.googleId) {
      throw new ConflictException('Este e-mail HBX já está vinculado a outra identidade Google.');
    }
    if (user.googleId === identity.googleId) {
      await this.clearPasswordGateForGoogleTx(tx, user);
      return owner;
    }

    // Só reivindica uma linha ainda sem Google. O filtro googleId:null impede
    // sobrescrita se outra requisição vencer a corrida; o unique global impede
    // o mesmo sub do Google de terminar em dois usuários.
    // tenant-scope-allow: PK veio da busca cross-tenant por e-mail Google verificado e a atualização não troca companyId.
    const linked = await tx.user.updateMany({
      where: { id: user.id, googleId: null },
      data: {
        googleId: identity.googleId,
        emailConfirmedAt: user.emailConfirmedAt || new Date(),
        emailConfirmationToken: null,
        emailConfirmationSentAt: null,
        emailConfirmationExpiresAt: null,
        mustChangePassword: false,
      },
    });
    if (Number(linked.count || 0) !== 1) {
      const refreshed = await tx.user.findUnique({ where: { id: user.id }, select });
      if (!refreshed || refreshed.googleId !== identity.googleId) {
        throw new ConflictException('Esta conta HBX foi vinculada a outra identidade Google. Tente novamente ou contate o suporte.');
      }
      const refreshedOwner = this.assertGooglePairingUserAvailable(refreshed);
      await this.clearPasswordGateForGoogleTx(tx, refreshed);
      return refreshedOwner;
    }

    return owner;
  }

  async pairDevice(dto: PairMobileDeviceDto) {
    const codeHash = this.hashPairingCode(String(dto.code || '').trim());
    const prepared = this.prepareDevicePairing(dto);
    const { now } = prepared;

    const device = await withoutTenantScope('mobile pairing: consumir código e vincular instalação', () =>
      this.prisma.$transaction(async (tx) => {
        await this.lockPairingInstallationTx(tx, prepared.installationId);
        // tenant-raw-allow: codeHash é segredo opaco de uso único; a empresa só é conhecida após encontrar o código.
        const codes = await tx.$queryRaw<PairingCodeRow[]>`
          SELECT "id", "userId", "companyId", "expiresAt", "consumedAt"
          FROM "MobilePairingCode"
          WHERE "codeHash" = ${codeHash}
          FOR UPDATE
        `;
        const pairing = codes[0];
        if (!pairing || pairing.consumedAt || pairing.expiresAt.getTime() <= now.getTime()) {
          throw new UnauthorizedException('Código inválido ou expirado. Gere outro código no HBX web.');
        }

        const user = await tx.user.findUnique({
          where: { id: Number(pairing.userId) },
          select: { id: true, companyId: true, isActive: true, isSystemMaster: true },
        });
        if (
          !user ||
          user.isActive === false ||
          user.isSystemMaster ||
          Number(user.companyId || 0) !== Number(pairing.companyId)
        ) {
          throw new UnauthorizedException('A conta vinculada ao código não está disponível.');
        }

        const device = await this.upsertPairedInstallationTx(
          tx,
          { id: user.id, companyId: Number(user.companyId) },
          prepared,
        );

        await tx.$executeRaw`
          UPDATE "MobilePairingCode"
          SET "consumedAt" = ${now}
          WHERE "id" = ${pairing.id}
            AND "companyId" = ${pairing.companyId}
        `;

        return device;
      }),
    );

    return this.completeDevicePairing(device, prepared.rawDeviceToken);
  }

  async googlePairDevice(dto: GooglePairMobileDeviceDto) {
    const identity = await this.googleIdTokens.verify(dto.idToken);
    const prepared = this.prepareDevicePairing(dto);

    let device: MobileDeviceRow | undefined;
    try {
      device = await withoutTenantScope('mobile pairing: validar Google e vincular instalação', () =>
        this.prisma.$transaction(async (tx) => {
          await this.lockPairingInstallationTx(tx, prepared.installationId);
          const user = await this.resolveGooglePairingUserTx(tx, identity);
          return this.upsertPairedInstallationTx(tx, user, prepared);
        }),
      );
    } catch (error) {
      const code = String((error as any)?.code || '').trim().toUpperCase();
      const target = JSON.stringify((error as any)?.meta?.target || '').toLowerCase();
      if (code === 'P2002' && target.includes('googleid')) {
        throw new ConflictException('Esta identidade Google já está vinculada a outra conta HBX.');
      }
      throw error;
    }

    return this.completeDevicePairing(device, prepared.rawDeviceToken);
  }

  async openDeviceSession(dto: OpenMobileDeviceSessionDto) {
    const tokenHash = this.hashOpaqueSecret(String(dto.deviceToken || '').trim());
    const installationId = String(dto.installationId || '').trim();
    const now = new Date();

    const device = await withoutTenantScope('mobile pairing: validar credencial persistente do aparelho', async () => {
      // tenant-raw-allow: tokenHash é a credencial opaca do aparelho; a empresa é validada na linha retornada antes de liberar sessão.
      const rows = await this.prisma.$queryRaw<MobileDeviceRow[]>`
        SELECT *
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
      `;
      return row;
    });

    const entry = await this.issueWebTicket(device.id, device.companyId);
    return { ok: true, entryUrl: entry.entryUrl };
  }

  private async issueWebTicket(deviceId: string, companyId: number) {
    const rawTicket = `hbx_mobile_entry_${crypto.randomBytes(32).toString('base64url')}`;
    const ticketHash = this.hashOpaqueSecret(rawTicket);
    const expiresAt = new Date(Date.now() + this.webTicketTtlMs);

    const changed = await withoutTenantScope('mobile pairing: emitir ticket web descartável', () =>
      this.prisma.$executeRaw`
        UPDATE "MobileDevice"
        SET
          "webTicketHash" = ${ticketHash},
          "webTicketExpiresAt" = ${expiresAt},
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${deviceId}
          AND "companyId" = ${companyId}
          AND "revokedAt" IS NULL
      `,
    );
    if (Number(changed) <= 0) {
      throw new UnauthorizedException('Aparelho não vinculado ou acesso revogado.');
    }

    return {
      entryUrl: `${this.frontendBaseUrl()}/mobile/entry?ticket=${encodeURIComponent(rawTicket)}`,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async consumeWebTicket(dto: ConsumeMobileWebTicketDto) {
    const ticketHash = this.hashOpaqueSecret(String(dto.ticket || '').trim());
    const now = new Date();

    const device = await withoutTenantScope('mobile pairing: consumir ticket web de uso único', () =>
      this.prisma.$transaction(async (tx) => {
        // tenant-raw-allow: webTicketHash é segredo opaco de uso único; a empresa só é conhecida após consumir o ticket.
        const rows = await tx.$queryRaw<MobileDeviceRow[]>`
          SELECT *
          FROM "MobileDevice"
          WHERE "webTicketHash" = ${ticketHash}
          FOR UPDATE
        `;
        const row = rows[0];
        if (
          !row ||
          row.revokedAt ||
          !row.webTicketExpiresAt ||
          row.webTicketExpiresAt.getTime() <= now.getTime()
        ) {
          throw new UnauthorizedException('Entrada móvel inválida ou expirada. Reabra o aplicativo.');
        }

        await tx.$executeRaw`
          UPDATE "MobileDevice"
          SET
            "webTicketHash" = NULL,
            "webTicketExpiresAt" = NULL,
            "lastUsedAt" = ${now},
            "updatedAt" = ${now}
          WHERE "id" = ${row.id}
            AND "companyId" = ${row.companyId}
        `;
        return row;
      }),
    );

    return this.issueMobileAccessToken(device);
  }

  private async issueMobileAccessToken(device: MobileDeviceRow) {
    const user: any = await withoutTenantScope('mobile pairing: emitir JWT da conta vinculada', () =>
      this.prisma.user.findUnique({
        where: { id: device.userId },
        include: { company: true },
      }),
    );

    if (
      !user ||
      user.isActive === false ||
      user.isSystemMaster ||
      Number(user.companyId || 0) !== device.companyId
    ) {
      throw new UnauthorizedException('A conta vinculada ao aparelho não está disponível.');
    }

    const access = resolveCompanyAccessState(user.company);
    if (!access.canUse && access.state !== 'platform_infra') {
      throw new ForbiddenException({
        code: 'MOBILE_COMPANY_ACCESS_BLOCKED',
        message: 'O acesso da empresa está bloqueado. Entre pelo HBX web para regularizar.',
      });
    }

    const { operational, policy } = await withoutTenantScope(
      'mobile pairing: projetar capacidades da conta vinculada',
      async () => ({
        operational: await resolveOperationalAccessProjection(this.prisma, user),
        policy: await loadUserTeamPolicyRuntime(this.prisma, user.id).catch(() => null),
      }),
    );
    const vendasDenied = resolveTeamPolicyAccessAllowed(policy, 'vendas.access') === false;
    const canSell = operational.operationalCapabilities.includes('SELLER') && !vendasDenied;
    const canDeliver = operational.operationalCapabilities.includes('DRIVER');
    const next = canSell && canDeliver
      ? '/workspace'
      : canDeliver
        ? '/entrega'
        : canSell
          ? '/vendas'
          : '/dashboard';

    const payload = {
      sub: user.id,
      email: user.email,
      companyId: user.companyId,
      mobile: true,
      did: device.id,
      dv: device.tokenVersion,
    };

    return {
      access_token: this.jwtService.sign(payload),
      next,
      requiresCheckout: false,
      ...operational,
    };
  }
}
