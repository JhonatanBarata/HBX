// Fonte ÚNICA do estado de conexão do WhatsApp (PR17062026047 Bloco A).
//
// Antes, o "tá conectado?" era redecidido com comparações de string soltas em ~4 lugares
// (inbox.service, modules.service, conversations.service, e o espelho em whatsapp-modal.service),
// cada um com sua própria régua — fácil divergir. Aqui ficam as noções que de fato existem,
// nomeadas e separadas, sem mudar comportamento:
//
//   - sessão DISPONÍVEL (ler/operar/enviar): CONNECTED ou RECONNECTING — motor ainda tem sessão viva.
//     RECONNECTING = erro transiente no receive, não desconexão real; Webwhats decide se consegue enviar.
//   - sessão INATIVA (não enviar/operar): qualquer outro status (DISCONNECTED, null, etc.)
//
// O canal oficial (Meta Cloud) é binário: CONNECTED.
// Funções puras, sem I/O — seguras para qualquer camada importar.

const MODAL_SESSION_STATES = new Set(['CONNECTED', 'RECONNECTING']);
const META_CONNECTED_STATE = 'CONNECTED';

export function normalizeWaStatus(value: unknown): string {
  return String(value || '')
    .trim()
    .toUpperCase();
}

/** Sessão Webwhats disponível para LER/operar o inbox (inclui RECONNECTING). */
export function isModalSessionAvailable(modalStatus: unknown): boolean {
  return MODAL_SESSION_STATES.has(normalizeWaStatus(modalStatus));
}

/** Sessão Webwhats disponível para ENVIAR — CONNECTED ou RECONNECTING (motor ainda tem sessão viva). */
export function isModalSendReady(modalStatus: unknown): boolean {
  return MODAL_SESSION_STATES.has(normalizeWaStatus(modalStatus));
}

/** Canal oficial Meta Cloud conectado. */
export function isMetaConnected(whatsappStatus: unknown): boolean {
  return normalizeWaStatus(whatsappStatus) === META_CONNECTED_STATE;
}
