import { IsOptional, IsString, MaxLength } from 'class-validator';

export class BlockConversationDto {
  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string;
}
