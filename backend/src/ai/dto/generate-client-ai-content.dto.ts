import { IsIn, IsUUID, ValidateIf } from 'class-validator';
import { AiFeatureKey } from '@prisma/client';

const CLIENT_ALLOWED_FEATURES = [AiFeatureKey.explain_evaluation, AiFeatureKey.narrate_trend] as const;

/**
 * O cliente só pode pedir explicação/narração sobre o próprio dado — nunca
 * draft_note (ferramenta do profissional). Restrito na validação, não só
 * na documentação.
 */
export class GenerateClientAiContentDto {
  @IsIn(CLIENT_ALLOWED_FEATURES)
  feature!: (typeof CLIENT_ALLOWED_FEATURES)[number];

  @ValidateIf((o) => o.feature === AiFeatureKey.explain_evaluation)
  @IsUUID()
  evaluationId?: string;
}
