export const TECH_ASSISTANT_ANALYSIS_TYPES = [
  'manual',
  'page_analysis',
  'ctrl_u',
  'error_analysis',
  'codex_prompt',
  'prompt_review',
  'pre_publish_checklist',
] as const;

export const TECH_ASSISTANT_ENVIRONMENTS = [
  'localhost',
  'homologacao',
  'producao',
  'desconhecido',
] as const;

export type TechAssistantAnalysisType = (typeof TECH_ASSISTANT_ANALYSIS_TYPES)[number];
export type TechAssistantEnvironment = (typeof TECH_ASSISTANT_ENVIRONMENTS)[number];

export type TechAssistantInput = {
  analysisType: TechAssistantAnalysisType;
  environment: TechAssistantEnvironment;
  route?: string | null;
  message?: string | null;
  technicalContent?: string | null;
  expectedBehavior?: string | null;
  currentBehavior?: string | null;
  htmlSource?: string | null;
  consoleError?: string | null;
  buildError?: string | null;
  backendStacktrace?: string | null;
  apiError?: string | null;
  requestJson?: string | null;
  responseJson?: string | null;
  promptDraft?: string | null;
};

export type TechAssistantBlocks = {
  summary: string;
  probableCause: string;
  checkNow: string[];
  likelyFiles: string[];
  risk: string;
  codexPrompt: string;
};

export type TechAssistantDiagnostic = {
  route: string;
  environment: string;
  expectedBehavior: string;
  currentBehavior: string;
  mainError: string;
  possibleCauses: string[];
  likelyFiles: string[];
  confidence: string;
  nextAction: string;
};

export type TechAssistantResponse = {
  mode: 'analysis' | 'review_prompt' | 'checklist';
  analysisType: TechAssistantAnalysisType;
  title: string;
  labels: string[];
  blocks: TechAssistantBlocks;
  diagnostic: TechAssistantDiagnostic;
  nextActions: string[];
  checklist: string[];
  reviewNotes: string[];
  revisedPrompt: string;
  providerLabel: string;
  providerStatus: 'heuristic' | 'ai' | 'ai_fallback';
  warnings: string[];
};

export type TechAssistantHistoryItem = {
  id: string;
  createdAt: string;
  mode: string;
  analysisType: string | null;
  title: string | null;
  route: string | null;
  environment: string | null;
  providerLabel: string | null;
  providerStatus: string | null;
  response: TechAssistantResponse;
  maskedInput: Record<string, unknown>;
};