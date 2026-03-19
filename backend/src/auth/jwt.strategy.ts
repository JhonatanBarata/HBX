import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../users/users.service';
import { MasterContextService } from '../master-context/master-context.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private usersService: UsersService,
    private readonly masterContextService: MasterContextService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'secretKey',
    });
  }

  async validate(payload: any) {
    const user: any = await this.usersService.findById(payload.sub);
    if (!user) return null;

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
