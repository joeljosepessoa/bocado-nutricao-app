import { IsArray, IsISO8601, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/** As perguntas são conferidas por custom-form-rules.ts (mensagens em português, pergunta por pergunta). */
export class CreateCustomFormDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsArray()
  questions!: unknown[];
}

export class UpdateCustomFormDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsArray()
  questions?: unknown[];
}

export class CreateFormResponseDto {
  @IsUUID()
  formId!: string;

  @IsObject()
  answers!: Record<string, unknown>;

  /** Data do preenchimento (padrão: agora). */
  @IsOptional()
  @IsISO8601()
  filledAt?: string;
}

export class UpdateFormResponseDto {
  @IsOptional()
  @IsObject()
  answers?: Record<string, unknown>;

  @IsOptional()
  @IsISO8601()
  filledAt?: string;
}
