"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "../app/dashboard/_lib/api";
import LiquidGlassSegmentedControl from "./LiquidGlassSegmentedControl";
import styles from "./TechAssistantGlobalDrawer.module.css";

type MasterContextInfo = {
  active: boolean;
  mode: "master_puro" | "empresa_assumida";
  sessionId: string | null;
  companyId: number | null;
  companyName: string | null;
};

type TechAssistantResponse = {
  title: string;
  blocks: {
    summary: string;
    probableCause: string;
    checkNow: string[];
    likelyFiles: string[];
    risk: string;
    codexPrompt: string;
  };
  diagnostic: {
    confidence: string;
    nextAction: string;
    route?: string;
    module?: string;
    company?: string;
    operationMode?: string;
    environment?: string;
    expectedBehavior?: string;
    currentBehavior?: string;
    mainError?: string;
    possibleCauses?: string[];
    likelyFiles?: string[];
  };
  nextActions: string[];
  checklist: string[];
  warnings: string[];
  reviewNotes?: string[];
  revisedPrompt?: string;
  providerLabel: string;
};

type HistoryItem = {
  id: string;
  createdAt: string;
  title: string | null;
  route?: string | null;
  analysisType?: string | null;
  response: TechAssistantResponse;
};

type Props = {
  isSystemMaster: boolean;
  masterContext: MasterContextInfo | null;
};

type PromptTarget = "chatgpt" | "gemini" | "codex";

const PROMPT_TARGET_OPTIONS = [
  { id: "chatgpt", label: "ChatGPT" },
  { id: "gemini", label: "Gemini" },
  { id: "codex", label: "Codex" },
] as const;

type GuideDefinition = {
  title: string;
  description: string;
  goal: string;
  questions: string[];
  technicalPlaceholder: string;
  draftPlaceholder: string;
};

type BriefingAssessment = {
  score: number;
  label: string;
  tone: "danger" | "warning" | "success";
  missing: string[];
};

type TechPageContext = {
  moduleKey?: string;
  route?: string;
  summary?: string;
  tags?: string[];
  details?: Record<string, unknown>;
};

type TechSignalKind = "api" | "console" | "window" | "promise";

type TechSignal = {
  id: string;
  kind: TechSignalKind;
  message: string;
  meta?: string;
  at: string;
};

function deriveModuleFromPath(pathname: string) {
  if (pathname.startsWith("/dashboard/inbox")) return "atendimento";
  if (pathname.startsWith("/dashboard/website")) return "website";
  if (pathname.startsWith("/dashboard/master")) return "master";
  if (pathname.startsWith("/dashboard/webscraping")) return "webscraping";
  if (pathname.startsWith("/dashboard/gerencial")) return "gerencial";
  if (pathname.startsWith("/dashboard/importacoes")) return "follow_up_internacional";
  if (pathname.startsWith("/hbx-recovery")) return "atendimento";
  if (pathname.startsWith("/dashboard")) return "dashboard";
  return "fora_dashboard";
}

function inferEnvironment(hostname: string) {
  const normalized = String(hostname || "").trim().toLowerCase();
  if (!normalized) return "desconhecido";
  if (normalized === "localhost" || normalized === "127.0.0.1" || normalized.endsWith(".local")) {
    return "localhost";
  }
  if (/hml|homolog|staging|stage|qa/.test(normalized)) {
    return "homologacao";
  }
  return "producao";
}

