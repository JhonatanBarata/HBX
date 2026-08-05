// Roteador de política — COCKPIT-MASTER Sprint 3. Traduz "1 evento" em
// "1 (ou mais) entrega(s) de canal", sem duplicar o entregador que o Sprint 1
// já fez (`MasterAlertService.deliver`) nem a trilha (`MasterEvent`).
//
// Decisão consciente (documentada no contrato do sprint): rota em CÓDIGO, não
// em banco. Operação de 1 dono — mudar rota é deploy de qualquer jeito; banco
// só valeria a pena se um dia existisse UI de configuração de rotas.
//
// Throttle: o mecanismo mais simples que funciona — contador in-memory por
// `type+dedupKey` (Map), reiniciado a cada boot do processo. NÃO existe hoje
// mais de 1 instância de backend rodando o watcher (mesma premissa do cache
// do MasterCockpitService); se um dia houver múltiplas instâncias, o throttle
// vira "mais um zap solto" no pior caso — nunca vira loop nem chamada ao motor
// (o teto duro de zaps/dia protege esse caso também).

export type MasterAlertChannel = 'email' | 'whatsapp' | 'sino';

export type MasterAlertRoute = {
  channels: MasterAlertChannel[];
  // throttle mínimo (minutos) entre 2 entregas do MESMO type+dedupKey.
  throttleMinutes: number;
  // digest=true: SÓ registra/loga: o disparo de zap/e-mail fica para o Sprint 4
  // (resumo periódico). Sino ainda pode acender (é grátis, não é single-shot).
  digest: boolean;
};

// Teto duro de zaps/dia no canal whatsapp (regra do Guardrails do sprint —
// chip do dono não é cobaia de metralhadora). Acima disso, SÓ email+sino.
export const MASTER_ALERT_MAX_WHATSAPP_PER_DAY = 10;

// Tabela de rotas — únicas fontes da política de entrega por tipo de evento.
// Tipos sem entrada aqui caem no DEFAULT_ROUTE (abaixo): email+sino, sem zap,
// throttle de 60 min — nunca "sem rota" vira "sem aviso nenhum".
export const MASTER_ALERT_ROUTES: Record<string, MasterAlertRoute> = {
  // Legado (Sprint 1) — email+zap+log IMEDIATO, comportamento igual ao atual.
  'fullplan.requested': { channels: ['email', 'whatsapp', 'sino'], throttleMinutes: 0, digest: false },
  'implantacao.sold': { channels: ['email', 'whatsapp', 'sino'], throttleMinutes: 0, digest: false },
  'bot.config_missing': { channels: ['email', 'whatsapp', 'sino'], throttleMinutes: 0, digest: false },

  // AI-SOS (11/07): IA da VPS apertou — grito pro dono ligar o PC do 30B.
  // Zap entra (é ação física que só ele faz), throttle 6h = cooldown do grito.
  'ai.pressure_high': { channels: ['email', 'whatsapp', 'sino'], throttleMinutes: 360, digest: false },

  // REVISOR NOTURNO DO CONCIERGE (31/07): relatório do que a máquina errou
  // falando com cliente. É informação, não emergência — só SINO (o dono lê no
  // cockpit quando quiser). Nada de zap: chip do dono não é mural de aviso.
  'ai.concierge_review': { channels: ['sino'], throttleMinutes: 12 * 60, digest: false },

  // VIGIA DO DISCO (05/08): a VPS chegou a 84% de disco e ninguém soube — o dono
  // descobriu por acaso. Disco cheio em produção PARA o Postgres de escrever, e
  // só o dono resolve (faxina/upgrade), então o crítico leva zap. O aviso de 80%
  // é informação com tempo de sobra: e-mail + sino, sem zap, 1x por dia no
  // máximo — o chip do dono não é mural de aviso.
  'host.disk_critical': { channels: ['email', 'whatsapp', 'sino'], throttleMinutes: 6 * 60, digest: false },
  'host.disk_warning': { channels: ['email', 'sino'], throttleMinutes: 24 * 60, digest: false },
  // Voltou ao normal: só sino, pro dono ver no cockpit que a faxina resolveu.
  'host.disk_recovered': { channels: ['sino'], throttleMinutes: 60, digest: false },

  // Novos (Sprint 3 — watcher de transições).
  'chip.dropped': { channels: ['email', 'whatsapp', 'sino'], throttleMinutes: 60, digest: false },
  'billing.webhook_stale': { channels: ['email', 'whatsapp'], throttleMinutes: 24 * 60, digest: false },
  'company.state_changed': { channels: ['email', 'sino'], throttleMinutes: 0, digest: true },
  'factory.stalled': { channels: ['email'], throttleMinutes: 0, digest: true },
};

const DEFAULT_ROUTE: MasterAlertRoute = { channels: ['email', 'sino'], throttleMinutes: 60, digest: false };

export function resolveMasterAlertRoute(type: string): MasterAlertRoute {
  return MASTER_ALERT_ROUTES[type] || DEFAULT_ROUTE;
}

// Sprint 4: quais `type` o digest diário precisa varrer — só os cadastrados
// EXPLICITAMENTE com `digest: true` na tabela (o DEFAULT_ROUTE nunca é
// digest, então tipo desconhecido não entra no resumo por engano).
export function listDigestEventTypes(): string[] {
  return Object.entries(MASTER_ALERT_ROUTES)
    .filter(([, route]) => route.digest)
    .map(([type]) => type);
}
