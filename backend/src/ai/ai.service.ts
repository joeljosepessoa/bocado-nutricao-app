import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { AiAuditAction, AiFeatureKey, AiInteractionStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AiAuditLogService } from './ai-audit-log.service';
import { AiProviderRegistry } from './providers/ai-provider.registry';
import { AiTimeoutError, callProviderWithResilience } from './providers/call-with-resilience';
import { DraftNoteUseCase } from './use-cases/draft-note.use-case';
import { ExplainEvaluationUseCase } from './use-cases/explain-evaluation.use-case';
import { NarrateTrendUseCase } from './use-cases/narrate-trend.use-case';
import type { AiUseCase } from './use-cases/ai-use-case.interface';
import { AiGenerationResponseDto } from './dto/ai-generation-response.dto';

export interface RequestMeta {
  ipAddress?: string;
}

const MAX_OUTPUT_CHARS = 4000;
const AI_TIMEOUT_MS = 10_000;
const AI_MAX_RETRIES = 1;

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: AiProviderRegistry,
    private readonly auditLog: AiAuditLogService,
    draftNote: DraftNoteUseCase,
    explainEvaluation: ExplainEvaluationUseCase,
    narrateTrend: NarrateTrendUseCase,
  ) {
    this.useCases = new Map<AiFeatureKey, AiUseCase>([
      [draftNote.feature, draftNote],
      [explainEvaluation.feature, explainEvaluation],
      [narrateTrend.feature, narrateTrend],
    ]);
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

    const provider = this.registry.getActiveProvider();
    let status: AiInteractionStatus = AiInteractionStatus.succeeded;
    let responseText: string | undefined;
    let model = provider.id;
    let errorMessage: string | undefined;

    try {
      const result = await callProviderWithResilience(
        provider,
        {
          promptVersion: useCase.promptVersion,
          systemPrompt: built.systemPrompt,
          context: built.context,
          maxOutputChars: MAX_OUTPUT_CHARS,
        },
        { timeoutMs: AI_TIMEOUT_MS, maxRetries: AI_MAX_RETRIES },
      );

      if (!isValidResult(result.text)) {
        status = AiInteractionStatus.invalid_output;
        errorMessage = 'O provedor devolveu uma resposta vazia ou inválida.';
      } else {
        responseText = result.text;
        model = result.model;
      }
    } catch (error) {
      status = error instanceof AiTimeoutError ? AiInteractionStatus.timeout : AiInteractionStatus.failed;
      errorMessage = error instanceof Error ? error.message : String(error);
    }

    await this.prisma.aiInteractionLog.create({
      data: {
        professionalId: params.professionalId,
        clientId: params.clientId,
        feature: params.feature,
        provider: provider.id,
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
    dto.provider = provider.id;
    dto.model = model;
    dto.text = responseText;
    dto.generatedAt = new Date();
    return dto;
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
