"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "@/app/_lib/api";
import { useRequireAuth } from "@/app/_lib/useRequireAuth";
import styles from "./page.module.css";

type CurrentUser = {
  id: number;
  username?: string | null;
  role?: string | null;
  isSystemMaster?: boolean;
};

type TechAssistantResponse = {
  mode: "analysis" | "review_prompt" | "checklist";
  analysisType: string;
  title: string;
  labels: string[];
  blocks: {
    summary: string;
    probableCause: string;
    checkNow: string[];
    likelyFiles: string[];
    risk: string;
    codexPrompt: string;
  };
  diagnostic: {
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
  nextActions: string[];
  checklist: string[];
  reviewNotes: string[];
  revisedPrompt: string;
  providerLabel: string;
  providerStatus: string;
  warnings: string[];
};

type TechAssistantHistoryItem = {
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

type ExamplePayload = {
  label: string;
  payload: Partial<FormState>;
};

type ExamplesResponse = {
  examples: ExamplePayload[];
};

type FormState = {
  analysisType: string;
  environment: string;
  route: string;
  message: string;
  technicalContent: string;
  expectedBehavior: string;
  currentBehavior: string;
  htmlSource: string;
  consoleError: string;
  buildError: string;
  backendStacktrace: string;
  apiError: string;
  requestJson: string;
  responseJson: string;
  promptDraft: string;
};

const INITIAL_FORM: FormState = {
  analysisType: "page_analysis",
  environment: "localhost",
  route: "/master/assistente-tecnico",
  message: "",
  technicalContent: "",
  expectedBehavior: "",
  currentBehavior: "",
  htmlSource: "",
  consoleError: "",
  buildError: "",
  backendStacktrace: "",
  apiError: "",
  requestJson: "",
  responseJson: "",
  promptDraft: "",
};

const ANALYSIS_TYPE_OPTIONS = [
  { value: "page_analysis", label: "Analisar página atual" },
  { value: "ctrl_u", label: "Colar Ctrl+U / HTML" },
  { value: "error_analysis", label: "Analisar erro" },
  { value: "codex_prompt", label: "Gerar prompt para Codex" },
  { value: "prompt_review", label: "Revisar prompt" },
  { value: "pre_publish_checklist", label: "Checklist pré-publicação" },
  { value: "manual", label: "Mensagem manual" },
];

function formatDateTime(value?: string | null) {
  if (!value) return "Agora";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR");
}

function badgeClass(label: string) {
  const normalized = label.toLowerCase();
  if (normalized.includes("alto") || normalized.includes("corrigir agora")) return "badge badge-danger";
  if (normalized.includes("baixo")) return "badge badge-success";
  return "badge badge-brand";
}

function fieldValue(source: Record<string, unknown>, key: keyof FormState) {
  return String(source?.[key] ?? "");
}

export default function TechAssistantClientPage() {
  const hasToken = useRequireAuth();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [isSystemMaster, setIsSystemMaster] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [history, setHistory] = useState<TechAssistantHistoryItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [examples, setExamples] = useState<ExamplePayload[]>([]);
  const [currentResult, setCurrentResult] = useState<TechAssistantResponse | null>(null);

  const selectedHistoryItem = useMemo(
    () => history.find((item) => item.id === selectedItemId) || null,
    [history, selectedItemId],
  );

  useEffect(() => {
    if (hasToken !== true) return;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [user, historyPayload, examplesPayload] = await Promise.all([
          apiFetch<CurrentUser>("/profile/current-user"),
          apiFetch<TechAssistantHistoryItem[]>("/tech-assistant/history"),
          apiFetch<ExamplesResponse>("/tech-assistant/examples"),
        ]);

        const isMaster = Boolean(user?.isSystemMaster);
        setIsSystemMaster(isMaster);
        setCheckingAccess(false);

        if (!isMaster) {
          setHistory([]);
          setExamples([]);
          setCurrentResult(null);
          return;
        }

        const normalizedHistory = Array.isArray(historyPayload) ? historyPayload : [];
        setHistory(normalizedHistory);
        setExamples(Array.isArray(examplesPayload?.examples) ? examplesPayload.examples : []);

        if (normalizedHistory[0]) {
          setSelectedItemId(normalizedHistory[0].id);
          setCurrentResult(normalizedHistory[0].response);
        }
      } catch (loadError) {
        setCheckingAccess(false);
        const message = loadError instanceof Error ? loadError.message : "Falha ao carregar o Assistente Técnico HBX.";
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [hasToken]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submitAnalysis(nextType?: string) {
    const analysisType = nextType || form.analysisType;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    setCopyStatus(null);

    try {
      const payload = {
        ...form,
        analysisType,
      };
      const result = await apiFetch<{ interactionId: string; response: TechAssistantResponse }>("/tech-assistant/analyze", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const historyItem: TechAssistantHistoryItem = {
        id: result.interactionId,
        createdAt: new Date().toISOString(),
        mode: result.response.mode,
        analysisType,
        title: result.response.title,
        route: payload.route || null,
        environment: payload.environment || null,
        providerLabel: result.response.providerLabel,
        providerStatus: result.response.providerStatus,
        response: result.response,
        maskedInput: payload,
      };

      setCurrentResult(result.response);
      setSelectedItemId(historyItem.id);
      setHistory((current) => [historyItem, ...current.filter((item) => item.id !== historyItem.id)].slice(0, 25));
      setForm((current) => ({ ...current, analysisType }));
      setSuccess(
        analysisType === "prompt_review"
          ? "Prompt revisado com sucesso."
          : analysisType === "pre_publish_checklist"
            ? "Checklist gerada com sucesso."
            : "Análise concluída com sucesso.",
      );
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Falha ao analisar o conteúdo técnico.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteHistoryItem(id: string) {
    setError(null);
    setSuccess(null);
    try {
      await apiFetch(`/tech-assistant/history/${id}`, { method: "DELETE" });
      setHistory((current) => {
        const next = current.filter((item) => item.id !== id);
        if (selectedItemId === id) {
          const first = next[0] || null;
          setSelectedItemId(first?.id || null);
          setCurrentResult(first?.response || null);
        }
        return next;
      });
      setSuccess("Interação removida do histórico.");
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "Falha ao excluir item do histórico.";
      setError(message);
    }
  }

  async function handleClearHistory() {
    setError(null);
    setSuccess(null);
    try {
      await apiFetch("/tech-assistant/history", { method: "DELETE" });
      setHistory([]);
      setSelectedItemId(null);
      setCurrentResult(null);
      setSuccess("Histórico do assistente removido.");
    } catch (clearError) {
      const message = clearError instanceof Error ? clearError.message : "Falha ao limpar o histórico.";
      setError(message);
    }
  }

  async function copyPrompt(prompt: string) {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyStatus("Prompt copiado.");
    } catch {
      setCopyStatus("Não foi possível copiar automaticamente.");
    }
  }

  function applyExample(example: ExamplePayload) {
    setForm((current) => ({
      ...current,
      ...example.payload,
    }));
    setSuccess(`Exemplo carregado: ${example.label}.`);
    setError(null);
  }

  function clearAnalysis() {
    setForm(INITIAL_FORM);
    setCurrentResult(null);
    setSelectedItemId(null);
    setError(null);
    setSuccess("Campos da análise limpos.");
    setCopyStatus(null);
  }

  function selectHistoryItem(item: TechAssistantHistoryItem) {
    setSelectedItemId(item.id);
    setCurrentResult(item.response);
    setSuccess(null);
    setCopyStatus(null);
  }

  if (hasToken === null || checkingAccess) {
    return (
      <main className="app-shell">
        <div className="app-container">
          <div className="panel p-4 text-sm text-muted">Carregando Assistente Técnico HBX...</div>
        </div>
      </main>
    );
  }

  if (!hasToken) return null;

  if (!isSystemMaster) {
    return (
      <DashboardScaffold
        title="Assistente Técnico HBX"
        description="Área exclusiva do master para diagnóstico técnico, revisão de prompt e checklist segura."
      >
        <section className="panel p-5">
          <h2 className="text-lg font-semibold">Acesso exclusivo do MASTER</h2>
          <p className="text-sm text-muted mt-2">
            Este módulo não fica disponível para usuários comuns e não executa automações de código,
            publish ou ações destrutivas.
          </p>
        </section>
      </DashboardScaffold>
    );
  }

  const activeResponse = currentResult || selectedHistoryItem?.response || null;
  const inputPreview = selectedHistoryItem?.maskedInput || form;

  return (
    <DashboardScaffold
      title="Assistente Técnico HBX"
      description="Diagnóstico interno para páginas, fluxos, frontend, backend e prompts mais certeiros para o Codex."
      actions={
        <div className="flex flex-wrap gap-2">
          <Link href="/master" className="btn btn-secondary btn-sm">
            Voltar ao master
          </Link>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => submitAnalysis()} disabled={submitting}>
            {submitting ? "Analisando..." : "Executar análise"}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={clearAnalysis}>
            Limpar análise
          </button>
        </div>
      }
    >
      <div className={styles.layout}>
        {error ? <div className="alert alert-error">{error}</div> : null}
        {success ? <div className="alert alert-success">{success}</div> : null}
        {copyStatus ? <div className="alert alert-info">{copyStatus}</div> : null}

        <section className={`panel ${styles.hero}`}>
          <div className={styles.heroGrid}>
            <div>
              <span className="badge badge-brand">MASTER</span>
              <h2 className="mt-3 text-[1.7rem] font-extrabold tracking-tight">Assistente Técnico HBX</h2>
              <p className="text-sm text-muted mt-3 leading-relaxed max-w-[70ch]">
                Use este módulo para reduzir tentativa e erro, organizar o diagnóstico técnico e sair com um
                prompt profissional e preciso para o Codex. O assistente não edita o sistema, não publica nada
                e não executa ações destrutivas.
              </p>

              <div className={`mt-4 ${styles.quickActions}`}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => submitAnalysis("page_analysis")} disabled={submitting}>
                  Analisar página atual
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setField("analysisType", "ctrl_u")}>
                  Colar Ctrl+U
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => submitAnalysis("error_analysis")} disabled={submitting}>
                  Analisar erro
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => submitAnalysis("codex_prompt")} disabled={submitting}>
                  Gerar prompt para Codex
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => submitAnalysis("prompt_review")} disabled={submitting}>
                  Revisar prompt
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => submitAnalysis("pre_publish_checklist")} disabled={submitting}>
                  Checklist pré-publicação
                </button>
              </div>
            </div>

            <div className={styles.heroStatGrid}>
              <article className={styles.heroStat}>
                <p className="text-xs uppercase tracking-[0.12em] text-muted">Fluxo</p>
                <strong className="block mt-2 text-lg font-semibold">Diagnóstico interno</strong>
                <p className="text-xs text-muted mt-2">Analisa contexto, estrutura hipótese e gera próxima ação.</p>
              </article>
              <article className={styles.heroStat}>
                <p className="text-xs uppercase tracking-[0.12em] text-muted">Saída</p>
                <strong className="block mt-2 text-lg font-semibold">Prompt pronto</strong>
                <p className="text-xs text-muted mt-2">Patch mínimo, escopo controlado e validação final.</p>
              </article>
              <article className={styles.heroStat}>
                <p className="text-xs uppercase tracking-[0.12em] text-muted">Segurança</p>
                <strong className="block mt-2 text-lg font-semibold">Sem automação perigosa</strong>
                <p className="text-xs text-muted mt-2">Histórico mascarado e sem edição automática de código.</p>
              </article>
              <article className={styles.heroStat}>
                <p className="text-xs uppercase tracking-[0.12em] text-muted">Cobertura</p>
                <strong className="block mt-2 text-lg font-semibold">Frontend, backend e publish</strong>
                <p className="text-xs text-muted mt-2">Aceita HTML, console, build, stacktrace e payloads JSON.</p>
              </article>
            </div>
          </div>
        </section>

        <div className={styles.mainGrid}>
          <div className={styles.formGrid}>
            <section className="panel p-4">
              <div>
                <h3 className={styles.sectionTitle}>Contexto da análise</h3>
                <p className={styles.sectionHint}>Informe ambiente, rota e o que deveria acontecer antes de colar logs ou HTML bruto.</p>
              </div>

              <div className={`mt-4 ${styles.fieldGrid}`}>
                <div>
                  <label className="text-xs uppercase tracking-[0.12em] text-muted">Tipo de análise</label>
                  <select className="field mt-1" value={form.analysisType} onChange={(event) => setField("analysisType", event.target.value)}>
                    {ANALYSIS_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs uppercase tracking-[0.12em] text-muted">Ambiente</label>
                  <select className="field mt-1" value={form.environment} onChange={(event) => setField("environment", event.target.value)}>
                    <option value="localhost">localhost</option>
                    <option value="homologacao">homologação</option>
                    <option value="producao">produção</option>
                    <option value="desconhecido">desconhecido</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs uppercase tracking-[0.12em] text-muted">Rota / página</label>
                  <input className="field mt-1" value={form.route} onChange={(event) => setField("route", event.target.value)} placeholder="Ex.: /website" />
                </div>

                <div>
                  <label className="text-xs uppercase tracking-[0.12em] text-muted">Mensagem manual</label>
                  <input className="field mt-1" value={form.message} onChange={(event) => setField("message", event.target.value)} placeholder="Resumo curto do problema" />
                </div>
              </div>

              <div className={`mt-4 ${styles.fieldGrid}`}>
                <div>
                  <label className="text-xs uppercase tracking-[0.12em] text-muted">Comportamento esperado</label>
                  <textarea className="field mt-1 min-h-[120px]" value={form.expectedBehavior} onChange={(event) => setField("expectedBehavior", event.target.value)} placeholder="O que deveria acontecer?" />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-[0.12em] text-muted">Comportamento atual</label>
                  <textarea className="field mt-1 min-h-[120px]" value={form.currentBehavior} onChange={(event) => setField("currentBehavior", event.target.value)} placeholder="O que acontece hoje?" />
                </div>
              </div>
            </section>

            <section className="panel p-4">
              <div>
                <h3 className={styles.sectionTitle}>Conteúdo técnico</h3>
                <p className={styles.sectionHint}>Cole aqui o material principal da análise. Pode ser HTML bruto, erro de console, stacktrace, build log ou payload.</p>
              </div>

              <div className="mt-4 space-y-4">
                <div>
                  <label className="text-xs uppercase tracking-[0.12em] text-muted">Campo técnico principal</label>
                  <textarea className="field mt-1 min-h-[240px]" value={form.technicalContent} onChange={(event) => setField("technicalContent", event.target.value)} placeholder="Cole aqui o bloco principal da análise técnica" />
                </div>

                <div className={styles.fieldGrid}>
                  <div>
                    <label className="text-xs uppercase tracking-[0.12em] text-muted">Ctrl+U / HTML bruto</label>
                    <textarea className="field mt-1 min-h-[160px]" value={form.htmlSource} onChange={(event) => setField("htmlSource", event.target.value)} placeholder="Cole HTML bruto quando a análise for de página renderizada" />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-[0.12em] text-muted">Erro de console</label>
                    <textarea className="field mt-1 min-h-[160px]" value={form.consoleError} onChange={(event) => setField("consoleError", event.target.value)} placeholder="Cole aqui erros do navegador" />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-[0.12em] text-muted">Erro de build / publish / deploy</label>
                    <textarea className="field mt-1 min-h-[160px]" value={form.buildError} onChange={(event) => setField("buildError", event.target.value)} placeholder="Cole logs de build, publish ou deploy" />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-[0.12em] text-muted">Stacktrace de backend</label>
                    <textarea className="field mt-1 min-h-[160px]" value={form.backendStacktrace} onChange={(event) => setField("backendStacktrace", event.target.value)} placeholder="Cole a stacktrace do NestJS/backend" />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-[0.12em] text-muted">Resposta de API com erro</label>
                    <textarea className="field mt-1 min-h-[160px]" value={form.apiError} onChange={(event) => setField("apiError", event.target.value)} placeholder="Status code, payload e mensagem da API" />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-[0.12em] text-muted">Prompt para revisão</label>
                    <textarea className="field mt-1 min-h-[160px]" value={form.promptDraft} onChange={(event) => setField("promptDraft", event.target.value)} placeholder="Cole aqui o prompt que você quer revisar" />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-[0.12em] text-muted">JSON de request</label>
                    <textarea className="field mt-1 min-h-[160px]" value={form.requestJson} onChange={(event) => setField("requestJson", event.target.value)} placeholder="Opcional" />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-[0.12em] text-muted">JSON de response</label>
                    <textarea className="field mt-1 min-h-[160px]" value={form.responseJson} onChange={(event) => setField("responseJson", event.target.value)} placeholder="Opcional" />
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => submitAnalysis()} disabled={submitting}>
                  {submitting ? "Processando..." : "Analisar agora"}
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => submitAnalysis("codex_prompt")} disabled={submitting}>
                  Gerar prompt
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => submitAnalysis("prompt_review")} disabled={submitting}>
                  Revisar prompt
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => submitAnalysis("pre_publish_checklist")} disabled={submitting}>
                  Gerar checklist
                </button>
              </div>
            </section>

            <section className={styles.responseStack}>
              <article className={styles.bubbleUser}>
                <div className={styles.bubbleHeader}>
                  <div>
                    <h3 className={styles.sectionTitle}>Seu contexto</h3>
                    <p className={styles.sectionHint}>Resumo da entrada atual ou do item histórico selecionado.</p>
                  </div>
                  <div className={styles.bubbleMeta}>
                    <span className="badge badge-brand">{fieldValue(inputPreview, "analysisType") || "manual"}</span>
                    <span className="badge badge-brand">{fieldValue(inputPreview, "environment") || "desconhecido"}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div>
                    <strong>Rota atual</strong>
                    <p className="text-muted mt-1">{fieldValue(inputPreview, "route") || "Não informada"}</p>
                  </div>
                  <div>
                    <strong>Mensagem</strong>
                    <p className="text-muted mt-1">{fieldValue(inputPreview, "message") || "Sem resumo manual"}</p>
                  </div>
                  <div>
                    <strong>Esperado</strong>
                    <p className="text-muted mt-1">{fieldValue(inputPreview, "expectedBehavior") || "Não informado"}</p>
                  </div>
                  <div>
                    <strong>Atual</strong>
                    <p className="text-muted mt-1">{fieldValue(inputPreview, "currentBehavior") || "Não informado"}</p>
                  </div>
                </div>
              </article>

              {activeResponse ? (
                <article className={styles.bubbleAssistant}>
                  <div className={styles.bubbleHeader}>
                    <div>
                      <h3 className={styles.sectionTitle}>Resposta do assistente</h3>
                      <p className={styles.sectionHint}>
                        {selectedHistoryItem ? `Histórico em ${formatDateTime(selectedHistoryItem.createdAt)}` : "Resultado da análise atual"}
                      </p>
                    </div>
                    <div className={styles.bubbleMeta}>
                      {activeResponse.labels.map((label) => (
                        <span key={label} className={badgeClass(label)}>
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>

                  {activeResponse.warnings.length ? (
                    <div className="alert alert-info mb-4">
                      {activeResponse.warnings.join(" ")}
                    </div>
                  ) : null}

                  <div className={styles.blockGrid}>
                    <section className={`${styles.blockCard} ${styles.blockCardFull}`}>
                      <h4 className="font-semibold">Resumo do problema</h4>
                      <p className="text-sm text-muted mt-2 leading-relaxed">{activeResponse.blocks.summary}</p>
                    </section>

                    <section className={styles.blockCard}>
                      <h4 className="font-semibold">Causa provável</h4>
                      <p className="text-sm text-muted mt-2 leading-relaxed">{activeResponse.blocks.probableCause}</p>
                    </section>

                    <section className={styles.blockCard}>
                      <h4 className="font-semibold">Risco da alteração</h4>
                      <p className="text-sm text-muted mt-2 leading-relaxed">{activeResponse.blocks.risk}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className={badgeClass(activeResponse.blocks.risk)}>{activeResponse.blocks.risk}</span>
                        <span className="badge badge-brand">Confiança {activeResponse.diagnostic.confidence}</span>
                      </div>
                    </section>

                    <section className={styles.blockCard}>
                      <h4 className="font-semibold">O que conferir agora</h4>
                      <ul className={`${styles.bulletList} text-sm text-muted mt-2`}>
                        {activeResponse.blocks.checkNow.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </section>

                    <section className={styles.blockCard}>
                      <h4 className="font-semibold">Arquivos/áreas que provavelmente precisam ser alterados</h4>
                      <ul className={`${styles.bulletList} text-sm text-muted mt-2`}>
                        {activeResponse.blocks.likelyFiles.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </section>

                    <section className={styles.blockCard}>
                      <h4 className="font-semibold">Diagnóstico estruturado</h4>
                      <ul className={`${styles.bulletList} text-sm text-muted mt-2`}>
                        <li>Rota atual: {activeResponse.diagnostic.route}</li>
                        <li>Ambiente: {activeResponse.diagnostic.environment}</li>
                        <li>Esperado: {activeResponse.diagnostic.expectedBehavior}</li>
                        <li>Atual: {activeResponse.diagnostic.currentBehavior}</li>
                        <li>Erro principal: {activeResponse.diagnostic.mainError}</li>
                        <li>Próxima ação: {activeResponse.diagnostic.nextAction}</li>
                      </ul>
                    </section>

                    <section className={`${styles.blockCard} ${styles.blockCardFull}`}>
                      <h4 className="font-semibold">Prompt pronto para Codex</h4>
                      <div className={styles.monoBox}>{activeResponse.blocks.codexPrompt}</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => copyPrompt(activeResponse.blocks.codexPrompt)}>
                          Copiar prompt
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setField("promptDraft", activeResponse.blocks.codexPrompt)}>
                          Enviar para revisão
                        </button>
                      </div>
                    </section>

                    {activeResponse.reviewNotes.length ? (
                      <section className={`${styles.blockCard} ${styles.blockCardFull}`}>
                        <h4 className="font-semibold">Revisão do prompt</h4>
                        <ul className={`${styles.bulletList} text-sm text-muted mt-2`}>
                          {activeResponse.reviewNotes.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                        {activeResponse.revisedPrompt ? (
                          <>
                            <div className={styles.monoBox}>{activeResponse.revisedPrompt}</div>
                            <div className="mt-3">
                              <button type="button" className="btn btn-secondary btn-sm" onClick={() => copyPrompt(activeResponse.revisedPrompt)}>
                                Copiar prompt revisado
                              </button>
                            </div>
                          </>
                        ) : null}
                      </section>
                    ) : null}

                    <section className={`${styles.blockCard} ${styles.blockCardFull}`}>
                      <h4 className="font-semibold">Checklist pré-publicação</h4>
                      <ul className={`${styles.bulletList} text-sm text-muted mt-2`}>
                        {activeResponse.checklist.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </section>
                  </div>
                </article>
              ) : (
                <article className="panel p-5">
                  <h3 className={styles.sectionTitle}>Área do chat/resposta</h3>
                  <p className="text-sm text-muted mt-2">
                    Ainda não há análise selecionada. Preencha o contexto, cole o conteúdo técnico e use uma das ações rápidas.
                  </p>
                </article>
              )}
            </section>
          </div>

          <aside className={styles.stickyColumn}>
            <section className="panel p-4">
              <h3 className={styles.sectionTitle}>Próximas ações</h3>
              <p className={styles.sectionHint}>Resumo operacional do que você deve fazer agora.</p>

              <div className={`mt-4 ${styles.miniCardGrid}`}>
                <article className={styles.miniCard}>
                  <strong className="text-sm">Possíveis arquivos envolvidos</strong>
                  <ul className={`${styles.bulletList} text-sm text-muted mt-2`}>
                    {(activeResponse?.blocks.likelyFiles || ["Aguardando análise"]).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </article>

                <article className={styles.miniCard}>
                  <strong className="text-sm">Risco</strong>
                  <p className="text-sm text-muted mt-2">{activeResponse?.blocks.risk || "Aguardando análise"}</p>
                </article>

                <article className={styles.miniCard}>
                  <strong className="text-sm">Próximas ações sugeridas</strong>
                  <ul className={`${styles.bulletList} text-sm text-muted mt-2`}>
                    {(activeResponse?.nextActions || ["Envie uma análise para receber recomendações."]).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </article>
              </div>
            </section>

            <section className="panel p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className={styles.sectionTitle}>Histórico do assistente</h3>
                  <p className={styles.sectionHint}>Interações armazenadas com mascaramento de dados sensíveis.</p>
                </div>
                <button type="button" className="btn btn-danger btn-sm" onClick={handleClearHistory} disabled={!history.length}>
                  Excluir histórico
                </button>
              </div>

              <div className={`mt-4 ${styles.historyList}`}>
                {loading ? (
                  <div className="text-sm text-muted">Carregando histórico...</div>
                ) : history.length ? (
                  history.map((item) => (
                    <article key={item.id} className={`${styles.historyItem} ${selectedItemId === item.id ? styles.historyItemActive : ""}`}>
                      <button type="button" className="w-full text-left" onClick={() => selectHistoryItem(item)}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <strong className="block text-sm">{item.title || "Análise técnica"}</strong>
                            <p className="text-xs text-muted mt-1">{formatDateTime(item.createdAt)}</p>
                          </div>
                          <span className={badgeClass(item.response.blocks.risk)}>{item.response.blocks.risk}</span>
                        </div>
                        <p className="text-sm text-muted mt-2 leading-relaxed">{item.response.blocks.summary}</p>
                      </button>

                      <div className={styles.historyActions}>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => selectHistoryItem(item)}>
                          Abrir
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => copyPrompt(item.response.blocks.codexPrompt)}>
                          Copiar prompt
                        </button>
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => handleDeleteHistoryItem(item.id)}>
                          Excluir
                        </button>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="text-sm text-muted">Nenhuma interação registrada ainda.</div>
                )}
              </div>
            </section>

            <section className="panel p-4">
              <h3 className={styles.sectionTitle}>Exemplos de payload</h3>
              <p className={styles.sectionHint}>Use esses exemplos como ponto de partida para testes do MVP.</p>

              <div className={`mt-4 ${styles.payloadList}`}>
                {examples.map((example) => (
                  <article key={example.label} className={styles.payloadCard}>
                    <strong className="text-sm">{example.label}</strong>
                    <div className={styles.monoBox}>{JSON.stringify(example.payload, null, 2)}</div>
                    <button type="button" className="btn btn-secondary btn-sm mt-3" onClick={() => applyExample(example)}>
                      Carregar exemplo
                    </button>
                  </article>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </DashboardScaffold>
  );
}