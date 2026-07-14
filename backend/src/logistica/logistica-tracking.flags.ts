// PR1 — flag MESTRA da Rota Rastreada. Default OFF: com a flag desligada, a
// preferência do tenant pode continuar salva, mas o modo efetivo sempre cai em
// ESSENTIAL e nenhuma sessão de rastreamento deve ser iniciada.
export function isLogisticaTrackingEnabled(): boolean {
  return ['true', '1', 'yes', 'on'].includes(
    String(process.env.HBX_LOGISTICA_TRACKING_ENABLED || '').trim().toLowerCase(),
  );
}
