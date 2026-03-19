import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ConfirmTechAssistantOperationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  action!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  confirmationText!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  details?: string;
}
