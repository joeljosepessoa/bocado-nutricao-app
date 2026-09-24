import { IsEnum, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { AiFeatureKey } from '@prisma/client';

export const MAX_WORKOUT_TEXT_LENGTH = 12000;

/**
 * Usado só pelo endpoint do profissional. O do cliente
 * (GenerateClientAiContentDto) tem allowlist própria e não aceita
 * organize_workout.
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
}
