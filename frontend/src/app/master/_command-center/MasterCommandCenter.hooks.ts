"use client";

import { useCallback, useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/app/_lib/api";
import { dispatchMasterContextChanged } from "@/lib/masterContextEvents";
import { dispatchModulesChanged } from "@/lib/module-events";
import type {
  CompanyDetailPayload,
  CompanyIntegrationConnection,
  CompanySummary,
  CurrentUser,
  IntegrationEditorState,
  IntegrationProviderId,
  MasterIntegrationsDraft,
  MasterMercadoPagoCredential,
  MasterWhatsAppCredential,
  ManualPaymentState,
  ConfirmActionState,
  UserModalState,
  WorkspacePayload,
} from "../master.types";
import type { MasterPlanKey } from "./MasterCommandCenter.types";
import {
  buildHardDeleteConfirmation,
  formatCurrency,
  toDateInputValue,
  toDatetimeLocalValue,
} from "./MasterCommandCenter.utils";

type UseMasterCommandCenterActionsOptions = {
  workspace: WorkspacePayload | null;
  currentUser: CurrentUser | null;
  setWorkspace: Dispatch<SetStateAction<WorkspacePayload | null>>;
  setCurrentUser: Dispatch<SetStateAction<CurrentUser | null>>;
  onReload: (background?: boolean) => Promise<void>;
};

function buildProfileDraft(company: CompanyDetailPayload["company"]) {
  return {
    name: company.name || "",
    primaryContactName: company.primaryContactName || "",
    contactEmail: company.contactEmail || "",
    contactPhone: company.contactPhone || "",
    taxDocument: company.taxDocument || "",
    paymentMethod: company.paymentMethod || "NONE",
    subscriptionStatus: company.subscriptionStatus || "trialing",
    billingProvider: company.billingProvider || "manual",
    premiumAccess: Boolean(company.premiumAccess),
  };
}

function buildWebsiteDraft(company: CompanyDetailPayload["company"]) {
  return {
    websiteEnabled: Boolean(company.website.enabled),
    websitePublicUrl: company.website.publicUrl || "",
    websiteAdminUrl: company.website.adminUrl || "",
    websiteProjectId: company.website.projectId || "",
    websiteAdminEnabled: Boolean(company.website.adminEnabled),
    websiteLaunchMode: company.website.launchMode === "admin" ? "admin" : "public",
  };
}

function buildMercadoPagoDraft(company: CompanyDetailPayload["company"]) {
  return {
    mercadoPagoAccessToken: "",
    status: company.mercadoPago.status || "DISCONNECTED",
    statusError: company.mercadoPago.statusError || null,
    accountEmail: company.mercadoPago.accountEmail || null,
    accountUserId: company.mercadoPago.accountUserId || null,
    lastValidatedAt: company.mercadoPago.lastValidatedAt || null,
    accessTokenConfigured: Boolean(company.mercadoPago.tokenConfigured),
  };
}

function buildFinanceSettingsDraft(company: CompanyDetailPayload["company"]) {
  return {
    billingCycle: company.finance?.billingCycle === "ANNUAL" ? "ANNUAL" : "MONTHLY",
    manualDiscountPercent: String(company.finance?.manualDiscountPercent ?? 0),
    freeMonths: String(company.finance?.freeMonths ?? 0),
  };
}

function buildCardQuotaDraft(company: CompanyDetailPayload["company"]) {
  return {
    monthlyCardLimit: company.commercialCardQuota?.monthlyOverride
      ? String(company.commercialCardQuota.monthlyOverride)
      : "",
    dailyCardLimit: company.commercialCardQuota?.dailyOverride
      ? String(company.commercialCardQuota.dailyOverride)
      : "",
  };
}

function buildWhatsAppMigrationWorkflowDraft(company: CompanyDetailPayload["company"]) {
  const workflowStatus = String(company.whatsappCenter?.migration?.workflowStatus || "").trim().toUpperCase();
  return {
    status:
      workflowStatus === "CONTACTED" || workflowStatus === "RESOLVED"
        ? (workflowStatus as "CONTACTED" | "RESOLVED")
        : "REQUESTED",
    internalNote: company.whatsappCenter?.migration?.internalNote || "",
    lastContactAt: company.whatsappCenter?.migration?.lastContactAt
      ? toDatetimeLocalValue(company.whatsappCenter.migration.lastContactAt)
      : "",
  };
}

function buildMasterIntegrationsDraft(workspace?: WorkspacePayload | null): MasterIntegrationsDraft {
  return {
    mercadoPagoConfigured: Boolean(workspace?.masterIntegrations?.mercadoPagoConfigured),
    whatsappConfigured: Boolean(workspace?.masterIntegrations?.whatsappConfigured),
    annualPlanDiscountPercent: Number(workspace?.masterIntegrations?.annualPlanDiscountPercent || 0) || 0,
    extraSeatMonthlyAmount: Number(workspace?.masterIntegrations?.extraSeatMonthlyAmount || 0) || 0,
    referralDiscountActive: Boolean(workspace?.masterIntegrations?.referralDiscountActive),
    referralDiscountPercent: Number(workspace?.masterIntegrations?.referralDiscountPercent || 0) || 0,
    referralDiscountMode:
      String(workspace?.masterIntegrations?.referralDiscountMode || "").trim().toUpperCase() === "RECURRING"
        ? "RECURRING"
        : "ONCE",
    mercadoPagoLibrary: [...(workspace?.masterIntegrations?.mercadoPagoLibrary || [])],
    whatsappLibrary: [...(workspace?.masterIntegrations?.whatsappLibrary || [])],
  };
}

function createDraftKey(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function buildIntegrationEditor(connection?: CompanyIntegrationConnection | null): IntegrationEditorState {
  return {
    mode: connection ? "edit" : "create",
    connectionId: connection?.id,
    provider: connection?.provider || "AUVO",
    instanceName: connection?.instanceName || "",
    secret: "",
    appKey: "",
    baseUrl: connection?.connectionConfig?.baseUrl || "",
    authMode: connection?.connectionConfig?.authMode || "",
    externalAccountId: connection?.connectionConfig?.externalAccountId || "",
    isActive: connection?.isActive ?? true,
  };
}

function buildCsv(detail: CompanyDetailPayload["company"]) {
  const header = ["id", "competencia", "tipo", "valor", "status", "origem", "metodo", "vencimento", "pagamento", "observacao"];
  const lines = detail.financeHistory.map((entry) => [
    entry.id,
    entry.competence || "",
    entry.entryType,
    String(entry.amount),
    entry.status,
    entry.origin || "",
    entry.paymentMethod || "",
    entry.dueDate || "",
    entry.paidAt || "",
    (entry.observation || "").replace(/[\r\n;]+/g, " "),
  ]);
  return [header, ...lines]
    .map((line) => line.map((cell) => `"${String(cell || "").replace(/"/g, '""')}"`).join(";"))
    .join("\n");
}

function normalizeOperationalHref(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return null;
  const normalized = raw.startsWith("/") ? raw : `/${raw.replace(/^\/+/, "")}`;
  const legacyPrefix = "/" + "dashboard";
  const legacyRoutes: Array<[string, string]> = [
    ["/financeiro", "/pagamento"],
    ["/planos", "/planos"],
    ["/vendas", "/vendas"],
    ["/inbox", "/atendimento"],
    ["/whatsapp", "/atendimento/automacao"],
    ["/website", "/website"],
    ["/webscraping", "/radar-digital"],
    ["/gerencial", "/gerencial"],
    ["/master", "/master"],
  ];
  const cleanHref = normalized.startsWith(`${legacyPrefix}/`)
    ? legacyRoutes.reduce((current, [legacy, clean]) => (
        current.startsWith(`${legacyPrefix}${legacy}`)
          ? `${clean}${current.slice(`${legacyPrefix}${legacy}`.length)}`
          : current
      ), normalized)
    : normalized;
  const allowedRoots = [
    "/atendimento",
    "/gerencial",
    "/master",
    "/pagamento",
    "/planos",
    "/vendas",
    "/radar-digital",
    "/website",
  ];
  return allowedRoots.some((root) => cleanHref === root || cleanHref.startsWith(`${root}/`) || cleanHref.startsWith(`${root}?`))
    ? cleanHref
    : null;
}

function resolveOperationalHref(company: CompanySummary, kind: "finance" | "whatsapp") {
  if (kind === "finance") {
    const accessChip = company.operationalStatus?.statuses.find((chip) => chip.key === "access");
    const paymentChip = company.operationalStatus?.statuses.find((chip) => chip.key === "payment");
    return normalizeOperationalHref(accessChip?.href) || normalizeOperationalHref(paymentChip?.href) || "/pagamento?focus=access";
  }
  const tokenChip = company.operationalStatus?.statuses.find((chip) => chip.key === "token");
  const metaChip = company.operationalStatus?.statuses.find((chip) => chip.key === "meta");
  const webWhatsChip = company.operationalStatus?.statuses.find((chip) => chip.key === "webwhats");
  return normalizeOperationalHref(tokenChip?.href) || normalizeOperationalHref(metaChip?.href) || normalizeOperationalHref(webWhatsChip?.href) || "/atendimento/automacao?tab=connection";
}

function operationalHrefRequiresContext(href: string) {
  return href.startsWith("/") && !href.startsWith("/master");
}

export function useMasterCommandCenterActions({
  workspace,
  currentUser,
  setWorkspace,
  setCurrentUser,
  onReload,
}: UseMasterCommandCenterActionsOptions) {
  const router = useRouter();
  const [detail, setDetail] = useState<CompanyDetailPayload | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [createCompanyOpen, setCreateCompanyOpen] = useState(false);
  const [masterIntegrationsOpen, setMasterIntegrationsOpen] = useState(false);
  const [masterEmailOpen, setMasterEmailOpen] = useState(false);
  const [createCompanyName, setCreateCompanyName] = useState("");
  const [createCompanySlug, setCreateCompanySlug] = useState("");
  const [profileDraft, setProfileDraft] = useState<ReturnType<typeof buildProfileDraft> | null>(null);
  const [websiteDraft, setWebsiteDraft] = useState<ReturnType<typeof buildWebsiteDraft> | null>(null);
  const [mercadoPagoDraft, setMercadoPagoDraft] = useState<ReturnType<typeof buildMercadoPagoDraft> | null>(null);
  const [financeSettingsDraft, setFinanceSettingsDraft] = useState<ReturnType<typeof buildFinanceSettingsDraft> | null>(null);
  const [cardQuotaDraft, setCardQuotaDraft] = useState<ReturnType<typeof buildCardQuotaDraft> | null>(null);
  const [whatsAppMigrationWorkflowDraft, setWhatsAppMigrationWorkflowDraft] = useState<ReturnType<typeof buildWhatsAppMigrationWorkflowDraft> | null>(null);
  const [trialDateDraft, setTrialDateDraft] = useState("");
  const [trialDaysDraft, setTrialDaysDraft] = useState("14");
  const [masterIntegrationsDraft, setMasterIntegrationsDraft] = useState<MasterIntegrationsDraft>(buildMasterIntegrationsDraft(null));
  const [companyIntegrations, setCompanyIntegrations] = useState<CompanyIntegrationConnection[]>([]);
  const [integrationsLoading, setIntegrationsLoading] = useState(false);
  const [integrationsLoadedCompanyId, setIntegrationsLoadedCompanyId] = useState<number | null>(null);
  const [integrationEditor, setIntegrationEditor] = useState<IntegrationEditorState | null>(null);
  const [integrationVisibility, setIntegrationVisibility] = useState<Record<string, boolean>>({});
  const [userModal, setUserModal] = useState<UserModalState | null>(null);
  const [manualPaymentModal, setManualPaymentModal] = useState<ManualPaymentState | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmActionState | null>(null);
  const [confirmActionInput, setConfirmActionInput] = useState("");

  const activeCompany = detail?.company || null;
  const activeContextCompanyId = currentUser?.masterContext?.active ? currentUser.masterContext.companyId : null;
  const activeCompanyInContext = Boolean(activeCompany && activeContextCompanyId === activeCompany.id);

  useEffect(() => {
    setMasterIntegrationsDraft(buildMasterIntegrationsDraft(workspace));
  }, [workspace]);

  const loadDetail = useCallback(async (companyId: number) => {
    setDetailLoading(true);
    setError(null);
    try {
      const payload = await apiFetch<CompanyDetailPayload>(`/modules/master/company/${companyId}/detail`);
      setDetail(payload);
      setProfileDraft(buildProfileDraft(payload.company));
      setWebsiteDraft(buildWebsiteDraft(payload.company));
      setMercadoPagoDraft(buildMercadoPagoDraft(payload.company));
      setFinanceSettingsDraft(buildFinanceSettingsDraft(payload.company));
      setCardQuotaDraft(buildCardQuotaDraft(payload.company));
      setWhatsAppMigrationWorkflowDraft(buildWhatsAppMigrationWorkflowDraft(payload.company));
      setTrialDateDraft(toDateInputValue(payload.company.trialEndsAt));
      setCompanyIntegrations([]);
      setIntegrationsLoadedCompanyId(null);
      setIntegrationEditor(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao abrir detalhes da empresa.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  async function refreshAll(companyId?: number | null) {
    await onReload(true);
    if (companyId) {
      await loadDetail(companyId);
    }
  }

  async function loadCompanyIntegrations(companyId: number) {
    setIntegrationsLoading(true);
    setError(null);
    try {
      const payload = await apiFetch<CompanyIntegrationConnection[]>(`/modules/master/company/${companyId}/integrations`);
      setCompanyIntegrations(payload);
      setIntegrationsLoadedCompanyId(companyId);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar integrações da empresa.");
    } finally {
      setIntegrationsLoading(false);
    }
  }

  async function submitCreateCompany() {
    if (!createCompanyName.trim()) {
      setError("Informe o nome da empresa.");
      return;
    }
    setBusyAction("create-company");
    setError(null);
    try {
      const created = await apiFetch<{ id: number; name: string }>("/companies/master", {
        method: "POST",
        body: JSON.stringify({
          name: createCompanyName.trim(),
          slug: createCompanySlug.trim() || undefined,
        }),
      });
      setCreateCompanyOpen(false);
      setCreateCompanyName("");
      setCreateCompanySlug("");
      setMessage(`Empresa criada: ${created.name}.`);
      await refreshAll(created.id);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao criar empresa.");
    } finally {
      setBusyAction(null);
    }
  }

  async function saveMasterIntegrations() {
    setBusyAction("master-integrations-save");
    setError(null);
    try {
      await apiFetch("/modules/master/global-integrations", {
        method: "PUT",
        body: JSON.stringify({
          mercadoPagoLibrary: masterIntegrationsDraft.mercadoPagoLibrary,
          whatsappLibrary: masterIntegrationsDraft.whatsappLibrary,
        }),
      });
      setMessage("Biblioteca de credenciais do MASTER atualizada.");
      await refreshAll(activeCompany?.id);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao salvar tokens globais.");
    } finally {
      setBusyAction(null);
    }
  }

  async function saveMasterBillingPolicy() {
    setBusyAction("master-billing-policy-save");
    setError(null);
    try {
      await apiFetch("/modules/master/billing-policy", {
        method: "PUT",
        body: JSON.stringify({
          annualPlanDiscountPercent: Number(masterIntegrationsDraft.annualPlanDiscountPercent || 0),
          extraSeatMonthlyAmount: Number(masterIntegrationsDraft.extraSeatMonthlyAmount || 0),
          referralDiscountActive: Boolean(masterIntegrationsDraft.referralDiscountActive),
          referralDiscountPercent: Number(masterIntegrationsDraft.referralDiscountPercent || 0),
          referralDiscountMode:
            String(masterIntegrationsDraft.referralDiscountMode || "").trim().toUpperCase() === "RECURRING"
              ? "RECURRING"
              : "ONCE",
        }),
      });
      setMessage("Política financeira global atualizada.");
      await refreshAll(activeCompany?.id);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao salvar política financeira.");
    } finally {
      setBusyAction(null);
    }
  }

  function addMasterMercadoPagoCredential() {
    setMasterIntegrationsDraft((current) => ({
      ...current,
      mercadoPagoLibrary: [
        {
          key: createDraftKey("mp"),
          label: "Novo token de pagamentos",
          accessToken: "",
          configured: false,
          sourceCompanyId: null,
          sourceCompanyName: "MASTER",
        },
        ...current.mercadoPagoLibrary,
      ],
    }));
  }

  function addMasterWhatsAppCredential() {
    setMasterIntegrationsDraft((current) => ({
      ...current,
      whatsappLibrary: [
        {
          key: createDraftKey("wa"),
          label: "Novo token de WhatsApp",
          accessToken: "",
          phoneNumberId: "",
          wabaId: "",
          whatsappNumber: "",
          displayNumber: "",
          configured: false,
          sourceCompanyId: null,
          sourceCompanyName: "MASTER",
        },
        ...current.whatsappLibrary,
      ],
    }));
  }

  function updateMasterMercadoPagoCredential(credentialKey: string, patch: Partial<MasterMercadoPagoCredential>) {
    setMasterIntegrationsDraft((current) => ({
      ...current,
      mercadoPagoLibrary: current.mercadoPagoLibrary.map((credential) =>
        credential.key === credentialKey ? { ...credential, ...patch } : credential,
      ),
    }));
  }

  function updateMasterWhatsAppCredential(credentialKey: string, patch: Partial<MasterWhatsAppCredential>) {
    setMasterIntegrationsDraft((current) => ({
      ...current,
      whatsappLibrary: current.whatsappLibrary.map((credential) =>
        credential.key === credentialKey ? { ...credential, ...patch } : credential,
      ),
    }));
  }

  function removeMasterMercadoPagoCredential(credentialKey: string) {
    setMasterIntegrationsDraft((current) => ({
      ...current,
      mercadoPagoLibrary: current.mercadoPagoLibrary.filter((credential) => credential.key !== credentialKey),
    }));
  }

  function removeMasterWhatsAppCredential(credentialKey: string) {
    setMasterIntegrationsDraft((current) => ({
      ...current,
      whatsappLibrary: current.whatsappLibrary.filter((credential) => credential.key !== credentialKey),
    }));
  }

  function updateLocalMasterContext(company: CompanySummary) {
    setCurrentUser((current) =>
      current
        ? {
            ...current,
            masterContext: {
              active: true,
              companyId: company.id,
              companyName: company.name,
            },
          }
        : current,
    );
  }

  function companyHasActiveMasterContext(companyId?: number | null) {
    return Boolean(currentUser?.masterContext?.active && currentUser.masterContext.companyId === companyId);
  }

  async function assumeContext(company: CompanySummary) {
    if (companyHasActiveMasterContext(company.id)) return;
    setBusyAction(`context-${company.id}`);
    setError(null);
    try {
      await apiFetch("/master-context/assume", {
        method: "POST",
        headers: { "x-master-route": "/master" },
        body: JSON.stringify({ companyId: company.id, reason: `Operacao no master: ${company.name}` }),
      });
      updateLocalMasterContext(company);
      dispatchMasterContextChanged({ mode: "assumed", companyName: company.name });
      setMessage(`Operação liberada para ${company.name}.`);
      const userPayload = await apiFetch<CurrentUser>("/profile/current-user");
      setCurrentUser(userPayload);
      await onReload(true);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao operar a empresa.");
    } finally {
      setBusyAction(null);
    }
  }

  async function navigateOperational(company: CompanySummary, kind: "finance" | "whatsapp") {
    const href = resolveOperationalHref(company, kind);
    setBusyAction(`navigate-${company.id}-${kind}`);
    setError(null);
    try {
      if (operationalHrefRequiresContext(href) && !companyHasActiveMasterContext(company.id)) {
        await apiFetch("/master-context/assume", {
          method: "POST",
          headers: { "x-master-route": "/master" },
          body: JSON.stringify({ companyId: company.id, reason: `Diagnostico operacional: ${company.name}` }),
        });
        updateLocalMasterContext(company);
        dispatchMasterContextChanged({ mode: "assumed", companyName: company.name });
      }
      router.push(href);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao abrir operação.");
    } finally {
      setBusyAction(null);
    }
  }

  async function exitContext() {
    setBusyAction("context-exit");
    setError(null);
    try {
      await apiFetch("/master-context/exit", {
        method: "POST",
        headers: { "x-master-route": "/master" },
        body: JSON.stringify({ reason: "Saindo do contexto pela central master" }),
      });
      setMessage("Operação MASTER encerrada.");
      const userPayload = await apiFetch<CurrentUser>("/profile/current-user");
      setCurrentUser(userPayload);
      dispatchMasterContextChanged({ mode: "exited", companyName: currentUser?.masterContext?.companyName || null });
      await onReload(true);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao encerrar operação.");
    } finally {
      setBusyAction(null);
    }
  }

  async function runTrialAction(companyId: number, body: Record<string, unknown>, successMessage: string) {
    setBusyAction(`trial-${companyId}`);
    setError(null);
    try {
      await apiFetch(`/modules/master/company/${companyId}/trial`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setMessage(successMessage);
      await refreshAll(companyId);
      dispatchModulesChanged({ reason: "master_trial_changed" });
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao atualizar trial.");
    } finally {
      setBusyAction(null);
    }
  }

  async function completeAssistedSetup(companyId: number) {
    setBusyAction(`assisted-setup-${companyId}`);
    setError(null);
    try {
      await apiFetch(`/modules/master/company/${companyId}/assisted-setup/complete`, {
        method: "POST",
        body: JSON.stringify({ note: "Implantação assistida concluída pelo MASTER." }),
      });
      setMessage("Implantação assistida concluída.");
      await refreshAll(companyId);
      dispatchModulesChanged({ reason: "assisted_setup_completed" });
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao concluir implantação assistida.");
    } finally {
      setBusyAction(null);
    }
  }

  async function setPaymentStatus(companyId: number, paymentStatus: string, successMessage: string) {
    setBusyAction(`payment-${companyId}-${paymentStatus}`);
    setError(null);
    try {
      await apiFetch(`/modules/master/company/${companyId}/payment`, {
        method: "PUT",
        body: JSON.stringify({ paymentStatus }),
      });
      setMessage(successMessage);
      await refreshAll(companyId);
      dispatchModulesChanged({ reason: "master_payment_changed" });
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao atualizar cobrança.");
    } finally {
      setBusyAction(null);
    }
  }

  async function archiveCompany(companyId: number, reason: string) {
    setBusyAction(`archive-${companyId}`);
    setError(null);
    try {
      await apiFetch(`/companies/master/${companyId}/archive`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      setMessage("Empresa arquivada. O acesso foi bloqueado e o histórico foi preservado.");
      await refreshAll(companyId);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao arquivar empresa.");
    } finally {
      setBusyAction(null);
    }
  }

  async function hardDeleteCompany(companyId: number, companyName: string, reason: string) {
    setBusyAction(`delete-${companyId}`);
    setError(null);
    try {
      await apiFetch(`/companies/master/${companyId}`, {
        method: "DELETE",
        body: JSON.stringify({
          confirmText: buildHardDeleteConfirmation(companyName),
          reason,
        }),
      });
      if (currentUser?.masterContext?.active && currentUser.masterContext.companyId === companyId) {
        dispatchMasterContextChanged({ mode: "exited", companyName: currentUser.masterContext.companyName || companyName });
      }
      setDetail(null);
      setMessage("Empresa removida permanentemente.");
      await onReload(true);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao excluir empresa permanentemente.");
    } finally {
      setBusyAction(null);
    }
  }

  function openManualPayment(company: CompanySummary) {
    setManualPaymentModal({
      companyId: company.id,
      companyName: company.name,
      value: String(company.currentOutstandingValue || company.monthlyValue || company.finance?.finalCycleAmount || 0),
      competence: new Date().toISOString().slice(0, 7),
      paidAt: toDatetimeLocalValue(new Date().toISOString()),
      dueDate: toDateInputValue(company.nextDueAt),
      paymentMethod: company.paymentMethod === "NONE" ? "PIX" : company.paymentMethod || "PIX",
      observation: "",
      settlePending: true,
      generateAudit: true,
    });
  }

  async function submitUserModal() {
    if (!userModal) return;
    setBusyAction(`user-${userModal.mode}`);
    setError(null);
    try {
      if (userModal.mode === "create") {
        const payload = await apiFetch<{ temporaryPassword?: string | null }>(`/users/master/company/${userModal.companyId}/create`, {
          method: "POST",
          body: JSON.stringify({
            email: userModal.email.trim().toLowerCase(),
            username: userModal.username.trim() || undefined,
            name: userModal.name.trim() || undefined,
            role: userModal.role,
            password: userModal.password.trim() || undefined,
          }),
        });
        setMessage(payload?.temporaryPassword ? `Usuário criado. Senha temporária: ${payload.temporaryPassword}` : "Usuário criado.");
      } else if (userModal.mode === "edit" && userModal.userId) {
        await apiFetch(`/users/master/${userModal.userId}`, {
          method: "PATCH",
          body: JSON.stringify({
            email: userModal.email.trim().toLowerCase(),
            username: userModal.username.trim(),
            name: userModal.name.trim(),
            role: userModal.role,
          }),
        });
        setMessage("Usuário atualizado.");
      } else if (userModal.mode === "reset" && userModal.userId) {
        const payload = await apiFetch<{ temporaryPassword: string }>(`/users/master/${userModal.userId}/reset-password`, {
          method: "PATCH",
          body: JSON.stringify({ password: userModal.password.trim() || undefined }),
        });
        setMessage(`Senha resetada. Nova senha: ${payload.temporaryPassword}`);
      }
      const companyId = userModal.companyId;
      setUserModal(null);
      await refreshAll(companyId);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao processar usuário.");
    } finally {
      setBusyAction(null);
    }
  }

  async function deleteUser(companyId: number, userId: number, userLabel: string) {
    setBusyAction(`user-delete-${userId}`);
    setError(null);
    try {
      await apiFetch(`/users/master/${userId}/delete`, { method: "PATCH" });
      setMessage(`Usuário removido: ${userLabel}.`);
      await refreshAll(companyId);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao deletar usuário.");
    } finally {
      setBusyAction(null);
    }
  }

  async function submitManualPayment() {
    if (!manualPaymentModal) return;
    setBusyAction("manual-payment");
    setError(null);
    try {
      await apiFetch(`/modules/master/company/${manualPaymentModal.companyId}/manual-payment`, {
        method: "POST",
        body: JSON.stringify({
          value: Number(manualPaymentModal.value.replace(",", ".")),
          competence: manualPaymentModal.competence.trim(),
          paidAt: manualPaymentModal.paidAt ? new Date(manualPaymentModal.paidAt).toISOString() : undefined,
          dueDate: manualPaymentModal.dueDate ? new Date(`${manualPaymentModal.dueDate}T12:00:00`).toISOString() : undefined,
          paymentMethod: manualPaymentModal.paymentMethod,
          observation: manualPaymentModal.observation.trim() || undefined,
          settlePending: manualPaymentModal.settlePending,
          generateAudit: manualPaymentModal.generateAudit,
        }),
      });
      setMessage(`Pagamento manual registrado para ${manualPaymentModal.companyName}.`);
      const companyId = manualPaymentModal.companyId;
      setManualPaymentModal(null);
      await refreshAll(companyId);
      dispatchModulesChanged({ reason: "master_manual_payment" });
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao lançar pagamento manual.");
    } finally {
      setBusyAction(null);
    }
  }

  async function cancelManualPayment(entryId: string) {
    if (!activeCompany) return;
    setBusyAction(`cancel-manual-${entryId}`);
    setError(null);
    try {
      await apiFetch(`/modules/master/company/${activeCompany.id}/manual-payment/${entryId}/cancel`, {
        method: "PUT",
        body: JSON.stringify({ observation: "Cancelado pela central master." }),
      });
      setMessage("Lançamento manual cancelado e preservado no histórico.");
      await refreshAll(activeCompany.id);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao cancelar lançamento manual.");
    } finally {
      setBusyAction(null);
    }
  }

  async function saveProfile() {
    if (!activeCompany || !profileDraft) return;
    setBusyAction(`profile-${activeCompany.id}`);
    setError(null);
    try {
      await apiFetch(`/modules/master/company/${activeCompany.id}/profile`, {
        method: "PUT",
        body: JSON.stringify({
          name: profileDraft.name.trim(),
          primaryContactName: profileDraft.primaryContactName.trim() || undefined,
          contactEmail: profileDraft.contactEmail.trim() || undefined,
          contactPhone: profileDraft.contactPhone.trim() || undefined,
          taxDocument: profileDraft.taxDocument.trim() || undefined,
          paymentMethod: profileDraft.paymentMethod,
          subscriptionStatus: profileDraft.subscriptionStatus,
          billingProvider: profileDraft.billingProvider,
          premiumAccess: profileDraft.premiumAccess,
        }),
      });
      setMessage("Perfil da empresa salvo.");
      await refreshAll(activeCompany.id);
      dispatchModulesChanged({ reason: "master_profile_changed" });
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao salvar perfil.");
    } finally {
      setBusyAction(null);
    }
  }

  async function saveCompanyFinanceSettings() {
    if (!activeCompany || !financeSettingsDraft) return;
    setBusyAction(`finance-settings-${activeCompany.id}`);
    setError(null);
    try {
      await apiFetch(`/modules/master/company/${activeCompany.id}/finance-settings`, {
        method: "PUT",
        body: JSON.stringify({
          billingCycle: financeSettingsDraft.billingCycle,
          manualDiscountPercent: Number(financeSettingsDraft.manualDiscountPercent || 0),
          freeMonths: Number(financeSettingsDraft.freeMonths || 0),
        }),
      });
      setMessage(`Configuração financeira de ${activeCompany.name} atualizada.`);
      await refreshAll(activeCompany.id);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao salvar ajustes financeiros.");
    } finally {
      setBusyAction(null);
    }
  }

  async function setCourtesy(active: boolean, reason?: string, endsAt?: string) {
    if (!activeCompany) return;
    setBusyAction(`courtesy-${activeCompany.id}`);
    setError(null);
    try {
      await apiFetch(`/modules/master/company/${activeCompany.id}/courtesy`, {
        method: "PUT",
        body: JSON.stringify({ active, reason: reason || undefined, endsAt: endsAt || undefined }),
      });
      setMessage(
        active
          ? `Cortesia concedida para ${activeCompany.name}.`
          : `Cortesia encerrada para ${activeCompany.name} — volta a cobrar.`,
      );
      await refreshAll(activeCompany.id);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao atualizar cortesia.");
    } finally {
      setBusyAction(null);
    }
  }

  async function saveCompanyCardQuota() {
    if (!activeCompany || !cardQuotaDraft) return;
    setBusyAction(`card-quota-${activeCompany.id}`);
    setError(null);
    try {
      await apiFetch(`/modules/master/company/${activeCompany.id}/card-quota`, {
        method: "PUT",
        body: JSON.stringify({
          monthlyCardLimit: Math.max(0, Math.trunc(Number(cardQuotaDraft.monthlyCardLimit || 0) || 0)),
          dailyCardLimit: Math.max(0, Math.trunc(Number(cardQuotaDraft.dailyCardLimit || 0) || 0)),
        }),
      });
      setMessage(`Cota de cards de ${activeCompany.name} atualizada.`);
      await refreshAll(activeCompany.id);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao salvar cota de cards.");
    } finally {
      setBusyAction(null);
    }
  }

  async function saveWebsite() {
    if (!activeCompany || !websiteDraft) return;
    setBusyAction(`website-${activeCompany.id}`);
    setError(null);
    try {
      await apiFetch(`/website/master/company/${activeCompany.id}/config`, {
        method: "PATCH",
        body: JSON.stringify({
          websiteEnabled: websiteDraft.websiteEnabled,
          websitePublicUrl: websiteDraft.websitePublicUrl.trim() || undefined,
          websiteAdminUrl: websiteDraft.websiteAdminUrl.trim() || undefined,
          websiteProjectId: websiteDraft.websiteProjectId.trim() || undefined,
          websiteAdminEnabled: websiteDraft.websiteAdminEnabled,
          websiteLaunchMode: websiteDraft.websiteLaunchMode,
        }),
      });
      setMessage("Website salvo.");
      await refreshAll(activeCompany.id);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao salvar website.");
    } finally {
      setBusyAction(null);
    }
  }

  async function toggleModule(companyId: number, moduleKey: string, enabled: boolean) {
    setBusyAction(`module-${companyId}-${moduleKey}`);
    setError(null);
    try {
      await apiFetch(`/modules/master/company/${companyId}`, {
        method: "PUT",
        body: JSON.stringify({ moduleKey, enabled: !enabled }),
      });
      setMessage("Módulo atualizado.");
      await refreshAll(companyId);
      dispatchModulesChanged({ reason: "master_module_changed" });
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao atualizar módulo.");
    } finally {
      setBusyAction(null);
    }
  }

  async function changeCompanyPlan(companyId: number, planKey: MasterPlanKey) {
    setBusyAction(`plan-${companyId}`);
    setError(null);
    try {
      const payload = await apiFetch<{ message?: string | null; warning?: string | null }>(`/modules/master/company/${companyId}/plan`, {
        method: "PUT",
        body: JSON.stringify({ planKey }),
      });
      setMessage(payload.message || "Plano comercial alterado com cobrança e acesso preservados.");
      await refreshAll(companyId);
      dispatchModulesChanged({ reason: "master_plan_changed" });
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao trocar plano comercial.");
    } finally {
      setBusyAction(null);
    }
  }

  async function saveMercadoPagoConfig() {
    if (!activeCompany || !mercadoPagoDraft) return;
    setBusyAction(`mp-save-${activeCompany.id}`);
    setError(null);
    try {
      const payload = await apiFetch<{
        status: string;
        statusError: string | null;
        accountEmail: string | null;
        accountUserId: string | null;
        lastValidatedAt: string | null;
        accessTokenConfigured: boolean;
      }>(`/companies/master/${activeCompany.id}/mercadopago`, {
        method: "PATCH",
        body: JSON.stringify({ mercadoPagoAccessToken: mercadoPagoDraft.mercadoPagoAccessToken.trim() }),
      });
      setMercadoPagoDraft((current) =>
        current
          ? {
              ...current,
              mercadoPagoAccessToken: "",
              status: payload.status,
              statusError: payload.statusError,
              accountEmail: payload.accountEmail,
              accountUserId: payload.accountUserId,
              lastValidatedAt: payload.lastValidatedAt,
              accessTokenConfigured: payload.accessTokenConfigured,
            }
          : current,
      );
      setMessage("Token Mercado Pago salvo.");
      await refreshAll(activeCompany.id);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao salvar token Mercado Pago.");
    } finally {
      setBusyAction(null);
    }
  }

  async function validateMercadoPagoConfig() {
    if (!activeCompany) return;
    setBusyAction(`mp-validate-${activeCompany.id}`);
    setError(null);
    try {
      const payload = await apiFetch<{
        status: string;
        statusError: string | null;
        accountEmail: string | null;
        accountUserId: string | null;
        lastValidatedAt: string | null;
        accessTokenConfigured: boolean;
      }>(`/companies/master/${activeCompany.id}/mercadopago/validate`, { method: "POST" });
      setMercadoPagoDraft((current) =>
        current
          ? {
              ...current,
              status: payload.status,
              statusError: payload.statusError,
              accountEmail: payload.accountEmail,
              accountUserId: payload.accountUserId,
              lastValidatedAt: payload.lastValidatedAt,
              accessTokenConfigured: payload.accessTokenConfigured,
            }
          : current,
      );
      setMessage("Validação Mercado Pago concluída.");
      await refreshAll(activeCompany.id);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao validar Mercado Pago.");
    } finally {
      setBusyAction(null);
    }
  }

  async function saveAndValidateMercadoPagoConfig() {
    if (!activeCompany || !mercadoPagoDraft) return;
    const hasNewToken = Boolean(mercadoPagoDraft.mercadoPagoAccessToken.trim());
    setBusyAction(`mp-save-validate-${activeCompany.id}`);
    setError(null);
    try {
      if (hasNewToken) {
        await apiFetch(`/companies/master/${activeCompany.id}/mercadopago`, {
          method: "PATCH",
          body: JSON.stringify({ mercadoPagoAccessToken: mercadoPagoDraft.mercadoPagoAccessToken.trim() }),
        });
      }
      const payload = await apiFetch<{
        status: string;
        statusError: string | null;
        accountEmail: string | null;
        accountUserId: string | null;
        lastValidatedAt: string | null;
        accessTokenConfigured: boolean;
      }>(`/companies/master/${activeCompany.id}/mercadopago/validate`, { method: "POST" });
      setMercadoPagoDraft((current) =>
        current
          ? {
              ...current,
              mercadoPagoAccessToken: "",
              status: payload.status,
              statusError: payload.statusError,
              accountEmail: payload.accountEmail,
              accountUserId: payload.accountUserId,
              lastValidatedAt: payload.lastValidatedAt,
              accessTokenConfigured: payload.accessTokenConfigured,
            }
          : current,
      );
      setMessage(hasNewToken ? "Token Mercado Pago salvo e validado." : "Validação Mercado Pago concluída.");
      await refreshAll(activeCompany.id);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao salvar e validar Mercado Pago.");
    } finally {
      setBusyAction(null);
    }
  }

  async function validateWhatsAppConfig() {
    if (!activeCompany) return;
    setBusyAction(`whatsapp-validate-${activeCompany.id}`);
    setError(null);
    try {
      await apiFetch(`/companies/master/${activeCompany.id}/whatsapp/validate`, { method: "POST" });
      setMessage("Validação WhatsApp concluída.");
      await refreshAll(activeCompany.id);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao validar WhatsApp.");
    } finally {
      setBusyAction(null);
    }
  }

  async function validateWhatsAppEndpoint(endpointId: string) {
    if (!activeCompany) return;
    setBusyAction(`whatsapp-endpoint-${endpointId}`);
    setError(null);
    try {
      await apiFetch(`/companies/master/${activeCompany.id}/whatsapp-endpoints/${encodeURIComponent(endpointId)}/validate`, {
        method: "POST",
      });
      setMessage("Endpoint WhatsApp validado.");
      await refreshAll(activeCompany.id);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao validar endpoint WhatsApp.");
    } finally {
      setBusyAction(null);
    }
  }

  async function setCompanyMasterTokenUsage(next: {
    useMasterMercadoPagoToken?: boolean;
    useMasterWhatsAppToken?: boolean;
    masterMercadoPagoCredentialKey?: string;
    masterWhatsAppCredentialKey?: string;
  }) {
    if (!activeCompany) return;
    setBusyAction(`master-token-usage-${activeCompany.id}`);
    setError(null);
    try {
      await apiFetch(`/modules/master/company/${activeCompany.id}/global-token-usage`, {
        method: "PUT",
        body: JSON.stringify(next),
      });
      setMessage("Vínculo com token MASTER atualizado.");
      await refreshAll(activeCompany.id);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao atualizar token MASTER.");
    } finally {
      setBusyAction(null);
    }
  }

  async function importActiveCompanyTokensToMaster(clearSource = true) {
    if (!activeCompany) return;
    setBusyAction(`import-master-tokens-${activeCompany.id}`);
    setError(null);
    try {
      await apiFetch(`/modules/master/company/${activeCompany.id}/import-tokens-to-master`, {
        method: "POST",
        body: JSON.stringify({ clearSource }),
      });
      setMessage(`Tokens de ${activeCompany.name} importados para o MASTER.`);
      await refreshAll(activeCompany.id);
      setMasterIntegrationsOpen(false);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao importar tokens.");
    } finally {
      setBusyAction(null);
    }
  }

  async function saveWhatsAppMigrationWorkflow() {
    if (!activeCompany || !whatsAppMigrationWorkflowDraft) return;
    setBusyAction(`whatsapp-migration-${activeCompany.id}`);
    setError(null);
    try {
      await apiFetch(`/companies/master/${activeCompany.id}/whatsapp-migration-workflow`, {
        method: "PATCH",
        body: JSON.stringify({
          status: whatsAppMigrationWorkflowDraft.status,
          internalNote: whatsAppMigrationWorkflowDraft.internalNote.trim() || undefined,
          lastContactAt: whatsAppMigrationWorkflowDraft.lastContactAt
            ? new Date(whatsAppMigrationWorkflowDraft.lastContactAt).toISOString()
            : undefined,
        }),
      });
      setMessage("Workflow interno do WhatsApp atualizado.");
      await refreshAll(activeCompany.id);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao salvar workflow WhatsApp.");
    } finally {
      setBusyAction(null);
    }
  }

  async function launchWebsite(companyId: number, target: "public" | "admin") {
    setBusyAction(`launch-${companyId}-${target}`);
    setError(null);
    try {
      const payload = await apiFetch<{ launchUrl?: string | null; message?: string | null }>(
        `/website/master/company/${companyId}/launch?target=${target}`,
      );
      const launchUrl = String(payload?.launchUrl || "").trim();
      if (!launchUrl) throw new Error(payload?.message || "Website não configurado.");
      window.open(launchUrl, "_blank", "noopener,noreferrer");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao abrir website.");
    } finally {
      setBusyAction(null);
    }
  }

  async function saveCompanyIntegration() {
    if (!activeCompany || !integrationEditor) return;
    const instanceName = integrationEditor.instanceName.trim();
    const secret = integrationEditor.secret.trim();
    const appKey = integrationEditor.appKey.trim();
    const baseUrl = integrationEditor.baseUrl.trim();
    const authMode = integrationEditor.authMode.trim();
    const externalAccountId = integrationEditor.externalAccountId.trim();

    if (!instanceName) {
      setError("Informe o nome da integração.");
      return;
    }
    if (integrationEditor.mode === "create" && !secret) {
      setError("Informe a credencial inicial.");
      return;
    }

    setBusyAction(`integration-save-${activeCompany.id}`);
    setError(null);
    try {
      const payload = {
        provider: integrationEditor.provider,
        instanceName,
        isActive: integrationEditor.isActive,
        ...(secret ? { secret } : {}),
        ...(appKey ? { appKey } : {}),
        baseUrl,
        authMode,
        externalAccountId,
      };
      if (integrationEditor.mode === "create") {
        await apiFetch(`/modules/master/company/${activeCompany.id}/integrations`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setMessage("Conexão de integração criada.");
      } else {
        await apiFetch(`/modules/master/company/${activeCompany.id}/integrations/${integrationEditor.connectionId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        setMessage("Conexão de integração atualizada.");
      }
      setIntegrationEditor(null);
      await loadCompanyIntegrations(activeCompany.id);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao salvar integração.");
    } finally {
      setBusyAction(null);
    }
  }

  async function testCompanyIntegration(connectionId: string) {
    if (!activeCompany) return;
    setBusyAction(`integration-test-${connectionId}`);
    setError(null);
    try {
      const payload = await apiFetch<{ ok: boolean; status: string; message?: string | null }>(
        `/modules/master/company/${activeCompany.id}/integrations/${connectionId}/test`,
        { method: "POST" },
      );
      setMessage(payload.message || `Teste concluído com status ${payload.status}.`);
      await loadCompanyIntegrations(activeCompany.id);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao testar integração.");
    } finally {
      setBusyAction(null);
    }
  }

  async function syncCompanyIntegration(connectionId: string) {
    if (!activeCompany) return;
    setBusyAction(`integration-sync-${connectionId}`);
    setError(null);
    try {
      const payload = await apiFetch<{
        ok: boolean;
        importedCount?: number;
        updatedCount?: number;
        failedCount?: number;
        note?: string | null;
      }>(`/modules/master/company/${activeCompany.id}/integrations/${connectionId}/sync`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setMessage(
        payload.note ||
          `Sync concluído. Importados: ${payload.importedCount || 0}, atualizados: ${payload.updatedCount || 0}, falhas: ${payload.failedCount || 0}.`,
      );
      await loadCompanyIntegrations(activeCompany.id);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao sincronizar integração.");
    } finally {
      setBusyAction(null);
    }
  }

  function openIntegrationEditor(provider: IntegrationProviderId, connection?: CompanyIntegrationConnection | null) {
    const editor = buildIntegrationEditor(connection);
    setIntegrationEditor({ ...editor, provider });
  }

  function exportFinanceCsv() {
    if (!activeCompany) return;
    const csv = buildCsv(activeCompany);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `master-financeiro-${activeCompany.slug || activeCompany.id}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage(`CSV financeiro exportado: ${formatCurrency(activeCompany.financeHistory.reduce((total, entry) => total + Number(entry.amount || 0), 0))} no histórico.`);
  }

  const actions = {
    setWorkspace,
    loadDetail,
    closeCompany: () => setDetail(null),
    refreshAll,
    setMessage,
    setError,
    setCreateCompanyOpen,
    setCreateCompanyName,
    setCreateCompanySlug,
    submitCreateCompany,
    setMasterIntegrationsOpen,
    setMasterEmailOpen,
    setProfileDraft,
    setWebsiteDraft,
    setMercadoPagoDraft,
    setFinanceSettingsDraft,
    setCardQuotaDraft,
    setWhatsAppMigrationWorkflowDraft,
    setTrialDateDraft,
    setTrialDaysDraft,
    setMasterIntegrationsDraft,
    setIntegrationVisibility,
    setIntegrationEditor,
    setUserModal,
    setManualPaymentModal,
    setConfirmAction,
    setConfirmActionInput,
    saveMasterIntegrations,
    saveMasterBillingPolicy,
    addMasterMercadoPagoCredential,
    addMasterWhatsAppCredential,
    updateMasterMercadoPagoCredential,
    updateMasterWhatsAppCredential,
    removeMasterMercadoPagoCredential,
    removeMasterWhatsAppCredential,
    assumeContext,
    navigateOperational,
    exitContext,
    runTrialAction,
    completeAssistedSetup,
    setPaymentStatus,
    archiveCompany,
    hardDeleteCompany,
    openManualPayment,
    submitUserModal,
    deleteUser,
    submitManualPayment,
    cancelManualPayment,
    saveProfile,
    saveCompanyFinanceSettings,
    saveCompanyCardQuota,
    setCourtesy,
    saveWebsite,
    toggleModule,
    changeCompanyPlan,
    saveMercadoPagoConfig,
    validateMercadoPagoConfig,
    saveAndValidateMercadoPagoConfig,
    validateWhatsAppConfig,
    validateWhatsAppEndpoint,
    setCompanyMasterTokenUsage,
    importActiveCompanyTokensToMaster,
    saveWhatsAppMigrationWorkflow,
    launchWebsite,
    loadCompanyIntegrations,
    saveCompanyIntegration,
    testCompanyIntegration,
    syncCompanyIntegration,
    openIntegrationEditor,
    exportFinanceCsv,
    companyHasActiveMasterContext,
  };

  return {
    state: {
      detail,
      activeCompany,
      activeCompanyInContext,
      detailLoading,
      message,
      error,
      busyAction,
      createCompanyOpen,
      createCompanyName,
      createCompanySlug,
      masterIntegrationsOpen,
      masterEmailOpen,
      profileDraft,
      websiteDraft,
      mercadoPagoDraft,
      financeSettingsDraft,
      cardQuotaDraft,
      whatsAppMigrationWorkflowDraft,
      trialDateDraft,
      trialDaysDraft,
      masterIntegrationsDraft,
      companyIntegrations,
      integrationsLoading,
      integrationsLoadedCompanyId,
      integrationEditor,
      integrationVisibility,
      userModal,
      manualPaymentModal,
      confirmAction,
      confirmActionInput,
    },
    actions,
  };
}