function compactText(value: string) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function formatUnknown(value: unknown, fallback = "-") {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

function clipText(value: string, max = 320) {
  const normalized = compactText(value);
  if (!normalized) return "";
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

function toSignal(kind: TechSignalKind, message: string, meta?: string): TechSignal {
  return {
    id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    message: clipText(message, 360),
    meta: clipText(meta || "", 360) || undefined,
    at: new Date().toISOString(),
  };
}

const MODULE_PROMPT_HINTS: Record<string, string[]> = {
  atendimento: [
    "Considere tabs, conversa selecionada, rota para Recovery, bloqueio manual e editor do bot.",
    "Se houver preview apertado ou fluxo confuso, diferencie problema de layout, UX e backend.",
  ],
  hbx_recovery: [
    "Considere fila de interacoes, drawer do cliente, automacao, templates Meta e bot do Recovery.",
    "Se houver problema em cobranca, diferencie fluxo visual, regra de negocio e operacao humana.",
  ],
  website: [
    "Considere SEO, renderizacao, CMS, formulario e publicacao da pagina.",
  ],
  webscraping: [
    "Considere fila, parsing, origem dos dados e estabilidade do scraping.",
  ],
  master: [
    "Considere permissao MASTER, contexto assumido e impacto cross-modulo.",
  ],
};

const ANALYSIS_GUIDES: Record<string, GuideDefinition> = {
  manual: {
    title: "Relato manual guiado",
    description: "Bom para bugs funcionais, confusao de fluxo e comportamento inesperado.",
    goal: "Descrever claramente o que esta acontecendo e o que deveria acontecer.",
    questions: [
      "Qual acao voce fez imediatamente antes do problema aparecer?",
      "O que a tela mostrou de diferente do esperado?",
      "Isso acontece sempre ou so em um caso especifico?",
      "Existe impacto em dados, permissao, layout ou salvamento?",
    ],
    technicalPlaceholder: "Cole erro do console, payload, stacktrace, JSON, HTML ou observacoes tecnicas.",
    draftPlaceholder: "Se quiser, escreva aqui um rascunho de prompt que o assistente vai fortalecer.",
  },
  page_analysis: {
    title: "Leitura da pagina atual",
    description: "Ideal para revisar UX, estrutura da tela, espaco, hierarquia visual e fluxo.",
    goal: "Traduzir o contexto da pagina atual em um pedido claro para o chat.",
    questions: [
      "Qual parte da pagina esta mais confusa ou fraca?",
      "O problema e visual, funcional ou dos dois?",
      "O que deveria ficar mais simples para o usuario?",
      "Existe um trecho apertado, escondido ou repetitivo?",
    ],
    technicalPlaceholder: "Cole HTML, classes CSS, medidas de viewport, logs de render ou requests da pagina.",
    draftPlaceholder: "Escreva a melhoria que voce imagina, mesmo que ainda esteja vaga.",
  },
  error_analysis: {
    title: "Diagnostico de erro",
    description: "Foco em stacktrace, response ruim, erro de auth, timeout, build ou falha de regra.",
    goal: "Chegar num ponto de falha bem definido antes de chamar o Codex.",
    questions: [
      "Qual e a primeira mensagem de erro real?",
      "Em que rota e em qual clique isso acontece?",
      "O erro vem do frontend, backend ou integracao?",
      "Qual resposta ou stacktrace confirma esse comportamento?",
    ],
    technicalPlaceholder: "Cole console error, stacktrace backend, JSON de request/response, status code, timeout, trace Prisma etc.",
    draftPlaceholder: "Se ja tiver um prompt de erro, cole aqui para revisao.",
  },
  ctrl_u: {
    title: "Inspecao de HTML/markup",
    description: "Ajuda a diagnosticar renderizacao, hydration e DOM inesperado.",
    goal: "Extrair sinais do HTML e ligar isso ao componente/rota corretos.",
    questions: [
      "O markup gerado bate com a interface esperada?",
      "Ha elemento faltando, duplicado ou com classe errada?",
      "O problema acontece so apos hidratar no client?",
      "Existe diferenca entre o HTML servido e o HTML apos interacao?",
    ],
    technicalPlaceholder: "Cole o trecho de HTML/Ctrl+U, DOM inspecionado ou descricao do elemento com problema.",
    draftPlaceholder: "Escreva o que voce quer que o chat analise nesse HTML.",
  },
  codex_prompt: {
    title: "Gerador de prompt para Codex",
    description: "Monta um pedido tecnico mais objetivo, com restricoes, contexto e arquivos provaveis.",
    goal: "Entregar um prompt claro e acionavel para implementacao.",
    questions: [
      "Qual e o objetivo tecnico exato da mudanca?",
      "Quais partes nao podem ser quebradas?",
      "Que tipo de patch voce espera: pequeno, medio ou estrutural?",
      "Existe contexto de backend, frontend ou ambos?",
    ],
    technicalPlaceholder: "Cole arquivos suspeitos, erros, payloads, constraints e regras de negocio relevantes.",
    draftPlaceholder: "Cole seu prompt bruto para o assistente deixar melhor.",
  },
  prompt_review: {
    title: "Revisao de prompt",
    description: "Usado quando voce ja escreveu um prompt mas quer deixa-lo mais forte.",
    goal: "Reduzir ambiguidade, lacunas e escopo ruim.",
    questions: [
      "O prompt ja explica comportamento atual e esperado?",
      "Ele indica arquivos ou areas suspeitas?",
      "Ele limita bem o escopo?",
      "Ele pede validacao no final?",
    ],
    technicalPlaceholder: "Cole tudo que o prompt nao explica bem: logs, telas, erro e contexto.",
    draftPlaceholder: "Cole aqui o prompt atual para revisao.",
  },
  pre_publish_checklist: {
    title: "Checklist antes de publicar",
    description: "Ajuda a montar um pacote seguro antes de build, deploy ou validacao em producao.",
    goal: "Organizar risco, checagens e impacto antes da mudanca.",
    questions: [
      "Qual fluxo critico nao pode quebrar?",
      "Quais telas, APIs e migrations serao tocadas?",
      "Qual validacao minima voce precisa fazer antes de publicar?",
      "Existe risco em auth, banco, payment ou master?",
    ],
    technicalPlaceholder: "Cole diff esperado, risco, endpoints tocados, ambientes, migrations e pontos sensiveis.",
    draftPlaceholder: "Escreva o plano ou checklist inicial, se tiver.",
  },
};

function buildBriefingAssessment(input: {
  route: string;
  moduleKey: string;
  activeCompanyName: string | null;
  message: string;
  currentBehavior: string;
  expectedBehavior: string;
  technicalContent: string;
  promptDraft: string;
}): BriefingAssessment {
  let score = 0;
  const missing: string[] = [];

  if (compactText(input.route)) score += 10;
  else missing.push("rota atual");

  if (compactText(input.moduleKey) && input.moduleKey !== "fora_dashboard") score += 10;
  else missing.push("modulo");

  if (compactText(input.activeCompanyName || "")) score += 8;
  else missing.push("empresa ativa");

  if (compactText(input.message)) score += 24;
  else missing.push("descricao objetiva do problema");

  if (compactText(input.currentBehavior)) score += 18;
  else missing.push("comportamento atual");

  if (compactText(input.expectedBehavior)) score += 18;
  else missing.push("comportamento esperado");

  if (compactText(input.technicalContent)) score += 12;
  else missing.push("evidencia tecnica ou log");

  if (compactText(input.promptDraft)) score += 8;

  if (score >= 78) return { score, label: "Briefing forte", tone: "success", missing };
  if (score >= 48) return { score, label: "Briefing medio", tone: "warning", missing };
  return { score, label: "Briefing fraco", tone: "danger", missing };
}

function buildContextSnapshot(input: {
  route: string;
  moduleKey: string;
  activeCompanyName: string | null;
  operationMode: string;
  environment: string;
  viewport: string;
}) {
  return [
    "CONTEXTO AUTOMATICO",
    `Rota: ${input.route || "-"}`,
    `Modulo: ${input.moduleKey || "-"}`,
    `Empresa ativa: ${input.activeCompanyName || "MASTER puro"}`,
    `Modo: ${input.operationMode || "-"}`,
    `Ambiente inferido: ${input.environment || "desconhecido"}`,
    `Viewport: ${input.viewport || "desconhecido"}`,
    `Data da analise: ${new Date().toLocaleString("pt-BR")}`,
  ].join("\n");
}

function buildExternalPrompt(
  target: PromptTarget,
  input: {
    guide: GuideDefinition;
    analysisType: string;
    route: string;
    moduleKey: string;
    activeCompanyName: string | null;
    operationMode: string;
    environment: string;
    viewport: string;
    message: string;
    currentBehavior: string;
    expectedBehavior: string;
    technicalContent: string;
    promptDraft: string;
    pageContextSummary: string;
    runtimeSignalSummary: string;
    moduleHints: string[];
  },
) {
  const providerName =
    target === "chatgpt" ? "ChatGPT" : target === "gemini" ? "Gemini" : "Codex";
  const externalModeInstructions =
    target === "codex"
      ? [
          "Atue como um agente tecnico focado em patch objetivo.",
          "Nao invente contexto que nao foi informado.",
          "Se faltar informacao critica, liste as lacunas antes de propor mudanca.",
          "Prefira passos concretos, arquivos provaveis e validacoes finais.",
        ]
      : [
          `Voce e meu afinador tecnico antes de eu chamar o Codex. Quero usar este chat (${providerName}) para estreitar o problema.`,
          "Sua primeira resposta deve fazer ate 5 perguntas curtas e objetivas, sem tentar resolver tudo de uma vez.",
          "Nao invente arquitetura nem arquivos; use apenas o contexto informado.",
          "Depois das perguntas, monte um resumo estruturado com problema, comportamento atual, esperado, causa provavel, areas suspeitas e pedido final para o Codex.",
        ];

  const sections = [
    `OBJETIVO DO CHAT (${providerName.toUpperCase()})`,
    input.guide.goal,
    "",
    "INSTRUCOES",
    ...externalModeInstructions.map((line, index) => `${index + 1}. ${line}`),
    "",
    "CONTEXTO",
    `Tipo de analise: ${input.analysisType}`,
    `Rota: ${input.route || "-"}`,
    `Modulo: ${input.moduleKey || "-"}`,
    `Empresa ativa: ${input.activeCompanyName || "MASTER puro"}`,
    `Modo de operacao: ${input.operationMode || "-"}`,
    `Ambiente: ${input.environment || "desconhecido"}`,
    `Viewport: ${input.viewport || "desconhecido"}`,
    `Contexto da pagina: ${input.pageContextSummary || "Nao capturado"}`,
    "",
    "PROBLEMA",
    input.message || "Nao informado",
    "",
    "COMPORTAMENTO ATUAL",
    input.currentBehavior || "Nao informado",
    "",
    "COMPORTAMENTO ESPERADO",
    input.expectedBehavior || "Nao informado",
  ];

  if (compactText(input.technicalContent)) {
    sections.push("", "EVIDENCIA TECNICA", input.technicalContent);
  }

  if (compactText(input.runtimeSignalSummary)) {
    sections.push("", "SINAIS AUTOMATICOS DO FRONTEND", input.runtimeSignalSummary);
  }

  if (input.moduleHints.length) {
    sections.push("", "FOCO DO MODULO", ...input.moduleHints.map((item, index) => `${index + 1}. ${item}`));
  }

  if (compactText(input.promptDraft)) {
    sections.push("", "RASCUNHO/PROMPT ATUAL", input.promptDraft);
  }

  sections.push(
    "",
    "PERGUNTAS GUIA QUE JA QUERO COBRIR",
    ...input.guide.questions.map((question, index) => `${index + 1}. ${question}`),
  );

  if (target === "codex") {
    sections.push(
      "",
      "SAIDA ESPERADA",
      "Entregue um plano curto, arquivos provaveis, patch sugerido e validacoes finais. Evite refatoracao ampla sem necessidade.",
    );
  } else {
    sections.push(
      "",
      "SAIDA ESPERADA DEPOIS DAS PERGUNTAS",
      "1. Resumo do problema",
      "2. Hipotese mais provavel",
      "3. Areas/arquivos suspeitos",
      "4. O que eu devo pedir ao Codex",
      "5. Prompt final pronto para o Codex",
    );
  }

  return sections.join("\n");
}

export default function TechAssistantGlobalDrawer({ isSystemMaster, masterContext }: Props) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [technicalContent, setTechnicalContent] = useState("");
  const [analysisType, setAnalysisType] = useState("manual");
  const [environment, setEnvironment] = useState("desconhecido");
  const [expectedBehavior, setExpectedBehavior] = useState("");
  const [currentBehavior, setCurrentBehavior] = useState("");
  const [promptDraft, setPromptDraft] = useState("");
  const [viewport, setViewport] = useState("desconhecido");
  const [promptTarget, setPromptTarget] = useState<PromptTarget>("chatgpt");
  const [pageContext, setPageContext] = useState<TechPageContext | null>(null);
  const [runtimeSignals, setRuntimeSignals] = useState<TechSignal[]>([]);
  const [result, setResult] = useState<TechAssistantResponse | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const [historyRouteFilter, setHistoryRouteFilter] = useState("");
  const [historyAnalysisTypeFilter, setHistoryAnalysisTypeFilter] = useState("");
  const [operationAction, setOperationAction] = useState("reprocessar_evento_teste");
  const [operationDetails, setOperationDetails] = useState("");
  const [operationConfirmationText, setOperationConfirmationText] = useState("");
  const [operationResult, setOperationResult] = useState<string | null>(null);

  const moduleKey = useMemo(() => deriveModuleFromPath(pathname || ""), [pathname]);
  const operationMode = masterContext?.active ? "empresa_assumida" : "master_puro";
  const activeCompanyName = masterContext?.companyName || null;
  const selectedGuide = ANALYSIS_GUIDES[analysisType] || ANALYSIS_GUIDES.manual;

  useEffect(() => {
    setMounted(true);

    const updateRuntimeDetails = () => {
      if (typeof window === "undefined") return;
      setEnvironment(inferEnvironment(window.location.hostname));
      setViewport(`${window.innerWidth}x${window.innerHeight}`);
    };

    updateRuntimeDetails();
    window.addEventListener("resize", updateRuntimeDetails);
    return () => window.removeEventListener("resize", updateRuntimeDetails);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const pushSignal = (signal: TechSignal) => {
      setRuntimeSignals((current) => [signal, ...current].slice(0, 8));
    };

    const handlePageContext = (event: Event) => {
      const customEvent = event as CustomEvent<TechPageContext>;
      setPageContext(customEvent.detail || null);
    };

    const handleApiError = (event: Event) => {
      const customEvent = event as CustomEvent<Record<string, unknown>>;
      const detail = customEvent.detail || {};
      pushSignal(
        toSignal(
          "api",
          `${formatUnknown(detail.method, "GET")} ${formatUnknown(detail.path || detail.url, "/")} -> ${formatUnknown(detail.status, "erro")}: ${formatUnknown(detail.message, "Falha de API")}`,
          formatUnknown(detail.response, ""),
        ),
      );
    };

    const handleWindowError = (event: ErrorEvent) => {
      pushSignal(
        toSignal(
          "window",
          event.message || "Erro de janela nao identificado.",
          `${event.filename || "arquivo_desconhecido"}:${event.lineno || 0}:${event.colno || 0}`,
        ),
      );
    };

    const handlePromiseError = (event: PromiseRejectionEvent) => {
      pushSignal(
        toSignal(
          "promise",
          formatUnknown(event.reason?.message || event.reason, "Promise rejeitada sem detalhe."),
        ),
      );
    };

    // NOTE: removed global console.error override — it produced noisy
    // forwarding of framework warnings (e.g., hydration messages) and
    // caused confusing stack traces. Runtime errors are already captured
    // via window "error" and "unhandledrejection" listeners above.

    window.addEventListener("hbx-tech-assistant:page-context", handlePageContext as EventListener);
    window.addEventListener("hbx-tech-assistant:api-error", handleApiError as EventListener);
    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handlePromiseError);

    return () => {
      // no console override to restore
      window.removeEventListener("hbx-tech-assistant:page-context", handlePageContext as EventListener);
      window.removeEventListener("hbx-tech-assistant:api-error", handleApiError as EventListener);
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handlePromiseError);
    };
  }, []);

  const briefingAssessment = useMemo(
    () =>
      buildBriefingAssessment({
        route: pathname || "",
        moduleKey,
        activeCompanyName,
        message,
        currentBehavior,
        expectedBehavior,
        technicalContent,
        promptDraft,
      }),
    [activeCompanyName, currentBehavior, expectedBehavior, message, moduleKey, pathname, promptDraft, technicalContent],
  );

  const contextSnapshot = useMemo(
    () =>
      buildContextSnapshot({
        route: pathname || "",
        moduleKey,
        activeCompanyName,
        operationMode,
        environment,
        viewport,
      }),
    [activeCompanyName, environment, moduleKey, operationMode, pathname, viewport],
  );

  const currentModuleHints = useMemo(
    () => MODULE_PROMPT_HINTS[pageContext?.moduleKey || moduleKey] || [],
    [moduleKey, pageContext?.moduleKey],
  );

  const pageContextSummary = useMemo(() => {
    if (!pageContext) return "";
    const tags = (pageContext.tags || []).filter(Boolean).join(", ");
    const details = Object.entries(pageContext.details || {})
      .slice(0, 8)
      .map(([key, value]) => `${key}: ${formatUnknown(value)}`)
      .join(" | ");
    return [pageContext.summary, tags ? `Tags: ${tags}` : "", details].filter(Boolean).join(" | ");
  }, [pageContext]);

  const runtimeSignalSummary = useMemo(
    () =>
      runtimeSignals
        .slice(0, 5)
        .map((signal) =>
          [signal.kind.toUpperCase(), signal.message, signal.meta ? `meta: ${signal.meta}` : ""]
            .filter(Boolean)
            .join(" | "),
        )
        .join("\n"),
    [runtimeSignals],
  );

  const externalPrompt = useMemo(
    () =>
      buildExternalPrompt(promptTarget, {
        guide: selectedGuide,
        analysisType,
        route: pathname || "",
        moduleKey,
        activeCompanyName,
        operationMode,
        environment,
        viewport,
        message,
        currentBehavior,
        expectedBehavior,
        technicalContent,
        promptDraft,
        pageContextSummary,
        runtimeSignalSummary,
        moduleHints: currentModuleHints,
      }),
    [
      activeCompanyName,
      analysisType,
      currentBehavior,
      environment,
      expectedBehavior,
      message,
      moduleKey,
      operationMode,
      pathname,
      pageContextSummary,
      promptDraft,
      promptTarget,
      currentModuleHints,
      runtimeSignalSummary,
      selectedGuide,
      technicalContent,
      viewport,
    ],
  );

  if (!isSystemMaster || !mounted) return null;

  async function copyText(text: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus(successMessage);
    } catch {
      setCopyStatus("Nao foi possivel copiar automaticamente.");
    }
  }

  async function runAnalysis() {
    setLoading(true);
    setError(null);
    setCopyStatus(null);

    try {
      const payload = await apiFetch<{ interactionId: string; response: TechAssistantResponse }>(
        "/tech-assistant/analyze",
        {
          method: "POST",
          body: JSON.stringify({
            analysisType,
            environment,
            route: pathname || "",
            module: moduleKey,
            activeCompanyName,
            operationMode,
            message,
            technicalContent: [technicalContent, pageContextSummary && `Contexto da pagina:\n${pageContextSummary}`]
              .filter(Boolean)
              .join("\n\n"),
            expectedBehavior,
            currentBehavior,
            promptDraft,
            consoleError: runtimeSignals
              .filter((signal) => signal.kind === "console" || signal.kind === "window" || signal.kind === "promise")
              .map((signal) => `${signal.kind.toUpperCase()}: ${signal.message}${signal.meta ? ` | ${signal.meta}` : ""}`)
              .join("\n"),
            apiError: runtimeSignals
              .filter((signal) => signal.kind === "api")
              .map((signal) => `${signal.message}${signal.meta ? ` | ${signal.meta}` : ""}`)
              .join("\n"),
          }),
        },
      );

      setResult(payload.response);
      setHistory((current) => [
        {
          id: payload.interactionId,
          createdAt: new Date().toISOString(),
          title: payload.response.title,
          response: payload.response,
        },
        ...current,
      ].slice(0, 20));
    } catch (analysisError) {
      const message = analysisError instanceof Error ? analysisError.message : "Falha ao executar análise.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory() {
    setError(null);
    try {
      const params = new URLSearchParams();
      if (masterContext?.companyId) params.set("companyId", String(masterContext.companyId));
      if (moduleKey) params.set("module", moduleKey);
      if (historyRouteFilter.trim()) params.set("route", historyRouteFilter.trim());
      if (historyAnalysisTypeFilter.trim()) params.set("analysisType", historyAnalysisTypeFilter.trim());
      const rows = await apiFetch<HistoryItem[]>(`/tech-assistant/history?${params.toString()}`);
      setHistory(Array.isArray(rows) ? rows : []);
      setHistoryVisible(true);
    } catch (historyError) {
      const message = historyError instanceof Error ? historyError.message : "Falha ao carregar histórico.";
      setError(message);
    }
  }

  function clearSession() {
    setResult(null);
    setMessage("");
    setTechnicalContent("");
    setExpectedBehavior("");
    setCurrentBehavior("");
    setPromptDraft("");
    setRuntimeSignals([]);
    setError(null);
    setCopyStatus(null);
    setOperationResult(null);
    setShowPromptPreview(false);
  }

  async function confirmSensitiveOperation() {
    setError(null);
    setOperationResult(null);
    try {
      const payload = await apiFetch<{ message: string }>("/tech-assistant/operation/confirm-action", {
        method: "POST",
        body: JSON.stringify({
          action: operationAction,
          details: operationDetails,
          confirmationText: operationConfirmationText,
        }),
      });
      setOperationResult(payload.message || "Confirmacao registrada com sucesso.");
      setOperationConfirmationText("");
    } catch (operationError) {
      const message = operationError instanceof Error ? operationError.message : "Falha ao confirmar operacao sensivel.";
      setError(message);
    }
  }

  const promptPreviewLabel =
    promptTarget === "chatgpt" ? "ChatGPT" : promptTarget === "gemini" ? "Gemini" : "Codex";

  return createPortal(
    <>
      <button
        type="button"
        className={`btn btn-primary btn-sm ${styles.assistantLauncher}`}
        onClick={() => {
          setOpen(true);
          setMinimized(false);
        }}
      >
        Assistente Tecnico
      </button>

      <aside
        className={`panel ${styles.assistantShell}`}
        data-open={open}
        data-minimized={minimized}
        aria-hidden={!open}
      >
        <div
          className={styles.assistantHeader}
          style={{ borderBottom: minimized ? "none" : "1px solid var(--line)" }}
        >
          <div className={styles.headerRow}>
            <div>
              <p className={styles.headerEyebrow}>Assistente global MASTER</p>
              <h3 className={styles.headerTitle}>Afinador tecnico sem API externa</h3>
              <p className={styles.headerMeta}>
                Rota: {pathname || "-"} | Modulo: {moduleKey} | Modo: {operationMode}
              </p>
              <p className={styles.headerMeta}>
                Empresa ativa: {activeCompanyName || "MASTER puro"} | Ambiente: {environment}
              </p>
            </div>
            <div className={styles.headerActions}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setMinimized((value) => !value)}
              >
                {minimized ? "Expandir" : "Minimizar"}
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>
                Fechar
              </button>
            </div>
          </div>
        </div>

        {!minimized ? (
          <div className={styles.assistantBody}>
            <div className={styles.sectionStack}>
              {error ? <div className="alert alert-error">{error}</div> : null}
              {copyStatus ? <div className="alert alert-info">{copyStatus}</div> : null}

              <section className={`panel panel-soft ${styles.formCard}`}>
                <div className={styles.cardHeader}>
                  <div>
                    <p className={styles.cardEyebrow}>Problema da pagina atual</p>
                    <strong>Digite aqui o que esta acontecendo</strong>
                  </div>
                  <span className={`${styles.scoreBadge} ${styles[`score${briefingAssessment.tone}`]}`}>
                    {briefingAssessment.label} · {briefingAssessment.score}/100
                  </span>
                </div>

                <p className={styles.cardText}>
                  O contexto da tela ja foi capturado automaticamente. Aqui voce pode focar
                  so em descrever o problema desta pagina, sem montar um prompt inteiro.
                </p>

                <div className={styles.badgeRow}>
                  <span className="badge badge-brand">{moduleKey}</span>
                  <span className="badge badge-neutral">{operationMode}</span>
                  <span className="badge badge-neutral">{environment}</span>
                  <span className="badge badge-neutral">{viewport}</span>
                </div>

                <div className={styles.questionBox}>
                  <strong>{pageContext?.summary || "Contexto automatico da tela"}</strong>
                  <ul>
                    <li>Rota atual: {pathname || "-"}</li>
                    <li>Empresa ativa: {activeCompanyName || "MASTER puro"}</li>
                    <li>Tipo de ajuda atual: {selectedGuide.title}</li>
                  </ul>
                </div>

                <label className="grid gap-1 text-sm">
                  Descricao do problema
                  <textarea
                    className="field"
                    rows={5}
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="Ex.: estou na aba Messages do Recovery e nao entendi por que a tela nao mostra onde editar a mensagem. Descreva o que voce fez, onde travou e o impacto."
                  />
                </label>

                <label className="grid gap-1 text-sm">
                  O que deveria acontecer? (opcional)
                  <textarea
                    className="field"
                    rows={3}
                    value={expectedBehavior}
                    onChange={(event) => setExpectedBehavior(event.target.value)}
                    placeholder="Ex.: eu queria um fluxo mais claro, com o campo certo visivel e menos informacoes na tela."
                  />
                </label>

                {briefingAssessment.missing.length ? (
                  <div className={styles.missingBox}>
                    <strong>Se quiser deixar a analise melhor, voce ainda pode complementar com:</strong>
                    <ul>
                      {briefingAssessment.missing.slice(0, 4).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className={styles.inlineActions}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      setPromptTarget("chatgpt");
                      void copyText(
                        buildExternalPrompt("chatgpt", {
                          guide: selectedGuide,
                          analysisType,
                          route: pathname || "",
                          moduleKey,
                          activeCompanyName,
                          operationMode,
                          environment,
                          viewport,
                          message,
                          currentBehavior,
                          expectedBehavior,
                          technicalContent,
                          promptDraft,
                          pageContextSummary,
                          runtimeSignalSummary,
                          moduleHints: currentModuleHints,
                        }),
                        "Prompt para ChatGPT copiado.",
                      );
                    }}
                  >
                    Copiar para ChatGPT
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setPromptTarget("gemini");
                      void copyText(
                        buildExternalPrompt("gemini", {
                          guide: selectedGuide,
                          analysisType,
                          route: pathname || "",
                          moduleKey,
                          activeCompanyName,
                          operationMode,
                          environment,
                          viewport,
                          message,
                          currentBehavior,
                          expectedBehavior,
                          technicalContent,
                          promptDraft,
                          pageContextSummary,
                          runtimeSignalSummary,
                          moduleHints: currentModuleHints,
                        }),
                        "Prompt para Gemini copiado.",
                      );
                    }}
                  >
                    Copiar para Gemini
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setPromptTarget("codex");
                      void copyText(
                        buildExternalPrompt("codex", {
                          guide: selectedGuide,
                          analysisType,
                          route: pathname || "",
                          moduleKey,
                          activeCompanyName,
                          operationMode,
                          environment,
                          viewport,
                          message,
                          currentBehavior,
                          expectedBehavior,
                          technicalContent,
                          promptDraft,
                          pageContextSummary,
                          runtimeSignalSummary,
                          moduleHints: currentModuleHints,
                        }),
                        "Prompt para Codex copiado.",
                      );
                    }}
                  >
                    Copiar para Codex
                  </button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={runAnalysis} disabled={loading}>
                    {loading ? "Analisando..." : "Executar analise HBX"}
                  </button>
                </div>

                <div className={styles.inlineActions}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setShowAdvanced((value) => !value)}
                  >
                    {showAdvanced ? "Esconder detalhes" : "Mostrar detalhes"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setShowPromptPreview((value) => !value)}
                  >
                    {showPromptPreview ? `Esconder pacote ${promptPreviewLabel}` : `Ver pacote ${promptPreviewLabel}`}
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={clearSession}>
                    Limpar sessao
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      if (historyVisible) {
                        setHistoryVisible(false);
                        return;
                      }
                      void loadHistory();
                    }}
                  >
                    {historyVisible ? "Ocultar historico" : "Ver historico"}
                  </button>
                  <Link href="/dashboard/master/assistente-tecnico" className="btn btn-secondary btn-sm">
                    Abrir central avancada
                  </Link>
                </div>
              </section>

              {showAdvanced ? (
                <section className={`panel panel-soft ${styles.contextCard}`}>
                  <div className={styles.cardHeader}>
                    <div>
                      <p className={styles.cardEyebrow}>Detalhes opcionais</p>
                      <strong>Contexto, sinais tecnicos e ajustes finos</strong>
                    </div>
                    <span className="badge badge-neutral">{selectedGuide.goal}</span>
                  </div>

                  <p className={styles.cardText}>
                    Abra esta area quando quiser aprofundar a analise, anexar evidencias ou ajustar
                    o pacote que sera enviado ao ChatGPT, Gemini ou Codex.
                  </p>

                  <div className={styles.fieldGridTwo}>
                    <label className="grid gap-1 text-sm">
                      Tipo de analise
                      <select
                        className="field"
                        value={analysisType}
                        onChange={(event) => setAnalysisType(event.target.value)}
                      >
                        <option value="manual">Mensagem manual</option>
                        <option value="page_analysis">Analisar pagina atual</option>
                        <option value="error_analysis">Analisar erro</option>
                        <option value="ctrl_u">Ctrl+U / HTML</option>
                        <option value="codex_prompt">Gerar prompt para Codex</option>
                        <option value="prompt_review">Revisar prompt</option>
                        <option value="pre_publish_checklist">Checklist</option>
                      </select>
                    </label>

                    <label className="grid gap-1 text-sm">
                      Ambiente
                      <select
                        className="field"
                        value={environment}
                        onChange={(event) => setEnvironment(event.target.value)}
                      >
                        <option value="localhost">localhost</option>
                        <option value="homologacao">homologacao</option>
                        <option value="producao">producao</option>
                        <option value="desconhecido">desconhecido</option>
                      </select>
                    </label>
                  </div>

                  <div className={styles.questionBox}>
                    <strong>Perguntas que o chat deve afunilar</strong>
                    <ul>
                      {selectedGuide.questions.map((question) => (
                        <li key={question}>{question}</li>
                      ))}
                    </ul>
                  </div>

                  {pageContext ? (
                    <div className={styles.questionBox}>
                      <strong>Contexto da pagina</strong>
                      <ul>
                        {(pageContext.tags || []).slice(0, 6).map((tag) => (
                          <li key={tag}>{tag}</li>
                        ))}
                        {Object.entries(pageContext.details || {})
                          .slice(0, 8)
                          .map(([key, value]) => (
                            <li key={key}>
                              {key}: {formatUnknown(value)}
                            </li>
                          ))}
                      </ul>
                    </div>
                  ) : null}

                  {runtimeSignals.length ? (
                    <div className={styles.warningBox}>
                      <strong>Sinais automaticos recentes</strong>
                      <ul>
                        {runtimeSignals.slice(0, 5).map((signal) => (
                          <li key={signal.id}>
                            {signal.kind.toUpperCase()}: {signal.message}
                            {signal.meta ? ` | ${signal.meta}` : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className={styles.fieldGridTwo}>
                    <label className="grid gap-1 text-sm">
                      Comportamento atual
                      <textarea
                        className="field"
                        rows={4}
                        value={currentBehavior}
                        onChange={(event) => setCurrentBehavior(event.target.value)}
                        placeholder="Ex.: ao salvar, a tela corta o preview e o usuario perde visibilidade dos botoes."
                      />
                    </label>

                    <label className="grid gap-1 text-sm">
                      Comportamento esperado
                      <textarea
                        className="field"
                        rows={4}
                        value={expectedBehavior}
                        onChange={(event) => setExpectedBehavior(event.target.value)}
                        placeholder="Ex.: editor deve usar melhor a tela, mostrar preview sem corte e manter responsividade."
                      />
                    </label>
                  </div>

                  <label className="grid gap-1 text-sm">
                    Evidencia tecnica
                    <textarea
                      className="field"
                      rows={5}
                      value={technicalContent}
                      onChange={(event) => setTechnicalContent(event.target.value)}
                      placeholder={selectedGuide.technicalPlaceholder}
                    />
                  </label>

                  <label className="grid gap-1 text-sm">
                    Rascunho / prompt atual
                    <textarea
                      className="field"
                      rows={4}
                      value={promptDraft}
                      onChange={(event) => setPromptDraft(event.target.value)}
                      placeholder={selectedGuide.draftPlaceholder}
                    />
                  </label>

                  <div className={styles.inlineActions}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => copyText(contextSnapshot, "Contexto automatico copiado.")}
                    >
                      Copiar contexto
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => copyText(externalPrompt, `Prompt ${promptPreviewLabel} copiado.`)}
                    >
                      Copiar prompt atual
                    </button>
                  </div>
                </section>
              ) : null}

              {showPromptPreview ? (
                <section className={`panel panel-soft ${styles.promptCard}`}>
                <div className={styles.cardHeader}>
                  <div>
                    <p className={styles.cardEyebrow}>Prompt pronto</p>
                    <strong>Pacote local para {promptPreviewLabel}</strong>
                  </div>
                  <div className={styles.providerTabs}>
                    <LiquidGlassSegmentedControl
                      items={PROMPT_TARGET_OPTIONS}
                      value={promptTarget}
                      ariaLabel="Destino do prompt externo"
                      onChange={(value) => setPromptTarget(value as PromptTarget)}
                    />
                  </div>
                </div>

                <p className={styles.cardText}>
                  Cole este pacote no chat escolhido. Para ChatGPT/Gemini, ele ja pede perguntas
                  curtas antes de tentar resolver. Para Codex, ele sai mais objetivo para patch.
                </p>

                {currentModuleHints.length ? (
                  <div className={styles.questionBox}>
                    <strong>Foco sugerido para este modulo</strong>
                    <ul>
                      {currentModuleHints.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <pre className={styles.promptPreview}>{externalPrompt}</pre>

                <div className={styles.inlineActions}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => copyText(externalPrompt, `Prompt ${promptPreviewLabel} copiado.`)}
                  >
                    Copiar pacote {promptPreviewLabel}
                  </button>
                </div>
              </section>
              ) : null}

              {showAdvanced ? (
                <section className={`panel panel-soft ${styles.operationCard}`}>
                <div className={styles.cardHeader}>
                  <div>
                    <p className={styles.cardEyebrow}>Operacao sensivel</p>
                    <strong>Registro manual com confirmacao obrigatoria</strong>
                  </div>
                </div>
                <div className="grid gap-2">
                  <label className="grid gap-1 text-sm">
                    Acao sensivel
                    <select
                      className="field"
                      value={operationAction}
                      onChange={(event) => setOperationAction(event.target.value)}
                    >
                      <option value="reprocessar_evento_teste">Reprocessar evento de teste</option>
                      <option value="validar_canal_em_producao">Validar canal em producao</option>
                      <option value="operacao_manual_controlada">Operacao manual controlada</option>
                    </select>
                  </label>

                  <label className="grid gap-1 text-sm">
                    Detalhes
                    <textarea
                      className="field"
                      rows={2}
                      value={operationDetails}
                      onChange={(event) => setOperationDetails(event.target.value)}
                      placeholder="Descreva o motivo da acao sensivel."
                    />
                  </label>

                  <label className="grid gap-1 text-sm">
                    Digite CONFIRMAR
                    <input
                      className="field"
                      value={operationConfirmationText}
                      onChange={(event) => setOperationConfirmationText(event.target.value)}
                      placeholder="CONFIRMAR"
                    />
                  </label>

                  <div className="flex gap-2">
                    <button type="button" className="btn btn-danger btn-sm" onClick={confirmSensitiveOperation}>
                      Registrar confirmacao
                    </button>
                  </div>
                  {operationResult ? <p className={styles.mutedText}>{operationResult}</p> : null}
                </div>
              </section>
              ) : null}

            {result ? (
              <section className={`panel panel-soft ${styles.resultCard}`}>
                <div className={styles.cardHeader}>
                  <div>
                    <p className={styles.cardEyebrow}>Analise HBX</p>
                    <strong>{result.title}</strong>
                  </div>
                  <span className="badge badge-neutral">{result.providerLabel}</span>
                </div>
                <p className={styles.cardText}><strong>Resumo:</strong> {result.blocks.summary}</p>
                <p className={styles.cardText}><strong>Causa provavel:</strong> {result.blocks.probableCause}</p>
                <p className={styles.cardText}><strong>Risco:</strong> {result.blocks.risk}</p>
                <p className={styles.cardText}><strong>Confianca:</strong> {result.diagnostic.confidence}</p>
                <p className={styles.cardText}><strong>Proxima acao:</strong> {result.diagnostic.nextAction}</p>

                {result.blocks.checkNow?.length ? (
                  <div className={styles.listBlock}>
                    <strong>Conferir agora</strong>
                    <ul>
                      {result.blocks.checkNow.map((item, index) => (
                        <li key={`${item}-${index}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {result.nextActions?.length ? (
                  <div className={styles.listBlock}>
                    <strong>Proximos passos</strong>
                    <ul>
                      {result.nextActions.map((item, index) => (
                        <li key={`${item}-${index}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {result.warnings?.length ? (
                  <div className={styles.warningBox}>
                    <strong>Alertas</strong>
                    <ul>
                      {result.warnings.map((item, index) => (
                        <li key={`${item}-${index}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className={styles.inlineActions}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() =>
                      copyText(
                        result.revisedPrompt?.trim() || result.blocks.codexPrompt,
                        "Prompt de saida HBX copiado.",
                      )
                    }
                  >
                    Copiar prompt HBX
                  </button>
                </div>
              </section>
            ) : null}

            {historyVisible ? (
              <section className={`panel panel-soft ${styles.historyCard}`}>
                <div className={styles.cardHeader}>
                  <div>
                    <p className={styles.cardEyebrow}>Historico recente</p>
                    <strong>Reusar diagnosticos anteriores</strong>
                  </div>
                </div>
                <div className={styles.fieldGridTwo}>
                  <label className="grid gap-1 text-sm">
                    Filtro por rota
                    <input
                      className="field"
                      value={historyRouteFilter}
                      onChange={(event) => setHistoryRouteFilter(event.target.value)}
                      placeholder="/dashboard/inbox"
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Filtro por tipo
                    <select
                      className="field"
                      value={historyAnalysisTypeFilter}
                      onChange={(event) => setHistoryAnalysisTypeFilter(event.target.value)}
                    >
                      <option value="">Todos</option>
                      <option value="manual">manual</option>
                      <option value="page_analysis">page_analysis</option>
                      <option value="error_analysis">error_analysis</option>
                      <option value="ctrl_u">ctrl_u</option>
                      <option value="codex_prompt">codex_prompt</option>
                      <option value="prompt_review">prompt_review</option>
                      <option value="pre_publish_checklist">pre_publish_checklist</option>
                      </select>
                  </label>
                </div>
                <div className={styles.inlineActions}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={loadHistory}>
                      Aplicar filtros
                    </button>
                </div>
                <div className={styles.historyList}>
                  {history.length ? history.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={styles.historyButton}
                      onClick={() => setResult(item.response)}
                    >
                      <strong>{item.title || "Analise"}</strong>
                      <span>
                        {item.analysisType || "manual"} ·{" "}
                        {new Date(item.createdAt).toLocaleString("pt-BR")}
                      </span>
                    </button>
                  )) : <p className={styles.mutedText}>Sem historico.</p>}
                </div>
              </section>
            ) : null}
            </div>
          </div>
        ) : null}
      </aside>
    </>,
    document.body,
  );
}
