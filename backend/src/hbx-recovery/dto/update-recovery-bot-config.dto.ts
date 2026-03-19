import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsOptional, IsString, ValidateNested } from 'class-validator';

class UpdateRecoveryBotTopicDto {
  @IsString()
  id!: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;
}

class UpdateRecoveryStartTemplateDto {
  @IsString()
  @IsOptional()
  id?: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  language?: string;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}

class UpdateRecoveryBotButtonDto {
  @IsString()
  actionId!: string;

  @IsString()
  title!: string;
}

class UpdateRecoveryBotVariableDto {
  @IsString()
  key!: string;

  @IsString()
  @IsOptional()
  label?: string;

  @IsString()
  @IsOptional()
  example?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  scope?: string;

  @IsBoolean()
  @IsOptional()
  required?: boolean;
}

class UpdateRecoveryBotActionGuideDto {
  @IsString()
  actionId!: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  route?: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsString()
  @IsOptional()
  responseMessage?: string;

  @IsBoolean()
  @IsOptional()
  custom?: boolean;
}

class UpdateRecoveryRoutingRulesDto {
  @IsBoolean()
  @IsOptional()
  preferRecoveryForDebtors?: boolean;

  @IsBoolean()
  @IsOptional()
  preferRecoveryForNegotiations?: boolean;

  @IsBoolean()
  @IsOptional()
  preferInboxForManualQueue?: boolean;
}

export class UpdateRecoveryBotConfigDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateRecoveryBotVariableDto)
  @IsOptional()
  variableCatalog?: UpdateRecoveryBotVariableDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateRecoveryBotActionGuideDto)
  @IsOptional()
  actionCatalog?: UpdateRecoveryBotActionGuideDto[];

  @ValidateNested()
  @Type(() => UpdateRecoveryRoutingRulesDto)
  @IsOptional()
  routingRules?: UpdateRecoveryRoutingRulesDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateRecoveryStartTemplateDto)
  @IsOptional()
  startTemplates?: UpdateRecoveryStartTemplateDto[];

  @IsString()
  @IsOptional()
  rootFooter?: string;

  @IsString()
  @IsOptional()
  mainMenuPrompt?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateRecoveryBotButtonDto)
  @IsOptional()
  mainMenuButtons?: UpdateRecoveryBotButtonDto[];

  @IsString()
  @IsOptional()
  declineMenuPrompt?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateRecoveryBotButtonDto)
  @IsOptional()
  declineMenuButtons?: UpdateRecoveryBotButtonDto[];

  @IsString()
  @IsOptional()
  followupPrompt?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateRecoveryBotButtonDto)
  @IsOptional()
  followupButtons?: UpdateRecoveryBotButtonDto[];

  @IsString()
  @IsOptional()
  valueMessageTemplate?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateRecoveryBotButtonDto)
  @IsOptional()
  valueButtons?: UpdateRecoveryBotButtonDto[];

  @IsString()
  @IsOptional()
  installmentsPrompt?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateRecoveryBotButtonDto)
  @IsOptional()
  installmentButtons?: UpdateRecoveryBotButtonDto[];

  @IsString()
  @IsOptional()
  installmentConfirmTemplate?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateRecoveryBotButtonDto)
  @IsOptional()
  installmentConfirmButtons?: UpdateRecoveryBotButtonDto[];

  @IsString()
  @IsOptional()
  cashLinkMessageTemplate?: string;

  @IsString()
  @IsOptional()
  installmentLinkMessageTemplate?: string;

  @IsString()
  @IsOptional()
  postLinkPrompt?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateRecoveryBotButtonDto)
  @IsOptional()
  postLinkButtons?: UpdateRecoveryBotButtonDto[];

  @IsString()
  @IsOptional()
  closeTopicMessage?: string;

  @IsString()
  @IsOptional()
  paidClaimMessage?: string;

  @IsString()
  @IsOptional()
  humanAckMessage?: string;

  // Legacy fields accepted for backward compatibility
  @IsString()
  @IsOptional()
  initialTemplateName?: string;

  @IsString()
  @IsOptional()
  initialTemplateLanguage?: string;

  @IsString()
  @IsOptional()
  rootPrompt?: string;

  @IsString()
  @IsOptional()
  optionPixLabel?: string;

  @IsString()
  @IsOptional()
  optionCardLabel?: string;

  @IsString()
  @IsOptional()
  optionAgentLabel?: string;

  @IsString()
  @IsOptional()
  topicsPrompt?: string;

  @IsString()
  @IsOptional()
  topicsButtonLabel?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateRecoveryBotTopicDto)
  @IsOptional()
  topics?: UpdateRecoveryBotTopicDto[];
}
