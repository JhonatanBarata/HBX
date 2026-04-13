import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

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
}
