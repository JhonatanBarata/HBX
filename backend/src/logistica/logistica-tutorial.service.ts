import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';

/**
 * TUTORIAL OBRIGATÓRIO (CONTRATO-TUTOR, 09/08/2026) — "visto" é do USUÁRIO, nunca do
 * aparelho: reusa o carimbo de onboarding que já existe em `User.onboardingStateJson`
 * (UsersService#stampOnboardingEvent/getOnboardingEvents — idempotente, tolerante a
 * JSON quebrado/legado) em vez de abrir coluna nova. ZERO MIGRATION de propósito.
 *
 * Endpoint PRÓPRIO (não pendurado no GET /config): aquele é lido a cada minuto por
 * cada motorista; este dado só interessa uma vez, no boot do app.
 */
export const EVENTO_TUTORIAL_OBRIGATORIO = 'logistica_tutorial_obrigatorio';

@Injectable()
export class LogisticaTutorialService {
  constructor(private readonly users: UsersService) {}

  async status(userId: number): Promise<{ obrigatorioVistoEm: string | null }> {
    const user = await this.users.findById(userId);
    const events = this.users.getOnboardingEvents(user as any);
    return { obrigatorioVistoEm: events[EVENTO_TUTORIAL_OBRIGATORIO] || null };
  }

  // Idempotente por herança do stampOnboardingEvent: o primeiro carimbo fica, chamadas
  // seguintes só devolvem o vigente.
  async marcarVisto(userId: number): Promise<{ ok: true; vistoEm: string }> {
    const { events } = await this.users.stampOnboardingEvent(userId, EVENTO_TUTORIAL_OBRIGATORIO);
    return { ok: true, vistoEm: events[EVENTO_TUTORIAL_OBRIGATORIO] };
  }
}
