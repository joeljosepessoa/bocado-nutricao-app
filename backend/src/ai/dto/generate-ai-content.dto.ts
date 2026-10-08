import { IsEnum, IsIn, IsInt, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { AiFeatureKey } from '@prisma/client';

export const MAX_WORKOUT_TEXT_LENGTH = 12000;
export const MAX_DIET_TEXT_LENGTH = 12000;
export const MAX_DIET_GOAL_LENGTH = 4000;
export const DIET_TARGET_KCAL = { min: 800, max: 6000 } as const;
export const DIET_MEALS_PER_DAY = { min: 1, max: 8 } as const;

/**
 * Usado só pelo endpoint do profissional. O do cliente
 * (GenerateClientAiContentDto) tem allowlist própria e não aceita
 * organize_workout nem organize_diet.
 */
export class GenerateAiContentDto {
  @IsEnum(AiFeatureKey)
  feature!: AiFeatureKey;

  // Só exigido/aceito para draft_note.
  @ValidateIf((o) => o.feature === AiFeatureKey.draft_note)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  instructions?: string;

  @ValidateIf((o) => o.feature === AiFeatureKey.draft_note)
  @IsIn(['evaluation', 'diet', 'workout'])
  entityType?: 'evaluation' | 'diet' | 'workout';

  // Só exigido/aceito para explain_evaluation.
  @ValidateIf((o) => o.feature === AiFeatureKey.explain_evaluation)
  @IsUUID()
  evaluationId?: string;

  // Só exigido/aceito para organize_workout: o treino colado pelo profissional.
  @ValidateIf((o) => o.feature === AiFeatureKey.organize_workout)
  @IsString()
  @Matches(/\S/, { message: 'Cole o treino a ser organizado.' })
  @MaxLength(MAX_WORKOUT_TEXT_LENGTH)
  workoutText?: string;

  // Só exigido/aceito para organize_diet: a dieta colada pelo profissional.
  @ValidateIf((o) => o.feature === AiFeatureKey.organize_diet)
  @IsString()
  @Matches(/\S/, { message: 'Cole a dieta a ser organizada.' })
  @MaxLength(MAX_DIET_TEXT_LENGTH)
  dietText?: string;

  // Só exigido/aceito para create_diet: o pedido do profissional (objetivo,
  // restrições, preferências, rotina). Meta de kcal e nº de refeições são opcionais.
  @ValidateIf((o) => o.feature === AiFeatureKey.create_diet)
  @IsString()
  @Matches(/\S/, { message: 'Descreva o que a dieta deve atender (objetivo, restrições, preferências).' })
  @MaxLength(MAX_DIET_GOAL_LENGTH)
  dietGoal?: string;

  @ValidateIf((o) => o.feature === AiFeatureKey.create_diet && o.targetKcal !== undefined && o.targetKcal !== null)
  @IsInt()
  @Min(DIET_TARGET_KCAL.min)
  @Max(DIET_TARGET_KCAL.max)
  targetKcal?: number;

  @ValidateIf((o) => o.feature === AiFeatureKey.create_diet && o.mealsPerDay !== undefined && o.mealsPerDay !== null)
  @IsInt()
  @Min(DIET_MEALS_PER_DAY.min)
  @Max(DIET_MEALS_PER_DAY.max)
  mealsPerDay?: number;
}
