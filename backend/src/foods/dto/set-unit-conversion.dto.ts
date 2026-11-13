import { IsNumber, IsPositive, Max } from 'class-validator';

/** Peso (na unidade base do alimento) de 1 unidade/fatia/colher/xícara. */
export class SetUnitConversionDto {
  @IsNumber()
  @IsPositive()
  @Max(5000)
  gramsEquivalent!: number;
}
