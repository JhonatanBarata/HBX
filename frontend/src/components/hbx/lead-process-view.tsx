"use client";

import { useEffect, useMemo, useRef } from "react";

import { RadarDisc } from "@/components/hbx/radar-disc";
import {
  canRevealLeadContacts,
  leadContactAccessIsRevoked,
  leadCreditWasDebited,
  sanitizeLeadProcessSnapshot,
  type LeadProcessContact,
  type LeadProcessEvent,
  type LeadProcessLead,
  type LeadProcessMode,
  type LeadProcessSnapshot,
  type LeadProcessSourceState,
  type LeadProcessStage,
  type LeadProcessStatus,
} from "@/components/hbx/lead-process-contract";

import styles from "./lead-process-view.module.css";

export type {
  LeadProcessContact,
  LeadProcessCounters,
  LeadProcessDiscardReason,
  LeadProcessEvent,
  LeadProcessLead,
  LeadProcessMode,
  LeadProcessSnapshot,
  LeadProcessSourceState,
  LeadProcessStage,
  LeadProcessStatus,
} from "@/components/hbx/lead-process-contract";

type LeadProcessViewProps = {
  snapshot: LeadProcessSnapshot | null;
  loading?: boolean;
  error?: string | null;
  variant?: "page" | "overlay";
  onClose?: () => void;
  onCancel?: () => void;
  onPrimary?: () => void;
  primaryLabel?: string;
};

type SourceVisualState = "done" | "running" | "failed" | "pending";

const TERMINAL = new Set<LeadProcessStatus>(["completed", "partial", "failed"]);

const NUMBER_FORMATTER = new Intl.NumberFormat("pt-BR");
const TIME_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

