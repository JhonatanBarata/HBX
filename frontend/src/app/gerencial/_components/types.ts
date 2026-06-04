export type GerencialRole = "USER" | "ADMIN" | "USERMASTER";
export type UserFilter = "active" | "sellers" | "admins" | "inactive" | "all";

export type UserItem = {
  id: number;
  username?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  commissionPercent?: number | null;
  canRegisterHbxSellers?: boolean | null;
  sellerReferralCommissionPercent?: number | null;
  referredByUserId?: number | null;
  referredByCommissionPercentSnapshot?: number | null;
  referredByUser?: {
    id: number;
    username?: string | null;
    name?: string | null;
    email?: string | null;
  } | null;
  role: string;
  isSystemMaster?: boolean | null;
  isActive: boolean;
  deactivatedAt?: string | null;
  retentionUntil?: string | null;
  createdAt: string;
};

export type CompanyModule = {
  key: string;
  name: string;
  companyEnabled: boolean;
};

export type HbxPartnerReferralCandidate = {
  id: string;
  companyId: number;
  referrerUserId: number;
  name: string;
  phone: string;
  note?: string | null;
  preferredSegmentsJson?: string | null;
  status: "pending" | "approved" | "rejected" | "converted" | string;
  reviewedByUserId?: number | null;
  reviewedAt?: string | null;
  convertedUserId?: number | null;
  createdAt: string;
  updatedAt?: string | null;
  referrerUser?: {
    id: number;
    username?: string | null;
    name?: string | null;
    email?: string | null;
    commissionPercent?: number | null;
    sellerReferralCommissionPercent?: number | null;
  } | null;
  convertedUser?: {
    id: number;
    username?: string | null;
    name?: string | null;
    email?: string | null;
    isActive?: boolean | null;
  } | null;
};

export type CommissionTotals = {
  sellers: number;
  activeClients: number;
  pendingActivation: number;
  inactiveClients: number;
  payableAmount: number;
  duePayableAmount: number;
  duePayableCount: number;
  pendingAmount: number;
  paidAmount: number;
  recurringAmount: number;
  inheritedAmount?: number;
  inheritedCount?: number;
  nextDueAt?: string | null;
};

export type SellerOnboardingAttachment = {
  id: string;
  kind: "photo_id" | "curriculum" | "contract_pdf" | "generated_contract" | "other" | string;
  originalFilename: string;
  required?: boolean | null;
  status?: string | null;
  createdAt?: string | null;
};

export type PendingOnboardingAttachment = {
  kind: SellerOnboardingAttachment["kind"];
  file: File;
  required: boolean;
};

export type SellerOnboardingReadiness = {
  complete: boolean;
  documents: Array<{
    kind: SellerOnboardingAttachment["kind"];
    label: string;
    required: boolean;
    present: boolean;
  }>;
  receivedDocuments: Array<{ kind: SellerOnboardingAttachment["kind"]; label: string; required: boolean; present: boolean }>;
  missingRequiredDocuments: Array<{ kind: SellerOnboardingAttachment["kind"]; label: string; required: boolean; present: boolean }>;
};
