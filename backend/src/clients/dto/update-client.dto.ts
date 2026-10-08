import { IsEmail, IsEnum, IsISO8601, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { ClientStatus } from '@prisma/client';

export class UpdateClientDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsISO8601()
  birthDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsEnum(ClientStatus)
  status?: ClientStatus;

  /** Meta de peso definida pelo nutricionista; null apaga a meta. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(20)
  @Max(400)
  targetWeightKg?: number | null;

  /** Meta diária de água (ml); null volta ao cálculo por peso. */
  @IsOptional()
  @IsInt()
  @Min(500)
  @Max(10000)
  waterGoalMl?: number | null;
}
