"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "../_lib/api";
import { useRequireAuth } from "../_lib/useRequireAuth";

type CompanyUser = {
  id: number;
  username?: string | null;
  email?: string | null;
  role: string;
  isActive: boolean;
  deactivatedAt?: string | null;
  retentionUntil?: string | null;
};

type CompanyModule = {
  key: string;
  name: string;
  enabled: boolean;
};

type MasterCompany = {
  id: number;
  name: string;
  slug?: string | null;
  primaryContactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  taxDocument?: string | null;
  isActive: boolean;
  paymentStatus: string;
  paymentMethod?: string | null;
  subscriptionStatus?: string | null;
  billingProvider?: string | null;
  premiumAccess?: boolean;
  trialStartsAt?: string | null;
  trialEndsAt?: string | null;
  subscriptionCurrentPeriodStart?: string | null;
  subscriptionCurrentPeriodEnd?: string | null;
  whatsappNumber?: string | null;
  whatsappPhoneNumberId?: string | null;
  whatsappWabaId?: string | null;
  whatsappDisplayNumber?: string | null;
  whatsappStatus?: string | null;
  whatsappStatusError?: string | null;
  whatsappStatusUpdatedAt?: string | null;
  accessTokenConfigured?: boolean;
  accessTokenPreview?: string | null;
  mercadoPagoStatus?: string | null;
  mercadoPagoStatusError?: string | null;
  mercadoPagoStatusUpdatedAt?: string | null;
  mercadoPagoAccountEmail?: string | null;
  mercadoPagoUserId?: string | null;
  mercadoPagoTokenConfigured?: boolean;
  mercadoPagoTokenPreview?: string | null;
  users: CompanyUser[];
  modules: CompanyModule[];
  whatsappEndpoints?: MasterCompanyWhatsAppEndpoint[];
};

type MasterCompanyWhatsAppEndpoint = {
  id: string;
  label?: string | null;
  moduleKey?: string | null;
  whatsappNumber?: string | null;
  whatsappPhoneNumberId?: string | null;
  whatsappWabaId?: string | null;
  whatsappDisplayNumber?: string | null;
  whatsappStatus?: string | null;
  whatsappStatusError?: string | null;
  whatsappStatusUpdatedAt?: string | null;
  accessTokenConfigured?: boolean;
  accessTokenPreview?: string | null;
  isActive?: boolean;
  isPrimary?: boolean;
};

type CompanyWhatsAppEndpointDraft = {
  clientKey: string;
  id: string | null;
  label: string;
  moduleKey: string;
  whatsappNumber: string;
  whatsappPhoneNumberId: string;
  whatsappWabaId: string;
  whatsappAccessToken: string;
  status: string;
  connected: boolean;
  displayNumber: string | null;
  statusError: string | null;
  lastValidatedAt: string | null;
  accessTokenConfigured: boolean;
  accessTokenPreview: string | null;
  isActive: boolean;
  isPrimary: boolean;
};

type CompanyWhatsAppDraft = {
  endpoints: CompanyWhatsAppEndpointDraft[];
};

type MasterCompanyWhatsAppEndpointsPayload = {
  companyId: number;
  endpoints: MasterCompanyWhatsAppEndpoint[];
};

type CompanyMercadoPagoDraft = {
  mercadoPagoAccessToken: string;
  status: string;
  statusError: string | null;
  accountEmail: string | null;
  accountUserId: string | null;
  lastValidatedAt: string | null;
  accessTokenConfigured: boolean;
  accessTokenPreview: string | null;
};

type MasterCompanyMercadoPagoPayload = {
  companyId: number;
  accessTokenConfigured: boolean;
  accessTokenPreview: string | null;
  status: string;
  statusError: string | null;
  accountEmail: string | null;
  accountUserId: string | null;
  lastValidatedAt: string | null;
};

type CompanyProfileDraft = {
  name: string;
  primaryContactName: string;
  contactEmail: string;
  contactPhone: string;
  taxDocument: string;
  paymentMethod: string;
  subscriptionStatus: string;
  billingProvider: string;
  premiumAccess: boolean;
};

type UserRole = "USER" | "ADMIN" | "GERENTE";

type UserModalState = {
  mode: "create" | "edit" | "reset";
  companyId: number;
  userId?: number;
  userLabel?: string;
  email: string;
  username: string;
  role: UserRole;
  password: string;
};

type DeleteUserModalState = {
  companyId: number;
  userId: number;
  userLabel: string;
};

type DeleteCompanyModalState = {
  companyId: number;
  companyName: string;
  confirmationText: string;
};

function createWhatsAppEndpointClientKey(prefix = "wa-endpoint") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createEmptyWhatsAppEndpointDraft(moduleKey = ""): CompanyWhatsAppEndpointDraft {
  return {
    clientKey: createWhatsAppEndpointClientKey(),
    id: null,
    label: "",
    moduleKey,
    whatsappNumber: "",
    whatsappPhoneNumberId: "",
    whatsappWabaId: "",
    whatsappAccessToken: "",
    status: "DISCONNECTED",
    connected: false,
    displayNumber: null,
    statusError: null,
    lastValidatedAt: null,
    accessTokenConfigured: false,
    accessTokenPreview: null,
    isActive: true,
    isPrimary: false,
  };
}

function buildWhatsAppEndpointDraftFromCompanyEndpoint(
  endpoint: MasterCompanyWhatsAppEndpoint,
): CompanyWhatsAppEndpointDraft {
  return {
    clientKey: endpoint.id || createWhatsAppEndpointClientKey("wa-existing"),
    id: endpoint.id || null,
    label: String(endpoint.label || ""),
    moduleKey: String(endpoint.moduleKey || ""),
    whatsappNumber: String(endpoint.whatsappNumber || ""),
    whatsappPhoneNumberId: String(endpoint.whatsappPhoneNumberId || ""),
    whatsappWabaId: String(endpoint.whatsappWabaId || ""),
    whatsappAccessToken: "",
    status: String(endpoint.whatsappStatus || "DISCONNECTED"),
    connected: String(endpoint.whatsappStatus || "").toUpperCase() === "CONNECTED",
    displayNumber: endpoint.whatsappDisplayNumber || null,
    statusError: endpoint.whatsappStatusError || null,
    lastValidatedAt: endpoint.whatsappStatusUpdatedAt || null,
    accessTokenConfigured: Boolean(endpoint.accessTokenConfigured),
    accessTokenPreview: endpoint.accessTokenPreview || null,
    isActive: endpoint.isActive !== false,
    isPrimary: Boolean(endpoint.isPrimary),
  };
}

function buildWhatsAppDraftFromCompany(company: MasterCompany): CompanyWhatsAppDraft {
  const endpoints = Array.isArray(company.whatsappEndpoints) ? company.whatsappEndpoints : [];
  const normalizedEndpoints = endpoints.length
    ? endpoints.map(buildWhatsAppEndpointDraftFromCompanyEndpoint)
    : company.whatsappPhoneNumberId || company.whatsappNumber || company.whatsappWabaId
      ? [
          {
            ...createEmptyWhatsAppEndpointDraft(
              company.modules.find((module) => module.enabled)?.key || "",
            ),
            label: "Numero principal legado",
            moduleKey: company.modules.find((module) => module.enabled)?.key || "",
            whatsappNumber: String(company.whatsappNumber || ""),
            whatsappPhoneNumberId: String(company.whatsappPhoneNumberId || ""),
            whatsappWabaId: String(company.whatsappWabaId || ""),
            status: String(company.whatsappStatus || "DISCONNECTED"),
            connected: String(company.whatsappStatus || "").toUpperCase() === "CONNECTED",
            displayNumber: company.whatsappDisplayNumber || null,
            statusError: company.whatsappStatusError || null,
            lastValidatedAt: company.whatsappStatusUpdatedAt || null,
            accessTokenConfigured: Boolean(company.accessTokenConfigured),
            accessTokenPreview: company.accessTokenPreview || null,
            isPrimary: true,
          },
        ]
      : [];

  if (normalizedEndpoints.length && !normalizedEndpoints.some((endpoint) => endpoint.isPrimary)) {
    normalizedEndpoints[0] = {
      ...normalizedEndpoints[0],
      isPrimary: true,
    };
  }

  return {
    endpoints: normalizedEndpoints,
  };
}

