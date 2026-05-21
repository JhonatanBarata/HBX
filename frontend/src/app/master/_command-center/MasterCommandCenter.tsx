"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { apiFetch } from "@/app/_lib/api";
import type {
  CompanyDetailPayload,
  CompanyIntegrationConnection,
  CompanySummary,
  IntegrationProviderId,
} from "../master.types";
import { MasterEmailWorkspace } from "../email/page.client";
import { useMasterCommandCenterActions } from "./MasterCommandCenter.hooks";
import type {
  MasterCommandCenterProps,
  MasterCommandFilterId,
  MasterPlanKey,
  MasterRealityTone,
} from "./MasterCommandCenter.types";
import {
  MASTER_COMMAND_FILTERS,
  MASTER_PLAN_CATALOG,
  activeModuleCount,
  auditTitle,
  billingCycleLabel,
  buildCommandKpis,
  buildHardDeleteConfirmation,
  buildPlanChangePreview,
  commercialPlanLabel,
  compactAuditMetadata,
  companyHasOperationalAccess,
  companyManualPremium,
  companyNoAccess,
  filterCompanies,
  formatCurrency,
  formatDate,
  formatDateTime,
  ledgerPaymentLabel,
  paymentMethodLabel,
  paymentStatusLabel,
  recommendedBoardAction,
  resolveReality,
  riskTone,
  subscriptionLabel,
} from "./MasterCommandCenter.utils";
import styles from "./MasterCommandCenter.module.css";

type CommandActions = ReturnType<typeof useMasterCommandCenterActions>["actions"];
type CommandState = ReturnType<typeof useMasterCommandCenterActions>["state"];

type VendasComplaintStatus = "new" | "reviewing" | "refunded" | "denied" | "resolved";

type VendasComplaint = {
  id: string;
  companyId: number;
  companyName: string;
  userName?: string | null;
  userEmail?: string | null;
  vendasLeadId?: string | null;
  radarLeadId?: string | null;
  leadName?: string | null;
  leadPhone?: string | null;
  leadCity?: string | null;
  leadState?: string | null;
  leadSegment?: string | null;
  reason: string;
  status: VendasComplaintStatus;
  refundedCards: number;
  internalNote?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
  contactPhone?: string | null;
  contactWhatsappUrl?: string | null;
};

type VendasComplaintPayload = {
  ok: boolean;
  items: VendasComplaint[];
  summary: Record<string, number>;
};

const VENDAS_COMPLAINT_STATUS_LABELS: Record<VendasComplaintStatus, string> = {
  new: "Novo",
  reviewing: "Em análise",
  refunded: "Reembolsado",
  denied: "Negado",
  resolved: "Resolvido",
};

function featureLabel(value: string) {
  const normalized = String(value || "").trim();
  const labels: Record<string, string> = {
    atendimento: "Atendimento",
    atendimento_chat: "Atendimento",
    vendas: "Vendas",
    webscraping: "Radar Digital",
    bot_ia: "Bot IA",
    radar_premium: "Radar Premium",
    recovery_intelligence: "Recovery",
    digital_audit: "Auditoria digital",
    opportunity_score: "Score",
    ai_sales_scripts: "Scripts IA",
  };
  return labels[normalized] || normalized;
}

function initialFilterFromSection(value?: string | null): MasterCommandFilterId {
  const normalized = String(value || "").trim().toLowerCase();
  const sectionFilters: Partial<Record<string, MasterCommandFilterId>> = {
    clientes: "all",
    finance: "billing_pending",
    financeiro: "billing_pending",
    billing: "billing_pending",
    whatsapp: "whatsapp_attention",
    integrations: "whatsapp_attention",
  };
  return sectionFilters[normalized] || "all";
}

