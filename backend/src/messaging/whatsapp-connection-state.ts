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

// ---------------------------------------------------------------------------
// Leitura do MOTOR AO VIVO por nome de instância (C3, TESTE-GERAL/CORRECOES.md)
// — extraído de ModulesService.listMasterOverview (painel master/Empresas) pra
// ser reusado também no painel "Equipe" do Atendimento (getWhatsappAdminPanel),
// que tem a MESMA lacuna: status só de projeção/banco, sem checar o motor.
// Funções puras, sem I/O — quem chama já buscou `WebwhatsBridgeService.listMotorInstances()`.
// ---------------------------------------------------------------------------

/** Nome da instância no motor: `company-{id}` (principal) ou `company-{id}-user-{userId}` (por vendedor). */
export type MotorInstanceKey = { companyId: number; userId: number | null };

/** Parse do nome da instância do motor (WebwhatsBridgeService.buildTenantKey). */
export function parseMotorInstanceKey(instanceName: string): MotorInstanceKey | null {
  const match = /^company-(\d+)(?:-user-(\d+))?$/.exec(String(instanceName || '').trim());
  if (!match) return null;
  const companyId = Number(match[1]);
  if (!Number.isFinite(companyId) || companyId <= 0) return null;
  const userId = match[2] ? Number(match[2]) : null;
  return { companyId, userId: userId && Number.isFinite(userId) && userId > 0 ? userId : null };
}

/** Só o companyId (retrocompat do parse antigo — ignora o sufixo `-user-N`). */
export function parseMotorInstanceCompanyId(instanceName: string): number | null {
  return parseMotorInstanceKey(instanceName)?.companyId ?? null;
}

function motorStateRank(state: string): number {
  const rank: Record<string, number> = { open: 3, connecting: 2, close: 1, closed: 1 };
  return rank[state] || 0;
}

function readInstanceState(inst: any): string {
  return String(
    inst?.connectionStatus ?? inst?.instance?.state ?? inst?.instance?.status ?? inst?.state ?? inst?.status ?? '',
  )
    .trim()
    .toLowerCase();
}

function readInstanceName(inst: any): string {
  return String(inst?.instance?.instanceName ?? inst?.instanceName ?? '').trim();
}

/**
 * Estado "melhor" do motor por company: entre TODAS as instâncias da empresa
 * (principal + por-usuário), 'open' vence se qualquer uma estiver aberta.
 * Mesmo agregado usado no painel master (ModulesService.buildMotorStateByCompany).
 */
export function buildMotorStateByCompany(instances: any[] | null | undefined): Map<number, string> {
  const byCompany = new Map<number, string>();
  for (const inst of instances || []) {
    const key = parseMotorInstanceKey(readInstanceName(inst));
    if (!key) continue;
    const state = readInstanceState(inst);
    const current = byCompany.get(key.companyId);
    if (!current || motorStateRank(state) > motorStateRank(current)) {
      byCompany.set(key.companyId, state);
    }
  }
  return byCompany;
}

/**
 * Estado do motor por USUÁRIO dentro da empresa (granularidade "Equipe"/individual):
 * chave `"companyId:userId"`. Só cobre instâncias com sufixo `-user-N` — a instância
 * legada `company-{id}` (sem usuário) não decora nenhum membro específico aqui.
 */
export function buildMotorStateByCompanyUser(instances: any[] | null | undefined): Map<string, string> {
  const byUser = new Map<string, string>();
  for (const inst of instances || []) {
    const key = parseMotorInstanceKey(readInstanceName(inst));
    if (!key || !key.userId) continue;
    const state = readInstanceState(inst);
    const mapKey = `${key.companyId}:${key.userId}`;
    const current = byUser.get(mapKey);
    if (!current || motorStateRank(state) > motorStateRank(current)) {
      byUser.set(mapKey, state);
    }
  }
  return byUser;
}
