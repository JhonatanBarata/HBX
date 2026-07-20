import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../users/users.service';
import { MasterContextService } from '../master-context/master-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { SESSION_IDLE_TTL_MS } from './session-ttl';
import { allowsAdminMultiSession } from './session-policy';
import { withoutTenantScope } from '../prisma/tenant-context';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private usersService: UsersService,
    private readonly masterContextService: MasterContextService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: String(process.env.JWT_SECRET || '').trim(),
    });
  }

  async validate(payload: any) {
    const user: any = await this.usersService.findById(payload.sub);
    if (!user) throw new UnauthorizedException('Usuário inválido');

    // IMPERSONAÇÃO (MASTER "entrar como"): claim `imp` = id do master por trás. O
    // `sub` já é o usuário-ALVO — o master VIRA esse usuário. Mesma faixa do
    // ops/mobile: sai da trava de sessão-única e NÃO toca a AuthSession do alvo.
    const impersonatorId = payload?.imp != null ? Number(payload.imp) : null;
    const isImpersonation = impersonatorId != null && Number.isInteger(impersonatorId);

    // Sem exceção: o master pode inspecionar ATÉ uma conta desativada — o gate de
    // inativo não vale no caminho de impersonação (o mint é exclusivo do master).
    if (user.isActive === false && !isImpersonation) {
      throw new UnauthorizedException('Sessão revogada');
    }

    // Token do APP pareado: coexiste com a sessão web do mesmo usuário. A validade
    // não depende de currentSessionId/sessionVersion (trava humana de login único),
    // mas da linha MobileDevice revogável e da versão gravada no próprio aparelho.
    if (payload?.mobile === true) {
      const deviceId = String(payload?.did || '').trim();
      const deviceVersion = Number(payload?.dv);
      if (!deviceId || !Number.isInteger(deviceVersion)) {
        throw new UnauthorizedException('Sessão móvel inválida');
      }

      const devices = await withoutTenantScope(
        'jwt mobile: validar aparelho pareado fora da sessão web única',
        () => this.prisma.$queryRaw<Array<{
          id: string;
          userId: number;
          companyId: number;
          tokenVersion: number;
          lastUsedAt: Date | null;
          expiresAt: Date | null;
          revokedAt: Date | null;
        }>>`
          SELECT "id", "userId", "companyId", "tokenVersion", "lastUsedAt", "expiresAt", "revokedAt"
          FROM "MobileDevice"
          WHERE "id" = ${deviceId}
            AND "companyId" = ${Number(user.companyId || 0)}
          LIMIT 1
        `,
      );
      const device = devices[0];
      const now = new Date();
      if (
        !device ||
        device.userId !== Number(user.id) ||
        device.companyId !== Number(user.companyId || 0) ||
        device.tokenVersion !== deviceVersion ||
        device.revokedAt ||
        (device.expiresAt && device.expiresAt.getTime() <= now.getTime())
      ) {
        throw new UnauthorizedException('Sessão móvel revogada');
      }

      if (!device.lastUsedAt || device.lastUsedAt.getTime() <= now.getTime() - 60_000) {
        await withoutTenantScope(
          'jwt mobile: atualizar último uso do aparelho validado',
          () => this.prisma.$executeRaw`
            UPDATE "MobileDevice"
            SET "lastUsedAt" = ${now}, "updatedAt" = ${now}
            WHERE "id" = ${device.id}
              AND "companyId" = ${device.companyId}
              AND "revokedAt" IS NULL
          `,
        );
      }

      user.sessionId = `mobile:${device.id}`;
      user.sessionVersion = device.tokenVersion;
    // Token de MÁQUINA do Ops Control (claim ops=true no master): autentica SEM
    // entrar na trava de sessão-única humana — não exige AuthSession nem casa
    // currentSessionId/sessionVersion. Forjar esse claim exige o JWT_SECRET (que
    // já é poder total), então não amplia superfície de ataque. Sem essa isenção,
    // o poll do ops-control re-autenticava como master a cada ~60s, revogava a
    // AuthSession do dono e o DERRUBAVA do /master a cada ~2min (era a máquina do
    // "fica caindo"/409 SESSION_ALREADY_ACTIVE). O mint do ops-control agora não
    // toca em sessão nenhuma (ops:true), e o dono coexiste com o painel.
    } else if (payload?.ops === true && Boolean(user.isSystemMaster)) {
      user.sessionId = 'ops-control';
      user.sessionVersion = Number(payload?.sv) || 0;
    } else if (isImpersonation) {
      // Confere que quem está por trás é REALMENTE um master do sistema. Forjar o
      // claim já exige o JWT_SECRET (poder total), mas a checagem impede que um
      // `imp` apontando pra um id não-master conceda uma sessão sem trava.
      const impersonator: any = await this.usersService.findById(impersonatorId as number);
      if (!impersonator || !Boolean(impersonator.isSystemMaster)) {
        throw new UnauthorizedException('Impersonação inválida');
      }
      user.impersonatedByMasterId = impersonatorId;
      user.sessionId = `imp:${impersonatorId}`;
      user.sessionVersion = 0;
    } else {
      const sessionId = String(payload?.sid || '').trim();
      const sessionVersion = Number(payload?.sv);
      if (!sessionId || !Number.isInteger(sessionVersion)) {
        throw new UnauthorizedException('Sessão inválida');
      }

      // Política de sessões + ciclo de vida da AuthSession rodam SÓ em produção.
      // Administradores podem manter até quatro sessões; vendedores continuam
      // com sessão única e precisam casar com currentSessionId.
      // No localhost (dev) ficam desligadas de propósito: o release.js/deploy
      // abortam se o VPS não tiver NODE_ENV=production, então este atalho jamais
      // vale lá. Sem isso, o respawn do ts-node-dev (system_master_bootstrap), o
      // ops-control e uma 2ª aba relogavam como master e o poll de 60s derrubava o
      // dono do /master (revokedReason=replaced_by_login). Em dev o JWT (1 dia)
      // basta; o logout continua funcionando porque o cliente limpa o token.
      if (process.env.NODE_ENV === 'production') {
        const allowsMultipleSessions = allowsAdminMultiSession(user);
        if (
          (!allowsMultipleSessions && user.currentSessionId !== sessionId) ||
          Number(user.sessionVersion || 0) !== sessionVersion
        ) {
          throw new UnauthorizedException('Sessão revogada');
        }

        const session = await this.prisma.authSession.findUnique({
          where: { id: sessionId },
          select: {
            id: true,
            userId: true,
            lastSeenAt: true,
            expiresAt: true,
            revokedAt: true,
          },
        });

        const now = new Date();
        if (!session || session.userId !== user.id || session.revokedAt) {
          throw new UnauthorizedException('Sessão revogada');
        }

        if (session.expiresAt.getTime() <= now.getTime()) {
          await this.prisma.$transaction([
            this.prisma.authSession.updateMany({
              where: { id: sessionId, revokedAt: null },
              data: { revokedAt: now, revokedReason: 'expired' },
            }),
            this.prisma.user.updateMany({
              where: { id: user.id, currentSessionId: sessionId },
              data: { currentSessionId: null },
            }),
          ]);
          throw new UnauthorizedException('Sessão expirada');
        }

        const refreshThrottleMs = Number(process.env.AUTH_SESSION_REFRESH_THROTTLE_MS || '60000');
        if (session.lastSeenAt.getTime() <= now.getTime() - refreshThrottleMs) {
          await this.prisma.authSession.updateMany({
            where: {
              id: sessionId,
              revokedAt: null,
              expiresAt: { gt: now },
            },
            data: {
              lastSeenAt: now,
              // Slide da janela deslizante — mesma constante do login (session-ttl.ts).
              expiresAt: new Date(now.getTime() + SESSION_IDLE_TTL_MS),
            },
          });
        }
      }

      user.sessionId = sessionId;
      user.sessionVersion = sessionVersion;
    }

    // Impersonação já É o usuário-alvo: não passa pelo swap de contexto de EMPRESA
    // do master (esse contexto assumido é só do master puro/ops navegando como ele
    // mesmo). Sem isto, um alvo que por acaso fosse master herdaria o contexto dele.
    if (!isImpersonation) {
      const runtimeContext = await this.masterContextService.resolveRuntimeContext(user);
      user.masterContext = runtimeContext.masterContext;

      if (runtimeContext.effectiveCompanyId) {
        user.companyId = runtimeContext.effectiveCompanyId;
        if (runtimeContext.masterContext?.active) {
          user.company = {
            id: runtimeContext.masterContext.companyId,
            name: runtimeContext.masterContext.companyName,
          };
        }
      }
    }

    return user;
  }
}
