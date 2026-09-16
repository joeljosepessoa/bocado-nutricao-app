import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { DeviceSourceType } from '@prisma/client';

export class CreateDeviceConnectionDto {
  @IsEnum(DeviceSourceType)
  sourceType!: DeviceSourceType;

  @IsOptional()
  @IsString()
  @MinLength(1)
  driverId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  deviceIdentifier?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  externalAccountId?: string;
}
