import { Injectable } from '@nestjs/common';
import type { NormalizedSearchInput, SearchExecutionContext } from '../shared/radar-types';
import type { RadarSocialLookupHost, RadarSocialLookupJob } from './radar-social-types';

@Injectable()
export class RadarSocialJobService {
  buildJob(input: {
    context: SearchExecutionContext;
    leadId: string;
    normalizedInput: NormalizedSearchInput;
    engineUrl?: string | null;
    host: RadarSocialLookupHost;
  }): RadarSocialLookupJob | null {
    const leadId = String(input.leadId || '').trim();
    if (!leadId || input.normalizedInput.targetType !== 'pj') return null;
    return {
      context: input.context,
      leadId,
      input: input.normalizedInput,
      engineUrl: input.engineUrl || null,
      host: input.host,
    };
  }

  key(leadId: string) {
    return String(leadId || '').trim();
  }
}
