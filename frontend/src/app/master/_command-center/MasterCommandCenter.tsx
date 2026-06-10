"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import type {
  CompanyDetailPayload,
  CompanyIntegrationConnection,
  CompanySummary,
  IntegrationProviderId,
} from "../master.types";
import HbxGuide1 from "@/components/HbxGuide1";
import BancoDeDadosClientPage from "../../bancodedados/page.client";
import { MasterEmailWorkspace } from "../email/page.client";
import { useMasterCommandCenterActions } from "./MasterCommandCenter.hooks";
import type {
  MasterCommandCenterProps,
  MasterPlanKey,
  MasterRealityTone,
} from "./MasterCommandCenter.types";
import {
  MASTER_PLAN_CATALOG,
  activeModuleCount,
  auditTitle,
  billingCycleLabel,
  buildHardDeleteConfirmation,
  buildPlanChangePreview,
  commercialPlanLabel,
  compactAuditMetadata,
  companyHasOperationalAccess,
  companyNoAccess,
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
  syncMasterPlanCatalog,
} from "./MasterCommandCenter.utils";
import styles from "./MasterCommandCenter.module.css";

type CommandActions = ReturnType<typeof useMasterCommandCenterActions>["actions"];
type CommandState = ReturnType<typeof useMasterCommandCenterActions>["state"];
type MasterInspectorTabId = "overview" | "access" | "billing" | "users" | "whatsapp" | "radar" | "integrations" | "audit" | "danger";
type MasterPrimaryTabId = "empresas" | "email" | "database" | "tokens" | "links" | "refresh" | "exit";

const MASTER_INSPECTOR_TABS: Array<{ id: MasterInspectorTabId; label: string; meta: string }> = [
  { id: "overview", label: "Resumo", meta: "estado" },
  { id: "access", label: "Acesso", meta: "plano" },
  { id: "billing", label: "Cobranca", meta: "caixa" },
  { id: "users", label: "Usuarios", meta: "login" },
  { id: "whatsapp", label: "WhatsApp", meta: "canal" },
  { id: "radar", label: "Radar", meta: "cards" },
  { id: "integrations", label: "Integracoes", meta: "tokens" },
  { id: "audit", label: "Auditoria", meta: "risco" },
  { id: "danger", label: "Perigo", meta: "bloqueio" },
];

const MASTER_PRIMARY_TABS = [
  { key: "empresas", label: "Empresas" },
  { key: "email", label: "Email" },
  { key: "database", label: "Banco de Dados" },
  { key: "tokens", label: "Tokens" },
  { key: "links", label: "Links" },
  { key: "refresh", label: "Atualizar" },
] satisfies Array<{ key: MasterPrimaryTabId; label: string }>;

const MASTER_INSPECTOR_GUIDE_TABS = MASTER_INSPECTOR_TABS.map((item) => ({
  key: item.id,
  label: item.label,
})) satisfies Array<{ key: MasterInspectorTabId; label: string }>;

function featureLabel(value: string) {
  const normalized = String(value || "").trim();
  const labels: Record<string, string> = {
    atendimento: "Atendimento",
    atendimento_chat: "Atendimento",
    vendas: "Vendas",
    webscraping: "Radar Digital",
    gerencial: "Gerencial",
    bot_ia: "Bot IA",
    radar_premium: "Radar Premium",
    recovery_intelligence: "Recovery",
    digital_audit: "Auditoria digital",
    opportunity_score: "Score",
    ai_sales_scripts: "Scripts IA",
  };
  return labels[normalized] || normalized;
}

