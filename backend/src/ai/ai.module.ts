import { Module } from '@nestjs/common';
import { ExercisesModule } from '../exercises/exercises.module';
import { PhysicalEvaluationsModule } from '../physical-evaluations/physical-evaluations.module';
import { ClientAiController, ProfessionalAiConsentController, ProfessionalClientAiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiAuditLogService } from './ai-audit-log.service';
import { AiProviderRegistry } from './providers/ai-provider.registry';
import { MockAiProvider } from './providers/mock-ai.provider';
import { AnthropicAiProvider } from './providers/anthropic-ai.provider';
import { AiCredentialsResolver, EnvAiCredentialsResolver } from './providers/ai-credentials.resolver';
import { DraftNoteUseCase } from './use-cases/draft-note.use-case';
import { ExplainEvaluationUseCase } from './use-cases/explain-evaluation.use-case';
import { NarrateTrendUseCase } from './use-cases/narrate-trend.use-case';
import { OrganizeWorkoutUseCase } from './use-cases/organize-workout/organize-workout.use-case';

@Module({
  imports: [PhysicalEvaluationsModule, ExercisesModule],
  controllers: [ProfessionalAiConsentController, ClientAiController, ProfessionalClientAiController],
  providers: [
    AiService,
    AiAuditLogService,
    AiProviderRegistry,
    MockAiProvider,
    AnthropicAiProvider,
    // BYOK futuro: trocar só esta implementação.
    { provide: AiCredentialsResolver, useClass: EnvAiCredentialsResolver },
    DraftNoteUseCase,
    ExplainEvaluationUseCase,
    NarrateTrendUseCase,
    OrganizeWorkoutUseCase,
  ],
})
export class AiModule {}