function buildMercadoPagoDraftFromCompany(company: MasterCompany): CompanyMercadoPagoDraft {
  return {
    mercadoPagoAccessToken: "",
    status: String(company.mercadoPagoStatus || "DISCONNECTED"),
    statusError: company.mercadoPagoStatusError || null,
    accountEmail: company.mercadoPagoAccountEmail || null,
    accountUserId: company.mercadoPagoUserId || null,
    lastValidatedAt: company.mercadoPagoStatusUpdatedAt || null,
    accessTokenConfigured: Boolean(company.mercadoPagoTokenConfigured),
    accessTokenPreview: company.mercadoPagoTokenPreview || null,
  };
}

function buildMercadoPagoDraftFromPayload(
  payload: MasterCompanyMercadoPagoPayload,
): CompanyMercadoPagoDraft {
  return {
    mercadoPagoAccessToken: "",
    status: String(payload.status || "DISCONNECTED"),
    statusError: payload.statusError || null,
    accountEmail: payload.accountEmail || null,
    accountUserId: payload.accountUserId || null,
    lastValidatedAt: payload.lastValidatedAt || null,
    accessTokenConfigured: Boolean(payload.accessTokenConfigured),
    accessTokenPreview: payload.accessTokenPreview || null,
  };
}

function buildCompanyProfileDraftFromCompany(company: MasterCompany): CompanyProfileDraft {
  return {
    name: String(company.name || ""),
    primaryContactName: String(company.primaryContactName || ""),
    contactEmail: String(company.contactEmail || ""),
    contactPhone: String(company.contactPhone || ""),
    taxDocument: String(company.taxDocument || ""),
    paymentMethod: String(company.paymentMethod || "NONE"),
    subscriptionStatus: String(company.subscriptionStatus || "trialing"),
    billingProvider: String(company.billingProvider || "manual"),
    premiumAccess: Boolean(company.premiumAccess),
  };
}

function formatTrialCountdown(targetDate?: string | null) {
  const iso = String(targetDate || "").trim();
  if (!iso) return "Trial sem data";
  const endsAt = new Date(iso);
  if (Number.isNaN(endsAt.getTime())) return "Trial sem data";
  const diffMs = endsAt.getTime() - Date.now();
  if (diffMs <= 0) return "Trial expirado";
  const totalMinutes = Math.floor(diffMs / (1000 * 60));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `Trial expira em ${days} dia${days === 1 ? "" : "s"}`;
  if (hours > 0) return `Trial expira em ${hours} hora${hours === 1 ? "" : "s"}`;
  return `Trial expira em ${Math.max(1, minutes)} min`;
}

function mapSubscriptionStatusLabel(statusRaw?: string | null) {
  const status = String(statusRaw || "").trim().toLowerCase();
  if (status === "trialing") return "Trial";
  if (status === "active") return "Ativa";
  if (status === "past_due") return "Em atraso";
  if (status === "canceled") return "Cancelada";
  if (status === "expired") return "Expirada";
  return status ? status : "-";
}

function mapPaymentMethodLabel(methodRaw?: string | null) {
  const method = String(methodRaw || "").trim().toUpperCase();
  if (method === "CARD") return "Cartao";
  if (method === "PIX") return "Pix";
  if (method === "BOLETO") return "Boleto";
  if (method === "MANUAL") return "Manual";
  return "Nao definido";
}

