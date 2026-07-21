import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// ============================================================================
// S08 (MOTOR-ÚNICO) — EventRuleService.
//
// `CadenciaGatilhoService` (evento -> ações) é um motor de regras escondido no
// domínio cadência (WORM-13). Este service GENERALIZA a orquestração —
// "evento X aconteceu numa empresa, quais regras ativas devo disparar" — sem
// criar outro motor de execução: a EXECUÇÃO de cada ação (mover_status /
// criar_atividade / notificar_vendedor) continua 100% em
// `cadencia-gatilho.service.ts`, que se registra aqui como PRODUTOR/CONSUMIDOR
// do evento `lead_respondeu_whatsapp` (primeiro e único produtor desta
// sprint). Eventos futuros (etapa_mudou, atividade_vencida, email_lido — ver
// CONTRATO.md §2.4) registram seu próprio handler no MESMO `emit`, sem
// reabrir este arquivo.
//
// O que o EventRuleService faz (e só isso):
//   1. busca as regras ATIVAS da empresa para o evento (hoje: tabela
//      `CadenciaGatilho`, SEM schema novo nesta sprint — CONTRATO.md §2.1);
//   2. itera as regras encontradas;
//   3. isola erro por regra (uma regra quebrada NUNCA bloqueia a próxima);
//   4. delega a ação ao handler registrado pelo dono do domínio.
// Nenhuma ação (mover_status/criar_atividade/notificar_vendedor) é
// reimplementada aqui — duplicar essa lógica é proibido pelo contrato da
// sprint.
//
// Desenho anti-ciclo (mesmo problema documentado em inbound-router.service.ts
// e resolvido do mesmo jeito): `AutomationModule` já importa `CadenciaModule`
// (CONTRATO.md §1.1). Se `CadenciaModule` precisasse importar `AutomationModule`
// de volta para injetar `EventRuleService` via Nest DI, seria um ciclo real.
// Por isso esta classe é `@Injectable()` (registrada como provider em
// `automation.module.ts` para DI dentro desta frente/testes Nest) MAS também
// instanciável à mão — `CadenciaGatilhoService` faz
// `new EventRuleService(this.prisma)` no próprio construtor, sem passar por
// `CadenciaModule.imports`. Mesmo truque já usado para `InboundRouterService`
// (`new InboundRouterService()` em `messaging.service.ts`) e
// `CommercialAutomationStateService` (`new CommercialAutomationStateService
// (this.prisma)` em `commercial-contact-control.service.ts`).
// ============================================================================

/** Formato mínimo de uma regra ativa vinda de `CadenciaGatilho` — só os
 * campos que o motor genérico e os handlers precisam para orquestrar/
 * executar. Não é o shape completo da tabela (sem `ownerId`/`createdAt`/
 * `updatedAt`), de propósito: mantém o handler desacoplado do resto do CRUD
 * de gatilhos, que continua vivendo em `cadencia-gatilho.service.ts`. */
export type EventRuleRow = {
  id: string;
  companyId: number;
  nome: string;
  evento: string;
  acoesJson: string;
  ativo: boolean;
  lastFiredAt: Date | null;
  fireCount: number;
};

/** Handler registrado pelo dono do domínio (hoje: CadenciaGatilhoService) —
 * recebe UMA regra ativa já filtrada por empresa+evento e o payload cru do
 * `emit`, e é responsável por resolver o alvo (ex.: lead pelo telefone) e
 * executar as ações da regra, incluindo o incremento de
 * `fireCount`/`lastFiredAt` (comportamento idêntico ao que
 * `CadenciaGatilhoService.handleInbound` já fazia antes da S08). */
export type EventRuleActionHandler = (
  companyId: number,
  rule: EventRuleRow,
  payload: Record<string, unknown>,
) => Promise<void>;

@Injectable()
export class EventRuleService {
  private readonly logger = new Logger(EventRuleService.name);
  private readonly handlers = new Map<string, EventRuleActionHandler>();

  constructor(private readonly prisma: PrismaService) {}

  /** Registra o handler de UM evento. Chamado por cada domínio produtor no
   * próprio `onModuleInit` (mesmo padrão de `ConversationsService.
   * setCadenciaInboundHook`). Registrar de novo para o mesmo evento
   * SUBSTITUI o handler anterior — não há caso de uso hoje para múltiplos
   * handlers no mesmo evento. */
  registerActionHandler(evento: string, handler: EventRuleActionHandler): void {
    const key = String(evento || '').trim();
    if (!key) return;
    this.handlers.set(key, handler);
  }

  /** Ponto de entrada genérico: "evento X aconteceu na empresa Y". Carrega as
   * regras ativas do evento (tenant-isolado pela própria query), executa a
   * ação de cada uma em série, isolando erro por regra. Sem regra ativa OU
   * sem handler registrado para o evento = no-op barato (nenhuma query extra
   * além da busca de regras; sem handler, nem isso). */
  async emit(companyId: number, evento: string, payload: Record<string, unknown> = {}): Promise<void> {
    const cid = Number(companyId || 0);
    const eventName = String(evento || '').trim();
    if (!cid || !eventName) return;

    const handler = this.handlers.get(eventName);
    if (!handler) return; // nenhum produtor registrado pra este evento -> no-op barato

    const rules = await this.loadActiveRules(cid, eventName);
    if (!rules.length) return; // nenhuma regra ativa -> no-op barato

    for (const rule of rules) {
      try {
        await handler(cid, rule, payload);
      } catch (error: unknown) {
        // Isolamento: uma regra quebrada nunca bloqueia as próximas.
        this.logger.warn(
          `[event-rule] regra ${rule.id} evento=${eventName} company=${cid} falhou: ${String((error as any)?.message || error)}`,
        );
      }
    }
  }

  private async loadActiveRules(companyId: number, evento: string): Promise<EventRuleRow[]> {
    return (this.prisma as any).cadenciaGatilho.findMany({
      where: { companyId, evento, ativo: true },
      take: 20,
    });
  }
}
