import { IsISO8601, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class CreateWeightLogDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(20)
  @Max(400)
  weightKg!: number;

  /** Momento da pesagem; sem ele, agora. */
  @IsOptional()
  @IsISO8601()
  recordedAt?: string;
}
