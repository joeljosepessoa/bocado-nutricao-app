import { IsEmail, IsISO8601, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateClientDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @IsOptional()
  @IsISO8601()
  birthDate?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  gender?: string;
}