export default function MasterCommandCenter(props: MasterCommandCenterProps) {
  const { workspace, currentUser, loading, refreshing, initialCompanyId, initialSection, initialPanel, onReload, setWorkspace, setCurrentUser } = props;
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<MasterCommandFilterId>(() => initialFilterFromSection(initialSection));
  const [complaintsOpen, setComplaintsOpen] = useState(false);
  const [complaintsLoading, setComplaintsLoading] = useState(false);
  const [complaintsError, setComplaintsError] = useState<string | null>(null);
  const [complaints, setComplaints] = useState<VendasComplaint[]>([]);
  const [complaintNotes, setComplaintNotes] = useState<Record<string, string>>({});
  const [complaintRefunds, setComplaintRefunds] = useState<Record<string, string>>({});
  const [complaintBusyId, setComplaintBusyId] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search);
  const deepLinkHandled = useRef<string | null>(null);
  const initialPanelHandled = useRef<string | null>(null);
  const { state, actions } = useMasterCommandCenterActions({
    workspace,
    currentUser,
    setWorkspace,
    setCurrentUser,
    onReload,
  });

  useEffect(() => {
    if (!initialCompanyId || loading) return;
    const key = `${initialCompanyId}`;
    if (deepLinkHandled.current === key) return;
    deepLinkHandled.current = key;
    void actions.loadDetail(initialCompanyId);
  }, [actions, initialCompanyId, loading]);

  useEffect(() => {
    if (!initialPanel) return;
    const normalized = initialPanel.trim().toLowerCase();
    if (!normalized || initialPanelHandled.current === normalized) return;
    initialPanelHandled.current = normalized;
    if (normalized === "email") actions.setMasterEmailOpen(true);
    if (normalized === "modules" || normalized === "planos") actions.setModuleCatalogOpen(true);
    if (normalized === "tokens") actions.setMasterIntegrationsOpen(true);
  }, [actions, initialPanel]);

  const companies = useMemo(() => workspace?.companies || [], [workspace?.companies]);
  const filteredCompanies = useMemo(
    () => filterCompanies(companies, deferredSearch, filter),
    [companies, deferredSearch, filter],
  );
  const kpis = useMemo(() => buildCommandKpis(companies), [companies]);

  async function loadComplaints() {
    setComplaintsLoading(true);
    setComplaintsError(null);
    try {
      const payload = await apiFetch<VendasComplaintPayload>("/modules/master/vendas-complaints?limit=100");
      const items = payload.items || [];
      setComplaints(items);
      setComplaintNotes(Object.fromEntries(items.map((item) => [item.id, item.internalNote || ""])));
      setComplaintRefunds(Object.fromEntries(items.map((item) => [item.id, String(item.refundedCards || 1)])));
    } catch (error) {
      setComplaintsError(error instanceof Error ? error.message : "Falha ao carregar reclamações.");
    } finally {
      setComplaintsLoading(false);
    }
  }

  async function updateComplaint(complaint: VendasComplaint, patch: { status?: VendasComplaintStatus; refundCards?: number }) {
    setComplaintBusyId(complaint.id);
    setComplaintsError(null);
    try {
      const payload = await apiFetch<VendasComplaintPayload>(`/modules/master/vendas-complaints/${encodeURIComponent(complaint.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...patch,
          internalNote: complaintNotes[complaint.id] || "",
        }),
      });
      const items = payload.items || [];
      setComplaints(items);
      setComplaintNotes(Object.fromEntries(items.map((item) => [item.id, item.internalNote || ""])));
      setComplaintRefunds(Object.fromEntries(items.map((item) => [item.id, String(item.refundedCards || 1)])));
      void onReload(true);
    } catch (error) {
      setComplaintsError(error instanceof Error ? error.message : "Falha ao atualizar reclamação.");
    } finally {
      setComplaintBusyId(null);
    }
  }

  return (
    <MasterShell>
      <MasterTopCommandBar
        search={search}
        onSearch={setSearch}
        filter={filter}
        onFilter={setFilter}
        currentUser={currentUser}
        refreshing={refreshing}
        onReload={() => void onReload(true)}
        onCreateCompany={() => actions.setCreateCompanyOpen(true)}
        onOpenEmail={() => actions.setMasterEmailOpen(true)}
        onOpenComplaints={() => {
          setComplaintsOpen(true);
          void loadComplaints();
        }}
        onOpenExclusions={() => {
          window.location.href = "/master/exclusoes";
        }}
        onOpenTokens={() => actions.setMasterIntegrationsOpen(true)}
        onOpenModules={() => actions.setModuleCatalogOpen(true)}
        onOpenDatabase={() => {
          window.location.href = "/bancodedados";
        }}
        onExitContext={actions.exitContext}
      />

      {state.error ? <div className={styles.alertDanger}>{state.error}</div> : null}
      {state.message ? <div className={styles.alertInfo}>{state.message}</div> : null}

      {loading ? (
        <MasterLoadingState />
      ) : (
        <MasterOperationsLayout
          kpis={kpis}
          activeFilter={filter}
          onFilter={setFilter}
          companies={filteredCompanies}
          activeCompanyId={state.activeCompany?.id || null}
          onOpenCompany={(company) => void actions.loadDetail(company.id)}
          onAssumeCompany={actions.assumeContext}
          companyHasContext={actions.companyHasActiveMasterContext}
          busyAction={state.busyAction}
          workspace={workspace}
          currentUser={currentUser}
          state={state}
          actions={actions}
        />
      )}

      <CreateCompanyModal state={state} actions={actions} />
      <UserEditorModal state={state} actions={actions} />
      <ManualPaymentModal state={state} actions={actions} />
      <ConfirmActionModal state={state} actions={actions} />
      <MasterIntegrationsModal state={state} actions={actions} />
      <VendasComplaintsModal
        open={complaintsOpen}
        complaints={complaints}
        loading={complaintsLoading}
        error={complaintsError}
        notes={complaintNotes}
        refunds={complaintRefunds}
        busyId={complaintBusyId}
        onClose={() => setComplaintsOpen(false)}
        onReload={() => void loadComplaints()}
        onNoteChange={(id, value) => setComplaintNotes((current) => ({ ...current, [id]: value }))}
        onRefundChange={(id, value) => setComplaintRefunds((current) => ({ ...current, [id]: value }))}
        onUpdate={updateComplaint}
      />
      <MasterEmailModal state={state} actions={actions} />
      <ModuleCatalogModal state={state} actions={actions} />
    </MasterShell>
  );
}

export function MasterShell({ children }: { children: ReactNode }) {
  return <div className={styles.masterShell}>{children}</div>;
}

function MasterOperationsLayout({
  kpis,
  activeFilter,
  onFilter,
  companies,
  activeCompanyId,
  onOpenCompany,
  onAssumeCompany,
  companyHasContext,
  busyAction,
  workspace,
  currentUser,
  state,
  actions,
}: {
  kpis: ReturnType<typeof buildCommandKpis>;
  activeFilter: MasterCommandFilterId;
  onFilter: (value: MasterCommandFilterId) => void;
  companies: CompanySummary[];
  activeCompanyId: number | null;
  onOpenCompany: (company: CompanySummary) => void;
  onAssumeCompany: (company: CompanySummary) => void;
  companyHasContext: (companyId?: number | null) => boolean;
  busyAction: string | null;
  workspace: MasterCommandCenterProps["workspace"];
  currentUser: MasterCommandCenterProps["currentUser"];
  state: CommandState;
  actions: CommandActions;
}) {
  return (
    <section className={styles.operationsSurface}>
      <MasterKpiStrip items={kpis} activeFilter={activeFilter} onFilter={onFilter} />
      <div className={styles.commandLayout}>
        <MasterCompanyBoard
          companies={companies}
          activeCompanyId={activeCompanyId}
          onOpen={onOpenCompany}
          onAssume={onAssumeCompany}
          companyHasContext={companyHasContext}
          busyAction={busyAction}
        />
        <MasterCompanyInspector
          workspace={workspace}
          currentUser={currentUser}
          state={state}
          actions={actions}
        />
      </div>
    </section>
  );
}

function MasterTopCommandBar({
  search,
  onSearch,
  filter,
  onFilter,
  currentUser,
  refreshing,
  onReload,
  onCreateCompany,
  onOpenEmail,
  onOpenComplaints,
  onOpenExclusions,
  onOpenTokens,
  onOpenModules,
  onOpenDatabase,
  onExitContext,
}: {
  search: string;
  onSearch: (value: string) => void;
  filter: MasterCommandFilterId;
  onFilter: (value: MasterCommandFilterId) => void;
  currentUser: MasterCommandCenterProps["currentUser"];
  refreshing: boolean;
  onReload: () => void;
  onCreateCompany: () => void;
  onOpenEmail: () => void;
  onOpenComplaints: () => void;
  onOpenExclusions: () => void;
  onOpenTokens: () => void;
  onOpenModules: () => void;
  onOpenDatabase: () => void;
  onExitContext: () => void;
}) {
  const contextActive = currentUser?.masterContext?.active === true;

  return (
    <section className={styles.topCommandBar}>
      <div className={styles.commandIdentity}>
        <span>MASTER</span>
        <strong>Command Center</strong>
        <small>
          {currentUser?.masterContext?.active
            ? `Operando: ${currentUser.masterContext.companyName || "empresa"}`
            : "Visão executiva da operação"}
        </small>
        <div className={styles.commandIdentityMeta}>
          <span data-active={contextActive ? "true" : "false"}>
            {contextActive ? "Contexto ativo" : "Sem contexto ativo"}
          </span>
          <span>Full desktop</span>
        </div>
      </div>

      <div className={styles.commandWorkstation}>
        <div className={styles.searchBox}>
          <label htmlFor="master-command-search">Busca operacional</label>
          <input
            id="master-command-search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Empresa, contato, plano, módulo, cobrança, WhatsApp..."
          />
        </div>
        <div className={styles.filterRail} aria-label="Filtros por problema real">
          {MASTER_COMMAND_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={styles.filterButton}
              data-active={filter === item.id ? "true" : "false"}
              aria-current={filter === item.id ? "true" : undefined}
              onClick={() => onFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.commandActionPanel}>
        <div className={styles.commandActionHeader}>
          <span>Ações rápidas</span>
          <strong>{refreshing ? "Sincronizando..." : "Pronto para operar"}</strong>
        </div>
        <div className={styles.commandActions}>
          <MasterActionButton onClick={onCreateCompany}>Nova empresa</MasterActionButton>
          <MasterActionButton variant="secondary" onClick={onOpenEmail}>Email</MasterActionButton>
          <MasterActionButton variant="secondary" onClick={onOpenComplaints}>Reclamações</MasterActionButton>
          <MasterActionButton variant="secondary" onClick={onOpenExclusions}>Exclusões</MasterActionButton>
          <MasterActionButton variant="secondary" onClick={onOpenDatabase}>Banco de Dados</MasterActionButton>
          <MasterActionButton variant="secondary" onClick={onOpenTokens}>Tokens</MasterActionButton>
          <MasterActionButton variant="secondary" onClick={onOpenModules}>Módulos</MasterActionButton>
          <MasterActionButton variant="secondary" onClick={onReload}>{refreshing ? "Atualizando..." : "Atualizar"}</MasterActionButton>
          {contextActive ? (
            <MasterActionButton variant="secondary" onClick={onExitContext}>Sair operação</MasterActionButton>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function MasterKpiStrip({
  items,
  activeFilter,
  onFilter,
}: {
  items: ReturnType<typeof buildCommandKpis>;
  activeFilter: MasterCommandFilterId;
  onFilter: (value: MasterCommandFilterId) => void;
}) {
  const mapToFilter: Record<string, MasterCommandFilterId> = {
    no_access: "no_access",
    overdue: "billing_pending",
    trial: "trial_ending",
    manual: "manual_premium",
    whatsapp: "whatsapp_attention",
  };
  return (
    <section className={styles.kpiStrip} aria-label="Indicadores rápidos">
      {items.map((item) => {
        const targetFilter = mapToFilter[item.id] || "all";
        const active = activeFilter === targetFilter;
        return (
          <button
            key={item.id}
            type="button"
            className={styles.kpiCard}
            data-tone={item.tone}
            data-active={active ? "true" : "false"}
            onClick={() => onFilter(targetFilter)}
          >
            <span>{item.label}</span>
            <strong>{item.value.toLocaleString("pt-BR")}</strong>
            <small>{active ? "Filtro ativo" : "Clique para filtrar"}</small>
            <i aria-hidden="true" />
          </button>
        );
      })}
    </section>
  );
}

function MasterCompanyBoard({
  companies,
  activeCompanyId,
  onOpen,
  onAssume,
  companyHasContext,
  busyAction,
}: {
  companies: CompanySummary[];
  activeCompanyId: number | null;
  onOpen: (company: CompanySummary) => void;
  onAssume: (company: CompanySummary) => void;
  companyHasContext: (companyId?: number | null) => boolean;
  busyAction: string | null;
}) {
  return (
    <section className={styles.companyBoard} aria-label="Empresas">
      <div className={styles.boardHeader}>
        <div>
          <span>Base operacional</span>
          <strong>{companies.length.toLocaleString("pt-BR")} empresa(s)</strong>
          <small>Selecione uma empresa para abrir o inspector completo.</small>
        </div>
        <MasterStatusBadge tone="neutral">Live</MasterStatusBadge>
      </div>
      <div className={styles.companyRows}>
        {companies.map((company) => (
          <MasterCompanyRow
            key={company.id}
            company={company}
            active={activeCompanyId === company.id}
            contextActive={companyHasContext(company.id)}
            busyAction={busyAction}
            onOpen={() => onOpen(company)}
            onAssume={() => onAssume(company)}
          />
        ))}
        {!companies.length ? <MasterEmptyState title="Nenhuma empresa encontrada" /> : null}
      </div>
    </section>
  );
}

function MasterCompanyRow({
  company,
  active,
  contextActive,
  busyAction,
  onOpen,
  onAssume,
}: {
  company: CompanySummary;
  active: boolean;
  contextActive: boolean;
  busyAction: string | null;
  onOpen: () => void;
  onAssume: () => void;
}) {
  const reality = resolveReality(company);
  return (
    <article className={styles.companyRow} data-active={active ? "true" : "false"} data-tone={riskTone(company)}>
      <div className={styles.companyMain}>
        <strong>{company.name}</strong>
        <span>{company.contactPhone || company.contactEmail || company.slug || `ID ${company.id}`}</span>
      </div>
      <div className={styles.rowStatus}>
        <MasterStatusBadge tone={reality.nextActionTone}>{reality.nextAction}</MasterStatusBadge>
        <span>{commercialPlanLabel(company.selectedPlanKey)}</span>
      </div>
      <div className={styles.rowFacts}>
        <span>Cobrança: {reality.billingLabel}</span>
        <span>Acesso: {reality.accessLabel}</span>
      </div>
      <div className={styles.rowNext}>{recommendedBoardAction(company)}</div>
      <div className={styles.rowActions}>
        <MasterActionButton variant={active ? "secondary" : "primary"} onClick={onOpen}>Abrir</MasterActionButton>
        <MasterActionButton variant="secondary" onClick={onAssume} disabled={contextActive || busyAction === `context-${company.id}`}>
          {contextActive ? "Operando" : "Operar"}
        </MasterActionButton>
      </div>
    </article>
  );
}

function MasterCompanyInspector({
  workspace,
  currentUser,
  state,
  actions,
}: {
  workspace: MasterCommandCenterProps["workspace"];
  currentUser: MasterCommandCenterProps["currentUser"];
  state: CommandState;
  actions: CommandActions;
}) {
  const company = state.activeCompany;
  if (state.detailLoading) return <MasterLoadingState label="Carregando empresa..." />;
  if (!company) return <MasterEmptyState title="Selecione uma empresa" description="O inspector abre a operação completa por empresa." />;

  return (
    <aside className={styles.inspector} aria-label={`Inspector ${company.name}`}>
      <MasterCompanyHero
        company={company}
        currentUser={currentUser}
        activeCompanyInContext={state.activeCompanyInContext}
        busyAction={state.busyAction}
        onClose={actions.closeCompany}
        onAssume={() => actions.assumeContext(company)}
        onOpenFinance={() => actions.navigateOperational(company, "finance")}
        onOpenWhatsapp={() => actions.navigateOperational(company, "whatsapp")}
      />
      <MasterRealityPanel company={company} actions={actions} state={state} />
      <MasterCompanyProfilePanel company={company} actions={actions} state={state} />
      <MasterPlanAccessPanel key={`${company.id}-${company.selectedPlanKey || "none"}`} company={company} actions={actions} state={state} />
      <MasterBillingPanel company={company} actions={actions} state={state} />
      <MasterTrialPanel company={company} actions={actions} state={state} />
      <MasterOperationPanel workspace={workspace} company={company} actions={actions} state={state} />
      <MasterRiskPanel company={company} />
      <MasterDangerZone company={company} actions={actions} state={state} />
    </aside>
  );
}

function MasterCompanyHero({
  company,
  currentUser,
  activeCompanyInContext,
  busyAction,
  onClose,
  onAssume,
  onOpenFinance,
  onOpenWhatsapp,
}: {
  company: CompanyDetailPayload["company"];
  currentUser: MasterCommandCenterProps["currentUser"];
  activeCompanyInContext: boolean;
  busyAction: string | null;
  onClose: () => void;
  onAssume: () => void;
  onOpenFinance: () => void;
  onOpenWhatsapp: () => void;
}) {
  const reality = resolveReality(company);
  return (
    <header className={styles.companyHero} data-tone={riskTone(company)}>
      <div>
        <span>Empresa ativa no detalhe</span>
        <h2>{company.name}</h2>
        <div className={styles.heroBadges}>
          <MasterStatusBadge tone={reality.accessTone}>{reality.accessLabel}</MasterStatusBadge>
          <MasterStatusBadge tone={reality.billingTone}>{reality.billingLabel}</MasterStatusBadge>
          <MasterStatusBadge tone="neutral">{reality.planLabel}</MasterStatusBadge>
          {companyManualPremium(company) ? <MasterStatusBadge tone="warn">Acesso manual ativo</MasterStatusBadge> : null}
        </div>
      </div>
      <div className={styles.heroActions}>
        <MasterActionButton onClick={onAssume} disabled={activeCompanyInContext || busyAction === `context-${company.id}`}>
          {activeCompanyInContext ? "Operando" : "Operar"}
        </MasterActionButton>
        <MasterActionButton variant="secondary" onClick={onOpenFinance}>Financeiro</MasterActionButton>
        <MasterActionButton variant="secondary" onClick={onOpenWhatsapp}>WhatsApp</MasterActionButton>
        <MasterActionButton variant="ghost" onClick={onClose}>Fechar</MasterActionButton>
      </div>
      <p className={styles.contextLine}>
        {currentUser?.masterContext?.active && currentUser.masterContext.companyId === company.id
          ? "Você está operando esta empresa."
          : "Aberturas internas assumem a operação automaticamente quando necessário."}
      </p>
    </header>
  );
}

function MasterRealityPanel({ company, actions, state }: { company: CompanyDetailPayload["company"]; actions: CommandActions; state: CommandState }) {
  const reality = resolveReality(company);
  return (
    <section className={styles.panelSection}>
      <div className={styles.sectionTitle}>
        <span>Realidade</span>
        <h3>Estado real da empresa</h3>
      </div>
      <div className={styles.realityGrid}>
        <RealityTile label="Acesso" value={reality.accessLabel} tone={reality.accessTone} />
        <RealityTile label="Cobrança" value={reality.billingLabel} tone={reality.billingTone} />
        <RealityTile label="Plano" value={reality.planLabel} tone="neutral" />
        <RealityTile label="Próxima ação" value={reality.nextAction} tone={reality.nextActionTone} />
      </div>
      <p className={styles.panelLead}>{reality.reason}</p>
      <div className={styles.actionCluster}>
        {companyNoAccess(company) ? (
          <>
            <MasterActionButton onClick={() => actions.assumeContext(company)}>Operar</MasterActionButton>
            <MasterActionButton variant="secondary" onClick={() => actions.runTrialAction(company.id, { action: "reactivate", days: 7 }, "Trial reativado por 7 dias.")}>
              Liberar trial
            </MasterActionButton>
            <MasterActionButton variant="secondary" onClick={() => actions.setPaymentStatus(company.id, "PAID", "Cliente marcado como pago operacionalmente.")}>
              Marcar como pago
            </MasterActionButton>
          </>
        ) : (
          <>
            <MasterActionButton variant="secondary" onClick={() => actions.assumeContext(company)}>Operar</MasterActionButton>
            <MasterActionButton variant="secondary" onClick={() => actions.openManualPayment(company)}>Lançar pagamento manual</MasterActionButton>
          </>
        )}
        <MasterActionButton
          variant="danger"
          onClick={() =>
            actions.setConfirmAction({
              title: "Suspender acesso",
              description: `${company.name} terá acesso bloqueado e módulos desligados.`,
              confirmLabel: "Suspender",
              tone: "danger",
              details: ["Bloqueia acesso e desativa módulos.", "Não lança caixa real."],
              run: async () => {
                actions.setConfirmAction(null);
                await actions.setPaymentStatus(company.id, "DISABLED", "Empresa suspensa no plano operacional.");
              },
            })
          }
          disabled={state.busyAction === `payment-${company.id}-DISABLED`}
        >
          Suspender
        </MasterActionButton>
      </div>
      <details className={styles.technicalDetails}>
        <summary>Detalhes técnicos</summary>
        <div className={styles.techGrid}>
          <span>paymentStatus: {paymentStatusLabel(company.paymentStatus)}</span>
          <span>subscriptionStatus: {subscriptionLabel(company.subscriptionStatus)}</span>
          <span>billingProvider: {company.billingProvider || "manual"}</span>
          <span>paymentMethod: {paymentMethodLabel(company.paymentMethod)}</span>
          <span>Valor pendente: {formatCurrency(company.currentOutstandingValue)}</span>
          <span>Valor do ciclo: {formatCurrency(company.finance.finalCycleAmount)}</span>
        </div>
      </details>
    </section>
  );
}

function RealityTile({ label, value, tone }: { label: string; value: string; tone: MasterRealityTone }) {
  return (
    <article className={styles.realityTile} data-tone={tone}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function MasterCompanyProfilePanel({ company, actions, state }: { company: CompanyDetailPayload["company"]; actions: CommandActions; state: CommandState }) {
  const draft = state.profileDraft;
  if (!draft) return null;

  return (
    <section className={styles.panelSection}>
      <div className={styles.sectionTitle}>
        <span>Perfil</span>
        <h3>Dados comerciais da empresa</h3>
      </div>
      <div className={styles.profileForm}>
        <label>
          <span>Nome</span>
          <input value={draft.name} onChange={(event) => actions.setProfileDraft((current) => current ? { ...current, name: event.target.value } : current)} />
        </label>
        <label>
          <span>Responsável</span>
          <input value={draft.primaryContactName} onChange={(event) => actions.setProfileDraft((current) => current ? { ...current, primaryContactName: event.target.value } : current)} />
        </label>
        <label>
          <span>E-mail</span>
          <input type="email" value={draft.contactEmail} onChange={(event) => actions.setProfileDraft((current) => current ? { ...current, contactEmail: event.target.value } : current)} />
        </label>
        <label>
          <span>Telefone</span>
          <input value={draft.contactPhone} onChange={(event) => actions.setProfileDraft((current) => current ? { ...current, contactPhone: event.target.value } : current)} />
        </label>
        <label>
          <span>Documento</span>
          <input value={draft.taxDocument} onChange={(event) => actions.setProfileDraft((current) => current ? { ...current, taxDocument: event.target.value } : current)} />
        </label>
        <label>
          <span>Método de pagamento</span>
          <select value={draft.paymentMethod} onChange={(event) => actions.setProfileDraft((current) => current ? { ...current, paymentMethod: event.target.value } : current)}>
            <option value="NONE">Sem método</option>
            <option value="CARD">Cartão</option>
            <option value="PIX">Pix</option>
            <option value="BOLETO">Boleto</option>
            <option value="MANUAL">Manual</option>
          </select>
        </label>
        <label>
          <span>Provider de cobrança</span>
          <select value={draft.billingProvider} onChange={(event) => actions.setProfileDraft((current) => current ? { ...current, billingProvider: event.target.value } : current)}>
            <option value="manual">Manual</option>
            <option value="mercadopago">Mercado Pago</option>
            <option value="stripe">Stripe</option>
            <option value="apple">Apple</option>
            <option value="google">Google</option>
          </select>
        </label>
        <label>
          <span>Status assinatura</span>
          <select value={draft.subscriptionStatus} onChange={(event) => actions.setProfileDraft((current) => current ? { ...current, subscriptionStatus: event.target.value } : current)}>
            <option value="trialing">Trial</option>
            <option value="active">Ativa</option>
            <option value="manual">Manual</option>
            <option value="past_due">Pendente</option>
            <option value="canceled">Cancelada</option>
            <option value="expired">Expirada</option>
          </select>
        </label>
        <label className={styles.switchField}>
          <input type="checkbox" checked={draft.premiumAccess} onChange={(event) => actions.setProfileDraft((current) => current ? { ...current, premiumAccess: event.target.checked } : current)} />
          <span>Premium manual</span>
        </label>
      </div>
      <div className={styles.actionCluster}>
        <MasterActionButton onClick={actions.saveProfile} disabled={state.busyAction === `profile-${company.id}`}>
          {state.busyAction === `profile-${company.id}` ? "Salvando..." : "Salvar perfil"}
        </MasterActionButton>
      </div>
    </section>
  );
}

function MasterPlanAccessPanel({ company, actions, state }: { company: CompanyDetailPayload["company"]; actions: CommandActions; state: CommandState }) {
  const currentPlan = (MASTER_PLAN_CATALOG.find((item) => item.key === company.selectedPlanKey) || null);
  const [targetPlan, setTargetPlan] = useState<MasterPlanKey>((currentPlan?.key || "hbx_padrao") as MasterPlanKey);
  const preview = buildPlanChangePreview(company, targetPlan);
  const changed = targetPlan !== currentPlan?.key;

  return (
    <section className={styles.panelSection}>
      <div className={styles.sectionTitle}>
        <span>Plano & Acesso</span>
        <h3>Pacote comercial sem mexer na cobrança</h3>
      </div>
      <div className={styles.currentPlanCard}>
        <span>Plano atual</span>
        <strong>{commercialPlanLabel(company.selectedPlanKey)}</strong>
        <small>{formatCurrency(company.monthlyValue)}/mês · {activeModuleCount(company)} módulo(s) ativo(s)</small>
      </div>
      <div className={styles.quotaEditor}>
        <div className={styles.sectionTitle}>
          <span>Cota de cards</span>
          <h3>Uso comercial do cliente</h3>
        </div>
        <div className={styles.billingGrid}>
          <InfoItem label="Mensal efetivo" value={`${(company.commercialCardQuota?.monthlyEffective || 0).toLocaleString("pt-BR")} cards`} />
          <InfoItem label="Trava diária efetiva" value={`${(company.commercialCardQuota?.dailyEffective || 0).toLocaleString("pt-BR")} cards`} />
          <InfoItem label="Padrão do plano" value={`${(company.commercialCardQuota?.monthlyDefault || 0).toLocaleString("pt-BR")} / ${(company.commercialCardQuota?.dailyDefault || 0).toLocaleString("pt-BR")} por dia`} />
        </div>
        {state.cardQuotaDraft ? (
          <div className={styles.inlineForm}>
            <input
              type="number"
              min={0}
              value={state.cardQuotaDraft.monthlyCardLimit}
              onChange={(event) => actions.setCardQuotaDraft((current) => current ? { ...current, monthlyCardLimit: event.target.value } : current)}
              placeholder={`Mensal padrão ${company.commercialCardQuota?.monthlyDefault || 0}`}
            />
            <input
              type="number"
              min={0}
              value={state.cardQuotaDraft.dailyCardLimit}
              onChange={(event) => actions.setCardQuotaDraft((current) => current ? { ...current, dailyCardLimit: event.target.value } : current)}
              placeholder={`Diário padrão ${company.commercialCardQuota?.dailyDefault || 0}`}
            />
            <MasterActionButton
              variant="secondary"
              onClick={actions.saveCompanyCardQuota}
              disabled={state.busyAction === `card-quota-${company.id}`}
            >
              {state.busyAction === `card-quota-${company.id}` ? "Salvando..." : "Salvar cota"}
            </MasterActionButton>
          </div>
        ) : null}
        <p className={styles.helperText}>Deixe em branco ou 0 para usar a cota do plano.</p>
      </div>
      <div className={styles.planCards}>
        {MASTER_PLAN_CATALOG.map((plan) => (
          <button
            key={plan.key}
            type="button"
            className={styles.planCard}
            data-active={targetPlan === plan.key ? "true" : "false"}
            aria-pressed={targetPlan === plan.key ? "true" : "false"}
            onClick={() => setTargetPlan(plan.key)}
          >
            <span>{plan.badge}</span>
            <strong>{plan.title}</strong>
            <small>{formatCurrency(plan.monthlyPrice)}/mês</small>
          </button>
        ))}
      </div>
      {preview ? <MasterPlanChangePreview preview={preview} /> : null}
      <div className={styles.actionCluster}>
        <MasterActionButton
          onClick={() => actions.changeCompanyPlan(company.id, targetPlan)}
          disabled={!changed || state.busyAction === `plan-${company.id}`}
        >
          {state.busyAction === `plan-${company.id}` ? "Trocando..." : "Confirmar troca de plano"}
        </MasterActionButton>
        {company.assistedSetup?.required && company.assistedSetup.status !== "completed" ? (
          <MasterActionButton variant="secondary" onClick={() => actions.completeAssistedSetup(company.id)}>
            Concluir assisted setup
          </MasterActionButton>
        ) : null}
      </div>
      <div className={styles.moduleMatrix}>
        {company.modules.map((moduleItem) => (
          <button
            key={moduleItem.key}
            type="button"
            className={styles.moduleToggle}
            data-active={moduleItem.enabled ? "true" : "false"}
            onClick={() => actions.toggleModule(company.id, moduleItem.key, moduleItem.enabled)}
            disabled={!companyHasOperationalAccess(company)}
          >
            <span>{moduleItem.name}</span>
            <strong>{moduleItem.enabled ? "Ativo" : "Inativo"}</strong>
          </button>
        ))}
      </div>
    </section>
  );
}

function MasterPlanChangePreview({ preview }: { preview: NonNullable<ReturnType<typeof buildPlanChangePreview>> }) {
  return (
    <article className={styles.planPreview}>
      <div className={styles.previewHeader}>
        <span>Preview de impacto</span>
        <strong>{preview.fromPlan?.title || "Sem plano"} → {preview.toPlan.title}</strong>
      </div>
      <div className={styles.previewGrid}>
        <div><span>Valor atual</span><strong>{formatCurrency(preview.currentValue)}</strong></div>
        <div><span>Novo valor</span><strong>{formatCurrency(preview.nextValue)}</strong></div>
        <div><span>Cobrança será mantida como</span><strong>{preview.billingPreservedAs}</strong></div>
        <div><span>Acesso será mantido como</span><strong>{preview.accessPreservedAs}</strong></div>
      </div>
      <div className={styles.diffGrid}>
        <div>
          <span>Módulos que entram</span>
          <strong>{preview.addedModules.length ? preview.addedModules.map(featureLabel).join(", ") : "Nenhum"}</strong>
        </div>
        <div>
          <span>Módulos que saem</span>
          <strong>{preview.removedModules.length ? preview.removedModules.map(featureLabel).join(", ") : "Nenhum"}</strong>
        </div>
        <div>
          <span>Entitlements que entram</span>
          <strong>{preview.addedEntitlements.length ? preview.addedEntitlements.map(featureLabel).join(", ") : "Nenhum"}</strong>
        </div>
        <div>
          <span>Entitlements que saem</span>
          <strong>{preview.removedEntitlements.length ? preview.removedEntitlements.map(featureLabel).join(", ") : "Nenhum"}</strong>
        </div>
      </div>
      {preview.manualPremiumWarning ? <div className={styles.warningLine}>Acesso manual ativo continuará ativo após a troca.</div> : null}
    </article>
  );
}

function MasterBillingPanel({ company, actions, state }: { company: CompanyDetailPayload["company"]; actions: CommandActions; state: CommandState }) {
  return (
    <section className={styles.panelSection}>
      <div className={styles.sectionTitle}>
        <span>Cobrança</span>
        <h3>Financeiro humano</h3>
      </div>
      <div className={styles.billingGrid}>
        <InfoItem label="Situação atual" value={company.billingSituation?.statusLabel || paymentStatusLabel(company.paymentStatus)} />
        <InfoItem label="Valor do ciclo" value={formatCurrency(company.finance.finalCycleAmount)} />
        <InfoItem label="Próximo vencimento" value={formatDate(company.nextDueAt || company.billingSituation?.nextDueAt)} />
        <InfoItem label="Pendência atual" value={formatCurrency(company.billingSituation?.amountDue || company.currentOutstandingValue)} />
        <InfoItem label="Último pagamento" value={ledgerPaymentLabel(company.lastPayment)} />
        <InfoItem label="Última falha" value={company.lastFailure ? ledgerPaymentLabel(company.lastFailure) : "Sem falha recente"} />
        <InfoItem label="Método" value={paymentMethodLabel(company.paymentMethod)} />
        <InfoItem label="Ciclo" value={billingCycleLabel(company.finance.billingCycle)} />
        <InfoItem label="Desconto manual" value={`${company.finance.manualDiscountPercent || 0}%`} />
        <InfoItem label="Meses grátis" value={String(company.finance.freeMonths || 0)} />
      </div>
      <div className={styles.actionCards}>
        <ActionConsequence title="Lançar pagamento manual" text="Registra caixa real no ledger." onClick={() => actions.openManualPayment(company)} />
        <ActionConsequence title="Marcar como pago" text="Libera acesso, mas não lança caixa real." onClick={() => actions.setPaymentStatus(company.id, "PAID", "Cliente marcado como pago operacionalmente.")} />
        <ActionConsequence title="Marcar pendente" text="Mantém a cobrança em aberto." onClick={() => actions.setPaymentStatus(company.id, "PENDING", "Cliente marcado como pendente.")} />
        <ActionConsequence title="Suspender acesso" text="Bloqueia acesso e desativa módulos." tone="danger" onClick={() => actions.setPaymentStatus(company.id, "DISABLED", "Empresa suspensa no plano operacional.")} />
        <ActionConsequence title="Encerrar trial" text="Bloqueia trial sem cobrança automática." tone="danger" onClick={() => actions.runTrialAction(company.id, { action: "end" }, "Trial encerrado.")} />
      </div>
      {state.financeSettingsDraft ? (
        <div className={styles.inlineForm}>
          <select value={state.financeSettingsDraft.billingCycle} onChange={(event) => actions.setFinanceSettingsDraft((current) => current ? { ...current, billingCycle: event.target.value as "MONTHLY" | "ANNUAL" } : current)}>
            <option value="MONTHLY">Mensal</option>
            <option value="ANNUAL">Anual</option>
          </select>
          <input value={state.financeSettingsDraft.manualDiscountPercent} onChange={(event) => actions.setFinanceSettingsDraft((current) => current ? { ...current, manualDiscountPercent: event.target.value } : current)} placeholder="Desconto manual %" />
          <input value={state.financeSettingsDraft.freeMonths} onChange={(event) => actions.setFinanceSettingsDraft((current) => current ? { ...current, freeMonths: event.target.value } : current)} placeholder="Meses grátis" />
          <MasterActionButton variant="secondary" onClick={actions.saveCompanyFinanceSettings}>Salvar ajustes</MasterActionButton>
          <MasterActionButton variant="secondary" onClick={actions.exportFinanceCsv}>Exportar CSV financeiro</MasterActionButton>
        </div>
      ) : null}
      <div className={styles.ledgerList}>
        {company.financeHistory.slice(0, 5).map((entry) => (
          <article key={entry.id} className={styles.ledgerItem}>
            <strong>{formatCurrency(entry.amount)}</strong>
            <span>{entry.referenceLabel || entry.entryType} · {entry.status} · {formatDate(entry.paidAt || entry.dueDate || entry.createdAt)}</span>
            {String(entry.origin || "").includes("manual") && entry.status !== "CANCELLED" ? (
              <button type="button" onClick={() => actions.cancelManualPayment(entry.id)}>Cancelar</button>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function MasterTrialPanel({ company, actions, state }: { company: CompanyDetailPayload["company"]; actions: CommandActions; state: CommandState }) {
  const trialBusy = state.busyAction === `trial-${company.id}`;
  const days = Math.max(1, Math.trunc(Number(state.trialDaysDraft || 14) || 14));
  const endsAt = state.trialDateDraft ? new Date(`${state.trialDateDraft}T12:00:00`).toISOString() : "";

  return (
    <section className={styles.panelSection}>
      <div className={styles.sectionTitle}>
        <span>Trial</span>
        <h3>Janela de avaliação</h3>
      </div>
      <div className={styles.billingGrid}>
        <InfoItem label="Início" value={formatDate(company.trialStartsAt)} />
        <InfoItem label="Fim" value={formatDate(company.trialEndsAt)} />
        <InfoItem label="Dias restantes" value={company.trialRemainingDays == null ? "-" : String(company.trialRemainingDays)} />
        <InfoItem label="Status" value={subscriptionLabel(company.subscriptionStatus)} />
      </div>
      <div className={styles.inlineForm}>
        <input
          type="number"
          min={1}
          max={365}
          value={state.trialDaysDraft}
          onChange={(event) => actions.setTrialDaysDraft(event.target.value)}
          placeholder="Dias de trial"
        />
        <input
          type="date"
          value={state.trialDateDraft}
          onChange={(event) => actions.setTrialDateDraft(event.target.value)}
          aria-label="Data final do trial"
        />
        <MasterActionButton onClick={() => actions.runTrialAction(company.id, { action: "grant", days }, `Trial concedido por ${days} dias.`)} disabled={trialBusy}>
          Conceder trial
        </MasterActionButton>
        <MasterActionButton variant="secondary" onClick={() => actions.runTrialAction(company.id, { action: "reactivate", days }, `Trial reativado por ${days} dias.`)} disabled={trialBusy}>
          Reativar trial
        </MasterActionButton>
        <MasterActionButton variant="secondary" onClick={() => actions.runTrialAction(company.id, { action: "extend", days }, `Trial estendido por ${days} dias.`)} disabled={trialBusy}>
          Estender trial
        </MasterActionButton>
        <MasterActionButton variant="secondary" onClick={() => endsAt ? actions.runTrialAction(company.id, { action: "set_date", endsAt }, "Data final do trial definida.") : actions.setError("Informe a data final do trial.")} disabled={trialBusy}>
          Definir data de fim
        </MasterActionButton>
        <MasterActionButton
          variant="danger"
          onClick={() => actions.setConfirmAction({
            title: "Encerrar trial",
            description: `${company.name} perderá o trial agora.`,
            confirmLabel: "Encerrar trial",
            tone: "danger",
            run: async () => {
              actions.setConfirmAction(null);
              await actions.runTrialAction(company.id, { action: "end" }, "Trial encerrado.");
            },
          })}
          disabled={trialBusy}
        >
          Encerrar trial
        </MasterActionButton>
      </div>
    </section>
  );
}

function MasterOperationPanel({
  workspace,
  company,
  actions,
  state,
}: {
  workspace: MasterCommandCenterProps["workspace"];
  company: CompanyDetailPayload["company"];
  actions: CommandActions;
  state: CommandState;
}) {
  return (
    <section className={styles.panelSection}>
      <div className={styles.sectionTitle}>
        <span>Operação</span>
        <h3>Controles por área</h3>
      </div>
      <div className={styles.collapseStack}>
        <details className={styles.operationCard} open>
          <summary>Usuários · {company.users.length}</summary>
          <div className={styles.operationBody}>
            <div className={styles.actionCluster}>
              <MasterActionButton onClick={() => actions.setUserModal({
                mode: "create",
                companyId: company.id,
                companyName: company.name,
                email: "",
                username: "",
                name: "",
                role: "USER",
                password: "",
              })}>
                Criar usuário
              </MasterActionButton>
            </div>
            <div className={styles.userGrid}>
              {company.users.map((user) => (
                <article key={user.id} className={styles.userCard}>
                  <div>
                    <strong>{user.name || user.username || user.email || `Usuário ${user.id}`}</strong>
                    <span>{user.email || user.username || user.role}</span>
                  </div>
                  <MasterStatusBadge tone={user.isActive ? "good" : "danger"}>{user.isActive ? "Ativo" : "Inativo"}</MasterStatusBadge>
                  <div className={styles.miniActions}>
                    <button type="button" onClick={() => actions.setUserModal({
                      mode: "edit",
                      companyId: company.id,
                      companyName: company.name,
                      userId: user.id,
                      userLabel: user.name || user.email || user.username || `#${user.id}`,
                      email: user.email || "",
                      username: user.username || "",
                      name: user.name || "",
                      role: user.role === "ADMIN" ? "ADMIN" : "USER",
                      password: "",
                    })}>Editar</button>
                    <button type="button" onClick={() => actions.setUserModal({
                      mode: "reset",
                      companyId: company.id,
                      companyName: company.name,
                      userId: user.id,
                      userLabel: user.name || user.email || user.username || `#${user.id}`,
                      email: user.email || "",
                      username: user.username || "",
                      name: user.name || "",
                      role: user.role === "ADMIN" ? "ADMIN" : "USER",
                      password: "",
                    })}>Resetar senha</button>
                    <button type="button" onClick={() => actions.deleteUser(company.id, user.id, user.name || user.username || user.email || `#${user.id}`)}>Remover</button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </details>

        <details className={styles.operationCard}>
          <summary>Website · {company.website.configured ? "configurado" : "pendente"}</summary>
          <div className={styles.operationBody}>
            {state.websiteDraft ? (
              <div className={styles.inlineForm}>
                <label><input type="checkbox" checked={state.websiteDraft.websiteEnabled} onChange={(event) => actions.setWebsiteDraft((current) => current ? { ...current, websiteEnabled: event.target.checked } : current)} /> Website ativo</label>
                <label><input type="checkbox" checked={state.websiteDraft.websiteAdminEnabled} onChange={(event) => actions.setWebsiteDraft((current) => current ? { ...current, websiteAdminEnabled: event.target.checked } : current)} /> Admin ativo</label>
                <input value={state.websiteDraft.websitePublicUrl} onChange={(event) => actions.setWebsiteDraft((current) => current ? { ...current, websitePublicUrl: event.target.value } : current)} placeholder="URL pública" />
                <input value={state.websiteDraft.websiteAdminUrl} onChange={(event) => actions.setWebsiteDraft((current) => current ? { ...current, websiteAdminUrl: event.target.value } : current)} placeholder="URL admin" />
                <input value={state.websiteDraft.websiteProjectId} onChange={(event) => actions.setWebsiteDraft((current) => current ? { ...current, websiteProjectId: event.target.value } : current)} placeholder="Project ID" />
                <MasterActionButton onClick={actions.saveWebsite}>Salvar website</MasterActionButton>
                <MasterActionButton variant="secondary" onClick={() => actions.launchWebsite(company.id, "public")}>Abrir website</MasterActionButton>
                <MasterActionButton variant="secondary" onClick={() => actions.launchWebsite(company.id, "admin")}>Abrir admin</MasterActionButton>
              </div>
            ) : null}
          </div>
        </details>

        <details className={styles.operationCard}>
          <summary>WhatsApp · {company.whatsappSituation?.statusLabel || company.whatsappCenter.statusLabel}</summary>
          <div className={styles.operationBody}>
            <div className={styles.operationStats}>
              <InfoItem label="Modo" value={company.whatsappSituation?.mode || company.whatsappCenter.mode} />
              <InfoItem label="Status atual" value={company.whatsappSituation?.statusLabel || company.whatsappCenter.statusLabel} />
              <InfoItem label="Número" value={company.whatsapp.masterDisplayNumber || company.whatsappCenter.official.displayNumber || company.whatsapp.endpoints.find((endpoint) => endpoint.isPrimary)?.whatsappDisplayNumber || company.whatsapp.endpoints.find((endpoint) => endpoint.isPrimary)?.whatsappNumber || "-"} />
              <InfoItem label="Token Master" value={company.whatsapp.usingMasterToken ? "Vinculado" : "Token próprio"} />
              <InfoItem label="Credencial MASTER" value={company.whatsapp.masterCredentialLabel || company.whatsapp.masterCredentialKey || "-"} />
              <InfoItem label="Endpoints" value={String(company.whatsapp.endpoints.length)} />
              <InfoItem label="Phone ID MASTER" value={company.whatsapp.masterPhoneNumberId || "-"} />
            </div>
            <div className={styles.inlineForm}>
              <select
                value={company.whatsapp.masterCredentialKey || ""}
                onChange={(event) => actions.setCompanyMasterTokenUsage({ masterWhatsAppCredentialKey: event.target.value || undefined, useMasterWhatsAppToken: true })}
                disabled={!workspace?.masterIntegrations?.whatsappLibrary.length}
              >
                <option value="">Credencial MASTER WhatsApp</option>
                {(workspace?.masterIntegrations?.whatsappLibrary || []).map((credential) => (
                  <option key={credential.key} value={credential.key}>{credential.label}</option>
                ))}
              </select>
              <MasterActionButton variant="secondary" onClick={() => actions.setCompanyMasterTokenUsage({ useMasterWhatsAppToken: !company.whatsapp.usingMasterToken })}>
                {company.whatsapp.usingMasterToken ? "Usar token próprio" : "Usar Token MASTER"}
              </MasterActionButton>
              <MasterActionButton variant="secondary" onClick={actions.validateWhatsAppConfig} disabled={state.busyAction === `whatsapp-validate-${company.id}`}>
                {state.busyAction === `whatsapp-validate-${company.id}` ? "Validando..." : "Validar WhatsApp"}
              </MasterActionButton>
              <MasterActionButton variant="secondary" onClick={() => actions.setMasterIntegrationsOpen(true)}>Biblioteca de tokens</MasterActionButton>
            </div>
            <div className={styles.endpointList}>
              {company.whatsapp.endpoints.map((endpoint) => {
                const canValidate = endpoint.id !== "legacy-primary" && (endpoint.accessTokenConfigured || company.whatsapp.usingMasterToken);
                return (
                  <article key={endpoint.id} className={styles.endpointRow} data-active={endpoint.isActive ? "true" : "false"}>
                    <div>
                      <strong>{endpoint.label || endpoint.whatsappDisplayNumber || endpoint.whatsappNumber || endpoint.id}</strong>
                      <span>
                        {endpoint.moduleKey || "geral"} · {endpoint.isPrimary ? "primário" : "secundário"} · {endpoint.accessTokenConfigured ? "token configurado" : "sem token próprio"}
                      </span>
                    </div>
                    <div>
                      <MasterStatusBadge tone={String(endpoint.whatsappStatus || "").toUpperCase() === "CONNECTED" ? "good" : endpoint.whatsappStatusError ? "danger" : "warn"}>
                        {endpoint.whatsappStatus || "Sem status"}
                      </MasterStatusBadge>
                      {endpoint.whatsappStatusUpdatedAt ? <small>{formatDateTime(endpoint.whatsappStatusUpdatedAt)}</small> : null}
                    </div>
                    <div className={styles.endpointMeta}>
                      <span>{endpoint.whatsappDisplayNumber || endpoint.whatsappNumber || "Sem número"}</span>
                      <span>{endpoint.whatsappPhoneNumberId || "Sem Phone ID"}</span>
                      {endpoint.whatsappStatusError ? <span>{endpoint.whatsappStatusError}</span> : null}
                    </div>
                    <MasterActionButton
                      variant="secondary"
                      onClick={() => actions.validateWhatsAppEndpoint(endpoint.id)}
                      disabled={!canValidate || state.busyAction === `whatsapp-endpoint-${endpoint.id}`}
                    >
                      {state.busyAction === `whatsapp-endpoint-${endpoint.id}` ? "Validando..." : "Validar endpoint"}
                    </MasterActionButton>
                  </article>
                );
              })}
              {!company.whatsapp.endpoints.length ? <MasterEmptyState title="Sem endpoints WhatsApp cadastrados" /> : null}
            </div>
            {state.whatsAppMigrationWorkflowDraft ? (
              <div className={styles.inlineForm}>
                <select value={state.whatsAppMigrationWorkflowDraft.status} onChange={(event) => actions.setWhatsAppMigrationWorkflowDraft((current) => current ? { ...current, status: event.target.value as "REQUESTED" | "CONTACTED" | "RESOLVED" } : current)}>
                  <option value="REQUESTED">REQUESTED</option>
                  <option value="CONTACTED">CONTACTED</option>
                  <option value="RESOLVED">RESOLVED</option>
                </select>
                <input type="datetime-local" value={state.whatsAppMigrationWorkflowDraft.lastContactAt} onChange={(event) => actions.setWhatsAppMigrationWorkflowDraft((current) => current ? { ...current, lastContactAt: event.target.value } : current)} />
                <input value={state.whatsAppMigrationWorkflowDraft.internalNote} onChange={(event) => actions.setWhatsAppMigrationWorkflowDraft((current) => current ? { ...current, internalNote: event.target.value } : current)} placeholder="Nota interna" />
                <MasterActionButton variant="secondary" onClick={actions.saveWhatsAppMigrationWorkflow}>Salvar workflow</MasterActionButton>
              </div>
            ) : null}
          </div>
        </details>

        <details className={styles.operationCard}>
          <summary>Mercado Pago · {company.mercadoPago.status || "sem status"}</summary>
          <div className={styles.operationBody}>
            <div className={styles.operationStats}>
              <InfoItem label="Token" value={company.mercadoPago.tokenConfigured ? "Configurado" : "Pendente"} />
              <InfoItem label="Credencial Master" value={company.mercadoPago.usingMasterToken ? "Sim" : "Não"} />
              <InfoItem label="Conta" value={company.mercadoPago.accountEmail || "-"} />
            </div>
            <div className={styles.inlineForm}>
              <select
                value={company.mercadoPago.masterCredentialKey || ""}
                onChange={(event) => actions.setCompanyMasterTokenUsage({ masterMercadoPagoCredentialKey: event.target.value || undefined, useMasterMercadoPagoToken: true })}
                disabled={!workspace?.masterIntegrations?.mercadoPagoLibrary.length}
              >
                <option value="">Credencial MASTER Mercado Pago</option>
                {(workspace?.masterIntegrations?.mercadoPagoLibrary || []).map((credential) => (
                  <option key={credential.key} value={credential.key}>{credential.label}</option>
                ))}
              </select>
              <MasterActionButton variant="secondary" onClick={() => actions.setCompanyMasterTokenUsage({ useMasterMercadoPagoToken: !company.mercadoPago.usingMasterToken })}>
                {company.mercadoPago.usingMasterToken ? "Usar token próprio" : "Usar Token MASTER"}
              </MasterActionButton>
              <input value={state.mercadoPagoDraft?.mercadoPagoAccessToken || ""} onChange={(event) => actions.setMercadoPagoDraft((current) => current ? { ...current, mercadoPagoAccessToken: event.target.value } : current)} placeholder="Access token Mercado Pago" />
              <MasterActionButton
                variant={state.mercadoPagoDraft?.mercadoPagoAccessToken.trim() ? "primary" : "secondary"}
                onClick={state.mercadoPagoDraft?.mercadoPagoAccessToken.trim() ? actions.saveAndValidateMercadoPagoConfig : actions.validateMercadoPagoConfig}
                disabled={state.busyAction === `mp-save-validate-${company.id}` || state.busyAction === `mp-validate-${company.id}`}
              >
                {state.mercadoPagoDraft?.mercadoPagoAccessToken.trim() ? "Salvar e validar" : "Validar"}
              </MasterActionButton>
              <MasterActionButton variant="secondary" onClick={actions.saveMercadoPagoConfig}>Salvar</MasterActionButton>
            </div>
            {state.mercadoPagoDraft?.statusError ? <div className={styles.alertDanger}>{state.mercadoPagoDraft.statusError}</div> : null}
          </div>
        </details>

        <details className={styles.operationCard}>
          <summary>Integrações · AUVO / TagPlus</summary>
          <div className={styles.operationBody}>
            <div className={styles.actionCluster}>
              <MasterActionButton variant="secondary" onClick={() => actions.loadCompanyIntegrations(company.id)}>
                {state.integrationsLoading ? "Carregando..." : "Carregar integrações"}
              </MasterActionButton>
              <MasterActionButton onClick={() => actions.openIntegrationEditor("AUVO")}>Nova AUVO</MasterActionButton>
              <MasterActionButton onClick={() => actions.openIntegrationEditor("TAGPLUS")}>Nova TagPlus</MasterActionButton>
            </div>
            <IntegrationEditor state={state} actions={actions} />
            <div className={styles.integrationList}>
              {state.companyIntegrations.map((connection) => (
                <IntegrationRow key={connection.id} connection={connection} actions={actions} />
              ))}
            </div>
          </div>
        </details>
      </div>
    </section>
  );
}

