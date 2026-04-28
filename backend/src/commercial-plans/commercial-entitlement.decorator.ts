import { SetMetadata } from '@nestjs/common';
import type { CommercialEntitlementKey } from './commercial-plan-catalog';

export const COMMERCIAL_ENTITLEMENT_KEY = 'commercial_entitlement';

export const CommercialEntitlement = (...entitlements: CommercialEntitlementKey[]) =>
  SetMetadata(COMMERCIAL_ENTITLEMENT_KEY, entitlements);
