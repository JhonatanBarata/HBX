// ============================================================================
// AI-SOS — contadores estáticos de "IA falhou de verdade" (pedido do dono,
// 11/07: "dar um grito" pro master ligar o PC do 30B quando a IA apertar).
//
// Espelha o estilo do AiGatewayService: estado ESTÁTICO por processo, zero DI,
// zero banco — call-sites (concierge, futuros) importam a classe e reportam no
// catch; quem LÊ é só o AiPressureWatchService (delta por tick). Contador é
// telemetria best-effort: nunca lança, nunca muda o fluxo de quem reporta.
// ============================================================================

export class AiPressureSignals {
  private static counters = new Map<string, number>();

  /** Incrementa 1 falha do tipo dado (ex.: 'concierge_extractor_fail'). */
  static report(kind: string): void {
    try {
      const key = String(kind || '').trim() || 'unknown';
      AiPressureSignals.counters.set(key, (AiPressureSignals.counters.get(key) || 0) + 1);
    } catch {
      // telemetria nunca derruba o caller
    }
  }

  /** Soma acumulada de TODAS as falhas reportadas (desde o boot). */
  static total(): number {
    let sum = 0;
    for (const value of AiPressureSignals.counters.values()) sum += value;
    return sum;
  }

  /** Foto por tipo (pro payload do MasterEvent/diagnóstico). */
  static snapshot(): Record<string, number> {
    return Object.fromEntries(AiPressureSignals.counters.entries());
  }

  /** Só para testes. */
  static resetForTests(): void {
    AiPressureSignals.counters.clear();
  }
}