function IntegrationEditor({ state, actions }: { state: CommandState; actions: CommandActions }) {
  const editor = state.integrationEditor;
  if (!editor) return null;
  return (
    <div className={styles.integrationEditor}>
      <select value={editor.provider} onChange={(event) => actions.setIntegrationEditor((current) => current ? { ...current, provider: event.target.value as IntegrationProviderId } : current)}>
        <option value="AUVO">AUVO</option>
        <option value="TAGPLUS">TagPlus</option>
      </select>
      <input value={editor.instanceName} onChange={(event) => actions.setIntegrationEditor((current) => current ? { ...current, instanceName: event.target.value } : current)} placeholder="Nome da instância" />
      <input value={editor.secret} onChange={(event) => actions.setIntegrationEditor((current) => current ? { ...current, secret: event.target.value } : current)} placeholder="Token/secret" />
      <input value={editor.appKey} onChange={(event) => actions.setIntegrationEditor((current) => current ? { ...current, appKey: event.target.value } : current)} placeholder="App key" />
      <input value={editor.baseUrl} onChange={(event) => actions.setIntegrationEditor((current) => current ? { ...current, baseUrl: event.target.value } : current)} placeholder="Base URL" />
      <label><input type="checkbox" checked={editor.isActive} onChange={(event) => actions.setIntegrationEditor((current) => current ? { ...current, isActive: event.target.checked } : current)} /> Ativa</label>
      <MasterActionButton onClick={actions.saveCompanyIntegration}>{editor.mode === "create" ? "Criar integração" : "Salvar integração"}</MasterActionButton>
      <MasterActionButton variant="secondary" onClick={() => actions.setIntegrationEditor(null)}>Cancelar</MasterActionButton>
    </div>
  );
}

