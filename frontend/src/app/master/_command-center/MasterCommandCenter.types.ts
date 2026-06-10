import type { Dispatch, SetStateAction } from "react";
import type {
  CompanyDetailPayload,
  CompanyIntegrationConnection,
  ConfirmActionState,
  CurrentUser,
  FinanceSettingsDraft,
  IntegrationEditorState,
  ManualPaymentState,
  MasterIntegrationsDraft,
  MercadoPagoDraft,
  ProfileDraft,
  UserModalState,
  WebsiteDraft,
  WhatsAppMigrationWorkflowDraft,
  WorkspacePayload,
} from "../master.types";

export type MasterCommandFilterId =
  | "all"
  | "critical"
  | "no_access"
  | "billing_pending"
  | "trial_ending"
  | "whatsapp_attention"
  | "weak_activation"
  | "manual_premium"
  | "exempt";

export type MasterPlanKey = "hbx_lite" | "hbx_padrao" | "hbx_melhor";

export type MasterPlanCatalogItem = {
  key: MasterPlanKey;
  title: string;
  shortTitle: string;
  monthlyPrice: number;
  badge: string;
  modules: string[];
  entitlements: string[];
};

export type MasterRealityTone = "good" | "warn" | "danger" | "neutral";

export type MasterRealitySnapshot = {
  accessLabel: string;
  accessTone: MasterRealityTone;
  billingLabel: string;
  billingTone: MasterRealityTone;
  planLabel: string;
  nextAction: string;
  nextActionTone: MasterRealityTone;
  reason: string;
};

export type MasterPlanChangePreviewModel = {
  fromPlan: MasterPlanCatalogItem | null;
  toPlan: MasterPlanCatalogItem;
  currentValue: number;
  nextValue: number;
  addedModules: string[];
  removedModules: string[];
  addedEntitlements: string[];
  removedEntitlements: string[];
  billingPreservedAs: string;
  accessPreservedAs: string;
  manualPremiumWarning: boolean;
};

export type MasterCommandCenterProps = {
  workspace: WorkspacePayload | null;
  currentUser: CurrentUser | null;
  loading: boolean;
  refreshing: boolean;
  initialCompanyId?: number | null;
  initialSection?: string | null;
  initialPanel?: string | null;
  onReload: (background?: boolean) => Promise<void>;
  setWorkspace: Dispatch<SetStateAction<WorkspacePayload | null>>;
  setCurrentUser: Dispatch<SetStateAction<CurrentUser | null>>;
};

export type MasterCommandActionState = {
  detail: CompanyDetailPayload | null;
  activeCompany: CompanyDetailPayload["company"] | null;
  detailLoading: boolean;
  message: string | null;
  error: string | null;
  busyAction: string | null;
  createCompanyOpen: boolean;
  createCompanyName: string;
  createCompanySlug: string;
  createCompanyContactName: string;
  createCompanyContactEmail: string;
  masterIntegrationsOpen: boolean;
  masterEmailOpen: boolean;
  profileDraft: ProfileDraft | null;
  websiteDraft: WebsiteDraft | null;
  mercadoPagoDraft: MercadoPagoDraft | null;
  financeSettingsDraft: FinanceSettingsDraft | null;
  whatsAppMigrationWorkflowDraft: WhatsAppMigrationWorkflowDraft | null;
  trialDateDraft: string;
  trialDaysDraft: string;
  masterIntegrationsDraft: MasterIntegrationsDraft;
  companyIntegrations: CompanyIntegrationConnection[];
  integrationsLoading: boolean;
  integrationsLoadedCompanyId: number | null;
  integrationEditor: IntegrationEditorState | null;
  integrationVisibility: Record<string, boolean>;
  userModal: UserModalState | null;
  manualPaymentModal: ManualPaymentState | null;
  confirmAction: ConfirmActionState | null;
  confirmActionInput: string;
  activeCompanyInContext: boolean;
};
