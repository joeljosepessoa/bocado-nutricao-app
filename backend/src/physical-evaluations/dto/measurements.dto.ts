import { IsNumber, IsOptional, Min } from 'class-validator';

export class MeasurementsDto {
  @IsOptional() @IsNumber() @Min(0) chestCm?: number;
  @IsOptional() @IsNumber() @Min(0) waistCm?: number;
  @IsOptional() @IsNumber() @Min(0) abdomenCm?: number;
  @IsOptional() @IsNumber() @Min(0) hipCm?: number;
  @IsOptional() @IsNumber() @Min(0) armRightCm?: number;
  @IsOptional() @IsNumber() @Min(0) armLeftCm?: number;
  @IsOptional() @IsNumber() @Min(0) forearmRightCm?: number;
  @IsOptional() @IsNumber() @Min(0) forearmLeftCm?: number;
  @IsOptional() @IsNumber() @Min(0) thighRightCm?: number;
  @IsOptional() @IsNumber() @Min(0) thighLeftCm?: number;
  @IsOptional() @IsNumber() @Min(0) calfRightCm?: number;
  @IsOptional() @IsNumber() @Min(0) calfLeftCm?: number;
  @IsOptional() @IsNumber() @Min(0) wristCm?: number;
  @IsOptional() @IsNumber() @Min(0) femurBicondylarCm?: number;
}
