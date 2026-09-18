import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreatePaymentLinkDto {
  @IsString()
  @IsNotEmpty()
  clientId!: string;

  @IsString()
  @IsNotEmpty()
  professionalProductId!: string;

  // Opcional — se ausente, o link não expira. Nunca aceitamos valor (preço),
  // isso sempre vem do ProfessionalProduct no backend.
  @IsOptional()
  @IsString()
  expiresAt?: string;
}
