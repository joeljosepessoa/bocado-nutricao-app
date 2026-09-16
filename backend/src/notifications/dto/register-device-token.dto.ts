import { IsEnum, IsString, MinLength } from 'class-validator';
import { DeviceTokenPlatform } from '@prisma/client';

export class RegisterDeviceTokenDto {
  @IsEnum(DeviceTokenPlatform)
  platform!: DeviceTokenPlatform;

  @IsString()
  @MinLength(1)
  token!: string;
}
