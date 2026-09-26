import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiAuditAction, AiFeatureKey, AiInteractionStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AiAuditLogService } from './ai-audit-log.service';
import { AiProviderRegistry } from './providers/ai-provider.registry';
import { AiCredentialsResolver } from './providers/ai-credentials.resolver';
import { AiTimeoutError, callProviderWithResilience } from './providers/call-with-resilience';
import type { AiGenerationResult } from './providers/ai-provider.interface';
import { AiOutputValidationError, AiProviderError, AiUnsupportedProviderError } from './ai-errors';
import { DraftNoteUseCase } from './use-cases/draft-note.use-case';
import { ExplainEvaluationUseCase } from './use-cases/explain-evaluation.use-case';
import { NarrateTrendUseCase } from './use-cases/narrate-trend.use-case';
import { OrganizeWorkoutUseCase } from './use-cases/organize-workout/organize-workout.use-case';
import type { AiUseCase, BuildContextParams } from './use-cases/ai-use-case.interface';
import { AiGenerationResponseDto } from './dto/ai-generation-response.dto';

export interface RequestMeta {
  ipAddress?: string;
}

const MAX_OUTPUT_CHARS = 4000;
// Padrão quando AI_TIMEOUT_MS não é definido (o mesmo da Fase 12). Use cases
// mais pesados declaram o próprio timeoutMs (ex.: organize_workout).
export const DEFAULT_AI_TIMEOUT_MS = 10_000;
const AI_MAX_RETRIES = 1;

function interactionStatusFor(error: unknown): AiInteractionStatus {
  if (error instanceof AiTimeoutError || (error instanceof AiProviderError && error.kind === 'timeout')) {
    return AiInteractionStatus.timeout;
  }
  if (error instanceof AiOutputValidationError || (error instanceof AiProviderError && error.kind === 'invalid_response')) {
    return AiInteractionStatus.invalid_output;
  }
  return AiInteractionStatus.failed;
}

/** Só mensagens escritas por nós seguem para log e resposta; o resto vira texto genérico. */
function safeErrorMessage(error: unknown): string {
  if (
    error instanceof AiProviderError ||
    error instanceof AiOutputValidationError ||
    error instanceof AiUnsupportedProviderError ||
    error instanceof AiTimeoutError
  ) {
    return error.message;
  }
  return 'Não foi possível gerar o conteúdo agora.';
}

export interface GenerateParams {
  professionalId: string;
  clientId: string;
  /** false só no fluxo iniciado pelo próprio cliente sobre o próprio dado. */
  requireProfessionalConsent: boolean;
  feature: AiFeatureKey;
  input: unknown;
  meta?: RequestMeta;
}

/**
 * Orquestrador único — fluxo exigido pela Fase 12 (decisão 14):
 * Controller → Use Case → autorização → consentimento → Context Builder →
 * AI Provider → validação do output → auditoria → resposta.
 * O controller nunca monta prompt nem chama o provider diretamente.
 */