export default function MasterCommandCenter(props: MasterCommandCenterProps) {
  const { workspace, currentUser, loading, refreshing, initialCompanyId, initialPanel, onReload, setWorkspace, setCurrentUser } = props;
  const [activePrimaryTab, setActivePrimaryTab] = useState<MasterPrimaryTabId>("empresas");
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
    syncMasterPlanCatalog(workspace?.plansCatalog);
  }, [workspace?.plansCatalog]);

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
    if (normalized === "tokens") actions.setMasterIntegrationsOpen(true);
    if (["database", "banco", "bancodedados", "exclusoes", "excluidos", "reclamacoes", "reclamações", "complaints", "concluidos", "concluídos", "completed"].includes(normalized)) {
      window.location.href = "/bancodedados";
    }
  }, [actions, initialPanel]);

  const companies = useMemo(() => workspace?.companies || [], [workspace?.companies]);

  return (
    <MasterShell>
      <MasterTopCommandBar
        activeTab={activePrimaryTab}
        onTabChange={setActivePrimaryTab}
        currentUser={currentUser}
        refreshing={refreshing}
        onReload={() => void onReload(true)}
        onExitContext={actions.exitContext}
      />

      {state.error ? <div className={styles.alertDanger}>{state.error}</div> : null}
      {state.message ? <div className={styles.alertInfo}>{state.message}</div> : null}

      {activePrimaryTab === "empresas" ? (
        loading ? (
          <MasterLoadingState />
        ) : (
          <MasterOperationsLayout
            companies={companies}
            activeCompanyId={state.activeCompany?.id || null}
            onOpenCompany={(company) => void actions.loadDetail(company.id)}
            onAssumeCompany={actions.assumeContext}
            companyHasContext={actions.companyHasActiveMasterContext}
            onCreateCompany={() => actions.setCreateCompanyOpen(true)}
            busyAction={state.busyAction}
            workspace={workspace}
            state={state}
            actions={actions}
          />
        )
      ) : (
        <MasterPrimaryWorkspace tab={activePrimaryTab} state={state} actions={actions} />
      )}

      <UserEditorModal state={state} actions={actions} />
      <ManualPaymentModal state={state} actions={actions} />
      <ConfirmActionModal state={state} actions={actions} />
      <CreateCompanyModal state={state} actions={actions} />
      <MasterIntegrationsModal state={state} actions={actions} />
      <MasterEmailModal state={state} actions={actions} />
    </MasterShell>
  );
}

export function MasterShell({ children }: { children: ReactNode }) {
  return <div className={`${styles.masterShell} hbx-master-shell`}>{children}</div>;
}

function MasterOperationsLayout({
  companies,
  activeCompanyId,
  onOpenCompany,
  onAssumeCompany,
  companyHasContext,
  onCreateCompany,
  busyAction,
  workspace,
  state,
  actions,
}: {
  companies: CompanySummary[];
  activeCompanyId: number | null;
  onOpenCompany: (company: CompanySummary) => void;
  onAssumeCompany: (company: CompanySummary) => void;
  companyHasContext: (companyId?: number | null) => boolean;
  onCreateCompany: () => void;
  busyAction: string | null;
  workspace: MasterCommandCenterProps["workspace"];
  state: CommandState;
  actions: CommandActions;
}) {
  return (
    <section className={styles.operationsSurface}>
      <div className={styles.commandLayout}>
        <MasterCompanyBoard
          companies={companies}
          activeCompanyId={activeCompanyId}
          onOpen={onOpenCompany}
          onAssume={onAssumeCompany}
          companyHasContext={companyHasContext}
          onCreate={onCreateCompany}
          busyAction={busyAction}
        />
        <MasterCompanyInspector
          workspace={workspace}
          state={state}
          actions={actions}
        />
      </div>
    </section>
  );
}

