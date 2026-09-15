import { IsOptional, IsString } from 'class-validator';

export class UpdateClientSelfDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
