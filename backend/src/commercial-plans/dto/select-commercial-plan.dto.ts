import { IsIn } from 'class-validator';
import { COMMERCIAL_PLAN_KEYS, type CommercialPlanKey } from '../commercial-plan-catalog';

export class SelectCommercialPlanDto {
  @IsIn([COMMERCIAL_PLAN_KEYS.VENDAS, COMMERCIAL_PLAN_KEYS.VENDAS_IA, COMMERCIAL_PLAN_KEYS.RECOVERY])
  planKey!: CommercialPlanKey;
}