function MasterTopCommandBar({
  activeTab,
  onTabChange,
  currentUser,
  refreshing,
  onReload,
  onExitContext,
}: {
  activeTab: MasterPrimaryTabId;
  onTabChange: (tab: MasterPrimaryTabId) => void;
  currentUser: MasterCommandCenterProps["currentUser"];
  refreshing: boolean;
  onReload: () => void;
  onExitContext: () => void;
}) {
  const contextActive = currentUser?.masterContext?.active === true;
  const baseTabs = MASTER_PRIMARY_TABS.map((tab) => (
    tab.key === "refresh" ? { ...tab, label: refreshing ? "Atualizando" : "Atualizar" } : tab
  ));
  const tabs = contextActive
    ? [...baseTabs, { key: "exit", label: "Sair operação" } satisfies { key: MasterPrimaryTabId; label: string }]
    : baseTabs;

  function handlePrimaryTab(tab: MasterPrimaryTabId) {
    if (tab === "refresh") {
      onReload();
      onTabChange("empresas");
      return;
    }
    if (tab === "exit") {
      onExitContext();
      onTabChange("empresas");
      return;
    }
    onTabChange(tab);
  }

  return (
    <section className={styles.topCommandBar}>
      <div className={styles.commandWorkstation}>
        <div className={`${styles.masterGuide1Slot} hbx-guide1-slot`}>
          <HbxGuide1
            tabs={tabs}
            activeKey={activeTab === "exit" || activeTab === "refresh" ? "empresas" : activeTab}
            ariaLabel="Master"
            onChange={handlePrimaryTab}
          />
        </div>
      </div>
    </section>
  );
}

function MasterPrimaryWorkspace({
  tab,
  state,
  actions,
}: {
  tab: MasterPrimaryTabId;
  state: CommandState;
  actions: CommandActions;
}) {
  if (tab === "email") {
    return (
      <section className={`${styles.primaryWorkspace} hbx-page-mobile-enter`}>
        <MasterEmailWorkspace embedded />
      </section>
    );
  }
  if (tab === "tokens") return <MasterIntegrationsPanelInline state={state} actions={actions} />;
  if (tab === "database") {
    return (
      <section className={`${styles.primaryWorkspace} ${styles.primaryWorkspaceFlush} hbx-page-mobile-enter`}>
        <BancoDeDadosClientPage embedded />
      </section>
    );
  }
  if (tab === "links") {
    return (
      <MasterInlinePanel eyebrow="Links" title="Atalhos do sistema">
        <div className={styles.primaryShortcutGrid}>
          {[
            ["Master financeiro", "/master/financeiro"],
            ["Master operação", "/master/operacao"],
            ["Radar Digital", "/radar-digital"],
            ["Vendas", "/vendas"],
            ["Atendimento", "/atendimento"],
            ["Recovery", "/hbx-recovery"],
          ].map(([label, href]) => (
            <a key={href} className={styles.secondaryLink} href={href}>{label}</a>
          ))}
        </div>
      </MasterInlinePanel>
    );
  }
  return null;
}

function MasterInlinePanel({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section className={`${styles.primaryWorkspace} hbx-page-mobile-enter`}>
      <div className={styles.sectionTitle}>
        <div>
          <span>{eyebrow}</span>
          <h3>{title}</h3>
        </div>
      </div>
      {children}
    </section>
  );
}

function MasterCompanyBoard({
  companies,
  activeCompanyId,
  onOpen,
  onAssume,
  companyHasContext,
  onCreate,
  busyAction,
}: {
  companies: CompanySummary[];
  activeCompanyId: number | null;
  onOpen: (company: CompanySummary) => void;
  onAssume: (company: CompanySummary) => void;
  companyHasContext: (companyId?: number | null) => boolean;
  onCreate: () => void;
  busyAction: string | null;
}) {
  return (
    <section className={styles.companyBoard} aria-label="Empresas">
      <div className={styles.companyBoardToolbar}>
        <MasterActionButton onClick={onCreate}>Nova empresa</MasterActionButton>
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
  const displayName = String(company.name || `Empresa ${company.id}`).trim();
  const displayMeta = String(company.contactPhone || company.contactEmail || company.slug || `ID ${company.id}`).trim();
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.slice(0, 1))
    .join("")
    .toUpperCase() || "HB";

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onOpen();
  }

  return (
    <article
      className={styles.companyRow}
      data-active={active ? "true" : "false"}
      data-tone={riskTone(company)}
      role="button"
      tabIndex={0}
      title={`${displayName} - ${displayMeta}`}
      aria-label={`Abrir ${displayName}`}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
    >
      <span className={styles.companyAvatar} aria-hidden="true">{initials}</span>
      <div className={styles.companyMain}>
        <strong>{displayName}</strong>
        <span>{displayMeta}</span>
      </div>
      <span className={styles.companySignal} data-active={contextActive ? "true" : "false"} aria-hidden="true" />
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
        <button
          type="button"
          className={styles.actionButton}
          data-variant="secondary"
          onClick={(event) => {
            event.stopPropagation();
            onAssume();
          }}
          disabled={contextActive || busyAction === `context-${company.id}`}
        >
          {contextActive ? "Operando" : "Operar"}
        </button>
      </div>
    </article>
  );
}

