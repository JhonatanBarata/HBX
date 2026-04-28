import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsNumber, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';

class UpdateAtendimentoBotButtonDto {
  @IsString()
  @IsOptional()
  buttonId?: string;

  @IsString()
  actionId!: string;

  @IsString()
  title!: string;

  @IsString()
  @IsOptional()
  nextNodeId?: string;
}

class UpdateAtendimentoBotVariableDto {
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

class UpdateAtendimentoBotActionGuideDto {
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

  @IsString()
  @IsOptional()
  kind?: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsString()
  @IsOptional()
  responseMessage?: string;

  @IsString()
  @IsOptional()
  agendaGroupId?: string;

  @IsBoolean()
  @IsOptional()
  custom?: boolean;
}

class UpdateAtendimentoRoutingRulesDto {
  @IsBoolean()
  @IsOptional()
  globalBotEnabled?: boolean;

  @IsBoolean()
  @IsOptional()
  checkRecoveryBeforeReply?: boolean;

  @IsBoolean()
  @IsOptional()
  autoRouteDebtorsToRecovery?: boolean;

  @IsBoolean()
  @IsOptional()
  autoReopenClosedConversation?: boolean;

  @IsBoolean()
  @IsOptional()
  notifyOnNewInbound?: boolean;
}

class UpdateAtendimentoSmartGreetingDto {
  @IsString()
  @IsOptional()
  timezone?: string;

  @IsString()
  @IsOptional()
  morning?: string;

  @IsString()
  @IsOptional()
  afternoon?: string;

  @IsString()
  @IsOptional()
  night?: string;

  @IsNumber()
  @IsOptional()
  morningStartHour?: number;

  @IsNumber()
  @IsOptional()
  afternoonStartHour?: number;

  @IsNumber()
  @IsOptional()
  nightStartHour?: number;
}

class UpdateAtendimentoSmartVariablesDto {
  @ValidateNested()
  @Type(() => UpdateAtendimentoSmartGreetingDto)
  @IsOptional()
  greeting?: UpdateAtendimentoSmartGreetingDto;
}

class UpdateAtendimentoSceneRuleDto {
  @IsString()
  sceneId!: string;

  @IsString()
  conditionType!: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class UpdateAtendimentoBotConfigDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateAtendimentoBotVariableDto)
  @IsOptional()
  variableCatalog?: UpdateAtendimentoBotVariableDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateAtendimentoBotActionGuideDto)
  @IsOptional()
  actionCatalog?: UpdateAtendimentoBotActionGuideDto[];

  @ValidateNested()
  @Type(() => UpdateAtendimentoRoutingRulesDto)
  @IsOptional()
  routingRules?: UpdateAtendimentoRoutingRulesDto;

  @ValidateNested()
  @Type(() => UpdateAtendimentoSmartVariablesDto)
  @IsOptional()
  smartVariables?: UpdateAtendimentoSmartVariablesDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateAtendimentoSceneRuleDto)
  @IsOptional()
  sceneRules?: UpdateAtendimentoSceneRuleDto[];

  @IsString()
  @IsOptional()
  welcomeMessage?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateAtendimentoBotButtonDto)
  @IsOptional()
  welcomeButtons?: UpdateAtendimentoBotButtonDto[];

  @IsString()
  @IsOptional()
  returningCustomerMessage?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateAtendimentoBotButtonDto)
  @IsOptional()
  returningCustomerButtons?: UpdateAtendimentoBotButtonDto[];

  @IsString()
  @IsOptional()
  mainMenuPrompt?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateAtendimentoBotButtonDto)
  @IsOptional()
  mainMenuButtons?: UpdateAtendimentoBotButtonDto[];

  @IsString()
  @IsOptional()
  recoveryDetectedMessage?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateAtendimentoBotButtonDto)
  @IsOptional()
  recoveryDetectedButtons?: UpdateAtendimentoBotButtonDto[];

  @IsString()
  @IsOptional()
  postActionPrompt?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateAtendimentoBotButtonDto)
  @IsOptional()
  postActionButtons?: UpdateAtendimentoBotButtonDto[];

  @IsString()
  @IsOptional()
  humanAckMessage?: string;

  @IsString()
  @IsOptional()
  closeTopicMessage?: string;

  @IsString()
  @IsOptional()
  blockedMessage?: string;
}
