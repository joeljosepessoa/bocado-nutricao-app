import { IsString, MinLength } from 'class-validator';

export class SubscribeDto {
  @IsString()
  @MinLength(1)
  planCode!: string;
}
