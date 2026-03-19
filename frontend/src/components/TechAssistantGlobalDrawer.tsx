"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "../app/dashboard/_lib/api";
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
  };
  nextActions: string[];
  checklist: string[];
  warnings: string[];
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

function deriveModuleFromPath(pathname: string) {
  if (pathname.startsWith("/dashboard/inbox")) return "atendimento";
  if (pathname.startsWith("/dashboard/website")) return "website";
  if (pathname.startsWith("/dashboard/master")) return "master";
  if (pathname.startsWith("/dashboard/webscraping")) return "webscraping";
  if (pathname.startsWith("/dashboard/gerencial")) return "gerencial";
  if (pathname.startsWith("/dashboard/importacoes")) return "follow_up_internacional";
  if (pathname.startsWith("/hbx-recovery")) return "hbx_recovery";
  if (pathname.startsWith("/dashboard")) return "dashboard";
  return "fora_dashboard";
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
  const [result, setResult] = useState<TechAssistantResponse | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [historyRouteFilter, setHistoryRouteFilter] = useState("");
  const [historyAnalysisTypeFilter, setHistoryAnalysisTypeFilter] = useState("");
  const [operationAction, setOperationAction] = useState("reprocessar_evento_teste");
  const [operationDetails, setOperationDetails] = useState("");
  const [operationConfirmationText, setOperationConfirmationText] = useState("");
  const [operationResult, setOperationResult] = useState<string | null>(null);

  const moduleKey = useMemo(() => deriveModuleFromPath(pathname || ""), [pathname]);
  const operationMode = masterContext?.active ? "empresa_assumida" : "master_puro";
  const activeCompanyName = masterContext?.companyName || null;

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isSystemMaster || !mounted) return null;

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
            environment: "desconhecido",
            route: pathname || "",
            module: moduleKey,
            activeCompanyName,
            operationMode,
            message,
            technicalContent,
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

  async function copyPrompt(prompt: string) {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyStatus("Prompt copiado.");
    } catch {
      setCopyStatus("Nao foi possivel copiar automaticamente.");
    }
  }

  function clearSession() {
    setResult(null);
    setMessage("");
    setTechnicalContent("");
    setError(null);
    setCopyStatus(null);
    setOperationResult(null);
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
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-muted">Assistente global</p>
                <h3 className="mt-1 text-lg font-semibold">Diagnostico tecnico ao vivo</h3>
                <p className="text-xs text-muted mt-1">
                  Rota: {pathname || "-"} | Modulo: {moduleKey} | Modo: {operationMode}
                </p>
                <p className="text-xs text-muted mt-1">
                  Empresa ativa: {activeCompanyName || "MASTER puro"}
                </p>
              </div>
              <div className="flex gap-2">
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

            <div className="mt-4 grid gap-3">
              {error ? <div className="alert alert-error">{error}</div> : null}
              {copyStatus ? <div className="alert alert-info">{copyStatus}</div> : null}

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
                Descricao do problema
                <textarea
                  className="field"
                  rows={4}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Explique o comportamento atual e o esperado."
                />
              </label>

              <label className="grid gap-1 text-sm">
                Logs/stacktrace/payload (opcional)
                <textarea
                  className="field"
                  rows={6}
                  value={technicalContent}
                  onChange={(event) => setTechnicalContent(event.target.value)}
                  placeholder="Cole aqui erro de console, response de API, stacktrace, JSON..."
                />
              </label>

              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-primary btn-sm" onClick={runAnalysis} disabled={loading}>
                  {loading ? "Analisando..." : "Executar analise"}
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={clearSession}>
                  Limpar sessao
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={loadHistory}>
                  Ver historico
                </button>
                <Link href="/dashboard/master/assistente-tecnico" className="btn btn-secondary btn-sm">
                  Abrir central avancada
                </Link>
              </div>

              <section className="panel panel-soft p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-muted">Modo operacao (confirmacao obrigatoria)</p>
                <div className="mt-2 grid gap-2">
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
                  {operationResult ? <p className="text-xs text-muted">{operationResult}</p> : null}
                </div>
              </section>
            </div>

            {result ? (
              <section className="panel panel-soft mt-4 p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-muted">Resultado</p>
                <h4 className="mt-2 text-base font-semibold">{result.title}</h4>
                <p className="text-sm text-muted mt-1">Provider: {result.providerLabel}</p>
                <p className="mt-3 text-sm"><strong>Resumo:</strong> {result.blocks.summary}</p>
                <p className="mt-2 text-sm"><strong>Causa provavel:</strong> {result.blocks.probableCause}</p>
                <p className="mt-2 text-sm"><strong>Risco:</strong> {result.blocks.risk}</p>
                <p className="mt-2 text-sm"><strong>Confianca:</strong> {result.diagnostic.confidence}</p>
                <p className="mt-2 text-sm"><strong>Proxima acao:</strong> {result.diagnostic.nextAction}</p>

                {result.blocks.checkNow?.length ? (
                  <div className="mt-3 text-sm">
                    <strong>Conferir agora</strong>
                    <ul className="mt-1 list-disc pl-5">
                      {result.blocks.checkNow.map((item, index) => (
                        <li key={`${item}-${index}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => copyPrompt(result.blocks.codexPrompt)}
                  >
                    Copiar prompt
                  </button>
                </div>
              </section>
            ) : null}

            {historyVisible ? (
              <section className="panel panel-soft mt-4 p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-muted">Historico recente</p>
                <div className="mt-2 grid gap-2">
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
                  <div className="flex gap-2">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={loadHistory}>
                      Aplicar filtros
                    </button>
                  </div>
                </div>
                <div className="mt-2 grid gap-2">
                  {history.length ? history.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ justifyContent: "flex-start" }}
                      onClick={() => setResult(item.response)}
                    >
                      {item.title || "Analise"} - {new Date(item.createdAt).toLocaleString("pt-BR")}
                    </button>
                  )) : <p className="text-sm text-muted">Sem historico.</p>}
                </div>
              </section>
            ) : null}
          </div>
        ) : null}
      </aside>
    </>,
    document.body,
  );
}
