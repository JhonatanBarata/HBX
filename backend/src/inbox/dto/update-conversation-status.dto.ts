import { IsIn, IsString } from 'class-validator';

export class UpdateConversationStatusDto {
  @IsString()
  @IsIn(['new', 'open', 'closed', 'blocked'])
  status!: string;
}
