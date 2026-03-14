import { IsIn, IsString } from 'class-validator';

export class UpdateConversationStatusDto {
  @IsString()
  @IsIn(['new', 'open', 'closed'])
  status!: string;
}
