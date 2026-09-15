import { IsEnum } from 'class-validator';
import { DietStatus } from '@prisma/client';

export class UpdateDietDto {
  @IsEnum(DietStatus)
  status!: DietStatus;
}
