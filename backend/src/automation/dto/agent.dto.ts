// S05 (MOTOR-ÚNICO) — DTOs do AgentService (adapter). Padrão leve (sem
// class-validator), igual assistente/dto/assistente.dto.ts: o service
// sanitiza tudo delegando pros services DONOS de cada store
// (AssistenteService.save -> sanitizeAssistenteConfig; InboxService.
// updateBotConfig -> normalizeAtendimentoBotConfig/sanitizeAtendimentoBot
// ConfigForTenant). Nada aqui grava no prisma.
//
// Fonte da verdade dos formatos: docs/PLANEJAMENTOS/PR20072026-MOTOR-UNICO/
// CONTRATO.md §3.1 (contratos de API) e §4 (tipos do agente) — "nome de
// serviço, rota, tipo ou flag que não está lá é pergunta em aberto".

import type { AtendimentoBotConfig } from '../../inbox/atendimento-config';
import type { AssistenteConfigShape } from '../../assistente/assistente-flow';

export type AgentBrain = 'roteiro' | 'ia';

// CONTRATO.md §3.1 — shape "de fio" do GET/PUT (sem wrapper `ok`, aditivos à
// parte — mesmo padrão que AutomationOverviewResponse (S04) já usa: contrato
// primeiro, extensão documentada depois).
export type AutomationAgentDto = {
  companyId: number;
  brain: AgentBrain;
  published: boolean;
  // CONTRATO tipa como `string` (sempre presente). Aqui aceitamos `null`
  // porque a era adapter (sem AutomationAgent ainda, schema é S09) tem um
  // estado real que o contrato não previu: empresa que NUNCA configurou nem
  // AssistenteConfig nem BotConfig(atendimento_bot) — não existe
  // "updatedAt" nenhum pra reportar. Decisão documentada aqui, não inventada
  // em silêncio (ver AgentService.getView).
  updatedAt: string | null;
  updatedByUserId: number | null;
  // Exatamente UM dos dois costuma vir preenchido (o `brain` resolvido),
  // mas nada impede os dois existirem ao mesmo tempo nesta era adapter
  // (empresa que já configurou os dois cérebros em momentos diferentes).
  roteiro: AtendimentoBotConfig | null;
  ia: AssistenteConfigShape | null;
};

// PUT /automation/agent — CONTRATO.md §3.1: Omit<..., 'companyId'|'updatedAt'|
// 'updatedByUserId'> (esses 3 são derivados, nunca vêm do cliente).
export type PutAutomationAgentRequest = Pick<AutomationAgentDto, 'brain' | 'published' | 'roteiro' | 'ia'>;

// GET /automation/agent — resposta ADITIVA sobre o AutomationAgentDto do
// CONTRATO: `canManage` é regra de produto 20/07 (README linhas 89-98 e S05.md
// item 7 — "GET liberado a qualquer usuário do módulo; devolve canManage");
// `armed`/`preflight` são pedido explícito de S05-agent-service-adapter.md
// item 1 ("AgentView = {..., armed, preflight}"). Mesmo padrão de extensão
// aditiva que AutomationOverviewResponse (S04) já usa sobre o contrato.
export type AutomationAgentViewResponse = AutomationAgentDto & {
  canManage: boolean;
  armed: boolean;
  preflight: { chipConectado: boolean; configCompleta: boolean } | null;
};

// POST /automation/agent/sandbox — CONTRATO.md §3.1. `agent` (quando vier)
// carrega a config EM EDIÇÃO ainda não salva — inclusive `agent.brain`, que é
// o único lugar de onde o sandbox lê qual cérebro testar; se `agent` não vier,
// o AgentService resolve o brain atual (mesma regra do GET).
export type AutomationAgentSandboxRequest = {
  message?: string;
  history?: Array<{ role?: string; content?: string }>;
  agent?: PutAutomationAgentRequest;
};

// Resposta — CONTRATO fixa só `{reply, source}`; os campos abaixo são
// ADITIVOS por brain (mesmo padrão de extensão aditiva do resto da sprint):
// `ia` reaproveita o shape de AssistenteSandboxService.reply (testNumber/
// matchedCondicaoId/model/latencyMs); `roteiro` expõe o replay determinístico
// (stage/buttons/matchedButtonId) que substitui o chat fake do front velho.
export type AutomationAgentSandboxResponse = {
  reply: string;
  source: string;
  brain: AgentBrain;
  dispatched: false;
  channel: 'sandbox';
  // brain === 'ia'
  testNumber?: number;
  matchedCondicaoId?: string | null;
  model?: string;
  latencyMs?: number;
  // brain === 'roteiro'
  stage?: 'welcome' | 'menu' | 'pos_acao';
  buttons?: AtendimentoBotConfig['mainMenuButtons'];
  matchedButtonId?: string | null;
};

// POST /automation/agent/publish — CONTRATO.md §3.1 tipa só `{on: boolean}`
// ("a S05 decide, por dentro, para qual mecanismo legado delega conforme o
// `brain` ATUAL" — ambiguidade §8.2 resolvida = brain é INFERIDO, não vem do
// cliente). `brain` aqui é uma extensão ADITIVA opcional: o RESUMO desta
// sprint pede explicitamente `POST /automation/agent/publish {brain,on}`, e
// sem ele empresas com os DOIS stores configurados ficariam presas sempre no
// brain inferido (que prioriza 'ia' — ver resolveAgentBrain). Se o cliente
// mandar `brain`, ele é respeitado; se não mandar, cai no mesmo cálculo do
// GET. Não quebra callers que só mandam `{on}` (continuam funcionando pela
// inferência) — extensão aditiva, não substitui o contrato.
export type AutomationAgentPublishRequest = { on?: boolean; brain?: AgentBrain };
export type AutomationAgentPublishResponse = {
  published: boolean;
  brain: AgentBrain;
  ok: boolean;
  message?: string | null;
};
