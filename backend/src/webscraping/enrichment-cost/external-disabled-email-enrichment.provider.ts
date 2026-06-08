import { Injectable } from '@nestjs/common';
import type { EmailEnrichmentProvider, EmailProviderResult } from './enrichment-cost.types';

@Injectable()
export class ExternalDisabledEmailEnrichmentProvider implements EmailEnrichmentProvider {
  async verify(email: string): Promise<EmailProviderResult> {
    return this.disabledResult({ email, source: 'verify' });
  }

  async domainSearch(domain: string): Promise<EmailProviderResult[]> {
    return [this.disabledResult({ domain, source: 'domain_search' })];
  }

  async findByCompanyDomain(companyName: string, domain: string): Promise<EmailProviderResult[]> {
    return [this.disabledResult({ domain, source: 'company_domain', metadata: { companyName } })];
  }

  private disabledResult(input: {
    email?: string | null;
    domain?: string | null;
    source: string;
    metadata?: Record<string, any>;
  }): EmailProviderResult {
    return {
      email: input.email || null,
      domain: input.domain || null,
      status: 'disabled',
      confidence: 0,
      provider: 'external_disabled',
      source: input.source,
      reason: 'external_email_provider_disabled',
      metadata: input.metadata || {},
    };
  }
}
