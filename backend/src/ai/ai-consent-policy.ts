import { AiFeatureKey, AiProcessingPolicy } from '@prisma/client';

export interface AiFeatureConsentPolicy {
  /** Exige Client.aiDataProcessingConsentAt (consentimento específico do próprio cliente). */
  clientConsentRequired: boolean;
  /** Gravado em AiInteractionLog.processingPolicy — qual regra liberou a chamada. */
  processingPolicy: AiProcessingPolicy;
}

/**
 * ÚNICO lugar que decide, por recurso de IA, se o consentimento do cliente é
 * exigido. `Record<AiFeatureKey, …>` obriga todo recurso novo a declarar a
 * sua política (sem ela o código não compila).
 *
 * - client_consent: o contexto enviado ao provedor contém dado do cliente
 *   (nome, avaliação física, evolução; em create_diet: idade, sexo e a última
 *   avaliação, sem nome) → só com consentimento específico.
 * - professional_material: o contexto é EXCLUSIVAMENTE o material escrito
 *   pelo profissional (organize_workout/organize_diet enviam só o texto do
 *   treino/da dieta; o sistema não acrescenta nome, id, avaliação, peso,
 *   exames nem histórico do cliente). Se o
 *   próprio texto colado contiver dado pessoal, isso não é detectado aqui —
 *   o painel orienta a não incluir.
 *
 * Política jurídica definitiva (base legal, textos, DPA) ainda será revisada:
 * docs/IA-PRIVACIDADE.md.
 */
export const AI_CONSENT_POLICY: Readonly<Record<AiFeatureKey, AiFeatureConsentPolicy>> = {
  organize_workout: { clientConsentRequired: false, processingPolicy: AiProcessingPolicy.professional_material },
  organize_diet: { clientConsentRequired: false, processingPolicy: AiProcessingPolicy.professional_material },
  // Envia dados mínimos do cliente (idade, sexo, última avaliação) → só com o consentimento dele.
  create_diet: { clientConsentRequired: true, processingPolicy: AiProcessingPolicy.client_consent },
  draft_note: { clientConsentRequired: true, processingPolicy: AiProcessingPolicy.client_consent },
  explain_evaluation: { clientConsentRequired: true, processingPolicy: AiProcessingPolicy.client_consent },
  narrate_trend: { clientConsentRequired: true, processingPolicy: AiProcessingPolicy.client_consent },
};
