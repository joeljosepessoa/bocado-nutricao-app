import { Injectable } from '@nestjs/common';
import { AiFeatureKey } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ExercisesService } from '../../../exercises/exercises.service';
import { FoodsService } from '../../../foods/foods.service';
import { requireClientId, type AiContextResult, type BuildContextParams } from '../ai-use-case.interface';
import { patientChatContext } from './patient-chat-context';
import { SYSTEM_PROMPT as TEMPLATE_DIET_PROMPT, TemplateDietChatUseCase } from './template-diet-chat.use-case';
import { SYSTEM_PROMPT as TEMPLATE_WORKOUT_PROMPT, TemplateWorkoutChatUseCase } from './template-workout-chat.use-case';

/** Troca a abertura "MODELO… (sem paciente)" e acrescenta as regras do paciente antes do formato de resposta. */
function forPatient(prompt: string, opening: string, rules: string[]): string {
  const [, ...rest] = prompt.split('\n');
  const body = [opening, ...rest].join('\n');
  return body.replace('\nResponda SOMENTE', `\n${rules.join('\n')}\n\nResponda SOMENTE`);
}

export const PATIENT_DIET_PROMPT = forPatient(
  TEMPLATE_DIET_PROMPT,
  'Você ajuda um nutricionista a montar o plano alimentar de UM paciente, conversando com ele. "modeloAtual" é a dieta atual desse paciente.',
  [
    'Regras do paciente ("paciente": idade, sexo, última avaliação e parte da anamnese — sem identificação):',
    'P1. Respeite alergias, intolerâncias, restrições e aversões: nunca use alimento que as contrarie; na dúvida, não use e explique em "warnings".',
    'P2. Use objetivo, preferências, rotina (refeições por dia, horários) e atividade física para escolher refeições, horários e quantidades.',
    'P3. Doenças, medicamentos, suplementos e hormônios: ajuste com prudência (ex.: menos açúcar no diabetes, menos sódio na hipertensão)',
    '    e diga em "warnings" o que o nutricionista deve conferir. Não diagnostique e não fale de remédio.',
    'P4. Para as metas (C1), use peso, altura, % de gordura e massa magra da última avaliação, idade, sexo, objetivo e atividade física',
    '    da anamnese — a não ser que o pedido traga outros números (aí valem os do pedido).',
    'P5. Não repita dados do paciente no "reply" além do necessário para explicar a escolha.',
  ],
);

export const PATIENT_WORKOUT_PROMPT = forPatient(
  TEMPLATE_WORKOUT_PROMPT,
  'Você ajuda um profissional a montar o treino de UM paciente, conversando com ele. "modeloAtual" é o treino atual desse paciente.',
  [
    'Regras do paciente ("paciente": idade, sexo, última avaliação e parte da anamnese — sem identificação):',
    'P1. Use objetivo, frequência/duração/modalidade de treino e nível de atividade para escolher divisão, volume e exercícios.',
    'P2. Doenças, cirurgias, medicamentos e hormônios: evite o que puder agravar (ex.: impacto com problema articular) e diga em "warnings"',
    '    o que o profissional deve conferir. Não diagnostique e não fale de remédio.',
    'P3. Não repita dados do paciente no "reply" além do necessário para explicar a escolha.',
  ],
);

/**
 * Conversa dentro do paciente — dieta. Mesma conferência da conversa dos Modelos (só catálogo, cálculo do
 * sistema, nada gravado), com os dados MÍNIMOS do paciente no contexto. Política client_consent: só com a
 * autorização de IA do próprio paciente (conferida pelo AiService antes de montar o contexto).
 */
@Injectable()
export class PatientDietChatUseCase extends TemplateDietChatUseCase {
  override readonly feature: AiFeatureKey = AiFeatureKey.patient_diet_chat;
  override readonly promptVersion: string = 'patient_diet_chat@v2';

  constructor(
    foodsService: FoodsService,
    private readonly prisma: PrismaService,
  ) {
    super(foodsService);
  }

  override async buildContext(params: BuildContextParams): Promise<AiContextResult> {
    const base = await super.buildContext(params);
    const { paciente, evaluationId } = await patientChatContext(this.prisma, params.professionalId, requireClientId(params.clientId));
    return { systemPrompt: PATIENT_DIET_PROMPT, context: { ...base.context, paciente }, contextRef: evaluationId };
  }
}

/** Conversa dentro do paciente — treino. */
@Injectable()
export class PatientWorkoutChatUseCase extends TemplateWorkoutChatUseCase {
  override readonly feature: AiFeatureKey = AiFeatureKey.patient_workout_chat;
  override readonly promptVersion: string = 'patient_workout_chat@v1';

  constructor(
    exercisesService: ExercisesService,
    private readonly prisma: PrismaService,
  ) {
    super(exercisesService);
  }

  override async buildContext(params: BuildContextParams): Promise<AiContextResult> {
    const base = await super.buildContext(params);
    const { paciente, evaluationId } = await patientChatContext(this.prisma, params.professionalId, requireClientId(params.clientId));
    return { systemPrompt: PATIENT_WORKOUT_PROMPT, context: { ...base.context, paciente }, contextRef: evaluationId };
  }
}
