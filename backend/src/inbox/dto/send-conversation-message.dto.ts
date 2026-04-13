import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class SendConversationMessageDto {
  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsOptional()
  @IsString()
  quotedMessageId?: string;

  @IsOptional()
  @IsString()
  quotedContent?: string;

  @IsOptional()
  @IsString()
  attachmentKind?: string;

  @IsOptional()
  @IsString()
  attachmentUrl?: string;

  @IsOptional()
  @IsString()
  attachmentPreviewUrl?: string;

  @IsOptional()
  @IsString()
  attachmentMimeType?: string;

  @IsOptional()
  @IsString()
  attachmentFileName?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  attachmentFileSize?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  attachmentDurationSeconds?: number;
}
