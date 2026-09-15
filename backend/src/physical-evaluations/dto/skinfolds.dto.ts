import { IsNumber, IsOptional, Min } from 'class-validator';

export class SkinfoldsDto {
  @IsOptional() @IsNumber() @Min(0) chestMm?: number;
  @IsOptional() @IsNumber() @Min(0) axillaryMidMm?: number;
  @IsOptional() @IsNumber() @Min(0) subscapularMm?: number;
  @IsOptional() @IsNumber() @Min(0) bicepsMm?: number;
  @IsOptional() @IsNumber() @Min(0) tricepsMm?: number;
  @IsOptional() @IsNumber() @Min(0) abdominalMm?: number;
  @IsOptional() @IsNumber() @Min(0) suprailiacMm?: number;
  @IsOptional() @IsNumber() @Min(0) thighMm?: number;
  @IsOptional() @IsNumber() @Min(0) calfMm?: number;
}
