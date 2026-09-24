import { Module } from '@nestjs/common';
import { PhysicalEvaluationsModule } from '../physical-evaluations/physical-evaluations.module';
import { ClientAiController, ProfessionalAiConsentController, ProfessionalClientAiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiAuditLogService } from './ai-audit-log.service';
import { AiProviderRegistry } from './providers/ai-provider.registry';
import { MockAiProvider } from './providers/mock-ai.provider';
import { ClaudeAiProvider } from './providers/claude-ai.provider';
import { DraftNoteUseCase } from './use-cases/draft-note.use-case';
import { ExplainEvaluationUseCase } from './use-cases/explain-evaluation.use-case';
import { NarrateTrendUseCase } from './use-cases/narrate-trend.use-case';

@Module({
  imports: [PhysicalEvaluationsModule],
  controllers: [ProfessionalAiConsentController, ClientAiController, ProfessionalClientAiController],
  providers: [
    AiService,
    AiAuditLogService,
    AiProviderRegistry,
    MockAiProvider,
    ClaudeAiProvider,
    DraftNoteUseCase,
    ExplainEvaluationUseCase,
    NarrateTrendUseCase,
  ],
})
export class AiModule {}
