import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, defer } from 'rxjs';
import { runWithTenantContext } from './tenant-context';

// Interceptor GLOBAL (multi-tenancy Sprint 1). Roda DEPOIS dos guards (logo o
// JwtAuthGuard já resolveu req.user com o companyId efetivo — empresa própria ou
// empresa que o master assumiu) e abre o escopo de tenant (AsyncLocalStorage) pra
// duração do handler. Assim a trava do Prisma (tenant-guard.extension.ts) sabe de
// qual empresa é a query atual, mesmo com o PrismaClient sendo singleton.
//
// Requests sem usuário (rotas públicas: login, signup, webhooks) rodam SEM tenant
// no store — o guard não acusa (não há tenant a exigir). Idem contexto não-HTTP.
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const user = request?.user;

    const companyIdRaw = Number(user?.companyId);
    const companyId = Number.isInteger(companyIdRaw) && companyIdRaw > 0 ? companyIdRaw : null;
    const isSystemMaster = Boolean(user?.isSystemMaster);

    // defer() garante que o `als.run` só rode na SUBSCRIÇÃO (que o Nest faz depois
    // da cadeia de interceptors) — é aí que o AsyncLocalStorage precisa estar ativo
    // pra propagar por toda a cadeia assíncrona do handler. Rodar o run só agora
    // (retornando o Observable) deixaria o escopo fechar antes do trabalho real.
    return defer(() =>
      runWithTenantContext({ companyId, isSystemMaster }, () => next.handle()),
    );
  }
}
