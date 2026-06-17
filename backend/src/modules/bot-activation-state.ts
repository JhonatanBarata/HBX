// Fonte única de verdade para o estado do bot por empresa.
// Espelha o padrão de company-access-state.ts: lê campos do objeto company
// já carregado — não faz chamada ao banco.

export type BotChannel = 'webwhats' | 'meta';

export type BotActivationState = {
  armed: boolean;
  channel: BotChannel | null;
  blockedCode: 'bot_not_armed' | null;
  blockedReason: string | null;
};

export type BotActivationSnapshot = {
  botArmedAt?: Date | string | null;
  botArmChannel?: string | null;
};

export function resolveBotActivation(
  company: BotActivationSnapshot | null | undefined,
): BotActivationState {
  const armed = Boolean(company?.botArmedAt);
  if (!armed) {
    return {
      armed: false,
      channel: null,
      blockedCode: 'bot_not_armed',
      blockedReason: 'Bot não foi ativado. Acione o suporte para ativar.',
    };
  }
  const rawChannel = String(company?.botArmChannel || '').trim().toLowerCase();
  const channel: BotChannel = rawChannel === 'meta' ? 'meta' : 'webwhats';
  return { armed: true, channel, blockedCode: null, blockedReason: null };
}

export function isBotArmedForCompany(company: BotActivationSnapshot | null | undefined): boolean {
  return Boolean(company?.botArmedAt);
}
