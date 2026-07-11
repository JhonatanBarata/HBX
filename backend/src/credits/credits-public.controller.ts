import { Controller, Get } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  buildCreditPacksCatalog,
  getWelcomeCreditsDefault,
  getWelcomeExpiryDaysDefault,
} from './credit-pack-catalog';
import { isCreditsFeatureEnabled, isVerifiedPhoneRequiredForWelcome } from './credits.flags';

// CRÉDITOS (cutover 06/07) — vitrine PÚBLICA do catálogo de PACOTES DE CRÉDITO. Gêmeo de
// CommercialPlansPublicController: alimenta /planos e a landing SEM auth, só dados de marketing
// (nenhum dado de tenant). É a "chavinha" da propaganda:
//   - HBX_CREDITS_ENABLED OFF  → { enabled:false, packs:[] } → o front cai na vitrine de PLANOS (hoje).
//   - HBX_CREDITS_ENABLED ON   → { enabled:true,  packs:[...] } → o front mostra a vitrine de CRÉDITO.
// Pacotes `paused` VÊM na lista com a flag `paused:true` (mesmo padrão do plano pausado: a vitrine
// embaça o card e bloqueia o clique). Assim o dono publica a vitrine com os pacotes pausados —
// visíveis, NÃO compráveis — e só despausa no /master depois de cravar o preço real. Dinheiro
// nunca entra a preço placeholder.
@Controller('credits')
export class CreditsPublicController {
  @Get('public-catalog')
  @Throttle({ default: { limit: 30, ttl: 60 } })
  getPublicCatalog() {
    const enabled = isCreditsFeatureEnabled();
    if (!enabled) {
      return { enabled: false, packs: [], welcomeCredits: 0, welcomeExpiryDays: 0, requiresPhoneVerification: false };
    }
    const packs = buildCreditPacksCatalog({ includePaused: true }).map((pack) => ({
      key: pack.key,
      title: pack.title,
      credits: pack.credits,
      price: pack.price,
      badge: pack.badge,
      recommended: pack.recommended,
      // status 'paused' → a vitrine embaça o card e bloqueia o clique (dono ainda não cravou preço).
      paused: pack.status === 'paused',
      observation: pack.observation,
      expiryDays: pack.defaultExpiryDays,
    }));
    return {
      enabled: true,
      packs,
      // Lote grátis de boas-vindas (A3): mata o trial por tempo — a landing anuncia "X créditos grátis".
      welcomeCredits: getWelcomeCreditsDefault(),
      welcomeExpiryDays: getWelcomeExpiryDaysDefault(),
      // F3 (CONFIRMACAO-TELEFONE): quando ON, o cadastro grátis exige confirmar o
      // WhatsApp por código pra soltar o brinde (o passo do código vira obrigatório).
      // Default OFF → front não muda nada (regressão zero).
      requiresPhoneVerification: isVerifiedPhoneRequiredForWelcome(),
    };
  }
}
