import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../../common/prisma/prisma.service';

const round1 = (value: number | null | undefined) => (value == null ? null : Math.round(value * 10) / 10);
const SEX_TEXT: Record<string, 'feminino' | 'masculino'> = { female: 'feminino', feminino: 'feminino', f: 'feminino', male: 'masculino', masculino: 'masculino', m: 'masculino' };

function ageAt(birthDate: Date, now: Date) {
  const age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < birthDate.getUTCMonth() || (now.getUTCMonth() === birthDate.getUTCMonth() && now.getUTCDate() < birthDate.getUTCDate());
  return beforeBirthday ? age - 1 : age;
}

/** Itens de medicamento/suplemento/hormônio: só nome e dose (o resto da linha não vai). */
function items(value: unknown): Array<{ nome: string; dose: string | null }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const row = (item ?? {}) as Record<string, unknown>;
      const nome = typeof row.name === 'string' ? row.name.trim() : '';
      const dose = typeof row.dosage === 'string' && row.dosage.trim() ? row.dosage.trim() : null;
      return { nome, dose };
    })
    .filter((item) => item.nome);
}

const text = (value: string | null | undefined) => (value && value.trim() ? value.trim() : null);

/** Remove o que ficou vazio, para o contexto não carregar campos sem informação. */
function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(
      ([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0) && !(typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0),
    ),
  ) as Partial<T>;
}

/**
 * Dados do paciente que a conversa da IA recebe: idade, sexo, números da última avaliação e a anamnese
 * inteira (pedido do profissional: a IA precisa conhecer o paciente) — MENOS o que só identifica a pessoa
 * e não diz nada de saúde ou rotina (LGPD): nome, e-mail, telefone, CPF, RG e endereço. Fotos, pressão e
 * glicemia também não vão. Quem chama já confirmou que o paciente é do profissional e que ele autorizou a IA.
 */
export async function patientChatContext(prisma: PrismaService, professionalId: string, clientId: string, now = new Date()) {
  const client = await prisma.client.findFirst({ where: { id: clientId, professionalId }, select: { birthDate: true, gender: true } });
  if (!client) throw new NotFoundException('Cliente não encontrado.');

  const evaluation = await prisma.physicalEvaluation.findFirst({
    where: { clientId, professionalId },
    orderBy: { evaluatedAt: 'desc' },
    select: {
      id: true,
      evaluatedAt: true,
      ageAtEvaluation: true,
      biologicalSexForCalculation: true,
      heightCm: true,
      weightKg: true,
      calculatedMetrics: { select: { bodyFatPercent: true, leanMassKg: true } },
      bioimpedance: { select: { weightKg: true, bodyFatPercent: true, leanMassKg: true, basalMetabolicRateKcal: true } },
    },
  });

  const anamnesis = await prisma.anamnesis.findFirst({ where: { clientId, professionalId } });
  if (anamnesis) {
    // A ficha foi lida (pela IA, a pedido do profissional): fica no registro de acesso, como qualquer leitura.
    await prisma.anamnesisAuditLog.create({ data: { professionalId, clientId, action: 'read' } });
  }

  const sex = evaluation?.biologicalSexForCalculation
    ? SEX_TEXT[evaluation.biologicalSexForCalculation]
    : (SEX_TEXT[(client.gender ?? '').trim().toLowerCase()] ?? null);

  const paciente = compact({
    idadeAnos: client.birthDate ? ageAt(client.birthDate, now) : (evaluation?.ageAtEvaluation ?? null),
    sexo: sex,
    ultimaAvaliacao: evaluation
      ? compact({
          data: evaluation.evaluatedAt.toISOString().slice(0, 10),
          pesoKg: round1(evaluation.weightKg ?? evaluation.bioimpedance?.weightKg),
          alturaCm: round1(evaluation.heightCm),
          gorduraCorporalPercent: round1(evaluation.calculatedMetrics?.bodyFatPercent ?? evaluation.bioimpedance?.bodyFatPercent),
          massaMagraKg: round1(evaluation.calculatedMetrics?.leanMassKg ?? evaluation.bioimpedance?.leanMassKg),
          taxaMetabolicaBasalKcal: round1(evaluation.bioimpedance?.basalMetabolicRateKcal),
        })
      : null,
    anamnese: anamnesis
      ? compact({
          profissao: text(anamnesis.occupation),
          estadoCivil: text(anamnesis.maritalStatus),
          objetivos: anamnesis.goals,
          objetivoDescricao: text(anamnesis.goalDescription),
          doencas: anamnesis.conditions,
          outrasDoencas: text(anamnesis.otherConditions),
          medicamentos: items(anamnesis.medications),
          suplementos: items(anamnesis.supplements),
          hormonios: items(anamnesis.hormones),
          cirurgias: text(anamnesis.surgeries),
          alergias: text(anamnesis.allergies),
          historicoFamiliar: anamnesis.familyHistory,
          habitos: compact({
            fumo: text(anamnesis.smoking),
            alcool: text(anamnesis.alcohol),
            agua: text(anamnesis.waterIntake),
            sonoHoras: text(anamnesis.sleepHours),
            sonoQualidade: text(anamnesis.sleepQuality),
            estresse: text(anamnesis.stressLevel),
            intestino: text(anamnesis.bowelFrequency),
          }),
          atividadeFisica: compact({
            frequencia: text(anamnesis.trainingFrequency),
            duracao: text(anamnesis.trainingDuration),
            modalidade: text(anamnesis.trainingModality),
            cardio: text(anamnesis.cardio),
            passosPorDia: text(anamnesis.dailySteps),
          }),
          alimentacao: compact({
            refeicoesPorDia: text(anamnesis.mealsPerDay),
            horarios: text(anamnesis.mealTimes),
            preferencias: text(anamnesis.foodPreferences),
            intolerancias: text(anamnesis.intolerances),
            restricoes: text(anamnesis.restrictions),
            aversoes: text(anamnesis.aversions),
          }),
          observacoes: text(anamnesis.notes),
        })
      : null,
  });

  return { paciente, evaluationId: evaluation?.id };
}