function IntegrationRow({ connection, actions }: { connection: CompanyIntegrationConnection; actions: CommandActions }) {
  return (
    <article className={styles.integrationRow}>
      <div>
        <strong>{connection.instanceName}</strong>
        <span>{connection.provider} · {connection.status}</span>
      </div>
      <div className={styles.miniActions}>
        <button type="button" onClick={() => actions.openIntegrationEditor(connection.provider, connection)}>Editar</button>
        <button type="button" onClick={() => actions.testCompanyIntegration(connection.id)}>Testar</button>
        <button type="button" onClick={() => actions.syncCompanyIntegration(connection.id)}>Sincronizar</button>
      </div>
    </article>
  );
}

function MasterRiskPanel({ company }: { company: CompanyDetailPayload["company"] }) {
  const [expanded, setExpanded] = useState(false);
  const events = expanded ? company.auditTimeline : company.auditTimeline.slice(0, 5);
  return (
    <section className={styles.panelSection}>
      <div className={styles.sectionTitle}>
        <span>Risco & Auditoria</span>
        <h3>Risco operacional</h3>
      </div>
      <div className={styles.riskBand} data-tone={riskTone(company)}>
        <strong>{company.riskLevel === "critical" ? "Crítico" : company.riskLevel === "warning" ? "Atenção" : "Estável"}</strong>
        <span>{company.operationalStatus?.overallHint || company.financialSituation || "Sem motivo crítico agora."}</span>
      </div>
      <MasterAuditTimeline events={events} />
      {company.auditTimeline.length > 5 ? (
        <MasterActionButton variant="secondary" onClick={() => setExpanded((current) => !current)}>
          {expanded ? "Recolher auditoria" : "Ver auditoria completa"}
        </MasterActionButton>
      ) : null}
    </section>
  );
}

