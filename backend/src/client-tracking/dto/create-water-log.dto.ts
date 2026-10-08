import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

export class CreateWaterLogDto {
  @IsInt()
  @Min(10)
  @Max(3000)
  amountMl!: number;

  /** Dia no calendário do aparelho (AAAA-MM-DD); sem ele, o dia de hoje em UTC. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date deve estar no formato AAAA-MM-DD.' })
  date?: string;
}
