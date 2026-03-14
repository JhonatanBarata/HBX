import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min, MinLength, ValidateNested } from 'class-validator';

export enum AutoReplyMatchTypeDto {
  EXACT = 'EXACT',
  CONTAINS = 'CONTAINS',
}

export class AutoReplyResponseDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  order: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  delaySeconds?: number;

  @IsString()
  @IsNotEmpty()
  template: string;
}

export class CreateAutoReplyRuleDto {
  @IsEnum(AutoReplyMatchTypeDto)
  matchType: AutoReplyMatchTypeDto;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  pattern: string;

  @IsOptional()
  @IsBoolean()
  caseInsensitive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ValidateNested({ each: true })
  @Type(() => AutoReplyResponseDto)
  responses: AutoReplyResponseDto[];
}

export class UpdateAutoReplyRuleDto {
  @IsOptional()
  @IsEnum(AutoReplyMatchTypeDto)
  matchType?: AutoReplyMatchTypeDto;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  pattern?: string;

  @IsOptional()
  @IsBoolean()
  caseInsensitive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => AutoReplyResponseDto)
  responses?: AutoReplyResponseDto[];
}
