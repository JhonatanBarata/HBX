import { IsNotEmpty, IsString } from 'class-validator';

export class SendConversationMessageDto {
  @IsString()
  @IsNotEmpty()
  content!: string;
}
