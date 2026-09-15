import { IsString, Matches, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @MinLength(10, { message: 'A senha deve ter pelo menos 10 caracteres.' })
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'A senha deve conter pelo menos uma letra e um número.',
  })
  newPassword!: string;
}
