import { Equals, IsEmail, IsIn, IsISO8601, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ANAMNESIS_GENDERS } from '../../anamnesis/anamnesis-options';

/** O que o paciente preenche na página pública /cadastro/<código>. */
export class PublicSignupDto {
  @IsString()
  @IsNotEmpty({ message: 'Informe seu nome completo.' })
  @MaxLength(120)
  fullName!: string;

  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(254)
  email!: string;

  // Mesma regra da troca de senha do app.
  @IsString()
  @MinLength(10, { message: 'A senha deve ter pelo menos 10 caracteres.' })
  @MaxLength(128)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, { message: 'A senha deve conter pelo menos uma letra e um número.' })
  password!: string;

  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Data de nascimento inválida.' })
  birthDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsIn(ANAMNESIS_GENDERS)
  gender?: (typeof ANAMNESIS_GENDERS)[number];

  @Equals(true, { message: 'É preciso aceitar os Termos de Uso.' })
  acceptTerms!: boolean;

  @Equals(true, { message: 'É preciso confirmar a Política de Privacidade.' })
  acceptPrivacy!: boolean;

  @IsString()
  @MaxLength(20)
  termsVersion!: string;

  @IsString()
  @MaxLength(20)
  privacyVersion!: string;
}
