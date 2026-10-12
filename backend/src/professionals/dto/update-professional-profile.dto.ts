import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength } from 'class-validator';

/** Dados da própria conta que o profissional pode alterar pelo painel (por ora, só o nome). */
export class UpdateProfessionalProfileDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : value))
  @IsString()
  @Matches(/\S/, { message: 'Informe o seu nome.' })
  @MaxLength(120, { message: 'O nome pode ter no máximo 120 caracteres.' })
  fullName!: string;
}
