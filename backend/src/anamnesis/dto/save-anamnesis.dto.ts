import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsISO8601, IsOptional, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';
import {
  ANAMNESIS_CONDITIONS,
  ANAMNESIS_FAMILY_HISTORY,
  ANAMNESIS_GENDERS,
  ANAMNESIS_GOALS,
  ANAMNESIS_LIMITS as L,
  ANAMNESIS_SLEEP_QUALITY,
  ANAMNESIS_STRESS_LEVEL,
} from '../anamnesis-options';

/** Texto digitado: aparado; vazio vira null (campo em branco apaga o que havia). */
const blankToNull = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value));

function Short(): PropertyDecorator {
  return (target, key) => {
    blankToNull()(target, key);
    IsOptional()(target, key);
    IsString()(target, key);
    MaxLength(L.shortText)(target, key);
  };
}

function Long(): PropertyDecorator {
  return (target, key) => {
    blankToNull()(target, key);
    IsOptional()(target, key);
    IsString()(target, key);
    MaxLength(L.longText)(target, key);
  };
}

/** Medicamento, suplemento ou hormônio em uso. */
export class AnamnesisItemDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(/\S/, { message: 'Informe o nome do item.' })
  @MaxLength(L.shortText)
  name!: string;

  @Short() dosage?: string | null;
  @Short() frequency?: string | null;
}

function ItemList(): PropertyDecorator {
  return (target, key) => {
    IsOptional()(target, key);
    IsArray()(target, key);
    ArrayMaxSize(L.listItems)(target, key);
    ValidateNested({ each: true })(target, key);
    Type(() => AnamnesisItemDto)(target, key);
  };
}

/**
 * A ficha inteira, como o painel a envia a cada etapa. Campo ausente não é
 * tocado; campo de texto em branco é apagado. Nome e e-mail do paciente não
 * entram aqui (são do cadastro); nascimento, sexo e WhatsApp entram e são
 * gravados no próprio cadastro.
 */
export class SaveAnamnesisDto {
  // 1. Dados pessoais
  @IsOptional() @IsISO8601({ strict: true }, { message: 'Data de nascimento inválida.' }) birthDate?: string | null;
  @IsOptional() @IsIn(ANAMNESIS_GENDERS) gender?: (typeof ANAMNESIS_GENDERS)[number] | null;
  @Short() phone?: string | null;
  @Short() maritalStatus?: string | null;
  @Short() cpf?: string | null;
  @Short() rg?: string | null;
  @Short() occupation?: string | null;
  @Long() address?: string | null;

  // 2. Objetivo
  @IsOptional() @IsArray() @ArrayUnique() @IsIn(ANAMNESIS_GOALS, { each: true }) goals?: string[];
  @Long() goalDescription?: string | null;

  // 3. Histórico clínico
  @IsOptional() @IsArray() @ArrayUnique() @IsIn(ANAMNESIS_CONDITIONS, { each: true }) conditions?: string[];
  @Long() otherConditions?: string | null;

  // 4–6. Em uso
  @ItemList() medications?: AnamnesisItemDto[];
  @ItemList() supplements?: AnamnesisItemDto[];
  @ItemList() hormones?: AnamnesisItemDto[];

  // 7. Cirurgias e alergias
  @Long() surgeries?: string | null;
  @Long() allergies?: string | null;

  // 8. Histórico familiar
  @IsOptional() @IsArray() @ArrayUnique() @IsIn(ANAMNESIS_FAMILY_HISTORY, { each: true }) familyHistory?: string[];

  // 9. Hábitos
  @Short() smoking?: string | null;
  @Short() alcohol?: string | null;
  @Short() waterIntake?: string | null;
  @Short() sleepHours?: string | null;
  @IsOptional() @IsIn(ANAMNESIS_SLEEP_QUALITY) sleepQuality?: (typeof ANAMNESIS_SLEEP_QUALITY)[number] | null;
  @IsOptional() @IsIn(ANAMNESIS_STRESS_LEVEL) stressLevel?: (typeof ANAMNESIS_STRESS_LEVEL)[number] | null;
  @Short() bowelFrequency?: string | null;

  // 10. Atividade física
  @Short() trainingFrequency?: string | null;
  @Short() trainingDuration?: string | null;
  @Short() trainingModality?: string | null;
  @Short() cardio?: string | null;
  @Short() dailySteps?: string | null;

  // 11. Alimentação
  @Short() mealsPerDay?: string | null;
  @Short() mealTimes?: string | null;
  @Long() foodPreferences?: string | null;
  @Long() intolerances?: string | null;
  @Long() restrictions?: string | null;
  @Long() aversions?: string | null;

  // 12. Observações
  @Long() notes?: string | null;

  /** true no "Concluir Anamnese"; false reabre a ficha. Ausente: não muda. */
  @IsOptional() @IsBoolean() completed?: boolean;
}