export default function MasterClientPage() {
  const hasToken = useRequireAuth();
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companies, setCompanies] = useState<MasterCompany[]>([]);
  const [companyProfileDrafts, setCompanyProfileDrafts] = useState<Record<number, CompanyProfileDraft>>({});
  const [whatsAppDrafts, setWhatsAppDrafts] = useState<Record<number, CompanyWhatsAppDraft>>({});
  const [mercadoPagoDrafts, setMercadoPagoDrafts] = useState<
    Record<number, CompanyMercadoPagoDraft>
  >({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);
  const [createCompanyModalOpen, setCreateCompanyModalOpen] = useState(false);
  const [createCompanyName, setCreateCompanyName] = useState("");
  const [createCompanySlug, setCreateCompanySlug] = useState("");
  const [createCompanyModalError, setCreateCompanyModalError] = useState<string | null>(null);
  // Master UI guideline: avoid native browser prompt/confirm; always use in-app modals.
  const [userModal, setUserModal] = useState<UserModalState | null>(null);
  const [userModalError, setUserModalError] = useState<string | null>(null);
  const [deleteUserModal, setDeleteUserModal] = useState<DeleteUserModalState | null>(null);
  const [deleteUserModalError, setDeleteUserModalError] = useState<string | null>(null);
  const [deleteCompanyModal, setDeleteCompanyModal] = useState<DeleteCompanyModalState | null>(null);
  const [deleteCompanyModalError, setDeleteCompanyModalError] = useState<string | null>(null);

  async function load(options?: { background?: boolean }) {
    const background = Boolean(options?.background);
    setError(null);
    setActionInfo(null);
    if (background) {
      setRefreshing(true);
    } else {
      setInitialLoading(true);
    }
    try {
      const payload = await apiFetch<MasterCompany[]>("/modules/master/companies");
      setCompanies(payload || []);
      setCompanyProfileDrafts(() => {
        const next: Record<number, CompanyProfileDraft> = {};
        for (const company of payload || []) {
          next[company.id] = buildCompanyProfileDraftFromCompany(company);
        }
        return next;
      });
      setWhatsAppDrafts(() => {
        const next: Record<number, CompanyWhatsAppDraft> = {};
        for (const company of payload || []) {
          next[company.id] = buildWhatsAppDraftFromCompany(company);
        }
        return next;
      });
      setMercadoPagoDrafts(() => {
        const next: Record<number, CompanyMercadoPagoDraft> = {};
        for (const company of payload || []) {
          next[company.id] = buildMercadoPagoDraftFromCompany(company);
        }
        return next;
      });
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Falha ao carregar painel master.";
      setError(message);
    } finally {
      if (background) {
        setRefreshing(false);
      } else {
        setInitialLoading(false);
      }
    }
  }

  useEffect(() => {
    if (hasToken !== true) return;
    load();
  }, [hasToken]);

  useEffect(() => {
    if (!createCompanyModalOpen && !userModal && !deleteUserModal && !deleteCompanyModal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (deleteCompanyModal) {
        closeDeleteCompanyModal();
        return;
      }
      if (deleteUserModal) {
        closeDeleteUserModal();
        return;
      }
      if (userModal) {
        closeUserModal();
        return;
      }
      closeCreateCompanyModal();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [createCompanyModalOpen, userModal, deleteUserModal, deleteCompanyModal, busyKey]);

  const companySummary = useMemo(() => {
    const total = companies.length;
    const paid = companies.filter((company) => String(company.paymentStatus || "").toUpperCase() === "PAID").length;
    const trialing = companies.filter(
      (company) => String(company.subscriptionStatus || "").toLowerCase() === "trialing",
    ).length;
    const expired = companies.filter(
      (company) => String(company.subscriptionStatus || "").toLowerCase() === "expired",
    ).length;
    const overdue = companies.filter(
      (company) =>
        ["OVERDUE", "PENDING"].includes(String(company.paymentStatus || "").toUpperCase()) ||
        String(company.subscriptionStatus || "").toLowerCase() === "past_due",
    ).length;
    return { total, paid, trialing, expired, overdue };
  }, [companies]);

  function updateCompanyProfileDraftField(
    companyId: number,
    field: keyof CompanyProfileDraft,
    value: string | boolean,
  ) {
    setCompanyProfileDrafts((current) => ({
      ...current,
      [companyId]: {
        ...(current[companyId] || {
          name: "",
          primaryContactName: "",
          contactEmail: "",
          contactPhone: "",
          taxDocument: "",
          paymentMethod: "NONE",
          subscriptionStatus: "trialing",
          billingProvider: "manual",
          premiumAccess: false,
        }),
        [field]: value,
      },
    }));
  }

  function getDefaultWhatsAppModuleKey(companyId: number) {
    const company = companies.find((item) => item.id === companyId);
    return company?.modules.find((module) => module.enabled)?.key || "";
  }

  function ensureWhatsAppPrimary(endpoints: CompanyWhatsAppEndpointDraft[]) {
    if (!endpoints.length) return endpoints;
    if (endpoints.some((endpoint) => endpoint.isPrimary)) return endpoints;
    return endpoints.map((endpoint, index) => ({
      ...endpoint,
      isPrimary: index === 0,
    }));
  }

  function updateWhatsAppEndpointDraftField(
    companyId: number,
    clientKey: string,
    field:
      | "label"
      | "moduleKey"
      | "whatsappNumber"
      | "whatsappPhoneNumberId"
      | "whatsappWabaId"
      | "whatsappAccessToken",
    value: string,
  ) {
    setWhatsAppDrafts((current) => {
      const base = current[companyId] || {
        endpoints: [createEmptyWhatsAppEndpointDraft(getDefaultWhatsAppModuleKey(companyId))],
      };
      return {
        ...current,
        [companyId]: {
          endpoints: ensureWhatsAppPrimary(
            base.endpoints.map((endpoint) =>
              endpoint.clientKey === clientKey ? { ...endpoint, [field]: value } : endpoint,
            ),
          ),
        },
      };
    });
  }

  function updateWhatsAppEndpointFlag(
    companyId: number,
    clientKey: string,
    field: "isActive" | "isPrimary",
    value: boolean,
  ) {
    setWhatsAppDrafts((current) => {
      const base = current[companyId] || {
        endpoints: [createEmptyWhatsAppEndpointDraft(getDefaultWhatsAppModuleKey(companyId))],
      };
      const updated =
        field === "isPrimary" && value
          ? base.endpoints.map((endpoint) => ({
              ...endpoint,
              isPrimary: endpoint.clientKey === clientKey,
            }))
          : base.endpoints.map((endpoint) =>
              endpoint.clientKey === clientKey ? { ...endpoint, [field]: value } : endpoint,
            );
      return {
        ...current,
        [companyId]: {
          endpoints: ensureWhatsAppPrimary(updated),
        },
      };
    });
  }

  function addWhatsAppEndpointDraft(companyId: number) {
    setWhatsAppDrafts((current) => {
      const base = current[companyId] || { endpoints: [] };
      const nextEndpoints = [
        ...base.endpoints,
        createEmptyWhatsAppEndpointDraft(getDefaultWhatsAppModuleKey(companyId)),
      ];
      return {
        ...current,
        [companyId]: {
          endpoints: ensureWhatsAppPrimary(nextEndpoints),
        },
      };
    });
  }

  function removeWhatsAppEndpointDraft(companyId: number, clientKey: string) {
    setWhatsAppDrafts((current) => {
      const base = current[companyId] || { endpoints: [] };
      const nextEndpoints = base.endpoints.filter((endpoint) => endpoint.clientKey !== clientKey);
      return {
        ...current,
        [companyId]: {
          endpoints: ensureWhatsAppPrimary(nextEndpoints),
        },
      };
    });
  }

  function updateMercadoPagoDraftField(
    companyId: number,
    field: "mercadoPagoAccessToken",
    value: string,
  ) {
    setMercadoPagoDrafts((current) => ({
      ...current,
      [companyId]: {
        ...(current[companyId] || {
          mercadoPagoAccessToken: "",
          status: "DISCONNECTED",
          statusError: null,
          accountEmail: null,
          accountUserId: null,
          lastValidatedAt: null,
          accessTokenConfigured: false,
          accessTokenPreview: null,
        }),
        [field]: value,
      },
    }));
  }

  function openCreateCompanyModal() {
    setCreateCompanyName("");
    setCreateCompanySlug("");
    setCreateCompanyModalError(null);
    setCreateCompanyModalOpen(true);
  }

  function closeCreateCompanyModal() {
    if (busyKey === "create-company") return;
    setCreateCompanyModalError(null);
    setCreateCompanyModalOpen(false);
  }

  async function createCompany() {
    const name = createCompanyName.trim();
    if (!name) {
      setCreateCompanyModalError("Informe o nome da empresa.");
      return;
    }
    const key = "create-company";
    setBusyKey(key);
    setCreateCompanyModalError(null);
    setError(null);
    try {
      const created = await apiFetch<{ id: number; name: string; slug: string | null }>("/companies/master", {
        method: "POST",
        body: JSON.stringify({
          name,
          slug: createCompanySlug.trim() || undefined,
        }),
      });
      setActionInfo(`Empresa criada: #${created.id} - ${created.name} (${created.slug || "-"})`);
      setCreateCompanyModalOpen(false);
      await load({ background: true });
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : "Falha ao criar empresa.";
      setCreateCompanyModalError(message);
    } finally {
      setBusyKey(null);
    }
  }

  async function saveWhatsAppConfig(companyId: number) {
    const draft = whatsAppDrafts[companyId];
    if (!draft) return;
    const endpoints = draft.endpoints
      .map((endpoint, index) => ({
        ...endpoint,
        sortOrder: index,
      }))
      .filter(
        (endpoint) =>
          endpoint.id ||
          endpoint.label.trim() ||
          endpoint.moduleKey.trim() ||
          endpoint.whatsappNumber.trim() ||
          endpoint.whatsappPhoneNumberId.trim() ||
          endpoint.whatsappWabaId.trim() ||
          endpoint.whatsappAccessToken.trim(),
      );

    const key = `save-wa-${companyId}`;
    setBusyKey(key);
    setError(null);
    try {
      const missingModule = endpoints.find((endpoint) => !endpoint.moduleKey.trim());
      if (missingModule) {
        throw new Error("Selecione um modulo ativo para cada numero cadastrado.");
      }
      await apiFetch<MasterCompanyWhatsAppEndpointsPayload>(
        `/companies/master/${companyId}/whatsapp-endpoints`,
        {
          method: "PUT",
          body: JSON.stringify({
            endpoints: endpoints.map((endpoint) => ({
              id: endpoint.id || undefined,
              label: endpoint.label.trim() || undefined,
              moduleKey: endpoint.moduleKey.trim() || undefined,
              whatsappNumber: endpoint.whatsappNumber.trim() || undefined,
              whatsappPhoneNumberId: endpoint.whatsappPhoneNumberId.trim() || undefined,
              whatsappWabaId: endpoint.whatsappWabaId.trim() || undefined,
              whatsappAccessToken: endpoint.whatsappAccessToken.trim() || undefined,
              isActive: endpoint.isActive,
              isPrimary: endpoint.isPrimary,
            })),
          }),
        },
      );
      setActionInfo(
        endpoints.length
          ? `Numeros WhatsApp salvos para empresa #${companyId}.`
          : `Configuracao WhatsApp removida da empresa #${companyId}.`,
      );
      await load({ background: true });
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : "Falha ao salvar configuracao WhatsApp.";
      setError(message);
    } finally {
      setBusyKey(null);
    }
  }

  async function validateWhatsAppEndpoint(
    companyId: number,
    endpoint: CompanyWhatsAppEndpointDraft,
  ) {
    if (!endpoint.id) {
      setError("Salve o numero antes de validar as credenciais.");
      return;
    }

    const key = `validate-wa-${companyId}-${endpoint.clientKey}`;
    setBusyKey(key);
    setError(null);
    try {
      await apiFetch<MasterCompanyWhatsAppEndpointsPayload>(
        `/companies/master/${companyId}/whatsapp-endpoints/${endpoint.id}/validate`,
        {
          method: "POST",
        },
      );
      setActionInfo(`Validacao WhatsApp executada para empresa #${companyId}.`);
      await load({ background: true });
    } catch (actionError) {
      const message =
        actionError instanceof Error ? actionError.message : "Falha ao validar configuracao WhatsApp.";
      setError(message);
    } finally {
      setBusyKey(null);
    }
  }

  async function saveCompanyProfile(companyId: number) {
    const draft = companyProfileDrafts[companyId];
    if (!draft) return;

    const key = `save-profile-${companyId}`;
    setBusyKey(key);
    setError(null);
    try {
      await apiFetch(`/modules/master/company/${companyId}/profile`, {
        method: "PUT",
        body: JSON.stringify({
          name: draft.name.trim(),
          primaryContactName: draft.primaryContactName.trim() || undefined,
          contactEmail: draft.contactEmail.trim() || undefined,
          contactPhone: draft.contactPhone.trim() || undefined,
          taxDocument: draft.taxDocument.trim() || undefined,
          paymentMethod: draft.paymentMethod,
          subscriptionStatus: draft.subscriptionStatus,
          billingProvider: draft.billingProvider,
          premiumAccess: draft.premiumAccess,
        }),
      });
      setActionInfo(`Perfil SaaS salvo para empresa #${companyId}.`);
      await load({ background: true });
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : "Falha ao salvar perfil SaaS.";
      setError(message);
    } finally {
      setBusyKey(null);
    }
  }

  async function saveMercadoPagoConfig(companyId: number) {
    const draft = mercadoPagoDrafts[companyId];
    if (!draft) return;

    const key = `save-mp-${companyId}`;
    setBusyKey(key);
    setError(null);
    try {
      const payload = await apiFetch<MasterCompanyMercadoPagoPayload>(
        `/companies/master/${companyId}/mercadopago`,
        {
          method: "PATCH",
          body: JSON.stringify({
            mercadoPagoAccessToken: draft.mercadoPagoAccessToken.trim(),
          }),
        },
      );
      setMercadoPagoDrafts((current) => ({
        ...current,
        [companyId]: buildMercadoPagoDraftFromPayload(payload),
      }));
      setActionInfo(`Token Mercado Pago salvo para empresa #${companyId}.`);
      await load({ background: true });
    } catch (actionError) {
      const message =
        actionError instanceof Error ? actionError.message : "Falha ao salvar token Mercado Pago.";
      setError(message);
    } finally {
      setBusyKey(null);
    }
  }

  async function validateMercadoPagoConfig(companyId: number) {
    const key = `validate-mp-${companyId}`;
    setBusyKey(key);
    setError(null);
    try {
      const payload = await apiFetch<MasterCompanyMercadoPagoPayload>(
        `/companies/master/${companyId}/mercadopago/validate`,
        {
          method: "POST",
        },
      );
      setMercadoPagoDrafts((current) => ({
        ...current,
        [companyId]: buildMercadoPagoDraftFromPayload(payload),
      }));
      setActionInfo(`Validação Mercado Pago executada para empresa #${companyId}.`);
      await load({ background: true });
    } catch (actionError) {
      const message =
        actionError instanceof Error ? actionError.message : "Falha ao validar token Mercado Pago.";
      setError(message);
    } finally {
      setBusyKey(null);
    }
  }

  async function toggleModule(companyId: number, moduleKey: string, enabled: boolean) {
    const key = `mod-${companyId}-${moduleKey}`;
    setBusyKey(key);
    setError(null);
    try {
      await apiFetch(`/modules/master/company/${companyId}`, {
        method: "PUT",
        body: JSON.stringify({ moduleKey, enabled: !enabled }),
      });
      await load({ background: true });
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : "Falha ao atualizar modulo.";
      setError(message);
    } finally {
      setBusyKey(null);
    }
  }

  async function grantTrial(companyId: number) {
    const key = `trial-${companyId}`;
    setBusyKey(key);
    setError(null);
    try {
      await apiFetch(`/modules/master/company/${companyId}/trial`, {
        method: "POST",
        body: JSON.stringify({ days: 30 }),
      });
      await load({ background: true });
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : "Falha ao liberar trial.";
      setError(message);
    } finally {
      setBusyKey(null);
    }
  }

  async function setPaymentStatus(companyId: number, paymentStatus: string) {
    const key = `pay-${companyId}`;
    setBusyKey(key);
    setError(null);
    try {
      await apiFetch(`/modules/master/company/${companyId}/payment`, {
        method: "PUT",
        body: JSON.stringify({ paymentStatus }),
      });
      await load({ background: true });
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : "Falha ao atualizar pagamento.";
      setError(message);
    } finally {
      setBusyKey(null);
    }
  }

  async function deleteUser(companyId: number, userId: number) {
    const key = `del-user-${companyId}-${userId}`;
    setBusyKey(key);
    setDeleteUserModalError(null);
    setError(null);
    try {
      await apiFetch(`/users/master/${userId}/delete`, { method: "PATCH" });
      setActionInfo("Usuário removido imediatamente pelo MASTER.");
      setDeleteUserModal(null);
      await load({ background: true });
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : "Falha ao remover usuário.";
      setDeleteUserModalError(message);
    } finally {
      setBusyKey(null);
    }
  }

  function openDeleteCompanyModal(company: MasterCompany) {
    setDeleteCompanyModalError(null);
    setDeleteCompanyModal({
      companyId: company.id,
      companyName: company.name,
      confirmationText: "",
    });
  }

  function closeDeleteCompanyModal() {
    if (busyKey && busyKey.startsWith("delete-company-")) return;
    setDeleteCompanyModalError(null);
    setDeleteCompanyModal(null);
  }

  async function confirmDeleteCompanyModal() {
    if (!deleteCompanyModal) return;

    const expected = deleteCompanyModal.companyName.trim();
    const received = deleteCompanyModal.confirmationText.trim();
    if (!received) {
      setDeleteCompanyModalError("Digite o nome da empresa para confirmar.");
      return;
    }
    if (received !== expected) {
      setDeleteCompanyModalError("O nome digitado não confere com a empresa selecionada.");
      return;
    }

    const key = `delete-company-${deleteCompanyModal.companyId}`;
    setBusyKey(key);
    setDeleteCompanyModalError(null);
    setError(null);
    try {
      const payload = await apiFetch<{ deletedCompany?: { id: number; name: string } }>(
        `/companies/master/${deleteCompanyModal.companyId}`,
        { method: "DELETE" },
      );
      const deletedLabel = payload?.deletedCompany?.name || expected;
      setActionInfo(`Empresa excluída permanentemente: ${deletedLabel}.`);
      setDeleteCompanyModal(null);
      await load({ background: true });
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : "Falha ao excluir empresa.";
      setDeleteCompanyModalError(message);
    } finally {
      setBusyKey(null);
    }
  }

  function openCreateUserModal(companyId: number) {
    setUserModalError(null);
    setUserModal({
      mode: "create",
      companyId,
      email: "",
      username: "",
      role: "USER",
      password: "",
    });
  }

  function openEditUserModal(companyId: number, user: CompanyUser) {
    setUserModalError(null);
    const role = String(user.role || "USER").trim().toUpperCase();
    setUserModal({
      mode: "edit",
      companyId,
      userId: user.id,
      userLabel: user.username || user.email || `#${user.id}`,
      email: String(user.email || ""),
      username: String(user.username || ""),
      role: role === "ADMIN" || role === "GERENTE" ? (role as UserRole) : "USER",
      password: "",
    });
  }

  function openResetPasswordModal(companyId: number, user: CompanyUser) {
    setUserModalError(null);
    setUserModal({
      mode: "reset",
      companyId,
      userId: user.id,
      userLabel: user.username || user.email || `#${user.id}`,
      email: "",
      username: "",
      role: "USER",
      password: "",
    });
  }

  function closeUserModal() {
    if (
      busyKey &&
      (busyKey.startsWith("create-user-") ||
        busyKey.startsWith("edit-user-") ||
        busyKey.startsWith("reset-user-"))
    ) {
      return;
    }
    setUserModalError(null);
    setUserModal(null);
  }

  function openDeleteUserModal(companyId: number, user: CompanyUser) {
    setDeleteUserModalError(null);
    setDeleteUserModal({
      companyId,
      userId: user.id,
      userLabel: user.username || user.email || `#${user.id}`,
    });
  }

  function closeDeleteUserModal() {
    if (busyKey && busyKey.startsWith("del-user-")) return;
    setDeleteUserModalError(null);
    setDeleteUserModal(null);
  }

  async function submitUserModal() {
    if (!userModal) return;
    setUserModalError(null);
    setError(null);

    if (userModal.mode === "create") {
      const email = userModal.email.trim().toLowerCase();
      if (!email) {
        setUserModalError("Informe o e-mail do novo usuário.");
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setUserModalError("E-mail inválido. Exemplo: nome@empresa.com");
        return;
      }

      const key = `create-user-${userModal.companyId}`;
      setBusyKey(key);
      try {
        const payload = await apiFetch<{ temporaryPassword?: string | null }>(
          `/users/master/company/${userModal.companyId}/create`,
          {
            method: "POST",
            body: JSON.stringify({
              email,
              username: userModal.username.trim() || undefined,
              role: userModal.role,
              password: userModal.password.trim() || undefined,
            }),
          },
        );
        setActionInfo(
          payload?.temporaryPassword
            ? `Usuário criado com sucesso. Senha temporária: ${payload.temporaryPassword}`
            : "Usuário criado com sucesso.",
        );
        setUserModal(null);
        await load({ background: true });
      } catch (actionError) {
        const message = actionError instanceof Error ? actionError.message : "Falha ao criar usuário.";
        setUserModalError(message);
      } finally {
        setBusyKey(null);
      }
      return;
    }

    if (userModal.mode === "edit" && userModal.userId) {
      const email = userModal.email.trim().toLowerCase();
      if (!email) {
        setUserModalError("Informe o e-mail do usuário.");
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setUserModalError("E-mail inválido. Exemplo: nome@empresa.com");
        return;
      }

      const key = `edit-user-${userModal.companyId}-${userModal.userId}`;
      setBusyKey(key);
      try {
        await apiFetch(`/users/master/${userModal.userId}`, {
          method: "PATCH",
          body: JSON.stringify({
            email,
            username: userModal.username.trim(),
            role: userModal.role,
          }),
        });
        setActionInfo("Usuário atualizado com sucesso.");
        setUserModal(null);
        await load({ background: true });
      } catch (actionError) {
        const message = actionError instanceof Error ? actionError.message : "Falha ao editar usuário.";
        setUserModalError(message);
      } finally {
        setBusyKey(null);
      }
      return;
    }

    if (userModal.mode === "reset" && userModal.userId) {
      const key = `reset-user-${userModal.companyId}-${userModal.userId}`;
      setBusyKey(key);
      try {
        const payload = await apiFetch<{ temporaryPassword: string }>(
          `/users/master/${userModal.userId}/reset-password`,
          {
            method: "PATCH",
            body: JSON.stringify({ password: userModal.password.trim() || undefined }),
          },
        );
        setActionInfo(`Senha resetada com sucesso. Nova senha temporária: ${payload.temporaryPassword}`);
        setUserModal(null);
      } catch (actionError) {
        const message = actionError instanceof Error ? actionError.message : "Falha ao resetar senha.";
        setUserModalError(message);
      } finally {
        setBusyKey(null);
      }
    }
  }

  async function confirmDeleteUserModal() {
    if (!deleteUserModal) return;
    await deleteUser(deleteUserModal.companyId, deleteUserModal.userId);
  }

  function retentionLabel(retentionUntil?: string | null) {
    if (!retentionUntil) return null;
    const ms = new Date(retentionUntil).getTime() - Date.now();
    const days = Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
    return `${days} dias restantes`;
  }

  if (hasToken === null) {
    return (
      <main className="app-shell">
        <div className="app-container">
          <div className="panel p-4 text-sm text-muted">Carregando...</div>
        </div>
      </main>
    );
  }

  if (!hasToken) return null;

  const userModalBusyKey = !userModal
    ? null
    : userModal.mode === "create"
      ? `create-user-${userModal.companyId}`
      : userModal.mode === "edit" && userModal.userId
        ? `edit-user-${userModal.companyId}-${userModal.userId}`
        : userModal.mode === "reset" && userModal.userId
          ? `reset-user-${userModal.companyId}-${userModal.userId}`
          : null;
  const isUserModalBusy = Boolean(userModalBusyKey && busyKey === userModalBusyKey);

  const deleteModalBusyKey = deleteUserModal
    ? `del-user-${deleteUserModal.companyId}-${deleteUserModal.userId}`
    : null;
  const isDeleteModalBusy = Boolean(deleteModalBusyKey && busyKey === deleteModalBusyKey);
  const deleteCompanyBusyKey = deleteCompanyModal
    ? `delete-company-${deleteCompanyModal.companyId}`
    : null;
  const isDeleteCompanyBusy = Boolean(deleteCompanyBusyKey && busyKey === deleteCompanyBusyKey);

  return (
    <DashboardScaffold
      title="Master"
      description="Gestao global de empresas, modulos, usuarios e billing."
      actions={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={openCreateCompanyModal}
            className="btn btn-primary btn-sm"
            disabled={busyKey === "create-company"}
          >
            {busyKey === "create-company" ? "Criando..." : "Nova empresa"}
          </button>
          <button type="button" onClick={() => load({ background: true })} className="btn btn-primary btn-sm">
            {refreshing ? "Atualizando..." : "Atualizar"}
          </button>
          <Link href="/dashboard/master/assistente-tecnico" className="btn btn-secondary btn-sm">
            Assistente Técnico HBX
          </Link>
          <Link href="/dashboard/master/exclusoes" className="btn btn-secondary btn-sm">
            Exclusões
          </Link>
        </div>
      }
    >
      {error ? <div className="alert alert-error">{error}</div> : null}
      {actionInfo ? <div className="msg-info"><div className="text-sm">{actionInfo}</div></div> : null}
      {!initialLoading ? (
        <section className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <article className="panel p-4">
            <p className="text-xs uppercase tracking-[0.08em] font-semibold text-muted">Total de clientes</p>
            <strong className="block mt-2 text-2xl font-semibold">{companySummary.total}</strong>
          </article>
          <article className="panel p-4">
            <p className="text-xs uppercase tracking-[0.08em] font-semibold text-muted">Pagantes</p>
            <strong className="block mt-2 text-2xl font-semibold">{companySummary.paid}</strong>
          </article>
          <article className="panel p-4">
            <p className="text-xs uppercase tracking-[0.08em] font-semibold text-muted">Em trial</p>
            <strong className="block mt-2 text-2xl font-semibold">{companySummary.trialing}</strong>
          </article>
          <article className="panel p-4">
            <p className="text-xs uppercase tracking-[0.08em] font-semibold text-muted">Trial vencido</p>
            <strong className="block mt-2 text-2xl font-semibold">{companySummary.expired}</strong>
          </article>
          <article className="panel p-4">
            <p className="text-xs uppercase tracking-[0.08em] font-semibold text-muted">Inadimplentes</p>
            <strong className="block mt-2 text-2xl font-semibold">{companySummary.overdue}</strong>
          </article>
        </section>
      ) : null}

      {createCompanyModalOpen ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/35"
            aria-label="Fechar cadastro de empresa"
            onClick={closeCreateCompanyModal}
          />
          <article className="panel w-full max-w-[520px] p-4 relative z-[1]">
            <h2 className="text-lg font-semibold">Nova empresa</h2>
            <p className="text-sm text-muted mt-1">
              Crie a empresa e depois configure o WhatsApp API no bloco da própria empresa.
            </p>

            <div className="mt-3 space-y-2">
              <label className="text-xs uppercase tracking-[0.08em] font-semibold text-muted">Nome da empresa</label>
              <input
                className="field"
                placeholder="Ex: HBX Import"
                value={createCompanyName}
                onChange={(event) => {
                  setCreateCompanyModalError(null);
                  setCreateCompanyName(event.target.value);
                }}
              />
            </div>

            <div className="mt-3 space-y-2">
              <label className="text-xs uppercase tracking-[0.08em] font-semibold text-muted">
                Slug (opcional)
              </label>
              <input
                className="field"
                placeholder="Ex: hbx-import"
                value={createCompanySlug}
                onChange={(event) => {
                  setCreateCompanyModalError(null);
                  setCreateCompanySlug(event.target.value);
                }}
              />
            </div>

            {createCompanyModalError ? (
              <div className="alert alert-error mt-3">{createCompanyModalError}</div>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={closeCreateCompanyModal}
                disabled={busyKey === "create-company"}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={createCompany}
                disabled={busyKey === "create-company" || !createCompanyName.trim()}
              >
                {busyKey === "create-company" ? "Criando..." : "Criar empresa"}
              </button>
            </div>
          </article>
        </div>
      ) : null}

      {userModal ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/35"
            aria-label="Fechar modal de usuário"
            onClick={closeUserModal}
          />
          <article className="panel w-full max-w-[560px] p-4 relative z-[1]">
            <h2 className="text-lg font-semibold">
              {userModal.mode === "create"
                ? "Cadastrar usuário"
                : userModal.mode === "edit"
                  ? "Editar usuário"
                  : "Resetar senha"}
            </h2>
            <p className="text-sm text-muted mt-1">
              {userModal.mode === "create"
                ? `Empresa #${userModal.companyId}`
                : userModal.mode === "edit"
                  ? `Ajuste os dados de ${userModal.userLabel || "usuário"}`
                  : `Defina uma senha para ${userModal.userLabel || "usuário"} (opcional).`}
            </p>

            {userModal.mode !== "reset" ? (
              <>
                <div className="mt-3 space-y-2">
                  <label className="text-xs uppercase tracking-[0.08em] font-semibold text-muted">E-mail</label>
                  <input
                    className="field"
                    placeholder="email@empresa.com"
                    value={userModal.email}
                    onChange={(event) => {
                      setUserModalError(null);
                      setUserModal((current) =>
                        current ? { ...current, email: event.target.value } : current,
                      );
                    }}
                  />
                </div>

                <div className="mt-3 space-y-2">
                  <label className="text-xs uppercase tracking-[0.08em] font-semibold text-muted">
                    Nome/username (opcional)
                  </label>
                  <input
                    className="field"
                    placeholder="Nome do usuário"
                    value={userModal.username}
                    onChange={(event) => {
                      setUserModalError(null);
                      setUserModal((current) =>
                        current ? { ...current, username: event.target.value } : current,
                      );
                    }}
                  />
                </div>

                <div className="mt-3 space-y-2">
                  <label className="text-xs uppercase tracking-[0.08em] font-semibold text-muted">Perfil</label>
                  <select
                    className="field"
                    value={userModal.role}
                    onChange={(event) => {
                      setUserModalError(null);
                      setUserModal((current) =>
                        current
                          ? {
                              ...current,
                              role: (String(event.target.value || "USER").toUpperCase() as UserRole),
                            }
                          : current,
                      );
                    }}
                  >
                    <option value="USER">USER</option>
                    <option value="ADMIN">ADMIN</option>
                    <option value="GERENTE">GERENTE</option>
                  </select>
                </div>
              </>
            ) : null}

            <div className="mt-3 space-y-2">
              <label className="text-xs uppercase tracking-[0.08em] font-semibold text-muted">
                {userModal.mode === "reset"
                  ? "Nova senha (opcional)"
                  : "Senha (opcional, vazio = temporária)"}
              </label>
              <input
                className="field"
                type="password"
                placeholder="Deixe vazio para gerar senha temporária"
                value={userModal.password}
                onChange={(event) => {
                  setUserModalError(null);
                  setUserModal((current) =>
                    current ? { ...current, password: event.target.value } : current,
                  );
                }}
              />
            </div>

            {userModalError ? <div className="alert alert-error mt-3">{userModalError}</div> : null}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={closeUserModal}
                disabled={isUserModalBusy}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={submitUserModal}
                disabled={
                  isUserModalBusy ||
                  (userModal.mode === "create" && !userModal.email.trim()) ||
                  (userModal.mode === "edit" && (!userModal.userId || !userModal.email.trim())) ||
                  (userModal.mode === "reset" && !userModal.userId)
                }
              >
                {isUserModalBusy
                  ? "Salvando..."
                  : userModal.mode === "create"
                    ? "Cadastrar usuário"
                    : userModal.mode === "edit"
                      ? "Salvar alterações"
                      : "Resetar senha"}
              </button>
            </div>
          </article>
        </div>
      ) : null}

      {deleteUserModal ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/35"
            aria-label="Fechar confirmação de exclusão"
            onClick={closeDeleteUserModal}
          />
          <article className="panel w-full max-w-[520px] p-4 relative z-[1]">
            <h2 className="text-lg font-semibold">Excluir usuário</h2>
            <p className="text-sm text-muted mt-1">
              Confirma exclusão imediata de <strong>{deleteUserModal.userLabel}</strong>? Esta ação não mantém
              histórico.
            </p>

            {deleteUserModalError ? (
              <div className="alert alert-error mt-3">{deleteUserModalError}</div>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={closeDeleteUserModal}
                disabled={isDeleteModalBusy}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={confirmDeleteUserModal}
                disabled={isDeleteModalBusy}
              >
                {isDeleteModalBusy ? "Excluindo..." : "Excluir usuário"}
              </button>
            </div>
          </article>
        </div>
      ) : null}

      {deleteCompanyModal ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/35"
            aria-label="Fechar confirmação de exclusão da empresa"
            onClick={closeDeleteCompanyModal}
          />
          <article className="panel w-full max-w-[560px] p-4 relative z-[1]">
            <h2 className="text-lg font-semibold">Excluir empresa</h2>
            <p className="text-sm text-muted mt-1">
              Esta ação remove a empresa e todos os dados vinculados a ela no banco. Para confirmar,
              digite exatamente <strong>{deleteCompanyModal.companyName}</strong>.
            </p>

            <div className="mt-3 space-y-2">
              <label className="text-xs uppercase tracking-[0.08em] font-semibold text-muted">
                Confirmação
              </label>
              <input
                className="field"
                placeholder={deleteCompanyModal.companyName}
                value={deleteCompanyModal.confirmationText}
                onChange={(event) => {
                  setDeleteCompanyModalError(null);
                  setDeleteCompanyModal((current) =>
                    current ? { ...current, confirmationText: event.target.value } : current,
                  );
                }}
              />
            </div>

            {deleteCompanyModalError ? (
              <div className="alert alert-error mt-3">{deleteCompanyModalError}</div>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={closeDeleteCompanyModal}
                disabled={isDeleteCompanyBusy}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={confirmDeleteCompanyModal}
                disabled={isDeleteCompanyBusy || !deleteCompanyModal.confirmationText.trim()}
              >
                {isDeleteCompanyBusy ? "Excluindo..." : "Excluir empresa"}
              </button>
            </div>
          </article>
        </div>
      ) : null}

      {initialLoading ? (
        <div className="panel p-4 text-sm text-muted">Carregando empresas...</div>
      ) : (
        <section className="space-y-3">
          {companies.map((company) => (
            <article key={company.id} className="panel p-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h2 className="text-lg font-semibold">#{company.id} - {company.name}</h2>
                  <p className="text-xs text-muted">
                    Status: {company.isActive ? "ATIVA" : "DESATIVADA"} | Pagamento: {company.paymentStatus}
                    {company.trialEndsAt ? ` | Trial até: ${new Date(company.trialEndsAt).toLocaleDateString()}` : ""}
                    {company.subscriptionStatus ? ` | Assinatura: ${mapSubscriptionStatusLabel(company.subscriptionStatus)}` : ""}
                  </p>
                  <p className="text-xs text-muted mt-1">
                    {formatTrialCountdown(company.trialEndsAt)} | Método: {mapPaymentMethodLabel(company.paymentMethod)} | Premium:{" "}
                    {company.premiumAccess ? "SIM" : "NAO"}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={busyKey === `create-user-${company.id}`}
                    onClick={() => openCreateUserModal(company.id)}
                  >
                    Cadastrar user
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={busyKey === `trial-${company.id}`}
                    onClick={() => grantTrial(company.id)}
                  >
                    Liberar trial 30 dias
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={busyKey === `pay-${company.id}`}
                    onClick={() => setPaymentStatus(company.id, "PAID")}
                  >
                    Marcar pago
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={busyKey === `pay-${company.id}`}
                    onClick={() => setPaymentStatus(company.id, "DISABLED")}
                  >
                    Desativar empresa
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    disabled={busyKey === `delete-company-${company.id}`}
                    onClick={() => openDeleteCompanyModal(company)}
                  >
                    Excluir empresa
                  </button>
                </div>
              </div>

              <div className="mt-3 border border-[var(--line)] rounded-[12px] p-3 bg-[var(--surface-soft)]">
                <p className="text-sm font-medium">Dados SaaS do cliente</p>
                <p className="text-xs text-muted mt-1">
                  Cadastro principal, status de assinatura, trial e método de pagamento do cliente.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3">
                  <input
                    className="field"
                    placeholder="Nome da empresa / cliente"
                    value={companyProfileDrafts[company.id]?.name ?? ""}
                    onChange={(event) =>
                      updateCompanyProfileDraftField(company.id, "name", event.target.value)
                    }
                  />
                  <input
                    className="field"
                    placeholder="Responsável principal"
                    value={companyProfileDrafts[company.id]?.primaryContactName ?? ""}
                    onChange={(event) =>
                      updateCompanyProfileDraftField(
                        company.id,
                        "primaryContactName",
                        event.target.value,
                      )
                    }
                  />
                  <input
                    className="field"
                    placeholder="Email"
                    value={companyProfileDrafts[company.id]?.contactEmail ?? ""}
                    onChange={(event) =>
                      updateCompanyProfileDraftField(company.id, "contactEmail", event.target.value)
                    }
                  />
                  <input
                    className="field"
                    placeholder="Telefone"
                    value={companyProfileDrafts[company.id]?.contactPhone ?? ""}
                    onChange={(event) =>
                      updateCompanyProfileDraftField(company.id, "contactPhone", event.target.value)
                    }
                  />
                  <input
                    className="field"
                    placeholder="CPF ou CNPJ"
                    value={companyProfileDrafts[company.id]?.taxDocument ?? ""}
                    onChange={(event) =>
                      updateCompanyProfileDraftField(company.id, "taxDocument", event.target.value)
                    }
                  />
                  <select
                    className="field"
                    value={companyProfileDrafts[company.id]?.paymentMethod ?? "NONE"}
                    onChange={(event) =>
                      updateCompanyProfileDraftField(company.id, "paymentMethod", event.target.value)
                    }
                  >
                    <option value="NONE">Sem método</option>
                    <option value="CARD">Cartão</option>
                    <option value="PIX">Pix</option>
                    <option value="BOLETO">Boleto</option>
                    <option value="MANUAL">Manual</option>
                  </select>
                  <select
                    className="field"
                    value={companyProfileDrafts[company.id]?.subscriptionStatus ?? "trialing"}
                    onChange={(event) =>
                      updateCompanyProfileDraftField(
                        company.id,
                        "subscriptionStatus",
                        event.target.value,
                      )
                    }
                  >
                    <option value="trialing">trialing</option>
                    <option value="active">active</option>
                    <option value="past_due">past_due</option>
                    <option value="canceled">canceled</option>
                    <option value="expired">expired</option>
                  </select>
                  <select
                    className="field"
                    value={companyProfileDrafts[company.id]?.billingProvider ?? "manual"}
                    onChange={(event) =>
                      updateCompanyProfileDraftField(company.id, "billingProvider", event.target.value)
                    }
                  >
                    <option value="manual">manual</option>
                    <option value="mercadopago">mercadopago</option>
                    <option value="stripe">stripe</option>
                    <option value="apple">apple</option>
                    <option value="google">google</option>
                  </select>
                  <label className="flex items-center gap-2 rounded-[10px] border border-[var(--line)] px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(companyProfileDrafts[company.id]?.premiumAccess)}
                      onChange={(event) =>
                        updateCompanyProfileDraftField(
                          company.id,
                          "premiumAccess",
                          event.target.checked,
                        )
                      }
                    />
                    Premium liberado
                  </label>
                </div>

                <div className="mt-2 text-xs text-muted">
                  Trial: {company.trialStartsAt ? new Date(company.trialStartsAt).toLocaleString() : "-"} ate{" "}
                  {company.trialEndsAt ? new Date(company.trialEndsAt).toLocaleString() : "-"} | Periodo atual:{" "}
                  {company.subscriptionCurrentPeriodStart
                    ? new Date(company.subscriptionCurrentPeriodStart).toLocaleDateString()
                    : "-"}{" "}
                  ate{" "}
                  {company.subscriptionCurrentPeriodEnd
                    ? new Date(company.subscriptionCurrentPeriodEnd).toLocaleDateString()
                    : "-"}
                </div>

                <div className="flex gap-2 mt-3 flex-wrap">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => saveCompanyProfile(company.id)}
                    disabled={busyKey === `save-profile-${company.id}`}
                  >
                    {busyKey === `save-profile-${company.id}` ? "Salvando..." : "Salvar perfil SaaS"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={busyKey === `pay-${company.id}`}
                    onClick={() => setPaymentStatus(company.id, "OVERDUE")}
                  >
                    Marcar atraso
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={busyKey === `pay-${company.id}`}
                    onClick={() => setPaymentStatus(company.id, "EXPIRED")}
                  >
                    Expirar trial
                  </button>
                </div>
              </div>

              <div className="mt-3 border border-[var(--line)] rounded-[12px] p-3 bg-[var(--surface-soft)]">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-sm font-medium">WhatsApp API da empresa</p>
                    <p className="text-xs text-muted mt-1">
                      Cadastre quantos numeros quiser e vincule cada um a um modulo ativo. O numero
                      principal continua como fallback e o roteamento respeita o numero por onde o
                      cliente entrou.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => addWhatsAppEndpointDraft(company.id)}
                  >
                    Adicionar numero
                  </button>
                </div>

                {company.modules.filter((module) => module.enabled).length === 0 ? (
                  <p className="mt-3 text-xs text-amber-700">
                    Ative pelo menos um modulo nesta empresa para vincular numeros do WhatsApp.
                  </p>
                ) : null}

                {whatsAppDrafts[company.id]?.endpoints?.length ? (
                  <div className="mt-3 space-y-3">
                    {whatsAppDrafts[company.id].endpoints.map((endpoint, index) => {
                      const activeModules = company.modules.filter((module) => module.enabled);
                      const validateKey = `validate-wa-${company.id}-${endpoint.clientKey}`;
                      return (
                        <div
                          key={endpoint.clientKey}
                          className="rounded-[12px] border border-[var(--line)] bg-white p-3"
                        >
                          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                            <div>
                              <p className="text-sm font-medium">
                                Numero {index + 1}
                                {endpoint.label.trim() ? ` - ${endpoint.label.trim()}` : ""}
                              </p>
                              <p className="text-xs text-muted mt-1">
                                Modulo: {endpoint.moduleKey || "-"} | Status: {endpoint.status} |
                                Conectado: {endpoint.connected ? "SIM" : "NAO"} | Display:{" "}
                                {endpoint.displayNumber || "-"} | Token:{" "}
                                {endpoint.accessTokenConfigured
                                  ? endpoint.accessTokenPreview || "(configurado)"
                                  : "nao configurado"}
                              </p>
                              {endpoint.lastValidatedAt ? (
                                <p className="text-xs text-muted mt-1">
                                  Ultima validacao:{" "}
                                  {new Date(endpoint.lastValidatedAt).toLocaleString()}
                                </p>
                              ) : null}
                              {endpoint.statusError ? (
                                <p className="text-xs text-red-600 mt-1">
                                  Erro: {endpoint.statusError}
                                </p>
                              ) : null}
                            </div>

                            <div className="flex flex-wrap gap-3 text-xs">
                              <label className="inline-flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={endpoint.isActive}
                                  onChange={(event) =>
                                    updateWhatsAppEndpointFlag(
                                      company.id,
                                      endpoint.clientKey,
                                      "isActive",
                                      event.target.checked,
                                    )
                                  }
                                />
                                Ativo
                              </label>
                              <label className="inline-flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={endpoint.isPrimary}
                                  onChange={(event) =>
                                    updateWhatsAppEndpointFlag(
                                      company.id,
                                      endpoint.clientKey,
                                      "isPrimary",
                                      event.target.checked,
                                    )
                                  }
                                />
                                Principal
                              </label>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => removeWhatsAppEndpointDraft(company.id, endpoint.clientKey)}
                              >
                                Remover
                              </button>
                            </div>
                          </div>

                          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-5">
                            <div className="flex flex-col gap-1">
                              <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
                                Rotulo
                              </span>
                              <input
                                className="field"
                                placeholder="Ex.: Atendimento principal"
                                value={endpoint.label}
                                onChange={(event) =>
                                  updateWhatsAppEndpointDraftField(
                                    company.id,
                                    endpoint.clientKey,
                                    "label",
                                    event.target.value,
                                  )
                                }
                              />
                            </div>

                            <div className="flex flex-col gap-1">
                              <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
                                Modulo
                              </span>
                              <select
                                className="field"
                                value={endpoint.moduleKey}
                                onChange={(event) =>
                                  updateWhatsAppEndpointDraftField(
                                    company.id,
                                    endpoint.clientKey,
                                    "moduleKey",
                                    event.target.value,
                                  )
                                }
                              >
                                <option value="">Selecione...</option>
                                {activeModules.map((module) => (
                                  <option key={module.key} value={module.key}>
                                    {module.name}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="flex flex-col gap-1">
                              <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
                                Numero WhatsApp
                              </span>
                              <input
                                className="field"
                                placeholder="+55..."
                                value={endpoint.whatsappNumber}
                                onChange={(event) =>
                                  updateWhatsAppEndpointDraftField(
                                    company.id,
                                    endpoint.clientKey,
                                    "whatsappNumber",
                                    event.target.value,
                                  )
                                }
                              />
                            </div>

                            <div className="flex flex-col gap-1">
                              <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
                                Phone number ID
                              </span>
                              <input
                                className="field"
                                placeholder="ID da Meta"
                                value={endpoint.whatsappPhoneNumberId}
                                onChange={(event) =>
                                  updateWhatsAppEndpointDraftField(
                                    company.id,
                                    endpoint.clientKey,
                                    "whatsappPhoneNumberId",
                                    event.target.value,
                                  )
                                }
                              />
                            </div>

                            <div className="flex flex-col gap-1">
                              <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
                                WABA ID
                              </span>
                              <input
                                className="field"
                                placeholder="Conta Business"
                                value={endpoint.whatsappWabaId}
                                onChange={(event) =>
                                  updateWhatsAppEndpointDraftField(
                                    company.id,
                                    endpoint.clientKey,
                                    "whatsappWabaId",
                                    event.target.value,
                                  )
                                }
                              />
                            </div>
                          </div>

                          <div className="mt-2 grid grid-cols-1 gap-2">
                            <div className="flex flex-col gap-1">
                              <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
                                Access token
                              </span>
                              <input
                                className="field"
                                placeholder="Access token da Meta para este numero"
                                type="text"
                                value={endpoint.whatsappAccessToken}
                                onChange={(event) =>
                                  updateWhatsAppEndpointDraftField(
                                    company.id,
                                    endpoint.clientKey,
                                    "whatsappAccessToken",
                                    event.target.value,
                                  )
                                }
                              />
                            </div>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => validateWhatsAppEndpoint(company.id, endpoint)}
                              disabled={!endpoint.id || busyKey === validateKey}
                            >
                              {busyKey === validateKey ? "Validando..." : "Validar este numero"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-muted">
                    Nenhum numero cadastrado ainda. Use "Adicionar numero" para vincular
                    Atendimento, Recovery ou outros modulos ativos.
                  </p>
                )}

                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => saveWhatsAppConfig(company.id)}
                    disabled={busyKey === `save-wa-${company.id}`}
                  >
                    {busyKey === `save-wa-${company.id}` ? "Salvando..." : "Salvar numeros WhatsApp"}
                  </button>
                </div>
              </div>

              <div className="mt-3 border border-[var(--line)] rounded-[12px] p-3 bg-[var(--surface-soft)]">
                <p className="text-sm font-medium">Mercado Pago da empresa</p>
                <p className="text-xs text-muted mt-1">
                  Token por empresa para gerar links de cobrança, webhook e estorno no HBX Recovery.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-1 gap-2 mt-3">
                  <input
                    className="field"
                    placeholder="Access token Mercado Pago da empresa"
                    type="password"
                    value={mercadoPagoDrafts[company.id]?.mercadoPagoAccessToken ?? ""}
                    onChange={(event) =>
                      updateMercadoPagoDraftField(
                        company.id,
                        "mercadoPagoAccessToken",
                        event.target.value,
                      )
                    }
                  />
                </div>

                <div className="mt-2 text-xs text-muted">
                  Status: {mercadoPagoDrafts[company.id]?.status || "DISCONNECTED"} | Conta:{" "}
                  {mercadoPagoDrafts[company.id]?.accountEmail || "-"} | User ID:{" "}
                  {mercadoPagoDrafts[company.id]?.accountUserId || "-"} | Token:{" "}
                  {mercadoPagoDrafts[company.id]?.accessTokenConfigured ? "configurado" : "nao configurado"}{" "}
                  {mercadoPagoDrafts[company.id]?.accessTokenPreview || ""}
                </div>
                {mercadoPagoDrafts[company.id]?.lastValidatedAt ? (
                  <p className="text-xs text-muted mt-1">
                    Ultima validacao:{" "}
                    {new Date(mercadoPagoDrafts[company.id]?.lastValidatedAt || "").toLocaleString()}
                  </p>
                ) : null}
                {mercadoPagoDrafts[company.id]?.statusError ? (
                  <p className="text-xs text-red-600 mt-1">
                    Erro: {mercadoPagoDrafts[company.id]?.statusError}
                  </p>
                ) : null}

                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => saveMercadoPagoConfig(company.id)}
                    disabled={busyKey === `save-mp-${company.id}`}
                  >
                    {busyKey === `save-mp-${company.id}` ? "Salvando..." : "Salvar Mercado Pago"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => validateMercadoPagoConfig(company.id)}
                    disabled={busyKey === `validate-mp-${company.id}`}
                  >
                    {busyKey === `validate-mp-${company.id}` ? "Validando..." : "Validar token"}
                  </button>
                </div>
              </div>

              <div className="mt-3">
                <p className="text-sm font-medium">Modulos da empresa</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {company.modules.map((mod) => (
                    <button
                      key={`${company.id}-${mod.key}`}
                      type="button"
                      onClick={() => toggleModule(company.id, mod.key, mod.enabled)}
                      disabled={busyKey === `mod-${company.id}-${mod.key}`}
                      className={`btn btn-sm ${mod.enabled ? "btn-primary" : "btn-secondary"}`}
                    >
                      {mod.name}: {mod.enabled ? "ON" : "OFF"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-3">
                <p className="text-sm font-medium">Funcionários ({company.users.length})</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                  {company.users.length === 0 ? (
                    <div className="text-xs text-muted">Sem funcionários</div>
                  ) : (
                    company.users.map((user) => (
                      <div key={`${company.id}-${user.id}`} className="border border-[var(--line)] rounded-[12px] p-3 bg-[var(--surface-soft)]">
                        <p className="text-sm font-medium truncate">{user.username || user.email || `Usuário #${user.id}`}</p>
                        <p className="text-xs text-muted truncate mt-1">
                          {user.email || "sem e-mail"} | {user.role} | {user.isActive ? "ATIVO" : "DESATIVADO"}
                        </p>
                        {!user.isActive && user.retentionUntil ? (
                          <p className="text-xs text-muted mt-1">Retenção: {retentionLabel(user.retentionUntil)}</p>
                        ) : null}
                        <div className="mt-2 flex items-center justify-end">
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm mr-2"
                            disabled={busyKey === `edit-user-${company.id}-${user.id}`}
                            onClick={() => openEditUserModal(company.id, user)}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm mr-2"
                            disabled={busyKey === `reset-user-${company.id}-${user.id}`}
                            onClick={() => openResetPasswordModal(company.id, user)}
                          >
                            Resetar senha
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            disabled={busyKey === `del-user-${company.id}-${user.id}`}
                            onClick={() => openDeleteUserModal(company.id, user)}
                          >
                            Delete User
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
    </DashboardScaffold>
  );
}
