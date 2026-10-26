import { Equals, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const LEGAL_ACCEPT_SOURCES = ['mobile_app', 'mobile_app_first_open'] as const;

export class AcceptLegalDto {
  /** Caixa "Li e aceito os Termos de Uso". */
  @Equals(true, { message: 'É preciso aceitar os Termos de Uso.' })
  acceptTerms!: boolean;

  /** Caixa "Li e estou ciente da Política de Privacidade". */
  @Equals(true, { message: 'É preciso confirmar a Política de Privacidade.' })
  acceptPrivacy!: boolean;

  /** Versões que a pessoa leu na tela. */
  @IsString()
  @MaxLength(20)
  termsVersion!: string;

  @IsString()
  @MaxLength(20)
  privacyVersion!: string;

  @IsOptional()
  @IsIn(LEGAL_ACCEPT_SOURCES)
  source?: (typeof LEGAL_ACCEPT_SOURCES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(40)
  appVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  platform?: string;
}
