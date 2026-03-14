import { IsArray, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class EnqueueMessageDto {
  @IsString()
  @IsNotEmpty()
  to: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsString()
  @IsIn(['text', 'template'])
  messageType?: 'text' | 'template';

  @IsOptional()
  @IsString()
  templateName?: string;

  @IsOptional()
  @IsString()
  templateLanguage?: string;

  @IsOptional()
  @IsArray()
  templateComponents?: unknown[];
}
