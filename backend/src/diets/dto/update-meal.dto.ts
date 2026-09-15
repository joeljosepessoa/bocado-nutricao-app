import { IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

export class UpdateMealDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsInt() @Min(0) order?: number;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'time deve estar no formato HH:mm.' }) time?: string;
  @IsOptional() @IsString() notes?: string;
}
