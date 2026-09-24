import { AiFeatureKey } from '@prisma/client';

/**
 * Sempre rotulado como conteúdo assistivo — nunca devolvido como se fosse
 * um dado original do sistema (Fase 12, decisão 8/9). O chamador (front)
 * decide: usar (salvar pelos fluxos já existentes), editar ou descartar.
 */
export class AiGenerationResponseDto {
  feature!: AiFeatureKey;
  promptVersion!: string;
  provider!: string;
  model!: string;
  text!: string;
  /** Só em features de saída estruturada — já validada pelo backend. */
  structuredData?: Record<string, unknown>;
  generatedAt!: Date;
  readonly isAiGenerated = true as const;
}
