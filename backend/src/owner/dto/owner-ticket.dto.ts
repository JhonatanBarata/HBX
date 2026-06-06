export class CreateOwnerTicketDto {
  externalId?: string;
  companyId?: number | string;
  companySlug?: string;
  conversationId?: number | string;
  source?: string;
  origin?: string;
  originChannel?: string;
  branch?: string;
  category?: string;
  classification?: string;
  status?: string;
  priority?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  title?: string;
  description?: string;
  message?: string;
  lastCustomerMessage?: string;
  metadata?: unknown;
}

export class UpdateOwnerTicketDispatchDto {
  codexDispatchStatus?: string;
  codexRunId?: string;
  codexRunUrl?: string;
  githubIssueUrl?: string;
  githubPrNumber?: number | string;
  githubBranch?: string;
  status?: string;
  note?: string;
}
