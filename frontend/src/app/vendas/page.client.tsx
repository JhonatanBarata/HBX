"use client";

import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type Modifier,
} from "@dnd-kit/core";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type ReactNode,
  type CSSProperties,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import DashboardScaffold from "@/components/DashboardScaffold";
import { HbxPopup1, HbxPopup2 } from "@/components/HbxPopup";
import HbxGuide1 from "@/components/HbxGuide1";
import HbxGuide4, { type HbxGuide4Item } from "@/components/HbxGuide4";
import HbxPulseSummaryCard from "@/components/HbxPulseSummaryCard";
import LiquidGlassCard, {
  liquidGlassCardStyles as glassCardStyles,
} from "@/components/LiquidGlassCard";
import HbxMobileDock from "@/components/mobile/HbxMobileDock";
import HbxMobileEmptyState from "@/components/mobile/HbxMobileEmptyState";
import MobileLeadScoreGauge from "@/components/mobile/MobileLeadScoreGauge";
import { useQuickLaunchNotice } from "@/components/useQuickLaunchNotice";
import { apiFetch, getDashboardApiBaseUrl, getToken, type ApiFetchError } from "@/app/_lib/api";
import { shouldUseMobileRoute, toMobileRoute } from "@/app/_lib/mobileRoutes";
import { startSmartPolling } from "@/app/_lib/polling";
import { useRequireModule } from "@/app/_lib/useRequireModule";
import { HBX_WINDOW_STANDARD } from "@/lib/hbx-window-system";
import {
  clearStoredRadarRun,
  isRadarRunNotFoundError,
  isRadarRunNotFoundPayload,
  isTerminalRadarRunStatus,
  readStoredRadarRun,
  saveStoredRadarRun,
  subscribeStoredRadarRun,
  type StoredRadarRun,
} from "@/lib/radar-active-run";
import {
  clearTopbarProgress,
  dispatchTopbarProgress,
} from "@/lib/topbar-progress";
import styles from "./page.module.css";

type LeadStatus = "novo" | "contato" | "retorno" | "qualificado" | "encerrado";
type SaleStatus = "none" | "activation_pending" | "trial_started" | "sale_confirmed" | "inactive" | "canceled";
type LeadBlockKey = "today" | "overdue" | "scheduled" | "closed";
type DateFilterKey = "overdue" | "today" | `scheduled:${string}`;
type MobileAgendaTab = "overdue" | "today" | "upcoming";
type MobileVendasSection = "today" | "cards" | "report" | "commission";
type DesktopVendasTab = "clientes" | "comissao" | "atencao" | "esteira" | "vendedores";
type WhatsappFilter = "all" | "with" | "without";
type InboxFilter = "all" | "in" | "out";
type MobileVisualChannelFilter = "whatsapp" | "instagram" | "email" | "site" | "phone" | "facebook";
type VendasGuideIconName = "plus" | "select" | "all" | "trash" | "whatsapp" | "inbox" | "archive";
type MobileReturnScheduler = {
  leadId: string;
  leadName: string;
  dateText: string;
  timeValue: string;
  monthKey: string;
};
type BulkDeleteConfirmation = {
  all: boolean;
  leadIds: string[];
  message: string;
};
type RadarSearchRunStatus =
  | "queued"
  | "running"
  | "sleeping"
  | "completed"
  | "partial_error"
  | "completed_insufficient_results"
  | "failed"
  | "canceled";
type RadarSearchRunResponse = {
  id: string;
  runId: string;
  status: RadarSearchRunStatus;
  targetQuantity: number;
  foundCount: number;
  message?: string | null;
  meta?: {
    requestedQuantity?: number;
    vendasStockTarget?: number | null;
    desiredStock?: number | null;
    minimumStock?: number | null;
    deliveredCount?: number;
    progress?: number;
    terminal?: boolean;
    operationalState?: "funcionando" | "pausado" | "parado";
    operationalReason?: string | null;
    operationalMessage?: string | null;
    autoImport?: {
      ran?: boolean;
      importedCount?: number;
      processedCount?: number;
      pendingCount?: number | null;
      remaining?: number | null;
      blocked?: boolean;
    } | null;
    filters?: {
      state?: string | null;
      city?: string | null;
      segment?: string | null;
      radiusKm?: number | null;
      regionalCities?: Array<{ city?: string | null; state?: string | null; distanceKm?: number | null }>;
      selectedSegments?: string[];
    };
  };
};

type LeadTimelineEventType =
  | "lead_created"
  | "origin_registered"
  | "contact_made"
  | "result_recorded"
  | "return_scheduled"
  | "status_changed"
  | "hbx_signup_link_created"
  | "hbx_assisted_signup_created"
  | "card_usage_debited"
  | "lead_enrichment_used"
  | "commission_updated"
  | "lead_closed"
  | "lead_reused"
  | "generic";

type LeadTimelineEvent = {
  id: string;
  eventType: LeadTimelineEventType;
  title: string;
  description?: string | null;
  sourceType?: string | null;
  statusFrom?: string | null;
  statusTo?: string | null;
  resultLabel?: string | null;
  returnAt?: string | null;
  createdAt?: string | null;
  conversationReference?: {
    conversationId?: number | string | null;
    anchorMessageId?: number | string | null;
    inboundMessageId?: number | string | null;
    detectedText?: string | null;
    sourceModule?: string | null;
    createdAt?: string | null;
    closureReason?: string | null;
  } | null;
};

type LeadWhatsappMotorStatus = "available" | "unavailable" | "unknown";

type LeadConversationSnapshot = {
  leadId: string;
  event: {
    id: string;
    title: string;
    resultLabel?: string | null;
    createdAt?: string | null;
    closureReason?: string | null;
    detectedText?: string | null;
    sourceModule?: string | null;
    conversationId?: number | string | null;
    anchorMessageId?: number | string | null;
    inboundMessageId?: number | string | null;
  };
  conversation: {
    id: string;
    contact?: string | null;
    channel?: string | null;
    currentFlow?: string | null;
    currentStep?: string | null;
    flowResult?: string | null;
    lastMessageAt?: string | null;
    updatedAt?: string | null;
  };
  messages: Array<{
    id: string;
    direction: string;
    senderType?: string | null;
    body: string;
    messageType?: string | null;
    sourceModule?: string | null;
    status?: string | null;
    timestamp?: string | null;
    isAnchor?: boolean;
  }>;
};

type SharedProfileSummary = {
  displayName?: string | null;
  phone?: string | null;
  origin?: string | null;
  lastContactAt?: string | null;
  currentContext?:
    | "vendas"
    | "atendimento"
    | "recovery"
    | "neutro"
    | string
    | null;
  presence?: {
    vendas?: { present?: boolean; status?: string | null };
    atendimento?: {
      present?: boolean;
      customerId?: string | null;
      conversationId?: string | number | null;
      lastContactAt?: string | null;
    };
    recovery?: {
      present?: boolean;
      status?: string | null;
      openAmount?: number | null;
    };
  };
};

type LeadMessageTemplate = {
  id: string;
  context: string;
  tone: string;
  text: string;
};

type LeadSocialCandidate = {
  network?: "instagram" | "facebook" | string | null;
  url?: string | null;
  status?: string | null;
  confidence?: number | null;
  reason?: string | null;
  source?: string | null;
  checkedAt?: string | null;
};

type LeadIntelligence = {
  email?: string | null;
  emailStatus?: "confirmed" | "probable" | "missing" | "unverified" | string;
  websiteStatus?: "present" | "none" | "weak" | "missing" | "unreachable" | string | null;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  linkedinUrl?: string | null;
  googleMapsUrl?: string | null;
  socialStatus?: "found" | "missing" | "weak" | "unknown" | string;
  socialConfidence?: number | null;
  possibleSocialCandidates?: LeadSocialCandidate[];
  confirmedSocialCandidates?: LeadSocialCandidate[];
  primarySocial?: "instagram" | "facebook" | "both" | null;
  whatsappStatus?: "confirmed" | "missing" | "invalid" | "unverified" | string;
  contactQuality?: "ready" | "review" | "weak" | "blocked" | string;
  opportunityScore?: number | null;
  opportunityReason?: string | null;
  leadReasonTags?: string[];
  recommendedChannel?: "whatsapp" | "call" | "email" | "review" | "discard" | string | null;
  nextBestAction?: "whatsapp" | "call" | "email" | "review" | "discard" | string;
  lastVerifiedAt?: string | null;
  verifiedBy?: "hbx_master" | "client_engine" | "manual" | string | null;
  visibilityTier?: "candidate" | "list_basic" | "enrichment_pending" | "lead_plus_qualified" | "review_backup" | "blocked" | string | null;
  deliveryProduct?: "list" | "lead_plus" | string | null;
  debitEligible?: boolean | null;
  qualityReason?: string | null;
  enrichmentStatus?: "queued" | "processing" | "completed" | "failed" | string | null;
  enrichedAt?: string | null;
  cnpj?: string | null;
  confidence?: {
    email?: number | null;
    enrichment?: number | null;
  } | null;
  messageTemplate?: LeadMessageTemplate | null;
  messageTemplates?: LeadMessageTemplate[];
  templateLibrarySize?: number;
  premiumTeaser?: {
    label?: string | null;
    cta?: string | null;
  } | null;
};

type VendasEnrichmentUsage = {
  used?: number;
  limit?: number;
  remaining?: number;
  dailyUsed?: number;
  dailyUserUsed?: number;
  dailyLimit?: number;
  dailyRemaining?: number;
  canAutoEnrich?: boolean;
  canManualEnrich?: boolean;
  mode?: "auto" | "manual_only" | "blocked_until_reset" | string;
  period?: "daily" | string;
};

type VendasUsageSnapshot = {
  planKey?: string | null;
  timezone?: string | null;
  dailyResetAt?: string | null;
  resetAt?: string | null;
  enrichment?: VendasEnrichmentUsage | null;
};

type VendasCapabilities = {
  canSeeLeadIntelligence?: boolean;
  canSeeOpportunityReason?: boolean;
  canSeeSocialLinks?: boolean | "teaser_only";
  canSeeMessageTemplates?: boolean;
  canAutoEnrichLeads?: boolean;
  canUseAdvancedFilters?: boolean;
  canUseVerifiedWhatsapp?: boolean | "limited";
  canUseFilteredQuota?: boolean;
  canUseSalesProfileAdvanced?: boolean;
  canSeeConversionReport?: boolean;
  canExportConversionPdf?: boolean;
  canUseWeeklyProfileSuggestions?: boolean;
};

type SalesProfileDraft = {
  whatDoYouSell: string;
  offerCategory: string;
  targetAudience: string[];
  targetSegments: string[];
  avoidSegments: string[];
  preferredChannels: string[];
  weeklyAutoUpdateEnabled: boolean;
};

type SalesProfileResponse = {
  ok?: boolean;
  effectiveProfile?: {
    whatDoYouSell?: string | null;
    offerCategory?: string | null;
    targetAudience?: string[];
    targetSegments?: string[];
    avoidSegments?: string[];
    preferredChannels?: string[];
    weeklyAutoUpdateEnabled?: boolean;
  };
  source?: "user" | "company" | "default";
  capabilities?: VendasCapabilities;
};

type ConversionReportResponse = {
  ok?: boolean;
  capabilities?: VendasCapabilities;
  metrics?: {
    cardsRecebidos?: number | null;
    cardsChamados?: number | null;
    respostas?: number | null;
    interessados?: number | null;
    taxaResposta?: number | null;
    taxaConversao?: number | null;
    melhorSegmento?: string | null;
    melhorCidade?: string | null;
    melhorCanal?: string | null;
  };
  rankings?: {
    segments?: Array<{ label: string; count: number }>;
    cities?: Array<{ label: string; count: number }>;
    channels?: Array<{ label: string; count: number }>;
  };
  recommendation?: string;
};

type SellerAuditRow = {
  seller: {
    id: number;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    active?: boolean | null;
    commissionPercent?: number | null;
    startedAt?: string | null;
  };
  metrics: {
    activeCards?: number | null;
    receivedCards?: number | null;
    workedCards?: number | null;
    idleCards?: number | null;
    idleReceivedCards?: number | null;
    overdueCards?: number | null;
    returnCards?: number | null;
    interestedCards?: number | null;
    closedCards?: number | null;
    trialOrSaleCards?: number | null;
    receivedToday?: number | null;
    workedToday?: number | null;
    idleReceivedToday?: number | null;
    responseCards?: number | null;
    refusedCards?: number | null;
    blockedCards?: number | null;
    dailyLimit?: number | null;
    deliveredToday?: number | null;
    dailyRemaining?: number | null;
    skippedToday?: number | null;
    workRate?: number | null;
  };
  topCity?: string | null;
  topSegment?: string | null;
  lastActivityAt?: string | null;
  status?: {
    key?: string | null;
    label?: string | null;
    tone?: "success" | "learning" | "warning" | "info" | string | null;
    recommendation?: string | null;
  };
  operation?: {
    action?: string | null;
    label?: string | null;
    reason?: string | null;
    dayKey?: string | null;
    ruleActive?: boolean | null;
    ruleScope?: string | null;
    ruleCity?: string | null;
    ruleState?: string | null;
    ruleSegment?: string | null;
    territoryMode?: string | null;
    territoryCities?: Array<{ city: string; state: string }>;
    coversRuleCity?: boolean | null;
    dailyLimit?: number | null;
    deliveredToday?: number | null;
    dailyRemaining?: number | null;
    skippedToday?: number | null;
    lastSkipReason?: string | null;
  };
  governance?: {
    mode?: "learning" | "normal" | "priority" | "paused" | string | null;
    label?: string | null;
    pausedUntil?: string | null;
    pausedActive?: boolean | null;
    dailyLimitOverride?: number | null;
    note?: string | null;
    updatedAt?: string | null;
  };
  automaticPenalty?: boolean | null;
};

type SellerAuditResponse = {
  ok?: boolean;
  canManage?: boolean;
  learningMode?: boolean;
  automaticPenalty?: boolean;
  period?: {
    key?: string | null;
    label?: string | null;
    start?: string | null;
    end?: string | null;
  };
  totals?: {
    sellers?: number | null;
    activeCards?: number | null;
    receivedCards?: number | null;
    workedCards?: number | null;
    idleCards?: number | null;
    idleReceivedCards?: number | null;
    overdueCards?: number | null;
    interestedCards?: number | null;
    trialOrSaleCards?: number | null;
    receivedToday?: number | null;
    workedToday?: number | null;
    idleReceivedToday?: number | null;
    responseCards?: number | null;
    refusedCards?: number | null;
    blockedCards?: number | null;
    dailyLimit?: number | null;
    deliveredToday?: number | null;
    dailyRemaining?: number | null;
    skippedToday?: number | null;
    canReceive?: number | null;
    exceptions?: number | null;
    territoryIssues?: number | null;
    dailyLimitReached?: number | null;
    manualPaused?: number | null;
  };
  operation?: {
    title?: string | null;
    dayKey?: string | null;
    ruleActive?: boolean | null;
    ruleScope?: string | null;
    ruleCity?: string | null;
    ruleState?: string | null;
    ruleSegment?: string | null;
    territoryMode?: string | null;
    dailyLimitPerSeller?: number | null;
    summary?: {
      receivedToday?: number | null;
      workedToday?: number | null;
      idleReceivedToday?: number | null;
      responses?: number | null;
      refused?: number | null;
      blocked?: number | null;
      dailyLimit?: number | null;
      deliveredToday?: number | null;
      dailyRemaining?: number | null;
      skippedToday?: number | null;
      canReceive?: number | null;
      exceptions?: number | null;
      territoryIssues?: number | null;
      dailyLimitReached?: number | null;
      manualPaused?: number | null;
    };
  };
  rows?: SellerAuditRow[];
  auditPolicy?: {
    title?: string | null;
    description?: string | null;
  };
};

type CommissionClient = {
  leadId: string;
  name?: string | null;
  phone?: string | null;
  city?: string | null;
  segment?: string | null;
  saleStatus?: SaleStatus | string | null;
  saleStatusLabel?: string | null;
  salePlanKey?: string | null;
  commissionStatus?: string | null;
  commissionStatusLabel?: string | null;
  saleValue?: number | null;
  commissionAmount?: number | null;
  commissionDueAt?: string | null;
  commissionPaidAt?: string | null;
  commissionPayoutId?: string | null;
  commissionLinkedCompanyId?: number | null;
  commissionLinkedAt?: string | null;
  commissionSyncSource?: string | null;
  sellerUserId?: number | null;
  receivableId?: string | null;
  recurringCycleKey?: string | null;
  commissionKind?: string | null;
  isRecurring?: boolean | null;
  isInherited?: boolean | null;
  updatedAt?: string | null;
};

type CommissionPayout = {
  id: string;
  sellerUserId?: number | null;
  sellerName?: string | null;
  sellerEmail?: string | null;
  status?: string | null;
  leadCount: number;
  totalAmount: number;
  referenceLabel?: string | null;
  paidAt?: string | null;
  createdAt?: string | null;
};

type CommissionSummaryResponse = {
  ok?: boolean;
  scope?: "seller" | "company" | string;
  canPayout?: boolean | null;
  generatedAt?: string | null;
  settings?: {
    dueBusinessDays?: number | null;
  };
  sellerNetwork?: {
    isHbxSellerNetwork?: boolean | null;
    canRegisterReferredSeller?: boolean | null;
    commissionPercent?: number | null;
    inheritedCommissionPercent?: number | null;
    referredSellerCount?: number | null;
  } | null;
  totals?: {
    assignedCards?: number | null;
    activeClients?: number | null;
    pendingActivation?: number | null;
    inactiveClients?: number | null;
    payableAmount?: number | null;
    duePayableAmount?: number | null;
    duePayableCount?: number | null;
    pendingAmount?: number | null;
    paidAmount?: number | null;
    nextDueAt?: string | null;
  };
  financeAudit?: {
    paidPayoutCount?: number | null;
    paidPayoutAmount?: number | null;
    canceledPayoutCount?: number | null;
    canceledPayoutAmount?: number | null;
    reopenedAmount?: number | null;
    lastPaidAt?: string | null;
    lastCanceledAt?: string | null;
  } | null;
  clients?: {
    payable?: CommissionClient[];
    pendingActivation?: CommissionClient[];
    active?: CommissionClient[];
    inactive?: CommissionClient[];
    paid?: CommissionClient[];
  };
  sellerPayouts?: Array<{
    sellerUserId: number;
    sellerName?: string | null;
    sellerEmail?: string | null;
    sellerPhone?: string | null;
    commissionPercent?: number | null;
    activeClients?: number | null;
    pendingAmount?: number | null;
    payableAmount?: number | null;
    duePayableAmount?: number | null;
    duePayableCount?: number | null;
    paidAmount?: number | null;
    nextDueAt?: string | null;
    lastPaidAt?: string | null;
  }>;
  payouts?: CommissionPayout[];
};

type CommissionPayoutDetail = {
  ok?: boolean;
  canCancel?: boolean | null;
  receipt?: {
    id: string;
    code?: string | null;
    status?: string | null;
    referenceLabel?: string | null;
    notes?: string | null;
    paidAt?: string | null;
    createdAt?: string | null;
    leadCount?: number | null;
    totalAmount?: number | null;
  } | null;
  seller?: {
    id?: number | null;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    commissionPercent?: number | null;
  } | null;
  createdBy?: {
    id?: number | null;
    name?: string | null;
    email?: string | null;
  } | null;
  items?: Array<{
    id: string;
    type?: "direct" | "recurring" | "inheritance" | string;
    label?: string | null;
    leadId?: string | null;
    name?: string | null;
    phone?: string | null;
    city?: string | null;
    segment?: string | null;
    saleStatus?: SaleStatus | string | null;
    saleStatusLabel?: string | null;
    salePlanKey?: string | null;
    cycleKey?: string | null;
    baseAmount?: number | null;
    commissionPercent?: number | null;
    commissionAmount?: number | null;
    paidAt?: string | null;
  }>;
};

type CrmIntegrityResponse = {
  ok?: boolean;
  scope?: "seller" | "company" | string;
  canManage?: boolean | null;
  generatedAt?: string | null;
  score?: number | null;
  statusLabel?: string | null;
  totals?: {
    totalCards?: number | null;
    assignedCards?: number | null;
    activeCards?: number | null;
    staleAssignedCards?: number | null;
    interestedCards?: number | null;
    activeSellers?: number | null;
    activeDistributionRules?: number | null;
    deliveredToday?: number | null;
    skippedToday?: number | null;
    duePayableCount?: number | null;
    missingPayoutLinks?: number | null;
    canceledPayouts?: number | null;
  } | null;
  checks?: Array<{
    key?: string | null;
    label?: string | null;
    status?: "ok" | "warning" | "danger" | string | null;
    description?: string | null;
    action?: string | null;
  }>;
};

type HbxClosingStage =
  | "conversation"
  | "interested"
  | "pendingActivation"
  | "trial"
  | "confirmed"
  | "inactive";

type HbxClosingPipelineItem = {
  leadId: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  state?: string | null;
  segment?: string | null;
  stage: HbxClosingStage | string;
  stageLabel?: string | null;
  stageTone?: "info" | "warning" | "success" | "danger" | string | null;
  status?: LeadStatus | string | null;
  statusLabel?: string | null;
  saleStatus?: SaleStatus | string | null;
  saleStatusLabel?: string | null;
  salePlanKey?: string | null;
  saleValue?: number | null;
  commissionStatus?: string | null;
  commissionStatusLabel?: string | null;
  commissionAmount?: number | null;
  commissionDueAt?: string | null;
  linkedCompanyId?: number | null;
  linkedAt?: string | null;
  hasSignupLink?: boolean | null;
  hasAssistedSignup?: boolean | null;
  emailPending?: boolean | null;
  signupLinkCreatedAt?: string | null;
  assistedSignupCreatedAt?: string | null;
  nextStep?: string | null;
  nextAction?: string | null;
  lastResult?: string | null;
  lastContactAt?: string | null;
  updatedAt?: string | null;
  seller?: {
    id?: number | null;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    role?: string | null;
    commissionPercent?: number | null;
  } | null;
};

type HbxClosingPipelineResponse = {
  ok?: boolean;
  scope?: "seller" | "company" | string;
  canManage?: boolean | null;
  isHbxSellerNetwork?: boolean | null;
  generatedAt?: string | null;
  settings?: {
    dueBusinessDays?: number | null;
  };
  totals?: {
    total?: number | null;
    conversation?: number | null;
    interested?: number | null;
    pendingActivation?: number | null;
    trial?: number | null;
    confirmed?: number | null;
    inactive?: number | null;
    waitingEmail?: number | null;
    signupLinks?: number | null;
    assistedSignups?: number | null;
    linkedCompanies?: number | null;
    commissionAmount?: number | null;
    dueCommissionAmount?: number | null;
  };
  policy?: {
    title?: string | null;
    description?: string | null;
  } | null;
  stages?: Partial<Record<HbxClosingStage, HbxClosingPipelineItem[]>>;
  priority?: HbxClosingPipelineItem[];
};

type ReferredSellerCreateResult = {
  candidate?: {
    id: string;
    name: string;
    phone: string;
    status: string;
  };
  message?: string | null;
};

type SalesProfileSuggestion = {
  diff?: string[];
};

type LeadItem = {
  id: string;
  sourceType: "manual" | "webscraping";
  primarySource?: string | null;
  sourceHistoryId?: string | null;
  timesSeen?: number;
  name?: string | null;
  phone?: string | null;
  phoneNormalized?: string | null;
  email?: string | null;
  address?: string | null;
  website?: string | null;
  googleMapsUrl?: string | null;
  cnpj?: string | null;
  rating?: number | null;
  reviews?: number | null;
  city?: string | null;
  segment?: string | null;
  status: LeadStatus;
  statusLabel: string;
  nextAction?: string | null;
  returnAt?: string | null;
  shortNote?: string | null;
  lastContactAt?: string | null;
  attemptCount?: number;
  lastResult?: string | null;
  wasClosedBefore?: boolean;
  createdByUserId?: number | null;
  assignedUserId?: number | null;
  assignedByUserId?: number | null;
  assignedAt?: string | null;
  commissionPercentSnapshot?: number | null;
  saleStatus?: SaleStatus | string | null;
  saleStatusLabel?: string | null;
  saleValue?: number | null;
  salePlanKey?: string | null;
  saleConfirmedAt?: string | null;
  saleCanceledAt?: string | null;
  commissionStatus?: string | null;
  commissionStatusLabel?: string | null;
  commissionBaseAmount?: number | null;
  commissionAmount?: number | null;
  commissionDueAt?: string | null;
  commissionPaidAt?: string | null;
  commissionRecurring?: boolean | null;
  commissionNote?: string | null;
  commissionLinkedCompanyId?: number | null;
  commissionLinkedAt?: string | null;
  commissionAutoSyncedAt?: string | null;
  commissionSyncSource?: string | null;
  commissionPayoutId?: string | null;
  owner?: {
    id?: number | null;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    role?: string | null;
    commissionPercent?: number | null;
  } | null;
  updatedAt?: string | null;
  createdAt?: string | null;
  signals?: {
    alreadyExisted: boolean;
    cameFromWebscraping: boolean;
    hadPreviousContact: boolean;
    wasClosedBefore: boolean;
  };
  whatsappAvailability?: {
    status?: "unknown" | "available" | "unavailable";
    checkedAt?: string | null;
    message?: string | null;
  } | null;
  planTier?: "list" | "lead" | "full" | string;
  capabilities?: VendasCapabilities;
  leadIntelligence?: LeadIntelligence | null;
  isInInbox?: boolean;
  inboxConversationId?: string | number | null;
  atendimentoConversationId?: string | number | null;
  sharedProfile?: SharedProfileSummary | null;
  timeline?: LeadTimelineEvent[];
  quickActions: string[];
};

type HbxSalesHandoffResponse = {
  ok?: boolean;
  planKey?: string | null;
  planLabel?: string | null;
  registerPath?: string | null;
  registerUrl?: string | null;
  message?: string | null;
  lead?: LeadItem | null;
};

type HbxAssistedSignupResponse = {
  ok?: boolean;
  status?: string | null;
  requiresEmailConfirmation?: boolean | null;
  email?: string | null;
  planKey?: string | null;
  planLabel?: string | null;
  generatedPassword?: string | null;
  message?: string | null;
  delivery?: {
    failed?: boolean | null;
    previewUrl?: string | null;
    confirmUrl?: string | null;
  } | null;
  lead?: LeadItem | null;
};

type AssistedSignupDraft = {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  password: string;
  salePlanKey: string;
};

type BoardResponse = {
  summary: {
    total: number;
    today: number;
    overdue: number;
    scheduled: number;
    closed: number;
  };
  planTier?: "list" | "lead" | "full" | string;
  capabilities?: VendasCapabilities;
  usage?: VendasUsageSnapshot | null;
  blocks: Record<LeadBlockKey, LeadItem[]>;
};

type TodayAgendaSyncResponse = {
  ok?: boolean;
  todayLeadCount?: number;
  mirroredLeadCount?: number;
  conversationIds?: Array<string | number>;
  leadConversationIds?: Record<string, string | number>;
  activated?: number;
  updated?: number;
  deactivated?: number;
  skippedWithoutPhone?: number;
  skippedWithoutWhatsapp?: number;
  message?: string | null;
};

type BulkDeleteLeadsResponse = {
  ok?: boolean;
  deletedCount?: number;
};

type MobileBulkDeleteTarget = {
  tab: Extract<MobileAgendaTab, "overdue" | "today">;
  label: string;
  count: number;
  leadIds: string[];
};

type ReportLeadErrorResponse = {
  ok?: boolean;
  deletedCount?: number;
  autoSent?: boolean;
  whatsappUrl?: string | null;
  message?: string | null;
};

type MasterNoticeAudience = "seller" | "customer";
type MasterNoticeTone = "info" | "success" | "warning" | "urgent";

type MasterNotice = {
  id: string;
  audience: MasterNoticeAudience;
  title: string;
  body: string;
  tone: MasterNoticeTone;
  forceSeconds: number;
  startsAt?: string | null;
  expiresAt?: string | null;
  createdAt?: string | null;
  acknowledged?: boolean;
  acknowledgedAt?: string | null;
};

type MasterNoticeListResponse = {
  ok?: boolean;
  audience?: MasterNoticeAudience;
  canManage?: boolean;
  notices?: MasterNotice[];
};

type MasterNoticeDraft = {
  audience: MasterNoticeAudience;
  title: string;
  body: string;
  tone: MasterNoticeTone;
  forceSeconds: string;
  startsAt: string;
  expiresAt: string;
};

type LeadEnrichmentResponse = {
  ok?: boolean;
  leadId: string;
  planTier?: "list" | "lead" | "full" | string;
  capabilities?: VendasCapabilities;
  usage?: VendasUsageSnapshot | null;
  whatsappAvailability?: LeadItem["whatsappAvailability"];
  leadIntelligence?: LeadIntelligence | null;
};

type LeadDraft = {
  name: string;
  phone: string;
  email: string;
  status: LeadStatus;
  nextAction: string;
  returnAt: string;
  shortNote: string;
  saleStatus: SaleStatus;
  salePlanKey: string;
  saleValue: string;
  commissionNote: string;
};

type MobileChannelAsset = "phone" | "whatsapp" | "instagram" | "facebook" | "email" | "site" | "map";

const MOBILE_VISUAL_FILTERS: Array<{ value: MobileVisualChannelFilter; label: string; asset: MobileChannelAsset }> = [
  { value: "whatsapp", label: "WhatsApp", asset: "whatsapp" },
  { value: "instagram", label: "Instagram", asset: "instagram" },
  { value: "email", label: "E-mail", asset: "email" },
  { value: "site", label: "Site", asset: "site" },
  { value: "phone", label: "Telefone", asset: "phone" },
  { value: "facebook", label: "Facebook", asset: "facebook" },
];

const MOBILE_CHANNEL_ASSETS: Record<MobileChannelAsset, { light: string; dark: string; label: string }> = {
  phone: {
    light: "/icons/hbx-docs-channels/phone-light.png",
    dark: "/icons/hbx-docs-channels/phone-dark.png",
    label: "Telefone",
  },
  whatsapp: {
    light: "/icons/hbx-docs-channels/whatsapp-light.png",
    dark: "/icons/hbx-docs-channels/whatsapp-dark.png",
    label: "WhatsApp",
  },
  instagram: {
    light: "/icons/hbx-docs-channels/instagram-light.png",
    dark: "/icons/hbx-docs-channels/instagram-dark.png",
    label: "Instagram",
  },
  facebook: {
    light: "/icons/hbx-docs-channels/facebook-light.png",
    dark: "/icons/hbx-docs-channels/facebook-dark.png",
    label: "Facebook",
  },
  email: {
    light: "/icons/hbx-docs-channels/email-light.png",
    dark: "/icons/hbx-docs-channels/email-dark.png",
    label: "E-mail",
  },
  site: {
    light: "/icons/hbx-docs-channels/site-light.png",
    dark: "/icons/hbx-docs-channels/site-dark.png",
    label: "Site",
  },
  map: {
    light: "/icons/hbx-docs-channels/map-light.png",
    dark: "/icons/hbx-docs-channels/map-dark.png",
    label: "Mapa",
  },
};

function MobileChannelIconAsset({ channel }: { channel: MobileChannelAsset }) {
  const asset = MOBILE_CHANNEL_ASSETS[channel];
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- Icones locais webp alternam por tema via CSS; Next Image nao agrega aqui. */}
      <img className={styles.mobileVendasChannelAssetLight} src={asset.light} alt="" aria-hidden="true" loading="lazy" />
      {/* eslint-disable-next-line @next/next/no-img-element -- Icones locais webp alternam por tema via CSS; Next Image nao agrega aqui. */}
      <img className={styles.mobileVendasChannelAssetDark} src={asset.dark} alt="" aria-hidden="true" loading="lazy" />
      <span className={styles.mobileVendasChannelSrOnly}>{asset.label}</span>
    </>
  );
}

type HbxRadarIconName =
  | "instagram"
  | "facebook"
  | "whatsapp"
  | "site"
  | "email"
  | "map"
  | "phone"
  | "cnpj"
  | "quality"
  | "confidence"
  | "opportunity"
  | "channel"
  | "action"
  | "check"
  | "social-partial"
  | "enriching"
  | "copy"
  | "external"
  | "filter"
  | "sort"
  | "radar"
  | "lead-plus"
  | "coins";

const HBX_RADAR_ICON_SPRITE = "/assets/hbx-radar-cards/hbx-radar-card-icons.svg";
const HBX_RADAR_PNG_ICON_BASE = "/assets/hbx-radar-cards/png/generated-light";

function HbxRadarCardIcon({ name, className }: { name: HbxRadarIconName; className?: string }) {
  return (
    <svg className={className || styles.hbxRadarCardIcon} focusable="false" aria-hidden="true">
      <use href={`${HBX_RADAR_ICON_SPRITE}#hbx-icon-${name}`} />
    </svg>
  );
}

function HbxRadarPngIcon({ name, className }: { name: HbxRadarIconName | "linkedin" | "message"; className?: string }) {
  const iconName = name === "linkedin" ? "social-partial" : name;
  return (
    <img
      src={`${HBX_RADAR_PNG_ICON_BASE}/${iconName}.png`}
      className={className || styles.hbxRadarPngIcon}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}

function channelRadarIconName(channel: LeadExpandedChannel["key"]): HbxRadarIconName {
  if (channel === "linkedin") return "social-partial";
  return channel;
}

const DESKTOP_CHANNEL_DOC_ASSETS: Partial<Record<LeadExpandedChannel["key"], { light: string; dark: string }>> = {
  instagram: {
    light: "/icons/hbx-docs-channels/instagram-light.png",
    dark: "/icons/hbx-docs-channels/instagram-dark.png",
  },
  facebook: {
    light: "/icons/hbx-docs-channels/facebook-light.png",
    dark: "/icons/hbx-docs-channels/facebook-dark.png",
  },
  whatsapp: {
    light: "/icons/hbx-docs-channels/whatsapp-light.png",
    dark: "/icons/hbx-docs-channels/whatsapp-dark.png",
  },
  site: {
    light: "/icons/hbx-docs-channels/site-light.png",
    dark: "/icons/hbx-docs-channels/site-dark.png",
  },
  email: {
    light: "/icons/hbx-docs-channels/email-light.png",
    dark: "/icons/hbx-docs-channels/email-dark.png",
  },
  phone: {
    light: "/icons/hbx-docs-channels/phone-light.png",
    dark: "/icons/hbx-docs-channels/phone-dark.png",
  },
  map: {
    light: "/icons/hbx-docs-channels/map-light.png",
    dark: "/icons/hbx-docs-channels/map-dark.png",
  },
};

function DesktopChannelDocIcon({ channel }: { channel: LeadExpandedChannel["key"] }) {
  const asset = DESKTOP_CHANNEL_DOC_ASSETS[channel];
  if (!asset) return <HbxRadarPngIcon name={channelRadarIconName(channel)} />;
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- Icones aprovados em docs/ICONES alternam por tema via CSS. */}
      <img className={styles.vendasChannelDocIconLight} src={asset.light} alt="" aria-hidden="true" loading="lazy" draggable={false} />
      {/* eslint-disable-next-line @next/next/no-img-element -- Icones aprovados em docs/ICONES alternam por tema via CSS. */}
      <img className={styles.vendasChannelDocIconDark} src={asset.dark} alt="" aria-hidden="true" loading="lazy" draggable={false} />
    </>
  );
}

function PremiumDocIcon() {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- Icone aprovado em docs/ICONES alterna por tema via CSS. */}
      <img className={styles.vendasChannelDocIconLight} src="/icons/hbx-docs-channels/premium-light.png" alt="" aria-hidden="true" loading="lazy" draggable={false} />
      {/* eslint-disable-next-line @next/next/no-img-element -- Icone aprovado em docs/ICONES alterna por tema via CSS. */}
      <img className={styles.vendasChannelDocIconDark} src="/icons/hbx-docs-channels/premium-dark.png" alt="" aria-hidden="true" loading="lazy" draggable={false} />
    </>
  );
}

function closedBadgeRadarIconName(key: string): HbxRadarIconName {
  if (key === "delivered") return "check";
  if (key === "lead-plus") return "lead-plus";
  if (key === "whatsapp") return "whatsapp";
  if (key === "enrichment") return "enriching";
  if (key === "social-found" || key === "social-partial") return "social-partial";
  return "check";
}

function HeroPremiumCrown({ active, onClick }: { active: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      className={styles.mobileHeroPremiumCrown}
      data-active={active ? "true" : "false"}
      aria-label={active ? "Desativar enriquecimento automático" : "Ativar enriquecimento automático"}
      title={active ? "Enriquecimento automático ativo" : "Ativar enriquecimento automático"}
      onClick={onClick}
    >
      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
        <path d="M4.2 18.5h15.6l.7-9.9-4.6 3.5L12 4.7 8.1 12.1 3.5 8.6l.7 9.9Z" />
        <path d="M5.2 20.2h13.6" />
        <circle cx="12" cy="4.7" r="1.25" />
        <circle cx="3.5" cy="8.6" r="1.15" />
        <circle cx="20.5" cy="8.6" r="1.15" />
      </svg>
    </button>
  );
}

type DateFilterItem = {
  key: DateFilterKey;
  blockKey: Exclude<LeadBlockKey, "closed">;
  count: number;
  title: string;
  subtitle: string;
  dayLabel: string;
  isoDate?: string | null;
};

type LeadCardView = {
  lead: LeadItem;
  draft: LeadDraft;
  board?: BoardResponse | null;
  blockKey: LeadBlockKey;
  selected: boolean;
  saving: boolean;
  onFocus: () => void;
  onQuickAction: (action: string) => void;
  onInboxAction: (lead: LeadItem) => void;
  onEdit?: (id: string | null) => void;
  onDraftChange?: (leadId: string, patch: Partial<LeadDraft>) => void;
  onEditingActiveChange?: (active: boolean) => void;
  onSave?: (leadId: string) => void;
  onCloseSale?: (status: SaleStatus) => void;
  onHbxHandoff?: () => void;
  handoffLoading?: boolean;
  onAssistedSignup?: () => void;
  assistedSignupLoading?: boolean;
  editing?: boolean;
  bulkSelectionMode?: boolean;
  bulkSelected?: boolean;
  onBulkToggle?: (leadId: string) => void;
};

type FlyAnimation = {
  leadId: string;
  lead: LeadItem;
  draft: LeadDraft;
  blockKey: LeadBlockKey;
  from: { x: number; y: number; width: number; height: number };
  to: { x: number; y: number; width: number; height: number };
};

const STATUS_OPTIONS: Array<{ value: LeadStatus; label: string }> = [
  { value: "novo", label: "Novo lead" },
  { value: "contato", label: "Em contato" },
  { value: "retorno", label: "Retorno" },
  { value: "qualificado", label: "Qualificado" },
  { value: "encerrado", label: "Encerrado" },
];

const SALE_STATUS_OPTIONS: Array<{ value: SaleStatus; label: string }> = [
  { value: "none", label: "Sem venda" },
  { value: "activation_pending", label: "Aguardando ativação" },
  { value: "trial_started", label: "Trial iniciado" },
  { value: "sale_confirmed", label: "Pagamento confirmado" },
  { value: "inactive", label: "Cliente inativo" },
  { value: "canceled", label: "Cancelado" },
];

const SALE_PLAN_OPTIONS = [
  { value: "hbx_lite", label: "HBX List", shortLabel: "List", monthlyPrice: 45 },
  { value: "hbx_padrao", label: "HBX Lead Plus", shortLabel: "Lead Plus", monthlyPrice: 99 },
  { value: "hbx_melhor", label: "HBX Full", shortLabel: "Full", monthlyPrice: 149.9 },
] as const;

const SALE_CLOSING_ACTIONS: Array<{
  value: SaleStatus;
  label: string;
  helper: string;
  tone: "pending" | "success" | "primary" | "danger";
}> = [
  {
    value: "activation_pending",
    label: "Aguard. ativação",
    helper: "Cliente fechado e aguardando implantação.",
    tone: "pending",
  },
  {
    value: "trial_started",
    label: "Trial iniciado",
    helper: "Comissão prevista entra no prazo definido.",
    tone: "success",
  },
  {
    value: "sale_confirmed",
    label: "Pagamento confirmado",
    helper: "Cliente ativo e comissão recorrente.",
    tone: "primary",
  },
  {
    value: "canceled",
    label: "Cancelado",
    helper: "Cancela comissão desse card.",
    tone: "danger",
  },
];

const BLOCK_LABELS: Record<LeadBlockKey, string> = {
  overdue: "Atrasados",
  today: "Hoje",
  scheduled: "Programados",
  closed: "Encerrados",
};
const DESKTOP_DRAG_OVERLAY_Y_OFFSET = -34;
const liftDesktopDragOverlay: Modifier = ({ transform }) => ({
  ...transform,
  y: transform.y + DESKTOP_DRAG_OVERLAY_Y_OFFSET,
});
const VENDAS_PROGRESS_STEPS = [
  "lendo banco",
  "filtrando negativos",
  "selecionando melhores cards",
  "alimentando Vendas/Prospecção",
];
const MOBILE_READY_MESSAGE_PREF_KEY = "hbx.vendas.mobile.readyMessagePreference.v1";
const MOBILE_PREFERRED_CALLER_NAME_KEY = "hbx.vendas.mobile.preferredCallerName.v1";
const MOBILE_AUTO_ENRICHMENT_KEY = "hbx.vendas.mobile.autoEnrichment.v1";
const DESKTOP_READY_MESSAGE_LIBRARY_KEY = "hbx.vendas.desktop.readyMessageLibrary.v2";
const MOBILE_OPEN_LEAD_KEY = "hbx.vendas.mobile.openLeadId.v1";

function vendasClientMessage(value: unknown, fallback = "Não consegui atualizar Vendas agora. Tente novamente em instantes.") {
  const apiError = value as ApiFetchError;
  const text = String(value instanceof Error ? value.message : value || "").trim();
  if (apiError?.status === 401 || /unauthorized|sess[aã]o expirada/i.test(text)) {
    return "Sessão expirada. Entre novamente para continuar.";
  }
  if (apiError?.status === 403 || /forbidden|module_access_denied|acesso negado/i.test(text)) {
    return "Vendas precisa de liberação da conta para continuar.";
  }
  if (/radar_stock_empty|sem cards|no results|insufficient/i.test(text)) {
    return "Radar não encontrou cards suficientes agora. Amplie cidade ou segmento.";
  }
  if (/failed to fetch|networkerror|load failed|tempo esgotado|timeout|econn/i.test(text)) {
    return "Conexão oscilou. Seus leads continuam salvos.";
  }
  if (/backend|http|status\s*\d{3}|erro\s*400|erro\s*401|erro\s*403|erro\s*404|erro\s*409|erro\s*422|erro\s*429|erro\s*500|bad request|internal server error|stack|exception/i.test(text)) {
    return fallback;
  }
  return text || fallback;
}
const SALES_PROFILE_DEFAULT_DRAFT: SalesProfileDraft = {
  whatDoYouSell: "Sistema/Software",
  offerCategory: "serviço comercial",
  targetAudience: ["empresas pequenas", "comércios locais"],
  targetSegments: ["clínicas", "oficinas", "restaurantes"],
  avoidSegments: ["empresa grande", "órgão público", "sem telefone", "diretório/lista genérica"],
  preferredChannels: ["whatsapp"],
  weeklyAutoUpdateEnabled: false,
};
const SALES_PROFILE_SELL_EXAMPLES = [
  "Plano de saúde",
  "Sistema/Software",
  "Serviços locais",
  "Consultoria",
  "Imobiliária",
  "Estética/beleza",
  "Outro",
];
const SALES_PROFILE_AUDIENCE_EXAMPLES = [
  "idosos",
  "famílias",
  "empresas pequenas",
  "comércios locais",
  "profissionais autônomos",
  "clínicas",
  "oficinas",
  "restaurantes",
  "salões",
];
const SALES_PROFILE_AVOID_EXAMPLES = [
  "empresa grande",
  "órgão público",
  "sem telefone",
  "sem WhatsApp",
  "diretório/lista genérica",
  "fora da cidade",
  "segmento errado",
];
const SALES_PROFILE_CHANNELS = ["whatsapp", "ligação", "e-mail", "instagram"];
const MOBILE_READY_MESSAGE_LIBRARY = [
  "Olá, tudo bem? Vi a {{company}} em {{city}} e queria te mostrar uma forma simples de organizar contatos, retornos e oportunidades sem depender de planilha.",
  "Oi, tudo bem? Notei que empresas de {{segment}} costumam perder retorno por falta de acompanhamento. Posso te mandar uma ideia rápida para resolver isso?",
  "Olá! Vi a {{company}} e achei que o HBX pode ajudar vocês a acompanhar interessados, lembretes e próximos contatos em um só lugar.",
  "Oi, tudo bem? Trabalho com uma solução para organizar prospecção e atendimento pelo WhatsApp. Faz sentido eu te explicar em 1 minuto?",
  "Olá! Posso te mostrar como deixar os contatos de {{segment}} mais organizados e com retorno automático no momento certo?",
  "Oi! Passei pelo perfil da {{company}} e vi espaço para melhorar acompanhamento de clientes. Posso te enviar uma explicação curta?",
  "Olá. O HBX ajuda empresas locais a não esquecerem retorno, orçamento e follow-up. Posso te mostrar como ficaria para {{segment}}?",
  "Oi, tudo bem? Se hoje vocês anotam contatos em WhatsApp, agenda ou planilha, tenho uma forma mais simples de centralizar isso. Posso mandar?",
  "Olá! Vi a {{company}} em {{city}}. Posso te mostrar uma ideia para transformar contatos soltos em uma fila clara de próximas ações?",
  "Oi. Ajudo empresas a organizar leads, retornos e atendimentos para vender com mais previsibilidade. Posso te explicar rapidamente?",
  "Olá! Tenho uma sugestão prática para melhorar o controle dos contatos que chegam pelo WhatsApp. Posso te enviar?",
  "Oi! A ideia é simples: cada contato vira um card com status, lembrete e próxima ação. Quer ver como isso pode funcionar para {{company}}?",
  "Olá. Vi que {{segment}} depende muito de retorno rápido. Posso te mostrar uma ferramenta para não deixar interessados esfriarem?",
  "Oi! O HBX organiza quem precisa ser chamado hoje, amanhã e depois. Posso te mandar um exemplo aplicado à {{company}}?",
  "Olá! Posso te mostrar uma forma de acompanhar orçamento, retorno e conversa sem perder histórico no WhatsApp?",
  "Oi. Trabalho com automação comercial para pequenas empresas. A proposta é ganhar controle sem complicar a rotina. Posso explicar?",
  "Olá! Se fizer sentido, te mostro como a {{company}} pode ter uma fila diária de contatos prioritários para chamar.",
  "Oi! Vi a {{company}} e pensei em uma melhoria simples: lembrar automaticamente quem precisa de retorno. Posso mandar a ideia?",
  "Olá. O HBX ajuda a separar contato novo, retorno e cliente interessado. Posso te mostrar como isso reduz esquecimentos?",
  "Oi, tudo bem? Tenho uma solução para organizar atendimento e prospecção em uma visão de app. Posso te mandar um resumo?",
  "Olá! Empresas de {{segment}} costumam ganhar muito quando cada conversa já nasce com próxima ação. Posso te mostrar?",
  "Oi! Posso te enviar uma ideia para acompanhar leads por prioridade, com WhatsApp, ligação e observação no mesmo lugar?",
  "Olá. Vi a {{company}} e queria sugerir um jeito de melhorar retorno comercial sem contratar mais gente agora.",
  "Oi, tudo bem? O objetivo é simples: menos contato perdido e mais follow-up no dia certo. Posso te explicar como?",
  "Olá! Se vocês recebem pedidos, dúvidas ou orçamentos pelo WhatsApp, o HBX pode organizar isso em cards. Posso mostrar?",
  "Oi. Posso te mandar um exemplo de fluxo para a {{company}} acompanhar contatos e oportunidades com mais clareza?",
  "Olá! Tenho uma ideia curta para transformar o WhatsApp em uma agenda comercial organizada. Faz sentido eu enviar?",
  "Oi! Vi a {{company}} em {{city}} e achei que vocês podem se beneficiar de uma rotina mais clara de retorno aos clientes.",
  "Olá. O HBX mostra o próximo contato certo e evita que leads fiquem esquecidos. Posso te mostrar a ideia?",
  "Oi, tudo bem? Posso te explicar como organizar clientes interessados por status, data de retorno e canal de contato?",
  "Olá! Trabalho com uma plataforma que ajuda empresas a venderem com mais organização no WhatsApp. Posso te mandar uma prévia?",
  "Oi. Se hoje vocês dependem de memória para retornar clientes, tenho uma solução simples para automatizar lembretes. Posso mostrar?",
  "Olá! Vi a {{company}} e pensei em uma forma de melhorar acompanhamento sem mudar o jeito que vocês atendem.",
  "Oi! Posso te mandar uma ideia rápida para organizar prospecção, contatos e retornos usando o HBX?",
  "Olá. Para {{segment}}, velocidade de retorno faz diferença. Posso te mostrar como priorizar quem chamar primeiro?",
  "Oi! O HBX ajuda a enxergar quem está quente, quem precisa de retorno e quem deve ser descartado. Quer ver?",
  "Olá! Tenho uma forma de deixar o comercial mais visual: cards, score, próxima ação e mensagem pronta. Posso enviar?",
  "Oi. Vi a {{company}} e queria te mostrar um jeito de reduzir retrabalho no acompanhamento dos contatos.",
  "Olá! Posso te mostrar como o HBX organiza WhatsApp, ligação e observações em uma rotina diária de vendas?",
  "Oi! A proposta é ajudar a {{company}} a não perder oportunidades por falta de follow-up. Posso te explicar?",
  "Olá. Se vocês fazem orçamento ou atendimento consultivo, o HBX pode lembrar cada próxima etapa. Posso mandar um resumo?",
  "Oi, tudo bem? Tenho uma ideia para deixar o retorno ao cliente mais rápido e rastreável. Posso compartilhar?",
  "Olá! Vi a {{company}} e achei que uma agenda comercial inteligente pode ajudar no dia a dia. Posso te mostrar?",
  "Oi. Posso te enviar uma explicação bem objetiva de como o HBX organiza leads e retornos para empresas locais?",
  "Olá! O HBX cria uma fila de ação para o time saber quem chamar agora. Posso mostrar como seria para {{segment}}?",
  "Oi! Se fizer sentido, te mando um exemplo de mensagem, card e próxima ação para a rotina comercial da {{company}}.",
  "Olá. Ajudo empresas a terem mais controle dos contatos vindos do WhatsApp. Posso te mandar uma ideia rápida?",
  "Oi! Vi a {{company}} e pensei em uma melhoria simples para organizar oportunidades sem perder o histórico.",
  "Olá! Posso te mostrar como priorizar contatos bons, descartar negativos e manter retornos no prazo?",
  "Oi. Tenho uma sugestão curta para melhorar a cadência comercial da {{company}} com menos esforço manual. Posso enviar?",
] as const;

const WHATSAPP_FILTER_LABELS: Record<WhatsappFilter, string> = {
  all: "Whatsapp",
  with: "Com WhatsApp",
  without: "Sem WhatsApp",
};

const INBOX_FILTER_LABELS: Record<InboxFilter, string> = {
  all: "Inbox: Todos",
  in: "Inbox: No Inbox",
  out: "Inbox: Fora do Inbox",
};

function VendasGuideIcon({ name }: { name: VendasGuideIconName }) {
  const paths: Record<VendasGuideIconName, ReactNode> = {
    plus: (
      <>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </>
    ),
    select: (
      <>
        <rect x="5" y="5" width="14" height="14" rx="3" />
        <path d="m8.5 12 2.4 2.4 4.8-5" />
      </>
    ),
    all: (
      <>
        <path d="M8 7h11" />
        <path d="M8 12h11" />
        <path d="M8 17h11" />
        <path d="m4 7 .01 0" />
        <path d="m4 12 .01 0" />
        <path d="m4 17 .01 0" />
      </>
    ),
    trash: (
      <>
        <path d="M3 6h18" />
        <path d="M8 6V4h8v2" />
        <path d="M6 6l1 14h10l1-14" />
        <path d="M10 11v5" />
        <path d="M14 11v5" />
      </>
    ),
    whatsapp: (
      <>
        <path d="M6.7 18.2 4.5 20l.6-2.8a8 8 0 1 1 3 2.2" />
        <path d="M9.3 8.9c.3 3 2.1 4.8 5.1 5.8l1.2-1.2" />
      </>
    ),
    inbox: (
      <>
        <path d="M4 7h16v10H4z" />
        <path d="m4 8 8 6 8-6" />
      </>
    ),
    archive: (
      <>
        <path d="M4 7h16" />
        <path d="M6 7v12h12V7" />
        <path d="M9 11h6" />
      </>
    ),
  };

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

const PT_BR_MOJIBAKE_PATTERN = /(?:\u00c3|\u00c2|\u00e2|\u00c5|\u0192|\ufffd)/;
const PT_BR_TEXT_ATTRIBUTES_TO_REPAIR = [
  "aria-label",
  "title",
  "placeholder",
  "alt",
] as const;
const WINDOWS_1252_BYTES_BY_CHAR: Record<string, number> = {
  "\u20ac": 0x80,
  "\u201a": 0x82,
  "\u0192": 0x83,
  "\u201e": 0x84,
  "\u2026": 0x85,
  "\u2020": 0x86,
  "\u2021": 0x87,
  "\u02c6": 0x88,
  "\u2030": 0x89,
  "\u0160": 0x8a,
  "\u2039": 0x8b,
  "\u0152": 0x8c,
  "\u017d": 0x8e,
  "\u2018": 0x91,
  "\u2019": 0x92,
  "\u201c": 0x93,
  "\u201d": 0x94,
  "\u2022": 0x95,
  "\u2013": 0x96,
  "\u2014": 0x97,
  "\u02dc": 0x98,
  "\u2122": 0x99,
  "\u0161": 0x9a,
  "\u203a": 0x9b,
  "\u0153": 0x9c,
  "\u017e": 0x9e,
  "\u0178": 0x9f,
};

function decodeWindows1252AsUtf8(value: string) {
  const bytes = Uint8Array.from(
    Array.from(value, (char) => {
      const mapped = WINDOWS_1252_BYTES_BY_CHAR[char];
      if (typeof mapped === "number") return mapped;
      const code = char.charCodeAt(0);
      return code <= 0xff ? code : 0x3f;
    }),
  );
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function repairPtBrMojibakeText(value: string) {
  if (!PT_BR_MOJIBAKE_PATTERN.test(value)) return value;

  let current = value;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (!PT_BR_MOJIBAKE_PATTERN.test(current)) break;
    const next = decodeWindows1252AsUtf8(current);
    if (!next || next === current || next.includes("\ufffd")) break;
    current = next;
  }

  return current
    .replace(/PR\u00c3(?:[\u0192\u00c2\u00a2\u00e2\u20ac\u0152\u201c]*)?XIMO/gi, "PR\u00d3XIMO")
    .replace(/Pr\u00c3(?:[\u0192\u00c2\u00a2\u00e2\u20ac\u0152\u201c]*)?ximo/gi, "Pr\u00f3ximo")
    .replace(/\u00c2\u00b7/g, "\u00b7");
}

function repairPtBrMojibakeNode(root: ParentNode) {
  if (typeof document === "undefined") return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let currentNode = walker.nextNode();
  while (currentNode) {
    const parent = currentNode.parentElement;
    if (!parent?.closest("script,style,textarea,input")) {
      textNodes.push(currentNode as Text);
    }
    currentNode = walker.nextNode();
  }

  textNodes.forEach((node) => {
    const original = node.nodeValue || "";
    const repaired = repairPtBrMojibakeText(original);
    if (repaired !== original) node.nodeValue = repaired;
  });

  root.querySelectorAll<HTMLElement>("*").forEach((element) => {
    PT_BR_TEXT_ATTRIBUTES_TO_REPAIR.forEach((attribute) => {
      const original = element.getAttribute(attribute);
      if (!original) return;
      const repaired = repairPtBrMojibakeText(original);
      if (repaired !== original) element.setAttribute(attribute, repaired);
    });
  });
}

function formatDateTime(value?: string | null) {
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime())
    ? parsed.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";
}

function formatShortDate(value?: string | null) {
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime())
    ? parsed.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
    : "-";
}

function toDatetimeLocal(value?: string | null) {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return "";
  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function plusDaysDatetimeLocal(days: number) {
  const now = new Date();
  now.setDate(now.getDate() + days);
  now.setHours(
    days > 0 ? 9 : now.getHours(),
    days > 0 ? 0 : now.getMinutes(),
    0,
    0,
  );
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function plusDaysDateInput(days: number) {
  const now = new Date();
  now.setDate(now.getDate() + days);
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function dateInputToIso(value: string, endOfDay = false) {
  const normalized = String(value || "").trim();
  if (!normalized) return undefined;
  return `${normalized}T${endOfDay ? "23:59:59" : "00:00:00"}`;
}

function createMasterNoticeDefaultDraft(audience: MasterNoticeAudience = "seller"): MasterNoticeDraft {
  return {
    audience,
    title: "",
    body: "",
    tone: "info",
    forceSeconds: "8",
    startsAt: plusDaysDateInput(0),
    expiresAt: plusDaysDateInput(7),
  };
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function dateKeyToShortBrazilianDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-");
  return day && month && year ? `${day}/${month}/${year.slice(-2)}` : "";
}

function parseShortBrazilianDate(value: string) {
  const match = String(value || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!match) return "";
  const day = Number(match[1]);
  const month = Number(match[2]);
  const rawYear = Number(match[3]);
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  const parsed = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return "";
  }
  return `${year}-${padDatePart(month)}-${padDatePart(day)}`;
}

function normalizeReturnTime(value: string) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";
  return `${padDatePart(hour)}:${padDatePart(minute)}`;
}

function monthKeyFromDateKey(dateKey: string) {
  return dateKey ? dateKey.slice(0, 7) : localDateKeyFromDate(new Date()).slice(0, 7);
}

function getMobileReturnDefaultDate(lead?: LeadItem | null) {
  const existing = lead?.returnAt ? new Date(lead.returnAt) : null;
  const base = existing && !Number.isNaN(existing.getTime()) ? existing : new Date();
  if (!existing || Number.isNaN(existing.getTime())) {
    base.setDate(base.getDate() + 1);
    base.setHours(9, 0, 0, 0);
  }
  return base;
}

function buildMobileReturnScheduler(lead: LeadItem): MobileReturnScheduler {
  const base = getMobileReturnDefaultDate(lead);
  const dateKey = localDateKeyFromDate(base);
  return {
    leadId: lead.id,
    leadName: lead.name || "Lead sem nome",
    dateText: dateKeyToShortBrazilianDate(dateKey),
    timeValue: `${padDatePart(base.getHours())}:${padDatePart(base.getMinutes())}`,
    monthKey: monthKeyFromDateKey(dateKey),
  };
}

function shiftMonthKey(monthKey: string, direction: -1 | 1) {
  const base = new Date(`${monthKey || monthKeyFromDateKey("")}-01T12:00:00`);
  if (Number.isNaN(base.getTime())) return monthKeyFromDateKey("");
  base.setMonth(base.getMonth() + direction);
  return localDateKeyFromDate(base).slice(0, 7);
}

function buildCalendarDays(monthKey: string) {
  const [yearValue, monthValue] = String(monthKey || "").split("-");
  const year = Number(yearValue);
  const month = Number(monthValue);
  const first = new Date(year, month - 1, 1, 12, 0, 0, 0);
  if (Number.isNaN(first.getTime())) return [];
  const startOffset = first.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const days: Array<{ key: string; day: number | null }> = [];
  for (let i = 0; i < startOffset; i += 1) days.push({ key: `empty-${i}`, day: null });
  for (let day = 1; day <= daysInMonth; day += 1) {
    days.push({
      key: `${year}-${padDatePart(month)}-${padDatePart(day)}`,
      day,
    });
  }
  return days;
}

function normalizePhoneDigits(raw: string) {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length > 11) digits = digits.slice(2);
  return digits;
}

function buildCallUrl(phone?: string | null) {
  const digits = normalizePhoneDigits(String(phone || ""));
  return digits ? `tel:+55${digits}` : "";
}

function buildWhatsAppUrl(phone?: string | null, leadName?: string | null) {
  const digits = normalizePhoneDigits(String(phone || ""));
  if (!digits) return "";
  const message = leadName
    ? `Olá, ${leadName}. Estou retomando nosso contato pelo HBX Vendas.`
    : "Olá. Estou retomando nosso contato pelo HBX Vendas.";
  return `https://wa.me/55${digits}?text=${encodeURIComponent(message)}`;
}

function buildWhatsAppUrlWithMessage(phone?: string | null, message?: string | null) {
  const digits = normalizePhoneDigits(String(phone || ""));
  if (!digits) return "";
  const text = String(message || "").trim() || "Olá. Estou retomando nosso contato pelo HBX Vendas.";
  return `https://wa.me/55${digits}?text=${encodeURIComponent(text)}`;
}

function leadEmailForDisplay(lead: LeadItem) {
  return String(lead.email || lead.leadIntelligence?.email || "").trim();
}

function leadWebsiteForDisplay(lead: LeadItem) {
  return String(lead.website || "").trim();
}

function leadVisualScore(lead: LeadItem) {
  return Math.max(0, Math.min(100, Math.round(Number(lead.leadIntelligence?.opportunityScore || 0))));
}

function leadHasVisualChannel(lead: LeadItem, channel: MobileVisualChannelFilter) {
  const intelligence = lead.leadIntelligence || {};
  if (channel === "phone") return Boolean(normalizePhoneDigits(lead.phone || ""));
  if (channel === "whatsapp") {
    return isLeadWhatsappConfirmed(lead);
  }
  if (channel === "instagram") return Boolean(String(intelligence.instagramUrl || "").trim());
  if (channel === "facebook") return Boolean(String(intelligence.facebookUrl || "").trim());
  if (channel === "email") return Boolean(leadEmailForDisplay(lead));
  if (channel === "site") return Boolean(leadWebsiteForDisplay(lead));
  return false;
}

function normalizeExternalUrl(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function normalizeSocialNetwork(value?: string | null): "instagram" | "facebook" | "" {
  const raw = String(value || "").trim().toLowerCase();
  if (raw.includes("instagram")) return "instagram";
  if (raw.includes("facebook") || raw === "fb") return "facebook";
  return "";
}

function leadPossibleSocialCandidates(lead: LeadItem): LeadSocialCandidate[] {
  const candidates = Array.isArray(lead.leadIntelligence?.possibleSocialCandidates)
    ? lead.leadIntelligence?.possibleSocialCandidates || []
    : [];
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const href = normalizeExternalUrl(candidate?.url);
    const network = normalizeSocialNetwork(candidate?.network || href);
    if (!href || !network) return false;
    const key = `${network}:${href.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function leadPossibleSocialCandidateByNetwork(lead: LeadItem, network: "instagram" | "facebook") {
  return leadPossibleSocialCandidates(lead).find((candidate) =>
    normalizeSocialNetwork(candidate.network || candidate.url) === network
  ) || null;
}

function leadHasPossibleSocial(lead: LeadItem) {
  return leadPossibleSocialCandidates(lead).length > 0;
}

function leadCapabilities(lead: LeadItem, board?: BoardResponse | null): VendasCapabilities {
  return lead.capabilities || board?.capabilities || {};
}

function canSeeLeadIntelligence(lead: LeadItem, board?: BoardResponse | null) {
  return leadCapabilities(lead, board).canSeeLeadIntelligence === true;
}

function canSeeSocialLinks(lead: LeadItem, board?: BoardResponse | null) {
  return leadCapabilities(lead, board).canSeeSocialLinks === true;
}

function vendasEnrichmentUsage(board?: BoardResponse | null): VendasEnrichmentUsage {
  return board?.usage?.enrichment || {};
}

function vendasEnrichmentCreditsView(board?: BoardResponse | null) {
  const usage = vendasEnrichmentUsage(board);
  const limit = Math.max(0, Math.trunc(Number(usage.dailyLimit ?? usage.limit ?? 0) || 0));
  const remaining = Math.max(0, Math.trunc(Number(usage.dailyRemaining ?? usage.remaining ?? 0) || 0));
  const used = Math.max(0, Math.trunc(Number(usage.dailyUsed ?? usage.used ?? Math.max(0, limit - remaining)) || 0));
  const mode = String(usage.mode || "").trim();
  const hasUsage = limit > 0 || typeof usage.dailyRemaining !== "undefined" || typeof usage.remaining !== "undefined";
  const isBlocked = hasUsage && remaining <= 0;
  const canAuto = usage.canAutoEnrich === true && !isBlocked;
  const canManual = usage.canManualEnrich === true && !isBlocked;
  const unlimited = limit >= 999999 || remaining >= 999999;
  const label = hasUsage ? unlimited ? "∞" : `${remaining}/${limit || remaining}` : "--";
  const title = isBlocked
    ? "Créditos de hoje acabaram"
    : canAuto
      ? "Enriquecimento automático ativo"
      : "Enriquecimento manual";
  const detail = isBlocked
    ? "Cards novos seguem básicos até amanhã."
    : canAuto
      ? "Lead+ completa cards enquanto houver saldo."
      : "Você escolhe quais cards completar.";
  const usageLabel = hasUsage
    ? unlimited
      ? "ilimitado"
      : `${used} usado${used === 1 ? "" : "s"}`
    : "uso não carregado";
  return {
    used,
    limit,
    remaining,
    label,
    usageLabel,
    title,
    detail,
    mode,
    canAuto,
    canManual,
    isBlocked,
    tone: isBlocked ? "blocked" : canAuto ? "auto" : "manual",
  };
}

function shouldAutoEnrichLead(lead: LeadItem, board?: BoardResponse | null, autoEnabled = false) {
  if (!lead?.id) return false;
  if (!autoEnabled) return false;
  if (!leadNeedsEnrichment(lead)) return false;
  const credits = vendasEnrichmentCreditsView(board);
  const capabilities = leadCapabilities(lead, board);
  return credits.canManual && capabilities.canAutoEnrichLeads === true;
}

function leadEnrichmentStatusKey(lead: LeadItem) {
  return String(lead.leadIntelligence?.enrichmentStatus || "").trim().toLowerCase();
}

function leadEnrichmentInProgress(lead: LeadItem) {
  return ["pending", "queued", "processing"].includes(leadEnrichmentStatusKey(lead));
}

function leadEnrichmentReviewed(lead: LeadItem) {
  const status = leadEnrichmentStatusKey(lead);
  return ["completed", "failed"].includes(status) || Boolean(lead.leadIntelligence?.enrichedAt);
}

function leadNeedsEnrichment(lead: LeadItem) {
  if (!lead?.id) return false;
  if (leadEnrichmentInProgress(lead)) return false;
  return !leadEnrichmentReviewed(lead);
}

function leadEnrichmentOperationView(lead: LeadItem, board?: BoardResponse | null, loading = false) {
  const credits = vendasEnrichmentCreditsView(board);
  if (loading || leadEnrichmentInProgress(lead)) {
    return {
      tone: "processing" as const,
      title: "Completando card",
      detail: "O HBX está conferindo canais e sinais disponíveis.",
      action: "Completando",
      canRequest: false,
    };
  }
  if (leadEnrichmentReviewed(lead)) {
    return {
      tone: "ready" as const,
      title: "Card revisado",
      detail: leadHasPremiumSignals(lead)
        ? "O enriquecimento deste card já foi aplicado."
        : "O HBX conferiu e não encontrou novos sinais agora.",
      action: "Revisado",
      canRequest: false,
    };
  }
  if (credits.isBlocked) {
    return {
      tone: "blocked" as const,
      title: "Créditos esgotados",
      detail: "Este card pode ser operado básico até o reset diário.",
      action: "Créditos esgotados",
      canRequest: false,
    };
  }
  return {
    tone: credits.canAuto ? "auto" as const : "manual" as const,
    title: credits.canAuto ? "Na fila Lead+" : "Escolha manual",
    detail: credits.canAuto
      ? "O HBX completa automaticamente enquanto houver saldo."
      : "Use um crédito para completar este card.",
    action: `Completar card (${credits.label})`,
    canRequest: credits.canManual,
  };
}

function hasLockedSocialLinks(lead: LeadItem, board?: BoardResponse | null) {
  const capabilities = leadCapabilities(lead, board);
  return capabilities.canSeeSocialLinks === "teaser_only" && Boolean(lead.leadIntelligence?.primarySocial || leadHasPossibleSocial(lead));
}

function leadHasPremiumSignals(lead: LeadItem) {
  const intelligence = lead.leadIntelligence || {};
  return Boolean(
    leadEmailForDisplay(lead)
    || intelligence.instagramUrl
    || intelligence.facebookUrl
    || intelligence.primarySocial
    || intelligence.socialStatus === "found"
    || intelligence.socialStatus === "candidate_review"
    || leadHasPossibleSocial(lead)
    || Number(intelligence.opportunityScore || 0) > 0
  );
}

function leadEnrichmentBadgeState(lead: LeadItem, board?: BoardResponse | null) {
  const intelligence = lead.leadIntelligence || {};
  const enrichmentStatus = String(intelligence.enrichmentStatus || "").trim().toLowerCase();
  const socialStatus = String(intelligence.socialStatus || "").trim().toLowerCase();
  const emailStatus = String(intelligence.emailStatus || "").trim().toLowerCase();
  const websiteStatus = String(intelligence.websiteStatus || "").trim().toLowerCase();
  const whatsappStatus = String(intelligence.whatsappStatus || "").trim().toLowerCase();
  const tier = String(intelligence.visibilityTier || "").trim().toLowerCase();
  const fromRadar = lead.sourceType === "webscraping" || String(lead.primarySource || "").toLowerCase().includes("radar");
  const lockedPremium = hasLockedSocialLinks(lead, board) || Boolean(intelligence.premiumTeaser);
  const pendingTier = ["candidate", "list_basic", "enrichment_pending"].includes(tier);
  const readyTier = ["lead_plus_qualified", "review_backup"].includes(tier);
  const possibleSocial = leadHasPossibleSocial(lead);
  const hasSite = Boolean(leadWebsiteForDisplay(lead));
  const hasEmail = Boolean(leadEmailForDisplay(lead));
  const hasPremiumSignals = leadHasPremiumSignals(lead);
  const radarReviewedMissing = fromRadar
    && !hasSite
    && !hasEmail
    && ["missing", "weak", "unknown", ""].includes(socialStatus)
    && ["missing", "invalid", "none", ""].includes(emailStatus)
    && ["none", "missing", "weak", "unreachable", ""].includes(websiteStatus)
    && Boolean(intelligence.opportunityReason || intelligence.nextBestAction || intelligence.recommendedChannel || intelligence.contactQuality);
  const completedByEnrichment = enrichmentStatus === "completed" && Boolean(
    intelligence.enrichedAt
    || readyTier
    || hasSite
    || hasEmail
    || hasPremiumSignals
    || ["confirmed", "probable"].includes(emailStatus)
    || radarReviewedMissing
  );
  const enrichmentChecked = Boolean(
    completedByEnrichment
    || radarReviewedMissing
    || ["confirmed", "unverified"].includes(whatsappStatus)
    || ["confirmed", "probable", "unverified"].includes(emailStatus)
    || (enrichmentStatus === "failed" && ["missing", "weak"].includes(socialStatus))
  );
  if (["pending", "queued", "processing"].includes(enrichmentStatus) && fromRadar) {
    return {
      state: "enriching" as const,
      label: "Enriquecendo",
      title: "Card entregue. O Radar está completando redes sociais, site e sinais comerciais.",
    };
  }
  if ((pendingTier && !enrichmentChecked) || (fromRadar && !readyTier && !hasPremiumSignals && !enrichmentChecked)) {
    return {
      state: "enriching" as const,
      label: "Enriquecendo",
      title: "Card entregue. O Radar está completando redes sociais, site e sinais comerciais.",
    };
  }
  if (enrichmentStatus === "failed") {
    return {
      state: "reviewed" as const,
      label: "Revisado",
      title: "O Radar revisou este card, mas não encontrou novos sinais agora.",
    };
  }
  if (lockedPremium) {
    return {
      state: "locked" as const,
      label: "Lead",
      title: "Sinais premium encontrados. Disponível no HBX Lead Plus.",
    };
  }
  if (fromRadar && hasPremiumSignals && !readyTier && !completedByEnrichment) {
    return {
      state: "enriching" as const,
      label: "Enriquecendo",
      title: "Sinal encontrado. O Radar ainda está completando o card.",
    };
  }
  if (readyTier || hasPremiumSignals) {
    return {
      state: "ready" as const,
      label: possibleSocial && !intelligence.instagramUrl && !intelligence.facebookUrl ? "Possível" : "Pronto",
      title: possibleSocial && !intelligence.instagramUrl && !intelligence.facebookUrl
        ? "O Radar achou uma rede provável para revisar antes da abordagem."
        : "Enriquecimento premium analisado.",
    };
  }
  if (fromRadar && enrichmentChecked) {
    return {
      state: "ready" as const,
      label: "Revisado",
      title: "O Radar revisou este card, mas não encontrou novos sinais agora.",
    };
  }
  return null;
}

function leadEnrichmentDisplay(lead: LeadItem, board?: BoardResponse | null) {
  const intelligence = lead.leadIntelligence || {};
  const badge = leadEnrichmentBadgeState(lead, board);
  const possibleSocial = leadPossibleSocialCandidates(lead);
  const found: string[] = [];
  if (String(intelligence.instagramUrl || "").trim()) found.push("Instagram");
  if (String(intelligence.facebookUrl || "").trim()) found.push("Facebook");
  if (leadWebsiteForDisplay(lead)) found.push("site");
  if (leadEmailForDisplay(lead)) found.push("e-mail");
  const foundText = found.length ? found.join(" · ") : "";

  if (badge?.state === "enriching") {
    return {
      tone: "processing" as const,
      label: found.length ? "Completando card" : "Enriquecendo agora",
      detail: found.length
        ? `${foundText} encontrado. Radar buscando o restante.`
        : "Radar buscando redes sociais, site e e-mail.",
    };
  }
  if (possibleSocial.length && !found.some((item) => item === "Instagram" || item === "Facebook")) {
    const networks = Array.from(new Set(possibleSocial.map((candidate) => {
      const network = normalizeSocialNetwork(candidate.network || candidate.url);
      return network === "instagram" ? "Instagram" : network === "facebook" ? "Facebook" : "";
    }).filter(Boolean))).join(" · ");
    return {
      tone: "possible" as const,
      label: "Rede possível",
      detail: `${networks || "Rede social"} encontrada para revisar.`,
    };
  }
  if (badge?.state === "reviewed") {
    return {
      tone: "reviewed" as const,
      label: "Radar revisou",
      detail: found.length ? `${foundText} disponível.` : "Não encontrou novos sinais agora.",
    };
  }
  if (badge?.label === "Revisado") {
    return {
      tone: "ready" as const,
      label: "Radar revisou",
      detail: "Busca concluída. Nenhuma rede confiável apareceu agora.",
    };
  }
  if (found.length) {
    return {
      tone: "ready" as const,
      label: found.some((item) => item === "Instagram" || item === "Facebook") ? "Redes encontradas" : "Dados encontrados",
      detail: possibleSocial.length ? `${foundText} · há rede possível extra` : foundText,
    };
  }
  return null;
}

function CrownGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4.2 18.5h15.6l.7-9.9-4.6 3.5L12 4.7 8.1 12.1 3.5 8.6l.7 9.9Z" />
      <path d="M5.2 20.2h13.6" />
      <circle cx="12" cy="4.7" r="1.25" />
      <circle cx="3.5" cy="8.6" r="1.15" />
      <circle cx="20.5" cy="8.6" r="1.15" />
    </svg>
  );
}

function MobileEnrichmentCrown({ lead, board, compact = false }: { lead: LeadItem; board?: BoardResponse | null; compact?: boolean }) {
  const badge = leadEnrichmentBadgeState(lead, board);
  if (!badge) return null;
  if (badge.state === "locked") {
    return (
      <Link
        href={toMobileRoute("/planos?intent=lead")}
        className={styles.mobileLeadEnrichmentCrown}
        data-state={badge.state}
        data-compact={compact ? "true" : "false"}
        title={badge.title}
        aria-label={badge.title}
        onClick={(event) => event.stopPropagation()}
      >
        <CrownGlyph />
        <span>{badge.label}</span>
      </Link>
    );
  }
  return (
    <span
      className={styles.mobileLeadEnrichmentCrown}
      data-state={badge.state}
      data-compact={compact ? "true" : "false"}
      title={badge.title}
      aria-label={badge.title}
    >
      <CrownGlyph />
      <span>{badge.label}</span>
    </span>
  );
}

const WHATSAPP_AVAILABLE_STATUSES = new Set([
  "available",
  "confirmed",
  "valid",
  "exists",
  "reachable",
  "active",
  "verified",
  "ok",
  "success",
  "has_whatsapp",
  "whatsapp",
]);

const WHATSAPP_UNAVAILABLE_STATUSES = new Set([
  "unavailable",
  "missing",
  "invalid",
  "not_found",
  "notfound",
  "no_whatsapp",
  "without_whatsapp",
  "none",
  "false",
]);

function normalizeWhatsappMotorStatus(value?: string | null): LeadWhatsappMotorStatus {
  const status = String(value || "").trim().toLowerCase();
  if (!status || status === "unknown" || status === "pending") return "unknown";
  if (WHATSAPP_UNAVAILABLE_STATUSES.has(status)) return "unavailable";
  if (
    status.includes("unavailable") ||
    status.includes("not available") ||
    status.includes("missing") ||
    status.includes("invalid") ||
    status.includes("not_found") ||
    status.includes("not found") ||
    status.includes("sem whatsapp") ||
    status.includes("no whatsapp") ||
    status.includes("without_whatsapp") ||
    status.includes("no_whatsapp")
  ) return "unavailable";
  if (WHATSAPP_AVAILABLE_STATUSES.has(status)) return "available";
  if (status.includes("available") || status.includes("confirm") || status.includes("valid") || status.includes("verified")) return "available";
  return "unknown";
}

function leadWhatsappMotorStatus(lead: LeadItem): LeadWhatsappMotorStatus {
  const availabilityStatus = normalizeWhatsappMotorStatus(lead.whatsappAvailability?.status);
  if (availabilityStatus !== "unknown") return availabilityStatus;
  return normalizeWhatsappMotorStatus(lead.leadIntelligence?.whatsappStatus);
}

function isLeadWhatsappConfirmed(lead: LeadItem) {
  return leadWhatsappMotorStatus(lead) === "available";
}

function leadWhatsappHref(lead: LeadItem) {
  return isLeadWhatsappConfirmed(lead) ? buildWhatsAppUrl(lead.phone, lead.name) : "";
}

type LeadChannelAsset = {
  channel: MobileChannelAsset;
  href: string;
  external?: boolean;
  locked?: boolean;
  disabled?: boolean;
};

type LeadClosedCardBadge = {
  key: string;
  label: string;
  tone: "success" | "primary" | "premium" | "warning" | "neutral";
};

type LeadClosedCardViewModel = {
  title: string;
  place: string;
  segment: string;
  phone: string;
  avatarText: string;
  productLabel: string;
  productTone: "list" | "lead";
  creditLabel: string;
  ctaLabel: string;
  badges: LeadClosedCardBadge[];
  isLeadPlus: boolean;
};

type LeadExpandedChannel = {
  key: "phone" | "instagram" | "facebook" | "whatsapp" | "site" | "email" | "map" | "linkedin";
  label: string;
  href: string;
  status: "available" | "possible" | "missing" | "locked";
  external?: boolean;
};

type LeadExpandedField = {
  key: string;
  label: string;
  value: string;
  href?: string;
  external?: boolean;
  tone?: "success" | "warning" | "muted";
};

type LeadExpandedCardViewModel = {
  closed: LeadClosedCardViewModel;
  score: number;
  scoreLabel: string;
  confidence: number;
  confidenceLabel: string;
  fields: LeadExpandedField[];
  channels: LeadExpandedChannel[];
  evidence: Array<{ label: string; tone: "success" | "primary" | "warning" | "muted" }>;
  opportunity: string;
  recommendedChannel: string;
  nextAction: string;
  updatedLabel: string;
};

function buildLeadChannelAssets(lead: LeadItem): LeadChannelAsset[] {
  const socialLinksVisible = canSeeSocialLinks(lead);
  const phoneHref = lead.phone ? buildCallUrl(lead.phone) : "";
  const whatsappHref = leadWhatsappHref(lead);
  const instagramHref = normalizeExternalUrl(lead.leadIntelligence?.instagramUrl);
  const facebookHref = normalizeExternalUrl(lead.leadIntelligence?.facebookUrl);
  const email = String(lead.email || lead.leadIntelligence?.email || "").trim();
  const websiteHref = normalizeExternalUrl(lead.website);
  const mapHref = mapsHrefForLead(lead);
  return [
    { channel: "phone", href: phoneHref, disabled: !phoneHref },
    { channel: "whatsapp", href: whatsappHref, external: true, disabled: !whatsappHref },
    {
      channel: "instagram",
      href: socialLinksVisible ? instagramHref : "",
      external: true,
      locked: Boolean(instagramHref && !socialLinksVisible),
      disabled: !instagramHref,
    },
    {
      channel: "facebook",
      href: socialLinksVisible ? facebookHref : "",
      external: true,
      locked: Boolean(facebookHref && !socialLinksVisible),
      disabled: !facebookHref,
    },
    { channel: "email", href: email ? `mailto:${email}` : "", disabled: !email },
    { channel: "site", href: websiteHref, external: true, disabled: !websiteHref },
    { channel: "map", href: mapHref, external: true, disabled: !mapHref },
  ];
}

function leadAvatarText(value: unknown) {
  const cleaned = String(value || "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return cleaned || "HB";
}

function leadClosedCardView(lead: LeadItem, board?: BoardResponse | null): LeadClosedCardViewModel {
  const intelligence = lead.leadIntelligence || {};
  const canSeeIntelligence = canSeeLeadIntelligence(lead, board);
  const deliveryProduct = String(intelligence.deliveryProduct || "").trim().toLowerCase();
  const planTier = String(board?.planTier || lead.planTier || "").trim().toLowerCase();
  const isLeadPlus = canSeeIntelligence || deliveryProduct === "lead_plus" || planTier === "lead" || planTier === "full";
  const enrichmentDisplay = leadEnrichmentDisplay(lead, board);
  const socialStatus = String(intelligence.socialStatus || "").trim().toLowerCase();
  const badges: LeadClosedCardBadge[] = [
    { key: "delivered", label: "Entregue", tone: "success" },
    isLeadPlus
      ? { key: "lead-plus", label: "Lead+", tone: "premium" }
      : { key: "list", label: "List", tone: "primary" },
  ];

  if (enrichmentDisplay) {
    badges.push({
      key: "enrichment",
      label: enrichmentDisplay.label,
      tone: enrichmentDisplay.tone === "processing"
        ? "primary"
        : enrichmentDisplay.tone === "possible"
          ? "warning"
          : enrichmentDisplay.tone === "ready"
            ? "success"
            : "neutral",
    });
  } else if (socialStatus === "found" || socialStatus === "confirmed") {
    badges.push({ key: "social-found", label: "Social encontrado", tone: "success" });
  } else if (leadHasPossibleSocial(lead) || socialStatus === "candidate_review") {
    badges.push({ key: "social-partial", label: "Social parcial", tone: "warning" });
  }

  if (isLeadWhatsappConfirmed(lead)) {
    badges.push({ key: "whatsapp", label: "WhatsApp confirmado", tone: "success" });
  }

  const credits = vendasEnrichmentCreditsView(board);
  const creditLabel = credits.label === "--" ? "créditos do dia" : `Hoje ${credits.label}`;
  const productLabel = isLeadPlus ? "Lead+" : "List";
  return {
    title: String(lead.name || "Lead sem nome").trim(),
    place: String(lead.city || "").trim() || "Local não informado",
    segment: String(lead.segment || lead.primarySource || "Segmento não informado").trim(),
    phone: String(lead.phone || lead.phoneNormalized || "").trim(),
    avatarText: leadAvatarText(lead.name),
    productLabel,
    productTone: isLeadPlus ? "lead" : "list",
    creditLabel,
    ctaLabel: isLeadPlus ? "Ver detalhes" : "Abrir",
    badges: badges.slice(0, 4),
    isLeadPlus,
  };
}

function formatCnpjLabel(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length !== 14) return String(value || "").trim();
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

function mapsHrefForLead(lead: LeadItem) {
  const explicit = normalizeExternalUrl(lead.googleMapsUrl || lead.leadIntelligence?.googleMapsUrl);
  if (explicit) return explicit;
  const query = [lead.address, lead.city, lead.name].filter(Boolean).join(" ");
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : "";
}

function leadExpandedCardView(lead: LeadItem, board?: BoardResponse | null): LeadExpandedCardViewModel {
  const closed = leadClosedCardView(lead, board);
  const intelligence = lead.leadIntelligence || {};
  const socialLinksVisible = canSeeSocialLinks(lead, board);
  const score = Math.max(0, Math.min(100, Math.round(Number(intelligence.opportunityScore || 0) || leadVisualScore(lead) || 0)));
  const confidence = Math.max(
    0,
    Math.min(100, Math.round(Number(intelligence.socialConfidence || intelligence.confidence?.enrichment || intelligence.confidence?.email || 0) || 0)),
  );
  const cnpj = formatCnpjLabel(intelligence.cnpj || lead.cnpj);
  const email = leadEmailForDisplay(lead);
  const website = leadWebsiteForDisplay(lead);
  const websiteHref = normalizeExternalUrl(website);
  const phoneHref = lead.phone ? buildCallUrl(lead.phone) : "";
  const whatsappHref = leadWhatsappHref(lead);
  const instagramHref = socialLinksVisible ? normalizeExternalUrl(intelligence.instagramUrl) : "";
  const facebookHref = socialLinksVisible ? normalizeExternalUrl(intelligence.facebookUrl) : "";
  const linkedinHref = socialLinksVisible ? normalizeExternalUrl(intelligence.linkedinUrl) : "";
  const possibleInstagramHref = socialLinksVisible && !instagramHref
    ? normalizeExternalUrl(leadPossibleSocialCandidateByNetwork(lead, "instagram")?.url)
    : "";
  const possibleFacebookHref = socialLinksVisible && !facebookHref
    ? normalizeExternalUrl(leadPossibleSocialCandidateByNetwork(lead, "facebook")?.url)
    : "";
  const mapHref = mapsHrefForLead(lead);
  const fields: LeadExpandedField[] = [
    cnpj ? { key: "cnpj", label: "CNPJ", value: cnpj, tone: "success" } : { key: "cnpj", label: "CNPJ", value: "Não encontrado", tone: "muted" },
    email ? { key: "email", label: "E-mail", value: email, href: `mailto:${email}`, tone: "success" } : { key: "email", label: "E-mail", value: "Não encontrado", tone: "muted" },
    website ? { key: "site", label: "Site", value: website.replace(/^https?:\/\//i, "").replace(/\/$/, ""), href: websiteHref || undefined, external: true, tone: "success" } : { key: "site", label: "Site", value: "Não encontrado", tone: "muted" },
    closed.phone ? { key: "phone", label: "Telefone", value: closed.phone, href: phoneHref || undefined, tone: "success" } : { key: "phone", label: "Telefone", value: "Não informado", tone: "muted" },
    lead.address ? { key: "address", label: "Endereço", value: lead.address, href: mapHref || undefined, external: true, tone: "success" } : { key: "address", label: "Endereço", value: "Não informado", tone: "muted" },
  ];
  const channels: LeadExpandedChannel[] = [
    { key: "phone", label: "Telefone", href: phoneHref, status: phoneHref ? "available" : "missing" },
    { key: "whatsapp", label: "WhatsApp", href: whatsappHref, status: whatsappHref ? "available" : "missing", external: true },
    { key: "instagram", label: "Instagram", href: instagramHref || possibleInstagramHref, status: instagramHref ? "available" : possibleInstagramHref ? "possible" : "missing", external: true },
    { key: "facebook", label: "Facebook", href: facebookHref || possibleFacebookHref, status: facebookHref ? "available" : possibleFacebookHref ? "possible" : "missing", external: true },
    { key: "email", label: "E-mail", href: email ? `mailto:${email}` : "", status: email ? "available" : "missing" },
    { key: "site", label: "Site", href: websiteHref, status: websiteHref ? "available" : "missing", external: true },
    { key: "map", label: "Mapa", href: mapHref, status: mapHref ? "available" : "missing", external: true },
    { key: "linkedin", label: "LinkedIn", href: linkedinHref, status: linkedinHref ? "available" : "missing", external: true },
  ];
  const evidence = [
    cnpj ? { label: "CNPJ localizado", tone: "success" as const } : null,
    isLeadWhatsappConfirmed(lead) ? { label: "WhatsApp confirmado", tone: "success" as const } : null,
    website ? { label: "Site encontrado", tone: "primary" as const } : null,
    email ? { label: "E-mail encontrado", tone: "primary" as const } : null,
    instagramHref || facebookHref ? { label: "Rede social encontrada", tone: "success" as const } : null,
    possibleInstagramHref || possibleFacebookHref ? { label: "Rede social possível", tone: "warning" as const } : null,
    lead.rating ? { label: `Avaliação ${Number(lead.rating).toFixed(1)}`, tone: "primary" as const } : null,
  ].filter(Boolean) as LeadExpandedCardViewModel["evidence"];
  const opportunity = String(intelligence.opportunityReason || lead.shortNote || "Revise os dados encontrados e escolha o melhor canal para a primeira abordagem.").trim();
  const recommendedChannel = nextBestActionLabel(intelligence.recommendedChannel || intelligence.nextBestAction);
  const nextAction = lead.nextAction || nextBestActionLabel(intelligence.nextBestAction) || "Iniciar conversa";
  return {
    closed,
    score,
    scoreLabel: score ? intelligenceScoreLabel(score) : "Aguardando dados",
    confidence,
    confidenceLabel: confidence ? `${confidence}%` : "Sem score",
    fields,
    channels,
    evidence: evidence.length ? evidence : [{ label: "Dados básicos conferidos", tone: "muted" }],
    opportunity,
    recommendedChannel,
    nextAction,
    updatedLabel: intelligence.enrichedAt ? `Atualizado ${formatDateTime(intelligence.enrichedAt)}` : "Atualização sob demanda",
  };
}

function socialBadgeLabel(primarySocial?: LeadIntelligence["primarySocial"]) {
  if (primarySocial === "instagram") return "IG";
  if (primarySocial === "facebook") return "f";
  if (primarySocial === "both") return "Redes";
  return "";
}

function readMobileReadyMessagePreference() {
  if (typeof window === "undefined") return 0;
  const value = Number(window.localStorage.getItem(MOBILE_READY_MESSAGE_PREF_KEY));
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function saveMobileReadyMessagePreference(index: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MOBILE_READY_MESSAGE_PREF_KEY, String(Math.max(0, Math.floor(index))));
}

function readDesktopReadyMessageLibrary() {
  if (typeof window === "undefined") return [] as string[];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DESKTOP_READY_MESSAGE_LIBRARY_KEY) || "[]");
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 20)
      : [];
  } catch {
    return [];
  }
}

function saveDesktopReadyMessageLibrary(messages: string[]) {
  if (typeof window === "undefined") return;
  const clean = messages.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 20);
  window.localStorage.setItem(DESKTOP_READY_MESSAGE_LIBRARY_KEY, JSON.stringify(clean));
}

function readMobileOpenLeadId() {
  if (typeof window === "undefined") return "";
  return String(window.sessionStorage.getItem(MOBILE_OPEN_LEAD_KEY) || "").trim();
}

function salesProfileDraftFromResponse(payload?: SalesProfileResponse | null): SalesProfileDraft {
  const profile = payload?.effectiveProfile || {};
  return {
    whatDoYouSell: String(profile.whatDoYouSell || SALES_PROFILE_DEFAULT_DRAFT.whatDoYouSell),
    offerCategory: String(profile.offerCategory || SALES_PROFILE_DEFAULT_DRAFT.offerCategory),
    targetAudience: Array.isArray(profile.targetAudience) && profile.targetAudience.length
      ? profile.targetAudience
      : SALES_PROFILE_DEFAULT_DRAFT.targetAudience,
    targetSegments: Array.isArray(profile.targetSegments) && profile.targetSegments.length
      ? profile.targetSegments
      : SALES_PROFILE_DEFAULT_DRAFT.targetSegments,
    avoidSegments: Array.isArray(profile.avoidSegments) && profile.avoidSegments.length
      ? profile.avoidSegments
      : SALES_PROFILE_DEFAULT_DRAFT.avoidSegments,
    preferredChannels: Array.isArray(profile.preferredChannels) && profile.preferredChannels.length
      ? profile.preferredChannels
      : SALES_PROFILE_DEFAULT_DRAFT.preferredChannels,
    weeklyAutoUpdateEnabled: Boolean(profile.weeklyAutoUpdateEnabled),
  };
}

function toggleStringValue(values: string[], value: string) {
  const normalized = value.trim();
  if (!normalized) return values;
  return values.some((item) => item.toLowerCase() === normalized.toLowerCase())
    ? values.filter((item) => item.toLowerCase() !== normalized.toLowerCase())
    : [...values, normalized].slice(0, 30);
}

function formatReportPercent(value: unknown) {
  return `${Math.round((Number(value || 0) || 0) * 100)}%`;
}

function saveMobileOpenLeadId(leadId: string | null) {
  if (typeof window === "undefined") return;
  const normalized = String(leadId || "").trim();
  if (normalized) window.sessionStorage.setItem(MOBILE_OPEN_LEAD_KEY, normalized);
  else window.sessionStorage.removeItem(MOBILE_OPEN_LEAD_KEY);
}

function mobileMessageTokenValue(value: string | null | undefined, fallback: string) {
  return String(value || "").trim() || fallback;
}

function readMobilePreferredCallerName() {
  if (typeof window === "undefined") return "";
  return String(window.localStorage.getItem(MOBILE_PREFERRED_CALLER_NAME_KEY) || "").trim();
}

function saveMobilePreferredCallerName(value: string) {
  if (typeof window === "undefined") return;
  const trimmed = String(value || "").trim();
  if (trimmed) window.localStorage.setItem(MOBILE_PREFERRED_CALLER_NAME_KEY, trimmed);
  else window.localStorage.removeItem(MOBILE_PREFERRED_CALLER_NAME_KEY);
}

function readMobileAutoEnrichmentPreference() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(MOBILE_AUTO_ENRICHMENT_KEY) === "true";
}

function saveMobileAutoEnrichmentPreference(active: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MOBILE_AUTO_ENRICHMENT_KEY, active ? "true" : "false");
}

function personalizeMobileReadyMessage(
  template: string,
  lead: LeadItem,
  preferredPersonName?: string | null,
) {
  const company = mobileMessageTokenValue(lead.name, "sua empresa");
  const fromPerson = String(preferredPersonName || "").trim();
  const greetingName = company === "sua empresa" ? "tudo bem" : company;
  const city = mobileMessageTokenValue(lead.city, "sua região");
  const segment = mobileMessageTokenValue(lead.segment, "empresas locais");
  const source = mobileMessageTokenValue(lead.primarySource, "Radar Digital");
  return template
    .replaceAll("{{name}}", greetingName)
    .replaceAll("{{caller}}", fromPerson || "HBX")
    .replaceAll("{{company}}", company)
    .replaceAll("{{city}}", city)
    .replaceAll("{{segment}}", segment)
    .replaceAll("{{source}}", source);
}

function boardsPayloadEqual(left: BoardResponse | null, right: BoardResponse | null) {
  if (left === right) return true;
  if (!left || !right) return false;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function radarRunResponseEqual(left: RadarSearchRunResponse | null, right: RadarSearchRunResponse | null) {
  if (left === right) return true;
  if (!left || !right) return false;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function isTextEntryElementActive() {
  if (typeof document === "undefined") return false;
  const active = document.activeElement;
  if (!active) return false;
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement) {
    return true;
  }
  return active instanceof HTMLElement && active.isContentEditable;
}

function buildMobileReadyMessageTemplates(lead: LeadItem, preferredPersonName?: string | null) {
  const backendTemplates = [
    ...(lead.leadIntelligence?.messageTemplates || []),
    ...(lead.leadIntelligence?.messageTemplate ? [lead.leadIntelligence.messageTemplate] : []),
  ];
  const generatedTemplates = MOBILE_READY_MESSAGE_LIBRARY.map((template, index) => ({
    id: `mobile-smart-${index + 1}`,
    context: "entrada_inteligente",
    tone: "consultiva",
    text: personalizeMobileReadyMessage(template, lead, preferredPersonName),
  }));
  const seen = new Set<string>();
  return [...backendTemplates, ...generatedTemplates].filter((template) => {
    const text = String(template.text || "").trim();
    if (!text || seen.has(text)) return false;
    seen.add(text);
    return true;
  });
}

function intelligenceScoreLabel(score?: number | null) {
  const value = Math.max(0, Math.min(100, Math.round(Number(score || 0))));
  if (value >= 80) return "Alta prioridade";
  if (value >= 62) return "Boa prioridade";
  if (value >= 42) return "Revisar";
  return "Baixa prioridade";
}

function buildSellerScoreBreakdown(lead: LeadItem) {
  const intelligence = lead.leadIntelligence || {};
  const tags = new Set((intelligence.leadReasonTags || []).map((tag) => String(tag || "").trim()));
  const whatsappReady = isLeadWhatsappConfirmed(lead);
  const email = leadEmailForDisplay(lead);
  const website = leadWebsiteForDisplay(lead);
  const instagram = normalizeExternalUrl(intelligence.instagramUrl);
  const facebook = normalizeExternalUrl(intelligence.facebookUrl);
  const possibleSocial = leadPossibleSocialCandidates(lead);
  const rows = [
    { label: "Base do card", points: 44, active: true },
    { label: "WhatsApp confirmado", points: 24, active: whatsappReady },
    { label: "Telefone válido", points: 16, active: Boolean(buildCallUrl(lead.phone)) },
    { label: "E-mail encontrado", points: String(intelligence.emailStatus || "").toLowerCase() === "probable" ? 8 : 14, active: Boolean(email) },
    { label: "Instagram", points: facebook ? 4 : 6, active: Boolean(instagram) },
    { label: "Facebook", points: instagram ? 4 : 4, active: Boolean(facebook) },
    { label: "Rede social possível", points: 5, active: possibleSocial.length > 0 },
    { label: "Site fraco ou ausente", points: 7, active: !website || tags.has("sem_site") },
    { label: "Você selecionou cidade", points: 5, active: tags.has("cidade_alvo") || Boolean(lead.city) },
    { label: "Você selecionou segmento", points: 5, active: tags.has("segmento_alvo") || Boolean(lead.segment) },
    { label: "Boa avaliação pública", points: 5, active: tags.has("boa_avaliacao") || Number(lead.rating || 0) >= 4.2 },
    { label: "Prova social", points: 4, active: tags.has("prova_social") || Number(lead.reviews || 0) >= 20 },
  ].filter((row) => row.active);
  return rows.slice(0, 8);
}

function leadTagLabel(tag: string) {
  const labels: Record<string, string> = {
    sem_site: "Sem site",
    whatsapp_confirmado: "WhatsApp confirmado",
    email_encontrado: "E-mail encontrado",
    cidade_alvo: "Cidade alvo",
    segmento_alvo: "Segmento alvo",
    boa_avaliacao: "Boa avaliação",
    prova_social: "Prova social",
    instagram_encontrado: "Instagram",
    facebook_encontrado: "Facebook",
    rede_social_confirmada: "Rede social",
    rede_social_possivel: "Rede possível",
    rede_social_sem_site: "Social sem site",
  };
  return labels[tag] || tag.replace(/_/g, " ");
}

function whatsappStatusLabel(status?: string | null) {
  if (status === "available" || status === "confirmed") return "WhatsApp verificado";
  if (status === "unavailable" || status === "missing") return "Sem WhatsApp";
  if (status === "invalid") return "Telefone inválido";
  return "WhatsApp pendente";
}

function nextBestActionLabel(action?: string | null) {
  if (action === "whatsapp") return "Chamar no WhatsApp";
  if (action === "call") return "Tentar ligação";
  if (action === "email") return "Enviar e-mail";
  if (action === "discard") return "Não chamar";
  return "Revisar card";
}

function getLeadWhatsappStatus(lead: LeadItem) {
  return leadWhatsappMotorStatus(lead);
}

function matchesWhatsappFilter(lead: LeadItem, filter: WhatsappFilter) {
  const status = getLeadWhatsappStatus(lead);
  if (filter === "with") return status === "available";
  if (filter === "without") return status === "unavailable";
  return true;
}

function isLeadInInbox(lead: LeadItem) {
  return Boolean(
    lead.isInInbox ||
    lead.inboxConversationId ||
    lead.atendimentoConversationId ||
    lead.sharedProfile?.presence?.atendimento?.present,
  );
}

function getLeadInboxConversationId(lead: LeadItem) {
  return String(
    lead.inboxConversationId ||
      lead.atendimentoConversationId ||
      lead.sharedProfile?.presence?.atendimento?.conversationId ||
      "",
  ).trim();
}

function matchesInboxFilter(lead: LeadItem, filter: InboxFilter) {
  if (filter === "in") return isLeadInInbox(lead);
  if (filter === "out") return !isLeadInInbox(lead);
  return true;
}

function nextInboxFilter(current: InboxFilter): InboxFilter {
  if (current === "all") return "in";
  if (current === "in") return "out";
  return "all";
}

function nextWhatsappFilter(current: WhatsappFilter): WhatsappFilter {
  if (current === "all") return "with";
  if (current === "with") return "without";
  return "all";
}

function sourceLabel(value?: string | null) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "webscraping") return "Radar Digital";
  if (normalized === "manual") return "Manual";
  return normalized || "Sem origem";
}

function statusLabel(status: LeadStatus) {
  return STATUS_OPTIONS.find((item) => item.value === status)?.label || status;
}

function normalizeSaleStatus(value?: string | null): SaleStatus {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "activation_pending") return "activation_pending";
  if (normalized === "trial_started") return "trial_started";
  if (normalized === "sale_confirmed") return "sale_confirmed";
  if (normalized === "inactive") return "inactive";
  if (normalized === "canceled") return "canceled";
  return "none";
}

function saleStatusLabel(status?: string | null) {
  const normalized = normalizeSaleStatus(status);
  return SALE_STATUS_OPTIONS.find((item) => item.value === normalized)?.label || "Sem venda";
}

function normalizeSalePlanKey(value?: string | null) {
  const normalized = String(value || "").trim().toLowerCase();
  return SALE_PLAN_OPTIONS.some((item) => item.value === normalized)
    ? normalized
    : "hbx_padrao";
}

function salePlanLabel(value?: string | null) {
  const normalized = normalizeSalePlanKey(value);
  return SALE_PLAN_OPTIONS.find((item) => item.value === normalized)?.label || "HBX Lead Plus";
}

function salePlanPrice(value?: string | null) {
  const normalized = normalizeSalePlanKey(value);
  return SALE_PLAN_OPTIONS.find((item) => item.value === normalized)?.monthlyPrice || 99;
}

function salePlanAmountInput(value?: string | null) {
  return salePlanPrice(value).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function commissionStatusLabel(status?: string | null) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "pending") return "Aguardando ativação";
  if (normalized === "payable") return "A receber";
  if (normalized === "paid") return "Pago";
  if (normalized === "canceled") return "Cancelado";
  return "Sem comissão";
}

function commissionSourceLabel(client: CommissionClient) {
  if (client.isInherited) {
    return client.isRecurring
      ? `Herdada recorrente ${client.recurringCycleKey || ""}`.trim()
      : "Herdada inicial";
  }
  if (client.isRecurring) return `Recorrente ${client.recurringCycleKey || ""}`.trim();
  if (client.commissionDueAt) return `Libera ${formatDateTime(client.commissionDueAt)}`;
  return commissionStatusLabel(client.commissionStatus);
}

function isCommissionDue(value?: string | null) {
  if (!value) return false;
  const dueAt = new Date(value).getTime();
  return Number.isFinite(dueAt) && dueAt <= Date.now();
}

function normalizeCommissionDueBusinessDays(value?: number | string | null) {
  const numeric = Math.trunc(Number(value));
  if (!Number.isFinite(numeric)) return 3;
  return Math.min(30, Math.max(0, numeric));
}

function commissionLifecycleLabel(client: CommissionClient, dueBusinessDays = 3) {
  const saleStatus = normalizeSaleStatus(client.saleStatus);
  const commissionStatus = String(client.commissionStatus || "").trim().toLowerCase();
  if (saleStatus === "activation_pending") {
    const syncSource = String(client.commissionSyncSource || "").trim().toLowerCase();
    if (syncSource.includes("auth_email_confirmed")) return "E-mail confirmado, aguardando ativação";
    if (client.commissionLinkedCompanyId) return "Cadastro criado, aguardando confirmação do e-mail";
    return "Link enviado, aguardando cadastro";
  }
  if (commissionStatus === "payable") {
    return isCommissionDue(client.commissionDueAt)
      ? "Liberado para pagamento"
      : `Libera em ${formatDateTime(client.commissionDueAt)}`;
  }
  if (commissionStatus === "paid") return `Pago ${formatDateTime(client.commissionPaidAt)}`;
  if (commissionStatus === "canceled" || saleStatus === "canceled") return "Comissão cancelada";
  if (saleStatus === "trial_started") return `Trial ativo, aguardando D+${dueBusinessDays}`;
  if (saleStatus === "sale_confirmed") return "Cliente ativo recorrente";
  if (saleStatus === "inactive") return "Cliente inativado";
  return commissionSourceLabel(client);
}

function commissionLifecycleTone(client: CommissionClient) {
  const saleStatus = normalizeSaleStatus(client.saleStatus);
  const commissionStatus = String(client.commissionStatus || "").trim().toLowerCase();
  if (saleStatus === "activation_pending" || commissionStatus === "pending") return "pending";
  if (commissionStatus === "payable") return isCommissionDue(client.commissionDueAt) ? "due" : "payable";
  if (commissionStatus === "paid") return "paid";
  if (commissionStatus === "canceled" || saleStatus === "inactive" || saleStatus === "canceled") return "inactive";
  return "active";
}

function formatCurrency(value?: number | null) {
  const numeric = Number(value || 0);
  return numeric.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatPercent(value?: number | null) {
  const numeric = Number(value || 0);
  return `${numeric.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

function parseCurrencyInput(value: string) {
  const normalized = String(value || "").trim().replace(/\./g, "").replace(",", ".");
  if (!normalized) return 0;
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.round(numeric * 100) / 100);
}

function leadCommissionPercent(lead: LeadItem) {
  const snapshot = Number(lead.commissionPercentSnapshot || 0);
  if (Number.isFinite(snapshot) && snapshot > 0) return Math.min(100, Math.max(0, snapshot));
  const ownerPercent = Number(lead.owner?.commissionPercent || 0);
  if (Number.isFinite(ownerPercent) && ownerPercent > 0) return Math.min(100, Math.max(0, ownerPercent));
  return 0;
}

function closingNextAction(status: SaleStatus) {
  if (status === "activation_pending") return "Acompanhar ativação do cliente";
  if (status === "trial_started") return "Confirmar evolução do trial";
  if (status === "sale_confirmed") return "Cliente fechado - acompanhar recorrência";
  if (status === "inactive") return "Cliente inativado";
  if (status === "canceled") return "Venda cancelada";
  return "Retomar venda";
}

function buildSaleClosingPatch(lead: LeadItem, draft: LeadDraft, status: SaleStatus): Partial<LeadDraft> {
  const planKey = normalizeSalePlanKey(draft.salePlanKey || lead.salePlanKey);
  const existingValue = parseCurrencyInput(draft.saleValue);
  return {
    saleStatus: status,
    salePlanKey: planKey,
    saleValue: existingValue > 0 ? draft.saleValue : salePlanAmountInput(planKey),
    status: status === "canceled" || status === "inactive" ? "encerrado" : "qualificado",
    nextAction: closingNextAction(status),
  };
}

function saleClosingFeedback(status: SaleStatus) {
  if (status === "activation_pending") return "Fechamento enviado para ativação.";
  if (status === "trial_started") return "Trial iniciado e comissão prevista.";
  if (status === "sale_confirmed") return "Pagamento confirmado e comissão recorrente.";
  if (status === "canceled") return "Venda cancelada no card.";
  if (status === "inactive") return "Cliente marcado como inativo.";
  return "Fechamento atualizado.";
}

function compactVendasMessage(message: string | null) {
  const text = String(message || "").trim();
  if (!text) return "";
  if (text.toLowerCase().includes("deve ser um e-mail válido")) {
    return "E-mail inválido. Remova ou informe um endereço válido.";
  }
  return text;
}

function setVendasCardDragLock(active: boolean) {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  if (active) {
    root.dataset.vendasDraggingCard = "true";
    root.dataset.hbxTopbarDragLock = "true";
    return;
  }

  delete root.dataset.vendasDraggingCard;
  delete root.dataset.hbxTopbarDragLock;
}

function createDraft(lead: LeadItem): LeadDraft {
  return {
    name: String(lead.name || ""),
    phone: String(lead.phone || ""),
    email: String(lead.email || ""),
    status: lead.status,
    nextAction: String(lead.nextAction || ""),
    returnAt: toDatetimeLocal(lead.returnAt),
    shortNote: String(lead.shortNote || ""),
    saleStatus: normalizeSaleStatus(lead.saleStatus),
    salePlanKey: lead.salePlanKey ? normalizeSalePlanKey(lead.salePlanKey) : "",
    saleValue: Number(lead.saleValue || lead.commissionBaseAmount || 0) > 0
      ? Number(lead.saleValue || lead.commissionBaseAmount || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })
      : "",
    commissionNote: String(lead.commissionNote || ""),
  };
}

function buildLeadWebscrapingSummary(lead: LeadItem) {
  const parts: string[] = [];
  if (lead.rating != null) parts.push(`Nota ${Number(lead.rating).toFixed(1)}`);
  if (Number(lead.reviews || 0) > 0)
    parts.push(`${Number(lead.reviews)} avaliações`);
  return parts.join(" • ");
}

function hydrateDrafts(board: BoardResponse | null) {
  const next: Record<string, LeadDraft> = {};
  if (!board) return next;
  (["overdue", "today", "scheduled", "closed"] as LeadBlockKey[]).forEach(
    (blockKey) => {
      (board.blocks[blockKey] || []).forEach((lead) => {
        next[lead.id] = createDraft(lead);
      });
    },
  );
  return next;
}

function mergeHydratedDraftsPreservingInput(
  board: BoardResponse | null,
  currentDrafts: Record<string, LeadDraft>,
) {
  const hydrated = hydrateDrafts(board);
  const next = { ...hydrated };
  Object.keys(currentDrafts).forEach((leadId) => {
    if (hydrated[leadId]) next[leadId] = currentDrafts[leadId];
  });
  try {
    return JSON.stringify(next) === JSON.stringify(currentDrafts)
      ? currentDrafts
      : next;
  } catch {
    return next;
  }
}

function buildLocalDateKey(value?: string | null) {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${`${parsed.getMonth() + 1}`.padStart(2, "0")}-${`${parsed.getDate()}`.padStart(2, "0")}`;
}

function railTitle(dateKey: string) {
  const parsed = new Date(`${dateKey}T12:00:00`);
  return Number.isNaN(parsed.getTime())
    ? "Programado"
    : parsed.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function railDay(dateKey: string) {
  const parsed = new Date(`${dateKey}T12:00:00`);
  return Number.isNaN(parsed.getTime())
    ? "Data"
    : parsed.toLocaleDateString("pt-BR", { weekday: "short" });
}

function pluralize(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function returnMeta(lead: LeadItem, draft: LeadDraft, block: LeadBlockKey) {
  const effective = draft.returnAt
    ? new Date(draft.returnAt).toISOString()
    : lead.returnAt || null;
  if (!effective)
    return { label: "Sem retorno definido", tone: "neutral" } as const;
  if (block === "overdue")
    return {
      label: `Atrasado desde ${formatDateTime(effective)}`,
      tone: "overdue",
    } as const;
  if (block === "today")
    return {
      label: `Hoje • ${formatDateTime(effective)}`,
      tone: "today",
    } as const;
  if (block === "scheduled")
    return {
      label: `Agendado • ${formatDateTime(effective)}`,
      tone: "scheduled",
    } as const;
  return {
    label: `Arquivo • ${formatShortDate(effective)}`,
    tone: "closed",
  } as const;
}

function timelineTone(type?: LeadTimelineEventType) {
  if (type === "lead_closed") return "closed";
  if (type === "return_scheduled") return "scheduled";
  if (type === "contact_made" || type === "result_recorded") return "contact";
  if (type === "origin_registered") return "origin";
  if (type === "lead_reused") return "existing";
  return "neutral";
}

function timelineMeta(event: LeadTimelineEvent) {
  if (event.eventType === "origin_registered")
    return event.sourceType === "webscraping"
      ? "Origem Radar Digital"
      : "Origem manual";
  if (event.eventType === "status_changed" && event.statusTo)
    return `Status ${event.statusTo}`;
  if (event.eventType === "result_recorded" && event.resultLabel)
    return event.resultLabel;
  if (event.eventType === "return_scheduled" && event.returnAt)
    return formatDateTime(event.returnAt);
  return event.createdAt ? formatDateTime(event.createdAt) : "Agora";
}

function recomputeSummary(blocks: BoardResponse["blocks"]) {
  return {
    total:
      blocks.overdue.length +
      blocks.today.length +
      blocks.scheduled.length +
      blocks.closed.length,
    today: blocks.today.length,
    overdue: blocks.overdue.length,
    scheduled: blocks.scheduled.length,
    closed: blocks.closed.length,
  };
}

function compareDateKeys(left: string, right: string) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function normalizeBoardForLocalAgenda(input: BoardResponse) {
  const todayKey = localDateKeyFromDate(new Date());
  const blocks: BoardResponse["blocks"] = {
    overdue: [],
    today: [],
    scheduled: [],
    closed: [],
  };

  const allLeads = [
    ...input.blocks.overdue,
    ...input.blocks.today,
    ...input.blocks.scheduled,
    ...input.blocks.closed,
  ];

  for (const lead of allLeads) {
    if (lead.status === "encerrado") {
      blocks.closed.push(lead);
      continue;
    }

    const leadDateKey = buildLocalDateKey(lead.returnAt || lead.updatedAt);
    if (!leadDateKey) {
      blocks.today.push(lead);
      continue;
    }

    const compare = compareDateKeys(leadDateKey, todayKey);
    if (compare < 0) blocks.overdue.push(lead);
    else if (compare > 0) blocks.scheduled.push(lead);
    else blocks.today.push(lead);
  }

  return {
    ...input,
    blocks,
    summary: recomputeSummary(blocks),
  };
}

function markBoardLeadsInInbox(
  board: BoardResponse | null,
  leadIds: string[],
  leadConversationIds?: Record<string, string | number>,
  fallbackConversationId?: string | number | null,
) {
  if (!board || !leadIds.length) return board;
  const targetIds = new Set(
    leadIds.map((leadId) => String(leadId || "").trim()).filter(Boolean),
  );
  if (!targetIds.size) return board;

  let changed = false;
  const blocks = Object.fromEntries(
    (["overdue", "today", "scheduled", "closed"] as LeadBlockKey[]).map(
      (blockKey) => [
        blockKey,
        (board.blocks[blockKey] || []).map((lead) => {
          if (!targetIds.has(lead.id)) return lead;
          const conversationId =
            leadConversationIds?.[lead.id] ||
            fallbackConversationId ||
            lead.inboxConversationId ||
            lead.atendimentoConversationId ||
            null;
          if (!conversationId && isLeadInInbox(lead)) return lead;
          changed = true;
          return {
            ...lead,
            isInInbox: true,
            inboxConversationId: conversationId,
            atendimentoConversationId: conversationId,
            sharedProfile: {
              ...(lead.sharedProfile || {}),
              presence: {
                ...(lead.sharedProfile?.presence || {}),
                atendimento: {
                  ...(lead.sharedProfile?.presence?.atendimento || {}),
                  present: true,
                  conversationId,
                },
              },
            },
          };
        }),
      ],
    ),
  ) as BoardResponse["blocks"];

  return changed ? { ...board, blocks } : board;
}

function formatDatetimeLocal(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function localDateKeyFromDate(date: Date) {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}`;
}

function buildTargetDatetimeLocal(
  dateKey: string,
  currentReturnAt?: string | null,
  fallbackHour = 9,
  fallbackMinute = 0,
) {
  const base = currentReturnAt
    ? new Date(currentReturnAt)
    : new Date(`${dateKey}T09:00:00`);
  const next = new Date(base);
  next.setFullYear(
    Number(dateKey.slice(0, 4)),
    Number(dateKey.slice(5, 7)) - 1,
    Number(dateKey.slice(8, 10)),
  );
  if (!currentReturnAt) next.setHours(fallbackHour, fallbackMinute, 0, 0);
  return formatDatetimeLocal(next);
}

function DateDropSlot({
  item,
  active,
  pulse,
  dragging,
  ignoreClick,
  onDateShortcut,
  onSelect,
  register,
}: {
  item: DateFilterItem;
  active: boolean;
  pulse: boolean;
  dragging: boolean;
  ignoreClick: () => boolean;
  onDateShortcut: () => void;
  onSelect: () => void;
  register: (node: HTMLElement | null) => void;
}) {
  const { isOver, setNodeRef: setDropRef } = useDroppable({
    id: item.key,
    data: { type: "date-filter", key: item.key },
  });
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: `date:${item.key}`,
    data: { type: "date-filter", key: item.key },
  });

  const setCombinedRef = (node: HTMLElement | null) => {
    setDropRef(node);
    setDragRef(node);
    register(node);
  };

  const rawSubtitle = String(item.subtitle || "").trim();
  let showSubtitle = Boolean(rawSubtitle);
  try {
    const normalized = rawSubtitle
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^\w\s]/g, "")
      .toLowerCase()
      .trim();
    if (
      ["sem pendencia", "fluxo principal", "sem agenda"].includes(normalized)
    ) {
      showSubtitle = false;
    }
  } catch {
    const fallback = rawSubtitle
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, "")
      .trim();
    if (["sem pendencia", "fluxo principal", "sem agenda"].includes(fallback)) {
      showSubtitle = false;
    }
  }

  // UX: hide the "retorno futuro" subtitle for scheduled date cards
  // (removes strings like "1 retorno futuro" that clutter the small cards)
  if (item.blockKey === "scheduled") {
    showSubtitle = false;
  }

  return (
    <div
      className={`${styles.dateFilterCard} hbx-guide5__item`}
      data-active={active ? "true" : "false"}
      data-tone={item.blockKey}
      data-dropover={isOver ? "true" : "false"}
      data-pulse={pulse ? "true" : "false"}
      data-dragging={dragging || isDragging ? "true" : "false"}
      onClick={() => {
        if (ignoreClick()) return;
        onSelect();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (ignoreClick()) return;
          onSelect();
        }
      }}
      ref={setCombinedRef}
      {...attributes}
      {...listeners}
    >
      <span className={styles.dateFilterDay}>{item.dayLabel}</span>
      <strong>{item.title}</strong>
      {showSubtitle ? <span>{item.subtitle}</span> : null}

      {active ? (
        <button
          type="button"
          className={styles.atendimentoShortcut}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onDateShortcut();
          }}
          title="Enviar cards visíveis desta data para Prospecção"
          aria-label="Enviar cards visíveis desta data para Prospecção"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ) : null}

      <AnimatedCount value={item.count} />
      <span className={styles.receiveHint}>Solte aqui</span>
    </div>
  );
}

function AnimatedCount({ value }: { value: number }) {
  const [displayed, setDisplayed] = useState(value);
  const [rolling, setRolling] = useState(false);
  const prevRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (prevRef.current === value) return;
    const from = prevRef.current;
    const to = value;
    prevRef.current = value;
    const diff = Math.abs(to - from);
    const DURATION = Math.max(240, Math.min(560, 220 + diff * 10));
    const startTime = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - startTime) / DURATION, 1);
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const current = Math.round(from + (to - from) * eased);
      setDisplayed(current);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplayed(to);
        setRolling(false);
      }
    };
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame((now) => {
      setRolling(true);
      tick(now);
    });
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [value]);

  return <b data-rolling={rolling ? "true" : "false"}>{displayed}</b>;
}

function LeadCardView({
  lead,
  draft,
  board,
  blockKey,
  selected,
  saving,
  onFocus,
  onQuickAction,
  onInboxAction,
  onEdit,
  onDraftChange,
  onEditingActiveChange,
  onSave,
  onCloseSale,
  onHbxHandoff,
  handoffLoading,
  onAssistedSignup,
  assistedSignupLoading,
  editing,
  bulkSelectionMode,
  bulkSelected,
  onBulkToggle,
}: LeadCardView) {
  const meta = returnMeta(lead, draft, blockKey);
  const signals = lead.signals || {
    alreadyExisted: Boolean((lead.timesSeen || 0) > 1),
    cameFromWebscraping:
      lead.sourceType === "webscraping" ||
      String(lead.primarySource || "").toLowerCase() === "webscraping",
    hadPreviousContact: Boolean(
      (lead.attemptCount || 0) > 0 || lead.lastContactAt,
    ),
    wasClosedBefore: Boolean(lead.wasClosedBefore),
  };
  const chips = [
    signals.alreadyExisted ? "Lead conhecido" : null,
    signals.cameFromWebscraping ? "Radar Digital" : null,
    signals.hadPreviousContact ? "Com histórico" : null,
    signals.wasClosedBefore ? "Já encerrado" : null,
    getLeadWhatsappStatus(lead) === "unavailable" ? "Sem WhatsApp" : null,
    lead.owner?.name ? `Resp.: ${lead.owner.name}` : null,
    lead.commissionLinkedCompanyId ? "Cadastro HBX vinculado" : null,
    normalizeSaleStatus(lead.saleStatus) !== "none" ? (lead.saleStatusLabel || saleStatusLabel(lead.saleStatus)) : null,
    Number(lead.commissionAmount || 0) > 0 ? `Comissão ${formatCurrency(lead.commissionAmount)}` : null,
    lead.city || null,
  ].filter(Boolean);

  const contactPhone = draft.phone || lead.phone;
  const callUrl = buildCallUrl(contactPhone);
  const whatsappConfirmed = isLeadWhatsappConfirmed(lead);
  const whatsappBlocked = !String(contactPhone || "").trim() || !whatsappConfirmed;
  const whatsappUrl = whatsappBlocked
    ? ""
    : buildWhatsAppUrl(contactPhone, draft.name || lead.name);
  const leadWebsiteHref = normalizeExternalUrl(leadWebsiteForDisplay(lead));
  const leadSource = lead.primarySource || lead.sourceType;
  const inInbox = isLeadInInbox(lead);
  const webscrapingSummary = buildLeadWebscrapingSummary(lead);
  const channelAssets = buildLeadChannelAssets(lead);
  const premiumBadge = leadEnrichmentBadgeState(lead, board);
  const closedView = leadClosedCardView(lead);
  const selectedSalePlanKey = normalizeSalePlanKey(draft.salePlanKey || lead.salePlanKey);
  const closingSaleValue = parseCurrencyInput(draft.saleValue) || salePlanPrice(selectedSalePlanKey);
  const commissionPercent = leadCommissionPercent(lead);
  const commissionPreview = (closingSaleValue * commissionPercent) / 100;
  const handleCardOpen = (event: { target: EventTarget | null }) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest("button,a,input,textarea,select,label")) return;
    onFocus();
  };

  // inline editor mount/animation control — uses global motion timings
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [editorRendered, setEditorRendered] = useState<boolean>(
    Boolean(editing),
  );
  const [editorAnimating, setEditorAnimating] = useState(false);

  useEffect(() => {
    const el = editorRef.current;
    const motion = HBX_WINDOW_STANDARD.motion;
    let timer: number | undefined;

    if (editing) {
      requestAnimationFrame(() => {
        setEditorRendered(true);
      });
      // open animation
      requestAnimationFrame(() => {
        if (!el) return;
        el.style.overflow = "hidden";
        el.style.maxHeight = "0px";
        el.style.opacity = "0";
        el.style.transition = `max-height ${motion.enterMs}ms ${motion.enterEasing}, opacity ${motion.enterMs}ms ${motion.enterEasing}`;
        requestAnimationFrame(() => {
          if (!el) return;
          el.style.maxHeight = `${el.scrollHeight}px`;
          el.style.opacity = "1";
        });
        requestAnimationFrame(() => {
          setEditorAnimating(true);
        });
        timer = window.setTimeout(() => {
          if (!el) return;
          el.style.maxHeight = "";
          el.style.overflow = "";
          el.style.transition = "";
          setEditorAnimating(false);
        }, motion.enterMs + 20);
      });
    } else {
      // close animation
      if (!el) {
        requestAnimationFrame(() => {
          setEditorRendered(false);
        });
      } else {
        el.style.overflow = "hidden";
        el.style.maxHeight = `${el.scrollHeight}px`;
        el.style.opacity = "1";
        el.style.transition = `max-height ${motion.exitMs}ms ${motion.exitEasing}, opacity ${motion.exitMs}ms ${motion.exitEasing}`;
        requestAnimationFrame(() => {
          if (!el) return;
          el.style.maxHeight = "0px";
          el.style.opacity = "0";
        });
        requestAnimationFrame(() => {
          setEditorAnimating(true);
        });
        timer = window.setTimeout(() => {
          setEditorAnimating(false);
          setEditorRendered(false);
          if (el) {
            el.style.maxHeight = "";
            el.style.overflow = "";
            el.style.transition = "";
          }
        }, motion.exitMs + 20);
      }
    }

    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [editing]);

  return (
    <LiquidGlassCard
      as="article"
      className={`${styles.leadCard} hbx-card-enter`}
      accentTone={
        blockKey === "today"
          ? "success"
          : blockKey === "overdue"
            ? "danger"
            : blockKey === "scheduled"
              ? "info"
              : "warning"
      }
      data-selected={selected ? "true" : "false"}
      data-bulk-selected={bulkSelected ? "true" : "false"}
      data-tone={blockKey}
      data-whatsapp={getLeadWhatsappStatus(lead)}
      onClick={handleCardOpen}
      header={
        <div
          className={styles.leadMainButton}
          role="button"
          tabIndex={0}
          onClick={onFocus}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onFocus();
            }
          }}
        >
          <div className={`${styles.leadCardTop} ${styles.vendasClosedCardTop}`}>
            {bulkSelectionMode ? (
              <button
                type="button"
                className={styles.bulkSelectCardButton}
                data-selected={bulkSelected ? "true" : "false"}
                aria-pressed={bulkSelected ? "true" : "false"}
                aria-label={
                  bulkSelected ? "Remover card da seleção" : "Selecionar card"
                }
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onBulkToggle?.(lead.id);
                }}
              >
                {bulkSelected ? "✓" : ""}
              </button>
            ) : null}
            <div className={styles.vendasClosedAvatar} data-product={closedView.productTone} aria-hidden="true">
              <span>{closedView.avatarText}</span>
            </div>
            <div className={styles.leadIdentity}>
              {leadSource &&
                String(leadSource).trim().toLowerCase() !== "manual" && (
                  <span
                    className={`${styles.leadEyebrow} ${glassCardStyles.eyebrow}`}
                  >
                    {sourceLabel(leadSource)}
                  </span>
                )}
              <strong className={`${styles.leadName} ${glassCardStyles.title}`}>
                {draft.name || closedView.title}
              </strong>
              <span
                className={`${styles.leadSubline} ${glassCardStyles.subtitle}`}
              >
                {lead.segment ? (
                  <>
                    {lead.segment}
                    {lead.city ? ` • ${lead.city}` : null}
                  </>
                ) : lead.city ? (
                  lead.city
                ) : null}
              </span>
              {closedView.phone ? (
                <span className={styles.vendasClosedPhoneLine}>
                  <HbxRadarPngIcon name="phone" />
                  {closedView.phone}
                </span>
              ) : null}
              <div className={styles.vendasClosedBadges} aria-label="Status do card">
                {closedView.badges.map((badge) => (
                  <span key={badge.key} data-tone={badge.tone}>
                    <HbxRadarPngIcon name={closedBadgeRadarIconName(badge.key)} />
                    {badge.label}
                  </span>
                ))}
              </div>
            </div>
            <div className={`${glassCardStyles.headerAside} ${styles.vendasClosedAside}`}>
              <span className={styles.vendasClosedProduct} data-product={closedView.productTone}>
                {closedView.productLabel}
              </span>
              <span className={styles.vendasClosedCredits}>
                <b>●</b> {closedView.creditLabel}
              </span>
              <span
                className={`${styles.returnBadge} ${glassCardStyles.pill} ${glassCardStyles.noBreak}`}
                data-tone={meta.tone}
              >
                {meta.label}
              </span>
              <button
                type="button"
                className={`${glassCardStyles.actionButton} ${glassCardStyles.noBreak}`}
                onClick={() => onEdit?.(lead.id)}
                aria-label="Editar"
              >
                Editar
              </button>
              <button
                type="button"
                className={`${styles.inboxLeadButton} ${glassCardStyles.actionButton} ${glassCardStyles.noBreak}`}
                data-state={inInbox ? "in" : "out"}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onInboxAction(lead);
                }}
                disabled={saving || blockKey === "closed"}
              >
                {inInbox ? "Inbox" : "Importar"}
              </button>
            </div>
          </div>
          <div className={styles.leadCardChannelRow} aria-label="Canais disponíveis">
            {channelAssets.map((asset) => {
              const label = MOBILE_CHANNEL_ASSETS[asset.channel].label;
              const icon = (
                <span
                  className={styles.mobileVendasChannelIcon}
                  data-channel={asset.channel}
                  data-compact="true"
                  data-locked={asset.locked ? "true" : "false"}
                  data-disabled={asset.disabled ? "true" : "false"}
                  title={label}
                >
                  <MobileChannelIconAsset channel={asset.channel} />
                </span>
              );
              if (asset.locked) {
                return (
                  <Link
                    key={asset.channel}
                    href={toMobileRoute("/planos?intent=lead")}
                    aria-label={`${label} disponível no HBX Lead Plus`}
                    onClick={(event) => event.stopPropagation()}
                  >
                    {icon}
                  </Link>
                );
              }
              if (asset.disabled) {
                return (
                  <span key={asset.channel} aria-label={`${label} indisponível`}>
                    {icon}
                  </span>
                );
              }
              return (
                <a
                  key={asset.channel}
                  href={asset.href}
                  target={asset.external ? "_blank" : undefined}
                  rel={asset.external ? "noreferrer" : undefined}
                  aria-label={label}
                  onClick={(event) => event.stopPropagation()}
                >
                  {icon}
                </a>
              );
            })}
            <Link
              href={toMobileRoute("/planos?intent=lead")}
              className={styles.leadCardPremiumIcon}
              data-state={premiumBadge?.state || "none"}
              aria-label={premiumBadge?.title || "HBX Lead Plus premium"}
              title={premiumBadge?.title || "HBX Lead Plus premium"}
              onClick={(event) => event.stopPropagation()}
            >
              <PremiumDocIcon />
            </Link>
          </div>
          <div className={glassCardStyles.cluster}>
            {chips.slice(0, 5).map((chip) => (
              <span
                key={`${lead.id}-${chip}`}
                className={`${styles.memoryChip} ${glassCardStyles.pill} ${glassCardStyles.noBreak}`}
              >
                {chip}
              </span>
            ))}
          </div>
        </div>
      }
      lead={
        editorRendered ? (
          <div
            ref={editorRef}
            className={styles.inlineEdit}
            aria-hidden={!editing && editorAnimating}
            onFocus={() => onEditingActiveChange?.(true)}
            onBlur={(event) => {
              const nextTarget = event.relatedTarget;
              if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
              onEditingActiveChange?.(false);
            }}
          >
            <div className={styles.fieldGrid}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Nome</span>
                <input
                  className={styles.fieldInput}
                  value={draft.name}
                  onChange={(e) =>
                    onDraftChange?.(lead.id, { name: e.target.value })
                  }
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Telefone</span>
                <input
                  className={styles.fieldInput}
                  value={draft.phone}
                  onChange={(e) =>
                    onDraftChange?.(lead.id, { phone: e.target.value })
                  }
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>E-mail</span>
                <input
                  className={styles.fieldInput}
                  value={draft.email}
                  onChange={(e) =>
                    onDraftChange?.(lead.id, { email: e.target.value })
                  }
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Status</span>
                <select
                  className={styles.fieldInput}
                  value={draft.status}
                  onChange={(e) =>
                    onDraftChange?.(lead.id, {
                      status: e.target.value as LeadStatus,
                    })
                  }
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Cliente</span>
                <select
                  className={styles.fieldInput}
                  value={draft.saleStatus}
                  onChange={(e) =>
                    onDraftChange?.(lead.id, {
                      saleStatus: normalizeSaleStatus(e.target.value),
                    })
                  }
                >
                  {SALE_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Plano HBX</span>
                <select
                  className={styles.fieldInput}
                  value={selectedSalePlanKey}
                  onChange={(e) => {
                    const salePlanKey = normalizeSalePlanKey(e.target.value);
                    onDraftChange?.(lead.id, {
                      salePlanKey,
                      saleValue: salePlanAmountInput(salePlanKey),
                    });
                  }}
                >
                  {SALE_PLAN_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Valor base</span>
                <input
                  className={styles.fieldInput}
                  inputMode="decimal"
                  placeholder="Ex.: 149,90"
                  value={draft.saleValue}
                  onChange={(e) =>
                    onDraftChange?.(lead.id, { saleValue: e.target.value })
                  }
                />
              </label>
              <div className={styles.hbxClosingPanel}>
                <header>
                  <div>
                    <span>Fechamento HBX</span>
                    <strong>{salePlanLabel(selectedSalePlanKey)} · {formatCurrency(closingSaleValue)}</strong>
                  </div>
                  <b>{commissionPercent > 0 ? `${formatCurrency(commissionPreview)} comissão` : "Sem comissão definida"}</b>
                </header>
                <div className={styles.hbxClosingSteps}>
                  {SALE_CLOSING_ACTIONS.map((action) => (
                    <button
                      type="button"
                      key={action.value}
                      data-tone={action.tone}
                      data-active={draft.saleStatus === action.value ? "true" : "false"}
                      onClick={() => onCloseSale?.(action.value)}
                      disabled={saving}
                      title={action.helper}
                    >
                      <strong>{action.label}</strong>
                      <span>{action.helper}</span>
                    </button>
                  ))}
                </div>
                <div className={styles.hbxClosingFooter}>
                  <div className={styles.hbxClosingFooterActions}>
                    <button
                      type="button"
                      onClick={onHbxHandoff}
                      disabled={saving || handoffLoading}
                    >
                      {handoffLoading ? "Gerando link" : "Copiar link HBX"}
                    </button>
                    <button
                      type="button"
                      data-variant="secondary"
                      onClick={onAssistedSignup}
                      disabled={saving || assistedSignupLoading}
                    >
                      {assistedSignupLoading ? "Cadastrando" : "Cadastrar cliente"}
                    </button>
                  </div>
                  <span>Cadastro rastreado para este card e comissão.</span>
                </div>
              </div>
              <label className={styles.fieldWide}>
                <span className={styles.fieldLabel}>Próxima ação</span>
                <input
                  className={styles.fieldInput}
                  value={draft.nextAction}
                  onChange={(e) =>
                    onDraftChange?.(lead.id, { nextAction: e.target.value })
                  }
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Retorno</span>
                <input
                  className={styles.fieldInput}
                  type="datetime-local"
                  value={draft.returnAt}
                  onChange={(e) =>
                    onDraftChange?.(lead.id, { returnAt: e.target.value })
                  }
                />
              </label>
              <label className={styles.fieldWide}>
                <span className={styles.fieldLabel}>Observação curta</span>
                <textarea
                  className={styles.fieldTextarea}
                  rows={3}
                  value={draft.shortNote}
                  onChange={(e) =>
                    onDraftChange?.(lead.id, { shortNote: e.target.value })
                  }
                />
              </label>
              <label className={styles.fieldWide}>
                <span className={styles.fieldLabel}>Nota de comissão</span>
                <textarea
                  className={styles.fieldTextarea}
                  rows={2}
                  value={draft.commissionNote}
                  onChange={(e) =>
                    onDraftChange?.(lead.id, { commissionNote: e.target.value })
                  }
                />
              </label>
            </div>
            <div className={styles.detailFooterActions}>
              <button
                type="button"
                className={`${glassCardStyles.actionButton} ${glassCardStyles.actionPrimary} ${glassCardStyles.noBreak}`}
                onClick={() => onSave?.(lead.id)}
                disabled={saving}
              >
                {saving ? "Salvando..." : "Salvar"}
              </button>
              <button
                type="button"
                className={`${glassCardStyles.actionButton} ${glassCardStyles.noBreak}`}
                onClick={() => onEdit?.(null)}
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : null
      }
      actions={
        <div className={styles.leadActionRow}>
          <button
            type="button"
            className={`${styles.desktopLeadOpenButton} ${glassCardStyles.actionButton} ${glassCardStyles.actionPrimary} ${glassCardStyles.noBreak}`}
            onClick={onFocus}
          >
            Abrir
          </button>
          <a
            className={`${glassCardStyles.actionButton} ${glassCardStyles.actionPrimary} ${styles.whatsappAction} ${glassCardStyles.noBreak} ${whatsappBlocked ? styles.whatsappUnavailable : ""}`}
            href={whatsappUrl || undefined}
            target={whatsappUrl ? "_blank" : undefined}
            rel={whatsappUrl ? "noreferrer" : undefined}
            aria-disabled={!whatsappUrl}
            title={
              whatsappBlocked
                ? "WhatsApp nao confirmado para este numero."
                : "Abrir conversa no WhatsApp"
            }
            onClick={() => {
              if (whatsappUrl) onQuickAction("tentativa_whatsapp");
            }}
          >
            {whatsappBlocked ? "Sem WA" : "WhatsApp"}
          </a>
          <a
            className={`${glassCardStyles.actionButton} ${styles.callAction} ${glassCardStyles.noBreak}`}
            href={callUrl || undefined}
            aria-disabled={!callUrl}
            onClick={() => {
              if (callUrl) onQuickAction("tentativa_call");
            }}
          >
            Ligar
          </a>
          <button
            type="button"
            className={`${glassCardStyles.actionButton} ${glassCardStyles.noBreak}`}
            onClick={() => onEdit?.(lead.id)}
            disabled={saving}
          >
            Venda
          </button>
          {lead.quickActions.includes("amanha") ? (
            <button
              type="button"
              className={`${glassCardStyles.actionButton} ${glassCardStyles.noBreak}`}
              onClick={() => onQuickAction("amanha")}
              disabled={saving}
            >
              Amanhã
            </button>
          ) : null}
          {lead.quickActions.includes("encerrar") ? (
            <button
              type="button"
              className={`${glassCardStyles.actionButton} ${glassCardStyles.noBreak}`}
              onClick={() => onQuickAction("encerrar")}
              disabled={saving}
            >
              Encerrar
            </button>
          ) : null}
          {lead.quickActions.includes("reabrir") ? (
            <button
              type="button"
              className={`${glassCardStyles.actionButton} ${glassCardStyles.noBreak}`}
              onClick={() => onQuickAction("reabrir")}
              disabled={saving}
            >
              Reabrir
            </button>
          ) : null}
        </div>
      }
      highlight={
        <div
          className={`${glassCardStyles.stack} ${styles.leadQuickReadStack}`}
        >
          <div className={styles.leadInfoBlock}>
            <span className={glassCardStyles.sectionLabel}>Endereço</span>
            <strong className={glassCardStyles.sectionTitle}>
              Localização
            </strong>
            <p className={glassCardStyles.bodyText}>
              {lead.address || "Sem endereço registrado."}
            </p>
          </div>
          <div className={styles.leadInfoBlock}>
            <span className={glassCardStyles.sectionLabel}>Resumo</span>
            <strong className={glassCardStyles.sectionTitle}>
              Leitura rapida
            </strong>
            <p className={glassCardStyles.bodyText}>
              {draft.shortNote ||
                lead.shortNote ||
                webscrapingSummary ||
                "Sem observação curta registrada."}
            </p>
          </div>
        </div>
      }
      metrics={
        <div className={glassCardStyles.metricGrid}>
          <div className={glassCardStyles.metricCard}>
            <span className={glassCardStyles.metricLabel}>Tentativas</span>
            <strong className={glassCardStyles.metricValue}>
              {lead.attemptCount || 0}
            </strong>
          </div>
          <div className={glassCardStyles.metricCard}>
            <span className={glassCardStyles.metricLabel}>Ultimo contato</span>
            <strong className={glassCardStyles.metricValue}>
              {formatShortDate(lead.lastContactAt)}
            </strong>
          </div>
          {lead.rating != null ? (
            <div className={glassCardStyles.metricCard}>
              <span className={glassCardStyles.metricLabel}>Nota</span>
              <strong className={glassCardStyles.metricValue}>
                {Number(lead.rating).toFixed(1)}
              </strong>
            </div>
          ) : null}
          {Number(lead.reviews || 0) > 0 ? (
            <div className={glassCardStyles.metricCard}>
              <span className={glassCardStyles.metricLabel}>Avaliacoes</span>
              <strong className={glassCardStyles.metricValue}>
                {lead.reviews}
              </strong>
            </div>
          ) : null}
        </div>
      }
    >
      {leadWebsiteHref ? (
        <div className={glassCardStyles.cluster}>
          <a
            className={`${glassCardStyles.actionButton} ${glassCardStyles.noBreak}`}
            href={leadWebsiteHref}
            target="_blank"
            rel="noreferrer"
          >
            Site
          </a>
        </div>
      ) : null}
    </LiquidGlassCard>
  );
}

function DraggableLeadCard({
  lead,
  draft,
  board,
  blockKey,
  selected,
  saving,
  disabled,
  hidden,
  onFocus,
  onQuickAction,
  onInboxAction,
  onEdit,
  onDraftChange,
  onSave,
  editing,
  bulkSelectionMode,
  bulkSelected,
  onBulkToggle,
  register,
}: LeadCardView & {
  disabled: boolean;
  hidden: boolean;
  register: (node: HTMLElement | null) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: lead.id,
    disabled,
    data: { type: "lead", leadId: lead.id },
  });

  return (
    <div
      className={styles.draggableWrap}
      data-dragging={isDragging ? "true" : "false"}
      data-flying={hidden ? "true" : "false"}
      ref={(node) => {
        setNodeRef(node);
        register(node);
      }}
      {...attributes}
      {...listeners}
    >
      <LeadCardView
        lead={lead}
        draft={draft}
        board={board}
        blockKey={blockKey}
        selected={selected}
        saving={saving}
        onFocus={onFocus}
        onQuickAction={onQuickAction}
        onInboxAction={onInboxAction}
        onEdit={onEdit}
        onDraftChange={onDraftChange}
        onSave={onSave}
        editing={editing}
        bulkSelectionMode={bulkSelectionMode}
        bulkSelected={bulkSelected}
        onBulkToggle={onBulkToggle}
      />
    </div>
  );
}

function SalesMotionBackground() {
  const bars = [32, 46, 60, 76, 94, 112, 130];
  const path = "M34 188 L58 188 L76 158 L96 170 L112 144 L130 156 L148 130 L166 142 L184 114 L202 126 L220 96 L238 108 L256 78 L274 90 L292 60";

  return (
    <div className={styles.salesMotionBackdrop} aria-hidden="true">
      <div className={styles.salesMotionAura} />
      <svg viewBox="0 0 360 250" focusable="false">
        <g className={styles.salesMotionGrid}>
          <path d="M32 194 H318" />
          <path d="M42 164 H306 M42 132 H306 M42 100 H306 M42 68 H306" />
          <path d="M80 48 V202 M128 48 V202 M176 48 V202 M224 48 V202 M272 48 V202" />
        </g>
        <g className={styles.salesMotionPipeline}>
          <rect x="254" y="154" width="72" height="42" rx="12" />
          <text x="290" y="181" textAnchor="middle">$</text>
        </g>
        <g transform="translate(70 32)">
          <line className={styles.salesMotionBaseLine} x1="24" y1="190" x2="282" y2="190" />
          {bars.map((height, index) => (
            <rect
              key={height}
              className={styles.salesMotionBar}
              x={index * 36 + 64}
              y={190 - height}
              width="24"
              height={height}
              rx="4"
              style={{ animationDelay: `${index * 0.18}s` }}
            />
          ))}
          <path className={styles.salesMotionLine} d={path} />
          {bars.map((height, index) => (
            <circle
              key={`hit-${height}`}
              className={styles.salesMotionHitDot}
              cx={index * 36 + 76}
              cy={190 - height}
              r="4.5"
              style={{ animationDelay: `${0.72 + index * 0.39}s` }}
            />
          ))}
          <circle className={styles.salesMotionDot} cx="292" cy="60" r="5" />
          <path className={styles.salesMotionArrow} d="M292 60 l-2 22 l19 -13 z" />
        </g>
        <g className={styles.salesMotionDeals}>
          <circle cx="52" cy="184" r="3" />
          <circle cx="118" cy="142" r="2.5" />
          <circle cx="176" cy="121" r="2.5" />
          <circle cx="258" cy="78" r="3" />
        </g>
        <g className={styles.salesMotionCoins}>
          <circle cx="310" cy="116" r="9" />
          <text x="310" y="121" textAnchor="middle">$</text>
          <circle cx="50" cy="64" r="6" />
          <path d="M47 64 H53" />
        </g>
        <defs>
          <linearGradient id="salesMotionBarGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.98" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.35" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

export default function VendasClientPage({ mobileRoute = false }: { mobileRoute?: boolean } = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  useEffect(() => {
    if (!mobileRoute || typeof document === "undefined") return;

    const root = document.body;
    let frame = 0;
    const repair = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        repairPtBrMojibakeNode(root);
      });
    };

    repair();
    const observer = new MutationObserver(repair);
    observer.observe(root, {
      attributes: true,
      attributeFilter: [...PT_BR_TEXT_ATTRIBUTES_TO_REPAIR],
      characterData: true,
      childList: true,
      subtree: true,
    });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [mobileRoute]);

  useEffect(() => {
    if (mobileRoute || typeof window === "undefined") return;
    if (!shouldUseMobileRoute(window.location.pathname)) return;
    router.replace(toMobileRoute(`${window.location.pathname}${window.location.search}${window.location.hash}`));
  }, [mobileRoute, router]);

  const hasToken = useRequireModule("vendas");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [drafts, setDrafts] = useState<Record<string, LeadDraft>>({});
  const [savingLeadId, setSavingLeadId] = useState<string | null>(null);
  const [handoffLeadId, setHandoffLeadId] = useState<string | null>(null);
  const [assistedSignupLead, setAssistedSignupLead] = useState<LeadItem | null>(null);
  const [assistedSignupDraft, setAssistedSignupDraft] = useState<AssistedSignupDraft>({
    companyName: "",
    contactName: "",
    email: "",
    phone: "",
    password: "",
    salePlanKey: "hbx_padrao",
  });
  const [assistedSignupSaving, setAssistedSignupSaving] = useState(false);
  const [assistedSignupResult, setAssistedSignupResult] = useState<HbxAssistedSignupResponse | null>(null);
  const [creatingManual, setCreatingManual] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const mobileSearch = "";
  const [selectedMobileLeadId, setSelectedMobileLeadId] = useState<string | null>(null);
  const [mobileReturnScheduler, setMobileReturnScheduler] =
    useState<MobileReturnScheduler | null>(null);
  const [mobileReturnScheduleError, setMobileReturnScheduleError] =
    useState<string | null>(null);
  const [mobileAnimatedScore, setMobileAnimatedScore] = useState(0);
  const [mobileScoreLead, setMobileScoreLead] = useState<LeadItem | null>(null);
  const [mobileVisualChannelFilters, setMobileVisualChannelFilters] = useState<MobileVisualChannelFilter[]>([]);
  const [mobileMinScoreFilter, setMobileMinScoreFilter] = useState(0);
  const [mobileScoreFilterOpen, setMobileScoreFilterOpen] = useState(false);
  const [mobileNoteLead, setMobileNoteLead] = useState<LeadItem | null>(null);
  const [mobileNoteDraft, setMobileNoteDraft] = useState("");
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const [mobileSavingNote, setMobileSavingNote] = useState(false);
  const [mobileEnrichmentLoadingId, setMobileEnrichmentLoadingId] = useState<string | null>(null);
  const [mobileTemplateIndex, setMobileTemplateIndex] = useState(() => readMobileReadyMessagePreference());
  const [mobileReportLead, setMobileReportLead] = useState<LeadItem | null>(null);
  const [mobileReportReason, setMobileReportReason] = useState("");
  const [mobileReporting, setMobileReporting] = useState(false);
  const [mobileDeletingLead, setMobileDeletingLead] = useState(false);
  const [mobileBulkDeleteTarget, setMobileBulkDeleteTarget] =
    useState<MobileBulkDeleteTarget | null>(null);
  const [mobileBulkHoldTab, setMobileBulkHoldTab] = useState<
    MobileBulkDeleteTarget["tab"] | null
  >(null);
  const [whatsappFilter, setWhatsappFilter] = useState<WhatsappFilter>("all");
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>("all");
  const [bulkSelectionMode, setBulkSelectionMode] = useState(false);
  const [selectedBulkLeadIds, setSelectedBulkLeadIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [bulkSelectAllAccount, setBulkSelectAllAccount] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteConfirmation, setBulkDeleteConfirmation] =
    useState<BulkDeleteConfirmation | null>(null);
  const [vendasVisualCount, setVendasVisualCount] = useState(0);
  const [storedRadarRun, setStoredRadarRun] = useState<StoredRadarRun | null>(null);
  const [liveRadarRun, setLiveRadarRun] = useState<RadarSearchRunResponse | null>(null);
  const [radarStatusPulseKey, setRadarStatusPulseKey] = useState(0);
  const [selectedDateKey, setSelectedDateKey] =
    useState<DateFilterKey>("today");
  const [mobileAgendaTab, setMobileAgendaTab] =
    useState<MobileAgendaTab>("today");
  const [mobileSection, setMobileSection] = useState<MobileVendasSection>("today");
  const [salesProfile, setSalesProfile] = useState<SalesProfileResponse | null>(null);
  const [salesProfileDraft, setSalesProfileDraft] = useState<SalesProfileDraft>(SALES_PROFILE_DEFAULT_DRAFT);
  const [salesProfileSaving, setSalesProfileSaving] = useState(false);
  const [salesProfileSuggestion, setSalesProfileSuggestion] = useState<SalesProfileSuggestion | null>(null);
  const [conversionReport, setConversionReport] = useState<ConversionReportResponse | null>(null);
  const [conversionReportPeriod, setConversionReportPeriod] = useState<"today" | "7d" | "30d">("7d");
  const [conversionReportLoading, setConversionReportLoading] = useState(false);
  const [sellerAudit, setSellerAudit] = useState<SellerAuditResponse | null>(null);
  const [sellerAuditPeriod, setSellerAuditPeriod] = useState<"today" | "7d">("today");
  const [sellerAuditLoading, setSellerAuditLoading] = useState(false);
  const [sellerGovernanceSaving, setSellerGovernanceSaving] = useState<string | null>(null);
  const [commissionSummary, setCommissionSummary] = useState<CommissionSummaryResponse | null>(null);
  const [commissionLoading, setCommissionLoading] = useState(false);
  const [commissionPayoutSaving, setCommissionPayoutSaving] = useState<string | null>(null);
  const [commissionReceipt, setCommissionReceipt] = useState<CommissionPayoutDetail | null>(null);
  const [commissionReceiptLoadingId, setCommissionReceiptLoadingId] = useState<string | null>(null);
  const [commissionPayoutCancelingId, setCommissionPayoutCancelingId] = useState<string | null>(null);
  const [conversationSnapshot, setConversationSnapshot] = useState<LeadConversationSnapshot | null>(null);
  const [conversationSnapshotLoading, setConversationSnapshotLoading] = useState(false);
  const [conversationSnapshotError, setConversationSnapshotError] = useState<string | null>(null);
  const [crmIntegrity, setCrmIntegrity] = useState<CrmIntegrityResponse | null>(null);
  const [crmIntegrityLoading, setCrmIntegrityLoading] = useState(false);
  const [hbxClosingPipeline, setHbxClosingPipeline] = useState<HbxClosingPipelineResponse | null>(null);
  const [hbxClosingLoading, setHbxClosingLoading] = useState(false);
  const [pulseRefreshKey, setPulseRefreshKey] = useState(0);
  const [desktopVendasTab, setDesktopVendasTab] = useState<DesktopVendasTab>("clientes");
  const [masterNoticeAudience, setMasterNoticeAudience] = useState<MasterNoticeAudience>("seller");
  const [masterNotices, setMasterNotices] = useState<MasterNotice[]>([]);
  const [masterNoticeCanManage, setMasterNoticeCanManage] = useState(false);
  const [masterNoticeCenterOpen, setMasterNoticeCenterOpen] = useState(false);
  const [masterNoticeDraft, setMasterNoticeDraft] = useState<MasterNoticeDraft>(() => createMasterNoticeDefaultDraft("seller"));
  const [masterNoticeSaving, setMasterNoticeSaving] = useState(false);
  const [masterNoticeSecondsLeft, setMasterNoticeSecondsLeft] = useState(0);
  const [activeForcedNoticeId, setActiveForcedNoticeId] = useState<string | null>(null);
  const [referredSellerName, setReferredSellerName] = useState("");
  const [referredSellerPhone, setReferredSellerPhone] = useState("");
  const [referredSellerNote, setReferredSellerNote] = useState("");
  const [referredSellerCreating, setReferredSellerCreating] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [desktopReturnMonthKey, setDesktopReturnMonthKey] = useState("");
  const [desktopReturnDrafts, setDesktopReturnDrafts] = useState<Record<string, string>>({});
  const [desktopObservationDrafts, setDesktopObservationDrafts] = useState<Record<string, string>>({});
  const [desktopTemplateIndex, setDesktopTemplateIndex] = useState(0);
  const [desktopTemplateEditorOpen, setDesktopTemplateEditorOpen] = useState(false);
  const [desktopReadyTemplateTexts, setDesktopReadyTemplateTexts] = useState<string[]>(() => readDesktopReadyMessageLibrary());
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [accountSheetOpen, setAccountSheetOpen] = useState(false);
  const [accountNameDraft, setAccountNameDraft] = useState("");
  const [mobilePreferredCallerName, setMobilePreferredCallerName] = useState("");
  const [mobileAutoEnrichmentActive, setMobileAutoEnrichmentActive] = useState(() => readMobileAutoEnrichmentPreference());
  const [accountProfile, setAccountProfile] = useState<{
    email?: string | null;
    company?: {
      paymentStatus?: string | null;
      subscriptionStatus?: string | null;
      premiumAccess?: boolean | null;
    } | null;
  } | null>(null);
  const [accountProfileLoading, setAccountProfileLoading] = useState(false);
  const composerOpenRef = useRef(false);
  const mobileSkipDraftHydrateRef = useRef(false);
  const desktopTemplateTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    saveDesktopReadyMessageLibrary(desktopReadyTemplateTexts);
  }, [desktopReadyTemplateTexts]);

  const [activeDragLeadId, setActiveDragLeadId] = useState<string | null>(null);
  const [activeDragDateKey, setActiveDragDateKey] = useState<string | null>(
    null,
  );
  const [activeDragRect, setActiveDragRect] = useState<{ width: number; height: number } | null>(null);
  const [pulseDateKey, setPulseDateKey] = useState<DateFilterKey | null>(null);
  const [flyAnimation, setFlyAnimation] = useState<FlyAnimation | null>(null);
  const [manualLead, setManualLead] = useState({
    name: "",
    phone: "",
    email: "",
    nextAction: "Primeiro contato",
    returnAt: plusDaysDatetimeLocal(0),
    shortNote: "",
    saleStatus: "none",
    salePlanKey: "",
    saleValue: "",
    commissionNote: "",
  });
  const leadCardRefs = useRef<Record<string, HTMLElement | null>>({});
  const leadStableOrderRef = useRef<Record<string, number>>({});
  const leadStableOrderNextRef = useRef(1);
  const boardRef = useRef<BoardResponse | null>(null);
  const dateFilterRefs = useRef<Record<string, HTMLElement | null>>({});
  const archiveRef = useRef<HTMLElement | null>(null);
  const editingInputActiveRef = useRef(false);
  const pendingVisualBoardRef = useRef<BoardResponse | null>(null);
  const lastDragEndedAtRef = useRef(0);
  const dragVisualCleanupTimerRef = useRef<number | null>(null);
  const filterScrollerRef = useRef<HTMLDivElement | null>(null);
  const mobileBulkHoldTimerRef = useRef<number | null>(null);
  const mobileBulkHoldCompletedRef = useRef(false);
  const mobileDeepLinkHandledRef = useRef("");
  const lastRadarStatusSnapshotRef = useRef<{ count: number; status: string } | null>(null);
  const mobileScoreAnimatedKeyRef = useRef<string | null>(null);
  const mobileScoreAnimationRunRef = useRef(0);
  const lastRadarBoardRefreshCountRef = useRef(0);
  const lastRadarAutoImportRefreshKeyRef = useRef("");
  const radarBoardRefreshInFlightRef = useRef(false);
  const latestRadarRunHydratedRef = useRef(false);
  const todayAgendaLaunchNotice = useQuickLaunchNotice();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 18 } }),
  );

  const clearVendasDragVisualState = useCallback(() => {
    if (dragVisualCleanupTimerRef.current != null && typeof window !== "undefined") {
      window.clearTimeout(dragVisualCleanupTimerRef.current);
      dragVisualCleanupTimerRef.current = null;
    }
    setVendasCardDragLock(false);
    setActiveDragLeadId(null);
    setActiveDragDateKey(null);
    setActiveDragRect(null);
    lastDragEndedAtRef.current = performance.now();
  }, []);
  const commissionDueDays = normalizeCommissionDueBusinessDays(commissionSummary?.settings?.dueBusinessDays);
  const desktopAdminMenusEnabled = Boolean(
    sellerAudit?.canManage ||
      commissionSummary?.canPayout ||
      commissionSummary?.scope === "company" ||
      crmIntegrity?.canManage ||
      crmIntegrity?.scope === "company" ||
      hbxClosingPipeline?.canManage ||
      hbxClosingPipeline?.scope === "company" ||
      masterNoticeCanManage,
  );

  useEffect(() => {
    if (!desktopAdminMenusEnabled && desktopVendasTab !== "clientes") {
      setDesktopVendasTab("clientes");
    }
  }, [desktopAdminMenusEnabled, desktopVendasTab]);

  useEffect(() => {
    if (mobileRoute || typeof window === "undefined") return undefined;
    const handleDesktopMasterNotices = () => setMasterNoticeCenterOpen(true);
    window.addEventListener("hbx:vendas-master-notices", handleDesktopMasterNotices);
    return () => window.removeEventListener("hbx:vendas-master-notices", handleDesktopMasterNotices);
  }, [mobileRoute]);

  const detectDateFilterCollision = useMemo<CollisionDetection>(
    () =>
      ({ pointerCoordinates, droppableContainers }) => {
        if (!pointerCoordinates) return [];

        for (const container of droppableContainers) {
          const id = String(container.id);
          const node = dateFilterRefs.current[id];
          const rect = node?.getBoundingClientRect();
          if (!rect) continue;

          if (
            pointerCoordinates.x >= rect.left &&
            pointerCoordinates.x <= rect.right &&
            pointerCoordinates.y >= rect.top &&
            pointerCoordinates.y <= rect.bottom
          ) {
            return [
              {
                id: container.id,
                data: { droppableContainer: container, value: 0 },
              },
            ];
          }
        }

        return [];
      },
    [],
  );

  function applyBoardPayload(
    normalizedPayload: BoardResponse,
    options?: { forceHydrateDrafts?: boolean },
  ) {
    setBoard((previous) =>
      boardsPayloadEqual(previous, normalizedPayload) ? previous : normalizedPayload,
    );
    const skipHydrate =
      !options?.forceHydrateDrafts &&
      (composerOpenRef.current ||
        editingInputActiveRef.current ||
        Boolean(editingLeadId) ||
        (mobileRoute && mobileSkipDraftHydrateRef.current));
    if (skipHydrate) {
      setDrafts((current) =>
        mergeHydratedDraftsPreservingInput(normalizedPayload, current),
      );
    } else {
      setDrafts(hydrateDrafts(normalizedPayload));
    }
  }

  async function loadBoard(options?: {
    forceHydrateDrafts?: boolean;
    forceVisualRefresh?: boolean;
  }) {
    setError(null);
    try {
      const payload = await apiFetch<BoardResponse>("/vendas/board");
      const normalizedPayload = normalizeBoardForLocalAgenda(payload);
      if (!options?.forceVisualRefresh && isTextEntryElementActive()) {
        pendingVisualBoardRef.current = normalizedPayload;
      } else {
        pendingVisualBoardRef.current = null;
        applyBoardPayload(normalizedPayload, options);
      }
      setPulseRefreshKey((current) => current + 1);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Falha ao carregar o CRM de Vendas.",
      );
    } finally {
      setLoading(false);
    }
  }

  const loadBoardRef = useRef(loadBoard);

  useEffect(() => {
    loadBoardRef.current = loadBoard;
  });

  const hasEnrichingLead = useMemo(() => {
    if (!board) return false;
    return (["overdue", "today", "scheduled", "closed"] as LeadBlockKey[]).some((blockKey) =>
      (board.blocks[blockKey] || []).some((lead) => leadEnrichmentBadgeState(lead, board)?.state === "enriching"),
    );
  }, [board]);

  async function loadSalesProfile() {
    try {
      const payload = await apiFetch<SalesProfileResponse>("/vendas/sales-profile");
      setSalesProfile(payload);
      setSalesProfileDraft(salesProfileDraftFromResponse(payload));
    } catch {
      setSalesProfile(null);
      setSalesProfileDraft(SALES_PROFILE_DEFAULT_DRAFT);
    }
  }

  async function saveSalesProfile() {
    setSalesProfileSaving(true);
    setError(null);
    try {
      const payload = await apiFetch<SalesProfileResponse>("/vendas/sales-profile", {
        method: "PATCH",
        body: JSON.stringify({
          whatDoYouSell: salesProfileDraft.whatDoYouSell,
          offerCategory: salesProfileDraft.offerCategory,
          targetAudience: { labels: salesProfileDraft.targetAudience },
          targetSegments: { labels: salesProfileDraft.targetSegments },
          avoidSegments: {
            labels: salesProfileDraft.avoidSegments,
            hardReject: salesProfileDraft.avoidSegments.filter((item) =>
              /órgão|orgao|diretório|diretorio|sem telefone|segmento errado/i.test(item),
            ),
          },
          preferredChannels: salesProfileDraft.preferredChannels,
          leadPreferences: {
            preferSmallBusiness: true,
            preferNoWebsite: true,
            preferInstagram: salesProfileDraft.preferredChannels.includes("instagram"),
            preferWhatsapp: salesProfileDraft.preferredChannels.includes("whatsapp"),
            preferHighReviews: true,
            preferLocalBusiness: true,
          },
          negativeRules: {
            avoidPublicSector: salesProfileDraft.avoidSegments.some((item) => /órgão|orgao/i.test(item)),
            avoidLargeCompanies: salesProfileDraft.avoidSegments.some((item) => /grande/i.test(item)),
            avoidDirectories: salesProfileDraft.avoidSegments.some((item) => /diretório|diretorio|lista/i.test(item)),
            avoidNoPhone: salesProfileDraft.avoidSegments.some((item) => /sem telefone/i.test(item)),
            avoidNoWhatsapp: salesProfileDraft.avoidSegments.some((item) => /sem whatsapp/i.test(item)),
            avoidOutOfCity: salesProfileDraft.avoidSegments.some((item) => /fora da cidade/i.test(item)),
          },
          weeklyAutoUpdateEnabled: salesProfileDraft.weeklyAutoUpdateEnabled,
        }),
      });
      setSalesProfile(payload);
      setSalesProfileDraft(salesProfileDraftFromResponse(payload));
      setFeedback("Perfil de Venda salvo.");
    } catch (profileError) {
      setError(profileError instanceof Error ? profileError.message : "Falha ao salvar Perfil de Venda.");
    } finally {
      setSalesProfileSaving(false);
    }
  }

  async function suggestSalesProfile() {
    setSalesProfileSaving(true);
    setError(null);
    try {
      const payload = await apiFetch<{ suggestion?: SalesProfileSuggestion | null }>("/vendas/sales-profile/suggest-weekly", {
        method: "POST",
      });
      setSalesProfileSuggestion(payload.suggestion || null);
      setFeedback("Sugestão gerada com base na semana.");
    } catch (profileError) {
      setError(profileError instanceof Error ? profileError.message : "Falha ao gerar sugestão.");
    } finally {
      setSalesProfileSaving(false);
    }
  }

  async function loadConversionReport(period = conversionReportPeriod) {
    setConversionReportLoading(true);
    try {
      const payload = await apiFetch<ConversionReportResponse>(`/vendas/report?period=${encodeURIComponent(period)}`);
      setConversionReport(payload);
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : "Falha ao carregar relatório.");
    } finally {
      setConversionReportLoading(false);
    }
  }

  async function loadSellerAudit(period = sellerAuditPeriod) {
    setSellerAuditLoading(true);
    try {
      const payload = await apiFetch<SellerAuditResponse>(`/vendas/seller-audit?period=${encodeURIComponent(period)}`);
      setSellerAudit(payload);
    } catch (auditError) {
      setError(auditError instanceof Error ? auditError.message : "Falha ao carregar operação dos vendedores.");
    } finally {
      setSellerAuditLoading(false);
    }
  }

  const loadConversionReportRef = useRef(loadConversionReport);
  const loadSellerAuditRef = useRef(loadSellerAudit);

  useEffect(() => {
    loadConversionReportRef.current = loadConversionReport;
    loadSellerAuditRef.current = loadSellerAudit;
  });

  async function updateSellerGovernance(
    sellerId: number,
    input: { mode?: string; pausedDays?: number; pausedUntil?: string | null; dailyLimitOverride?: number | null; note?: string | null },
  ) {
    const key = `${sellerId}:${input.mode || "limit"}`;
    setSellerGovernanceSaving(key);
    setError(null);
    try {
      const payload = await apiFetch<{ message?: string }>(`/vendas/seller-audit/${sellerId}/governance`, {
        method: "PATCH",
        body: JSON.stringify(input),
      });
      setFeedback(payload.message || "Governança do vendedor atualizada.");
      await loadSellerAudit(sellerAuditPeriod);
    } catch (governanceError) {
      setError(governanceError instanceof Error ? governanceError.message : "Falha ao ajustar governança do vendedor.");
    } finally {
      setSellerGovernanceSaving(null);
    }
  }

  async function loadCommissionSummary() {
    setCommissionLoading(true);
    try {
      const payload = await apiFetch<CommissionSummaryResponse>("/vendas/commission/summary");
      setCommissionSummary(payload);
    } catch (commissionError) {
      setError(commissionError instanceof Error ? commissionError.message : "Falha ao carregar comissões.");
    } finally {
      setCommissionLoading(false);
    }
  }

  async function createCommissionPayout(sellerUserId?: number | null) {
    const key = sellerUserId ? `seller:${sellerUserId}` : "all";
    setCommissionPayoutSaving(key);
    setError(null);
    try {
      const payload = await apiFetch<{ message?: string; payout?: CommissionPayout }>("/vendas/commission/payout", {
        method: "POST",
        body: JSON.stringify({
          sellerUserId: sellerUserId || undefined,
          referenceLabel: sellerUserId ? `Fechamento D+${commissionDueDays} vendedor` : `Fechamento D+${commissionDueDays} geral`,
          notes: "Pagamento registrado manualmente no painel de comissão.",
        }),
      });
      setFeedback(payload.message || "Pagamento de comissão registrado.");
      await loadCommissionSummary();
      await loadHbxClosingPipeline();
      await loadCrmIntegrity();
    } catch (payoutError) {
      setError(payoutError instanceof Error ? payoutError.message : "Falha ao registrar pagamento de comissão.");
    } finally {
      setCommissionPayoutSaving(null);
    }
  }

  async function openCommissionReceipt(payoutId?: string | null) {
    const normalizedPayoutId = String(payoutId || "").trim();
    if (!normalizedPayoutId) return;
    setCommissionReceiptLoadingId(normalizedPayoutId);
    setError(null);
    try {
      const payload = await apiFetch<CommissionPayoutDetail>(`/vendas/commission/payout/${encodeURIComponent(normalizedPayoutId)}`);
      setCommissionReceipt(payload);
    } catch (receiptError) {
      setError(receiptError instanceof Error ? receiptError.message : "Falha ao abrir comprovante de comissão.");
    } finally {
      setCommissionReceiptLoadingId(null);
    }
  }

  async function cancelCommissionPayout(payoutId?: string | null) {
    const normalizedPayoutId = String(payoutId || "").trim();
    if (!normalizedPayoutId) return;
    if (typeof window !== "undefined") {
      const confirmed = window.confirm("Cancelar este fechamento e devolver as comissões para D+ a pagar?");
      if (!confirmed) return;
    }
    setCommissionPayoutCancelingId(normalizedPayoutId);
    setError(null);
    try {
      const payload = await apiFetch<{ message?: string }>(
        `/vendas/commission/payout/${encodeURIComponent(normalizedPayoutId)}/cancel`,
        {
          method: "POST",
          body: JSON.stringify({
            notes: "Cancelamento manual pelo painel de comprovante.",
          }),
        },
      );
      setFeedback(payload.message || "Fechamento de comissão cancelado.");
      setCommissionReceipt(null);
      await loadCommissionSummary();
      await loadHbxClosingPipeline();
      await loadCrmIntegrity();
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Falha ao cancelar fechamento de comissão.");
    } finally {
      setCommissionPayoutCancelingId(null);
    }
  }

  async function loadCrmIntegrity() {
    setCrmIntegrityLoading(true);
    try {
      const payload = await apiFetch<CrmIntegrityResponse>("/vendas/crm-integrity");
      setCrmIntegrity(payload);
    } catch (auditError) {
      setError(auditError instanceof Error ? auditError.message : "Falha ao auditar integridade do CRM.");
    } finally {
      setCrmIntegrityLoading(false);
    }
  }

  async function loadHbxClosingPipeline() {
    setHbxClosingLoading(true);
    try {
      const payload = await apiFetch<HbxClosingPipelineResponse>("/vendas/hbx-closing-pipeline");
      setHbxClosingPipeline(payload);
    } catch (closingError) {
      setError(closingError instanceof Error ? closingError.message : "Falha ao carregar esteira HBX.");
    } finally {
      setHbxClosingLoading(false);
    }
  }

  function openHbxClosingLead(leadId?: string | null) {
    const normalizedLeadId = String(leadId || "").trim();
    if (!normalizedLeadId) return;
    setSelectedLeadId(normalizedLeadId);
    primeDesktopReturnMonth(normalizedLeadId);
    if (mobileRoute) setMobileSection("today");
    setFeedback("Card aberto na agenda de Vendas.");
  }

  async function loadMasterNotices(audience?: MasterNoticeAudience) {
    try {
      const payload = await apiFetch<MasterNoticeListResponse>(
        audience
          ? `/vendas/master-notices?audience=${encodeURIComponent(audience)}`
          : "/vendas/master-notices",
      );
      setMasterNoticeCanManage(Boolean(payload.canManage));
      if (payload.audience) {
        setMasterNoticeAudience(payload.audience);
        setMasterNoticeDraft((current) => ({ ...current, audience: payload.audience || current.audience }));
      }
      setMasterNotices(Array.isArray(payload.notices) ? payload.notices : []);
    } catch {
      setMasterNotices([]);
    }
  }

  async function acknowledgeMasterNotice(noticeId: string) {
    if (!noticeId) return;
    setMasterNotices((current) =>
      current.map((notice) =>
        notice.id === noticeId
          ? { ...notice, acknowledged: true, acknowledgedAt: new Date().toISOString() }
          : notice,
      ),
    );
    try {
      await apiFetch(`/vendas/master-notices/${encodeURIComponent(noticeId)}/ack`, {
        method: "POST",
      });
    } catch (noticeError) {
      setError(noticeError instanceof Error ? noticeError.message : "Falha ao fechar aviso.");
      void loadMasterNotices(masterNoticeAudience);
    }
  }

  async function createMasterNotice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = masterNoticeDraft.title.trim();
    const body = masterNoticeDraft.body.trim();
    if (!title || !body) {
      setError("Informe título e mensagem do aviso.");
      return;
    }
    setMasterNoticeSaving(true);
    setError(null);
    try {
      await apiFetch<{ ok?: boolean; notice?: MasterNotice }>("/vendas/master-notices", {
        method: "POST",
        body: JSON.stringify({
          audience: masterNoticeDraft.audience,
          title,
          body,
          tone: masterNoticeDraft.tone,
          forceSeconds: Math.max(0, Math.min(120, Math.trunc(Number(masterNoticeDraft.forceSeconds || 0) || 0))),
          startsAt: dateInputToIso(masterNoticeDraft.startsAt),
          expiresAt: dateInputToIso(masterNoticeDraft.expiresAt, true),
        }),
      });
      setFeedback("Aviso Master publicado.");
      setMasterNoticeDraft(createMasterNoticeDefaultDraft(masterNoticeDraft.audience));
      await loadMasterNotices(masterNoticeDraft.audience);
    } catch (noticeError) {
      setError(noticeError instanceof Error ? noticeError.message : "Falha ao publicar aviso.");
    } finally {
      setMasterNoticeSaving(false);
    }
  }

  async function createReferredSeller(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = referredSellerName.trim();
    const phone = referredSellerPhone.trim();
    if (!name || !phone) {
      setError("Informe nome e WhatsApp do contato indicado.");
      return;
    }
    setReferredSellerCreating(true);
    setError(null);
    try {
      const payload = await apiFetch<ReferredSellerCreateResult>("/users/hbx/referred-seller", {
        method: "POST",
        body: JSON.stringify({
          name,
          phone,
          note: referredSellerNote.trim() || undefined,
        }),
      });
      const label = payload?.candidate?.name || name;
      setFeedback(payload?.message || `${label} foi enviado para aprovação do Master.`);
      setReferredSellerName("");
      setReferredSellerPhone("");
      setReferredSellerNote("");
      await loadCommissionSummary();
    } catch (sellerError) {
      setError(sellerError instanceof Error ? sellerError.message : "Falha ao enviar indicação.");
    } finally {
      setReferredSellerCreating(false);
    }
  }

  async function exportConversionReportPdf() {
    try {
      const token = getToken();
      const response = await fetch(`${getDashboardApiBaseUrl()}/vendas/report/export.pdf?period=${encodeURIComponent(conversionReportPeriod)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error(await response.text());
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (pdfError) {
      setError(pdfError instanceof Error ? pdfError.message : "Falha ao exportar PDF.");
    }
  }

  useEffect(() => {
    const requestedSection = String(searchParams?.get("mobileSection") || "").trim();
    const requestedSheet = String(searchParams?.get("mobileSheet") || "").trim();
    const deepLinkKey = `${requestedSection}:${requestedSheet}`;
    if (!requestedSection && !requestedSheet) return;
    if (mobileDeepLinkHandledRef.current === deepLinkKey) return;
    mobileDeepLinkHandledRef.current = deepLinkKey;

    if (requestedSection === "report") setMobileSection("report");
    if (requestedSection === "commission") setMobileSection("commission");
    if (requestedSection === "cards") {
      setMobileSection("cards");
      setMobileAgendaTab("upcoming");
    }
    if (requestedSection === "today") {
      setMobileSection("today");
      setMobileAgendaTab("today");
    }
    if (requestedSheet === "account") {
      setAccountNameDraft(mobilePreferredCallerName || readMobilePreferredCallerName());
      setAccountSheetOpen(true);
    }
  }, [mobilePreferredCallerName, searchParams]);

  useEffect(() => {
    const syncStoredRun = () => {
      const next = readStoredRadarRun();
      setStoredRadarRun((previous) => {
        try {
          return JSON.stringify(previous) === JSON.stringify(next) ? previous : next;
        } catch {
          return next;
        }
      });
    };
    syncStoredRun();
    return subscribeStoredRadarRun(syncStoredRun);
  }, []);

  useEffect(() => {
    if (hasToken !== true || storedRadarRun?.runId || latestRadarRunHydratedRef.current) return;
    latestRadarRunHydratedRef.current = true;
    let cancelled = false;
    apiFetch<RadarSearchRunResponse | null>("/webscraping/radar/search-runs/latest", {
      requireAuth: true,
      timeoutMs: 15000,
    })
      .then((payload) => {
        if (cancelled || !payload?.runId) return;
        saveStoredRadarRun({
          runId: payload.runId || payload.id,
          status: payload.status,
          city: payload.meta?.filters?.city || null,
          state: payload.meta?.filters?.state || null,
          segment: payload.meta?.filters?.segment || null,
          radiusKm: Number(payload.meta?.filters?.radiusKm ?? 0) || 0,
          regionalCities: payload.meta?.filters?.regionalCities || null,
          selectedSegments: payload.meta?.filters?.selectedSegments || null,
          targetQuantity: Number(payload.targetQuantity || payload.meta?.requestedQuantity || 0) || null,
          deliveredCount: Number(payload.meta?.deliveredCount || payload.foundCount || 0) || 0,
        });
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [hasToken, storedRadarRun?.runId]);

  useEffect(() => {
    if (hasToken !== true) return undefined;
    const runId = storedRadarRun?.runId;
    if (!runId) {
      setLiveRadarRun(null);
      return undefined;
    }
    const activeRunId = runId;

    async function refreshRadarRun() {
      const payload = await apiFetch<RadarSearchRunResponse>(`/webscraping/radar/search-runs/${encodeURIComponent(activeRunId)}`, {
        requireAuth: true,
        timeoutMs: 15000,
      });
      if (isRadarRunNotFoundPayload(payload)) {
        clearStoredRadarRun(activeRunId);
        setLiveRadarRun(null);
        return;
      }
      setLiveRadarRun((previous) => {
        return radarRunResponseEqual(previous, payload) ? previous : payload;
      });
      if (payload.status === "canceled") {
        clearStoredRadarRun(activeRunId);
        return;
      }
      const deliveredCount = Number(payload.meta?.deliveredCount || payload.foundCount || storedRadarRun?.deliveredCount || 0) || 0;
      saveStoredRadarRun({
        runId: payload.runId || payload.id,
        status: payload.status,
        city: payload.meta?.filters?.city || storedRadarRun?.city || null,
        state: payload.meta?.filters?.state || storedRadarRun?.state || null,
        segment: payload.meta?.filters?.segment || storedRadarRun?.segment || null,
        radiusKm: Number(payload.meta?.filters?.radiusKm ?? storedRadarRun?.radiusKm ?? 0) || 0,
        regionalCities: payload.meta?.filters?.regionalCities || storedRadarRun?.regionalCities || null,
        selectedSegments: payload.meta?.filters?.selectedSegments || storedRadarRun?.selectedSegments || null,
        targetQuantity: Number(payload.targetQuantity || payload.meta?.requestedQuantity || storedRadarRun?.targetQuantity || 0) || null,
        deliveredCount,
      });
      if (
        deliveredCount > lastRadarBoardRefreshCountRef.current &&
        !composerOpenRef.current &&
        !radarBoardRefreshInFlightRef.current
      ) {
        lastRadarBoardRefreshCountRef.current = deliveredCount;
        radarBoardRefreshInFlightRef.current = true;
        void loadBoardRef.current().finally(() => {
          radarBoardRefreshInFlightRef.current = false;
        });
      }
      const autoImport = payload.meta?.autoImport || null;
      const autoImportKey = autoImport
        ? [
            payload.runId || payload.id || activeRunId,
            Number(autoImport.processedCount || 0),
            Number(autoImport.importedCount || 0),
            Number(autoImport.pendingCount || 0),
          ].join(":")
        : "";
      const autoImportTouchedAgenda =
        Number(autoImport?.processedCount || 0) > 0 ||
        Number(autoImport?.importedCount || 0) > 0 ||
        Number(autoImport?.pendingCount || 0) > 0;
      if (
        autoImportKey &&
        autoImportKey !== lastRadarAutoImportRefreshKeyRef.current &&
        autoImportTouchedAgenda &&
        !composerOpenRef.current &&
        !radarBoardRefreshInFlightRef.current
      ) {
        lastRadarAutoImportRefreshKeyRef.current = autoImportKey;
        radarBoardRefreshInFlightRef.current = true;
        void loadBoardRef.current({ forceVisualRefresh: true }).finally(() => {
          radarBoardRefreshInFlightRef.current = false;
        });
      }
    }

    if (isTerminalRadarRunStatus(storedRadarRun?.status)) {
      void refreshRadarRun().catch(() => null);
      return undefined;
    }

    return startSmartPolling(async () => {
      if (composerOpenRef.current) return;
      try {
        await refreshRadarRun();
      } catch (error) {
        if (isRadarRunNotFoundError(error)) {
          clearStoredRadarRun(activeRunId);
          setLiveRadarRun(null);
        }
        // keep the last visible Radar status if one poll fails
      }
    }, {
      intervalMs: mobileRoute ? 6500 : 2200,
      immediate: true,
      pauseWhenHidden: true,
    });
  }, [
    hasToken,
    mobileRoute,
    storedRadarRun?.city,
    storedRadarRun?.deliveredCount,
    storedRadarRun?.radiusKm,
    storedRadarRun?.regionalCities,
    storedRadarRun?.runId,
    storedRadarRun?.segment,
    storedRadarRun?.selectedSegments,
    storedRadarRun?.state,
    storedRadarRun?.status,
    storedRadarRun?.targetQuantity,
  ]);

  useEffect(() => {
    if (composerOpenRef.current || mobileSkipDraftHydrateRef.current) return;
    const pendingCount = Math.max(
      0,
      (board?.summary.overdue || 0) + (board?.summary.today || 0) + (board?.summary.scheduled || 0),
    );
    const deliveredCount = Math.max(
      pendingCount,
      Number(liveRadarRun?.meta?.deliveredCount || liveRadarRun?.foundCount || storedRadarRun?.deliveredCount || 0),
    );
    const status = String(liveRadarRun?.status || storedRadarRun?.status || "");
    const previous = lastRadarStatusSnapshotRef.current;
    if (previous && (deliveredCount > previous.count || (status && status !== previous.status))) {
      setRadarStatusPulseKey((current) => current + 1);
    }
    lastRadarStatusSnapshotRef.current = { count: deliveredCount, status };
  }, [
    board?.summary.overdue,
    board?.summary.scheduled,
    board?.summary.today,
    liveRadarRun?.foundCount,
    liveRadarRun?.meta?.deliveredCount,
    liveRadarRun?.status,
    storedRadarRun?.deliveredCount,
    storedRadarRun?.status,
  ]);

  const openInboxAgenda = useCallback(
    (conversationId?: string | number | null) => {
      todayAgendaLaunchNotice.clear();
      const params = new URLSearchParams({
        atendimentoQueue: "bot",
        atendimentoSection: "conversa",
      });
      if (conversationId) params.set("conversationId", String(conversationId));
      router.push(`/atendimento?${params.toString()}`);
    },
    [router, todayAgendaLaunchNotice],
  );

  const syncLeadsToInbox = useCallback(
    async (
      leads: LeadItem[],
      options?: { openAfter?: boolean; title?: string; description?: string },
    ) => {
      const visibleLeadIds = leads.map((lead) => lead.id).filter(Boolean);
      if (!visibleLeadIds.length) {
        setFeedback("Nenhum card visível para importar ao Inbox.");
        return null;
      }

      todayAgendaLaunchNotice.start({
        loadingTitle: options?.title || "Abrindo Inbox",
        loadingDescription:
          options?.description || "Enviando os cards visíveis para Prospecção.",
        successTitle: "Prospecção pronta",
        successDescription:
          "Tudo certo. Os cards foram preparados em Prospecção.",
        ctaLabel: "Abrir Prospecção",
        onOpen: () => openInboxAgenda(),
      });

      try {
        const syncResult = await apiFetch<TodayAgendaSyncResponse>(
          "/vendas/agenda/whatsapp/sync-today",
          {
            method: "POST",
            body: JSON.stringify({ leadIds: visibleLeadIds }),
          },
        );
        const todayLeadCount = Number(syncResult?.todayLeadCount || 0);
        const mirroredLeadCount = Number(syncResult?.mirroredLeadCount || 0);
        if (!syncResult?.ok) {
          throw new Error(
            syncResult?.message ||
              "Os cards visíveis nao foram enviados para Prospecção. Recarregue e tente novamente.",
          );
        }
        const firstConversationId =
          syncResult?.conversationIds?.[0] ||
          (syncResult?.leadConversationIds
            ? syncResult.leadConversationIds[visibleLeadIds[0]]
            : null) ||
          null;
        const importedLeadIds = syncResult?.leadConversationIds
          ? Object.keys(syncResult.leadConversationIds)
          : firstConversationId && visibleLeadIds.length === 1
            ? visibleLeadIds
            : [];
        if (importedLeadIds.length) {
          setBoard((currentBoard) =>
            markBoardLeadsInInbox(
              currentBoard,
              importedLeadIds,
              syncResult?.leadConversationIds,
              firstConversationId,
            ),
          );
        }
        todayAgendaLaunchNotice.markSuccess({
          successDescription:
            String(syncResult?.message || "").trim() ||
            (todayLeadCount
              ? `${mirroredLeadCount} card(s) foram preparados em Prospecção com roteiro pendente para envio manual.`
              : "Nao ha cards visíveis para preparar em Prospecção."),
        });
        await loadBoardRef.current();
        if (options?.openAfter) openInboxAgenda(firstConversationId);
        return syncResult;
      } catch (syncError) {
        todayAgendaLaunchNotice.clear();
        setError(
          syncError instanceof Error
            ? syncError.message
            : "Falha ao importar cards para Prospecção.",
        );
        return null;
      }
    },
    [openInboxAgenda, todayAgendaLaunchNotice],
  );

  useEffect(() => {
    if (hasToken !== true) return;
    void loadBoardRef.current();
  }, [hasToken]);

  useEffect(() => {
    composerOpenRef.current = composerOpen;
  }, [composerOpen]);

  useEffect(() => {
    setMobilePreferredCallerName(readMobilePreferredCallerName());
    setAccountNameDraft(readMobilePreferredCallerName());
  }, []);

  useEffect(() => {
    boardRef.current = board;
  }, [board]);

  useEffect(() => {
    if (hasToken !== true || !hasEnrichingLead) return undefined;
    return startSmartPolling(async () => {
      if (composerOpenRef.current) return;
      await loadBoardRef.current({ forceVisualRefresh: true });
    }, {
      intervalMs: mobileRoute ? 4200 : 3200,
      immediate: false,
      pauseWhenHidden: true,
    });
  }, [hasToken, hasEnrichingLead, mobileRoute]);

  useEffect(() => {
    function handleFocusOut() {
      window.setTimeout(() => {
        if (isTextEntryElementActive()) return;
        const pending = pendingVisualBoardRef.current;
        if (!pending) return;
        pendingVisualBoardRef.current = null;
        applyBoardPayload(pending);
      }, 220);
    }

    document.addEventListener("focusout", handleFocusOut);
    return () => document.removeEventListener("focusout", handleFocusOut);
  });

  useEffect(() => {
    if (!accountSheetOpen || hasToken !== true) return;
    let cancelled = false;
    setAccountProfileLoading(true);
    void (async () => {
      try {
        const profile = await apiFetch<{
          email?: string | null;
          company?: {
            paymentStatus?: string | null;
            subscriptionStatus?: string | null;
            premiumAccess?: boolean | null;
          } | null;
        }>("/profile/current-user");
        if (!cancelled) setAccountProfile(profile);
      } catch {
        if (!cancelled) setAccountProfile(null);
      } finally {
        if (!cancelled) setAccountProfileLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountSheetOpen, hasToken]);

  useEffect(() => {
    if (hasToken !== true) return;
    void loadSalesProfile();
  }, [hasToken]);

  useEffect(() => {
    if (hasToken !== true || mobileSection !== "report") return;
    void loadConversionReportRef.current(conversionReportPeriod);
  }, [hasToken, mobileSection, conversionReportPeriod]);

  useEffect(() => {
    if (hasToken !== true) return;
    void loadSellerAuditRef.current(sellerAuditPeriod);
  }, [hasToken, sellerAuditPeriod]);

  useEffect(() => {
    if (hasToken !== true) return;
    void loadCommissionSummary();
  }, [hasToken]);

  useEffect(() => {
    if (hasToken !== true) return;
    void loadCrmIntegrity();
  }, [hasToken]);

  useEffect(() => {
    if (hasToken !== true) return;
    void loadHbxClosingPipeline();
  }, [hasToken]);

  useEffect(() => {
    if (hasToken !== true) return;
    void loadMasterNotices();
  }, [hasToken]);

  useEffect(() => {
    if (hasToken !== true) return;
    const timer = window.setInterval(() => void loadMasterNotices(masterNoticeAudience), 60000);
    return () => window.clearInterval(timer);
  }, [hasToken, masterNoticeAudience]);

  const pendingMasterNoticeCount = useMemo(
    () => masterNotices.filter((notice) => !notice.acknowledged).length,
    [masterNotices],
  );

  const forcedMasterNotice = useMemo(
    () =>
      masterNotices.find(
        (notice) => !notice.acknowledged && Number(notice.forceSeconds || 0) > 0,
      ) || null,
    [masterNotices],
  );

  useEffect(() => {
    if (!forcedMasterNotice) {
      setActiveForcedNoticeId(null);
      setMasterNoticeSecondsLeft(0);
      return;
    }
    if (activeForcedNoticeId === forcedMasterNotice.id) return;
    setActiveForcedNoticeId(forcedMasterNotice.id);
    setMasterNoticeSecondsLeft(Math.max(0, Math.trunc(Number(forcedMasterNotice.forceSeconds || 0) || 0)));
  }, [forcedMasterNotice, activeForcedNoticeId]);

  useEffect(() => {
    if (!activeForcedNoticeId || masterNoticeSecondsLeft <= 0) return;
    const timer = window.setTimeout(
      () => setMasterNoticeSecondsLeft((current) => Math.max(0, current - 1)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [activeForcedNoticeId, masterNoticeSecondsLeft]);

  useEffect(() => {
    if (hasToken !== true) return;
    if (searchParams?.get("agendaStudio") !== "1") return;
    const mode = searchParams?.get("agendaMode") || "sales";
    if (mode !== "sales") return;
    router.replace(
      "/atendimento?atendimentoQueue=scheduled&atendimentoSection=agenda&agendaStudio=1&agendaMode=sales&returnTo=%2Fvendas",
    );
  }, [hasToken, router, searchParams]);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 5200);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    if (!pulseDateKey) return;
    const timer = window.setTimeout(() => setPulseDateKey(null), 560);
    return () => window.clearTimeout(timer);
  }, [pulseDateKey]);

  useEffect(() => {
    if (!flyAnimation) return;
    const timer = window.setTimeout(() => setFlyAnimation(null), 460);
    return () => window.clearTimeout(timer);
  }, [flyAnimation]);

  useEffect(() => {
    function handleKeyboardShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
        return;
      }
      if (event.key === "Escape") setCommandOpen(false);
    }
    window.addEventListener("keydown", handleKeyboardShortcut);
    return () => window.removeEventListener("keydown", handleKeyboardShortcut);
  }, []);

  const leadById = useMemo(() => {
    const map = new Map<string, { lead: LeadItem; block: LeadBlockKey }>();
    if (!board) return map;
    (["overdue", "today", "scheduled", "closed"] as LeadBlockKey[]).forEach(
      (blockKey) => {
        (board.blocks[blockKey] || []).forEach((lead) =>
          map.set(lead.id, { lead, block: blockKey }),
        );
      },
    );
    return map;
  }, [board]);

  const allLeads = useMemo(() => {
    const items: Array<{ lead: LeadItem; block: LeadBlockKey }> = [];
    if (!board) return items;
    (["overdue", "today", "scheduled", "closed"] as LeadBlockKey[]).forEach(
      (blockKey) => {
        (board.blocks[blockKey] || []).forEach((lead) =>
          items.push({ lead, block: blockKey }),
        );
      },
    );
    const orderWeight: Record<LeadBlockKey, number> = {
      overdue: 0,
      today: 1,
      scheduled: 2,
      closed: 3,
    };
    for (const { lead } of items) {
      if (!leadStableOrderRef.current[lead.id]) {
        leadStableOrderRef.current[lead.id] = leadStableOrderNextRef.current;
        leadStableOrderNextRef.current += 1;
      }
    }
    return items.sort((left, right) => {
      const blockDiff = orderWeight[left.block] - orderWeight[right.block];
      if (blockDiff !== 0) return blockDiff;
      return (leadStableOrderRef.current[left.lead.id] || 0) - (leadStableOrderRef.current[right.lead.id] || 0);
    });
  }, [board]);

  const mobileVisualFiltersUnlocked = Boolean(
    board?.capabilities?.canUseAdvancedFilters ||
    board?.capabilities?.canSeeLeadIntelligence ||
    board?.capabilities?.canSeeSocialLinks === true ||
    salesProfile?.capabilities?.canUseAdvancedFilters ||
    salesProfile?.capabilities?.canSeeLeadIntelligence ||
    salesProfile?.capabilities?.canSeeSocialLinks === true,
  );
  const mobileVisualFiltersActive =
    mobileVisualChannelFilters.length > 0 || mobileMinScoreFilter > 0;

  const mobileLeads = useMemo(() => {
    const normalized = mobileSearch.trim().toLowerCase();
    const liveLeads = (mobileSection === "cards" ? allLeads.filter(({ block }) => block !== "closed") : allLeads.filter(({ block }) => {
      if (mobileAgendaTab === "overdue") return block === "overdue";
      if (mobileAgendaTab === "today") return block === "today";
      return block === "scheduled";
    })).sort((left, right) => {
      if (mobileAgendaTab !== "upcoming") return 0;
      return (
        new Date(left.lead.returnAt || left.lead.updatedAt || 0).getTime() -
        new Date(right.lead.returnAt || right.lead.updatedAt || 0).getTime()
      );
    });
    const visuallyFiltered = mobileVisualFiltersActive
      ? liveLeads.filter(({ lead }) => (
          mobileVisualChannelFilters.every((channel) => leadHasVisualChannel(lead, channel)) &&
          leadVisualScore(lead) >= mobileMinScoreFilter
        ))
      : liveLeads;
    if (!normalized) return visuallyFiltered;
    return visuallyFiltered
      .filter(({ lead, block }) =>
        [
          lead.name,
          lead.city,
          lead.address,
          lead.segment,
          lead.statusLabel,
          lead.nextAction,
          lead.shortNote,
          block,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalized),
      );
  }, [
    allLeads,
    mobileAgendaTab,
    mobileMinScoreFilter,
    mobileSearch,
    mobileSection,
    mobileVisualChannelFilters,
    mobileVisualFiltersActive,
  ]);

  const selectedMobileLead = useMemo(() => {
    if (!selectedMobileLeadId) return null;
    return allLeads.find(({ lead }) => lead.id === selectedMobileLeadId)?.lead || null;
  }, [allLeads, selectedMobileLeadId]);

  function toggleMobileVisualFilter(channel: MobileVisualChannelFilter) {
    if (!mobileVisualFiltersUnlocked) return;
    setMobileVisualChannelFilters((current) =>
      current.includes(channel)
        ? current.filter((item) => item !== channel)
        : [...current, channel],
    );
  }

  function clearMobileVisualFilters() {
    setMobileVisualChannelFilters([]);
    setMobileMinScoreFilter(0);
  }

  function stepMobileScoreFilter(delta: number) {
    setMobileMinScoreFilter((current) => Math.max(0, Math.min(100, current + delta)));
  }

  function setMobileScoreFilterValue(value: number) {
    const nextValue = Number.isFinite(value) ? value : 0;
    setMobileMinScoreFilter(Math.max(0, Math.min(100, Math.round(nextValue))));
  }

  useEffect(() => {
    if (!mobileScoreFilterOpen || typeof window === "undefined") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileScoreFilterOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileScoreFilterOpen]);

  useEffect(() => {
    if (selectedMobileLeadId) saveMobileOpenLeadId(selectedMobileLeadId);
  }, [selectedMobileLeadId]);

  useEffect(() => {
    if (!selectedMobileLead) {
      setMobileAnimatedScore(0);
      mobileScoreAnimatedKeyRef.current = null;
      return;
    }
    const intelligenceVisible = canSeeLeadIntelligence(selectedMobileLead, board);
    const target = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          Number(intelligenceVisible ? selectedMobileLead.leadIntelligence?.opportunityScore || 0 : 0),
        ),
      ),
    );
    const animationKey = `${selectedMobileLead.id}:${intelligenceVisible ? "visible" : "locked"}:${target}`;
    if (typeof window === "undefined") {
      setMobileAnimatedScore(target);
      mobileScoreAnimatedKeyRef.current = animationKey;
      return;
    }
    if (
      target <= 0 ||
      mobileScoreAnimatedKeyRef.current === animationKey ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      setMobileAnimatedScore(target);
      mobileScoreAnimatedKeyRef.current = animationKey;
      return;
    }

    const runId = mobileScoreAnimationRunRef.current + 1;
    mobileScoreAnimationRunRef.current = runId;
    let frame = 0;
    let timer = 0;
    const duration = 680;
    setMobileAnimatedScore(0);

    timer = window.setTimeout(() => {
      if (mobileScoreAnimationRunRef.current !== runId) return;
      mobileScoreAnimatedKeyRef.current = animationKey;
      const startedAt = performance.now();

      const tick = (now: number) => {
        if (mobileScoreAnimationRunRef.current !== runId) return;
        const progress = Math.min(1, (now - startedAt) / duration);
        const eased = 1 - Math.pow(1 - progress, 2.4);
        const nextValue = progress >= 1 ? target : Math.min(target - 1, Math.round(target * eased));
        setMobileAnimatedScore(nextValue);
        if (progress < 1) {
          frame = window.requestAnimationFrame(tick);
        }
      };

      frame = window.requestAnimationFrame(tick);
    }, 40);

    return () => {
      window.clearTimeout(timer);
      window.cancelAnimationFrame(frame);
    };
  }, [board, selectedMobileLead]);

  useEffect(() => {
    const storedOpenLeadId = readMobileOpenLeadId();
    if (!storedOpenLeadId || selectedMobileLeadId) return;
    const record = allLeads.find(({ lead }) => lead.id === storedOpenLeadId);
    if (record) {
      setSelectedMobileLeadId(record.lead.id);
      setMobileNoteLead(record.lead);
      setMobileNoteDraft("");
    }
  }, [allLeads, selectedMobileLeadId]);

  useEffect(() => {
    if (!selectedMobileLeadId) return;
    const record = allLeads.find(({ lead }) => lead.id === selectedMobileLeadId);
    if (!record || record.lead === mobileNoteLead) return;
    setMobileNoteLead(record.lead);
  }, [allLeads, mobileNoteLead, selectedMobileLeadId]);

  const loadedLeadIds = useMemo(
    () => allLeads.map(({ lead }) => lead.id).filter(Boolean),
    [allLeads],
  );

  useEffect(() => {
    if (bulkSelectAllAccount) return;
    const availableIds = new Set(loadedLeadIds);
    setSelectedBulkLeadIds((current) => {
      const next = new Set(
        [...current].filter((leadId) => availableIds.has(leadId)),
      );
      return next.size === current.size ? current : next;
    });
  }, [bulkSelectAllAccount, loadedLeadIds]);

  const deferredCommandQuery = useDeferredValue(commandQuery);
  const commandResults = useMemo(() => {
    const normalized = deferredCommandQuery.trim().toLowerCase();
    const items = allLeads.slice(0, 20);
    if (!normalized) return items;
    return items.filter(({ lead, block }) =>
      [
        lead.name,
        lead.phone,
        lead.email,
        lead.address,
        lead.city,
        lead.segment,
        lead.nextAction,
        lead.shortNote,
        lead.lastResult,
        lead.primarySource,
        block,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [allLeads, deferredCommandQuery]);

  const dateFilters = useMemo<DateFilterItem[]>(() => {
    const scheduledGroups = new Map<string, LeadItem[]>();
    (board?.blocks.scheduled || []).forEach((lead) => {
      const dateKey = buildLocalDateKey(lead.returnAt || lead.updatedAt);
      if (!dateKey) return;
      scheduledGroups.set(dateKey, [
        ...(scheduledGroups.get(dateKey) || []),
        lead,
      ]);
    });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const futureBase = Array.from({ length: 14 }, (_, index) => {
      const current = new Date(today);
      current.setDate(today.getDate() + index + 1);
      const dateKey = buildLocalDateKey(current.toISOString());
      const leads = scheduledGroups.get(dateKey) || [];
      return {
        key: `scheduled:${dateKey}` as const,
        blockKey: "scheduled" as const,
        count: leads.length,
        title: railTitle(dateKey),
        subtitle: leads.length
          ? pluralize(leads.length, "retorno futuro", "retornos futuros")
          : "Sem agenda",
        dayLabel: railDay(dateKey),
        isoDate: dateKey,
      };
    });
    const lastFutureKey = futureBase[futureBase.length - 1]?.isoDate || "";
    const extraFuture = Array.from(scheduledGroups.entries())
      .filter(([dateKey]) => dateKey > lastFutureKey)
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([dateKey, leads]) => ({
        key: `scheduled:${dateKey}` as const,
        blockKey: "scheduled" as const,
        count: leads.length,
        title: railTitle(dateKey),
        subtitle: pluralize(leads.length, "retorno futuro", "retornos futuros"),
        dayLabel: railDay(dateKey),
        isoDate: dateKey,
      }));
    return [
      {
        key: "overdue",
        blockKey: "overdue",
        count: board?.summary.overdue || 0,
        title: "Atrasados",
        subtitle: board?.summary.overdue
          ? "Ontem para trás."
          : "Sem pendência.",
        dayLabel: "Prioridade",
      },
      {
        key: "today",
        blockKey: "today",
        count: board?.summary.today || 0,
        title: "Hoje",
        subtitle: board?.summary.today ? "Fluxo principal." : "Sem agenda.",
        dayLabel: "Operação",
      },
      ...futureBase,
      ...extraFuture,
    ];
  }, [board]);

  useEffect(() => {
    if (!dateFilters.length) return;
    setSelectedDateKey((current) => {
      if (dateFilters.some((item) => item.key === current)) return current;
      return (
        dateFilters.find((item) => item.count > 0)?.key || dateFilters[0].key
      );
    });
  }, [dateFilters]);

  const selectedFilter = useMemo(
    () =>
      dateFilters.find((item) => item.key === selectedDateKey) ||
      dateFilters[0] ||
      null,
    [dateFilters, selectedDateKey],
  );

  const filteredLeads = useMemo(() => {
    if (!board || !selectedFilter) return [];
    const scopedLeads =
      selectedFilter.key === "overdue"
        ? board.blocks.overdue || []
        : selectedFilter.key === "today"
          ? board.blocks.today || []
          : (board.blocks.scheduled || []).filter(
              (lead) =>
                buildLocalDateKey(lead.returnAt || lead.updatedAt) ===
                selectedFilter.isoDate,
            );
    return scopedLeads.filter(
      (lead) =>
        matchesWhatsappFilter(lead, whatsappFilter) &&
        matchesInboxFilter(lead, inboxFilter),
    );
  }, [board, selectedFilter, whatsappFilter, inboxFilter]);

  useEffect(() => {
    const notice = todayAgendaLaunchNotice.notice;
    const live = loading || notice?.phase === "loading";
    if (!live) {
      setVendasVisualCount(0);
      return undefined;
    }
    const target = Math.max(
      1,
      filteredLeads.length || board?.summary.total || 12,
    );
    setVendasVisualCount(1);
    const timer = window.setInterval(() => {
      setVendasVisualCount((current) => Math.min(target, current + 1));
    }, 210);
    return () => window.clearInterval(timer);
  }, [
    board?.summary.total,
    filteredLeads.length,
    loading,
    todayAgendaLaunchNotice.notice,
  ]);

  useEffect(() => {
    const notice = todayAgendaLaunchNotice.notice;
    const totalVisible = filteredLeads.length;
    const archivedCount = board?.summary.closed || 0;
    const metrics = [
      { label: "Restante", value: String(totalVisible) },
      { label: "Descarte", value: String(archivedCount) },
    ];
    const errorMessage = compactVendasMessage(error);
    const liveCards = filteredLeads
      .slice(0, Math.max(1, vendasVisualCount))
      .slice(-4)
      .map((lead) => ({
        id: `vendas:${lead.id}`,
        title: lead.name || "Card em Vendas",
        meta:
          [lead.segment, lead.city, lead.statusLabel]
            .filter(Boolean)
            .join(" • ") || "Prospecção",
        score: lead.timesSeen ? `${lead.timesSeen}x` : undefined,
      }));

    if (errorMessage) {
      dispatchTopbarProgress({
        source: "vendas",
        phase: "warning",
        title: "Vendas precisa de atenção",
        status: errorMessage,
        progress: 100,
        metrics,
      });
      return;
    }

    if (feedback) {
      dispatchTopbarProgress({
        source: "vendas",
        phase: "success",
        title: "Vendas atualizado",
        status: feedback,
        progress: 100,
        metrics,
      });
      return;
    }

    if (!notice && !loading) {
      clearTopbarProgress("vendas");
      return;
    }

    dispatchTopbarProgress({
      source: "vendas",
      phase: notice?.phase || "loading",
      title:
        notice?.phase === "success"
          ? notice.title
          : loading
            ? "Carregando Vendas"
            : "Sincronizando Vendas",
      status:
        notice?.statusLabel ||
        (loading
          ? "Preparando a agenda comercial..."
          : "Filtrando negativos e alimentando Prospecção..."),
      progress: notice?.progress ?? 18,
      steps: VENDAS_PROGRESS_STEPS,
      activeStepIndex: loading ? 0 : 3,
      cardFeed: liveCards,
      metrics,
    });
  }, [
    board?.summary.closed,
    error,
    feedback,
    filteredLeads,
    filteredLeads.length,
    loading,
    todayAgendaLaunchNotice.notice,
    vendasVisualCount,
  ]);

  useEffect(() => () => clearTopbarProgress("vendas"), []);

  useEffect(() => () => clearVendasDragVisualState(), [clearVendasDragVisualState]);

  useEffect(() => {
    if (!activeDragLeadId && !activeDragDateKey) return undefined;
    if (typeof window === "undefined" || typeof document === "undefined") return undefined;

    const scheduleVisualCleanup = () => {
      if (dragVisualCleanupTimerRef.current != null) {
        window.clearTimeout(dragVisualCleanupTimerRef.current);
      }
      dragVisualCleanupTimerRef.current = window.setTimeout(() => {
        clearVendasDragVisualState();
      }, 90);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") scheduleVisualCleanup();
    };

    window.addEventListener("pointerup", scheduleVisualCleanup, true);
    window.addEventListener("pointercancel", scheduleVisualCleanup, true);
    window.addEventListener("mouseup", scheduleVisualCleanup, true);
    window.addEventListener("touchend", scheduleVisualCleanup, true);
    window.addEventListener("blur", scheduleVisualCleanup);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pointerup", scheduleVisualCleanup, true);
      window.removeEventListener("pointercancel", scheduleVisualCleanup, true);
      window.removeEventListener("mouseup", scheduleVisualCleanup, true);
      window.removeEventListener("touchend", scheduleVisualCleanup, true);
      window.removeEventListener("blur", scheduleVisualCleanup);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (dragVisualCleanupTimerRef.current != null) {
        window.clearTimeout(dragVisualCleanupTimerRef.current);
        dragVisualCleanupTimerRef.current = null;
      }
    };
  }, [activeDragDateKey, activeDragLeadId, clearVendasDragVisualState]);

  const handleActiveDateShortcut = useCallback(async () => {
    if (!selectedFilter) return;
    await syncLeadsToInbox(filteredLeads, {
      title: "Abrindo Inbox",
      description: `Enviando os cards visíveis de ${selectedFilter.title} para Prospecção.`,
    });
  }, [filteredLeads, selectedFilter, syncLeadsToInbox]);

  useEffect(() => {
    setSelectedLeadId((current) => {
      if (current && filteredLeads.some((lead) => lead.id === current))
        return current;
      if (
        current &&
        showClosed &&
        (board?.blocks.closed || []).some((lead) => lead.id === current)
      )
        return current;
      // Do not auto-select the first lead by default. Keep selection null
      // until user explicitly focuses a lead to avoid the first card
      // being treated differently on initial render.
      return null;
    });
  }, [board?.blocks.closed, filteredLeads, showClosed]);

  useEffect(() => {
    if (!showClosed || !archiveRef.current) return;
    const id = window.setTimeout(() => {
      archiveRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      archiveRef.current?.focus();
    }, 80);
    return () => window.clearTimeout(id);
  }, [showClosed]);

  const selectedLeadRecord = selectedLeadId
    ? leadById.get(selectedLeadId) || null
    : null;
  const selectedLead = selectedLeadRecord?.lead || null;
  const selectedLeadDraft = selectedLead
    ? drafts[selectedLead.id] || createDraft(selectedLead)
    : null;

  const openConversationSnapshot = useCallback(async (lead: LeadItem, event: LeadTimelineEvent) => {
    if (!lead?.id || !event?.conversationReference?.conversationId) return;
    setConversationSnapshot(null);
    setConversationSnapshotError(null);
    setConversationSnapshotLoading(true);
    try {
      const query = event.id ? `?eventId=${encodeURIComponent(event.id)}` : "";
      const payload = await apiFetch<LeadConversationSnapshot>(
        `/vendas/lead/${encodeURIComponent(lead.id)}/conversation-snapshot${query}`,
      );
      setConversationSnapshot(payload);
    } catch (error) {
      setConversationSnapshotError(
        error instanceof Error ? error.message : "Não foi possível abrir a conversa.",
      );
    } finally {
      setConversationSnapshotLoading(false);
    }
  }, []);
  const closedLeads = board?.blocks.closed || [];
  const mobileLeadCount = Math.max(
    board?.summary.total || 0,
    (board?.summary.overdue || 0) +
      (board?.summary.today || 0) +
      (board?.summary.scheduled || 0),
  );
  const mobileFutureCount = board?.summary.scheduled || 0;

  useEffect(() => {
    return () => {
      if (mobileBulkHoldTimerRef.current) {
        window.clearTimeout(mobileBulkHoldTimerRef.current);
      }
    };
  }, []);

  function mobileLeadPlace(lead: LeadItem) {
    const city = String(lead.city || "").trim();
    const address = String(lead.address || "").trim();
    const stateMatch = address.match(/\b([A-Z]{2})\b(?:\s*,?\s*Brasil)?$/);
    const state = stateMatch?.[1] || "";
    if (city && state && !city.includes(state)) return `${city} / ${state}`;
    return city || address || "Local não informado";
  }

  function mobileReturnLabel(lead: LeadItem) {
    const parsed = lead.returnAt ? new Date(lead.returnAt) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) return "Sem retorno";
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);
    const sameDay = (left: Date, right: Date) =>
      left.getFullYear() === right.getFullYear() &&
      left.getMonth() === right.getMonth() &&
      left.getDate() === right.getDate();
    const time = parsed.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    if (sameDay(parsed, today)) return `Hoje ${time}`;
    if (sameDay(parsed, tomorrow)) return `Amanhã ${time}`;
    return formatDateTime(lead.returnAt);
  }

  function mobilePhoneLabel(lead: LeadItem) {
    const digits = normalizePhoneDigits(String(lead.phone || ""));
    if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return lead.phone || "Telefone não informado";
  }

  function mobileLeadSourceLabel(lead: LeadItem) {
    if (lead.primarySource) return lead.primarySource;
    if (lead.sourceType === "webscraping") return "Radar Digital";
    return "Cadastro manual";
  }

  function mergeMobileLeadPatch(leadId: string, patch: Partial<LeadItem>) {
    setBoard((currentBoard) => {
      if (!currentBoard) return currentBoard;
      let changed = false;
      const blocks = Object.fromEntries(
        (["overdue", "today", "scheduled", "closed"] as LeadBlockKey[]).map(
          (blockKey) => [
            blockKey,
            (currentBoard.blocks[blockKey] || []).map((lead) => {
              if (lead.id !== leadId) return lead;
              changed = true;
              return { ...lead, ...patch };
            }),
          ],
        ),
      ) as BoardResponse["blocks"];
      return changed ? { ...currentBoard, blocks } : currentBoard;
    });
  }

  async function loadMobileLeadEnrichment(lead: LeadItem) {
    if (!leadNeedsEnrichment(lead) && !leadEnrichmentInProgress(lead)) return;
    const previousIntelligence = lead.leadIntelligence || null;
    const processingPatch: Partial<LeadItem> = {
      leadIntelligence: {
        ...(lead.leadIntelligence || {}),
        enrichmentStatus: "processing",
      },
    };
    mergeMobileLeadPatch(lead.id, processingPatch);
    setMobileNoteLead((current) =>
      current?.id === lead.id ? { ...current, ...processingPatch } : current,
    );
    setMobileEnrichmentLoadingId(lead.id);
    try {
      const payload = await apiFetch<LeadEnrichmentResponse>(
        `/vendas/lead/${encodeURIComponent(lead.id)}/enrichment`,
        { method: "POST", body: JSON.stringify({ templateOffset: 0 }) },
      );
      const nextIntelligence = payload.leadIntelligence || lead.leadIntelligence || null;
      const patch: Partial<LeadItem> = {
        whatsappAvailability: payload.whatsappAvailability || lead.whatsappAvailability || null,
        leadIntelligence: nextIntelligence
          ? {
              ...nextIntelligence,
              enrichmentStatus: nextIntelligence.enrichmentStatus || "completed",
              enrichedAt: nextIntelligence.enrichedAt || new Date().toISOString(),
            }
          : null,
        planTier: payload.planTier || lead.planTier,
        capabilities: payload.capabilities || lead.capabilities,
      };
      if (payload.usage) {
        setBoard((currentBoard) => currentBoard ? { ...currentBoard, usage: payload.usage || currentBoard.usage } : currentBoard);
      }
      mergeMobileLeadPatch(lead.id, patch);
      setMobileNoteLead((current) =>
        current?.id === lead.id ? { ...current, ...patch } : current,
      );
    } catch (err) {
      const apiError = err as ApiFetchError;
      const payload = apiError?.payload as { usage?: VendasUsageSnapshot | null } | undefined;
      if (payload?.usage) {
        setBoard((currentBoard) => currentBoard ? { ...currentBoard, usage: payload.usage || currentBoard.usage } : currentBoard);
      }
      const failedPatch: Partial<LeadItem> = {
        leadIntelligence: {
          ...(previousIntelligence || {}),
          enrichmentStatus: apiError?.status === 409 ? previousIntelligence?.enrichmentStatus || null : "failed",
        },
      };
      mergeMobileLeadPatch(lead.id, failedPatch);
      setMobileNoteLead((current) =>
        current?.id === lead.id ? { ...current, ...failedPatch } : current,
      );
      setFeedback(
        err instanceof Error
          ? err.message
          : "Não foi possível enriquecer o card agora.",
      );
    } finally {
      setMobileEnrichmentLoadingId((current) => (current === lead.id ? null : current));
    }
  }

  function openMobileLeadDetail(lead: LeadItem) {
    setMobileTemplateIndex(readMobileReadyMessagePreference());
    setMobilePreferredCallerName(readMobilePreferredCallerName());
    saveMobileOpenLeadId(lead.id);
    setSelectedMobileLeadId(lead.id);
    setMobileNoteLead(lead);
    setMobileNoteDraft("");
    setMobileHistoryOpen(false);
    if (shouldAutoEnrichLead(lead, boardRef.current || board, mobileAutoEnrichmentActive)) {
      void loadMobileLeadEnrichment(lead);
    }
  }

  function executeMobileLead(lead: LeadItem) {
    const whatsappHref = leadWhatsappHref(lead);
    if (whatsappHref) {
      void incrementAttempt(lead.id);
      window.open(whatsappHref, "_blank", "noopener,noreferrer");
      return;
    }

    const callHref = buildCallUrl(lead.phone);
    if (callHref) {
      void incrementAttempt(lead.id);
      window.location.href = callHref;
      return;
    }

    openMobileLeadDetail(lead);
    setFeedback("Sem WhatsApp ou telefone disponível. Revise o card e registre a observação.");
  }

  function closeMobileLeadDetail() {
    saveMobileOpenLeadId(null);
    setSelectedMobileLeadId(null);
    setMobileNoteLead(null);
    setMobileNoteDraft("");
    setMobileScoreLead(null);
  }

  function activeMobileTemplate(lead: LeadItem) {
    const templates = buildMobileReadyMessageTemplates(lead, mobilePreferredCallerName);
    return templates[mobileTemplateIndex % templates.length];
  }

  function refreshMobileTemplate(lead: LeadItem) {
    const total = Math.max(1, buildMobileReadyMessageTemplates(lead, mobilePreferredCallerName).length);
    setMobileTemplateIndex((current) => {
      if (total <= 1) return current;
      let next = Math.floor(Math.random() * total);
      if (next === current % total) next = (next + 1) % total;
      saveMobileReadyMessagePreference(next);
      return next;
    });
  }

  async function copyMobileText(text: string, successMessage: string) {
    const value = String(text || "").trim();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setFeedback(successMessage);
    } catch {
      setFeedback("Não foi possível copiar automaticamente.");
    }
  }

  async function saveMobileNote() {
    const targetLead = selectedMobileLead || mobileNoteLead;
    if (!targetLead) return;
    setMobileSavingNote(true);
    try {
      await saveLead(
        targetLead.id,
        { shortNote: mobileNoteDraft },
        "Observação salva.",
      );
      mergeMobileLeadPatch(targetLead.id, { shortNote: mobileNoteDraft });
      setMobileNoteLead((current) =>
        current?.id === targetLead.id
          ? { ...current, shortNote: mobileNoteDraft }
          : current,
      );
    } finally {
      setMobileSavingNote(false);
    }
  }

  function openMobileReturnScheduler(lead: LeadItem) {
    setMobileReturnScheduleError(null);
    setMobileReturnScheduler(buildMobileReturnScheduler(lead));
  }

  function updateMobileReturnDateText(value: string) {
    const sanitized = value.replace(/[^\d/]/g, "").slice(0, 10);
    const parsedDateKey = parseShortBrazilianDate(sanitized);
    setMobileReturnScheduler((current) => current
      ? {
          ...current,
          dateText: sanitized,
          monthKey: parsedDateKey ? monthKeyFromDateKey(parsedDateKey) : current.monthKey,
        }
      : current);
    if (mobileReturnScheduleError) setMobileReturnScheduleError(null);
  }

  function selectMobileReturnCalendarDay(dateKey: string) {
    setMobileReturnScheduler((current) => current
      ? {
          ...current,
          dateText: dateKeyToShortBrazilianDate(dateKey),
          monthKey: monthKeyFromDateKey(dateKey),
        }
      : current);
    setMobileReturnScheduleError(null);
  }

  function shiftMobileReturnCalendarMonth(direction: -1 | 1) {
    setMobileReturnScheduler((current) => current
      ? { ...current, monthKey: shiftMonthKey(current.monthKey, direction) }
      : current);
  }

  async function saveMobileReturnSchedule() {
    if (!mobileReturnScheduler) return;
    const leadRecord = leadById.get(mobileReturnScheduler.leadId);
    const lead = leadRecord?.lead;
    const dateKey = parseShortBrazilianDate(mobileReturnScheduler.dateText);
    const timeValue = normalizeReturnTime(mobileReturnScheduler.timeValue);
    if (!dateKey) {
      setMobileReturnScheduleError("Informe a data no formato DD/MM/YY.");
      return;
    }
    if (!timeValue) {
      setMobileReturnScheduleError("Informe um horário válido.");
      return;
    }
    const currentDraft = drafts[mobileReturnScheduler.leadId] || (lead ? createDraft(lead) : null);
    setMobileReturnScheduleError(null);
    await saveLead(
      mobileReturnScheduler.leadId,
      {
        status: "retorno",
        nextAction: currentDraft?.nextAction || "Retomar lead",
        returnAt: `${dateKey}T${timeValue}`,
      },
      `Retorno agendado para ${mobileReturnScheduler.dateText} às ${timeValue}.`,
    );
    setSelectedDateKey(`scheduled:${dateKey}`);
    setMobileAgendaTab("upcoming");
    setMobileReturnScheduler(null);
  }

  function openMobileReport(lead: LeadItem) {
    setMobileReportLead(lead);
    setMobileReportReason("");
  }

  function getMobileBulkTarget(
    tab: MobileBulkDeleteTarget["tab"],
  ): MobileBulkDeleteTarget | null {
    const leads = tab === "overdue" ? board?.blocks.overdue || [] : board?.blocks.today || [];
    const leadIds = leads.map((lead) => lead.id).filter(Boolean);
    if (!leadIds.length) return null;
    return {
      tab,
      label: tab === "overdue" ? "Atrasados" : "Hoje",
      count: leadIds.length,
      leadIds,
    };
  }

  function cancelMobileBulkHold() {
    if (mobileBulkHoldTimerRef.current) {
      window.clearTimeout(mobileBulkHoldTimerRef.current);
      mobileBulkHoldTimerRef.current = null;
    }
    setMobileBulkHoldTab(null);
  }

  function startMobileBulkHold(
    event: ReactPointerEvent<HTMLButtonElement>,
    tab: MobileBulkDeleteTarget["tab"],
  ) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const target = getMobileBulkTarget(tab);
    if (!target || bulkDeleting) return;
    mobileBulkHoldCompletedRef.current = false;
    setMobileBulkHoldTab(tab);
    mobileBulkHoldTimerRef.current = window.setTimeout(() => {
      mobileBulkHoldTimerRef.current = null;
      mobileBulkHoldCompletedRef.current = true;
      setMobileBulkHoldTab(null);
      setMobileAgendaTab(tab);
      setMobileBulkDeleteTarget(target);
      navigator.vibrate?.(24);
    }, 1000);
  }

  function finishMobileBulkHold() {
    cancelMobileBulkHold();
    window.setTimeout(() => {
      mobileBulkHoldCompletedRef.current = false;
    }, 350);
  }

  async function deleteMobileLead(targetLead = mobileReportLead) {
    if (!targetLead) return;
    setMobileDeletingLead(true);
    setError(null);
    try {
      const payload = await apiFetch<BulkDeleteLeadsResponse>(
        `/vendas/leads/${encodeURIComponent(targetLead.id)}/delete`,
        { method: "POST" },
      );
      const deletedCount = Number(payload?.deletedCount || 0);
      setFeedback(
        deletedCount
          ? "Card ocultado do Vendas."
          : "Este card já não estava mais disponível no Vendas.",
      );
      setMobileReportLead(null);
      setMobileReportReason("");
      if (selectedMobileLeadId === targetLead.id) {
        closeMobileLeadDetail();
      }
      await loadBoard({ forceHydrateDrafts: true, forceVisualRefresh: true });
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Falha ao excluir o card.",
      );
    } finally {
      setMobileDeletingLead(false);
    }
  }

  async function submitMobileReport() {
    if (!mobileReportLead) return;
    const reason = mobileReportReason.trim();
    if (!reason) {
      setError("Informe o motivo antes de reclamar do card.");
      return;
    }
    setMobileReporting(true);
    setError(null);
    try {
      const payload = await apiFetch<ReportLeadErrorResponse>(
        `/vendas/leads/${encodeURIComponent(mobileReportLead.id)}/report-error`,
        {
          method: "POST",
          body: JSON.stringify({ reason }),
        },
      );
      if (payload?.whatsappUrl && !payload.autoSent) {
        window.open(payload.whatsappUrl, "_blank", "noopener,noreferrer");
      }
      setFeedback(payload?.message || "Reclamação registrada e card removido do Vendas.");
      setMobileReportLead(null);
      await loadBoard({ forceHydrateDrafts: true, forceVisualRefresh: true });
    } catch (reportError) {
      setError(
        reportError instanceof Error
          ? reportError.message
          : "Falha ao reportar o card.",
      );
    } finally {
      setMobileReporting(false);
    }
  }

  async function deleteMobileBulkTarget() {
    if (!mobileBulkDeleteTarget || !mobileBulkDeleteTarget.leadIds.length) return;
    setBulkDeleting(true);
    setError(null);
    try {
      const payload = await apiFetch<BulkDeleteLeadsResponse>(
        "/vendas/leads/delete-bulk",
        {
          method: "POST",
          body: JSON.stringify({ leadIds: mobileBulkDeleteTarget.leadIds }),
        },
      );
      const deletedCount = Number(payload?.deletedCount || 0);
      setFeedback(
        deletedCount
          ? `${deletedCount} card(s) excluído(s) de ${mobileBulkDeleteTarget.label}.`
          : "Nenhum card novo para excluir.",
      );
      setMobileBulkDeleteTarget(null);
      clearBulkSelection();
      setBulkSelectionMode(false);
      setSelectedLeadId(null);
      setSelectedMobileLeadId(null);
      await loadBoard({ forceHydrateDrafts: true, forceVisualRefresh: true });
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Falha ao excluir cards em massa.",
      );
    } finally {
      setBulkDeleting(false);
    }
  }

  function renderMobileVendas() {
    const mobilePendingCount = Math.max(
      0,
      (board?.summary.overdue || 0) + (board?.summary.today || 0) + (board?.summary.scheduled || 0),
    );
    const runStatus = String(liveRadarRun?.status || storedRadarRun?.status || "");
    const runAutoImport = liveRadarRun?.meta?.autoImport || null;
    const runFoundRaw = Math.max(
      0,
      Number(liveRadarRun?.meta?.deliveredCount || liveRadarRun?.foundCount || storedRadarRun?.deliveredCount || 0),
    );
    const runTarget = Math.max(
      1,
      Number(liveRadarRun?.targetQuantity || liveRadarRun?.meta?.requestedQuantity || storedRadarRun?.targetQuantity || 1),
    );
    const runTerminal = isTerminalRadarRunStatus(runStatus);
    const runOperationalState = String(liveRadarRun?.meta?.operationalState || "").trim().toLowerCase();
    const runPaused = runStatus === "sleeping" || runOperationalState === "pausado";
    const runStopped = runOperationalState === "parado" || (runTerminal && Boolean(runStatus));
    const runActive = Boolean((liveRadarRun?.runId || storedRadarRun?.runId) && !runTerminal);
    const runPauseReason = String(liveRadarRun?.meta?.operationalReason || liveRadarRun?.meta?.operationalMessage || liveRadarRun?.message || "").toLowerCase();
    const runPausedByCardLimit = runPaused && (
      runPauseReason.includes("limit") ||
      runPauseReason.includes("limite") ||
      runPauseReason.includes("quota") ||
      runPauseReason.includes("vendas_stock") ||
      runPauseReason.includes("card_limit")
    );
    const runVendasStockTarget = Math.max(
      0,
      Number(
        liveRadarRun?.meta?.vendasStockTarget ||
          liveRadarRun?.targetQuantity ||
          liveRadarRun?.meta?.requestedQuantity ||
          storedRadarRun?.targetQuantity ||
          0,
      ) || 0,
    );
    const runPauseMatchesVisibleVendas =
      !runPausedByCardLimit ||
      (runVendasStockTarget > 0 && mobilePendingCount >= runVendasStockTarget);
    const displayRunPaused = runPaused && runPauseMatchesVisibleVendas;
    const staleVendasLimitPause = runPaused && !displayRunPaused;
    const displayRunActive = runActive && !staleVendasLimitPause;
    const autoImportRan = Boolean(runAutoImport?.ran);
    const autoImportPendingCount = Math.max(0, Number(runAutoImport?.pendingCount || 0));
    const autoImportImportedCount = Math.max(0, Number(runAutoImport?.importedCount || 0));
    const runDelivered = autoImportRan ? Math.max(autoImportPendingCount, autoImportImportedCount, runFoundRaw) : runFoundRaw;
    const liveAgendaCount = mobilePendingCount;
    const agendaReceivedCount = liveAgendaCount;
    const activeAgendaCount = liveAgendaCount;
    const radarBlockedByStrictFilters = displayRunActive && autoImportRan && runFoundRaw > 0 && runDelivered <= 0 && activeAgendaCount <= 0;
    const radarFoundWithoutAgenda = displayRunActive && runDelivered > 0 && activeAgendaCount <= 0;
    const runFilters = liveRadarRun?.meta?.filters;
    const radarState = runFilters?.state || storedRadarRun?.state || "";
    const radarCity = runFilters?.city || storedRadarRun?.city || "";
    const radarSegment = runFilters?.segment || storedRadarRun?.segment || "";
    const radarAdjustParams = new URLSearchParams();
    if (radarState) radarAdjustParams.set("state", radarState);
    if (radarCity) radarAdjustParams.set("city", radarCity);
    if (radarSegment) radarAdjustParams.set("segment", radarSegment);
    radarAdjustParams.set("quantity", String(runTarget || 40));
    const radarAdjustHref = radarAdjustParams.toString()
      ? `/radar-digital?${radarAdjustParams.toString()}`
      : "/radar-digital";
    const radarVendasLabel = `${activeAgendaCount.toLocaleString("pt-BR")} ${activeAgendaCount === 1 ? "card" : "cards"} no Vendas`;
    const radarReceivedVendasLabel = `${agendaReceivedCount.toLocaleString("pt-BR")} ${agendaReceivedCount === 1 ? "card" : "cards"} no Vendas`;
    const radarContextLabel = [radarCity, radarState].filter(Boolean).join(" / ") || radarSegment || "Radar Digital";
    const activeVendasLeads = allLeads.filter(({ block }) => block !== "closed").map(({ lead }) => lead);
    const enrichedVendasCount = activeVendasLeads.filter(leadHasPremiumSignals).length;
    const possibleSocialVendasCount = activeVendasLeads.filter(leadHasPossibleSocial).length;
    const reviewedVendasCount = activeVendasLeads.filter((lead) => leadEnrichmentBadgeState(lead, board)?.label === "Revisado").length;
    const mobileRadarState =
      displayRunPaused
        ? "paused"
      : runStopped
        ? "stopped"
      : !displayRunActive && agendaReceivedCount > 0
        ? "received"
      : radarBlockedByStrictFilters
            ? "partial"
          : displayRunActive && activeAgendaCount > 0
            ? "receiving"
            : displayRunActive && radarFoundWithoutAgenda
              ? "preparing"
            : displayRunActive || loading
              ? "searching"
              : radarFoundWithoutAgenda
                  ? "preparing"
                  : "ready";
    const mobileRadarStatusLabel =
      mobileRadarState === "paused"
        ? "Radar pausado"
      : mobileRadarState === "stopped"
        ? "Radar parado"
      : mobileRadarState === "searching"
        ? "Pesquisando leads"
      : mobileRadarState === "preparing"
          ? "Preparando Vendas"
        : mobileRadarState === "receiving"
          ? radarVendasLabel
          : mobileRadarState === "partial"
            ? "Radar sem entrega"
      : mobileRadarState === "received"
                ? enrichedVendasCount > 0
                  ? `${radarReceivedVendasLabel}, ${enrichedVendasCount} ${enrichedVendasCount === 1 ? "com sinal" : "com sinais"}`
                  : radarReceivedVendasLabel
                : radarReceivedVendasLabel;
    const mobileRadarStatusText =
      mobileRadarState === "paused"
        ? radarReceivedVendasLabel
      : mobileRadarState === "stopped"
        ? "Ajuste área ou segmentos"
      : mobileRadarState === "searching"
        ? "Radar encontrando empresas"
        : mobileRadarState === "preparing"
          ? "Separando cards aprovados"
        : mobileRadarState === "receiving"
          ? "ABASTECENDO VENDAS"
            : mobileRadarState === "partial"
            ? "Amplie cidade ou segmento"
              : mobileRadarState === "received"
                ? possibleSocialVendasCount > 0
                  ? `${possibleSocialVendasCount} ${possibleSocialVendasCount === 1 ? "rede possível" : "redes possíveis"} para revisar`
                  : reviewedVendasCount > 0 && enrichedVendasCount <= 0
                    ? "Cards revisados pelo Radar"
                    : agendaReceivedCount >= 40
                  ? "Finalize ou delete para liberar"
                  : "Radar abasteceu Vendas"
                : "Abra o Radar para receber";
    const salesHeaderState =
      mobileRadarState === "paused"
        ? "paused"
      : mobileRadarState === "stopped"
        ? "stopped"
      : mobileRadarState === "received"
        ? "active"
      : mobileRadarState === "partial"
        ? "partial"
      : mobileRadarState === "receiving"
        ? "receiving"
      : mobileRadarState === "searching" || mobileRadarState === "preparing"
        ? "syncing"
        : "ready";
    const salesHeaderSubtitle =
      mobileRadarState === "paused"
        ? `${radarReceivedVendasLabel}. Delete, finalize ou transfira cards para liberar o Radar.`
      : mobileRadarState === "stopped"
        ? liveRadarRun?.meta?.operationalMessage || "O Radar esgotou essa configuração. Amplie área, distância ou segmentos para continuar."
      : mobileRadarState === "ready"
        ? "Receba cards do Radar e acompanhe retornos."
        : mobileRadarState === "searching"
          ? `Buscando empresas em ${radarContextLabel}.`
          : mobileRadarState === "preparing"
            ? `Radar trabalhando em ${radarContextLabel}. O Vendas ainda não recebeu novos cards.`
          : mobileRadarState === "receiving"
            ? `${radarVendasLabel}. O enriquecimento continua depois.`
            : mobileRadarState === "partial"
              ? "O Radar entregou o que encontrou. Ajuste cidade ou segmento para completar."
                : "Radar abasteceu sua agenda comercial.";
    const activeCapabilities = board?.capabilities || salesProfile?.capabilities || {};
    const mobileHeroPremiumAvailable = Boolean(
      board?.planTier === "lead" ||
        board?.planTier === "full" ||
        activeCapabilities.canSeeLeadIntelligence ||
        activeCapabilities.canSeeOpportunityReason ||
        activeCapabilities.canSeeMessageTemplates ||
        activeCapabilities.canSeeSocialLinks === true ||
        accountProfile?.company?.premiumAccess ||
        String(accountProfile?.company?.subscriptionStatus || "").toLowerCase() === "trialing",
    );
    const mobileHeroPremiumActive = Boolean(mobileHeroPremiumAvailable && mobileAutoEnrichmentActive);
    const reportMetrics = conversionReport?.metrics || {};
    const commissionTotals = commissionSummary?.totals || {};
    const payableAmount = Number(commissionTotals.payableAmount || 0);
    const duePayableAmount = Number(commissionTotals.duePayableAmount || 0);
    const waitingCommissionAmount = Math.max(0, payableAmount - duePayableAmount);
    const commissionClients = commissionSummary?.clients || {};
    const nextRecommendedMobileLead =
      allLeads.find(({ block }) => block !== "closed")?.lead || null;
    const mobileVendasDockTone: "default" | "warning" | "danger" =
      mobileRadarState === "paused"
        ? "warning"
        : mobileRadarState === "stopped"
          ? "danger"
          : "default";
    const mobileVendasDockLabel =
      mobileRadarState === "paused"
        ? "Incluir lead manual - Radar pausado"
        : mobileRadarState === "stopped"
          ? "Incluir lead manual - Radar parado"
          : "Incluir lead manual";

    function renderMobileReport() {
      return (
        <div className={styles.mobileVendasList}>
          <section className={`${styles.mobileVendasReportPanel} hbx-mobile-card`}>
            <div className={styles.mobileVendasReportHeader}>
              <div>
                <span>HBX</span>
                <strong>Relatório de Conversão</strong>
                <p>{conversionReport?.recommendation || "Carregando leitura comercial..."}</p>
              </div>
              <select
                value={conversionReportPeriod}
                onChange={(event) => setConversionReportPeriod(event.target.value as "today" | "7d" | "30d")}
              >
                <option value="today">Hoje</option>
                <option value="7d">7 dias</option>
                <option value="30d">30 dias</option>
              </select>
            </div>
            {!activeCapabilities.canSeeConversionReport ? (
              <div className={styles.mobileVendasTeaser}>
                Relatório inteligente disponível no HBX Lead Plus
              </div>
            ) : null}
            <div className={styles.mobileVendasReportGrid}>
              {[
                ["Recebidos", reportMetrics.cardsRecebidos],
                ["Chamados", reportMetrics.cardsChamados],
                ["Respostas", reportMetrics.respostas],
                ["Interessados", reportMetrics.interessados],
                ["Taxa resposta", formatReportPercent(reportMetrics.taxaResposta)],
                ["Conversão", formatReportPercent(reportMetrics.taxaConversao)],
              ].map(([label, value]) => (
                <span key={label}>
                  <small>{label}</small>
                  <strong>{conversionReportLoading ? "..." : value ?? 0}</strong>
                </span>
              ))}
            </div>
            <div className={styles.mobileVendasReportRanking}>
              <strong>Melhores sinais</strong>
              <p>Segmento: {reportMetrics.melhorSegmento || "Sem dados"}</p>
              <p>Cidade: {reportMetrics.melhorCidade || "Sem dados"}</p>
              <p>Canal: {reportMetrics.melhorCanal || "WhatsApp"}</p>
            </div>
            <button
              type="button"
              className="hbx-mobile-primary-button"
              onClick={() => void exportConversionReportPdf()}
              disabled={!activeCapabilities.canExportConversionPdf}
            >
              Exportar PDF
            </button>
            {!activeCapabilities.canExportConversionPdf ? (
              <small className={styles.mobileVendasReportLock}>Exportação PDF disponível no HBX Lead Plus</small>
            ) : null}
          </section>
          {renderSellerAuditPanel("mobile")}
        </div>
      );
    }

    function renderMobileCommissionList(title: string, items?: CommissionClient[]) {
      const rows = (items || []).slice(0, 5);
      return (
        <section className={`${styles.mobileVendasCommissionBlock} hbx-mobile-card`}>
          <div className={styles.mobileVendasCommissionBlockHeader}>
            <strong>{title}</strong>
            <span>{rows.length}</span>
          </div>
          {rows.length ? (
            <div className={styles.mobileVendasCommissionRows}>
              {rows.map((client) => (
                <article key={`${title}:${client.leadId}`} data-tone={commissionLifecycleTone(client)}>
                  <div>
                    <strong>{client.name || "Cliente sem nome"}</strong>
                    <span>{salePlanLabel(client.salePlanKey)} · {client.city || client.segment || "Sem local"}</span>
                  </div>
                  <b>{formatCurrency(client.commissionAmount || 0)}</b>
                  <small>{commissionLifecycleLabel(client, commissionDueDays)}</small>
                </article>
              ))}
            </div>
          ) : (
            <HbxMobileEmptyState
              kind="commission"
              surface="inline"
              title="Sem comissão nesta faixa."
              description="Quando uma venda mudar de etapa, o cliente aparece aqui com prazo e status."
            />
          )}
        </section>
      );
    }

    function renderMobileCommission() {
      const sellerPayoutRows = (commissionSummary?.sellerPayouts || []).filter((row) => Number(row.duePayableAmount || 0) > 0).slice(0, 8);
      const canRegisterPayout = Boolean(commissionSummary?.canPayout && duePayableAmount > 0);
      const financeAudit = commissionSummary?.financeAudit || null;
      return (
        <div className={styles.mobileVendasList}>
          <section className={`${styles.mobileVendasCommissionPanel} hbx-mobile-card`}>
            <div className={styles.mobileVendasCommissionHeader}>
              <div>
                <span>HBX</span>
                <strong>Comissão</strong>
                <p>{commissionSummary?.scope === "company" ? "Resumo da empresa" : "Sua carteira comercial"}</p>
              </div>
              <button type="button" onClick={() => void loadCommissionSummary()} disabled={commissionLoading}>
                {commissionLoading ? "Atualizando" : "Atualizar"}
              </button>
            </div>
            <div className={styles.mobileVendasCommissionHero}>
              <span>
                <small>Liberado</small>
                <strong>{formatCurrency(duePayableAmount)}</strong>
              </span>
              <span>
                <small>A receber</small>
                <strong>{formatCurrency(payableAmount)}</strong>
              </span>
              <span>
                <small>Pago</small>
                <strong>{formatCurrency(commissionTotals.paidAmount || 0)}</strong>
              </span>
            </div>
            <div className={styles.mobileVendasCommissionGrid}>
              {[
                ["Ativos", commissionTotals.activeClients || 0],
                ["Aguardando", commissionTotals.pendingActivation || 0],
                ["Inativados", commissionTotals.inactiveClients || 0],
                ["Liberadas", commissionTotals.duePayableCount || 0],
              ].map(([label, value]) => (
                <span key={label}>
                  <small>{label}</small>
                  <strong>{value}</strong>
                </span>
              ))}
            </div>
            <div className={styles.mobileVendasCommissionFlow} aria-label="Esteira da comissão">
              <span data-active={Number(commissionTotals.pendingActivation || 0) > 0 ? "true" : "false"}>
                <small>1. Implantação</small>
                <strong>{commissionTotals.pendingActivation || 0}</strong>
              </span>
              <span data-active={waitingCommissionAmount > 0 ? "true" : "false"}>
                <small>2. D+{commissionDueDays}</small>
                <strong>{formatCurrency(waitingCommissionAmount)}</strong>
              </span>
              <span data-active={duePayableAmount > 0 ? "true" : "false"}>
                <small>3. Liberado</small>
                <strong>{formatCurrency(duePayableAmount)}</strong>
              </span>
              <span data-active={Number(commissionTotals.paidAmount || 0) > 0 ? "true" : "false"}>
                <small>4. Pago</small>
                <strong>{formatCurrency(commissionTotals.paidAmount || 0)}</strong>
              </span>
            </div>
            <p className={styles.mobileVendasCommissionHint}>
              Fechou no Vendas, o Admin ativa no Gerencial, a comissão entra em D+{commissionDueDays} e depois aparece como paga.
            </p>
          </section>

          {commissionSummary?.canPayout ? (
            <section className={`${styles.mobileVendasCommissionBlock} hbx-mobile-card`}>
              <div className={styles.mobileVendasCommissionBlockHeader}>
                <div>
                  <strong>Fechamento financeiro</strong>
                  <span>{sellerPayoutRows.length ? "Vencido por vendedor" : "Nada vencido agora"}</span>
                </div>
                <button
                  type="button"
                  className={styles.mobileCommissionPayoutButton}
                  onClick={() => void createCommissionPayout(null)}
                  disabled={!canRegisterPayout || commissionPayoutSaving !== null}
                >
                  {commissionPayoutSaving === "all" ? "Registrando" : "Pagar D+"}
                </button>
              </div>
              {sellerPayoutRows.length ? (
                <div className={styles.mobileVendasCommissionRows}>
                  {sellerPayoutRows.map((seller) => {
                    const key = `seller:${seller.sellerUserId}`;
                    return (
                      <article key={seller.sellerUserId} data-tone="due" className={styles.mobileCommissionPayoutRow}>
                        <div>
                          <strong>{seller.sellerName || seller.sellerEmail || "Vendedor"}</strong>
                          <span>{seller.duePayableCount || 0} comissão(ões) liberada(s) · {formatPercent(seller.commissionPercent || 0)}</span>
                        </div>
                        <b>{formatCurrency(seller.duePayableAmount || 0)}</b>
                        <button
                          type="button"
                          onClick={() => void createCommissionPayout(seller.sellerUserId)}
                          disabled={commissionPayoutSaving !== null}
                        >
                          {commissionPayoutSaving === key ? "..." : "Pagar"}
                        </button>
                        <small>Próximo D+: {formatDateTime(seller.nextDueAt)}</small>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <HbxMobileEmptyState
                  kind="commission"
                  surface="inline"
                  title="Sem comissão vencida."
                  description="Comissões liberadas pelo prazo D+ aparecem aqui para fechamento financeiro."
                />
              )}
            </section>
          ) : null}

          {renderCrmIntegrityPanel("mobile")}
          {renderHbxClosingPipelinePanel("mobile")}

          {commissionSummary?.sellerNetwork?.isHbxSellerNetwork ? (
            <section className={`${styles.mobileVendasCommissionBlock} hbx-mobile-card`}>
              <div className={styles.mobileVendasCommissionBlockHeader}>
                <div>
                  <strong>Minha rede HBX</strong>
                  <span>
                    {commissionSummary.sellerNetwork.referredSellerCount || 0} indicado(s) · herança{" "}
                    {formatPercent(commissionSummary.sellerNetwork.inheritedCommissionPercent || 0)}
                  </span>
                </div>
                <span>{commissionSummary.sellerNetwork.canRegisterReferredSeller ? "Liberado" : "Bloqueado"}</span>
              </div>

              {commissionSummary.sellerNetwork.canRegisterReferredSeller ? (
                <form onSubmit={createReferredSeller} className="grid gap-2">
                  <input
                    className="field"
                    value={referredSellerName}
                    onChange={(event) => setReferredSellerName(event.target.value)}
                    placeholder="Nome do contato"
                    required
                  />
                  <input
                    className="field"
                    type="tel"
                    value={referredSellerPhone}
                    onChange={(event) => setReferredSellerPhone(event.target.value)}
                    placeholder="WhatsApp"
                    required
                  />
                  <textarea
                    className="field"
                    value={referredSellerNote}
                    onChange={(event) => setReferredSellerNote(event.target.value)}
                    placeholder="Observação opcional"
                    rows={3}
                  />
                  <button type="submit" className="hbx-mobile-primary-button" disabled={referredSellerCreating}>
                    {referredSellerCreating ? "Enviando..." : "Enviar indicação"}
                  </button>
                </form>
              ) : (
                <HbxMobileEmptyState
                  kind="referral"
                  surface="inline"
                  title="Indicação bloqueada."
                  description="Seu usuário ainda não está autorizado pelo USERMASTER para cadastrar vendedores."
                />
              )}

              <HbxMobileEmptyState
                kind="referral"
                surface="inline"
                title="Aguardando aprovação do Master HBX."
                description="Indicações enviadas aparecem para aprovação do Master HBX."
              />
            </section>
          ) : null}

          {renderMobileCommissionList("A receber", commissionClients.payable)}
          {renderMobileCommissionList("Aguardando ativação", commissionClients.pendingActivation)}
          {renderMobileCommissionList("Clientes ativos", commissionClients.active)}
          {renderMobileCommissionList("Clientes inativados", commissionClients.inactive)}

          <section className={`${styles.mobileVendasCommissionBlock} hbx-mobile-card`}>
            <div className={styles.mobileVendasCommissionBlockHeader}>
              <div>
                <strong>Auditoria financeira</strong>
                <span>Pagamentos e correções</span>
              </div>
              <span>{financeAudit?.canceledPayoutCount || 0} cancelado(s)</span>
            </div>
            <div className={styles.mobileCommissionAuditGrid}>
              <span>
                <small>Fechado</small>
                <strong>{formatCurrency(financeAudit?.paidPayoutAmount || 0)}</strong>
              </span>
              <span data-tone="danger">
                <small>Reaberto</small>
                <strong>{formatCurrency(financeAudit?.reopenedAmount || 0)}</strong>
              </span>
              <span>
                <small>Pagamentos</small>
                <strong>{financeAudit?.paidPayoutCount || 0}</strong>
              </span>
              <span data-tone="danger">
                <small>Último cancel.</small>
                <strong>{formatDateTime(financeAudit?.lastCanceledAt)}</strong>
              </span>
            </div>
          </section>

          <section className={`${styles.mobileVendasCommissionBlock} hbx-mobile-card`}>
            <div className={styles.mobileVendasCommissionBlockHeader}>
              <strong>Pagamentos registrados</strong>
              <span>{(commissionSummary?.payouts || []).length}</span>
            </div>
            {(commissionSummary?.payouts || []).length ? (
              <div className={styles.mobileVendasCommissionRows}>
                {(commissionSummary?.payouts || []).map((payout) => (
                  <article key={payout.id}>
                    <div>
                      <strong>{payout.referenceLabel || "Fechamento"}</strong>
                      <span>
                        {payout.sellerName || payout.sellerEmail || "Geral"} · {payout.leadCount} comissão(ões) · {formatDateTime(payout.paidAt || payout.createdAt)}
                      </span>
                    </div>
                    <b>{formatCurrency(payout.totalAmount || 0)}</b>
                    <button
                      type="button"
                      className={styles.mobileCommissionReceiptButton}
                      onClick={() => void openCommissionReceipt(payout.id)}
                      disabled={commissionReceiptLoadingId === payout.id}
                    >
                      {commissionReceiptLoadingId === payout.id ? "Abrindo" : "Comprovante"}
                    </button>
                    <small>{String(payout.status || "").toLowerCase() === "canceled" ? "Cancelado" : "Pago"}</small>
                  </article>
                ))}
              </div>
            ) : (
              <HbxMobileEmptyState
                kind="commission"
                surface="inline"
                title="Nenhum fechamento pago ainda."
                description="Pagamentos registrados aparecem aqui com comprovante e status."
              />
            )}
          </section>
        </div>
      );
    }

    function renderMobileLeadDetail(lead: LeadItem) {
      const intelligence = lead.leadIntelligence || {};
      const expandedView = leadExpandedCardView(lead, board);
      const capabilities = leadCapabilities(lead, board);
      const intelligenceVisible = canSeeLeadIntelligence(lead, board);
      const socialLinksVisible = canSeeSocialLinks(lead, board);
      const score = Math.max(
        0,
        Math.min(100, Math.round(Number(intelligenceVisible ? intelligence.opportunityScore || 0 : 0))),
      );
      const visibleScore = intelligenceVisible ? mobileAnimatedScore : score;
      const scoreLabel = intelligenceScoreLabel(score);
      const template = activeMobileTemplate(lead);
      const readyMessage = capabilities.canSeeMessageTemplates
        ? template.text
        : `Olá, tudo bem? Encontrei a ${lead.name || "sua empresa"} e queria apresentar uma solução simples para organizar contatos e retornos.`;
      const whatsappHref = isLeadWhatsappConfirmed(lead)
        ? buildWhatsAppUrlWithMessage(lead.phone, readyMessage)
        : "";
      const callHref = buildCallUrl(lead.phone);
      const email = leadEmailForDisplay(lead);
      const emailHref = email ? `mailto:${email}` : "";
      const website = leadWebsiteForDisplay(lead);
      const websiteHref = normalizeExternalUrl(website);
      const instagramHref = socialLinksVisible ? normalizeExternalUrl(intelligence.instagramUrl) : "";
      const facebookHref = socialLinksVisible ? normalizeExternalUrl(intelligence.facebookUrl) : "";
      const possibleInstagramHref = socialLinksVisible && !instagramHref
        ? normalizeExternalUrl(leadPossibleSocialCandidateByNetwork(lead, "instagram")?.url)
        : "";
      const possibleFacebookHref = socialLinksVisible && !facebookHref
        ? normalizeExternalUrl(leadPossibleSocialCandidateByNetwork(lead, "facebook")?.url)
        : "";
      const possibleSocialVisible = Boolean(possibleInstagramHref || possibleFacebookHref);
      const socialBadge = socialBadgeLabel(intelligence.primarySocial) || (possibleSocialVisible ? "Possível" : "");
      const socialTeaserVisible = capabilities.canSeeSocialLinks === "teaser_only" && Boolean(socialBadge);
      const whatsappStatus = getLeadWhatsappStatus(lead);
      const whatsappReady = whatsappStatus === "available";
      const whatsappUnavailable = whatsappStatus === "unavailable";
      const tags = intelligence.leadReasonTags || [];
      const reasonChipTonePriority: Record<string, number> = {
        smart: 5,
        success: 4,
        primary: 3,
        danger: 3,
        neutral: 1,
      };
      const rawReasonChips = [
        !website ? { label: "Sem site", tone: "danger" } : null,
        whatsappReady ? { label: "WhatsApp confirmado", tone: "success" } : null,
        email ? { label: "E-mail encontrado", tone: "success" } : null,
        lead.city ? { label: "Cidade alvo", tone: "primary" } : null,
        intelligenceVisible && (intelligence.contactQuality === "ready" || score >= 70)
          ? { label: "Lead inteligente", tone: "smart" }
          : null,
        ...tags.map((tag) => ({ label: leadTagLabel(tag), tone: "neutral" })),
      ].filter(Boolean) as Array<{ label: string; tone: string }>;
      const reasonChips = Array.from(
        rawReasonChips.reduce((byLabel, chip) => {
          const key = chip.label.trim().toLowerCase();
          const current = byLabel.get(key);
          if (
            !current ||
            (reasonChipTonePriority[chip.tone] || 0) >
              (reasonChipTonePriority[current.tone] || 0)
          ) {
            byLabel.set(key, chip);
          }
          return byLabel;
        }, new Map<string, { label: string; tone: string }>())
          .values(),
      ).slice(0, 5);
      const loadingEnrichment = mobileEnrichmentLoadingId === lead.id;
      const enrichmentOperation = leadEnrichmentOperationView(lead, board, loadingEnrichment);
      const timeline = (lead.timeline || []).slice(0, 4);
      const timelineEntries = timeline.length
        ? timeline
        : [
            {
              id: "empty",
              eventType: "generic",
              title: "Lead validado pelo HBX",
              description: intelligence.opportunityReason || "Aguardando primeira observação.",
              createdAt: new Date().toISOString(),
              sourceType: "hbx",
            } as LeadTimelineEvent,
          ];
      const detailPlace = mobileLeadPlace(lead);
      const status = lead.statusLabel || statusLabel(lead.status);
      const suggestedAction = lead.nextAction || nextBestActionLabel(intelligence.nextBestAction);
      const priorityLabel = score ? scoreLabel : "Aguardando dados";
      const premiumTeaser = socialTeaserVisible
        ? { label: "Redes encontradas", cta: "Disponível no HBX Lead Plus - Ver card inteligente" }
        : !intelligenceVisible && intelligence.premiumTeaser
        ? { label: intelligence.premiumTeaser.label || "Disponível no HBX Lead Plus", cta: intelligence.premiumTeaser.cta || "Ver card inteligente" }
        : null;
      const enrichmentDisplay = leadEnrichmentDisplay(lead, board);
      const mobileLeadActionBar = (
        <nav
          className={`${styles.mobileLeadDetailActionBar} hbx-mobile-action-bar`}
          aria-label="Ações do lead"
          data-has-sale="true"
        >
          <a
            className="hbx-mobile-primary-button"
            href={whatsappHref || undefined}
            target="_blank"
            rel="noreferrer"
            aria-disabled={!whatsappHref}
            data-tone="whatsapp"
            onClick={(event) => {
              if (!whatsappHref) event.preventDefault();
              else void incrementAttempt(lead.id);
            }}
          >
            WhatsApp
          </a>
          <button
            type="button"
            className="hbx-mobile-secondary-button"
            data-tone="sale"
            onClick={() => openAssistedSignup(lead)}
            disabled={assistedSignupSaving || savingLeadId === lead.id}
          >
            Fechou Venda!
          </button>
          <button
            type="button"
            className="hbx-mobile-secondary-button"
            onClick={() => openMobileReturnScheduler(lead)}
            disabled={savingLeadId === lead.id}
          >
            Retorno
          </button>
          <button
            type="button"
            className="hbx-mobile-secondary-button"
            data-tone="danger"
            onClick={() => void runQuickAction(lead, "encerrar")}
            disabled={savingLeadId === lead.id}
          >
            Negativo
          </button>
        </nav>
      );
      const mobileTimelineList = (
        <div className={styles.mobileLeadHistoryList}>
          {timelineEntries.map((event) => (
            <div key={event.id} data-tone={timelineTone(event.eventType)}>
              <span aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M12 8v4l3 2" />
                  <circle cx="12" cy="12" r="8" />
                </svg>
              </span>
              <p>
                <strong>{timelineMeta(event)}</strong>
                {event.title || event.description || "Atendimento atualizado."}
                {event.conversationReference?.conversationId ? (
                  <button
                    type="button"
                    className={styles.timelineConversationLink}
                    onClick={(clickEvent) => {
                      clickEvent.stopPropagation();
                      void openConversationSnapshot(lead, event);
                    }}
                  >
                    Ver conversa
                  </button>
                ) : null}
              </p>
            </div>
          ))}
        </div>
      );

      return (
        <section className={`${styles.mobileVendasShell} ${styles.mobileLeadDetailShell} hbx-mobile-page`} aria-label="Detalhe do lead mobile">
          <div className={`${styles.mobileLeadDetailScreen} hbx-mobile-page`}>
            <header className={`${styles.mobileLeadDetailHeader} ${styles.mobileLeadDetailCloseHeader} hbx-mobile-header`}>
              <button
                type="button"
                className={`${styles.mobileLeadBackButton} ${styles.mobileLeadCloseButton} hbx-mobile-secondary-button`}
                onClick={closeMobileLeadDetail}
                aria-label="Fechar observações"
              >
                X
              </button>
            </header>

            <div className={styles.mobileLeadDetailBody}>
              {feedback ? <div className={`${styles.feedback} hbx-mobile-notice`}>{feedback}</div> : null}
              {error ? <div className={`${styles.errorBanner} hbx-mobile-notice`} data-tone="error">{vendasClientMessage(error)}</div> : null}

              <section className={`${styles.mobileLeadHeroPremium} hbx-mobile-hero hbx-mobile-glass`}>
                <span className={styles.mobileLeadHeroVisual} aria-hidden="true" />
                <div className={styles.mobileLeadHeroIdentity}>
                  <div className={styles.mobileLeadPlusAvatar} aria-hidden="true">
                    {expandedView.closed.avatarText}
                  </div>
                  <div>
                    <strong>{expandedView.closed.title}</strong>
                    <span>{expandedView.closed.segment}</span>
                    <em>{detailPlace}</em>
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.mobileLeadScoreButton}
                  onClick={() => setMobileScoreLead(lead)}
                  aria-label="Ver explicação do score"
                >
                  <MobileLeadScoreGauge
                    className={styles.mobileLeadScoreBox}
                    premium
                    locked={!intelligenceVisible}
                    value={visibleScore}
                    label={!intelligenceVisible ? "♕ Score" : "Score"}
                    caption={intelligenceVisible ? priorityLabel : "HBX Lead Plus"}
                  />
                </button>
                <div className={styles.mobileLeadHeroMeta} aria-label="Resumo do lead">
                  <span>{status}</span>
                  <span>{mobileReturnLabel(lead)}</span>
                  {socialBadge ? <span data-tone="social">{socialBadge}</span> : null}
                  <span>{mobileLeadSourceLabel(lead)}</span>
                </div>
              </section>

              {enrichmentDisplay ? (
                <section className={`${styles.mobileLeadEnrichmentStatus} hbx-mobile-card`} data-tone={enrichmentDisplay.tone}>
                  <span aria-hidden="true">
                    <CrownGlyph />
                  </span>
                  <div>
                    <strong>{enrichmentDisplay.label}</strong>
                    <small>{enrichmentDisplay.detail}</small>
                  </div>
                </section>
              ) : null}

              <section className={`${styles.mobileLeadEnrichmentOperation} hbx-mobile-card`} data-tone={enrichmentOperation.tone}>
                <div>
                  <strong>{enrichmentOperation.title}</strong>
                  <small>{enrichmentOperation.detail}</small>
                </div>
                <b>{vendasEnrichmentCreditsView(board).label}</b>
              </section>

              <section className={`${styles.mobileLeadExpandedChannels} hbx-mobile-card`} aria-label="Canais encontrados">
                {expandedView.channels.slice(0, 6).map((channel) => (
                  <a
                    key={channel.key}
                    href={channel.href || undefined}
                target={channel.external && channel.href ? "_blank" : undefined}
                rel={channel.external && channel.href ? "noreferrer" : undefined}
                    aria-disabled={!channel.href || channel.status === "missing"}
                    data-channel={channel.key}
                    data-status={channel.status}
                    onClick={(event) => {
                      if (!channel.href || channel.status === "missing") event.preventDefault();
                    }}
                  >
                    <span><HbxRadarPngIcon name={channel.key} /></span>
                    <b>{channel.label}</b>
                  </a>
                ))}
              </section>

              {mobileScoreLead?.id === lead.id ? (
                <div className={styles.mobileScoreSheetBackdrop} role="presentation" onClick={() => setMobileScoreLead(null)}>
                  <section
                    className={styles.mobileScoreSheet}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Explicação do score"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <header>
                      <div>
                        <span>Score do card</span>
                        <strong>{lead.name || "Lead"}</strong>
                      </div>
                      <button type="button" onClick={() => setMobileScoreLead(null)} aria-label="Fechar explicação do score">
                        X
                      </button>
                    </header>
                    <p>
                      O score mostra quão fácil parece abordar esse lead agora, somando contato disponível, fit com sua busca e sinais comerciais.
                    </p>
                    <div className={styles.mobileScoreBreakdown}>
                      {buildSellerScoreBreakdown(lead).map((row) => (
                        <span key={row.label}>
                          <b>{row.label}</b>
                          <strong>+{row.points}</strong>
                        </span>
                      ))}
                    </div>
                  </section>
                </div>
              ) : null}

              <section className={`${styles.mobileLeadContactPanel} hbx-mobile-card`} aria-label="Contato do lead">
                <div className={styles.mobileLeadContactRows}>
                  <div>
                    <span className={styles.mobileLeadRowIcon} aria-hidden="true">
                      ID
                    </span>
                    <strong>{expandedView.fields.find((field) => field.key === "cnpj")?.value || "Não encontrado"}</strong>
                    <b data-tone={expandedView.fields.find((field) => field.key === "cnpj")?.tone === "success" ? "success" : "muted"}>
                      CNPJ
                    </b>
                  </div>
                  <div>
                    <span className={styles.mobileLeadRowIcon} aria-hidden="true">
                      <svg viewBox="0 0 24 24">
                        <path d="M6.6 10.8c1.5 3 3.6 5.1 6.6 6.6l2.2-2.2c.3-.3.8-.4 1.2-.2 1.3.4 2.6.7 4 .7.7 0 1.2.5 1.2 1.2v3.5c0 .7-.5 1.2-1.2 1.2C10.8 21.6 2.4 13.2 2.4 3.4c0-.7.5-1.2 1.2-1.2h3.5c.7 0 1.2.5 1.2 1.2 0 1.4.2 2.7.7 4 .1.4 0 .9-.3 1.2l-2.1 2.2Z" />
                      </svg>
                    </span>
                    <strong>{mobilePhoneLabel(lead)}</strong>
                    <b data-tone={whatsappUnavailable ? "danger" : whatsappReady ? "success" : "muted"}>
                      {whatsappStatusLabel(whatsappStatus)}
                    </b>
                  </div>
                  <div>
                    <span className={styles.mobileLeadRowIcon} aria-hidden="true">
                      <svg viewBox="0 0 24 24">
                        <path d="M4 6h16v12H4z" />
                        <path d="m4 7 8 6 8-6" />
                      </svg>
                    </span>
                    {emailHref ? (
                      <a
                        className={styles.mobileLeadContactLink}
                        href={emailHref}
                        aria-label={`Enviar e-mail para ${email}`}
                      >
                        {email}
                      </a>
                    ) : (
                      <strong>E-mail não encontrado</strong>
                    )}
                    <b data-tone={email ? "success" : "muted"}>{email ? "E-mail encontrado" : "Sem e-mail"}</b>
                  </div>
                  <div>
                    <span className={styles.mobileLeadRowIcon} aria-hidden="true">
                      <svg viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M3 12h18" />
                        <path d="M12 3c2.5 2.5 3.5 5.5 3.5 9S14.5 18.5 12 21" />
                        <path d="M12 3c-2.5 2.5-3.5 5.5-3.5 9s1 6.5 3.5 9" />
                      </svg>
                    </span>
                    {websiteHref ? (
                      <a
                        className={styles.mobileLeadContactLink}
                        href={websiteHref}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Abrir site de ${lead.name || "lead"}`}
                      >
                        {website}
                      </a>
                    ) : (
                      <strong>Sem site</strong>
                    )}
                    <b data-tone={website ? "smart" : "muted"}>{website ? "Site encontrado" : "Sem site"}</b>
                  </div>
                  <div>
                    <span className={styles.mobileLeadRowIcon} aria-hidden="true">
                      <svg viewBox="0 0 24 24">
                        <path d="M12 21s7-4.8 7-11a7 7 0 0 0-14 0c0 6.2 7 11 7 11Z" />
                        <circle cx="12" cy="10" r="2.2" />
                      </svg>
                    </span>
                    {expandedView.fields.find((field) => field.key === "address")?.href ? (
                      <a
                        className={styles.mobileLeadContactLink}
                        href={expandedView.fields.find((field) => field.key === "address")?.href}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {expandedView.fields.find((field) => field.key === "address")?.value}
                      </a>
                    ) : (
                      <strong>{expandedView.fields.find((field) => field.key === "address")?.value || "Não informado"}</strong>
                    )}
                    <b data-tone={lead.address ? "success" : "muted"}>Endereço</b>
                  </div>
                  {(instagramHref || facebookHref) && socialLinksVisible ? (
                    <div>
                      <span className={styles.mobileLeadRowIcon} aria-hidden="true">
                        {socialBadge}
                      </span>
                      <strong>Rede social encontrada</strong>
                      <b data-tone="success">Links liberados</b>
                    </div>
                  ) : null}
                  {possibleSocialVisible ? (
                    <div data-certainty="possible">
                      <span className={styles.mobileLeadRowIcon} aria-hidden="true">
                        ?
                      </span>
                      <strong>Rede social possível</strong>
                      <b data-tone="muted">Revisar perfil</b>
                    </div>
                  ) : null}
                </div>
                {(instagramHref || facebookHref || possibleInstagramHref || possibleFacebookHref) ? (
                  <div className={styles.mobileLeadSocialActions}>
                    {instagramHref ? (
                      <a href={instagramHref} target="_blank" rel="noreferrer">
                        Abrir Instagram
                      </a>
                    ) : null}
                    {facebookHref ? (
                      <a href={facebookHref} target="_blank" rel="noreferrer">
                        Abrir Facebook
                      </a>
                    ) : null}
                    {possibleInstagramHref ? (
                      <a href={possibleInstagramHref} target="_blank" rel="noreferrer" data-certainty="possible">
                        Revisar Instagram
                      </a>
                    ) : null}
                    {possibleFacebookHref ? (
                      <a href={possibleFacebookHref} target="_blank" rel="noreferrer" data-certainty="possible">
                        Revisar Facebook
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </section>

              {premiumTeaser ? (
                <section className={`${styles.mobileLeadPremiumTeaser} hbx-mobile-card`}>
                  <span aria-hidden="true">♕</span>
                  <div>
                    <strong>{premiumTeaser.label}</strong>
                    <small>{premiumTeaser.cta}</small>
                  </div>
                </section>
              ) : null}

              <section className={`${styles.mobileLeadReasonBlock} hbx-mobile-card`} data-locked={!capabilities.canSeeOpportunityReason ? "true" : "false"}>
                <h3>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="8" />
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 2v3" />
                    <path d="M22 12h-3" />
                  </svg>
                  Sinais comerciais
                </h3>
                <div>
                  {(reasonChips.length ? reasonChips : [{ label: "Cidade alvo", tone: "primary" }]).map((chip) => (
                    <span key={`${chip.label}:${chip.tone}`} data-tone={chip.tone}>
                      {chip.label}
                    </span>
                  ))}
                </div>
                <p>
                  {capabilities.canSeeOpportunityReason
                    ? intelligence.opportunityReason || "Revise os sinais comerciais antes da abordagem."
                    : "Motivo da oportunidade disponível no HBX Lead Plus."}
                </p>
              </section>

              <section className={`${styles.mobileLeadNextActionBox} hbx-mobile-card`}>
                <h3>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m13 2-8 12h7l-1 8 8-12h-7l1-8Z" />
                  </svg>
                  Próxima ação
                </h3>
                <a
                  href={whatsappHref || undefined}
                  target="_blank"
                  rel="noreferrer"
                  aria-disabled={!whatsappHref}
                  onClick={(event) => {
                    if (!whatsappHref) event.preventDefault();
                    else void incrementAttempt(lead.id);
                  }}
                >
                  <span aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M19.05 4.94A9.8 9.8 0 0 0 12.06 2C6.59 2 2.13 6.46 2.13 11.93c0 1.75.46 3.46 1.32 4.97L2 22l5.27-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.47 0 9.93-4.46 9.93-9.93a9.86 9.86 0 0 0-2.95-6.97Z" />
                    </svg>
                  </span>
                  {suggestedAction}
                  <b aria-hidden="true">›</b>
                </a>
              </section>

              <section className={`${styles.mobileLeadReadyMessage} hbx-mobile-card`}>
                <h3>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 5h16v11H7l-3 3V5Z" />
                    <path d="M8 9h8" />
                    <path d="M8 13h5" />
                  </svg>
                  Mensagem pronta
                </h3>
                <p>
                  {!capabilities.canSeeMessageTemplates
                    ? "Mensagem pronta por segmento disponível no HBX Lead Plus."
                    : loadingEnrichment
                      ? "Verificando WhatsApp..."
                      : readyMessage}
                </p>
                <div className={styles.mobileLeadQuickGrid}>
                  <a
                    href={callHref || undefined}
                    aria-disabled={!callHref}
                    onClick={(event) => {
                      if (!callHref) event.preventDefault();
                      else void incrementAttempt(lead.id);
                    }}
                  >
                    Ligar
                  </a>
                  <a href={emailHref || undefined} aria-disabled={!emailHref}>
                    E-mail
                  </a>
                  <button
                    type="button"
                    data-tone="primary"
                    onClick={() => void copyMobileText(readyMessage, "Mensagem copiada.")}
                    disabled={!capabilities.canSeeMessageTemplates}
                  >
                    Copiar msg
                  </button>
                  <button
                    type="button"
                    onClick={() => refreshMobileTemplate(lead)}
                    disabled={!capabilities.canSeeMessageTemplates}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M20 7v5h-5" />
                      <path d="M4 17v-5h5" />
                      <path d="M6.1 9A7 7 0 0 1 18 6.2L20 8" />
                      <path d="M17.9 15A7 7 0 0 1 6 17.8L4 16" />
                    </svg>
                    Atualizar
                  </button>
                </div>
              </section>

              <section id="mobile-lead-note" className={`${styles.mobileLeadObservationCard} hbx-mobile-card`}>
                <span className={styles.mobileLeadObservationVisual} aria-hidden="true" />
                <div className={styles.mobileLeadObservationHeader}>
                  <h3>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M5 5h14v11H8l-3 3V5Z" />
                      <path d="M9 9h6" />
                      <path d="M9 13h4" />
                    </svg>
                    Observações
                  </h3>
                  <button
                    type="button"
                    className={styles.mobileLeadObservationHistoryButton}
                    onClick={() => setMobileHistoryOpen(true)}
                    aria-label="Abrir histórico de observações"
                  >
                    Obs
                  </button>
                </div>
                {lead.shortNote ? (
                  <p className={styles.mobileLeadSavedNote}>{lead.shortNote}</p>
                ) : null}
                <label className={styles.mobileLeadNoteEditor}>
                  <span>Nova nota</span>
                  <textarea
                    value={mobileNoteDraft}
                    onChange={(event) => setMobileNoteDraft(event.target.value)}
                    onFocus={() => {
                      mobileSkipDraftHydrateRef.current = true;
                    }}
                    onBlur={() => {
                      mobileSkipDraftHydrateRef.current = false;
                      const snapshot = boardRef.current;
                      if (snapshot) setDrafts(hydrateDrafts(snapshot));
                    }}
                    rows={4}
                    maxLength={280}
                    placeholder="Escreva o contexto do atendimento, objeções, próximos passos ou qualquer detalhe importante."
                  />
                </label>
                <button
                  type="button"
                  className={`${styles.mobileLeadSaveNoteButton} hbx-mobile-primary-button`}
                  onClick={() => void saveMobileNote()}
                  disabled={mobileSavingNote || savingLeadId === lead.id}
                >
                  {mobileSavingNote ? "Salvando" : "Salvar observação"}
                </button>
                <button
                  type="button"
                  className={`${styles.mobileLeadRefreshButton} hbx-mobile-secondary-button`}
                  onClick={() => refreshMobileTemplate(lead)}
                >
                  Atualizar mensagem
                </button>
                <button
                  type="button"
                  className={`${styles.mobileLeadRefreshButton} hbx-mobile-secondary-button`}
                  onClick={() => void loadMobileLeadEnrichment(lead)}
                  disabled={!enrichmentOperation.canRequest}
                >
                  {enrichmentOperation.action}
                </button>
              </section>

            </div>

            {mobileHistoryOpen && typeof document !== "undefined"
              ? createPortal(
                  <div
                    className={styles.mobileVendasSheetBackdrop}
                    onClick={() => setMobileHistoryOpen(false)}
                  >
                    <section
                      className={`${styles.mobileVendasNoteSheet} ${styles.mobileObservationDialog} ${styles.mobileLeadHistoryDialog}`}
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="mobile-lead-history-title"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <span className={styles.mobileVendasSheetHandle} />
                      <div className={styles.mobileVendasSheetHeader}>
                        <div>
                          <small>{lead.name || "Lead sem nome"}</small>
                          <h2 id="mobile-lead-history-title">Histórico</h2>
                        </div>
                        <button type="button" onClick={() => setMobileHistoryOpen(false)} aria-label="Fechar histórico">
                          ×
                        </button>
                      </div>
                      {mobileTimelineList}
                      <div className={styles.mobileVendasSheetFooter}>
                        <button
                          type="button"
                          className={styles.mobileVendasDeleteButton}
                          onClick={() => setMobileHistoryOpen(false)}
                        >
                          Fechar
                        </button>
                      </div>
                    </section>
                  </div>,
                  document.body,
                )
              : null}

            {mobileLeadActionBar}
            <HbxMobileDock
              primaryLabel={mobileVendasDockLabel}
              primaryTone={mobileVendasDockTone}
              onPrimaryAction={() => setComposerOpen(true)}
              onComissao={() => {
                setSelectedMobileLeadId(null);
                setMobileSection("commission");
              }}
              onRelatorio={() => {
                setSelectedMobileLeadId(null);
                setMobileSection("report");
              }}
              onConta={() => {
                setAccountNameDraft(mobilePreferredCallerName || readMobilePreferredCallerName());
                setAccountSheetOpen(true);
              }}
            />
          </div>
        </section>
      );
    }

    if (selectedMobileLead) return renderMobileLeadDetail(selectedMobileLead);

    return (
      <section className={`${styles.mobileVendasShell} ${styles.mobileLeadListScreen}`} aria-label="Vendas mobile">
        <div className={styles.mobileVendasContextBar}>
          <header className={`${styles.mobileVendasHeader} hbx-mobile-header`}>
            <section
              className={styles.mobileVendasHeroPanel}
              data-state={salesHeaderState}
              data-radar-state={mobileRadarState}
              data-pulse={radarStatusPulseKey}
              aria-label="Resumo de Vendas"
            >
              <SalesMotionBackground />
              <HeroPremiumCrown
                active={mobileHeroPremiumActive}
                onClick={() => {
                  if (!mobileHeroPremiumAvailable) {
                    window.location.href = toMobileRoute("/planos?intent=lead");
                    return;
                  }
                  setMobileAutoEnrichmentActive((current) => {
                    const next = !current;
                    saveMobileAutoEnrichmentPreference(next);
                    return next;
                  });
                }}
              />
              {renderMasterNoticeBell()}
              <span className={styles.mobileVendasHeroCopy}>
                <strong>Vendas</strong>
                <em>{salesHeaderSubtitle}</em>
              </span>
              <span className={styles.mobileVendasHeroGoal}>
                <b>
                  {mobileRadarState === "searching" ? (
                    <i />
                  ) : mobileRadarState === "paused" ? (
                    "II"
                  ) : mobileRadarState === "stopped" || mobileRadarState === "partial" ? (
                    "!"
                  ) : (
                    "✓"
                  )}
                </b>
                <span>
                  <strong>{mobileRadarStatusLabel}</strong>
                  <em>{mobileRadarStatusText}</em>
                </span>
              </span>
              <Link
                className={styles.mobileVendasHeroAction}
                href={mobileRadarState === "stopped" || mobileRadarState === "partial" ? radarAdjustHref : "/radar-digital"}
                aria-label={
                  mobileRadarState === "stopped" || mobileRadarState === "partial"
                    ? "Ajustar Radar Digital"
                    : "Abrir Radar Digital"
                }
              >
                {mobileRadarState === "stopped" || mobileRadarState === "partial" ? "Ajustar Radar" : "Abrir Radar"}
              </Link>
            </section>
          </header>

          <div className={styles.mobileVendasHeroStats} aria-label="Resumo de Vendas">
            <button
              type="button"
              data-tone="danger"
              data-active={mobileAgendaTab === "overdue" ? "true" : "false"}
              data-holding={mobileBulkHoldTab === "overdue" ? "true" : "false"}
              onPointerDown={(event) => startMobileBulkHold(event, "overdue")}
              onPointerUp={finishMobileBulkHold}
              onPointerCancel={cancelMobileBulkHold}
              onPointerLeave={cancelMobileBulkHold}
              onClick={(event) => {
                if (mobileBulkHoldCompletedRef.current) {
                  event.preventDefault();
                  return;
                }
                setMobileSection("today");
                setMobileAgendaTab("overdue");
              }}
            >
              <b>Atrasados</b>
              <strong>{board?.summary.overdue ?? 0}</strong>
            </button>
            <button
              type="button"
              data-tone="primary"
              data-active={mobileAgendaTab === "today" ? "true" : "false"}
              data-holding={mobileBulkHoldTab === "today" ? "true" : "false"}
              onPointerDown={(event) => startMobileBulkHold(event, "today")}
              onPointerUp={finishMobileBulkHold}
              onPointerCancel={cancelMobileBulkHold}
              onPointerLeave={cancelMobileBulkHold}
              onClick={(event) => {
                if (mobileBulkHoldCompletedRef.current) {
                  event.preventDefault();
                  return;
                }
                setMobileSection("today");
                setMobileAgendaTab("today");
              }}
            >
              <b>Hoje</b>
              <strong>{board?.summary.today ?? mobileLeadCount}</strong>
            </button>
            <button
              type="button"
              data-tone="success"
              data-active={mobileAgendaTab === "upcoming" ? "true" : "false"}
              onClick={() => {
                setMobileSection("today");
                setMobileAgendaTab("upcoming");
              }}
            >
              <b>Próximos</b>
              <strong>{mobileFutureCount}</strong>
            </button>
            <button
              type="button"
              data-tone="commission"
              data-active={mobileSection === "commission" ? "true" : "false"}
              onClick={() => {
                setMobileSection("commission");
                setSelectedMobileLeadId(null);
              }}
            >
              <b>Comissão</b>
              <strong>{formatCurrency(payableAmount).replace(/\s/g, "")}</strong>
            </button>
          </div>

          <section
            className={styles.mobileVendasVisualFilters}
            data-locked={mobileVisualFiltersUnlocked ? "false" : "true"}
            data-active={mobileVisualFiltersActive ? "true" : "false"}
            aria-label="Filtros visuais dos cards"
          >
            <div className={styles.mobileVendasVisualFilterScroller}>
              {MOBILE_VISUAL_FILTERS.map((filter) => {
                const active = mobileVisualChannelFilters.includes(filter.value);
                return (
                  <button
                    type="button"
                    key={filter.value}
                    data-active={active ? "true" : "false"}
                    disabled={!mobileVisualFiltersUnlocked}
                    onClick={() => toggleMobileVisualFilter(filter.value)}
                    title={mobileVisualFiltersUnlocked ? filter.label : "Disponível no HBX Lead Plus"}
                    aria-label={`${active ? "Remover filtro" : "Filtrar por"} ${filter.label}`}
                  >
                    <MobileChannelIconAsset channel={filter.asset} />
                    <span>{filter.label}</span>
                    {active ? <b>on</b> : null}
                    {!mobileVisualFiltersUnlocked ? <CrownGlyph /> : null}
                  </button>
                );
              })}
              <button
                type="button"
                className={styles.mobileVendasScoreIconFilter}
                data-active={mobileMinScoreFilter > 0 ? "true" : "false"}
                onClick={() => setMobileScoreFilterOpen((current) => !current)}
                title={mobileMinScoreFilter ? `Score mínimo ${mobileMinScoreFilter}+` : "Filtrar por score"}
                aria-label={mobileMinScoreFilter ? `Score mínimo ${mobileMinScoreFilter}+` : "Abrir filtro de score"}
                aria-pressed={mobileScoreFilterOpen ? "true" : "false"}
              >
                <strong aria-hidden="true">S</strong>
                {mobileMinScoreFilter > 0 ? <b>{mobileMinScoreFilter}+</b> : null}
              </button>
              <button
                type="button"
                className={styles.mobileVendasClearVisualFilters}
                disabled={!mobileVisualFiltersActive}
                onClick={clearMobileVisualFilters}
                title="Limpar filtros"
                aria-label="Limpar filtros"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M4 7h16" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                  <path d="M6 7l1 14h10l1-14" />
                  <path d="M9 7V4h6v3" />
                </svg>
              </button>
            </div>
          </section>

          {mobileScoreFilterOpen && typeof document !== "undefined" ? createPortal(
            <div
              className={styles.mobileVendasScoreModalBackdrop}
              role="presentation"
              onClick={() => setMobileScoreFilterOpen(false)}
            >
              <section
                className={styles.mobileVendasScoreModal}
                role="dialog"
                aria-modal="true"
                aria-labelledby="mobile-score-filter-title"
                onClick={(event) => event.stopPropagation()}
              >
                <header className={styles.mobileVendasScoreModalHeader}>
                  <div>
                    <span>Filtro de score</span>
                    <strong id="mobile-score-filter-title">Score mínimo</strong>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMobileScoreFilterOpen(false)}
                    aria-label="Fechar filtro de score"
                  >
                    ×
                  </button>
                </header>

                <div
                  className={styles.mobileVendasScoreModalMeter}
                  data-empty={mobileMinScoreFilter <= 0 ? "true" : "false"}
                  style={{ "--mobile-score-filter": `${mobileMinScoreFilter}%` } as CSSProperties}
                >
                  <div className={styles.mobileVendasScoreModalRing}>
                    <strong>{mobileMinScoreFilter}</strong>
                    <span>mínimo</span>
                  </div>
                  <p>
                    Exibe apenas cards com score igual ou maior.
                  </p>
                </div>

                <div className={styles.mobileVendasScoreModalControls} data-locked={mobileVisualFiltersUnlocked ? "false" : "true"}>
                  <button
                    type="button"
                    disabled={!mobileVisualFiltersUnlocked || mobileMinScoreFilter <= 0}
                    onClick={() => stepMobileScoreFilter(-1)}
                    aria-label="Diminuir score mínimo em 1"
                  >
                    -
                  </button>
                  <label>
                    <span>{mobileVisualFiltersUnlocked ? "Arraste para calibrar a régua" : "Disponível no HBX Lead Plus"}</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={mobileMinScoreFilter}
                      disabled={!mobileVisualFiltersUnlocked}
                      onChange={(event) => setMobileScoreFilterValue(Number(event.target.value))}
                      aria-label="Score mínimo de 0 a 100"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={!mobileVisualFiltersUnlocked || mobileMinScoreFilter >= 100}
                    onClick={() => stepMobileScoreFilter(1)}
                    aria-label="Aumentar score mínimo em 1"
                  >
                    +
                  </button>
                </div>

                <footer className={styles.mobileVendasScoreModalActions}>
                  <button
                    type="button"
                    disabled={mobileMinScoreFilter <= 0}
                    onClick={() => setMobileScoreFilterValue(0)}
                  >
                    Limpar
                  </button>
                  <button type="button" onClick={() => setMobileScoreFilterOpen(false)}>
                    Usar filtro
                  </button>
                </footer>
              </section>
            </div>,
            document.body,
          ) : null}

          <HbxPulseSummaryCard mode="mobile" refreshKey={pulseRefreshKey} />

          {nextRecommendedMobileLead && mobileSection !== "report" && mobileSection !== "commission" ? (
            <section className={styles.mobileVendasRecommendedCard} aria-label="Próximo card recomendado">
              <button
                type="button"
                onClick={() => openMobileLeadDetail(nextRecommendedMobileLead)}
              >
                <span className={styles.mobileVendasRecommendedTopline}>
                  <span>Próximo card recomendado</span>
                  <MobileEnrichmentCrown lead={nextRecommendedMobileLead} board={board} compact />
                </span>
                <strong>{nextRecommendedMobileLead.name || "Lead sem nome"}</strong>
                <small>
                  {mobileLeadPlace(nextRecommendedMobileLead)} · {nextRecommendedMobileLead.nextAction || "Executar contato"}
                </small>
              </button>
              <div className={styles.mobileVendasRecommendedFooter}>
                <a
                  className={styles.mobileVendasRecommendedPhone}
                  href={leadWhatsappHref(nextRecommendedMobileLead) || buildCallUrl(nextRecommendedMobileLead.phone) || undefined}
                  aria-disabled={!leadWhatsappHref(nextRecommendedMobileLead) && !buildCallUrl(nextRecommendedMobileLead.phone)}
                  aria-label={`Abrir telefone de ${nextRecommendedMobileLead.name || "lead"}`}
                  onClick={(event) => {
                    if (!leadWhatsappHref(nextRecommendedMobileLead) && !buildCallUrl(nextRecommendedMobileLead.phone)) {
                      event.preventDefault();
                    } else {
                      void incrementAttempt(nextRecommendedMobileLead.id);
                    }
                  }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6.6 10.8c1.4 2.8 3.7 5.1 6.5 6.5l2.2-2.2c.3-.3.8-.4 1.2-.2 1.3.4 2.6.7 4 .7.7 0 1.2.5 1.2 1.2v3.5c0 .7-.5 1.2-1.2 1.2C10.3 22 2 13.7 2 3.2 2 2.5 2.5 2 3.2 2h3.6C7.5 2 8 2.5 8 3.2c0 1.4.2 2.8.7 4 .1.4 0 .8-.3 1.1l-2.2 2.5Z" />
                  </svg>
                </a>
                <button type="button" onClick={() => executeMobileLead(nextRecommendedMobileLead)}>
                  Chamar agora
                </button>
                <button
                  type="button"
                  aria-label={`Abrir observação de ${nextRecommendedMobileLead.name || "lead"}`}
                  onClick={() => {
                    setMobileNoteLead(nextRecommendedMobileLead);
                    setMobileNoteDraft(nextRecommendedMobileLead.shortNote || "");
                  }}
                >
                  Observação
                </button>
              </div>
            </section>
          ) : null}

        </div>

        {mobileSection === "report" ? renderMobileReport() : mobileSection === "commission" ? renderMobileCommission() : loading ? (
          <div className={`${styles.mobileVendasLoading} hbx-mobile-empty`}>
            <span />
            <strong>Carregando agenda</strong>
          </div>
        ) : (
          <div className={styles.mobileVendasList}>
            {mobileLeads.length ? (
              mobileLeads.map(({ lead }, index) => {
                const status = lead.statusLabel || statusLabel(lead.status);
                const closedView = leadClosedCardView(lead, board);
                return (
                  <div
                    className={styles.mobileVendasSwipeShell}
                    key={lead.id}
                  >
                    <article
                      className={`${styles.mobileVendasCard} hbx-mobile-card`}
                      role="button"
                      tabIndex={0}
                      onClick={() => openMobileLeadDetail(lead)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openMobileLeadDetail(lead);
                        }
                      }}
                      style={{ ["--mobile-card-index" as string]: index } as CSSProperties}
                      data-product={closedView.productTone}
                    >
                      <div className={styles.mobileVendasCardPremiumHeader}>
                        <div
                          className={styles.mobileVendasAvatar}
                          data-variant={closedView.productTone === "lead" ? "violet" : index % 2 === 0 ? "green" : "violet"}
                          aria-hidden="true"
                        >
                          <span>{closedView.avatarText}</span>
                        </div>
                        <div className={styles.mobileVendasCardMain}>
                          <div className={styles.mobileVendasCardTitle}>
                            <div>
                              <strong>{closedView.title}</strong>
                              <span>{closedView.place}</span>
                              <em>{closedView.segment}</em>
                            </div>
                            <MobileEnrichmentCrown lead={lead} board={board} compact />
                          </div>
                        </div>
                        <div className={styles.mobileVendasProductStack}>
                          <span data-product={closedView.productTone}>{closedView.productLabel}</span>
                          <small><b>●</b> {closedView.creditLabel}</small>
                        </div>
                      </div>
                      <div className={styles.mobileVendasClosedBadges} aria-label="Status do card">
                        {closedView.badges.map((badge) => (
                          <span key={badge.key} data-tone={badge.tone}>
                            <HbxRadarPngIcon name={closedBadgeRadarIconName(badge.key)} />
                            {badge.label}
                          </span>
                        ))}
                      </div>
                      <div className={styles.mobileVendasCardMeta}>
                        <span data-status={lead.status}>{status}</span>
                        <small>
                          Retorno <b>{mobileReturnLabel(lead)}</b>
                        </small>
                      </div>
                      <div className={styles.mobileVendasClosedFooter}>
                        <span>
                          <b>{closedView.phone || mobilePhoneLabel(lead)}</b>
                        </span>
                        <strong>{closedView.ctaLabel}</strong>
                      </div>
                    </article>
                    <div className={styles.mobileVendasSwipeActions} aria-label={`Ações de ${lead.name || "lead"}`}>
                      <button
                        type="button"
                        data-action="report"
                        onClick={(event) => {
                          event.stopPropagation();
                          openMobileReport(lead);
                        }}
                        disabled={mobileReporting || mobileDeletingLead}
                      >
                        Reclamar
                      </button>
                      <button
                        type="button"
                        data-action="delete"
                        onClick={(event) => {
                          event.stopPropagation();
                          void deleteMobileLead(lead);
                        }}
                        disabled={mobileReporting || mobileDeletingLead}
                      >
                        Ocultar
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <HbxMobileEmptyState
                kind="cards"
                className={styles.mobileVendasEmpty}
                title={(board?.summary.total || 0) <= 0 ? undefined : "Nenhum lead disponível agora"}
                description={
                  (board?.summary.total || 0) <= 0
                    ? undefined
                    : "Troque a guia, limpe a busca ou volte ao Radar para ampliar cidade e segmento."
                }
                actions={(board?.summary.total || 0) <= 0 && !radarFoundWithoutAgenda ? (
                  <Link className="hbx-mobile-primary-button" href={toMobileRoute("/radar-digital")}>
                    Buscar cards agora
                  </Link>
                ) : null}
              />
            )}
          </div>
        )}

        <HbxMobileDock
          primaryLabel={mobileVendasDockLabel}
          primaryTone={mobileVendasDockTone}
          onPrimaryAction={() => setComposerOpen(true)}
          onComissao={() => {
            setMobileSection("commission");
            setSelectedMobileLeadId(null);
          }}
          onRelatorio={() => {
            setMobileSection("report");
            setSelectedMobileLeadId(null);
          }}
          onConta={() => {
            setAccountNameDraft(mobilePreferredCallerName || readMobilePreferredCallerName());
            setAccountSheetOpen(true);
          }}
        />

        {mobileNoteLead && !selectedMobileLeadId ? (
          <div
            className={styles.mobileVendasSheetBackdrop}
            onClick={() => setMobileNoteLead(null)}
          >
            <section
              className={`${styles.mobileVendasNoteSheet} ${styles.mobileObservationDialog}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="mobile-vendas-note-title"
              onClick={(event) => event.stopPropagation()}
            >
              <span className={styles.mobileVendasSheetHandle} />
              <div className={styles.mobileVendasSheetHeader}>
                <div>
                  <small>{mobileNoteLead.name || "Lead sem nome"}</small>
                  <h2 id="mobile-vendas-note-title">Observação</h2>
                </div>
                <button type="button" onClick={() => setMobileNoteLead(null)} aria-label="Fechar observação">
                  ×
                </button>
              </div>
              <div className={styles.mobileLeadDetailCard}>
                <label className={styles.mobileLeadNoteEditor}>
                  <span>Nova nota</span>
                  <textarea
                    value={mobileNoteDraft}
                    onChange={(event) => setMobileNoteDraft(event.target.value)}
                    rows={5}
                    maxLength={280}
                    placeholder="Contexto, objeção, próximo passo ou detalhe importante."
                  />
                </label>
              </div>
              <div className={styles.mobileVendasSheetFooter}>
                <button
                  type="button"
                  className={styles.mobileVendasDeleteButton}
                  onClick={() => setMobileNoteLead(null)}
                >
                  Fechar
                </button>
                <button
                  type="button"
                  className={styles.mobileVendasDangerButton}
                  onClick={() => void saveMobileNote()}
                  disabled={mobileSavingNote}
                >
                  {mobileSavingNote ? "Salvando" : "Salvar"}
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {mobileReportLead ? (
          <div
            className={styles.mobileVendasSheetBackdrop}
            onClick={() => setMobileReportLead(null)}
          >
            <section
              className={`${styles.mobileVendasNoteSheet} ${styles.mobileVendasReportSheet}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="mobile-vendas-report-title"
              onClick={(event) => event.stopPropagation()}
            >
              <span className={styles.mobileVendasSheetHandle} />
              <div className={styles.mobileVendasSheetHeader}>
                <h2 id="mobile-vendas-report-title">Reclamar do card</h2>
                <button type="button" onClick={() => setMobileReportLead(null)}>
                  ×
                </button>
              </div>
              <p className={styles.mobileVendasReportLead}>
                {mobileReportLead.name || "Lead sem nome"}
              </p>
              <textarea
                value={mobileReportReason}
                onChange={(event) => setMobileReportReason(event.target.value)}
                rows={5}
                placeholder="Explique por que este card não prestou"
              />
              <div className={styles.mobileVendasSheetFooter}>
                <button
                  type="button"
                  className={styles.mobileVendasDeleteButton}
                  onClick={() => setMobileReportLead(null)}
                  disabled={mobileReporting || mobileDeletingLead}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className={styles.mobileVendasDangerButton}
                  onClick={() => void deleteMobileLead()}
                  disabled={mobileReporting || mobileDeletingLead}
                >
                  {mobileDeletingLead ? "Ocultando" : "Ocultar"}
                </button>
                <button
                  type="button"
                  onClick={() => void submitMobileReport()}
                  disabled={
                    mobileReporting ||
                    mobileDeletingLead ||
                    !mobileReportReason.trim()
                  }
                >
                  {mobileReporting ? "Enviando" : "Reclamar"}
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {mobileBulkDeleteTarget ? (
          <div
            className={styles.mobileVendasSheetBackdrop}
            onClick={() => {
              if (!bulkDeleting) setMobileBulkDeleteTarget(null);
            }}
          >
            <section
              className={`${styles.mobileVendasNoteSheet} ${styles.mobileVendasReportSheet} ${styles.mobileVendasAttentionSheet}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="mobile-vendas-bulk-delete-title"
              onClick={(event) => event.stopPropagation()}
            >
              <span className={styles.mobileVendasSheetHandle} />
              <div className={styles.mobileVendasSheetHeader}>
                <div>
                  <small>Atenção</small>
                  <h2 id="mobile-vendas-bulk-delete-title">
                    Excluir cards de {mobileBulkDeleteTarget.label}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileBulkDeleteTarget(null)}
                  disabled={bulkDeleting}
                >
                  ×
                </button>
              </div>
              <div className={styles.mobileVendasAttentionBody}>
                <strong>{mobileBulkDeleteTarget.count} card(s) serão removidos do Vendas.</strong>
                <p>
                  A base do Radar Digital continua preservada. Esta ação só limpa
                  os cards devidos desta guia.
                </p>
              </div>
              <div className={styles.mobileVendasSheetFooter}>
                <button
                  type="button"
                  className={styles.mobileVendasDeleteButton}
                  onClick={() => setMobileBulkDeleteTarget(null)}
                  disabled={bulkDeleting}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className={styles.mobileVendasDangerButton}
                  onClick={() => void deleteMobileBulkTarget()}
                  disabled={bulkDeleting}
                >
                  {bulkDeleting ? "Excluindo" : "Excluir"}
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </section>
    );
  }

  function scrollDateRail(direction: -1 | 1) {
    const el = filterScrollerRef.current;
    if (!el) return;
    el.scrollBy({
      left: direction * Math.max(260, Math.round(el.clientWidth * 0.72)),
      behavior: "smooth",
    });
  }

  function clearBulkSelection() {
    setSelectedBulkLeadIds(new Set());
    setBulkSelectAllAccount(false);
  }

  function toggleBulkSelectionMode() {
    if (bulkSelectionMode) clearBulkSelection();
    setBulkSelectionMode((current) => !current);
  }

  function toggleLeadBulkSelection(leadId: string) {
    const normalizedLeadId = String(leadId || "").trim();
    if (!normalizedLeadId) return;
    setBulkSelectionMode(true);
    setBulkSelectAllAccount(false);
    setSelectedBulkLeadIds((current) => {
      const next = new Set(current);
      if (next.has(normalizedLeadId)) next.delete(normalizedLeadId);
      else next.add(normalizedLeadId);
      return next;
    });
  }

  function toggleBulkSelectAll() {
    setBulkSelectionMode(true);
    if (bulkSelectAllAccount) {
      clearBulkSelection();
      return;
    }
    setBulkSelectAllAccount(true);
    setSelectedBulkLeadIds(new Set(loadedLeadIds));
  }

  function deleteSelectedLeadsBulk() {
    const selectedIds = Array.from(selectedBulkLeadIds);
    if (!bulkSelectAllAccount && !selectedIds.length) return;

    setBulkDeleteConfirmation({
      all: bulkSelectAllAccount,
      leadIds: selectedIds,
      message: bulkSelectAllAccount
        ? "Excluir todos os cards da conta atual do Vendas? Os cards somem da tela, mas a base do Radar Digital continua preservada."
        : `Excluir ${selectedIds.length} card(s) selecionado(s) do Vendas? Os cards somem da tela, mas a base do Radar Digital continua preservada.`,
    });
  }

  async function confirmBulkDeleteLeads() {
    const confirmation = bulkDeleteConfirmation;
    if (!confirmation || (!confirmation.all && !confirmation.leadIds.length)) return;

    setBulkDeleting(true);
    setError(null);
    try {
      const payload = await apiFetch<BulkDeleteLeadsResponse>(
        "/vendas/leads/delete-bulk",
        {
          method: "POST",
          body: JSON.stringify(
            confirmation.all ? { all: true } : { leadIds: confirmation.leadIds },
          ),
        },
      );
      const deletedCount = Number(payload?.deletedCount || 0);
      setFeedback(
        deletedCount
          ? `${deletedCount} card(s) excluído(s) do Vendas.`
          : "Nenhum card novo para excluir.",
      );
      clearBulkSelection();
      setBulkSelectionMode(false);
      setSelectedLeadId(null);
      await loadBoard();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Falha ao excluir cards em massa.",
      );
    } finally {
      setBulkDeleting(false);
      setBulkDeleteConfirmation(null);
    }
  }

  async function handleCreateManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatingManual(true);
    setError(null);
    try {
      const body: {
        name?: string;
        phone?: string;
        nextAction?: string;
        returnAt?: string;
        shortNote?: string;
        email?: string;
      } = {
        name: manualLead.name || undefined,
        phone: manualLead.phone || undefined,
        nextAction: manualLead.nextAction || undefined,
        returnAt: manualLead.returnAt || undefined,
        shortNote: manualLead.shortNote || undefined,
      };
      if (manualLead.email && String(manualLead.email).trim())
        body.email = manualLead.email;

      const payload = await apiFetch<{ ok: boolean; action: string }>(
        "/vendas/manual",
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      );
      setFeedback(
        payload.action === "updated"
          ? "Lead manual atualizado no CRM."
          : "Lead manual criado no CRM.",
      );
      setManualLead({
        name: "",
        phone: "",
        email: "",
        nextAction: "Primeiro contato",
        returnAt: plusDaysDatetimeLocal(0),
        shortNote: "",
        saleStatus: "none",
        salePlanKey: "",
        saleValue: "",
        commissionNote: "",
      });
      setComposerOpen(false);
      await loadBoard({ forceHydrateDrafts: true, forceVisualRefresh: true });
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Falha ao criar lead manual.",
      );
    } finally {
      setCreatingManual(false);
    }
  }

  function setLeadDraft(leadId: string, patch: Partial<LeadDraft>) {
    setDrafts((prev) => ({
      ...prev,
      [leadId]: {
        ...(prev[leadId] || {
          name: "",
          phone: "",
          email: "",
          status: "novo" as LeadStatus,
          nextAction: "",
          returnAt: "",
          shortNote: "",
          saleStatus: "none",
          salePlanKey: "",
          saleValue: "",
          commissionNote: "",
        }),
        ...patch,
      },
    }));
  }

  async function saveLead(
    leadId: string,
    patch?: Partial<LeadDraft>,
    successMessage?: string,
  ) {
    const draft = {
      ...(drafts[leadId] || {
        name: "",
        phone: "",
        email: "",
        status: "novo" as LeadStatus,
        nextAction: "",
        returnAt: "",
        shortNote: "",
        saleStatus: "none",
        salePlanKey: "",
        saleValue: "",
        commissionNote: "",
      }),
      ...(patch || {}),
    };
    const email = String(draft.email || "").trim();
    const normalizedSaleStatus = normalizeSaleStatus(draft.saleStatus);
    const normalizedSalePlanKey = normalizeSalePlanKey(draft.salePlanKey);
    const parsedSaleValue = parseCurrencyInput(draft.saleValue);
    const saleValue =
      normalizedSaleStatus !== "none" && parsedSaleValue <= 0
        ? salePlanPrice(normalizedSalePlanKey)
        : parsedSaleValue;
    setSavingLeadId(leadId);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name: draft.name,
        phone: draft.phone,
        email: email || null,
        status: draft.status,
        nextAction: draft.nextAction,
        returnAt: draft.returnAt || "",
        shortNote: draft.shortNote,
        saleStatus: normalizedSaleStatus,
        saleValue,
        commissionNote: draft.commissionNote,
      };
      if (normalizedSaleStatus !== "none") {
        body.salePlanKey = normalizedSalePlanKey;
      }
      await apiFetch(`/vendas/lead/${leadId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setFeedback(successMessage || "Lead atualizado com sucesso.");
      await loadBoard({ forceHydrateDrafts: true, forceVisualRefresh: true });
      // If the saved lead was being edited inline, close the inline editor
      if (editingLeadId === leadId) {
        editingInputActiveRef.current = false;
        setEditingLeadId(null);
      }
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Falha ao atualizar o lead.",
      );
    } finally {
      setSavingLeadId(null);
    }
  }

  async function saveLeadSaleStatus(lead: LeadItem, status: SaleStatus) {
    const currentDraft = drafts[lead.id] || createDraft(lead);
    const patch = buildSaleClosingPatch(lead, currentDraft, status);
    setLeadDraft(lead.id, patch);
    await saveLead(lead.id, patch, saleClosingFeedback(status));
    mergeMobileLeadPatch(lead.id, {
      saleStatus: patch.saleStatus,
      saleStatusLabel: saleStatusLabel(patch.saleStatus),
      salePlanKey: patch.salePlanKey,
      saleValue: parseCurrencyInput(String(patch.saleValue || "")),
    });
    await loadHbxClosingPipeline();
    await loadCommissionSummary();
  }

  async function createHbxSalesHandoff(lead: LeadItem) {
    const currentDraft = drafts[lead.id] || createDraft(lead);
    const salePlanKey = normalizeSalePlanKey(currentDraft.salePlanKey || lead.salePlanKey);
    setHandoffLeadId(lead.id);
    setError(null);
    try {
      const payload = await apiFetch<HbxSalesHandoffResponse>(
        `/vendas/lead/${encodeURIComponent(lead.id)}/hbx-handoff`,
        {
          method: "POST",
          body: JSON.stringify({
            salePlanKey,
            origin: typeof window !== "undefined" ? window.location.origin : "",
          }),
        },
      );
      const textToCopy = String(payload?.message || payload?.registerUrl || payload?.registerPath || "").trim();
      if (textToCopy && typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(textToCopy).catch(() => undefined);
      }
      const updatedLead = payload?.lead || null;
      if (updatedLead) {
        mergeMobileLeadPatch(lead.id, updatedLead);
        setMobileNoteLead((current) =>
          current?.id === lead.id ? { ...current, ...updatedLead } : current,
        );
      }
      setFeedback(textToCopy ? "Link HBX copiado para enviar ao cliente." : "Link HBX gerado.");
      await loadBoard({ forceHydrateDrafts: true, forceVisualRefresh: true });
      await loadHbxClosingPipeline();
      await loadCommissionSummary();
    } catch (handoffError) {
      setError(
        handoffError instanceof Error
          ? handoffError.message
          : "Falha ao gerar link HBX.",
      );
    } finally {
      setHandoffLeadId(null);
    }
  }

  function openAssistedSignup(lead: LeadItem) {
    const currentDraft = drafts[lead.id] || createDraft(lead);
    const salePlanKey = normalizeSalePlanKey(currentDraft.salePlanKey || lead.salePlanKey);
    setAssistedSignupLead(lead);
    setAssistedSignupResult(null);
    setAssistedSignupDraft({
      companyName: currentDraft.name || lead.name || "",
      contactName: currentDraft.name || lead.name || "",
      email: currentDraft.email || lead.email || "",
      phone: currentDraft.phone || lead.phone || "",
      password: "",
      salePlanKey,
    });
  }

  function closeAssistedSignup() {
    if (assistedSignupSaving) return;
    setAssistedSignupLead(null);
    setAssistedSignupResult(null);
  }

  async function submitAssistedSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!assistedSignupLead) return;
    const email = assistedSignupDraft.email.trim().toLowerCase();
    if (!email) {
      setError("Informe o e-mail do cliente. O e-mail precisa ser confirmado para ativar.");
      return;
    }
    setAssistedSignupSaving(true);
    setError(null);
    try {
      const payload = await apiFetch<HbxAssistedSignupResponse>(
        `/vendas/lead/${encodeURIComponent(assistedSignupLead.id)}/hbx-assisted-signup`,
        {
          method: "POST",
          body: JSON.stringify({
            ...assistedSignupDraft,
            email,
            salePlanKey: normalizeSalePlanKey(assistedSignupDraft.salePlanKey),
          }),
        },
      );
      setAssistedSignupResult(payload);
      const updatedLead = payload?.lead || null;
      if (updatedLead) {
        mergeMobileLeadPatch(assistedSignupLead.id, updatedLead);
        setMobileNoteLead((current) =>
          current?.id === assistedSignupLead.id ? { ...current, ...updatedLead } : current,
        );
      }
      setFeedback(payload?.message || "Cadastro assistido criado. Aguarde a confirmação do e-mail.");
      await loadBoard({ forceHydrateDrafts: true, forceVisualRefresh: true });
      await loadCommissionSummary();
      await loadHbxClosingPipeline();
    } catch (signupError) {
      setError(
        signupError instanceof Error
          ? signupError.message
          : "Falha ao criar cadastro assistido.",
      );
    } finally {
      setAssistedSignupSaving(false);
    }
  }

  function applyOptimisticAttemptIncrement(
    currentBoard: BoardResponse,
    leadId: string,
  ) {
    const blocks: BoardResponse["blocks"] = {
      overdue: [...currentBoard.blocks.overdue],
      today: [...currentBoard.blocks.today],
      scheduled: [...currentBoard.blocks.scheduled],
      closed: [...currentBoard.blocks.closed],
    };

    let found = false;
    [
      "overdue" as LeadBlockKey,
      "today" as LeadBlockKey,
      "scheduled" as LeadBlockKey,
      "closed" as LeadBlockKey,
    ].forEach((blockKey) => {
      blocks[blockKey] = blocks[blockKey].map((lead) => {
        if (lead.id !== leadId) return lead;
        found = true;
        return {
          ...lead,
          attemptCount: (lead.attemptCount || 0) + 1,
          updatedAt: new Date().toISOString(),
        };
      });
    });

    if (!found) return currentBoard;
    return { blocks, summary: recomputeSummary(blocks) };
  }

  async function incrementAttempt(leadId: string) {
    if (!board) return;
    const currentRecord = leadById.get(leadId);
    const currentAttempt = currentRecord?.lead.attemptCount || 0;
    const nextAttempt = currentAttempt + 1;
    const previousBoard = board;
    const optimisticBoard = applyOptimisticAttemptIncrement(board, leadId);
    setBoard(optimisticBoard);
    setSavingLeadId(leadId);
    setError(null);
    try {
      await apiFetch(`/vendas/lead/${leadId}`, {
        method: "PATCH",
        body: JSON.stringify({ attemptCount: nextAttempt }),
      });
      setFeedback("Tentativa registrada.");
      await loadBoard();
    } catch (err) {
      setBoard(previousBoard);
      setError(
        err instanceof Error ? err.message : "Falha ao registrar tentativa.",
      );
    } finally {
      setSavingLeadId(null);
    }
  }

  async function runQuickAction(lead: LeadItem, action: string) {
    const currentDraft = drafts[lead.id] || createDraft(lead);
    if (action === "tentativa_whatsapp" || action === "tentativa_call") {
      await incrementAttempt(lead.id);
      return;
    }
    if (action === "hoje") {
      await saveLead(lead.id, {
        status:
          currentDraft.status === "novo" ? "contato" : currentDraft.status,
        nextAction: currentDraft.nextAction || "Retomar hoje",
        returnAt: plusDaysDatetimeLocal(0),
      });
      return;
    }
    if (action === "amanha") {
      // Move the lead to the next available date filter instead of only setting a datetime.
      // Compute the lead's current date key and find its index inside `dateFilters`.
      const currentRecord = leadById.get(lead.id);
      const leadBlock = currentRecord?.block || "today";
      const currentDateKey =
        leadBlock === "scheduled"
          ? (`scheduled:${buildLocalDateKey(lead.returnAt || lead.updatedAt)}` as DateFilterKey)
          : (leadBlock as DateFilterKey);

      const idx = dateFilters.findIndex((item) => item.key === currentDateKey);
      const nextIndex =
        idx >= 0 ? Math.min(idx + 1, Math.max(0, dateFilters.length - 1)) : 0;
      const targetKey =
        dateFilters[nextIndex]?.key ||
        (dateFilters[0]?.key as DateFilterKey) ||
        "today";

      await handleDateMove(lead.id, targetKey);
      return;
    }
    if (action === "encerrar") {
      await saveLead(lead.id, {
        status: "encerrado",
        nextAction: currentDraft.nextAction || "Lead encerrado",
        returnAt: "",
      });
      if (mobileRoute && selectedMobileLeadId === lead.id) {
        closeMobileLeadDetail();
      }
      return;
    }
    if (action === "reabrir") {
      await saveLead(lead.id, {
        status: "retorno",
        nextAction: currentDraft.nextAction || "Retomar lead",
        returnAt: plusDaysDatetimeLocal(1),
      });
    }
  }

  async function handleLeadInboxAction(lead: LeadItem) {
    if (isLeadInInbox(lead)) {
      openInboxAgenda(getLeadInboxConversationId(lead) || null);
      return;
    }
    setSavingLeadId(lead.id);
    try {
      await syncLeadsToInbox([lead], {
        title: "Importando para Inbox",
        description: "Preparando este card no Inbox interno.",
      });
    } finally {
      setSavingLeadId(null);
    }
  }

  function primeDesktopReturnMonth(leadId: string) {
    const record = leadById.get(leadId);
    const lead = record?.lead;
    if (!lead) {
      setDesktopReturnMonthKey("");
      return;
    }
    const draft = drafts[lead.id] || createDraft(lead);
    const dateKey = String(draft.returnAt || "").slice(0, 10) || localDateKeyFromDate(getMobileReturnDefaultDate(lead));
    setDesktopReturnMonthKey(monthKeyFromDateKey(dateKey));
  }

  function focusLead(leadId: string) {
    const current = leadById.get(leadId);
    if (!current) return;
    if (current.block === "overdue") setSelectedDateKey("overdue");
    if (current.block === "today") setSelectedDateKey("today");
    if (current.block === "scheduled") {
      const dateKey = buildLocalDateKey(
        current.lead.returnAt || current.lead.updatedAt,
      );
      if (dateKey) setSelectedDateKey(`scheduled:${dateKey}`);
    }
    if (current.block === "closed") setShowClosed(true);
    setSelectedLeadId(leadId);
    primeDesktopReturnMonth(leadId);
    setCommandOpen(false);
    // After changing selected block/lead, wait a tick for DOM to update
    // then scroll the actual card into view and move keyboard focus there.
    window.setTimeout(() => {
      const node = leadCardRefs.current[leadId];
      if (node) {
        try {
          node.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "nearest",
          });
        } catch {
          node.scrollIntoView({ behavior: "smooth" });
        }
        // focus the primary interactive element inside the card if present
        const focusable = node.querySelector(
          'button, [role="button"], a, input, textarea, [tabindex]',
        ) as HTMLElement | null;
        if (focusable) focusable.focus();
      } else {
        // fallback: ensure detail panel is visible
        document
          .querySelector<HTMLElement>("[data-detail-panel='true']")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 80);
  }

  function registerLeadCardRef(leadId: string, node: HTMLElement | null) {
    leadCardRefs.current[leadId] = node;
  }

  function registerDateFilterRef(
    filterKey: DateFilterKey,
    node: HTMLElement | null,
  ) {
    dateFilterRefs.current[filterKey] = node;
  }

  function createPatchedDraft(lead: LeadItem, targetKey: DateFilterKey) {
    const currentDraft = drafts[lead.id] || createDraft(lead);
    let returnAt =
      currentDraft.returnAt || toDatetimeLocal(lead.returnAt) || "";
    let status = currentDraft.status;

    if (targetKey === "today") {
      returnAt = buildTargetDatetimeLocal(
        localDateKeyFromDate(new Date()),
        null,
        12,
        0,
      );
    } else if (targetKey === "overdue") {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      returnAt = buildTargetDatetimeLocal(
        localDateKeyFromDate(yesterday),
        returnAt || null,
      );
    } else {
      returnAt = buildTargetDatetimeLocal(
        targetKey.slice("scheduled:".length),
        returnAt || null,
      );
      if (status !== "encerrado" && status !== "qualificado")
        status = "retorno";
    }

    return {
      ...currentDraft,
      status,
      returnAt: toDatetimeLocal(returnAt),
    };
  }

  function applyOptimisticDateMove(
    currentBoard: BoardResponse,
    leadId: string,
    targetKey: DateFilterKey,
    nextDraft: LeadDraft,
  ) {
    const blocks: BoardResponse["blocks"] = {
      overdue: [...currentBoard.blocks.overdue],
      today: [...currentBoard.blocks.today],
      scheduled: [...currentBoard.blocks.scheduled],
      closed: [...currentBoard.blocks.closed],
    };
    let movingLead: LeadItem | null = null;

    (["overdue", "today", "scheduled", "closed"] as LeadBlockKey[]).forEach(
      (blockKey) => {
        blocks[blockKey] = blocks[blockKey].filter((lead) => {
          if (lead.id !== leadId) return true;
          movingLead = lead;
          return false;
        });
      },
    );

    if (!movingLead) return currentBoard;

    const patchedLead: LeadItem = {
      ...(movingLead as LeadItem),
      status: nextDraft.status,
      statusLabel: statusLabel(nextDraft.status),
      returnAt: nextDraft.returnAt
        ? new Date(nextDraft.returnAt).toISOString()
        : "",
      updatedAt: new Date().toISOString(),
    };

    if (targetKey === "today") blocks.today.unshift(patchedLead);
    else if (targetKey === "overdue") blocks.overdue.unshift(patchedLead);
    else blocks.scheduled.unshift(patchedLead);

    return { blocks, summary: recomputeSummary(blocks) };
  }

  async function handleDateMove(leadId: string, targetKey: DateFilterKey) {
    if (!board) return;
    const currentRecord = leadById.get(leadId);
    if (!currentRecord || currentRecord.block === "closed") return;

    const currentDateKey =
      currentRecord.block === "scheduled"
        ? (`scheduled:${buildLocalDateKey(currentRecord.lead.returnAt || currentRecord.lead.updatedAt)}` as DateFilterKey)
        : (currentRecord.block as DateFilterKey);
    if (currentDateKey === targetKey) return;

    const previousBoard = board;
    const previousDrafts = drafts;
    const nextDraft = createPatchedDraft(currentRecord.lead, targetKey);
    const optimisticBoard = applyOptimisticDateMove(
      board,
      leadId,
      targetKey,
      nextDraft,
    );

    setBoard(optimisticBoard);
    setDrafts((prev) => ({ ...prev, [leadId]: nextDraft }));
    setSelectedLeadId(leadId);
    setDesktopReturnMonthKey(monthKeyFromDateKey(String(nextDraft.returnAt || "").slice(0, 10)));
    setSavingLeadId(leadId);

    try {
      await apiFetch(`/vendas/lead/${leadId}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: nextDraft.status,
          nextAction: nextDraft.nextAction,
          returnAt: nextDraft.returnAt || "",
        }),
      });
      setFeedback("Lead movido na agenda.");
      await loadBoard();
    } catch (moveError) {
      setBoard(previousBoard);
      setDrafts(previousDrafts);
      setError(
        moveError instanceof Error
          ? moveError.message
          : "Falha ao mover o lead na agenda.",
      );
    } finally {
      setSavingLeadId(null);
    }
  }
  async function moveAllLeadsFromSourceToTarget(
    sourceKey: DateFilterKey,
    targetKey: DateFilterKey,
  ) {
    if (!board) return;
    let leadsToMove: LeadItem[] = [];
    if (sourceKey === "overdue") leadsToMove = [...board.blocks.overdue];
    else if (sourceKey === "today") leadsToMove = [...board.blocks.today];
    else if (sourceKey.startsWith("scheduled:")) {
      const iso = sourceKey.slice("scheduled:".length);
      leadsToMove = (board.blocks.scheduled || []).filter(
        (l) => buildLocalDateKey(l.returnAt || l.updatedAt) === iso,
      );
    } else {
      return;
    }

    if (!leadsToMove.length) return;
    const totalMoves = leadsToMove.length;
    const nextDraftByLeadId: Record<string, LeadDraft> = {};
    const failedLeadIds: string[] = [];
    let completedMoves = 0;

    for (const lead of leadsToMove) {
      nextDraftByLeadId[lead.id] = createPatchedDraft(lead, targetKey);
    }

    setError(null);
    setFeedback(`Movendo 0/${totalMoves} retornos...`);
    setSelectedDateKey(targetKey);
    setSelectedLeadId(null);

    const concurrency = Math.min(3, totalMoves);
    let cursor = 0;

    async function moveOneLead(lead: LeadItem) {
      const nextDraft = nextDraftByLeadId[lead.id];
      try {
        await apiFetch(`/vendas/lead/${lead.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            status: nextDraft.status,
            nextAction: nextDraft.nextAction,
            returnAt: nextDraft.returnAt || "",
          }),
        });

        completedMoves += 1;
        setDrafts((prev) => ({ ...prev, [lead.id]: nextDraft }));
        setBoard((currentBoard) =>
          currentBoard
            ? applyOptimisticDateMove(
                currentBoard,
                lead.id,
                targetKey,
                nextDraft,
              )
            : currentBoard,
        );
        setFeedback(
          completedMoves >= totalMoves
            ? `Movidos ${completedMoves} retornos.`
            : `Movendo ${completedMoves}/${totalMoves} retornos...`,
        );
      } catch {
        failedLeadIds.push(lead.id);
      }
    }

    async function worker() {
      while (cursor < leadsToMove.length) {
        const lead = leadsToMove[cursor];
        cursor += 1;
        if (!lead) break;
        await moveOneLead(lead);
      }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    await loadBoard();

    if (failedLeadIds.length) {
      setError(
        failedLeadIds.length === totalMoves
          ? "Falha ao mover os retornos da agenda."
          : `Falha ao mover ${failedLeadIds.length} de ${totalMoves} retornos.`,
      );
      return;
    }

    setFeedback(`Movidos ${totalMoves} retornos.`);
  }

  function handleDragStart(event: DragStartEvent) {
    const activeId = String(event.active.id || "");
    const isLeadDrag = Boolean(activeId && !activeId.startsWith("date:"));
    setVendasCardDragLock(isLeadDrag);

    if (activeId.startsWith("date:")) {
      setActiveDragRect(null);
      setActiveDragDateKey(activeId.slice("date:".length));
      setActiveDragLeadId(null);
    } else {
      const sourceRect = leadCardRefs.current[activeId]?.getBoundingClientRect();
      setActiveDragRect(
        sourceRect
          ? {
              width: Math.round(sourceRect.width),
              height: Math.round(sourceRect.height),
            }
          : null,
      );
      setActiveDragLeadId(activeId);
      setActiveDragDateKey(null);
    }
  }

  function handleDragCancel() {
    clearVendasDragVisualState();
  }

  async function handleDragEnd(event: DragEndEvent) {
    try {
      const activeId = String(event.active.id || "");
      const targetKey = event.over?.id as DateFilterKey | undefined;
      if (!activeId || !targetKey) {
        setActiveDragLeadId(null);
        setActiveDragDateKey(null);
        return;
      }

      if (activeId.startsWith("date:")) {
        setActiveDragLeadId(null);
        setActiveDragDateKey(null);
        const sourceKey = activeId.slice("date:".length) as DateFilterKey;
        if (sourceKey === targetKey) {
          lastDragEndedAtRef.current = performance.now();
          return;
        }
        setPulseDateKey(targetKey);
        await moveAllLeadsFromSourceToTarget(sourceKey, targetKey);
        lastDragEndedAtRef.current = performance.now();
        return;
      }

      const leadId = activeId;
      const record = leadById.get(leadId);
      const draft = record ? drafts[leadId] || createDraft(record.lead) : null;
      const fromRect = leadCardRefs.current[leadId]?.getBoundingClientRect();
      const targetRect =
        dateFilterRefs.current[targetKey]?.getBoundingClientRect();
      if (record && draft && fromRect && targetRect) {
        setFlyAnimation({
          leadId,
          lead: record.lead,
          draft,
          blockKey: record.block,
          from: {
            x: fromRect.left,
            y: fromRect.top,
            width: fromRect.width,
            height: fromRect.height,
          },
          to: {
            x: targetRect.left,
            y: targetRect.top,
            width: targetRect.width,
            height: targetRect.height,
          },
        });
      }
      setActiveDragLeadId(null);
      setActiveDragDateKey(null);
      setPulseDateKey(targetKey);
      await handleDateMove(leadId, targetKey);
      lastDragEndedAtRef.current = performance.now();
    } finally {
      setVendasCardDragLock(false);
      setActiveDragRect(null);
      if (dragVisualCleanupTimerRef.current != null && typeof window !== "undefined") {
        window.clearTimeout(dragVisualCleanupTimerRef.current);
        dragVisualCleanupTimerRef.current = null;
      }
    }
  }

  function renderLeadCard(lead: LeadItem, blockKey: LeadBlockKey) {
    const draft = drafts[lead.id] || createDraft(lead);
    const commonProps = {
      lead,
      draft,
      board,
      blockKey,
      selected: selectedLeadId === lead.id,
      saving: savingLeadId === lead.id,
      onFocus: () => focusLead(lead.id),
      onQuickAction: (action: string) => void runQuickAction(lead, action),
      onInboxAction: (targetLead: LeadItem) =>
        void handleLeadInboxAction(targetLead),
      onEdit: (id: string | null) => {
        const next = editingLeadId === id ? null : id;
        editingInputActiveRef.current = Boolean(next);
        setEditingLeadId(next);
        if (next) focusLead(next);
      },
      onDraftChange: (leadId: string, patch: Partial<LeadDraft>) =>
        setLeadDraft(leadId, patch),
      onEditingActiveChange: (active: boolean) => {
        editingInputActiveRef.current = active;
      },
      onSave: (leadId: string) => void saveLead(leadId),
      onCloseSale: (status: SaleStatus) => void saveLeadSaleStatus(lead, status),
      onHbxHandoff: () => void createHbxSalesHandoff(lead),
      handoffLoading: handoffLeadId === lead.id,
      onAssistedSignup: () => openAssistedSignup(lead),
      assistedSignupLoading: assistedSignupSaving && assistedSignupLead?.id === lead.id,
      editing: editingLeadId === lead.id,
      bulkSelectionMode,
      bulkSelected: bulkSelectAllAccount || selectedBulkLeadIds.has(lead.id),
      onBulkToggle: (leadId: string) => toggleLeadBulkSelection(leadId),
    };

    if (blockKey === "closed") {
      return <LeadCardView key={lead.id} {...commonProps} />;
    }

    return (
      <DraggableLeadCard
        key={lead.id}
        {...commonProps}
        disabled={false}
        hidden={flyAnimation?.leadId === lead.id}
        register={(node) => registerLeadCardRef(lead.id, node)}
      />
    );
  }

  function renderDetailPanel() {
    if (!selectedLead || !selectedLeadDraft) {
      return null;
    }

    const expandedView = leadExpandedCardView(selectedLead, board);
    const selectedCapabilities = leadCapabilities(selectedLead, board);
    const defaultDesktopTemplates = [""];
    const desktopTemplates = desktopReadyTemplateTexts.length ? desktopReadyTemplateTexts : defaultDesktopTemplates;
    const activeDesktopTemplateIndex = Math.min(Math.max(0, desktopTemplateIndex), Math.max(0, desktopTemplates.length - 1));
    const selectedReadyTemplateRaw = desktopTemplates[activeDesktopTemplateIndex] || "";
    const selectedReadyMessage = selectedCapabilities.canSeeMessageTemplates
      ? personalizeMobileReadyMessage(selectedReadyTemplateRaw, selectedLead, mobilePreferredCallerName)
      : "";

    const setDesktopTemplates = (next: string[]) => {
      const clean = next.length ? next : [""];
      setDesktopReadyTemplateTexts(clean);
      setDesktopTemplateIndex((current) => Math.min(Math.max(0, current), clean.length - 1));
    };
    const updateDesktopTemplate = (value: string) => {
      const base = desktopTemplates.length ? [...desktopTemplates] : [""];
      base[activeDesktopTemplateIndex] = value;
      setDesktopTemplates(base);
    };
    const addDesktopTemplate = () => {
      const base = desktopTemplates.length ? [...desktopTemplates] : [""];
      const next = [...base, ""].slice(0, 20);
      setDesktopTemplates(next);
      setDesktopTemplateIndex(next.length - 1);
    };
    const removeDesktopTemplate = () => {
      const base = desktopTemplates.length ? [...desktopTemplates] : [""];
      const next = base.filter((_, index) => index !== activeDesktopTemplateIndex);
      setDesktopTemplates(next.length ? next : [""]);
      setDesktopTemplateIndex((current) => Math.max(0, current - 1));
    };
    const insertDesktopVariable = (token: string) => {
      const textarea = desktopTemplateTextareaRef.current;
      const current = selectedReadyTemplateRaw || "";
      const start = textarea?.selectionStart ?? current.length;
      const end = textarea?.selectionEnd ?? current.length;
      const next = `${current.slice(0, start)}${token}${current.slice(end)}`;
      updateDesktopTemplate(next);
      requestAnimationFrame(() => {
        const node = desktopTemplateTextareaRef.current;
        if (!node) return;
        const cursor = start + token.length;
        node.focus();
        node.setSelectionRange(cursor, cursor);
      });
    };

    const previewChannelKeys: LeadExpandedChannel["key"][] = ["instagram", "facebook", "whatsapp", "site", "email", "map"];
    const previewChannels = previewChannelKeys
      .map((key) => expandedView.channels.find((channel) => channel.key === key))
      .filter(Boolean) as LeadExpandedChannel[];
    const fieldByKey = (key: string) => expandedView.fields.find((field) => field.key === key);
    const companyFields = ["cnpj", "email", "site", "phone", "address"]
      .map((key) => fieldByKey(key))
      .filter(Boolean) as LeadExpandedField[];
    const scoreValue = Math.max(0, Math.min(100, expandedView.score || 0));
    const qualityCopy = scoreValue >= 75
      ? "Lead com alta qualidade e dados consistentes."
      : scoreValue >= 55
        ? "Lead com dados úteis para abordagem assistida."
        : "Revise os dados antes da primeira abordagem.";
    const potentialLabel = scoreValue >= 70 ? "Alto" : scoreValue >= 45 ? "Médio" : "Revisar";
    const recommendedLabel = expandedView.recommendedChannel || "WhatsApp";
    const recommendedLower = recommendedLabel.toLowerCase();
    const recommendedIcon: HbxRadarIconName = recommendedLower.includes("whats")
      ? "whatsapp"
      : recommendedLower.includes("email") || recommendedLower.includes("e-mail")
        ? "email"
        : recommendedLower.includes("site")
          ? "site"
          : recommendedLower.includes("liga") || recommendedLower.includes("telefone")
            ? "phone"
            : "channel";
    const channelScore = Math.max(scoreValue, expandedView.confidence || 0);
    const evidenceItems = expandedView.evidence.length
      ? expandedView.evidence
      : [{ label: "Dados básicos conferidos", tone: "muted" as const }];
    const evidenceCounter = `+${Math.max(6, evidenceItems.length + Math.round((expandedView.confidence || scoreValue || 50) / 6))} evidências`;
    const selectedWhatsappHref = leadWhatsappHref(selectedLead) || buildWhatsAppUrlWithMessage(selectedLead.phone, selectedReadyMessage);
    const selectedCallHref = buildCallUrl(selectedLeadDraft.phone || selectedLead.phone);
    const desktopReturnBase = getMobileReturnDefaultDate(selectedLead);
    const desktopReturnDraftValue = desktopReturnDrafts[selectedLead.id] ?? selectedLeadDraft.returnAt ?? "";
    const desktopReturnDateKey =
      String(desktopReturnDraftValue || "").slice(0, 10) ||
      localDateKeyFromDate(desktopReturnBase);
    const desktopReturnHasSelection = Boolean(String(desktopReturnDraftValue || "").trim());
    const desktopReturnTime =
      normalizeReturnTime(String(desktopReturnDraftValue || "").slice(11, 16)) ||
      `${padDatePart(desktopReturnBase.getHours())}:${padDatePart(desktopReturnBase.getMinutes())}`;
    const activeDesktopReturnMonthKey = desktopReturnMonthKey || monthKeyFromDateKey(desktopReturnDateKey);
    const desktopReturnCalendarDays = buildCalendarDays(activeDesktopReturnMonthKey);
    const desktopReturnMonthLabel = new Date(`${activeDesktopReturnMonthKey}-01T12:00:00`).toLocaleDateString("pt-BR", {
      month: "long",
      year: "numeric",
    });
    const desktopReturnSummary = desktopReturnHasSelection ? formatDateTime(desktopReturnDraftValue) : "Escolha data e horário";
    const desktopObservationDraft = desktopObservationDrafts[selectedLead.id] ?? selectedLeadDraft.shortNote ?? "";
    const applyDesktopReturnDate = (dateKey: string) => {
      const nextReturnAt = `${dateKey}T${desktopReturnTime}`;
      setDesktopReturnMonthKey(monthKeyFromDateKey(dateKey));
      setDesktopReturnDrafts((current) => ({ ...current, [selectedLead.id]: nextReturnAt }));
      setLeadDraft(selectedLead.id, {
        status: "retorno",
        returnAt: nextReturnAt,
      });
    };

    if (typeof document === "undefined") return null;

    return createPortal(
      <div
        className={styles.vendasObservationPopupLayer}
        role="presentation"
        onMouseDown={() => {
          setSelectedLeadId(null);
          setEditingLeadId(null);
        }}
      >
        <section
          className={`hbx-popup2 ${styles.vendasObservationPopup}`}
          data-tone="info"
          role="dialog"
          aria-modal="true"
          aria-label={`Observação de ${expandedView.closed.title}`}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <header className={styles.vendasObservationPopupTop}>
            <div>
              <strong>Observação e retorno</strong>
              <span>{expandedView.closed.title}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedLeadId(null);
                setEditingLeadId(null);
              }}
              aria-label="Fechar observação"
            >
              ×
            </button>
          </header>
          <div className={styles.vendasObservationPopupBody}>
            <div className={styles.detailLayout}>
          <section className={styles.vendasOpenCard} data-product={expandedView.closed.productTone}>
            <header className={styles.vendasOpenHeader}>
              <div className={styles.vendasOpenIdentity}>
                <div className={styles.vendasClosedAvatar} data-product={expandedView.closed.productTone} aria-hidden="true">
                  <span>{expandedView.closed.avatarText}</span>
                </div>
                <div className={styles.vendasOpenIdentityText}>
                  <div className={styles.vendasOpenTitleRow}>
                    <strong>{expandedView.closed.title}</strong>
                    <span className={styles.vendasOpenVerified} aria-label="Lead verificado">✓</span>
                  </div>
                  <div className={styles.vendasOpenHeaderMeta}>
                    <span>{expandedView.closed.place}</span>
                    <span>{expandedView.closed.segment}</span>
                  </div>
                  <div className={styles.vendasClosedBadges} aria-label="Status do lead">
                    {expandedView.closed.badges.map((badge) => (
                      <span key={badge.key} data-tone={badge.tone}>
                        <HbxRadarPngIcon name={closedBadgeRadarIconName(badge.key)} />
                        {badge.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className={styles.vendasOpenProduct}>
                <span data-product={expandedView.closed.productTone}>
                  <HbxRadarPngIcon name="lead-plus" />
                  {expandedView.closed.productLabel}
                </span>
                <b><HbxRadarPngIcon name="coins" /> {expandedView.closed.creditLabel}</b>
                <small>Custo por lead</small>
                <button
                  type="button"
                  className={styles.vendasOpenCloseButton}
                  onClick={() => {
                    setSelectedLeadId(null);
                    setEditingLeadId(null);
                  }}
                  aria-label="Fechar detalhes e voltar para a lista"
                  title="Fechar detalhes"
                >
                  <span aria-hidden="true">^</span>
                </button>
              </div>
            </header>

            <div className={styles.vendasOpenDivider} />

            <nav className={styles.vendasOpenChannels} aria-label="Canais do lead">
              {previewChannels.map((channel) => (
                <a
                  key={channel.key}
                  href={channel.href || undefined}
                  target={channel.external && channel.href ? "_blank" : undefined}
                  rel={channel.external && channel.href ? "noreferrer" : undefined}
                  aria-label={channel.label}
                  aria-disabled={!channel.href || channel.status === "missing"}
                  data-channel={channel.key}
                  data-status={channel.status}
                  onClick={(event) => {
                    if (!channel.href || channel.status === "missing") event.preventDefault();
                  }}
                >
                  <span><DesktopChannelDocIcon channel={channel.key} /></span>
                  <b>{channel.label}</b>
                </a>
              ))}
            </nav>

            <section className={styles.vendasOpenGrid}>
              <section className={`${styles.vendasOpenSection} ${styles.vendasOpenDataCard}`}>
                <h3><HbxRadarPngIcon name="cnpj" /> Dados da empresa</h3>
                <div className={styles.vendasOpenDataRows}>
                  {companyFields.map((field) => (
                    <div key={field.key} className={styles.vendasOpenDataRow} data-field={field.key} data-tone={field.tone || "muted"}>
                      <span>{field.label}</span>
                      {field.href ? (
                        <a href={field.href} target={field.external ? "_blank" : undefined} rel={field.external ? "noreferrer" : undefined}>
                          {field.value}
                        </a>
                      ) : (
                        <strong>{field.value}</strong>
                      )}
                      <span className={styles.vendasOpenFieldAction} aria-hidden="true">{field.href ? "↗" : "□"}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className={`${styles.vendasOpenSection} ${styles.vendasOpenQuality}`}>
                <h3><HbxRadarPngIcon name="quality" /> Qualidade do lead</h3>
                <div className={styles.vendasOpenScoreCard}>
                  <div className={styles.vendasOpenGauge} style={{ ["--vendas-open-score" as string]: `${scoreValue}%` } as CSSProperties}>
                    <div>
                      <strong>{scoreValue || "--"}</strong>
                      <span>de 100</span>
                    </div>
                  </div>
                  <div className={styles.vendasOpenQualityText}>
                    <strong>{expandedView.scoreLabel}</strong>
                    <p>{qualityCopy}</p>
                  </div>
                </div>
              </section>

              <section className={`${styles.vendasOpenSection} ${styles.vendasOpenInsight}`}>
                <h3><HbxRadarPngIcon name="opportunity" /> Insight de oportunidade</h3>
                <p>{expandedView.opportunity}</p>
                <div className={styles.vendasOpenPotential}>
                  <span aria-hidden="true">↗</span>
                  <div>
                    <strong>Potencial: {potentialLabel}</strong>
                    <small>Boa aderência ao seu produto/serviço.</small>
                  </div>
                </div>
              </section>

              <section className={`${styles.vendasOpenSection} ${styles.vendasOpenEvidence}`}>
                <h3><HbxRadarPngIcon name="confidence" /> Confiança / Evidências</h3>
                <ul className={styles.vendasOpenEvidenceList}>
                  {evidenceItems.slice(0, 5).map((item) => (
                    <li key={item.label}>{item.label}</li>
                  ))}
                </ul>
                <div className={styles.vendasOpenEvidenceAvatars}>
                  <span /><span /><span /><span /><span /><span />
                  <b>{evidenceCounter}</b>
                </div>
              </section>

              <section className={`${styles.vendasOpenSection} ${styles.vendasOpenRecommended}`}>
                <h3><HbxRadarPngIcon name="channel" /> Canal recomendado</h3>
                <div className={styles.vendasOpenChannelBox}>
                  <span aria-hidden="true"><HbxRadarPngIcon name={recommendedIcon} /></span>
                  <div>
                    <strong>{recommendedLabel} <b>Score {channelScore || "--"}</b></strong>
                    <p>{expandedView.nextAction}</p>
                  </div>
                </div>
              </section>
            </section>

            <section className={styles.vendasOpenNextAction}>
              <div>
                <span aria-hidden="true">ϟ</span>
                <div>
                  <strong>Próxima melhor ação</strong>
                  <p>{expandedView.nextAction}</p>
                </div>
              </div>
              <button
                type="button"
                className={styles.vendasOpenMessageButton}
                onClick={() => setDesktopTemplateEditorOpen(true)}
                disabled={!selectedCapabilities.canSeeMessageTemplates}
              >
                <HbxRadarPngIcon name="message" /> Ver modelo de mensagem
              </button>
              <a
                className={styles.vendasOpenWhatsappButton}
                href={selectedWhatsappHref || undefined}
                target="_blank"
                rel="noreferrer"
                aria-disabled={!selectedWhatsappHref}
                onClick={(event) => {
                  if (!selectedWhatsappHref) event.preventDefault();
                  else void incrementAttempt(selectedLead.id);
                }}
              >
                <HbxRadarPngIcon name="whatsapp" /> Iniciar no WhatsApp
              </a>
            </section>

            <section className={styles.vendasOpenObservationReturn} aria-label="Observação e retorno">
              <header className={styles.vendasOpenObservationHeader}>
                <div>
                  <span aria-hidden="true">⚡</span>
                  <div>
                    <h3>Observação e retorno</h3>
                    <p>Registro comercial, frase pronta e próxima ação no mesmo bloco</p>
                  </div>
                </div>
                <div className={styles.vendasOpenObservationPills}>
                  <span>Frases <strong>{activeDesktopTemplateIndex + 1} de {desktopTemplates.length}</strong></span>
                  <span>Retorno <strong>{desktopReturnSummary}</strong></span>
                  <span>Canal <strong>{recommendedLabel}</strong></span>
                </div>
              </header>

              <div className={styles.vendasOpenObservationGrid}>
                <section className={styles.vendasOpenObservationPanel}>
                  <header>
                    <h4>Mensagem WhatsApp</h4>
                    <span>frases prontas</span>
                  </header>

                  <div className={styles.desktopReadyMessages}>
                    <div className={styles.vendasOpenReadyTop}>
                      <strong>Frases prontas</strong>
                      <button type="button" onClick={() => setDesktopTemplateEditorOpen(true)}>
                        Editar frases
                      </button>
                    </div>
                    <h5>Mensagem WhatsApp</h5>
                    <p data-empty={selectedReadyMessage.trim() ? "false" : "true"}>
                      {selectedReadyMessage.trim() || "Nenhuma frase pronta configurada."}
                    </p>
                    <div className={styles.desktopReadyMessageActions}>
                      <button
                        type="button"
                        onClick={() => void copyMobileText(selectedReadyMessage, "Frase copiada.")}
                        disabled={!selectedCapabilities.canSeeMessageTemplates || !selectedReadyMessage.trim()}
                      >
                        Copiar frase
                      </button>
                      <a
                        href={selectedWhatsappHref || undefined}
                        target="_blank"
                        rel="noreferrer"
                        aria-disabled={!selectedWhatsappHref || !selectedCapabilities.canSeeMessageTemplates || !selectedReadyMessage.trim()}
                        onClick={(event) => {
                          if (!selectedWhatsappHref || !selectedCapabilities.canSeeMessageTemplates || !selectedReadyMessage.trim()) event.preventDefault();
                          else void incrementAttempt(selectedLead.id);
                        }}
                      >
                        Enviar WhatsApp
                      </a>
                    </div>
                  </div>

                  <label className={styles.vendasOpenNoteField}>
                    <span>Observação interna</span>
                    <textarea
                      value={desktopObservationDraft}
                      onChange={(event) => setDesktopObservationDrafts((current) => ({
                        ...current,
                        [selectedLead.id]: event.target.value,
                      }))}
                      rows={6}
                      maxLength={280}
                      placeholder="Digite uma observação interna para ficar salva no sistema."
                    />
                  </label>
                </section>

                <aside className={`${styles.vendasOpenObservationPanel} ${styles.desktopReturnCompact}`}>
                  <header>
                    <h4>Próximo retorno</h4>
                    <span>agenda do lead</span>
                  </header>

                  <div className={styles.desktopReturnInlineHeader}>
                    <span>Agendar retorno</span>
                    <strong>{desktopReturnSummary}</strong>
                  </div>

                  <div className={styles.desktopReturnPlannerTop}>
                    <label>
                      <span>Próxima ação</span>
                      <input
                        value={selectedLeadDraft.nextAction}
                        onChange={(event) => setLeadDraft(selectedLead.id, { nextAction: event.target.value })}
                        placeholder="Ex.: chamar no WhatsApp hoje"
                      />
                    </label>
                    <label>
                      <span>Horário</span>
                      <input
                        type="time"
                        value={desktopReturnTime}
                        onChange={(event) => {
                          const nextReturnAt = `${desktopReturnDateKey}T${event.target.value}`;
                          setDesktopReturnDrafts((current) => ({ ...current, [selectedLead.id]: nextReturnAt }));
                          setLeadDraft(selectedLead.id, {
                            status: "retorno",
                            returnAt: nextReturnAt,
                          });
                        }}
                      />
                    </label>
                  </div>

                  <div className={styles.desktopReturnCalendar}>
                    <header>
                      <button type="button" onClick={() => setDesktopReturnMonthKey((current) => shiftMonthKey(current || activeDesktopReturnMonthKey, -1))} aria-label="Mês anterior">‹</button>
                      <strong>{desktopReturnMonthLabel}</strong>
                      <button type="button" onClick={() => setDesktopReturnMonthKey((current) => shiftMonthKey(current || activeDesktopReturnMonthKey, 1))} aria-label="Próximo mês">›</button>
                    </header>
                    <div className={styles.desktopReturnWeekdays} aria-hidden="true">
                      {["D", "S", "T", "Q", "Q", "S", "S"].map((label, index) => (
                        <span key={`${label}-${index}`}>{label}</span>
                      ))}
                    </div>
                    <div className={styles.desktopReturnCalendarGrid}>
                      {desktopReturnCalendarDays.map((day) => (
                        day.day ? (
                          <button
                            type="button"
                            key={day.key}
                            data-date-key={day.key}
                            data-selected={day.key === desktopReturnDateKey ? "true" : "false"}
                            onClick={() => applyDesktopReturnDate(day.key)}
                          >
                            {day.day}
                          </button>
                        ) : (
                          <span key={day.key} aria-hidden="true" />
                        )
                      ))}
                    </div>
                  </div>
                </aside>
              </div>

              <footer className={styles.vendasOpenObservationFooter}>
                <button
                  type="button"
                  className={styles.vendasOpenSaveButton}
                  onClick={() => void saveLead(
                    selectedLead.id,
                    {
                      shortNote: desktopObservationDraft,
                      nextAction: selectedLeadDraft.nextAction,
                      returnAt: desktopReturnDraftValue,
                      status: desktopReturnDraftValue ? "retorno" : selectedLeadDraft.status,
                    },
                    "Observação e retorno salvos.",
                  )}
                  disabled={savingLeadId === selectedLead.id}
                >
                  {savingLeadId === selectedLead.id ? "Salvando" : "Salvar alterações"}
                </button>
                <div>
                  <button
                    type="button"
                    data-tone="sale"
                    onClick={() => openAssistedSignup(selectedLead)}
                    disabled={assistedSignupSaving || savingLeadId === selectedLead.id}
                  >
                    Fechou venda
                  </button>
                  <a
                    href={selectedCallHref || undefined}
                    aria-disabled={!selectedCallHref}
                    onClick={(event) => {
                      if (!selectedCallHref) event.preventDefault();
                      else void runQuickAction(selectedLead, "tentativa_call");
                    }}
                  >
                    Ligar
                  </a>
                  <a
                    href={selectedWhatsappHref || undefined}
                    target="_blank"
                    rel="noreferrer"
                    aria-disabled={!selectedWhatsappHref}
                    onClick={(event) => {
                      if (!selectedWhatsappHref) event.preventDefault();
                      else void incrementAttempt(selectedLead.id);
                    }}
                  >
                    Iniciar no WhatsApp
                  </a>
                  {selectedLead.status !== "encerrado" ? (
                    <button
                      type="button"
                      data-tone="danger"
                      onClick={() => void runQuickAction(selectedLead, "encerrar")}
                    >
                      Encerrar
                    </button>
                  ) : null}
                </div>
              </footer>
            </section>
          </section>

          <HbxPopup1
            open={desktopTemplateEditorOpen}
            title="Editor de frases prontas"
            eyebrow="Vendas"
            tone="info"
            description="Crie mensagens para enviar no WhatsApp. Variáveis entram no texto e são preenchidas no envio."
            onClose={() => setDesktopTemplateEditorOpen(false)}
            primaryAction={(
              <button
                type="button"
                className="hbx-popup1__primary"
                onClick={() => {
                  saveDesktopReadyMessageLibrary(desktopTemplates);
                  setFeedback("Frases prontas salvas.");
                  setDesktopTemplateEditorOpen(false);
                }}
              >
                Salvar frases
              </button>
            )}
            secondaryAction={(
              <button
                type="button"
                className="hbx-popup1__ghost"
                onClick={() => setDesktopTemplateEditorOpen(false)}
              >
                Fechar
              </button>
            )}
          >
            <div className={`${styles.desktopTemplatePopupContent} vendasDesktopTemplatePopupRoot`}>
              <div className={styles.desktopTemplatePopupBar}>
                <span>{activeDesktopTemplateIndex + 1} de {desktopTemplates.length}</span>
                <div>
                  <button type="button" onClick={addDesktopTemplate} disabled={desktopTemplates.length >= 20}>+</button>
                  <button type="button" onClick={() => setDesktopTemplateIndex((current) => Math.min(current + 1, desktopTemplates.length - 1))} disabled={activeDesktopTemplateIndex >= desktopTemplates.length - 1}>&gt;</button>
                  <button type="button" onClick={() => setDesktopTemplateIndex((current) => Math.max(0, current - 1))} disabled={activeDesktopTemplateIndex <= 0}>&lt;</button>
                  <button type="button" onClick={removeDesktopTemplate} disabled={desktopTemplates.length <= 1}>Del</button>
                </div>
              </div>
              <textarea
                ref={desktopTemplateTextareaRef}
                value={selectedReadyTemplateRaw}
                onChange={(event) => updateDesktopTemplate(event.target.value)}
                disabled={!selectedCapabilities.canSeeMessageTemplates}
                placeholder="Escreva a frase pronta para enviar pelo WhatsApp."
              />
              <div className={styles.desktopTemplateVariablePanel}>
                <div>
                  <strong>Variáveis</strong>
                  <span>Insira no cursor do texto</span>
                </div>
                <div>
                  {[
                    ["{{company}}", "Empresa"],
                    ["{{city}}", "Cidade"],
                    ["{{segment}}", "Segmento"],
                    ["{{phone}}", "Telefone"],
                    ["{{seller}}", "Vendedor"],
                  ].map(([token, label]) => (
                    <button type="button" key={token} onClick={() => insertDesktopVariable(token)}>
                      <b>{label}</b>
                      <span>{token}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.desktopTemplateLivePreview}>
                <span>Prévia WhatsApp</span>
                <p>{selectedReadyMessage.trim() || "A prévia aparece quando uma frase for criada."}</p>
              </div>
            </div>
          </HbxPopup1>
            </div>
          </div>
        </section>
      </div>,
      document.body,
    );
  }
  function renderPipelineBoard() {
    if (!selectedFilter) {
      return (
        <section className={styles.boardShell}>
          <div className={styles.emptyBoard}>
            <strong>Nenhuma janela de datas disponível</strong>
            <p>Assim que houver agenda, os cards aparecem aqui.</p>
          </div>
        </section>
      );
    }

    return (
      <section className={styles.boardShell}>
        {filteredLeads.length ? (
          <div className={styles.cardsGrid}>
            {filteredLeads.map((lead) =>
              renderLeadCard(lead, selectedFilter.blockKey),
            )}
          </div>
        ) : (
          <div className={styles.emptyBoard}>
            <strong>Sem cards nesta data</strong>
            <p>Nenhum cliente caiu nessa janela ainda.</p>
          </div>
        )}
      </section>
    );
  }

  if (hasToken === null) {
    return (
      <DashboardScaffold
        title="Vendas"
        description="Carregando sessão do CRM comercial."
        hideHeader={true}
      >
        <section className={styles.loadingCard}>
          <div className={styles.skeletonHero} />
          <div className={styles.skeletonBoard} />
        </section>
      </DashboardScaffold>
    );
  }

  if (!hasToken) return null;

  const activeDragRecord = activeDragLeadId
    ? leadById.get(activeDragLeadId) || null
    : null;
  const activeDragLead = activeDragRecord?.lead || null;
  const activeDragDraft = activeDragLead
    ? drafts[activeDragLead.id] || createDraft(activeDragLead)
    : null;
  const flyStyle = flyAnimation
    ? ({
        ["--fly-start-x" as string]: `${flyAnimation.from.x}px`,
        ["--fly-start-y" as string]: `${flyAnimation.from.y}px`,
        ["--fly-width" as string]: `${flyAnimation.from.width}px`,
        ["--fly-height" as string]: `${flyAnimation.from.height}px`,
        ["--fly-end-x" as string]: `${flyAnimation.to.x + flyAnimation.to.width / 2 - flyAnimation.from.width / 2}px`,
        ["--fly-end-y" as string]: `${flyAnimation.to.y + flyAnimation.to.height / 2 - flyAnimation.from.height / 2}px`,
        ["--fly-scale-x" as string]: `${Math.max(0.28, flyAnimation.to.width / flyAnimation.from.width)}`,
        ["--fly-scale-y" as string]: `${Math.max(0.24, flyAnimation.to.height / flyAnimation.from.height)}`,
      } satisfies CSSProperties)
    : undefined;
  const dragOverlayStyle = activeDragRect
    ? ({
        ["--drag-overlay-width" as string]: `${activeDragRect.width}px`,
        ["--drag-overlay-height" as string]: `${activeDragRect.height}px`,
      } satisfies CSSProperties)
    : undefined;

  const activeDragDateItem = activeDragDateKey
    ? dateFilters.find((f) => f.key === activeDragDateKey)
    : null;
  const desktopActiveClientCount = Math.max(
    0,
    (board?.summary.overdue || 0) + (board?.summary.today || 0) + (board?.summary.scheduled || 0),
  );
  const desktopAttentionCount =
    (crmIntegrity?.checks || []).filter((check) => ["warning", "danger"].includes(String(check.status || ""))).length ||
    Number(crmIntegrity?.totals?.missingPayoutLinks || 0) ||
    Number(crmIntegrity?.totals?.staleAssignedCards || 0);
  const desktopSellerExceptionCount =
    Number(sellerAudit?.operation?.summary?.exceptions || sellerAudit?.totals?.exceptions || 0);
  const desktopTabs: Array<{ key: DesktopVendasTab; label: string; badge?: string | number; admin?: boolean }> = [
    { key: "clientes", label: "Clientes", badge: desktopActiveClientCount },
    ...(desktopAdminMenusEnabled
      ? [
          {
            key: "comissao" as const,
            label: "Minha comissão",
            badge: formatCurrency(commissionSummary?.totals?.duePayableAmount || 0),
            admin: true,
          },
          {
            key: "atencao" as const,
            label: "Atenção",
            badge: desktopAttentionCount,
            admin: true,
          },
          {
            key: "esteira" as const,
            label: "Esteira HBX",
            badge: hbxClosingPipeline?.totals?.total || 0,
            admin: true,
          },
          {
            key: "vendedores" as const,
            label: "Vendedores",
            badge: desktopSellerExceptionCount,
            admin: true,
          },
        ]
      : []),
  ];
  const desktopGuide4TopItems: HbxGuide4Item[] = [
    {
      id: "new-lead",
      label: "Criar novo Lead",
      icon: <VendasGuideIcon name="plus" />,
      tone: "primary",
      onClick: () => setComposerOpen(true),
    },
  ];
  const desktopGuide4NavItems: HbxGuide4Item[] = [
    {
      id: "select",
      label: bulkSelectionMode ? "Cancelar seleção" : "Selecionar",
      icon: <VendasGuideIcon name="select" />,
      active: bulkSelectionMode,
      onClick: toggleBulkSelectionMode,
    },
    ...(bulkSelectionMode
      ? [
          {
            id: "select-all",
            label: bulkSelectAllAccount ? "Limpar todos" : "Selecionar todos",
            icon: <VendasGuideIcon name="all" />,
            active: bulkSelectAllAccount,
            onClick: toggleBulkSelectAll,
          } satisfies HbxGuide4Item,
          {
            id: "delete-selected",
            label: bulkSelectAllAccount
              ? "Excluir todos selecionados"
              : selectedBulkLeadIds.size
                ? `Excluir ${selectedBulkLeadIds.size} selecionado(s)`
                : "Selecione cards para excluir",
            icon: <VendasGuideIcon name="trash" />,
            tone: "danger",
            disabled: bulkDeleting || (!bulkSelectAllAccount && selectedBulkLeadIds.size === 0),
            badge: bulkSelectAllAccount ? loadedLeadIds.length : selectedBulkLeadIds.size,
            onClick: () => void deleteSelectedLeadsBulk(),
          } satisfies HbxGuide4Item,
        ]
      : []),
    {
      id: "whatsapp",
      label: WHATSAPP_FILTER_LABELS[whatsappFilter],
      icon: <VendasGuideIcon name="whatsapp" />,
      active: whatsappFilter !== "all",
      tone: whatsappFilter !== "all" ? "success" : "default",
      onClick: () => setWhatsappFilter((current) => nextWhatsappFilter(current)),
    },
    {
      id: "inbox",
      label: INBOX_FILTER_LABELS[inboxFilter],
      icon: <VendasGuideIcon name="inbox" />,
      active: inboxFilter !== "all",
      onClick: () => setInboxFilter((current) => nextInboxFilter(current)),
    },
  ];
  const desktopGuide4BottomItems: HbxGuide4Item[] = [
    {
      id: "archive",
      label: showClosed ? "Ocultar arquivo" : `Arquivo (${closedLeads.length})`,
      icon: <VendasGuideIcon name="archive" />,
      active: showClosed,
      badge: showClosed ? null : closedLeads.length,
      onClick: () => setShowClosed((current) => !current),
    },
  ];
  const vendasDragTopbarLockStyle = `
html[data-vendas-dragging-card="true"] {
  --topbar-total-height: 0px;
}

html[data-vendas-dragging-card="true"] .app-topbar,
html[data-vendas-dragging-card="true"] .app-topbar__frame,
html[data-vendas-dragging-card="true"] .app-topbar__portal,
html[data-vendas-dragging-card="true"] header[class*="topbar" i],
html[data-vendas-dragging-card="true"] [class*="app-topbar" i] {
  transform: translate3d(0, -140%, 0) !important;
  opacity: 0 !important;
  visibility: hidden !important;
  pointer-events: none !important;
  transition: none !important;
}

html[data-vendas-dragging-card="true"] .${styles.desktopVendasTabRow},
html[data-vendas-dragging-card="true"] .${styles.stageGrid},
html[data-vendas-dragging-card="true"] .${styles.archiveSection} {
  filter: blur(3px) saturate(0.72);
  opacity: 0.24;
  transform: scale(0.996);
  pointer-events: none;
  transition:
    filter var(--hbx-motion-fast, 160ms) var(--hbx-ease-soft, ease),
    opacity var(--hbx-motion-fast, 160ms) var(--hbx-ease-soft, ease),
    transform var(--hbx-motion-fast, 160ms) var(--hbx-ease-soft, ease);
}

html[data-vendas-dragging-card="true"] .${styles.filterRail} {
  position: sticky;
  top: 0 !important;
  z-index: 2147483000 !important;
  isolation: isolate;
  transform: translateZ(0);
  overflow: visible !important;
  border-color: color-mix(in srgb, var(--brand) 46%, var(--line)) !important;
  box-shadow:
    0 1px 0 color-mix(in srgb, var(--surface-raised) 94%, transparent) inset,
    0 0 0 2px color-mix(in srgb, var(--brand) 18%, transparent),
    0 24px 56px -24px color-mix(in srgb, var(--brand) 34%, transparent),
    0 34px 84px -42px rgba(15, 23, 42, 0.36),
    var(--shadow-inset) !important;
}

html[data-vendas-dragging-card="true"] .${styles.filterRail}::after {
  content: "Solte no filtro de data";
  position: absolute;
  right: 1rem;
  top: -0.72rem;
  z-index: 4;
  padding: 0.22rem 0.58rem;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--brand) 38%, var(--line));
  background: color-mix(in srgb, var(--surface-raised) 96%, var(--background));
  color: color-mix(in srgb, var(--brand) 88%, var(--foreground));
  box-shadow: 0 14px 28px -18px color-mix(in srgb, var(--brand) 44%, transparent);
  font-size: 0.62rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  pointer-events: none;
}

html[data-vendas-dragging-card="true"] .${styles.dateFilterCard} {
  pointer-events: auto;
  opacity: 1 !important;
  border-color: color-mix(in srgb, var(--brand) 34%, var(--line)) !important;
  background:
    radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--brand) 16%, transparent), transparent 48%),
    linear-gradient(180deg, color-mix(in srgb, var(--surface) 98%, var(--background)), color-mix(in srgb, var(--surface-soft) 98%, var(--background))) !important;
  box-shadow:
    0 1px 0 color-mix(in srgb, white 72%, transparent) inset,
    0 18px 36px -28px color-mix(in srgb, var(--brand) 36%, transparent),
    0 0 0 1px color-mix(in srgb, var(--brand) 14%, transparent) !important;
}

html[data-vendas-dragging-card="true"] .${styles.dateFilterCard} .${styles.receiveHint} {
  opacity: 0.52;
  transform: translateX(-50%) translateY(0);
}

html[data-vendas-dragging-card="true"] .${styles.dateFilterCard}[data-dropover="true"] {
  z-index: 2147483001 !important;
  border-color: color-mix(in srgb, var(--brand) 78%, var(--line)) !important;
  transform: translateY(-7px) scale(1.055) !important;
  box-shadow:
    0 0 0 4px color-mix(in srgb, var(--brand) 28%, transparent),
    0 30px 58px -24px color-mix(in srgb, var(--brand) 52%, transparent),
    0 0 34px color-mix(in srgb, var(--brand) 20%, transparent) !important;
}

html[data-vendas-dragging-card="true"] .${styles.dateFilterCard}[data-dropover="true"] .${styles.receiveHint} {
  opacity: 1;
  font-weight: 950;
}
`;

  const accountCapabilities = board?.capabilities || salesProfile?.capabilities || {};
  const accountProfileSummary = `${salesProfileDraft.whatDoYouSell || "Perfil"} para ${(salesProfileDraft.targetAudience || [])[0] || "pequenos negócios"}`;

  function renderAccountChipEditor(
    title: string,
    values: string[],
    examples: string[],
    onChange: (values: string[]) => void,
  ) {
    return (
      <section className={`${styles.mobileSalesProfileBlock} hbx-mobile-card`}>
        <strong>{title}</strong>
        <div className={styles.mobileSalesProfileChips}>
          {examples.map((item) => {
            const active = values.some((value) => value.toLowerCase() === item.toLowerCase());
            return (
              <button
                key={item}
                type="button"
                data-active={active ? "true" : "false"}
                onClick={() => onChange(toggleStringValue(values, item))}
              >
                {item}
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  function renderAccountSalesProfileSettings() {
    return (
      <div className={styles.mobileVendasAccountSettings}>
        <section className={`${styles.mobileSalesProfileHero} hbx-mobile-card`}>
          <span>Perfil ativo: {accountProfileSummary}</span>
          <strong>Perfil de Venda</strong>
          <p>O HBX usa isso para escolher melhores cards para você.</p>
        </section>
        <section className={`${styles.mobileSalesProfileBlock} hbx-mobile-card`}>
          <strong>O que você vende?</strong>
          <input
            value={salesProfileDraft.whatDoYouSell}
            onChange={(event) => setSalesProfileDraft((current) => ({ ...current, whatDoYouSell: event.target.value }))}
            placeholder="Ex.: Plano de saúde"
            maxLength={160}
          />
          <div className={styles.mobileSalesProfileChips}>
            {SALES_PROFILE_SELL_EXAMPLES.map((item) => (
              <button
                key={item}
                type="button"
                data-active={salesProfileDraft.whatDoYouSell === item ? "true" : "false"}
                onClick={() => setSalesProfileDraft((current) => ({ ...current, whatDoYouSell: item }))}
              >
                {item}
              </button>
            ))}
          </div>
        </section>
        {renderAccountChipEditor("Para quem você quer vender?", salesProfileDraft.targetAudience, SALES_PROFILE_AUDIENCE_EXAMPLES, (values) =>
          setSalesProfileDraft((current) => ({ ...current, targetAudience: values })),
        )}
        {renderAccountChipEditor("O que você quer evitar?", salesProfileDraft.avoidSegments, SALES_PROFILE_AVOID_EXAMPLES, (values) =>
          setSalesProfileDraft((current) => ({ ...current, avoidSegments: values })),
        )}
        {renderAccountChipEditor("Canal preferido", salesProfileDraft.preferredChannels, SALES_PROFILE_CHANNELS, (values) =>
          setSalesProfileDraft((current) => ({ ...current, preferredChannels: values })),
        )}
        <section className={`${styles.mobileSalesProfileBlock} hbx-mobile-card`}>
          <label className={styles.mobileSalesProfileToggle}>
            <input
              type="checkbox"
              checked={salesProfileDraft.weeklyAutoUpdateEnabled}
              onChange={(event) => setSalesProfileDraft((current) => ({ ...current, weeklyAutoUpdateEnabled: event.target.checked }))}
            />
            <span>Deixar o HBX sugerir ajustes toda segunda-feira</span>
          </label>
          <p>Você revisa antes de aplicar.</p>
        </section>
        {salesProfileSuggestion?.diff?.length ? (
          <section className={`${styles.mobileSalesProfileBlock} hbx-mobile-card`}>
            <strong>Sugestão da semana</strong>
            {salesProfileSuggestion.diff.map((item: string) => <p key={item}>{item}</p>)}
          </section>
        ) : null}
        <div className={styles.mobileSalesProfileActions}>
          <button type="button" className="hbx-mobile-primary-button" onClick={() => void saveSalesProfile()} disabled={salesProfileSaving}>
            {salesProfileSaving ? "Salvando" : "Salvar perfil"}
          </button>
          <button type="button" className="hbx-mobile-secondary-button" onClick={() => void suggestSalesProfile()} disabled={salesProfileSaving || !accountCapabilities.canUseWeeklyProfileSuggestions}>
            Gerar sugestão com base na semana
          </button>
          <button type="button" className="hbx-mobile-secondary-button" onClick={() => setSalesProfileDraft(SALES_PROFILE_DEFAULT_DRAFT)}>
            Restaurar padrão
          </button>
        </div>
      </div>
    );
  }

  const mobileReturnDateKey = mobileReturnScheduler
    ? parseShortBrazilianDate(mobileReturnScheduler.dateText)
    : "";
  const mobileReturnCalendarDays = mobileReturnScheduler
    ? buildCalendarDays(mobileReturnScheduler.monthKey)
    : [];
  const mobileReturnMonthLabel = mobileReturnScheduler
    ? new Date(`${mobileReturnScheduler.monthKey}-01T12:00:00`).toLocaleDateString("pt-BR", {
        month: "long",
        year: "numeric",
      })
    : "";
  function renderMasterNoticeBell() {
    return (
      <button
        type="button"
        className={`${styles.masterNoticeBell} hbx-live-pulse`}
        data-unread={pendingMasterNoticeCount > 0 ? "true" : "false"}
        onClick={() => setMasterNoticeCenterOpen(true)}
        aria-label={`Abrir avisos Master. ${pendingMasterNoticeCount} aviso(s) pendente(s).`}
        title="Avisos Master"
      >
        <span className={styles.masterNoticeBellIcon} aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M10.27 21a2 2 0 0 0 3.46 0" />
            <path d="M3.26 15.33A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.67C19.41 13.96 18 12.5 18 8A6 6 0 0 0 6 8c0 4.5-1.41 5.96-2.74 7.33Z" />
          </svg>
        </span>
        <span className={styles.masterNoticeBellText}>Avisos</span>
        {pendingMasterNoticeCount > 0 ? <b>{pendingMasterNoticeCount}</b> : null}
      </button>
    );
  }

  function renderMasterNoticeCenter(includeBell = true) {
    const canUseDocument = typeof document !== "undefined";
    const audienceLabel = masterNoticeAudience === "customer" ? "Clientes" : "Vendedores";
    const activeForcedNotice =
      forcedMasterNotice && activeForcedNoticeId === forcedMasterNotice.id
        ? forcedMasterNotice
        : null;

    const panel = masterNoticeCenterOpen && canUseDocument
      ? createPortal(
          <div
            className={`${styles.masterNoticeBackdrop} hbx-stage-fade-mask`}
            onClick={() => setMasterNoticeCenterOpen(false)}
          >
            <section
              className={`${styles.masterNoticePanel} hbx-qr-card-pop`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="master-notice-title"
              onClick={(event) => event.stopPropagation()}
            >
              <header className={styles.masterNoticeHeader}>
                <div>
                  <span>Avisos Master</span>
                  <strong id="master-notice-title">Central de comunicados</strong>
                </div>
                <button
                  type="button"
                  onClick={() => setMasterNoticeCenterOpen(false)}
                  aria-label="Fechar avisos"
                >
                  X
                </button>
              </header>

              <div className={styles.masterNoticeTabs} role="tablist" aria-label="Público dos avisos">
                {(["seller", "customer"] as MasterNoticeAudience[]).map((audience) => {
                  return (
                    <button
                      key={audience}
                      type="button"
                      data-active={masterNoticeAudience === audience ? "true" : "false"}
                      onClick={() => {
                        setMasterNoticeAudience(audience);
                        setMasterNoticeDraft((current) => ({ ...current, audience }));
                        void loadMasterNotices(audience);
                      }}
                    >
                      {audience === "seller" ? "Vendedores" : "Clientes"}
                    </button>
                  );
                })}
              </div>

              {masterNoticeCanManage ? (
                <form className={styles.masterNoticeComposer} onSubmit={createMasterNotice}>
                  <div className={styles.masterNoticeComposerTop}>
                    <label>
                      <span>Título</span>
                      <input
                        value={masterNoticeDraft.title}
                        onChange={(event) =>
                          setMasterNoticeDraft((current) => ({ ...current, title: event.target.value }))
                        }
                        maxLength={96}
                        placeholder="Ex.: Script novo para estética"
                      />
                    </label>
                    <label>
                      <span>Tom</span>
                      <select
                        value={masterNoticeDraft.tone}
                        onChange={(event) =>
                          setMasterNoticeDraft((current) => ({
                            ...current,
                            tone: event.target.value as MasterNoticeTone,
                          }))
                        }
                      >
                        <option value="info">Informativo</option>
                        <option value="success">Resultado</option>
                        <option value="warning">Atenção</option>
                        <option value="urgent">Urgente</option>
                      </select>
                    </label>
                  </div>
                  <label>
                    <span>Mensagem</span>
                    <textarea
                      value={masterNoticeDraft.body}
                      onChange={(event) =>
                        setMasterNoticeDraft((current) => ({ ...current, body: event.target.value }))
                      }
                      rows={4}
                      maxLength={1200}
                      placeholder={`Aviso para ${audienceLabel.toLowerCase()}`}
                    />
                  </label>
                  <div className={styles.masterNoticeScheduleGrid}>
                    <label>
                      <span>Travado por</span>
                      <input
                        type="number"
                        min={0}
                        max={120}
                        value={masterNoticeDraft.forceSeconds}
                        onChange={(event) =>
                          setMasterNoticeDraft((current) => ({ ...current, forceSeconds: event.target.value }))
                        }
                      />
                    </label>
                    <label>
                      <span>Início</span>
                      <input
                        type="date"
                        value={masterNoticeDraft.startsAt}
                        onChange={(event) =>
                          setMasterNoticeDraft((current) => ({ ...current, startsAt: event.target.value }))
                        }
                      />
                    </label>
                    <label>
                      <span>Expira</span>
                      <input
                        type="date"
                        value={masterNoticeDraft.expiresAt}
                        onChange={(event) =>
                          setMasterNoticeDraft((current) => ({ ...current, expiresAt: event.target.value }))
                        }
                      />
                    </label>
                  </div>
                  <button type="submit" className={styles.masterNoticePublish} disabled={masterNoticeSaving}>
                    {masterNoticeSaving ? "Publicando..." : `Publicar para ${audienceLabel}`}
                  </button>
                </form>
              ) : null}

              <div className={styles.masterNoticeList}>
                {masterNotices.length ? (
                  masterNotices.map((notice) => (
                    <article
                      key={notice.id}
                      className={styles.masterNoticeItem}
                      data-tone={notice.tone || "info"}
                      data-read={notice.acknowledged ? "true" : "false"}
                    >
                      <div>
                        <span>
                          {notice.audience === "customer" ? "Clientes" : "Vendedores"} · até {formatShortDate(notice.expiresAt)}
                        </span>
                        <strong>{notice.title}</strong>
                        <p>{notice.body}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void acknowledgeMasterNotice(notice.id)}
                        disabled={notice.acknowledged}
                      >
                        {notice.acknowledged ? "Fechado" : "Fechar"}
                      </button>
                    </article>
                  ))
                ) : (
                  <div className={styles.masterNoticeEmpty}>
                    <strong>Nenhum aviso ativo</strong>
                    <p>Os comunicados aparecem aqui dentro do período definido pelo Master.</p>
                  </div>
                )}
              </div>
            </section>
          </div>,
          document.body,
        )
      : null;

    const forced = activeForcedNotice && canUseDocument
      ? createPortal(
          <div className={`${styles.masterNoticeForcedBackdrop} hbx-stage-fade-mask`}>
            <section
              className={`${styles.masterNoticeForcedCard} hbx-qr-card-pop`}
              data-tone={activeForcedNotice.tone || "info"}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="master-notice-forced-title"
            >
              <span>Aviso Master</span>
              <h2 id="master-notice-forced-title">{activeForcedNotice.title}</h2>
              <p>{activeForcedNotice.body}</p>
              <button
                type="button"
                disabled={masterNoticeSecondsLeft > 0}
                onClick={() => void acknowledgeMasterNotice(activeForcedNotice.id)}
              >
                {masterNoticeSecondsLeft > 0
                  ? `Liberado em ${masterNoticeSecondsLeft}s`
                  : "Fechar aviso"}
              </button>
            </section>
          </div>,
          document.body,
        )
      : null;

    return (
      <>
        {includeBell ? renderMasterNoticeBell() : null}
        {panel}
        {forced}
      </>
    );
  }

  function renderHbxClosingPipelinePanel(mode: "desktop" | "mobile" = "desktop") {
    const totals = hbxClosingPipeline?.totals || {};
    const rows = (hbxClosingPipeline?.priority || []).slice(0, mode === "mobile" ? 5 : 8);
    const panelClass =
      mode === "mobile"
        ? `${styles.hbxPipelinePanel} ${styles.hbxPipelinePanelMobile} hbx-mobile-card`
        : styles.hbxPipelinePanel;
    const stageCards: Array<[string, number | string | null | undefined, string]> = [
      ["Conversa", totals.conversation, "conversation"],
      ["Interessado", totals.interested, "interested"],
      ["E-mail", totals.waitingEmail, "warning"],
      ["Trial", totals.trial, "success"],
      ["Pago", totals.confirmed, "success"],
      ["D+ liberado", totals.dueCommissionAmount ? formatCurrency(totals.dueCommissionAmount) : "R$ 0,00", "money"],
    ];

    return (
      <section className={panelClass} aria-label="Esteira de fechamento HBX">
        <div className={styles.hbxPipelineHeader}>
          <div>
            <span>Esteira</span>
            <strong>Esteira HBX</strong>
          </div>
          <button type="button" onClick={() => void loadHbxClosingPipeline()} disabled={hbxClosingLoading}>
            {hbxClosingLoading ? "Atualizando" : "Atualizar"}
          </button>
        </div>

        <div className={styles.hbxPipelineStages}>
          {stageCards.map(([label, value, tone]) => (
            <span key={label} data-tone={tone}>
              <small>{label}</small>
              <strong>{hbxClosingLoading ? "..." : value ?? 0}</strong>
            </span>
          ))}
        </div>

        <div className={styles.hbxPipelineRows}>
          {rows.length ? (
            rows.map((item) => {
              const sellerName = item.seller?.name || item.seller?.email || "Sem vendedor";
              const location = [item.city, item.state].filter(Boolean).join("/") || item.segment || "Sem região";
              const planLabel = item.salePlanKey ? salePlanLabel(item.salePlanKey) : "Plano aberto";
              return (
                <article key={item.leadId} data-tone={item.stageTone || "info"}>
                  <div className={styles.hbxPipelineLead}>
                    <strong>{item.name || "Cliente sem nome"}</strong>
                    <span>{sellerName} · {location}</span>
                    <small>{item.emailPending ? "E-mail pendente" : item.hasAssistedSignup ? "Cadastro assistido" : item.hasSignupLink ? "Link gerado" : "Sem cadastro HBX"}</small>
                  </div>
                  <div className={styles.hbxPipelineStep}>
                    <b>{item.stageLabel || "Em conversa"}</b>
                    <span>{item.nextStep || item.nextAction || "Registrar próximo passo."}</span>
                  </div>
                  <div className={styles.hbxPipelineMoney}>
                    <small>{planLabel} · {formatCurrency(item.saleValue || 0)}</small>
                    <b>{formatCurrency(item.commissionAmount || 0)}</b>
                    <span>{item.commissionDueAt ? `D+ ${formatDateTime(item.commissionDueAt)}` : item.commissionStatusLabel || "Comissão em aberto"}</span>
                  </div>
                  <button type="button" onClick={() => openHbxClosingLead(item.leadId)}>
                    Abrir card
                  </button>
                </article>
              );
            })
          ) : (
            <div className={styles.hbxPipelineEmpty}>
              <strong>Nenhuma venda em esteira ainda</strong>
              <p>Quando o vendedor chamar, qualificar ou gerar cadastro HBX, o ciclo aparece aqui.</p>
            </div>
          )}
        </div>

        <div className={styles.hbxPipelinePolicy}>
          <strong>{hbxClosingPipeline?.policy?.title || "Ciclo fechado"}</strong>
          <span>{hbxClosingPipeline?.scope === "company" ? "Equipe completa" : "Meus cards"}</span>
        </div>
      </section>
    );
  }

  function renderCrmIntegrityPanel(mode: "desktop" | "mobile" = "desktop") {
    const score = Math.max(0, Math.min(100, Math.round(Number(crmIntegrity?.score || 0))));
    const checks = (crmIntegrity?.checks || []).slice(0, mode === "mobile" ? 4 : 7);
    const totals = crmIntegrity?.totals || {};
    const panelClass =
      mode === "mobile"
        ? `${styles.crmIntegrityPanel} ${styles.crmIntegrityPanelMobile} hbx-mobile-card`
        : styles.crmIntegrityPanel;

    return (
      <section className={panelClass} aria-label="Auditoria de integridade do CRM">
        <div className={styles.crmIntegrityHeader}>
          <div>
            <span>Admin</span>
            <strong>Atenção</strong>
          </div>
          <button type="button" onClick={() => void loadCrmIntegrity()} disabled={crmIntegrityLoading}>
            {crmIntegrityLoading ? "..." : "Atualizar"}
          </button>
        </div>

        <div className={styles.crmIntegrityScore}>
          <span data-tone={score >= 86 ? "ok" : score >= 68 ? "warning" : "danger"}>
            <small>Score</small>
            <strong>{score}</strong>
          </span>
          <span>
            <small>Cards</small>
            <strong>{totals.totalCards || 0}</strong>
          </span>
          <span>
            <small>Vendedores</small>
            <strong>{totals.activeSellers || 0}</strong>
          </span>
          <span>
            <small>Hoje</small>
            <strong>{totals.deliveredToday || 0}</strong>
          </span>
        </div>

        <div className={styles.crmIntegrityChecks}>
          {checks.length ? (
            checks.map((check) => (
              <article key={String(check.key || check.label || "check")} data-status={check.status || "ok"}>
                <div>
                  <strong>{check.label || "Checagem"}</strong>
                  <span>{check.description || "Sem detalhe."}</span>
                </div>
                {check.action ? <small>{check.action}</small> : null}
              </article>
            ))
          ) : (
            <p>Nenhuma checagem carregada ainda.</p>
          )}
        </div>
      </section>
    );
  }

  function renderSellerAuditPanel(mode: "desktop" | "mobile" = "desktop") {
    const totals = sellerAudit?.totals || {};
    const operation = sellerAudit?.operation;
    const operationSummary = operation?.summary || {};
    const rows = (sellerAudit?.rows || []).slice(0, mode === "mobile" ? 4 : 8);
    const exceptionRows = (sellerAudit?.rows || []).filter((row) =>
      ["acompanhar", "revisar_territorio", "limite_atingido", "sem_regra", "pausado_manual"].includes(String(row.operation?.action || "")),
    ).slice(0, mode === "mobile" ? 3 : 6);
    const title = sellerAudit?.canManage ? "Vendedores" : "Meu dia";
    const panelClass =
      mode === "mobile"
        ? `${styles.sellerAuditPanel} ${styles.sellerAuditPanelMobile} hbx-mobile-card`
        : styles.sellerAuditPanel;

    return (
      <section className={panelClass} aria-label={title}>
        <div className={styles.sellerAuditHeader}>
          <div>
            <span>Operação</span>
            <strong>{title}</strong>
          </div>
          <div className={styles.sellerAuditActions}>
            <select
              value={sellerAuditPeriod}
              onChange={(event) => setSellerAuditPeriod(event.target.value as "today" | "7d")}
              aria-label="Período da operação"
            >
              <option value="today">Hoje</option>
              <option value="7d">7 dias</option>
            </select>
            <button type="button" onClick={() => void loadSellerAudit()} disabled={sellerAuditLoading}>
              {sellerAuditLoading ? "Atualizando" : "Atualizar"}
            </button>
          </div>
        </div>

        <div className={styles.sellerAuditMetrics}>
          {[
            ["Vendedores", totals.sellers],
            ["Recebidos hoje", operationSummary.receivedToday ?? totals.receivedToday],
            ["Chamados hoje", operationSummary.workedToday ?? totals.workedToday],
            ["Parados hoje", operationSummary.idleReceivedToday ?? totals.idleReceivedToday],
            ["Pode receber", operationSummary.canReceive ?? totals.canReceive],
            ["Exceções", operationSummary.exceptions ?? totals.exceptions],
          ].map(([label, value]) => (
            <span key={label}>
              <small>{label}</small>
              <strong>{sellerAuditLoading ? "..." : value ?? 0}</strong>
            </span>
          ))}
        </div>

        <div className={styles.sellerAuditWarRoom}>
          <div className={styles.sellerAuditWarHeader}>
            <div>
              <span>Hoje</span>
              <strong>{operation?.ruleActive ? "Distribuição ativa" : "Distribuição manual"}</strong>
              <p>
                {operation?.ruleCity
                  ? `${operation?.ruleCity}/${operation?.ruleState || ""} · ${operation?.ruleSegment || "segmento aberto"}`
                  : "Sem regra automática."}
              </p>
            </div>
            <div className={styles.sellerAuditWarLimit}>
              <small>Limite diário</small>
              <strong>{operationSummary.deliveredToday ?? 0}/{operationSummary.dailyLimit ?? 0}</strong>
              <span>{operationSummary.dailyRemaining ?? 0} restantes</span>
            </div>
          </div>
          <div className={styles.sellerAuditWarMetrics}>
            {[
              ["Respostas", operationSummary.responses],
              ["Recusas", operationSummary.refused],
              ["Bloqueios", operationSummary.blocked],
              ["Pulados", operationSummary.skippedToday],
              ["Território", operationSummary.territoryIssues],
              ["Limite cheio", operationSummary.dailyLimitReached],
              ["Pausados", operationSummary.manualPaused],
            ].map(([label, value]) => (
              <span key={label}>
                <small>{label}</small>
                <b>{sellerAuditLoading ? "..." : value ?? 0}</b>
              </span>
            ))}
          </div>
          {exceptionRows.length ? (
            <div className={styles.sellerAuditExceptionList}>
              {exceptionRows.map((row) => (
                <span key={`exception-${row.seller.id}`}>
                  <b>{row.seller.name || row.seller.email || "Vendedor"}</b>
                  <small>{row.operation?.label || "Revisar"} · {row.operation?.reason || "Sem detalhe"}</small>
                </span>
              ))}
            </div>
          ) : (
            <div className={styles.sellerAuditExceptionEmpty}>Nenhuma exceção crítica agora.</div>
          )}
        </div>

        <div className={styles.sellerAuditRows}>
          {rows.length ? (
            rows.map((row) => {
              const metrics = row.metrics || {};
              const statusTone = row.status?.tone || "info";
              const workRate = formatReportPercent(metrics.workRate);
              return (
                <article key={row.seller.id} className={styles.sellerAuditRow} data-tone={statusTone}>
                  <div className={styles.sellerAuditSeller}>
                    <strong>{row.seller.name || row.seller.email || "Vendedor"}</strong>
                    <span>
                      {row.seller.active ? "Ativo" : "Inativo"} · {formatPercent(row.seller.commissionPercent || 0)} comissão
                    </span>
                    <small>{row.topCity || "Cidade aberta"} · {row.topSegment || "Segmento aberto"}</small>
                  </div>
                  <div className={styles.sellerAuditRowMetrics}>
                    <span>
                      <small>Hoje</small>
                      <b>{metrics.receivedToday || 0}/{metrics.dailyLimit || 0}</b>
                    </span>
                    <span>
                      <small>Chamou</small>
                      <b>{metrics.workedToday || 0}</b>
                    </span>
                    <span>
                      <small>Parado hoje</small>
                      <b>{metrics.idleReceivedToday || 0}</b>
                    </span>
                    <span>
                      <small>Taxa</small>
                      <b>{workRate}</b>
                    </span>
                  </div>
                  <div className={styles.sellerAuditOperation}>
                    <b>{row.operation?.label || "Em operação"}</b>
                    <span>{row.operation?.reason || `${row.operation?.dailyRemaining ?? metrics.dailyRemaining ?? 0} card(s) restantes hoje.`}</span>
                    <small>
                      {row.operation?.territoryMode === "fixed_cities"
                        ? `${row.operation?.territoryCities?.length || 0} cidade(s) fixas`
                        : "Território aberto"}
                      {row.governance?.dailyLimitOverride != null ? ` · limite manual ${row.governance.dailyLimitOverride}` : ""}
                    </small>
                    {sellerAudit?.canManage ? (
                      <div className={styles.sellerAuditGovernanceActions}>
                        {[
                          { label: "Aprendiz", mode: "learning" },
                          { label: "Normal", mode: "normal" },
                          { label: "Prioridade", mode: "priority" },
                        ].map((action) => {
                          const mode = action.mode;
                          const active = String(row.governance?.mode || "learning") === mode && !row.governance?.pausedActive;
                          return (
                            <button
                              key={`${row.seller.id}-${mode}`}
                              type="button"
                              data-active={active ? "true" : "false"}
                              disabled={sellerGovernanceSaving !== null}
                              onClick={() => void updateSellerGovernance(row.seller.id, { mode })}
                            >
                              {action.label}
                            </button>
                          );
                        })}
                        {row.governance?.pausedActive ? (
                          <button
                            type="button"
                            data-danger="false"
                            disabled={sellerGovernanceSaving !== null}
                            onClick={() => void updateSellerGovernance(row.seller.id, { mode: "normal", pausedUntil: null })}
                          >
                            Liberar
                          </button>
                        ) : (
                          <button
                            type="button"
                            data-danger="true"
                            disabled={sellerGovernanceSaving !== null}
                            onClick={() => void updateSellerGovernance(row.seller.id, { mode: "paused", pausedDays: 1, note: "Pausa manual pelo painel diário." })}
                          >
                            Pausar hoje
                          </button>
                        )}
                        <button
                          type="button"
                          data-active={row.governance?.dailyLimitOverride === 10 ? "true" : "false"}
                          disabled={sellerGovernanceSaving !== null}
                          onClick={() => void updateSellerGovernance(row.seller.id, { dailyLimitOverride: 10, note: "Limite manual definido no painel diário." })}
                        >
                          Limite 10
                        </button>
                        <button
                          type="button"
                          disabled={sellerGovernanceSaving !== null}
                          onClick={() => void updateSellerGovernance(row.seller.id, { dailyLimitOverride: null })}
                        >
                          Limite padrão
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <div className={styles.sellerAuditStatus}>
                    <b>{row.status?.label || "Em operação"}</b>
                    <span>{row.status?.recommendation || "Sem bloqueio automático."}</span>
                    <small>Última ação: {formatDateTime(row.lastActivityAt)}</small>
                  </div>
                </article>
              );
            })
          ) : (
            <div className={styles.sellerAuditEmpty}>
              <strong>Nenhum vendedor com dados ainda</strong>
              <p>Quando os cards forem distribuídos e trabalhados, a operação aparece aqui.</p>
            </div>
          )}
        </div>

        <div className={styles.sellerAuditPolicy}>
          <strong>{sellerAudit?.auditPolicy?.title || "Auditoria operacional transparente"}</strong>
          <span>Sem punição automática.</span>
        </div>
      </section>
    );
  }

  function renderDesktopCommissionPanel() {
    const totals = commissionSummary?.totals || {};
    const payable = Number(totals.payableAmount || 0);
    const due = Number(totals.duePayableAmount || 0);
    const waiting = Math.max(0, payable - due);
    const recentPaid = (commissionSummary?.payouts || []).find((payout) => String(payout.status || "").toLowerCase() !== "canceled") || null;
    const financeAudit = commissionSummary?.financeAudit || null;
    const commissionClients = commissionSummary?.clients || {};
    const priorityClients = [
      ...(commissionClients.pendingActivation || []),
      ...(commissionClients.payable || []),
      ...(commissionClients.active || []),
    ].slice(0, 4);
    const sellerPayoutRows = (commissionSummary?.sellerPayouts || []).filter((row) => Number(row.duePayableAmount || 0) > 0).slice(0, 6);
    const canRegisterPayout = Boolean(commissionSummary?.canPayout && due > 0);
    return (
      <section className={styles.desktopCommissionPanel} aria-label="Resumo de comissão">
        <div className={styles.desktopCommissionHeader}>
          <div>
            <span className={styles.panelEyebrow}>Carteira HBX</span>
            <strong>Minha comissão</strong>
          </div>
          <button
            type="button"
            className={styles.secondaryAction}
            onClick={() => void loadCommissionSummary()}
            disabled={commissionLoading}
          >
            {commissionLoading ? "Atualizando..." : "Atualizar"}
          </button>
        </div>
        <div className={styles.desktopCommissionMetrics}>
          <span data-tone="warning">
            <small>Liberado</small>
            <strong>{formatCurrency(due)}</strong>
          </span>
          <span data-tone="success">
            <small>A receber</small>
            <strong>{formatCurrency(payable)}</strong>
          </span>
          <span>
            <small>Pago</small>
            <strong>{formatCurrency(totals.paidAmount || 0)}</strong>
          </span>
          <span>
            <small>Ativos</small>
            <strong>{totals.activeClients || 0}</strong>
          </span>
        </div>
        <div className={styles.desktopCommissionFlow} aria-label="Esteira da comissão">
          <span data-active={Number(totals.pendingActivation || 0) > 0 ? "true" : "false"}>
            <small>1. Implantação</small>
            <strong>{totals.pendingActivation || 0}</strong>
          </span>
          <span data-active={waiting > 0 ? "true" : "false"}>
            <small>2. D+{commissionDueDays}</small>
            <strong>{formatCurrency(waiting)}</strong>
          </span>
          <span data-active={due > 0 ? "true" : "false"}>
            <small>3. Liberado</small>
            <strong>{formatCurrency(due)}</strong>
          </span>
          <span data-active={Number(totals.paidAmount || 0) > 0 ? "true" : "false"}>
            <small>4. Pago</small>
            <strong>{formatCurrency(totals.paidAmount || 0)}</strong>
          </span>
        </div>
        {priorityClients.length ? (
          <div className={styles.desktopCommissionQueue}>
            {priorityClients.map((client, index) => (
              <article key={`${client.leadId}:${client.commissionStatus || client.saleStatus || "lead"}:${index}`} data-tone={commissionLifecycleTone(client)}>
                <div>
                  <strong>{client.name || "Cliente sem nome"}</strong>
                  <span>{salePlanLabel(client.salePlanKey)} · {commissionLifecycleLabel(client, commissionDueDays)}</span>
                </div>
                <b>{formatCurrency(client.commissionAmount || 0)}</b>
              </article>
            ))}
          </div>
        ) : null}
        {commissionSummary?.canPayout ? (
          <div className={styles.desktopCommissionPayouts}>
            <div className={styles.desktopCommissionPayoutHeader}>
              <div>
                <strong>Fechamento financeiro</strong>
                <span>{sellerPayoutRows.length ? "Comissões D+ liberadas por vendedor" : "Nada vencido para pagar agora"}</span>
              </div>
              <button
                type="button"
                onClick={() => void createCommissionPayout(null)}
                disabled={!canRegisterPayout || commissionPayoutSaving !== null}
              >
                {commissionPayoutSaving === "all" ? "Registrando..." : "Registrar tudo D+"}
              </button>
            </div>
            {sellerPayoutRows.length ? (
              <div className={styles.desktopCommissionPayoutRows}>
                {sellerPayoutRows.map((seller) => {
                  const key = `seller:${seller.sellerUserId}`;
                  return (
                    <article key={seller.sellerUserId}>
                      <div>
                        <strong>{seller.sellerName || seller.sellerEmail || "Vendedor"}</strong>
                        <span>
                          {seller.duePayableCount || 0} comissão(ões) · {formatPercent(seller.commissionPercent || 0)} · próximo {formatDateTime(seller.nextDueAt)}
                        </span>
                      </div>
                      <b>{formatCurrency(seller.duePayableAmount || 0)}</b>
                      <button
                        type="button"
                        onClick={() => void createCommissionPayout(seller.sellerUserId)}
                        disabled={commissionPayoutSaving !== null}
                      >
                        {commissionPayoutSaving === key ? "..." : "Pagar"}
                      </button>
                    </article>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className={styles.desktopCommissionAudit} aria-label="Auditoria financeira de comissão">
          <span>
            <small>Fechado</small>
            <strong>{formatCurrency(financeAudit?.paidPayoutAmount || 0)}</strong>
          </span>
          <span data-tone="danger">
            <small>Reaberto</small>
            <strong>{formatCurrency(financeAudit?.reopenedAmount || 0)}</strong>
          </span>
          <span>
            <small>Pagamentos</small>
            <strong>{financeAudit?.paidPayoutCount || 0}</strong>
          </span>
          <span data-tone="danger">
            <small>Cancelamentos</small>
            <strong>{financeAudit?.canceledPayoutCount || 0}</strong>
          </span>
          <span>
            <small>Último pago</small>
            <strong>{formatDateTime(financeAudit?.lastPaidAt)}</strong>
          </span>
          <span data-tone="danger">
            <small>Último cancel.</small>
            <strong>{formatDateTime(financeAudit?.lastCanceledAt)}</strong>
          </span>
        </div>
        <div className={styles.desktopCommissionFooter}>
          <span>
            Aguardando: <b>{totals.pendingActivation || 0}</b>
          </span>
          <span>
            Inativados: <b>{totals.inactiveClients || 0}</b>
          </span>
          <span>
            Próximo D+{commissionDueDays}: <b>{formatDateTime(totals.nextDueAt)}</b>
          </span>
          {recentPaid ? (
            <span>
              Último pago: <b>{formatCurrency(recentPaid.totalAmount || 0)}</b>
              <button
                type="button"
                className={styles.desktopCommissionReceiptButton}
                onClick={() => void openCommissionReceipt(recentPaid.id)}
                disabled={commissionReceiptLoadingId === recentPaid.id}
              >
                {commissionReceiptLoadingId === recentPaid.id ? "Abrindo..." : "Comprovante"}
              </button>
            </span>
          ) : null}
        </div>
      </section>
    );
  }

  function renderCommissionReceiptPortal() {
    if (!commissionReceipt || typeof document === "undefined") return null;
    const receipt = commissionReceipt.receipt || null;
    const items = commissionReceipt.items || [];
    const receiptStatus = String(receipt?.status || "").trim().toLowerCase();
    const canCancelReceipt = Boolean(commissionReceipt.canCancel && receipt?.id && receiptStatus !== "canceled");
    const isCancelingReceipt = Boolean(receipt?.id && commissionPayoutCancelingId === receipt.id);
    return createPortal(
      <div className={styles.commissionReceiptBackdrop} onClick={() => setCommissionReceipt(null)}>
        <section
          className={styles.commissionReceiptPanel}
          role="dialog"
          aria-modal="true"
          aria-labelledby="commission-receipt-title"
          onClick={(event) => event.stopPropagation()}
        >
          <header className={styles.commissionReceiptHeader}>
            <div>
              <span>Comprovante interno</span>
              <strong id="commission-receipt-title">{receipt?.code || receipt?.id || "Fechamento HBX"}</strong>
              <p>{receipt?.referenceLabel || "Pagamento de comissão registrado no HBX."}</p>
            </div>
            <button type="button" onClick={() => setCommissionReceipt(null)} aria-label="Fechar comprovante">
              X
            </button>
          </header>

          <div className={styles.commissionReceiptMetrics}>
            <span>
              <small>Total</small>
              <strong>{formatCurrency(receipt?.totalAmount || 0)}</strong>
            </span>
            <span>
              <small>Itens</small>
              <strong>{receipt?.leadCount || items.length}</strong>
            </span>
            <span>
              <small>{receiptStatus === "canceled" ? "Registrado" : "Pago em"}</small>
              <strong>{formatDateTime(receipt?.paidAt || receipt?.createdAt)}</strong>
            </span>
          </div>

          <div className={styles.commissionReceiptMeta}>
            <span>
              <small>Vendedor</small>
              <b>{commissionReceipt.seller?.name || commissionReceipt.seller?.email || "Não identificado"}</b>
            </span>
            <span>
              <small>Registrado por</small>
              <b>{commissionReceipt.createdBy?.name || commissionReceipt.createdBy?.email || "HBX"}</b>
            </span>
          </div>

          {receipt?.notes ? <p className={styles.commissionReceiptNote}>{receipt.notes}</p> : null}

          <div className={styles.commissionReceiptActions}>
            <span data-status={receiptStatus || "paid"}>
              {receiptStatus === "canceled" ? "Fechamento cancelado" : "Fechamento pago"}
            </span>
            {canCancelReceipt ? (
              <button
                type="button"
                className={styles.commissionReceiptCancelButton}
                onClick={() => void cancelCommissionPayout(receipt?.id)}
                disabled={isCancelingReceipt}
              >
                {isCancelingReceipt ? "Cancelando..." : "Cancelar fechamento"}
              </button>
            ) : null}
          </div>

          <div className={styles.commissionReceiptItems}>
            {items.length ? (
              items.map((item) => (
                <article key={`${item.type || "item"}:${item.id}`}>
                  <div>
                    <strong>{item.name || "Cliente sem nome"}</strong>
                    <span>
                      {item.label || "Comissão"} · {salePlanLabel(item.salePlanKey)} · {item.city || item.segment || "Sem região"}
                    </span>
                  </div>
                  <b>{formatCurrency(item.commissionAmount || 0)}</b>
                  <small>{item.cycleKey || item.saleStatusLabel || "Pago"}</small>
                </article>
              ))
            ) : (
              <p className={styles.commissionReceiptNote}>Nenhum item detalhado encontrado para este fechamento.</p>
            )}
          </div>
        </section>
      </div>,
      document.body,
    );
  }

  function renderAssistedSignupPortal() {
    if (!assistedSignupLead) return null;
    const currentLead = leadById.get(assistedSignupLead.id)?.lead || assistedSignupLead;
    const currentDraft = drafts[currentLead.id] || createDraft(currentLead);
    const mobileSaleStatus = normalizeSaleStatus(currentDraft.saleStatus || currentLead.saleStatus);
    const mobileSalePlanKey = normalizeSalePlanKey(assistedSignupDraft.salePlanKey || currentDraft.salePlanKey || currentLead.salePlanKey);
    const saleValueInput = currentDraft.saleValue || salePlanAmountInput(mobileSalePlanKey);
    const mobileSaleValue = parseCurrencyInput(saleValueInput) || salePlanPrice(mobileSalePlanKey);
    const mobileCommissionPercent = leadCommissionPercent(currentLead);
    const mobileCommissionPreview = (mobileSaleValue * mobileCommissionPercent) / 100;
    const isSavingClosing = savingLeadId === currentLead.id;
    const confirmationUrl =
      assistedSignupResult?.delivery?.confirmUrl ||
      assistedSignupResult?.delivery?.previewUrl ||
      "";
    return createPortal(
      <div
        className={`${styles.systemPopupOverlay} ${styles.systemPopupOverlayActive} ${styles.mobileComposerOverlay}`}
        onClick={closeAssistedSignup}
      >
        <div
          className={`${styles.systemPopupFrame} ${styles.mobileComposerSheet} ${styles.assistedSignupPopup}`}
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="assisted-signup-title"
        >
          <div className={styles.systemPopupChrome}>
            <div>
              <strong id="assisted-signup-title">Cadastro de cliente</strong>
            </div>
            <div className={styles.systemPopupActions}>
              <button
                type="button"
                className={`btn btn-secondary btn-sm ${styles.mobileComposerClose}`}
                onClick={closeAssistedSignup}
                aria-label="Fechar cadastro assistido"
                disabled={assistedSignupSaving}
              >
                <span className={styles.mobileComposerCloseGlyph} aria-hidden="true">
                  ×
                </span>
                <span className={styles.mobileComposerCloseText}>Fechar</span>
              </button>
            </div>
          </div>
          <div className={`${styles.systemPopupBody} ${styles.mobileComposerBody}`}>
            <form className={styles.composerForm} onSubmit={submitAssistedSignup}>
              <section className={styles.assistedSignupClosingBlock} aria-label="Fechamento da venda">
                <div className={styles.assistedSignupClosingSummary}>
                  <span>
                    <small>Status</small>
                    <strong>{saleStatusLabel(mobileSaleStatus)}</strong>
                  </span>
                  <span>
                    <small>Comissão</small>
                    <strong>{formatCurrency(mobileCommissionPreview)}</strong>
                  </span>
                </div>
                <div className={styles.assistedSignupClosingActions}>
                  {SALE_CLOSING_ACTIONS.map((action) => (
                    <button
                      type="button"
                      key={action.value}
                      data-tone={action.tone}
                      data-active={mobileSaleStatus === action.value ? "true" : "false"}
                      onClick={() => void saveLeadSaleStatus(currentLead, action.value)}
                      disabled={isSavingClosing}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
                <div className={styles.assistedSignupClosingMeta}>
                  <span>{salePlanLabel(mobileSalePlanKey)}</span>
                  <span>{mobileCommissionPercent > 0 ? `${formatPercent(mobileCommissionPercent)} do vendedor` : "Comissão não definida"}</span>
                  <span>D+{commissionDueDays} úteis</span>
                </div>
              </section>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Empresa/cliente</span>
                <input
                  className={styles.fieldInput}
                  value={assistedSignupDraft.companyName}
                  onChange={(event) =>
                    setAssistedSignupDraft((draft) => ({ ...draft, companyName: event.target.value }))
                  }
                  placeholder="Nome que vai aparecer no HBX"
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Responsável</span>
                <input
                  className={styles.fieldInput}
                  value={assistedSignupDraft.contactName}
                  onChange={(event) =>
                    setAssistedSignupDraft((draft) => ({ ...draft, contactName: event.target.value }))
                  }
                  placeholder="Nome do cliente"
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>E-mail do cliente</span>
                <input
                  className={styles.fieldInput}
                  type="email"
                  value={assistedSignupDraft.email}
                  onChange={(event) =>
                    setAssistedSignupDraft((draft) => ({ ...draft, email: event.target.value }))
                  }
                  placeholder="cliente@email.com"
                  required
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>WhatsApp</span>
                <input
                  className={styles.fieldInput}
                  value={assistedSignupDraft.phone}
                  onChange={(event) =>
                    setAssistedSignupDraft((draft) => ({ ...draft, phone: event.target.value }))
                  }
                  placeholder="Telefone do cliente"
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Plano</span>
                <select
                  className={styles.fieldInput}
                  value={normalizeSalePlanKey(assistedSignupDraft.salePlanKey)}
                  onChange={(event) => {
                    const salePlanKey = normalizeSalePlanKey(event.target.value);
                    setAssistedSignupDraft((draft) => ({
                      ...draft,
                      salePlanKey,
                    }));
                    setLeadDraft(currentLead.id, {
                      salePlanKey,
                      saleValue: salePlanAmountInput(salePlanKey),
                    });
                  }}
                >
                  {SALE_PLAN_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Valor do plano</span>
                <input
                  className={styles.fieldInput}
                  inputMode="decimal"
                  value={saleValueInput}
                  onChange={(event) => setLeadDraft(currentLead.id, { saleValue: event.target.value })}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Senha temporária</span>
                <input
                  className={styles.fieldInput}
                  value={assistedSignupDraft.password}
                  onChange={(event) =>
                    setAssistedSignupDraft((draft) => ({ ...draft, password: event.target.value }))
                  }
                  placeholder="Gerar automaticamente"
                  minLength={8}
                />
              </label>
              <div className={styles.assistedSignupNotice}>
                <strong>Confirmação de e-mail</strong>
                <span>O vendedor pode preencher o cadastro, mas o cliente precisa confirmar o e-mail antes de ativar trial, pagamento ou implantação.</span>
              </div>

              {assistedSignupResult ? (
                <div className={styles.assistedSignupResult}>
                  <div className={styles.assistedSignupCongratsVisual} aria-hidden="true">
                    <svg viewBox="0 0 160 104" focusable="false">
                      <path d="M32 80h96" />
                      <path d="M51 78c0-22 12-38 29-38s29 16 29 38" />
                      <path d="M61 42 80 18l19 24" />
                      <path d="M69 62h22" />
                      <path d="M42 34 29 22" />
                      <path d="M118 34l13-12" />
                      <path d="M36 55 18 52" />
                      <path d="m124 55 18-3" />
                      <circle cx="36" cy="20" r="3" />
                      <circle cx="124" cy="20" r="3" />
                      <circle cx="23" cy="70" r="2.5" />
                      <circle cx="137" cy="70" r="2.5" />
                    </svg>
                    <span>Parabéns!</span>
                  </div>
                  <strong>{assistedSignupResult.message || "Cadastro assistido criado."}</strong>
                  <span>{assistedSignupResult.email || assistedSignupDraft.email}</span>
                  {assistedSignupResult.generatedPassword ? (
                    <span>Senha temporária: {assistedSignupResult.generatedPassword}</span>
                  ) : null}
                  {assistedSignupResult.generatedPassword ? (
                    <button
                      type="button"
                      className={styles.secondaryAction}
                      onClick={() => void navigator.clipboard?.writeText(assistedSignupResult.generatedPassword || "")}
                    >
                      Copiar senha temporária
                    </button>
                  ) : null}
                  {confirmationUrl ? (
                    <button
                      type="button"
                      className={styles.secondaryAction}
                      onClick={() => void navigator.clipboard?.writeText(confirmationUrl)}
                    >
                      Copiar link de confirmação
                    </button>
                  ) : null}
                </div>
              ) : null}

              <div className={`${styles.formFooter} ${styles.mobileComposerActions}`}>
                <button
                  type="submit"
                  className={styles.primaryAction}
                  disabled={assistedSignupSaving}
                >
                  {assistedSignupSaving ? "Criando cadastro..." : "Criar cadastro e enviar confirmação"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  function renderBulkDeleteConfirmationPopup() {
    if (!bulkDeleteConfirmation) return null;

    return (
      <HbxPopup2
        open
        tone="danger"
        title="Excluir cards"
        onClose={bulkDeleting ? undefined : () => setBulkDeleteConfirmation(null)}
        action={
          <>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={bulkDeleting}
              onClick={() => setBulkDeleteConfirmation(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={bulkDeleting}
              onClick={() => void confirmBulkDeleteLeads()}
            >
              {bulkDeleting ? "Excluindo..." : "Excluir"}
            </button>
          </>
        }
      >
        {bulkDeleteConfirmation.message}
      </HbxPopup2>
    );
  }

  function renderMobileReturnSchedulerPortal() {
    if (!mobileReturnScheduler || typeof document === "undefined") return null;

    return createPortal(
      <div className={styles.mobileReturnSchedulerBackdrop}>
        <section
          className={styles.mobileReturnSchedulerDialog}
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-return-scheduler-title"
        >
          <div className={styles.mobileReturnSchedulerHeader}>
            <div>
              <small>Retorno</small>
              <h2 id="mobile-return-scheduler-title">Agendar horário</h2>
              <p>{mobileReturnScheduler.leadName}</p>
            </div>
            <button
              type="button"
              onClick={() => setMobileReturnScheduler(null)}
              aria-label="Fechar calendário de retorno"
            >
              ×
            </button>
          </div>

          <div className={styles.mobileReturnSchedulerFields}>
            <label>
              <span>Data</span>
              <input
                inputMode="numeric"
                value={mobileReturnScheduler.dateText}
                onChange={(event) => updateMobileReturnDateText(event.target.value)}
                placeholder="DD/MM/YY"
                maxLength={10}
              />
            </label>
            <label>
              <span>Horário</span>
              <input
                type="time"
                value={mobileReturnScheduler.timeValue}
                onChange={(event) => {
                  setMobileReturnScheduleError(null);
                  setMobileReturnScheduler((current) =>
                    current ? { ...current, timeValue: event.target.value } : current,
                  );
                }}
              />
            </label>
          </div>

          <div className={styles.mobileReturnCalendarCard}>
            <div className={styles.mobileReturnCalendarHeader}>
              <button type="button" onClick={() => shiftMobileReturnCalendarMonth(-1)} aria-label="Mês anterior">
                ‹
              </button>
              <strong>{mobileReturnMonthLabel}</strong>
              <button type="button" onClick={() => shiftMobileReturnCalendarMonth(1)} aria-label="Próximo mês">
                ›
              </button>
            </div>
            <div className={styles.mobileReturnWeekdays} aria-hidden="true">
              {["D", "S", "T", "Q", "Q", "S", "S"].map((label, index) => (
                <span key={`${label}-${index}`}>{label}</span>
              ))}
            </div>
            <div className={styles.mobileReturnCalendarGrid}>
              {mobileReturnCalendarDays.map((day) => (
                day.day ? (
                  <button
                    type="button"
                    key={day.key}
                    data-selected={day.key === mobileReturnDateKey ? "true" : "false"}
                    onClick={() => selectMobileReturnCalendarDay(day.key)}
                  >
                    {day.day}
                  </button>
                ) : (
                  <span key={day.key} aria-hidden="true" />
                )
              ))}
            </div>
          </div>

          {mobileReturnScheduleError ? (
            <p className={styles.mobileReturnSchedulerError}>{mobileReturnScheduleError}</p>
          ) : (
            <p className={styles.mobileReturnSchedulerHint}>
              O card entra na agenda exatamente na data e no horário escolhidos.
            </p>
          )}

          <button
            type="button"
            className={styles.mobileReturnSchedulerSave}
            onClick={() => void saveMobileReturnSchedule()}
            disabled={savingLeadId === mobileReturnScheduler.leadId}
          >
            {savingLeadId === mobileReturnScheduler.leadId ? "Salvando..." : "Salvar retorno"}
          </button>
        </section>
      </div>,
      document.body,
    );
  }

  function renderAccountSheetPortal() {
    if (!accountSheetOpen || typeof document === "undefined") return null;

    return createPortal(
      <div
        className={styles.mobileVendasSheetBackdrop}
        onClick={() => setAccountSheetOpen(false)}
      >
        <section
          className={`${styles.mobileVendasNoteSheet} ${styles.mobileVendasAccountSheet}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-vendas-account-title"
          onClick={(event) => event.stopPropagation()}
        >
          <span className={styles.mobileVendasSheetHandle} aria-hidden="true" />
          <div className={styles.mobileVendasSheetHeader}>
            <h2 id="mobile-vendas-account-title">Conta</h2>
            <button type="button" onClick={() => setAccountSheetOpen(false)} aria-label="Fechar">
              ×
            </button>
          </div>
          <div className={styles.mobileVendasAccountAvatar} aria-hidden="true">
            {(accountProfile?.email || "?").slice(0, 1).toUpperCase()}
          </div>
          <label className={styles.mobileVendasAccountField}>
            <span>Como quer ser chamado</span>
            <input
              value={accountNameDraft}
              onChange={(event) => setAccountNameDraft(event.target.value)}
              placeholder="Ex.: Ana"
              maxLength={80}
            />
          </label>
          <button
            type="button"
            className={`${styles.mobileVendasAccountSave} hbx-mobile-primary-button`}
            onClick={() => {
              const trimmed = accountNameDraft.trim();
              saveMobilePreferredCallerName(trimmed);
              setMobilePreferredCallerName(trimmed);
              setAccountSheetOpen(false);
              if (trimmed) setFeedback("Preferência salva.");
            }}
          >
            Salvar
          </button>
          <div className={styles.mobileVendasAccountBlock}>
            <strong>Financeiro</strong>
            <p>
              {accountProfileLoading
                ? "Carregando..."
                : accountProfile?.company
                  ? [
                      accountProfile.company.subscriptionStatus &&
                        `Plano: ${accountProfile.company.subscriptionStatus}`,
                      accountProfile.company.paymentStatus &&
                        `Pagamento: ${accountProfile.company.paymentStatus}`,
                      accountProfile.company.premiumAccess ? "Premium ativo" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Sem dados de cobrança nesta sessão."
                  : "Não foi possível carregar agora."}
            </p>
          </div>
          <div className={styles.mobileVendasAccountBlock}>
            <strong>Configurações</strong>
            <p>Ajuste seu perfil de venda, público ideal e filtros de qualidade.</p>
          </div>
          {renderAccountSalesProfileSettings()}
          <div className={styles.mobileVendasAccountActions}>
            <Link className="hbx-mobile-secondary-button" href={toMobileRoute("/boasvindas")} onClick={() => setAccountSheetOpen(false)}>
              Upgrade
            </Link>
            <Link className="hbx-mobile-primary-button" href={toMobileRoute("/tutorial")} onClick={() => setAccountSheetOpen(false)}>
              Tutorial
            </Link>
          </div>
        </section>
      </div>,
      document.body,
    );
  }

  if (mobileRoute) {
    return (
      <DashboardScaffold title="Vendas" hideHeader={true}>
        <style dangerouslySetInnerHTML={{ __html: vendasDragTopbarLockStyle }} />
        {renderMobileVendas()}
        {renderMobileReturnSchedulerPortal()}
        {renderAccountSheetPortal()}
        {renderAssistedSignupPortal()}
        {renderCommissionReceiptPortal()}
        {renderMasterNoticeCenter(false)}
        {renderBulkDeleteConfirmationPopup()}
      </DashboardScaffold>
    );
  }

  return (
    <DashboardScaffold title="Vendas" hideHeader={true}>
      <style dangerouslySetInnerHTML={{ __html: vendasDragTopbarLockStyle }} />
      {renderBulkDeleteConfirmationPopup()}
      <div className={styles.desktopVendasShell}>
        <DndContext
          sensors={sensors}
          collisionDetection={detectDateFilterCollision}
          onDragStart={handleDragStart}
          onDragCancel={handleDragCancel}
          onDragEnd={(event) => void handleDragEnd(event)}
        >
        <div className={styles.premiumBackdrop}>
          <div className={styles.premiumBg} />
          <div className={styles.page}>
            <div className={styles.desktopVendasTabRow}>
              <div className="hbx-guide1-slot">
                <HbxGuide1
                  tabs={desktopTabs}
                  activeKey={desktopVendasTab}
                  ariaLabel="Guias de Vendas"
                  onChange={setDesktopVendasTab}
                />
              </div>
              <Link
                href="/atendimento?atendimentoQueue=scheduled&atendimentoSection=agenda&agendaStudio=1&agendaMode=sales&returnTo=%2Fvendas"
                prefetch={false}
                className={`${styles.secondaryAction} ${styles.desktopAgendaAction}`}
              >
                Agenda Vendas
              </Link>
            </div>

            <div key={desktopVendasTab} className="hbx-page-mobile-enter">
              {desktopVendasTab === "clientes" ? (
                <>
                <section className={styles.filterRail}>
                  <div className={`${styles.filterRailCarousel} hbx-guide5`}>
                    <button
                      type="button"
                      className={`${styles.dateRailScrollButton} hbx-guide5__button`}
                      data-side="left"
                      onClick={() => scrollDateRail(-1)}
                      aria-label="Rolar datas para esquerda"
                    >
                      <span aria-hidden="true">‹</span>
                    </button>
                    <div
                      className={`${styles.filterRailScroller} hbx-guide5__scroller`}
                      ref={filterScrollerRef}
                    >
                      {dateFilters.map((item) => (
                        <DateDropSlot
                          key={item.key}
                          item={item}
                          active={selectedDateKey === item.key}
                          pulse={pulseDateKey === item.key}
                          dragging={Boolean(activeDragLeadId || activeDragDateKey)}
                          ignoreClick={() =>
                            performance.now() - lastDragEndedAtRef.current < 70
                          }
                          onDateShortcut={() => void handleActiveDateShortcut()}
                          onSelect={() => setSelectedDateKey(item.key)}
                          register={(node) => registerDateFilterRef(item.key, node)}
                        />
                      ))}

                      <button
                        type="button"
                        className={`${styles.dateFilterCard} ${styles.addAgendaButton} hbx-guide5__item`}
                        aria-label="+Agenda"
                        title="+Agenda"
                        onClick={() => {
                          router.push("/atendimento?atendimentoQueue=scheduled&atendimentoSection=agenda&agendaStudio=1&agendaMode=sales&returnTo=%2Fvendas");
                        }}
                      >
                        <span className={styles.dateFilterDay} />
                        <strong>+</strong>
                        <span />
                        <b />
                        <span className={styles.receiveHint} />
                      </button>
                    </div>
                    <button
                      type="button"
                      className={`${styles.dateRailScrollButton} hbx-guide5__button`}
                      data-side="right"
                      onClick={() => scrollDateRail(1)}
                      aria-label="Rolar datas para direita"
                    >
                      <span aria-hidden="true">›</span>
                    </button>
                  </div>
                </section>

                {loading ? (
                  <section className={styles.loadingCard}>
                    <div className={styles.skeletonBoard} />
                  </section>
                ) : (
                  <div
                    className={styles.stageGrid}
                    data-detail-open={selectedLead ? "true" : "false"}
                  >
                    <div className={`${styles.stageSideGuide} hbx-guide4-slot`}>
                      <HbxGuide4
                        ariaLabel="Ações de Vendas"
                        topItems={desktopGuide4TopItems}
                        navItems={desktopGuide4NavItems}
                        bottomItems={desktopGuide4BottomItems}
                      />
                    </div>
                    <div className={styles.stageMain}>{renderPipelineBoard()}</div>
                    <div className={styles.stageAside}>{renderDetailPanel()}</div>
                  </div>
                )}

                {showClosed ? (
                  <section
                    ref={archiveRef}
                    tabIndex={-1}
                    className={styles.archiveSection}
                    aria-labelledby="archive-heading"
                  >
                    <div className={styles.sectionTopline}>
                      <div id="archive-heading">
                        <span className={styles.panelEyebrow}>Arquivo</span>
                        <strong>Encerrados</strong>
                      </div>
                      <button
                        type="button"
                        className={styles.secondaryAction}
                        onClick={() => setShowClosed(false)}
                      >
                        Ocultar arquivo
                      </button>
                    </div>
                    {closedLeads.length ? (
                      <div className={styles.cardsGrid}>
                        {closedLeads.map((lead) => renderLeadCard(lead, "closed"))}
                      </div>
                    ) : (
                      <div className={styles.emptyPanel}>
                        <strong>Nenhum encerrado ainda</strong>
                        <p>Os cards arquivados aparecem aqui.</p>
                      </div>
                    )}
                  </section>
                ) : null}
                </>
              ) : null}

              {desktopAdminMenusEnabled && desktopVendasTab === "comissao" ? renderDesktopCommissionPanel() : null}
              {desktopAdminMenusEnabled && desktopVendasTab === "atencao" ? renderCrmIntegrityPanel("desktop") : null}
              {desktopAdminMenusEnabled && desktopVendasTab === "esteira" ? renderHbxClosingPipelinePanel("desktop") : null}
              {desktopAdminMenusEnabled && desktopVendasTab === "vendedores" ? renderSellerAuditPanel("desktop") : null}
            </div>
          </div>
        </div>

        <DragOverlay dropAnimation={null} modifiers={[liftDesktopDragOverlay]}>
          {activeDragLead && activeDragDraft ? (
            <div className={styles.dragOverlayCard} style={dragOverlayStyle}>
              <LeadCardView
                lead={activeDragLead}
                draft={activeDragDraft}
                blockKey={activeDragRecord?.block || "today"}
                selected={false}
                saving={false}
                onFocus={() => focusLead(activeDragLead.id)}
                onQuickAction={(action) =>
                  void runQuickAction(activeDragLead, action)
                }
                onInboxAction={(targetLead) =>
                  void handleLeadInboxAction(targetLead)
                }
              />
            </div>
          ) : activeDragDateItem ? (
            <div
              className={`${styles.dragOverlayCard} ${styles.dragOverlayDateCard}`}
            >
              <div
                className={`${styles.dateFilterCard} hbx-guide5__item`}
                style={{ pointerEvents: "none" }}
              >
                <span className={styles.dateFilterDay}>
                  {activeDragDateItem.dayLabel}
                </span>
                <strong>{activeDragDateItem.title}</strong>
                <span>{activeDragDateItem.subtitle}</span>
                <b>{activeDragDateItem.count}</b>
                <span className={styles.receiveHint}>Mover todos</span>
              </div>
            </div>
          ) : null}
        </DragOverlay>

        {flyAnimation ? (
          <div className={styles.flyCard} style={flyStyle}>
            <LeadCardView
              lead={flyAnimation.lead}
              draft={flyAnimation.draft}
              blockKey={flyAnimation.blockKey}
              selected={false}
              saving={false}
              onFocus={() => {}}
              onQuickAction={() => {}}
              onInboxAction={() => {}}
            />
          </div>
        ) : null}
        </DndContext>
        </div>

      {composerOpen ? createPortal(
        <div
          className={`${styles.systemPopupOverlay} ${styles.systemPopupOverlayActive} ${styles.mobileComposerOverlay}`}
          onClick={() => setComposerOpen(false)}
        >
          <div
            className={`${styles.systemPopupFrame} ${styles.mobileComposerSheet}`}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-lead-title"
          >
            <div className={styles.systemPopupChrome}>
              <div>
                <p className={styles.systemPopupEyebrow}>Vendas</p>
                <strong id="new-lead-title">Novo lead</strong>
              </div>
              <div className={styles.systemPopupActions}>
                <span className={styles.metaBadge}>Cadastro rápido</span>
                <button
                  type="button"
                  className={`btn btn-secondary btn-sm ${styles.mobileComposerClose}`}
                  onClick={() => setComposerOpen(false)}
                  aria-label="Fechar cadastro de lead"
                >
                  <span className={styles.mobileComposerCloseGlyph} aria-hidden="true">
                    ×
                  </span>
                  <span className={styles.mobileComposerCloseText}>Fechar</span>
                </button>
              </div>
            </div>
            <div className={`${styles.systemPopupBody} ${styles.mobileComposerBody}`}>
              <form
                className={styles.composerForm}
                onSubmit={handleCreateManual}
              >
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Nome</span>
                  <input
                    className={styles.fieldInput}
                    value={manualLead.name}
                    onChange={(event) =>
                      setManualLead((prev) => ({
                        ...prev,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Ex: Clínica Horizonte"
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Telefone</span>
                  <input
                    className={styles.fieldInput}
                    value={manualLead.phone}
                    onChange={(event) =>
                      setManualLead((prev) => ({
                        ...prev,
                        phone: event.target.value,
                      }))
                    }
                    placeholder="Ex: (11) 99999-0000"
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>E-mail</span>
                  <input
                    className={styles.fieldInput}
                    value={manualLead.email}
                    onChange={(event) =>
                      setManualLead((prev) => ({
                        ...prev,
                        email: event.target.value,
                      }))
                    }
                    placeholder="Opcional"
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Retorno</span>
                  <input
                    className={styles.fieldInput}
                    type="datetime-local"
                    value={manualLead.returnAt}
                    onChange={(event) =>
                      setManualLead((prev) => ({
                        ...prev,
                        returnAt: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className={styles.fieldWide}>
                  <span className={styles.fieldLabel}>Próxima ação</span>
                  <input
                    className={styles.fieldInput}
                    value={manualLead.nextAction}
                    onChange={(event) =>
                      setManualLead((prev) => ({
                        ...prev,
                        nextAction: event.target.value,
                      }))
                    }
                    placeholder="Ex: Primeiro contato"
                  />
                </label>
                <label className={styles.fieldWide}>
                  <span className={styles.fieldLabel}>Observação</span>
                  <textarea
                    className={styles.fieldTextarea}
                    rows={4}
                    value={manualLead.shortNote}
                    onChange={(event) =>
                      setManualLead((prev) => ({
                        ...prev,
                        shortNote: event.target.value,
                      }))
                    }
                    placeholder="Contexto rápido do lead."
                  />
                </label>
                <div className={`${styles.formFooter} ${styles.mobileComposerActions}`}>
                  <button
                    type="submit"
                    className={styles.primaryAction}
                    disabled={creatingManual}
                  >
                    {creatingManual ? "Criando..." : "Criar lead"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}

      {renderAssistedSignupPortal()}
      {renderCommissionReceiptPortal()}

      {renderAccountSheetPortal()}

      {commandOpen ? (
        <div
          className="ui-popup-backdrop"
          onClick={() => setCommandOpen(false)}
        >
          <div
            className={styles.commandPalette}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.sectionTopline}>
              <div>
                <span className={styles.panelEyebrow}>Command palette</span>
                <strong>Buscar lead, cidade, ação, histórico ou origem</strong>
              </div>
              <button
                type="button"
                className={styles.secondaryAction}
                onClick={() => setCommandOpen(false)}
              >
                Fechar
              </button>
            </div>
            <input
              className={styles.commandInput}
              placeholder="Digite nome, telefone, cidade, origem ou próxima ação..."
              value={commandQuery}
              onChange={(event) => setCommandQuery(event.target.value)}
              autoFocus
            />
            <div className={styles.commandList}>
              {commandResults.length ? (
                commandResults.map(({ lead, block }) => {
                  const whatsappHref = leadWhatsappHref(lead);
                  return (
                    <article
                      key={`command-${lead.id}`}
                      className={styles.commandRow}
                    >
                      <button
                        type="button"
                        className={styles.commandMain}
                        onClick={() => focusLead(lead.id)}
                      >
                        <strong>{lead.name || "Lead sem nome"}</strong>
                        <span>
                          {BLOCK_LABELS[block]} • {lead.statusLabel} •{" "}
                          {lead.nextAction || "Sem próxima ação"}
                        </span>
                      </button>
                      <div className={styles.commandActionRow}>
                        <a
                          className={styles.secondaryAction}
                          href={buildCallUrl(lead.phone) || undefined}
                        >
                          Ligar
                        </a>
                        <a
                          className={styles.secondaryAction}
                          href={whatsappHref || undefined}
                          target="_blank"
                          rel="noreferrer"
                          aria-disabled={!whatsappHref}
                          onClick={(event) => {
                            if (!whatsappHref) event.preventDefault();
                          }}
                        >
                          WhatsApp
                        </a>
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className={styles.emptyPanel}>
                  <strong>Nenhum resultado</strong>
                  <p>Tente nome, telefone, cidade, status ou próxima ação.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
      {conversationSnapshot || conversationSnapshotLoading || conversationSnapshotError ? (
        <div
          className="ui-popup-backdrop"
          onClick={() => {
            setConversationSnapshot(null);
            setConversationSnapshotError(null);
            setConversationSnapshotLoading(false);
          }}
        >
          <div
            className={styles.conversationSnapshotModal}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.sectionTopline}>
              <div>
                <span className={styles.panelEyebrow}>Conversa vinculada</span>
                <strong>{conversationSnapshot?.event.title || "Resposta negativa"}</strong>
              </div>
              <button
                type="button"
                className={styles.secondaryAction}
                onClick={() => {
                  setConversationSnapshot(null);
                  setConversationSnapshotError(null);
                  setConversationSnapshotLoading(false);
                }}
              >
                Fechar
              </button>
            </div>
            {conversationSnapshotLoading ? (
              <div className={styles.emptyPanel}>
                <strong>Carregando conversa</strong>
                <p>Buscando a janela da mensagem negativa.</p>
              </div>
            ) : conversationSnapshotError ? (
              <div className={styles.emptyPanel}>
                <strong>Não foi possível abrir</strong>
                <p>{conversationSnapshotError}</p>
              </div>
            ) : conversationSnapshot ? (
              <>
                <div className={styles.conversationSnapshotSummary}>
                  <span>{conversationSnapshot.conversation.contact || "Contato sem telefone"}</span>
                  <span>{conversationSnapshot.event.detectedText || "Mensagem negativa registrada"}</span>
                </div>
                <div className={styles.conversationSnapshotMessages}>
                  {conversationSnapshot.messages.length ? (
                    conversationSnapshot.messages.map((message) => (
                      <article
                        key={message.id}
                        className={styles.conversationSnapshotMessage}
                        data-direction={String(message.direction || "").toUpperCase() === "OUTBOUND" ? "outbound" : "inbound"}
                        data-anchor={message.isAnchor ? "true" : "false"}
                      >
                        <div>
                          <strong>{String(message.direction || "").toUpperCase() === "OUTBOUND" ? "HBX" : "Cliente"}</strong>
                          <span>{message.timestamp ? formatDateTime(message.timestamp) : ""}</span>
                        </div>
                        <p>{message.body || "Mensagem sem texto."}</p>
                      </article>
                    ))
                  ) : (
                    <div className={styles.emptyPanel}>
                      <strong>Sem mensagens salvas</strong>
                      <p>A referência existe, mas não há mensagens locais para exibir.</p>
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
      {renderMasterNoticeCenter(false)}
    </DashboardScaffold>
  );
}