@Injectable()
export class AiService {
  private readonly useCases: Map<AiFeatureKey, AiUseCase>;
  private readonly logger = new Logger(AiService.name);
  private readonly defaultTimeoutMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: AiProviderRegistry,
    private readonly auditLog: AiAuditLogService,
    private readonly credentials: AiCredentialsResolver,
    config: ConfigService,
    draftNote: DraftNoteUseCase,
    explainEvaluation: ExplainEvaluationUseCase,
    narrateTrend: NarrateTrendUseCase,
    organizeWorkout: OrganizeWorkoutUseCase,
  ) {
    this.useCases = new Map<AiFeatureKey, AiUseCase>([
      [draftNote.feature, draftNote],
      [explainEvaluation.feature, explainEvaluation],
      [narrateTrend.feature, narrateTrend],
      [organizeWorkout.feature, organizeWorkout],
    ]);
    const configuredTimeout = Number(config.get<string>('AI_TIMEOUT_MS'));
    this.defaultTimeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : DEFAULT_AI_TIMEOUT_MS;
  }

  /**
   * Usado só pelo fluxo iniciado pelo próprio cliente: não há um
   * "professionalId autenticado" nesse caso, mas AiAuditLog/AiInteractionLog
   * sempre registram a relação profissional↔cliente à qual a interação
   * pertence (mesmo raciocínio de Client.professionalId em todo o sistema).
   */
  async resolveProfessionalIdForClient(clientId: string): Promise<string> {
    const client = await this.prisma.client.findUniqueOrThrow({
      where: { id: clientId },
      select: { professionalId: true },
    });
    return client.professionalId;
  }

  private async assertOwnedClient(professionalId: string, clientId: string) {
    const client = await this.prisma.client.findFirst({ where: { id: clientId, professionalId } });
    if (!client) {
      throw new NotFoundException('Cliente não encontrado.');
    }
    return client;
  }

  private async checkConsent(
    professionalId: string,
    clientId: string,
    requireProfessionalConsent: boolean,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const client = await this.prisma.client.findUniqueOrThrow({
      where: { id: clientId },
      select: { aiDataProcessingConsentAt: true },
    });
    if (!client.aiDataProcessingConsentAt) {
      return { ok: false, reason: 'O cliente ainda não consentiu com o processamento de dados por IA.' };
    }

    if (requireProfessionalConsent) {
      const professional = await this.prisma.professional.findUniqueOrThrow({
        where: { id: professionalId },
        select: { aiFeaturesConsentAt: true },
      });
      if (!professional.aiFeaturesConsentAt) {
        return { ok: false, reason: 'Você ainda não ativou as ferramentas de IA para sua conta.' };
      }
    }

    return { ok: true };
  }

  async generate(params: GenerateParams): Promise<AiGenerationResponseDto> {
    const meta = params.meta ?? {};
    const useCase = this.useCases.get(params.feature);
    if (!useCase) {
      throw new BadRequestException(`Funcionalidade de IA "${params.feature}" não existe.`);
    }

    if (params.requireProfessionalConsent) {
      await this.assertOwnedClient(params.professionalId, params.clientId);
    }

    const consent = await this.checkConsent(params.professionalId, params.clientId, params.requireProfessionalConsent);
    if (!consent.ok) {
      await this.auditLog.record({
        professionalId: params.professionalId,
        clientId: params.clientId,
        feature: params.feature,
        action: AiAuditAction.generation_blocked,
        ipAddress: meta.ipAddress,
      });
      throw new ForbiddenException(consent.reason);
    }

    await this.auditLog.record({
      professionalId: params.professionalId,
      clientId: params.clientId,
      feature: params.feature,
      action: AiAuditAction.generation_requested,
      ipAddress: meta.ipAddress,
    });

    // Erros de autorização/estado da própria feature (ex.: avaliação não
    // liberada) não são "falha de IA" — nada chegou a ser enviado a um
    // provedor, então não geram AiInteractionLog nem tentam retry.
    const built = await useCase.buildContext({
      professionalId: params.professionalId,
      clientId: params.clientId,
      input: params.input,
    });

    // Resolução do provedor também dentro do fluxo controlado: provedor
    // inválido/não implementado vira interação registrada + 503 com mensagem
    // segura, nunca um 500 genérico.
    let providerId = this.registry.configuredProviderLabel();
    let status: AiInteractionStatus = AiInteractionStatus.succeeded;
    let responseText: string | undefined;
    let structuredData: Record<string, unknown> | undefined;
    let model = providerId;
    let errorMessage: string | undefined;
    let tokensUsed: AiGenerationResult['tokensUsed'];
    const startedAt = Date.now();

    try {
      const provider = this.registry.getActiveProvider();
      providerId = provider.id;
      model = provider.id;
      if (useCase.requiresStructuredOutput && !provider.supportsStructuredOutput) {
        throw new AiUnsupportedProviderError();
      }

      const credentials = await this.credentials.resolve(provider.id, { professionalId: params.professionalId });
      const result = await callProviderWithResilience(
        provider,
        {
          promptVersion: useCase.promptVersion,
          systemPrompt: built.systemPrompt,
          context: built.context,
          maxOutputChars: useCase.maxOutputChars ?? MAX_OUTPUT_CHARS,
          responseSchema: useCase.responseSchema,
        },
        { timeoutMs: useCase.timeoutMs ?? this.defaultTimeoutMs, maxRetries: AI_MAX_RETRIES },
        credentials,
      );
      tokensUsed = result.tokensUsed;

      if (!isValidResult(result.text)) {
        status = AiInteractionStatus.invalid_output;
        errorMessage = 'O provedor devolveu uma resposta vazia ou inválida.';
      } else if (useCase.processOutput) {
        const processed = await this.runProcessOutput(useCase, result, {
          professionalId: params.professionalId,
          clientId: params.clientId,
          input: params.input,
        });
        responseText = processed.text;
        structuredData = processed.structuredData;
        model = result.model;
      } else {
        responseText = result.text;
        model = result.model;
      }
    } catch (error) {
      status = interactionStatusFor(error);
      errorMessage = safeErrorMessage(error);
    }

    // Métrica de uso/custo — só metadados, nunca prompt, contexto, resposta ou credencial.
    this.logger.log(
      `ai_generation feature=${params.feature} provider=${providerId} model=${model} status=${status} ` +
        `durationMs=${Date.now() - startedAt} inputTokens=${tokensUsed?.input ?? '-'} outputTokens=${tokensUsed?.output ?? '-'}`,
    );

    await this.prisma.aiInteractionLog.create({
      data: {
        professionalId: params.professionalId,
        clientId: params.clientId,
        feature: params.feature,
        provider: providerId,
        model,
        promptVersion: useCase.promptVersion,
        contextRef: built.contextRef,
        status,
        systemPrompt: built.systemPrompt,
        contextSummary: built.context as Prisma.InputJsonValue,
        responseText,
        errorMessage,
      },
    });

    await this.auditLog.record({
      professionalId: params.professionalId,
      clientId: params.clientId,
      feature: params.feature,
      action: status === AiInteractionStatus.succeeded ? AiAuditAction.generation_succeeded : AiAuditAction.generation_failed,
      ipAddress: meta.ipAddress,
    });

    if (status !== AiInteractionStatus.succeeded || !responseText) {
      throw new ServiceUnavailableException(errorMessage ?? 'Não foi possível gerar o conteúdo agora.');
    }

    const dto = new AiGenerationResponseDto();
    dto.feature = params.feature;
    dto.promptVersion = useCase.promptVersion;
    dto.provider = providerId;
    dto.model = model;
    dto.text = responseText;
    if (structuredData) {
      dto.structuredData = structuredData;
    }
    dto.generatedAt = new Date();
    return dto;
  }

  /**
   * Erro de validação passa adiante como está (mensagem nossa, segura);
   * qualquer outro erro (ex.: banco) vira mensagem genérica — nunca vaza
   * detalhe interno para o log de interação nem para a resposta.
   */
  private async runProcessOutput(useCase: AiUseCase, result: AiGenerationResult, params: BuildContextParams) {
    try {
      return await useCase.processOutput!(result, params);
    } catch (error) {
      if (error instanceof AiOutputValidationError) {
        throw error;
      }
      throw new Error('Não foi possível processar a resposta da IA.');
    }
  }

  async recordProfessionalConsent(professionalId: string): Promise<{ aiFeaturesConsentAt: Date }> {
    const professional = await this.prisma.professional.findUniqueOrThrow({
      where: { id: professionalId },
      select: { aiFeaturesConsentAt: true },
    });
    const aiFeaturesConsentAt = professional.aiFeaturesConsentAt ?? new Date();
    if (!professional.aiFeaturesConsentAt) {
      await this.prisma.professional.update({ where: { id: professionalId }, data: { aiFeaturesConsentAt } });
      await this.auditLog.record({ professionalId, action: AiAuditAction.consent_granted_professional });
    }
    return { aiFeaturesConsentAt };
  }

  async recordClientConsent(clientId: string): Promise<{ aiDataProcessingConsentAt: Date }> {
    const client = await this.prisma.client.findUniqueOrThrow({
      where: { id: clientId },
      select: { aiDataProcessingConsentAt: true, professionalId: true },
    });
    const aiDataProcessingConsentAt = client.aiDataProcessingConsentAt ?? new Date();
    if (!client.aiDataProcessingConsentAt) {
      await this.prisma.client.update({ where: { id: clientId }, data: { aiDataProcessingConsentAt } });
      await this.auditLog.record({
        professionalId: client.professionalId,
        clientId,
        action: AiAuditAction.consent_granted_client,
      });
    }
    return { aiDataProcessingConsentAt };
  }

  async listInteractionsForProfessional(professionalId: string, clientId: string, page = 1, pageSize = 20) {
    await this.assertOwnedClient(professionalId, clientId);
    const safePage = page > 0 ? page : 1;
    const safePageSize = pageSize > 0 ? pageSize : 20;
    const where: Prisma.AiInteractionLogWhereInput = { professionalId, clientId };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.aiInteractionLog.findMany({
        where,
        select: {
          id: true,
          feature: true,
          provider: true,
          model: true,
          promptVersion: true,
          contextRef: true,
          status: true,
          responseText: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
      }),
      this.prisma.aiInteractionLog.count({ where }),
    ]);

    return { items, total, page: safePage, pageSize: safePageSize };
  }
}

/** Exportada para teste direto (decisão 15 — nunca assumir que o provedor sempre devolve o formato correto). */
export function isValidResult(text: string | null | undefined): text is string {
  return typeof text === 'string' && text.trim().length > 0;
}
