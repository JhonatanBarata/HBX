import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsString } from 'class-validator';

export class UpdateRecoveryCustomerAutomationDto {
  @Type(() => Boolean)
  @IsBoolean()
  enabled!: boolean;
}

export class UpdateRecoveryCustomersAutomationBatchDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsString({ each: true })
  customerIds!: string[];

  @Type(() => Boolean)
  @IsBoolean()
  enabled!: boolean;
}
