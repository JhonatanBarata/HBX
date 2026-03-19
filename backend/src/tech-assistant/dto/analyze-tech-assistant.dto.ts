import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  TECH_ASSISTANT_ANALYSIS_TYPES,
  TECH_ASSISTANT_ENVIRONMENTS,
  type TechAssistantAnalysisType,
  type TechAssistantEnvironment,
} from '../tech-assistant.types';

export class AnalyzeTechAssistantDto {
  @IsIn(TECH_ASSISTANT_ANALYSIS_TYPES)
  analysisType!: TechAssistantAnalysisType;

  @IsOptional()
  @IsIn(TECH_ASSISTANT_ENVIRONMENTS)
  environment?: TechAssistantEnvironment;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  route?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  message?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30000)
  technicalContent?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  expectedBehavior?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  currentBehavior?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30000)
  htmlSource?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30000)
  consoleError?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30000)
  buildError?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30000)
  backendStacktrace?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30000)
  apiError?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  requestJson?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  responseJson?: string;

  @IsOptional()
  @IsString()
  @MaxLength(12000)
  promptDraft?: string;
}