function MasterCompanyInspector({
  workspace,
  state,
  actions,
}: {
  workspace: MasterCommandCenterProps["workspace"];
  state: CommandState;
  actions: CommandActions;
}) {
  const company = state.activeCompany;
  const [activeTabState, setActiveTabState] = useState<{ companyId: number | null; tab: MasterInspectorTabId }>({
    companyId: null,
    tab: "overview",
  });
  const activeTab = company && activeTabState.companyId === company.id ? activeTabState.tab : "overview";

  if (state.detailLoading) return <MasterLoadingState label="Carregando empresa..." />;
  if (!company) return <MasterEmptyState title="Selecione uma empresa" description="O inspector abre a operação completa por empresa." />;

  return (
    <aside className={styles.inspector} aria-label={`Inspector ${company.name}`}>
      <div className={`${styles.inspectorTabs} hbx-guide1-slot`}>
        <HbxGuide1
          tabs={MASTER_INSPECTOR_GUIDE_TABS}
          activeKey={activeTab}
          ariaLabel="Areas do controle master"
          onChange={(tab) => setActiveTabState({ companyId: company.id, tab })}
        />
      </div>
      <div className={styles.inspectorContent}>
        {activeTab === "overview" ? (
          <>
            <MasterRealityPanel company={company} actions={actions} state={state} />
            <MasterCompanyProfilePanel company={company} actions={actions} state={state} />
          </>
        ) : null}
        {activeTab === "access" ? (
          <>
            <MasterPlanAccessPanel key={`${company.id}-${company.selectedPlanKey || "none"}`} company={company} actions={actions} state={state} />
            <MasterTrialPanel company={company} actions={actions} state={state} />
          </>
        ) : null}
        {activeTab === "billing" ? <MasterBillingPanel company={company} actions={actions} state={state} /> : null}
        {activeTab === "users" ? <MasterUsersPanel company={company} actions={actions} /> : null}
        {activeTab === "whatsapp" ? <MasterWhatsAppPanel workspace={workspace} company={company} actions={actions} state={state} /> : null}
        {activeTab === "radar" ? <RadarCommandPanel company={company} actions={actions} state={state} /> : null}
        {activeTab === "integrations" ? <MasterIntegrationsPanel workspace={workspace} company={company} actions={actions} state={state} /> : null}
        {activeTab === "audit" ? <MasterRiskPanel company={company} /> : null}
        {activeTab === "danger" ? <MasterDangerZone company={company} actions={actions} state={state} /> : null}
      </div>
    </aside>
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
  const includedSellers = Number(company.finance.includedActiveUsers || 0) || 0;
  const billableSellers = Number(company.finance.activeUsers || 0) || 0;
  const extraSellers = Number(company.finance.extraActiveUsers || 0) || 0;
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
        <InfoItem label="Vendedores faturáveis" value={`${billableSellers} ativo(s)`} />
        <InfoItem label="Incluídos no plano" value={`${includedSellers} vendedor(es)`} />
        <InfoItem label="Vendedores extras" value={`${extraSellers} x ${formatCurrency(company.finance.extraSeatMonthlyAmount || 0)}`} />
        <InfoItem label="Extra no ciclo" value={formatCurrency(company.finance.extraSeatCycleAmount || 0)} />
      </div>
      {extraSellers > 0 ? (
        <div className={styles.alertWarning}>
          Há {extraSellers} vendedor(es) extra(s). O padrão é cobrar {formatCurrency(company.finance.extraSeatMonthlyAmount || 0)} recorrente por vendedor extra no próximo ciclo. Use desconto manual para exceção permanente ou meses grátis para exceção temporária.
        </div>
      ) : null}
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
          <input value={state.financeSettingsDraft.manualDiscountPercent} onChange={(event) => actions.setFinanceSettingsDraft((current) => current ? { ...current, manualDiscountPercent: event.target.value } : current)} placeholder="Desconto permanente %" />
          <input value={state.financeSettingsDraft.freeMonths} onChange={(event) => actions.setFinanceSettingsDraft((current) => current ? { ...current, freeMonths: event.target.value } : current)} placeholder="Meses grátis temporário" />
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

function MasterUsersPanel({ company, actions }: { company: CompanyDetailPayload["company"]; actions: CommandActions }) {
  const activeSellerUsers = company.users.filter((user) => {
    const role = String(user.role || "").toUpperCase();
    return user.isActive && (role === "USER" || role === "ADMIN");
  });
  const activeAdminUsers = company.users.filter((user) => user.isActive && String(user.role || "").toUpperCase() === "ADMIN");

  return (
    <section className={styles.panelSection}>
      <div className={styles.sectionTitle}>
        <span>Usuários</span>
        <h3>Acesso humano da empresa</h3>
      </div>
      <div className={styles.operationStats}>
        <InfoItem label="Vendedores ativos" value={String(activeSellerUsers.length)} />
        <InfoItem label="Admins ativos" value={String(activeAdminUsers.length)} />
        <InfoItem label="Total de usuários" value={String(company.users.length)} />
      </div>
      {!activeSellerUsers.length ? (
        <div className={styles.alertWarning}>
          O Radar precisa de pelo menos um USER ou ADMIN comum ativo para operar como vendedor. USERMASTER interno não entra nessa conta.
        </div>
      ) : null}
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
        {!company.users.length ? <MasterEmptyState title="Sem usuários cadastrados" description="Crie o primeiro acesso operacional desta empresa." /> : null}
      </div>
    </section>
  );
}

function MasterWebsitePanel({ company, actions, state }: { company: CompanyDetailPayload["company"]; actions: CommandActions; state: CommandState }) {
  return (
    <section className={styles.panelSection}>
      <div className={styles.sectionTitle}>
        <span>Website</span>
        <h3>Presença pública e admin</h3>
      </div>
      <div className={styles.operationStats}>
        <InfoItem label="Público" value={company.website.enabled ? "Ativo" : "Inativo"} />
        <InfoItem label="Admin" value={company.website.adminEnabled ? "Ativo" : "Inativo"} />
        <InfoItem label="URL pública" value={company.website.publicUrl || "-"} />
        <InfoItem label="Projeto" value={company.website.projectId || "-"} />
      </div>
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
    </section>
  );
}

function MasterWhatsAppPanel({
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
  const primaryEndpoint = company.whatsapp.endpoints.find((endpoint) => endpoint.isPrimary);
  return (
    <section className={styles.panelSection}>
      <div className={styles.sectionTitle}>
        <span>WhatsApp</span>
        <h3>Canal oficial, token e endpoints</h3>
      </div>
      <div className={styles.operationStats}>
        <InfoItem label="Modo" value={company.whatsappSituation?.mode || company.whatsappCenter.mode} />
        <InfoItem label="Status atual" value={company.whatsappSituation?.statusLabel || company.whatsappCenter.statusLabel} />
        <InfoItem label="Número" value={company.whatsapp.masterDisplayNumber || company.whatsappCenter.official.displayNumber || primaryEndpoint?.whatsappDisplayNumber || primaryEndpoint?.whatsappNumber || "-"} />
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
    </section>
  );
}

function RadarCommandPanel({ company, actions, state }: { company: CompanyDetailPayload["company"]; actions: CommandActions; state: CommandState }) {
  const usage = company.webscrapingUsage;
  const radarModule = company.modules.find((moduleItem) => moduleItem.key === "webscraping") || company.modules.find((moduleItem) => moduleItem.key === "radar_premium");
  const gerencialModule = company.modules.find((moduleItem) => moduleItem.key === "gerencial");
  const activeSellerUsers = company.users.filter((user) => {
    const role = String(user.role || "").toUpperCase();
    return user.isActive && (role === "USER" || role === "ADMIN");
  });
  const activeAdminUsers = company.users.filter((user) => user.isActive && String(user.role || "").toUpperCase() === "ADMIN");
  const quota = company.commercialCardQuota;
  const reuseRate = Number.isFinite(usage.globalCacheReuseRate) ? `${Math.round(usage.globalCacheReuseRate)}%` : "0%";
  const radarActive = Boolean(radarModule?.enabled);
  const gerencialActive = Boolean(gerencialModule?.enabled);
  const needsSeller = radarActive && activeSellerUsers.length === 0;
  const needsGerencial = false;

  return (
    <section className={styles.panelSection}>
      <div className={styles.sectionTitle}>
        <span>Radar Digital</span>
        <h3>Busca, cache e limite comercial</h3>
      </div>
      <div className={styles.operationStats}>
        <InfoItem label="Radar" value={radarActive ? "Ativo" : "Inativo"} />
        <InfoItem label="Gerencial" value={gerencialActive ? "Ativo" : "Inativo"} />
        <InfoItem label="Vendedores ativos" value={`${activeSellerUsers.length} incl. admin`} />
        <InfoItem label="Admins ativos" value={String(activeAdminUsers.length)} />
        <InfoItem label="Buscas hoje" value={String(usage.searchesToday)} />
        <InfoItem label="Bloqueios hoje" value={String(usage.blockedToday)} />
        <InfoItem label="Reuso cache global" value={reuseRate} />
        <InfoItem label="Cota mensal" value={`${(quota?.monthlyEffective || 0).toLocaleString("pt-BR")} cards`} />
        <InfoItem label="Trava diária" value={`${(quota?.dailyEffective || 0).toLocaleString("pt-BR")} cards`} />
        <InfoItem label="Última busca" value={usage.lastSearchLabel || "-"} />
        <InfoItem label="Último usuário" value={usage.lastSearchUser || "-"} />
      </div>
      {usage.lastAttemptMessage ? <div className={usage.hasBlockedAttempts ? styles.alertDanger : styles.alertInfo}>{usage.lastAttemptMessage}</div> : null}
      {needsSeller || needsGerencial ? (
        <div className={styles.radarFixPanel}>
          <div>
            <span>Diagnóstico Master</span>
            <strong>Radar ativo, mas operação incompleta</strong>
            <p>
              {needsSeller ? "Não existe USER nem ADMIN comum ativo para entrar no rodízio. " : ""}
              {needsGerencial ? "A tela de equipe pode ficar vazia porque /users/company depende do módulo Gerencial. " : ""}
              A conta ADMIN comum agora conta como vendedor; USERMASTER interno continua fora da distribuição.
            </p>
          </div>
          <div className={styles.actionCluster}>
            {needsSeller ? (
              <MasterActionButton onClick={() => actions.setUserModal({
                mode: "create",
                companyId: company.id,
                companyName: company.name,
                email: "",
                username: "",
                name: "Vendedor",
                role: "USER",
                password: "",
              })}>
                Criar vendedor extra
              </MasterActionButton>
            ) : null}
            {needsGerencial && gerencialModule ? (
              <MasterActionButton
                variant="secondary"
                onClick={() => actions.toggleModule(company.id, gerencialModule.key, gerencialModule.enabled)}
                disabled={!companyHasOperationalAccess(company)}
              >
                Liberar Gerencial
              </MasterActionButton>
            ) : null}
          </div>
        </div>
      ) : null}
      {state.cardQuotaDraft ? (
        <div className={styles.inlineForm}>
          <input
            type="number"
            min={0}
            value={state.cardQuotaDraft.monthlyCardLimit}
            onChange={(event) => actions.setCardQuotaDraft((current) => current ? { ...current, monthlyCardLimit: event.target.value } : current)}
            placeholder={`Mensal padrão ${quota?.monthlyDefault || 0}`}
          />
          <input
            type="number"
            min={0}
            value={state.cardQuotaDraft.dailyCardLimit}
            onChange={(event) => actions.setCardQuotaDraft((current) => current ? { ...current, dailyCardLimit: event.target.value } : current)}
            placeholder={`Diário padrão ${quota?.dailyDefault || 0}`}
          />
          <MasterActionButton variant="secondary" onClick={actions.saveCompanyCardQuota} disabled={state.busyAction === `card-quota-${company.id}`}>
            {state.busyAction === `card-quota-${company.id}` ? "Salvando..." : "Salvar cota"}
          </MasterActionButton>
          {radarModule ? (
            <MasterActionButton
              variant={radarModule.enabled ? "danger" : "secondary"}
              onClick={() => actions.toggleModule(company.id, radarModule.key, radarModule.enabled)}
              disabled={!companyHasOperationalAccess(company)}
            >
              {radarModule.enabled ? "Bloquear Radar" : "Liberar Radar"}
            </MasterActionButton>
          ) : null}
          {gerencialModule ? (
            <MasterActionButton
              variant={gerencialModule.enabled ? "ghost" : "secondary"}
              onClick={() => actions.toggleModule(company.id, gerencialModule.key, gerencialModule.enabled)}
              disabled={!companyHasOperationalAccess(company)}
            >
              {gerencialModule.enabled ? "Bloquear Gerencial" : "Liberar Gerencial"}
            </MasterActionButton>
          ) : null}
          <MasterActionButton variant="secondary" onClick={() => { window.location.href = "/bancodedados"; }}>Banco de dados</MasterActionButton>
          <MasterActionButton variant="secondary" onClick={() => { void actions.assumeContext(company).then(() => { window.location.href = "/radar-digital"; }); }}>Abrir Radar</MasterActionButton>
        </div>
      ) : null}
      <p className={styles.helperText}>O admin comum da empresa conta como vendedor incluído. Vendedores acima do limite incluso entram como assento extra recorrente; ajuste desconto permanente ou meses grátis na aba Cobrança quando negociar exceção.</p>
    </section>
  );
}

function MasterIntegrationsPanel({
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
    <>
      <MasterWebsitePanel company={company} actions={actions} state={state} />
      <MasterMercadoPagoPanel workspace={workspace} company={company} actions={actions} state={state} />
      <MasterCompanyConnectionsPanel company={company} actions={actions} state={state} />
    </>
  );
}

function MasterMercadoPagoPanel({
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
        <span>Mercado Pago</span>
        <h3>Cobrança técnica e credenciais</h3>
      </div>
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
    </section>
  );
}

function MasterCompanyConnectionsPanel({ company, actions, state }: { company: CompanyDetailPayload["company"]; actions: CommandActions; state: CommandState }) {
  return (
    <section className={styles.panelSection}>
      <div className={styles.sectionTitle}>
        <span>Integrações</span>
        <h3>AUVO, TagPlus e conexões externas</h3>
      </div>
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
        {!state.companyIntegrations.length ? <MasterEmptyState title="Nenhuma integração carregada" description="Carregue as conexões antes de testar ou sincronizar." /> : null}
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
      <MasterIntegrationsContent state={state} actions={actions} />
    </Modal>
  );
}

function MasterIntegrationsPanelInline({ state, actions }: { state: CommandState; actions: CommandActions }) {
  return (
    <MasterInlinePanel eyebrow="Master" title="Tokens e credenciais">
      <MasterIntegrationsContent state={state} actions={actions} />
    </MasterInlinePanel>
  );
}

function MasterIntegrationsContent({ state, actions }: { state: CommandState; actions: CommandActions }) {
  return (
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
