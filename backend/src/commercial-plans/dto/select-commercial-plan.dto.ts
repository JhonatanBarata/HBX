import { IsIn } from 'class-validator';
import { COMMERCIAL_PLAN_KEYS, type CommercialPlanKey } from '../commercial-plan-catalog';

export class SelectCommercialPlanDto {
  @IsIn([COMMERCIAL_PLAN_KEYS.LITE, COMMERCIAL_PLAN_KEYS.PADRAO, COMMERCIAL_PLAN_KEYS.MELHOR])
  planKey!: CommercialPlanKey;
}
