import { IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { AiFeatureKey } from '@prisma/client';

/** Usado pelo endpoint do profissional — as 3 features aprovadas ficam disponíveis aqui. */
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
}
