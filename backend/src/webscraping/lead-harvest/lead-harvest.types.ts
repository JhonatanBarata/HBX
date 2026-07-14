export type HarvestSourceMode = 'production' | 'local_lab' | 'imported_lab';

export type HarvestSourceRisk = 'official' | 'experimental';

export type LeadHarvestEmailStatus = 'public_found' | 'found_on_site' | 'probable' | 'missing' | 'invalid';

export type EmailHarvestStatus = 'public_found' | 'probable' | 'invalid' | 'blocked_domain';

export type HarvestEvidence = Record<string, any>;

export type LeadHarvestCandidate = {
  externalId: string;
  batchId?: string;
  placeId?: string | null;
  name: string;
  city?: string | null;
  state?: string | null;
  segment?: string | null;
  website?: string | null;
  phone?: string | null;
  phone2?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  emailStatus?: LeadHarvestEmailStatus;
  emailConfidence?: number;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  sourceUrl: string;
  sourceProvider: string;
  sourceMode: HarvestSourceMode;
  sourceRisk?: HarvestSourceRisk;
  evidence?: HarvestEvidence;
  raw?: HarvestEvidence;
};

export type EmailHarvestCandidate = {
  externalId: string;
  batchId?: string;
  placeId?: string | null;
  email: string;
  domain?: string | null;
  companyName?: string | null;
  city?: string | null;
  state?: string | null;
  segment?: string | null;
  website?: string | null;
  sourceUrl: string;
  confidence: number;
  status: EmailHarvestStatus;
  provider: string;
  sourceMode: HarvestSourceMode;
  evidence?: HarvestEvidence;
};

export type HarvestImportBatch = {
  batchId: string;
  sourceMode: HarvestSourceMode;
  sourceName: string;
  createdAt: string;
  requestedBy?: string | null;
  city?: string | null;
  state?: string | null;
  segment?: string | null;
  targetEmails?: number | null;
  providers: string[];
  leads: LeadHarvestCandidate[];
  emails: EmailHarvestCandidate[];
  stats?: Record<string, number>;
};

export type HarvestImportResult = {
  batchId: string;
  accepted: number;
  rejected: number;
  duplicates: number;
  negatives: number;
  optOuts: number;
  importedLeadIds: string[];
  rejectedItems: Array<{
    externalId: string;
    reason: string;
  }>;
};

export type HarvestValidationCode =
  | 'blocked_domain'
  | 'invalid_email'
  | 'invalid_source_mode'
  | 'missing_batch_id'
  | 'missing_email'
  | 'missing_evidence'
  | 'missing_external_id'
  | 'missing_name'
  | 'missing_provider'
  | 'missing_source_name'
  | 'missing_source_url';

export type HarvestValidationIssue = {
  code: HarvestValidationCode;
  message: string;
  field?: string;
  externalId?: string | null;
};

export type HarvestNormalizationResult<T> =
  | {
      ok: true;
      value: T;
      warnings: HarvestValidationIssue[];
    }
  | {
      ok: false;
      errors: HarvestValidationIssue[];
      value?: Partial<T>;
    };

export type LeadHarvestNormalizeOptions = {
  batchId?: string | null;
  sourceMode?: HarvestSourceMode | string | null;
  persistedImport?: boolean;
};