function clampProgress(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatInt(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? NUMBER_FORMATTER.format(Math.max(0, Math.trunc(value)))
    : "—";
}

function humanize(value: string) {
  return value
    .replace(/^claim\./, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/^./, char => char.toUpperCase());
}

function normalizedState(value: string | null | undefined): SourceVisualState {
  const state = String(value || "pending").trim().toLowerCase();
  if (["done", "completed", "success", "approved", "published", "skipped"].includes(state)) return "done";
  if (["failed", "error", "rejected", "discarded", "refunded"].includes(state)) return "failed";
  if (["active", "running", "processing", "enriching", "syncing"].includes(state)) return "running";
  return "pending";
}

function detailText(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  for (const key of ["detail", "message", "error", "reason"]) {
    const nested = record[key];
    if (typeof nested === "string" && nested.trim()) return nested.trim();
  }
  return null;
}

function statusCopy(snapshot: LeadProcessSnapshot | null, loading: boolean, error: string | null | undefined) {
  if (snapshot?.creditRefundConfirmed || snapshot?.contactAccessRevoked || ["refunded", "refund_confirmed"].includes(String(snapshot?.internalStatus || "").toLowerCase())) {
    return "Crédito estornado. A liberação foi revogada e os dados voltaram a ficar protegidos.";
  }
  if (String(snapshot?.internalStatus || "").toLowerCase() === "refund_pending") {
    return "Liberação suspensa enquanto o estorno é reconciliado. Nenhum contato é exibido.";
  }
  if (error || snapshot?.status === "failed") return "O processamento foi interrompido. Nada é revelado sem uma liberação válida.";
  if (snapshot?.status === "partial") return "A operação terminou parcialmente; o que foi confirmado permanece preservado.";
  if (snapshot?.status === "completed") return snapshot.mode === "claim"
    ? canRevealContacts(snapshot)
      ? "Crédito debitado, dados liberados e lead transferido para Vendas."
      : "A operação terminou, mas os dados permanecem protegidos sem autorização explícita de acesso."
    : "Pesquisa concluída. Os contatos continuam protegidos até o lead ser puxado.";
  if (loading || snapshot?.status === "starting") return "Preparando a operação e conectando às fontes.";
  return snapshot?.mode === "claim"
    ? "Validando o crédito, conferindo a RFB e completando o lead no motor."
    : "Localizando empresas na Receita e no motor HBX. Os contatos permanecem protegidos até o lead ser puxado.";
}

function operationStatusLabel(status: LeadProcessStatus | null | undefined) {
  if (status === "completed") return "Concluída";
  if (status === "partial") return "Concluída";
  if (status === "failed") return "Encerrada";
  return "Ao vivo";
}

function pageTitle(snapshot: LeadProcessSnapshot | null) {
  if (snapshot?.mode !== "claim") return "Empresas chegando ao vivo";
  if (leadContactAccessIsRevoked(snapshot)) return "Dados protegidos";
  if (snapshot.status === "completed") return canRevealContacts(snapshot) ? "Lead pronto para Vendas" : "Dados protegidos";
  if (canRevealContacts(snapshot)) return "Lead sendo liberado ao vivo";
  return "Liberando lead com segurança";
}

function leadLocation(lead: LeadProcessLead) {
  return [lead.city, lead.state].filter(Boolean).join("/");
}

function eventDate(event: LeadProcessEvent) {
  const value = event.at || event.createdAt;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function eventTime(event: LeadProcessEvent) {
  const date = eventDate(event);
  return date ? TIME_FORMATTER.format(date) : null;
}

function latestUpdate(snapshot: LeadProcessSnapshot | null) {
  if (!snapshot) return "Conectando";
  const candidate = snapshot.updatedAt
    ? new Date(snapshot.updatedAt)
    : snapshot.events.map(eventDate).filter((value): value is Date => Boolean(value)).at(-1);
  if (!candidate || Number.isNaN(candidate.getTime())) return "Atualização ao vivo";
  return `Atualizado às ${TIME_FORMATTER.format(candidate)}`;
}

function creditWasDebited(snapshot: LeadProcessSnapshot | null) {
  return leadCreditWasDebited(snapshot);
}

function canRevealContacts(snapshot: LeadProcessSnapshot | null) {
  return canRevealLeadContacts(snapshot);
}

function sourceVisualState(snapshot: LeadProcessSnapshot | null, source: "rfb" | "motor"): SourceVisualState {
  if (!snapshot) return "pending";
  const coverage = snapshot.sourceCoverage?.[source];
  if (coverage && typeof coverage === "object" && !Array.isArray(coverage)) {
    const state = normalizedState((coverage as LeadProcessSourceState).status);
    if (state !== "pending" || (coverage as LeadProcessSourceState).attempted) return state === "pending" ? "running" : state;
  }
  const keys = source === "rfb" ? ["rfb", "rfb_hydrating", "base_revealed"] : ["motor", "motor_enriching"];
  const relevant = snapshot.stages.filter(stage => keys.includes(stage.key));
  if (relevant.some(stage => normalizedState(stage.status) === "failed")) return "failed";
  if (relevant.some(stage => normalizedState(stage.status) === "running")) return "running";
  if (relevant.some(stage => normalizedState(stage.status) === "done")) return "done";
  return "pending";
}

function sourceStateLabel(state: SourceVisualState, source: "rfb" | "motor" = "rfb") {
  if (state === "done") return source === "motor" ? "Conferido" : "Conferida";
  if (state === "running") return "Consultando";
  if (state === "failed") return "Consulta encerrada";
  return "Disponível";
}

function sourceTone(state: SourceVisualState) {
  return state === "failed" ? "pending" : state;
}

function sourceCount(snapshot: LeadProcessSnapshot | null, source: "rfb" | "motor") {
  const coverage = snapshot?.sourceCoverage?.[source];
  if (!coverage || typeof coverage !== "object" || Array.isArray(coverage)) return null;
  const found = Number((coverage as LeadProcessSourceState).found);
  return Number.isFinite(found) ? found : null;
}

function contextFilters(snapshot: LeadProcessSnapshot | null) {
  if (snapshot?.filters?.length) return snapshot.filters.filter(Boolean).slice(0, 6);
  const lead = snapshot?.currentLead || snapshot?.recentLeads?.[0];
  if (!lead) return [];
  return [leadLocation(lead), lead.segment].filter((value): value is string => Boolean(value));
}

function feedLeads(snapshot: LeadProcessSnapshot | null) {
  if (!snapshot) return [];
  const values = [snapshot.currentLead, ...snapshot.recentLeads.slice().reverse()].filter((lead): lead is LeadProcessLead => Boolean(lead));
  const seen = new Set<string>();
  return values.filter((lead, index) => {
    const key = String(lead.id || `${lead.name || "lead"}:${lead.city || ""}:${index}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5);
}

function sourceLabel(source: string | null | undefined) {
  const value = String(source || "").toLowerCase();
  if (value.includes("rfb") || value.includes("receita")) return "Receita Federal";
  if (value.includes("google")) return "Google";
  if (value.includes("brave")) return "Brave";
  if (value.includes("web") || value.includes("site") || value.includes("motor")) return "Motor HBX";
  return source ? humanize(source) : "Origem confirmada";
}

function collectContacts(lead: LeadProcessLead, type: "phone" | "email") {
  const structured = type === "phone" ? lead.phoneContacts : lead.emailContacts;
  const legacy = type === "phone" ? lead.phones : lead.emails;
  const primary = type === "phone" ? lead.phone : lead.email;
  const entries: LeadProcessContact[] = [];
  for (const value of structured || []) entries.push(value);
  for (const value of legacy || []) entries.push(typeof value === "string" ? { value } : value);
  if (primary) entries.push({ value: primary });
  const seen = new Set<string>();
  return entries.filter(entry => {
    const value = String(entry.value || "").trim();
    if (!value) return false;
    const key = type === "phone" ? value.replace(/\D/g, "") : value.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 3);
}

function contactChannel(contact: LeadProcessContact, type: "phone" | "email") {
  if (type === "email") return null;
  const status = String(contact.whatsappStatus || "").toLowerCase();
  if (["confirmed", "verified", "valid"].includes(status)) return "WhatsApp confirmado";
  if (["not_confirmed", "invalid", "no"].includes(status)) return "Sem WhatsApp confirmado";
  return "WhatsApp não verificado";
}

function leadTone(snapshot: LeadProcessSnapshot, lead: LeadProcessLead) {
  const value = String(lead.status || "").toLowerCase();
  if (["failed", "error", "rejected", "discarded", "negative"].some(item => value.includes(item))) return "danger";
  if (snapshot.status === "completed" || ["approved", "published"].some(item => value.includes(item))) return "success";
  return "working";
}

function leadStatusLabel(snapshot: LeadProcessSnapshot, lead: LeadProcessLead, index: number) {
  if (snapshot.mode === "search") {
    const value = String(lead.status || "").toLowerCase();
    if (value.includes("discard") || value.includes("reject")) return "Descartada";
    if (value.includes("approved") || value.includes("published") || snapshot.status === "completed") return "Pronta";
    return ["Validando", "Cruzando fontes", "Localizada"][index % 3];
  }
  const internal = String(snapshot.internalStatus || "").toLowerCase();
  if (!creditWasDebited(snapshot)) return "Protegido";
  if (!canRevealContacts(snapshot)) return "Crédito debitado";
  if (internal === "motor_enriching") return "Completando";
  if (internal === "vendas_creating") return "Transferindo";
  if (snapshot.status === "completed") return "Em Vendas";
  return "Dados liberados";
}

function journey(snapshot: LeadProcessSnapshot, lead: LeadProcessLead) {
  const result: Array<{ label: string; tone: "source" | "success" | "working" }> = [];
  const chain = `${lead.sourceChain || ""} ${lead.source || ""}`.toLowerCase();
  if (chain.includes("rfb") || chain.includes("receita")) result.push({ label: "Receita Federal", tone: "source" });
  if (chain.includes("web") || chain.includes("motor") || chain.includes("google") || chain.includes("brave")) result.push({ label: "Motor HBX", tone: "source" });
  if (snapshot.mode === "search" && result.length === 0) {
    result.push({ label: "Receita Federal", tone: "source" }, { label: "Motor HBX", tone: "source" });
  }
  if (snapshot.mode === "claim" && creditWasDebited(snapshot)) result.push({ label: "Crédito debitado", tone: "success" });
  if (snapshot.mode === "search") result.push({ label: "Contato protegido", tone: "working" });
  if (snapshot.mode === "claim" && canRevealContacts(snapshot)) result.push({ label: "Dados liberados", tone: "success" });
  return result;
}

const SEARCH_STAGE_COPY: Array<Pick<LeadProcessStage, "key" | "label" | "detail">> = [
  { key: "rfb", label: "Lendo a base nacional", detail: "empresa, cidade e situação cadastral" },
  { key: "cross_deduplicate", label: "Cruzando com o motor HBX", detail: "fontes reunidas sem duplicar empresas" },
  { key: "validate_eligibility", label: "Validando o recorte", detail: "cidade, segmento e critérios da pesquisa" },
  { key: "motor", label: "Conferindo empresas", detail: "presença digital e qualidade do cadastro" },
  { key: "publishing", label: "Montando os resultados", detail: "contatos seguem protegidos até a puxada" },
];

function visualStages(snapshot: LeadProcessSnapshot | null, progress: number, terminal: boolean): LeadProcessStage[] {
  if (snapshot?.stages.length) {
    return snapshot.stages.map(stage => ({
      ...stage,
      status: normalizedState(stage.status) === "failed" ? "pending" : stage.status,
    }));
  }
  const activeIndex = terminal ? SEARCH_STAGE_COPY.length : Math.min(SEARCH_STAGE_COPY.length - 1, Math.floor(progress / 20));
  return SEARCH_STAGE_COPY.map((stage, index) => ({
    ...stage,
    status: index < activeIndex ? "done" : index === activeIndex ? "running" : "pending",
    current: null,
    total: null,
  } satisfies LeadProcessStage));
}

function metricValue(snapshot: LeadProcessSnapshot | null, key: string) {
  return snapshot?.counters?.[key];
}

function telemetry(snapshot: LeadProcessSnapshot | null) {
  if (snapshot?.mode !== "claim") {
    return [
      { label: "Lidos", value: formatInt(metricValue(snapshot, "scanned")), detail: "nas fontes" },
      { label: "Compatíveis", value: formatInt(metricValue(snapshot, "matched")), detail: "batem com o filtro" },
      { label: "Descartados", value: formatInt(metricValue(snapshot, "discarded")), detail: "rejeitados pelo motor" },
      { label: "Publicados", value: formatInt(metricValue(snapshot, "approved")), detail: "contatos ainda protegidos", accent: true },
    ];
  }
  const debited = creditWasDebited(snapshot);
  const revealed = canRevealContacts(snapshot);
  const lead = snapshot.currentLead || snapshot.recentLeads[0];
  return [
    { label: "Crédito", value: debited ? "Debitado" : "Protegido", detail: debited ? "liberação autorizada" : "nenhum dado exposto" },
    { label: "Receita", value: sourceStateLabel(sourceVisualState(snapshot, "rfb"), "rfb"), detail: "fonte obrigatória" },
    { label: "Motor HBX", value: sourceStateLabel(sourceVisualState(snapshot, "motor"), "motor"), detail: "fonte obrigatória" },
    { label: "Contatos", value: revealed && lead ? formatInt(collectContacts(lead, "phone").length + collectContacts(lead, "email").length) : "—", detail: revealed ? "até 3 telefones + 3 e-mails" : "liberados após o débito", accent: true },
  ];
}

function failureReason(lead: LeadProcessLead) {
  const status = String(lead.status || "").toLowerCase();
  return ["failed", "error", "rejected", "discarded", "negative"].some(value => status.includes(value))
    ? lead.detail || "Rejeitado pelo processamento"
    : null;
}

export function LeadProcessView({
  snapshot: unsafeSnapshot,
  loading = false,
  error = null,
  variant = "page",
  onClose,
  onCancel,
  onPrimary,
  primaryLabel,
}: LeadProcessViewProps) {
  const snapshot = useMemo(() => sanitizeLeadProcessSnapshot(unsafeSnapshot), [unsafeSnapshot]);
  const rootRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const modal = variant === "overlay";
  const progress = clampProgress(snapshot?.progress ?? 0);
  const terminal = snapshot ? TERMINAL.has(snapshot.status) : Boolean(error);
  const filters = useMemo(() => contextFilters(snapshot), [snapshot]);
  const leads = useMemo(() => feedLeads(snapshot), [snapshot]);
  const metrics = useMemo(() => telemetry(snapshot), [snapshot]);
  const revealContacts = canRevealContacts(snapshot);
  const rfbState = sourceVisualState(snapshot, "rfb");
  const motorState = sourceVisualState(snapshot, "motor");
  const universeTotal = metricValue(snapshot, "universeTotal");
  const nationalTotal = metricValue(snapshot, "nationalActiveTotal");
  const poolTotal = metricValue(snapshot, "operationalPoolTotal");
  const poolExclusive = metricValue(snapshot, "poolExclusiveTotal");
  const approved = metricValue(snapshot, snapshot?.mode === "claim" ? "completed" : "approved");
  const stages = useMemo(() => visualStages(snapshot, progress, terminal), [progress, snapshot, terminal]);
  const leadForContacts = snapshot?.currentLead || snapshot?.recentLeads?.[0];
  const phones = revealContacts && leadForContacts ? collectContacts(leadForContacts, "phone") : [];
  const emails = revealContacts && leadForContacts ? collectContacts(leadForContacts, "email") : [];

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    queueMicrotask(() => rootRef.current?.focus());
    return () => previousFocusRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!modal) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [modal]);

  useEffect(() => {
    if (!modal) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && onClose && terminal) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !rootRef.current) return;
      const focusable = Array.from(rootRef.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])",
      ));
      if (focusable.length === 0) {
        event.preventDefault();
        rootRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [modal, onClose, terminal]);

  return (
    <div className={`${styles.frame} ${modal ? styles.overlay : styles.page}`}>
      <main
        ref={rootRef}
        tabIndex={-1}
        className={`${styles.panel} ${styles[`status_${snapshot?.status || (error ? "failed" : "starting")}`]}`}
        role={modal ? "dialog" : "region"}
        aria-modal={modal || undefined}
        aria-labelledby="lead-process-title"
        aria-describedby="lead-process-status"
        aria-busy={!terminal}
      >
        <header className={styles.header}>
          <div className={styles.heading}>
            <span className={styles.overline}>{snapshot?.mode === "claim" ? "Radar HBX · liberação para Vendas" : "Radar HBX · busca em andamento"}</span>
            <div className={styles.titleRow}>
              <h1 id="lead-process-title">{pageTitle(snapshot)}</h1>
              <span className={`${styles.liveBadge} ${terminal ? styles.liveBadgeTerminal : ""}`}>
                <i aria-hidden="true" /> {terminal ? operationStatusLabel(snapshot?.status) : "Ao vivo"}
              </span>
            </div>
            <p id="lead-process-status" aria-live="polite">{error || statusCopy(snapshot, loading, error)}</p>
          </div>
          <div className={styles.actions}>
            {!terminal && onCancel ? <button type="button" className={styles.secondaryButton} onClick={onCancel}>Parar busca</button> : null}
            {onPrimary ? <button type="button" className={styles.primaryButton} onClick={onPrimary}>{primaryLabel || "Continuar"}</button> : null}
            {terminal && onClose ? <button type="button" className={styles.secondaryButton} onClick={onClose}>Fechar</button> : null}
          </div>
        </header>

        <section className={styles.sourceBridge} aria-label="Fontes obrigatórias e universo unificado">
          <article className={styles.sourceCard}>
            <span className={`${styles.sourceIcon} ${styles.sourceIconRfb}`}>RFB</span>
            <div className={styles.sourceCopy}>
              <span>Base nacional · Receita Federal</span>
              <strong>{formatInt(nationalTotal)}</strong>
              <small>Empresas ativas na fonte nacional</small>
            </div>
            <span className={`${styles.sourceState} ${styles[`source_${sourceTone(rfbState)}`]}`}>{sourceStateLabel(rfbState, "rfb")}</span>
          </article>

          <div className={styles.bridgeLine} aria-label={`Universo unificado: ${formatInt(universeTotal)}`}>
            <span aria-hidden="true" />
            <div>
              <b>Disponíveis = Total Brasil</b>
              <strong>{formatInt(universeTotal)}</strong>
            </div>
            <span aria-hidden="true" />
          </div>

          <article className={styles.sourceCard}>
            <span className={`${styles.sourceIcon} ${styles.sourceIconMotor}`}>HBX</span>
            <div className={styles.sourceCopy}>
              <span>Motor e pool operacional HBX</span>
              <strong>{formatInt(poolTotal)}</strong>
              <small>{poolExclusive == null ? "Deduplicado contra a Receita" : `${formatInt(poolExclusive)} exclusivo(s) somados sem duplicar`}</small>
            </div>
            <span className={`${styles.sourceState} ${styles[`source_${sourceTone(motorState)}`]}`}>{sourceStateLabel(motorState, "motor")}</span>
          </article>
        </section>

        <section className={styles.context} aria-label="Recorte e progresso da operação">
          <div className={styles.filterRow}>
            <span className={styles.contextLabel}>{snapshot?.mode === "claim" ? "Lead atual" : "Recorte atual"}</span>
            {filters.length ? filters.map((filter, index) => (
              <span className={`${styles.chip} ${index > 2 ? styles.chipSubtle : ""}`} key={`${filter}-${index}`}>{filter}</span>
            )) : <span className={`${styles.chip} ${styles.chipSubtle}`}>Aguardando contexto do servidor</span>}
          </div>
          <div className={styles.progressWrap}>
            <span>{latestUpdate(snapshot)}</span>
            <progress max={100} value={progress} aria-label={`Operação ${progress}% concluída`} />
            <strong>{progress}%</strong>
          </div>
        </section>

        <section className={styles.grid}>
          <aside className={`${styles.processPanel} ${styles.scanPanel}`} aria-label="Motor trabalhando">
            <div className={styles.panelHead}>
              <div><span className={styles.overline}>Varredura</span><h2>Motor trabalhando</h2></div>
              {!terminal ? <span className={styles.statusDot} aria-hidden="true" /> : null}
            </div>
            <div className={styles.radarStage} aria-hidden="true"><RadarDisc hideLabels={snapshot?.mode === "search"} /></div>
            <div className={styles.pipeline}>
              {loading && !snapshot ? <div className={styles.loadingLine}><span /> Aguardando o servidor</div> : null}
              {stages.map((stage, index) => {
                const state = normalizedState(stage.status);
                const count = typeof stage.current === "number" && typeof stage.total === "number"
                  ? `${formatInt(stage.current)}/${formatInt(stage.total)}`
                  : stage.key.includes("rfb") ? formatInt(sourceCount(snapshot, "rfb"))
                    : stage.key.includes("motor") ? formatInt(sourceCount(snapshot, "motor")) : null;
                return (
                  <div className={`${styles.stage} ${styles[`stage_${state}`]}`} key={stage.key}>
                    <span className={styles.stageIndex}>{state === "done" ? "✓" : String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <strong>{stage.label}</strong>
                      <small>{stage.detail || (state === "running" ? "Em andamento" : state === "done" ? "Concluído" : state === "failed" ? "Interrompido" : "Aguardando")}</small>
                    </div>
                    {count && count !== "—" ? <b>{count}</b> : null}
                  </div>
                );
              })}
            </div>
          </aside>

          <section className={`${styles.processPanel} ${styles.streamPanel}`} aria-label="Fluxo de empresas">
            <div className={`${styles.panelHead} ${styles.panelHeadSticky}`}>
              <div><span className={styles.overline}>Fluxo de empresas</span><h2>{snapshot?.mode === "claim" ? "Lead sendo puxado" : "Leads chegando"}</h2></div>
              <div className={styles.streamSummary}>
                <strong>{formatInt(approved)}</strong>
                <span>{snapshot?.mode === "claim" ? "transferidos" : "aprovados até agora"}</span>
              </div>
            </div>
            <div className={styles.feed} aria-live="polite">
              {leads.map((lead, index) => {
                const tone = snapshot ? leadTone(snapshot, lead) : "working";
                const phoneContacts = revealContacts ? collectContacts(lead, "phone") : [];
                const emailContacts = revealContacts ? collectContacts(lead, "email") : [];
                const journeyItems = snapshot ? journey(snapshot, lead) : [];
                const reason = failureReason(lead);
                return (
                  <article className={`${styles.leadEvent} ${styles[`lead_${tone}`]}`} style={{ animationDelay: `${Math.min(index * 55, 220)}ms` }} key={lead.id || `${lead.name || "lead"}-${index}`}>
                    <div className={styles.eventRail}><span /></div>
                    <div className={styles.eventBody}>
                      <div className={styles.eventTop}>
                        <span className={styles.companyAvatar} aria-hidden="true">{String(lead.name || "HB").trim().split(/\s+/).slice(0, 2).map(part => part.charAt(0)).join("").toUpperCase()}</span>
                        <div className={styles.companyCopy}>
                          <strong>{lead.name || "Empresa localizada"}</strong>
                          <span>{[leadLocation(lead), lead.segment].filter(Boolean).join(" · ") || "Contexto sendo confirmado"}</span>
                        </div>
                        <span className={`${styles.eventStatus} ${styles[`event_${tone}`]}`}>{snapshot ? leadStatusLabel(snapshot, lead, index) : "Processando"}</span>
                      </div>

                      {journeyItems.length ? <div className={styles.journey}>{journeyItems.map((item, itemIndex) => (
                        <span className={styles.journeyFragment} key={`${item.label}-${itemIndex}`}>
                          {itemIndex > 0 ? <i aria-hidden="true">→</i> : null}
                          <span className={`${styles.journeyTag} ${styles[`journey_${item.tone}`]}`}>{item.label}</span>
                        </span>
                      ))}</div> : null}

                      {revealContacts ? (
                        phoneContacts.length || emailContacts.length ? (
                          <div className={styles.contactGrid}>
                            {phoneContacts.map((contact, contactIndex) => (
                              <div key={`phone-${contact.value}-${contactIndex}`}>
                                <span>Telefone {contactIndex + 1}</span>
                                <strong>{contact.value}</strong>
                                <small>{contact.sourceLabel || sourceLabel(contact.source)} · {contactChannel(contact, "phone")}</small>
                              </div>
                            ))}
                            {emailContacts.map((contact, contactIndex) => (
                              <div key={`email-${contact.value}-${contactIndex}`}>
                                <span>E-mail {contactIndex + 1}</span>
                                <strong>{contact.value}</strong>
                                <small>{contact.sourceLabel || sourceLabel(contact.source)}</small>
                              </div>
                            ))}
                          </div>
                        ) : <p className={styles.inlineEmpty}>Dados liberados; nenhum contato utilizável foi confirmado até agora.</p>
                      ) : <ProtectedContacts mode={snapshot?.mode || "search"} compact={snapshot?.mode === "search"} />}

                      {snapshot?.mode === "claim" && revealContacts && !terminal ? (
                        <div className={styles.fieldScan} aria-label="Motor completando o lead" role="status"><span /><span /><span /></div>
                      ) : null}
                      {reason ? <div className={styles.reason}><b>Motivo:</b> {reason}</div> : null}
                    </div>
                  </article>
                );
              })}
              {!loading && snapshot && leads.length === 0 ? (
                <div className={styles.emptyState}><strong>Aguardando empresas</strong><span>Os itens só aparecem quando o servidor confirma cada resultado.</span></div>
              ) : null}
              {loading && !snapshot ? <div className={styles.feedSkeleton} aria-label="Conectando ao fluxo"><span /><span /><span /></div> : null}
            </div>
          </section>

          <aside className={`${styles.processPanel} ${styles.telemetryPanel}`} aria-label="Telemetria da operação">
            <div className={styles.panelHead}><div><span className={styles.overline}>Telemetria</span><h2>O que está acontecendo</h2></div></div>
            <div className={styles.metricGrid}>
              {metrics.map(metric => (
                <div className={`${styles.metric} ${metric.accent ? styles.metricAccent : ""}`} key={metric.label}>
                  <span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.detail}</small>
                </div>
              ))}
            </div>

            {snapshot?.mode === "claim" ? (
              <section className={styles.telemetrySection}>
                <div className={styles.sectionTitle}><strong>Proteção da liberação</strong><span>{leadContactAccessIsRevoked(snapshot) ? "revogada" : creditWasDebited(snapshot) ? "autorizada" : "ativa"}</span></div>
                <p className={styles.telemetryCopy}>{leadContactAccessIsRevoked(snapshot)
                  ? "A liberação foi suspensa. Nenhuma identidade, telefone ou e-mail real permanece na tela."
                  : creditWasDebited(snapshot)
                    ? "O débito foi confirmado. Os dados só aparecem após a etapa de liberação da base."
                    : "Nenhuma identidade, telefone ou e-mail real é inserido na tela antes da confirmação do débito."}</p>
              </section>
            ) : (
              <section className={styles.telemetrySection}>
                <div className={styles.sectionTitle}><strong>Descartes confirmados</strong><span>{formatInt(metricValue(snapshot, "discarded"))}</span></div>
                {snapshot?.discardReasons?.length ? snapshot.discardReasons.map(reason => {
                  const total = Math.max(1, Number(metricValue(snapshot, "discarded") || 0));
                  return (
                    <div className={styles.reasonRow} key={reason.label}>
                      <div><span>{reason.label}</span><b>{formatInt(reason.count)}</b></div>
                      <progress max={100} value={Math.min(100, Math.round((reason.count / total) * 100))} aria-label={`${reason.label}: ${formatInt(reason.count)}`} />
                    </div>
                  );
                }) : <p className={styles.telemetryCopy}>A contagem é real. A divisão por motivo só será exibida quando o backend enviar esse detalhamento.</p>}
              </section>
            )}

            <section className={styles.telemetrySection}>
              <div className={styles.sectionTitle}><strong>{snapshot?.mode === "claim" ? "Dados disponíveis agora" : "Enriquecimento após puxar"}</strong><span>{snapshot?.mode === "claim" && revealContacts ? "liberado" : "protegido"}</span></div>
              {snapshot?.mode === "claim" && revealContacts ? (
                <>
                  <div className={styles.gainRow}><span>Telefones disponíveis</span><strong>{formatInt(phones.length)}</strong></div>
                  <div className={styles.gainRow}><span>E-mails disponíveis</span><strong>{formatInt(emails.length)}</strong></div>
                </>
              ) : <p className={styles.telemetryCopy}>A busca apenas cruza RFB e motor. O enriquecimento acontece ao puxar o lead.</p>}
            </section>

            <div className={styles.activityLog} aria-label="Atividade recente">
              {snapshot?.events.length ? snapshot.events.slice(-8).reverse().map((event, index) => (
                <div key={event.id || `${event.key || event.type || "event"}-${index}`}>
                  <time>{eventTime(event) || "agora"}</time>
                  <span><strong>{event.label || humanize(event.key || event.type || "Atualização")}</strong>{detailText(event.detail) ? <small>{detailText(event.detail)}</small> : null}</span>
                </div>
              )) : <p className={styles.telemetryCopy}>A atividade aparecerá após a primeira confirmação do servidor.</p>}
            </div>
          </aside>
        </section>

        <footer className={styles.footer}>
          <div><span className={styles.footerPulse} aria-hidden="true" /><strong>{terminal ? statusCopy(snapshot, loading, error) : "Operação confirmada pelo backend em andamento"}</strong><small>{snapshot?.operationId ? `Execução ${snapshot.operationId}` : "Aguardando o identificador da execução"}</small></div>
          <div className={styles.footerProgress}><span>Progresso confirmado</span><strong>{progress}%</strong></div>
        </footer>
      </main>
    </div>
  );
}

function ProtectedContacts({ mode, compact = false }: { mode: LeadProcessMode; compact?: boolean }) {
  return (
    <div className={`${styles.protectedContacts} ${compact ? styles.protectedContactsCompact : ""}`} aria-label={mode === "claim" ? "Contatos protegidos até a confirmação do débito" : "Contatos protegidos até o lead ser puxado"}>
      <div className={styles.blurGrid} aria-hidden="true">
        <span /><span /><span /><span /><span /><span />
      </div>
      <p><span aria-hidden="true">◉</span> {mode === "claim" ? "Contatos protegidos · aguardando débito e liberação" : "Até 3 telefones e 3 e-mails protegidos · puxe o lead para liberar"}</p>
    </div>
  );
}
