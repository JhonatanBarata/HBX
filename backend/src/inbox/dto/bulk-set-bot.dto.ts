import { IsBoolean, IsArray, ArrayNotEmpty, ArrayUnique } from 'class-validator';

export class BulkSetBotDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  // IDs come as integers
  ids!: number[];

  @IsBoolean()
  enabled!: boolean;
}
