import { IsNotEmpty, IsString } from 'class-validator';

export class MockMessageDto {
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsString()
  @IsNotEmpty()
  message!: string;
}
