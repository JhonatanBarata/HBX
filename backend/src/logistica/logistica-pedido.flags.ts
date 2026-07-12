// S6 PORTAL-PEDIDO (11/07) — flag MESTRA do pedido público pelo link
// /pedido/<token> (cliente da distribuidora pede sem login; o pedido vira
// Entrega 'agendada' na operação). Mesmo padrão booleano de
// HBX_COBRANCA_WHATS_ENABLED em logistica-cobranca.flags.ts. Default OFF: com a
// flag desligada o deploy é 100% inerte — GET e POST /public/pedido/:token
// respondem 404 seco (rota "não existe") e o GET /logistica/config devolve
// pedidoPublicoDisponivel=false (a UI esconde o card "Pedidos pelo link").
// Gate em 2 chaves (padrão canônico do módulo): esta env (global) E
// LogisticaConfig.pedidoPublicoAtivo (por tenant, default false) precisam estar
// ON — qualquer uma OFF = a rota pública não resolve.
export function isPedidoPublicoEnabled(): boolean {
  return ['true', '1', 'yes', 'on'].includes(String(process.env.HBX_PEDIDO_PUBLICO_ENABLED || '').trim().toLowerCase());
}
