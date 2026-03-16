import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class InboundMessageDto {
  // WhatsApp Cloud API metadata.phone_number_id (or equivalent proxy-provided field)
  @IsString()
  @IsNotEmpty()
  whatsappPhoneNumberId: string;

  @IsString()
  @IsNotEmpty()
  from: string;

  @IsString()
  @IsNotEmpty()
  text: string;

  @IsOptional()
  @IsString()
  receivedAt?: string;

  @IsOptional()
  @IsString()
  inboundType?: string;

  @IsOptional()
  rawPayload?: unknown;
}
