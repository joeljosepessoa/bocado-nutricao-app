import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, Min } from 'class-validator';

export class CreateMealDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'time deve estar no formato HH:mm.' })
  time?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  /** Dia da dieta (tipo de dia). Sem ele, a refeição vai para o primeiro dia da versão. */
  @IsOptional()
  @IsUUID()
  dietDayId?: string;
}
