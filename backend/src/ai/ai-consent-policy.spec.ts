import { AiFeatureKey } from '@prisma/client';
import { AI_CONSENT_POLICY } from './ai-consent-policy';

describe('AI_CONSENT_POLICY — política de consentimento por recurso', () => {
  it('cobre todos os recursos de IA existentes', () => {
    expect(Object.keys(AI_CONSENT_POLICY).sort()).toEqual(Object.values(AiFeatureKey).sort());
  });

  it('só organize_workout dispensa o consentimento da cliente (material do profissional); os demais exigem', () => {
    expect(AI_CONSENT_POLICY.organize_workout).toEqual({ clientConsentRequired: false, processingPolicy: 'professional_material' });
    for (const feature of ['draft_note', 'explain_evaluation', 'narrate_trend'] as const) {
      expect(AI_CONSENT_POLICY[feature]).toEqual({ clientConsentRequired: true, processingPolicy: 'client_consent' });
    }
  });
});
