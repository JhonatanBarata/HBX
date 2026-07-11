// GUARDRAIL do envio LIVE do OTP de WhatsApp (F1 — docs/PLANEJAMENTOS/CREDITOS/
// CONFIRMACAO-TELEFONE.md). NASCE JUNTO com o envio live, não depois: família dos
// bans de jun/26 (loop de reconexão = ban). Aqui o chip do Master só ENVIA, mas o
// risco equivalente é MARTELAR o número com "erro atrás de erro". Três freios, todos
// em memória (container único; o estado some no restart, o que só AFROUXA o freio —
// nunca aperta — aceitável p/ OTP de 10min):
//   1. COOLDOWN por telefone: sem reenvio antes de N ms (default 60s, regra do dono).
//   2. TETO por telefone/hora: no máximo K envios por telefone numa janela de 1h.
//   3. DISJUNTOR (circuit breaker) do canal: F falhas CONSECUTIVAS de envio ABREM o
//      disjuntor por um tempo — enquanto aberto NENHUM envio é tentado (corta o loop
//      antes de nascer). Um sucesso zera o contador.
// Há ainda um teto GLOBAL/hora (defesa contra ataque distribuído por muitos números).
// NUNCA retenta sozinho: quem chama tenta UMA vez; falhou, para e registra a falha.

export type WhatsappConfirmGuardReason =
  | 'COOLDOWN'
  | 'PHONE_HOURLY_CAP'
  | 'GLOBAL_HOURLY_CAP'
  | 'CIRCUIT_OPEN';

export type WhatsappConfirmGuardDecision =
  | { allowed: true }
  | { allowed: false; reason: WhatsappConfirmGuardReason; retryAfterMs: number };

export interface WhatsappConfirmGuardConfig {
  cooldownMs: number;
  phoneHourlyCap: number;
  globalHourlyCap: number;
  breakerThreshold: number;
  breakerCooldownMs: number;
  now: () => number;
}

const HOUR_MS = 60 * 60 * 1000;

export const DEFAULT_WHATSAPP_CONFIRM_GUARD: Omit<WhatsappConfirmGuardConfig, 'now'> = {
  cooldownMs: 60_000, // 60s entre reenvios (regra do dono)
  phoneHourlyCap: 5, // até 5 envios por telefone/hora
  globalHourlyCap: 200, // teto global do canal por hora (defesa em profundidade)
  breakerThreshold: 3, // 3 falhas consecutivas abrem o disjuntor
  breakerCooldownMs: 5 * 60_000, // disjuntor fica aberto 5min
};

export class WhatsappConfirmGuard {
  private readonly cfg: WhatsappConfirmGuardConfig;
  private readonly sendsByPhone = new Map<string, number[]>();
  private globalSends: number[] = [];
  private breakerFailures = 0;
  private breakerOpenUntil = 0;

  constructor(config?: Partial<WhatsappConfirmGuardConfig>) {
    this.cfg = {
      ...DEFAULT_WHATSAPP_CONFIRM_GUARD,
      now: () => Date.now(),
      ...(config || {}),
    };
  }

  private now(): number {
    return this.cfg.now();
  }

  private prune(list: number[], now: number): number[] {
    const cutoff = now - HOUR_MS;
    return list.filter((ts) => ts > cutoff);
  }

  // Decide ANTES de tentar enviar. Só limpa janelas expiradas — não conta o envio
  // (isso é registerAttempt). Ordem: disjuntor → cooldown → teto/telefone → teto global.
  evaluate(phone: string): WhatsappConfirmGuardDecision {
    const now = this.now();
    if (this.breakerOpenUntil > now) {
      return { allowed: false, reason: 'CIRCUIT_OPEN', retryAfterMs: this.breakerOpenUntil - now };
    }
    const phoneSends = this.prune(this.sendsByPhone.get(phone) || [], now);
    this.sendsByPhone.set(phone, phoneSends);
    const last = phoneSends.length ? phoneSends[phoneSends.length - 1] : 0;
    if (last && now - last < this.cfg.cooldownMs) {
      return { allowed: false, reason: 'COOLDOWN', retryAfterMs: this.cfg.cooldownMs - (now - last) };
    }
    if (phoneSends.length >= this.cfg.phoneHourlyCap) {
      return { allowed: false, reason: 'PHONE_HOURLY_CAP', retryAfterMs: Math.max(0, phoneSends[0] + HOUR_MS - now) };
    }
    this.globalSends = this.prune(this.globalSends, now);
    if (this.globalSends.length >= this.cfg.globalHourlyCap) {
      return { allowed: false, reason: 'GLOBAL_HOURLY_CAP', retryAfterMs: Math.max(0, this.globalSends[0] + HOUR_MS - now) };
    }
    return { allowed: true };
  }

  // Registra a TENTATIVA (conta pro cooldown + tetos) mesmo que ela falhe depois —
  // evita martelar o mesmo número na base de "erro atrás de erro".
  registerAttempt(phone: string): void {
    const now = this.now();
    const phoneSends = this.prune(this.sendsByPhone.get(phone) || [], now);
    phoneSends.push(now);
    this.sendsByPhone.set(phone, phoneSends);
    this.globalSends = this.prune(this.globalSends, now);
    this.globalSends.push(now);
  }

  // Envio OK → zera o disjuntor.
  registerSuccess(): void {
    this.breakerFailures = 0;
    this.breakerOpenUntil = 0;
  }

  // Envio FALHOU → soma no disjuntor; no teto de falhas CONSECUTIVAS, ABRE (sem
  // retry — quem chama já parou). Enquanto aberto, evaluate() corta todo envio.
  registerFailure(): void {
    this.breakerFailures += 1;
    if (this.breakerFailures >= this.cfg.breakerThreshold) {
      this.breakerOpenUntil = this.now() + this.cfg.breakerCooldownMs;
    }
  }

  get circuitOpen(): boolean {
    return this.breakerOpenUntil > this.now();
  }
}