function MasterAuditTimeline({ events }: { events: CompanyDetailPayload["company"]["auditTimeline"] }) {
  return (
    <div className={styles.auditTimeline}>
      {events.map((entry) => (
        <article key={entry.id} className={styles.auditItem}>
          <time>{formatDateTime(entry.createdAt)}</time>
          <strong>{auditTitle(entry)}</strong>
          <span>{compactAuditMetadata(entry)}</span>
        </article>
      ))}
      {!events.length ? <MasterEmptyState title="Sem auditoria recente" /> : null}
    </div>
  );
}

function MasterDangerZone({ company, actions, state }: { company: CompanyDetailPayload["company"]; actions: CommandActions; state: CommandState }) {
  return (
    <section className={`${styles.panelSection} ${styles.dangerZone}`}>
      <div className={styles.sectionTitle}>
        <span>Zona perigosa</span>
        <h3>Ações irreversíveis ou bloqueantes</h3>
      </div>
      <div className={styles.dangerActions}>
        <ActionConsequence
          title="Encerrar trial"
          text="Bloqueia trial e desativa módulos de acesso."
          tone="danger"
          onClick={() => actions.setConfirmAction({
            title: "Encerrar trial",
            description: `${company.name} perderá o trial agora.`,
            confirmLabel: "Encerrar trial",
            tone: "danger",
            run: async () => {
              actions.setConfirmAction(null);
              await actions.runTrialAction(company.id, { action: "end" }, "Trial encerrado.");
            },
          })}
        />
        <ActionConsequence
          title="Suspender"
          text="Bloqueia acesso e desativa módulos."
          tone="danger"
          onClick={() => actions.setConfirmAction({
            title: "Suspender empresa",
            description: `${company.name} será suspensa agora.`,
            confirmLabel: "Suspender",
            tone: "danger",
            run: async () => {
              actions.setConfirmAction(null);
              await actions.setPaymentStatus(company.id, "DISABLED", "Empresa suspensa no plano operacional.");
            },
          })}
        />
        <ActionConsequence
          title="Arquivar"
          text="Preserva histórico e bloqueia operação."
          tone="danger"
          onClick={() => actions.setConfirmAction({
            title: "Arquivar empresa",
            description: `${company.name} terá o acesso bloqueado e os dados preservados.`,
            confirmLabel: "Arquivar empresa",
            tone: "danger",
            run: async () => {
              actions.setConfirmAction(null);
              await actions.archiveCompany(company.id, "Arquivada pela central MASTER");
            },
          })}
        />
        <ActionConsequence
          title="Excluir permanentemente"
          text="Remove empresa, usuários e vínculos operacionais."
          tone="danger"
          onClick={() => actions.setConfirmAction({
            title: "Excluir permanentemente",
            description: `${company.name} será apagada do sistema.`,
            confirmLabel: "Excluir permanentemente",
            tone: "danger",
            confirmationKeyword: buildHardDeleteConfirmation(company.name),
            confirmationInputLabel: "Digite a frase de confirmação",
            details: ["Hard delete real da empresa.", "Apenas rastros mínimos de auditoria ficam no MASTER."],
            run: async () => {
              actions.setConfirmAction(null);
              await actions.hardDeleteCompany(company.id, company.name, "Hard delete executado pela central MASTER");
            },
          })}
          disabled={state.busyAction === `delete-${company.id}`}
        />
      </div>
    </section>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.infoItem}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ActionConsequence({
  title,
  text,
  tone = "neutral",
  disabled,
  onClick,
}: {
  title: string;
  text: string;
  tone?: MasterRealityTone;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={styles.actionConsequence} data-tone={tone} onClick={onClick} disabled={disabled}>
      <strong>{title}</strong>
      <span>{text}</span>
    </button>
  );
}

export function MasterStatusBadge({ tone, children }: { tone: MasterRealityTone; children: ReactNode }) {
  return <span className={styles.statusBadge} data-tone={tone}>{children}</span>;
}

export function MasterActionButton({
  children,
  variant = "primary",
  disabled,
  onClick,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={styles.actionButton} data-variant={variant} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function MasterEmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className={styles.emptyState}>
      <strong>{title}</strong>
      {description ? <span>{description}</span> : null}
    </div>
  );
}

export function MasterLoadingState({ label = "Carregando central MASTER..." }: { label?: string }) {
  return (
    <div className={styles.loadingState}>
      <div />
      <span>{label}</span>
    </div>
  );
}

function Modal({ open, title, children, onClose, wide = false }: { open: boolean; title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className={styles.modalRoot}>
      <button type="button" className={styles.modalBackdrop} onClick={onClose} aria-label="Fechar modal" />
      <article className={styles.modalCard} data-wide={wide ? "true" : "false"}>
        <header>
          <h3>{title}</h3>
          <button type="button" onClick={onClose}>Fechar</button>
        </header>
        {children}
      </article>
    </div>
  );
}

function CreateCompanyModal({ state, actions }: { state: CommandState; actions: CommandActions }) {
  return (
    <Modal open={state.createCompanyOpen} title="Nova empresa" onClose={() => actions.setCreateCompanyOpen(false)}>
      <div className={styles.modalForm}>
        <input value={state.createCompanyName} onChange={(event) => actions.setCreateCompanyName(event.target.value)} placeholder="Nome da empresa" />
        <input value={state.createCompanySlug} onChange={(event) => actions.setCreateCompanySlug(event.target.value)} placeholder="Slug opcional" />
        <MasterActionButton onClick={actions.submitCreateCompany} disabled={state.busyAction === "create-company"}>
          {state.busyAction === "create-company" ? "Criando..." : "Criar empresa"}
        </MasterActionButton>
      </div>
    </Modal>
  );
}

function UserEditorModal({ state, actions }: { state: CommandState; actions: CommandActions }) {
  const modal = state.userModal;
  return (
    <Modal open={Boolean(modal)} title={modal?.mode === "create" ? "Criar usuário" : modal?.mode === "reset" ? "Resetar senha" : "Editar usuário"} onClose={() => actions.setUserModal(null)}>
      {modal ? (
        <div className={styles.modalForm}>
          {modal.mode !== "reset" ? (
            <>
              <input value={modal.email} onChange={(event) => actions.setUserModal((current) => current ? { ...current, email: event.target.value } : current)} placeholder="E-mail" />
              <input value={modal.name} onChange={(event) => actions.setUserModal((current) => current ? { ...current, name: event.target.value } : current)} placeholder="Nome" />
              <input value={modal.username} onChange={(event) => actions.setUserModal((current) => current ? { ...current, username: event.target.value } : current)} placeholder="Login" />
              <select value={modal.role} onChange={(event) => actions.setUserModal((current) => current ? { ...current, role: event.target.value as "USER" | "ADMIN" } : current)}>
                <option value="USER">USER</option>
                <option value="ADMIN">ADMIN</option>
              </select>
            </>
          ) : null}
          <input type="password" value={modal.password} onChange={(event) => actions.setUserModal((current) => current ? { ...current, password: event.target.value } : current)} placeholder={modal.mode === "reset" ? "Nova senha opcional" : "Senha opcional"} />
          <MasterActionButton onClick={actions.submitUserModal} disabled={state.busyAction === `user-${modal.mode}`}>
            {state.busyAction === `user-${modal.mode}` ? "Salvando..." : modal.mode === "create" ? "Criar usuário" : modal.mode === "reset" ? "Resetar senha" : "Salvar usuário"}
          </MasterActionButton>
        </div>
      ) : null}
    </Modal>
  );
}

function ManualPaymentModal({ state, actions }: { state: CommandState; actions: CommandActions }) {
  const modal = state.manualPaymentModal;
  return (
    <Modal open={Boolean(modal)} title="Lançar pagamento manual" onClose={() => actions.setManualPaymentModal(null)}>
      {modal ? (
        <div className={styles.modalForm}>
          <input value={modal.value} onChange={(event) => actions.setManualPaymentModal((current) => current ? { ...current, value: event.target.value } : current)} placeholder="Valor" />
          <input value={modal.competence} onChange={(event) => actions.setManualPaymentModal((current) => current ? { ...current, competence: event.target.value } : current)} placeholder="Competência" />
          <input type="datetime-local" value={modal.paidAt} onChange={(event) => actions.setManualPaymentModal((current) => current ? { ...current, paidAt: event.target.value } : current)} />
          <input type="date" value={modal.dueDate} onChange={(event) => actions.setManualPaymentModal((current) => current ? { ...current, dueDate: event.target.value } : current)} />
          <select value={modal.paymentMethod} onChange={(event) => actions.setManualPaymentModal((current) => current ? { ...current, paymentMethod: event.target.value } : current)}>
            <option value="PIX">Pix</option>
            <option value="CARD">Cartão</option>
            <option value="BOLETO">Boleto</option>
            <option value="TRANSFERENCIA">Transferência</option>
            <option value="DINHEIRO">Dinheiro</option>
            <option value="MANUAL">Manual</option>
          </select>
          <textarea value={modal.observation} onChange={(event) => actions.setManualPaymentModal((current) => current ? { ...current, observation: event.target.value } : current)} placeholder="Observação" />
          <label><input type="checkbox" checked={modal.settlePending} onChange={(event) => actions.setManualPaymentModal((current) => current ? { ...current, settlePending: event.target.checked } : current)} /> Quitar pendência e liberar acesso</label>
          <label><input type="checkbox" checked={modal.generateAudit} onChange={(event) => actions.setManualPaymentModal((current) => current ? { ...current, generateAudit: event.target.checked } : current)} /> Registrar auditoria</label>
          <MasterActionButton onClick={actions.submitManualPayment} disabled={state.busyAction === "manual-payment"}>
            {state.busyAction === "manual-payment" ? "Lançando..." : "Confirmar pagamento"}
          </MasterActionButton>
        </div>
      ) : null}
    </Modal>
  );
}

function ConfirmActionModal({ state, actions }: { state: CommandState; actions: CommandActions }) {
  const modal = state.confirmAction;
  const disabled = Boolean(modal?.confirmationKeyword) && state.confirmActionInput.trim() !== modal?.confirmationKeyword;
  return (
    <Modal open={Boolean(modal)} title={modal?.title || "Confirmar operação"} onClose={() => actions.setConfirmAction(null)}>
      {modal ? (
        <div className={styles.modalForm}>
          <p>{modal.description}</p>
          {modal.details?.map((detail, index) => <span key={`${modal.title}-${index}`} className={styles.confirmDetail}>{detail}</span>)}
          {modal.confirmationKeyword ? (
            <input value={state.confirmActionInput} onChange={(event) => actions.setConfirmActionInput(event.target.value)} placeholder={modal.confirmationKeyword} />
          ) : null}
          <MasterActionButton variant={modal.tone === "danger" ? "danger" : "primary"} onClick={() => void modal.run()} disabled={disabled}>
            {modal.confirmLabel}
          </MasterActionButton>
        </div>
      ) : null}
    </Modal>
  );
}

function MasterIntegrationsModal({ state, actions }: { state: CommandState; actions: CommandActions }) {
  return (
    <Modal open={state.masterIntegrationsOpen} title="Credenciais globais do MASTER" onClose={() => actions.setMasterIntegrationsOpen(false)} wide>
      <div className={styles.modalStack}>
        {state.activeCompany ? (
          <div className={styles.alertInfo}>
            <strong>{state.activeCompany.name}</strong>
            <MasterActionButton variant="secondary" onClick={() => actions.importActiveCompanyTokensToMaster(true)}>Importar tokens da empresa</MasterActionButton>
          </div>
        ) : null}
        <CredentialLibrary
          title="Mercado Pago"
          items={state.masterIntegrationsDraft.mercadoPagoLibrary}
          onAdd={actions.addMasterMercadoPagoCredential}
          onRemove={actions.removeMasterMercadoPagoCredential}
          onUpdate={actions.updateMasterMercadoPagoCredential}
        />
        <WhatsAppCredentialLibrary state={state} actions={actions} />
        <div className={styles.inlineForm}>
          <input value={String(state.masterIntegrationsDraft.annualPlanDiscountPercent ?? 0)} onChange={(event) => actions.setMasterIntegrationsDraft((current) => ({ ...current, annualPlanDiscountPercent: Number(event.target.value || 0) }))} placeholder="Desconto anual %" />
          <input value={String(state.masterIntegrationsDraft.extraSeatMonthlyAmount ?? 0)} onChange={(event) => actions.setMasterIntegrationsDraft((current) => ({ ...current, extraSeatMonthlyAmount: Number(event.target.value || 0) }))} placeholder="Assento extra" />
          <input value={String(state.masterIntegrationsDraft.referralDiscountPercent ?? 0)} onChange={(event) => actions.setMasterIntegrationsDraft((current) => ({ ...current, referralDiscountPercent: Number(event.target.value || 0) }))} placeholder="Indicação %" />
          <label><input type="checkbox" checked={state.masterIntegrationsDraft.referralDiscountActive} onChange={(event) => actions.setMasterIntegrationsDraft((current) => ({ ...current, referralDiscountActive: event.target.checked }))} /> Indicação ativa</label>
          <MasterActionButton variant="secondary" onClick={actions.saveMasterBillingPolicy}>Salvar política financeira</MasterActionButton>
          <MasterActionButton onClick={actions.saveMasterIntegrations}>Salvar credenciais</MasterActionButton>
        </div>
      </div>
    </Modal>
  );
}

function VendasComplaintsModal({
  open,
  complaints,
  loading,
  error,
  notes,
  refunds,
  busyId,
  onClose,
  onReload,
  onNoteChange,
  onRefundChange,
  onUpdate,
}: {
  open: boolean;
  complaints: VendasComplaint[];
  loading: boolean;
  error: string | null;
  notes: Record<string, string>;
  refunds: Record<string, string>;
  busyId: string | null;
  onClose: () => void;
  onReload: () => void;
  onNoteChange: (id: string, value: string) => void;
  onRefundChange: (id: string, value: string) => void;
  onUpdate: (complaint: VendasComplaint, patch: { status?: VendasComplaintStatus; refundCards?: number }) => void;
}) {
  const summary = useMemo(() => ({
    new: complaints.filter((item) => item.status === "new").length,
    reviewing: complaints.filter((item) => item.status === "reviewing").length,
    refunded: complaints.filter((item) => item.status === "refunded").length,
    denied: complaints.filter((item) => item.status === "denied").length,
    resolved: complaints.filter((item) => item.status === "resolved").length,
  }), [complaints]);

  return (
    <Modal open={open} title="Reclamações de cards" onClose={onClose} wide>
      <div className={styles.complaintQueue}>
        <div className={styles.complaintToolbar}>
          <div>
            <strong>{complaints.length} reclamação(ões)</strong>
            <span>
              Novas {summary.new} · Em análise {summary.reviewing} · Reembolsadas {summary.refunded}
            </span>
          </div>
          <MasterActionButton variant="secondary" onClick={onReload} disabled={loading}>
            {loading ? "Atualizando..." : "Atualizar"}
          </MasterActionButton>
        </div>
        {error ? <div className={styles.alertDanger}>{error}</div> : null}
        {!loading && !complaints.length ? (
          <div className={styles.emptyState}>Nenhuma reclamação de card por enquanto.</div>
        ) : null}
        {complaints.map((complaint) => {
          const busy = busyId === complaint.id;
          const refundValue = Math.max(1, Math.trunc(Number(refunds[complaint.id] || complaint.refundedCards || 1) || 1));
          return (
            <article key={complaint.id} className={styles.complaintCard} data-status={complaint.status}>
              <header>
                <div>
                  <span>{VENDAS_COMPLAINT_STATUS_LABELS[complaint.status]}</span>
                  <strong>{complaint.leadName || "Card sem nome"}</strong>
                  <small>
                    {complaint.companyName} · {formatDateTime(complaint.createdAt)}
                  </small>
                </div>
                {complaint.contactWhatsappUrl ? (
                  <a href={complaint.contactWhatsappUrl} target="_blank" rel="noreferrer">
                    Chamar cliente
                  </a>
                ) : null}
              </header>
              <p>{complaint.reason}</p>
              <div className={styles.complaintMetaGrid}>
                <span>Lead: {complaint.leadPhone || "sem telefone"}</span>
                <span>{[complaint.leadCity, complaint.leadState].filter(Boolean).join("/") || "sem cidade"}</span>
                <span>{complaint.leadSegment || "sem segmento"}</span>
                <span>{complaint.userName || complaint.userEmail || "usuário não identificado"}</span>
              </div>
              <textarea
                value={notes[complaint.id] || ""}
                onChange={(event) => onNoteChange(complaint.id, event.target.value)}
                placeholder="Nota interna para análise/reembolso"
              />
              <div className={styles.complaintActions}>
                <select
                  value={complaint.status}
                  onChange={(event) => onUpdate(complaint, { status: event.target.value as VendasComplaintStatus })}
                  disabled={busy}
                >
                  {Object.entries(VENDAS_COMPLAINT_STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={refunds[complaint.id] || String(complaint.refundedCards || 1)}
                  onChange={(event) => onRefundChange(complaint.id, event.target.value)}
                  aria-label="Cards para reembolsar"
                />
                <MasterActionButton
                  variant="secondary"
                  onClick={() => onUpdate(complaint, { status: complaint.status })}
                  disabled={busy}
                >
                  Salvar análise
                </MasterActionButton>
                <MasterActionButton
                  onClick={() => onUpdate(complaint, { status: "refunded", refundCards: refundValue })}
                  disabled={busy}
                >
                  {busy ? "Processando..." : "Reembolsar card"}
                </MasterActionButton>
              </div>
            </article>
          );
        })}
      </div>
    </Modal>
  );
}

function MasterEmailModal({ state, actions }: { state: CommandState; actions: CommandActions }) {
  return (
    <Modal open={state.masterEmailOpen} title="Email comercial e transacional" onClose={() => actions.setMasterEmailOpen(false)} wide>
      <MasterEmailWorkspace embedded />
    </Modal>
  );
}

function CredentialLibrary({
  title,
  items,
  onAdd,
  onRemove,
  onUpdate,
}: {
  title: string;
  items: Array<{ key: string; label: string; accessToken?: string | null; accessTokenPreview?: string | null }>;
  onAdd: () => void;
  onRemove: (key: string) => void;
  onUpdate: (key: string, patch: { label?: string; accessToken?: string }) => void;
}) {
  return (
    <section className={styles.credentialLibrary}>
      <div className={styles.sectionTitle}><span>Biblioteca</span><h3>{title}</h3></div>
      <MasterActionButton variant="secondary" onClick={onAdd}>Novo token</MasterActionButton>
      {items.map((item) => (
        <div key={item.key} className={styles.inlineForm}>
          <input value={item.label || ""} onChange={(event) => onUpdate(item.key, { label: event.target.value })} placeholder="Nome" />
          <input value={item.accessToken || item.accessTokenPreview || ""} onChange={(event) => onUpdate(item.key, { accessToken: event.target.value })} placeholder="Access token" />
          <MasterActionButton variant="ghost" onClick={() => onRemove(item.key)}>Remover</MasterActionButton>
        </div>
      ))}
    </section>
  );
}

function WhatsAppCredentialLibrary({ state, actions }: { state: CommandState; actions: CommandActions }) {
  return (
    <section className={styles.credentialLibrary}>
      <div className={styles.sectionTitle}><span>Biblioteca</span><h3>WhatsApp</h3></div>
      <MasterActionButton variant="secondary" onClick={actions.addMasterWhatsAppCredential}>Novo WhatsApp</MasterActionButton>
      {state.masterIntegrationsDraft.whatsappLibrary.map((item) => (
        <div key={item.key} className={styles.inlineForm}>
          <input value={item.label || ""} onChange={(event) => actions.updateMasterWhatsAppCredential(item.key, { label: event.target.value })} placeholder="Nome" />
          <input value={item.accessToken || item.accessTokenPreview || ""} onChange={(event) => actions.updateMasterWhatsAppCredential(item.key, { accessToken: event.target.value })} placeholder="Access token" />
          <input value={item.phoneNumberId || ""} onChange={(event) => actions.updateMasterWhatsAppCredential(item.key, { phoneNumberId: event.target.value })} placeholder="Phone ID" />
          <input value={item.wabaId || ""} onChange={(event) => actions.updateMasterWhatsAppCredential(item.key, { wabaId: event.target.value })} placeholder="WABA ID" />
          <input value={item.displayNumber || ""} onChange={(event) => actions.updateMasterWhatsAppCredential(item.key, { displayNumber: event.target.value })} placeholder="Número" />
          <MasterActionButton variant="ghost" onClick={() => actions.removeMasterWhatsAppCredential(item.key)}>Remover</MasterActionButton>
        </div>
      ))}
    </section>
  );
}

function ModuleCatalogModal({ state, actions }: { state: CommandState; actions: CommandActions }) {
  const drafts = Object.values(state.moduleCatalogDrafts).filter((item) => item.companyAssignable);
  return (
    <Modal open={state.moduleCatalogOpen} title="Catálogo de módulos" onClose={() => actions.setModuleCatalogOpen(false)} wide>
      <div className={styles.modalStack}>
        {drafts.map((draft) => (
          <article key={draft.key} className={styles.catalogRow}>
            <input value={draft.name} onChange={(event) => actions.setModuleCatalogDrafts((current) => ({ ...current, [draft.key]: { ...draft, name: event.target.value } }))} />
            <input value={draft.description} onChange={(event) => actions.setModuleCatalogDrafts((current) => ({ ...current, [draft.key]: { ...draft, description: event.target.value } }))} />
            <input type="number" min={0} step="0.01" value={draft.monthlyPrice} onChange={(event) => actions.setModuleCatalogDrafts((current) => ({ ...current, [draft.key]: { ...draft, monthlyPrice: event.target.value } }))} placeholder="Preço mensal" />
            <label><input type="checkbox" checked={draft.defaultEnabled} onChange={(event) => actions.setModuleCatalogDrafts((current) => ({ ...current, [draft.key]: { ...draft, defaultEnabled: event.target.checked } }))} /> Padrão</label>
            <MasterActionButton variant="secondary" onClick={() => actions.saveSystemModule(draft.key)}>Salvar</MasterActionButton>
          </article>
        ))}
      </div>
    </Modal>
  );
}
