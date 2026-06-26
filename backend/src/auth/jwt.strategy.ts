import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../users/users.service';
import { MasterContextService } from '../master-context/master-context.service';
import { PrismaService } from '../prisma/prisma.service';

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

    if (user.isActive === false) {
      throw new UnauthorizedException('Sessão revogada');
    }

    // Token de MÁQUINA do Ops Control (claim ops=true no master): autentica SEM
    // entrar na trava de sessão-única humana — não exige AuthSession nem casa
    // currentSessionId/sessionVersion. Forjar esse claim exige o JWT_SECRET (que
    // já é poder total), então não amplia superfície de ataque. Sem essa isenção,
    // o poll do ops-control re-autenticava como master a cada ~60s, revogava a
    // AuthSession do dono e o DERRUBAVA do /master a cada ~2min (era a máquina do
    // "fica caindo"/409 SESSION_ALREADY_ACTIVE). O mint do ops-control agora não
    // toca em sessão nenhuma (ops:true), e o dono coexiste com o painel.
    if (payload?.ops === true && Boolean(user.isSystemMaster)) {
      user.sessionId = 'ops-control';
      user.sessionVersion = Number(payload?.sv) || 0;
    } else {
      const sessionId = String(payload?.sid || '').trim();
      const sessionVersion = Number(payload?.sv);
      if (!sessionId || !Number.isInteger(sessionVersion)) {
        throw new UnauthorizedException('Sessão inválida');
      }

      // Trava de sessão-única + ciclo de vida da AuthSession rodam SÓ em produção.
      // No localhost (dev) ficam desligadas de propósito: o release.js/deploy
      // abortam se o VPS não tiver NODE_ENV=production, então este atalho jamais
      // vale lá. Sem isso, o respawn do ts-node-dev (system_master_bootstrap), o
      // ops-control e uma 2ª aba relogavam como master e o poll de 60s derrubava o
      // dono do /master (revokedReason=replaced_by_login). Em dev o JWT (1 dia)
      // basta; o logout continua funcionando porque o cliente limpa o token.
      if (process.env.NODE_ENV === 'production') {
        if (
          user.currentSessionId !== sessionId ||
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
              expiresAt: new Date(now.getTime() + 15 * 60 * 1000),
            },
          });
        }
      }

      user.sessionId = sessionId;
      user.sessionVersion = sessionVersion;
    }

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

    return user;
  }
}
