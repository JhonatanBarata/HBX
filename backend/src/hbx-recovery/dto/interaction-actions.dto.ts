import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class AssignHumanAgentDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  assignedUserId?: number;
}

export class GenerateInteractionLinkDto {
  @IsOptional()
  @IsString()
  @IsIn(['avista', 'parcelado', 'credito'])
  mode?: 'avista' | 'parcelado' | 'credito';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  installments?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.5)
  amount?: number;
}

export class MarkInteractionPaidDto {
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;
}

export class CloseInteractionDto {
  @IsOptional()
  @IsString()
  result?: string;
}

export class BlockInteractionDto {
  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string;
}

export class AddInteractionNoteDto {
  @IsString()
  @MinLength(2)
  @MaxLength(1200)
  note!: string;
}

export class SendInteractionMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;
}
