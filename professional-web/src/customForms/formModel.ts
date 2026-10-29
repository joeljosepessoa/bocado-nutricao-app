import type { FormAnswer, FormAnswers, FormQuestion, FormQuestionType } from '../types/api';

/** Mesmas regras do servidor (backend/src/custom-forms/custom-form-rules.ts) — ele é quem decide. */
export const QUESTION_TYPE_LABELS: Record<FormQuestionType, string> = {
  short_text: 'Resposta curta',
  long_text: 'Texto longo',
  number: 'Número',
  scale: 'Escala de 0 a 10',
  yes_no: 'Sim ou não',
  single_choice: 'Escolha única',
  multiple_choice: 'Escolha múltipla',
};
export const QUESTION_TYPES = Object.keys(QUESTION_TYPE_LABELS) as FormQuestionType[];

export const newQuestionId = () => `q_${Math.random().toString(36).slice(2, 10)}`;

export function newQuestion(type: FormQuestionType = 'short_text'): FormQuestion {
  return {
    id: newQuestionId(),
    type,
    label: '',
    required: false,
    ...(type === 'single_choice' || type === 'multiple_choice' ? { options: ['', ''] } : {}),
  };
}

/** Troca o tipo mantendo o texto; opções só ficam nos tipos de escolha. */
export function changeType(q: FormQuestion, type: FormQuestionType): FormQuestion {
  const isChoice = type === 'single_choice' || type === 'multiple_choice';
  const { options, unit, ...rest } = q;
  return {
    ...rest,
    type,
    ...(isChoice ? { options: options && options.length >= 2 ? options : ['', ''] } : {}),
    ...(type === 'number' && unit ? { unit } : {}),
  };
}

/** Problemas antes de salvar o formulário (o servidor confere de novo). */
export function formProblems(name: string, questions: FormQuestion[]): string[] {
  const problems: string[] = [];
  if (!name.trim()) problems.push('Dê um nome ao formulário.');
  if (questions.length === 0) problems.push('Adicione pelo menos uma pergunta.');
  questions.forEach((q, i) => {
    if (!q.label.trim()) problems.push(`Pergunta ${i + 1}: escreva a pergunta.`);
    if (q.type === 'single_choice' || q.type === 'multiple_choice') {
      const options = (q.options ?? []).map((o) => o.trim()).filter(Boolean);
      if (options.length < 2) problems.push(`Pergunta ${i + 1}: coloque pelo menos 2 opções.`);
      else if (new Set(options.map((o) => o.toLocaleLowerCase('pt-BR'))).size !== options.length) problems.push(`Pergunta ${i + 1}: há opções repetidas.`);
    }
  });
  return problems;
}

/** Limpa antes de enviar: tira opções vazias e espaços. */
export function cleanQuestions(questions: FormQuestion[]): FormQuestion[] {
  return questions.map((q) => ({
    ...q,
    label: q.label.trim(),
    ...(q.help !== undefined ? { help: q.help.trim() } : {}),
    ...(q.unit !== undefined ? { unit: q.unit.trim() } : {}),
    ...(q.options ? { options: q.options.map((o) => o.trim()).filter(Boolean) } : {}),
  }));
}

const empty = (a: FormAnswer | undefined) => a === null || a === undefined || (typeof a === 'string' && a.trim() === '') || (Array.isArray(a) && a.length === 0);

/** Obrigatórias sem resposta (para avisar antes de salvar). */
export function missingRequired(questions: FormQuestion[], answers: FormAnswers): FormQuestion[] {
  return questions.filter((q) => q.required && empty(answers[q.id]));
}

/** Resposta em texto para a leitura: "7 / 10", "Sim", "72,5 kg", "Doces, Tempo", "—". */
export function answerText(q: FormQuestion, a: FormAnswer | undefined): string {
  if (empty(a)) return '—';
  switch (q.type) {
    case 'yes_no':
      return a ? 'Sim' : 'Não';
    case 'scale':
      return `${a} / 10`;
    case 'number':
      return `${String(a).replace('.', ',')}${q.unit ? ` ${q.unit}` : ''}`;
    case 'multiple_choice':
      return (a as string[]).join(', ');
    default:
      return String(a);
  }
}

/** Formulários prontos para começar (o profissional ajusta como quiser). */
export const STARTER_FORMS: Array<{ key: string; name: string; description: string; questions: Array<Omit<FormQuestion, 'id'>> }> = [
  {
    key: 'checkin',
    name: 'Check-in semanal',
    description: 'Como foi a semana do paciente — para preencher no retorno.',
    questions: [
      { type: 'scale', label: 'Fome durante a semana', help: '0 = nenhuma, 10 = muita', required: true },
      { type: 'scale', label: 'Saciedade depois das refeições', help: '0 = nenhuma, 10 = muita', required: false },
      { type: 'single_choice', label: 'Quanto conseguiu seguir a dieta?', options: ['Quase tudo', 'Mais da metade', 'Metade', 'Menos da metade'], required: true },
      { type: 'number', label: 'Treinos feitos na semana', unit: 'treinos', required: false },
      { type: 'number', label: 'Água por dia', unit: 'litros', required: false },
      { type: 'single_choice', label: 'Qualidade do sono', options: ['Boa', 'Regular', 'Ruim'], required: false },
      { type: 'single_choice', label: 'Funcionamento do intestino', options: ['Normal', 'Preso', 'Solto'], required: false },
      {
        type: 'multiple_choice',
        label: 'Maiores dificuldades',
        options: ['Fim de semana', 'Doces', 'Falta de tempo', 'Comer fora', 'Ansiedade', 'Fome à noite'],
        required: false,
      },
      { type: 'long_text', label: 'Observações', required: false },
    ],
  },
  {
    key: 'parq',
    name: 'PAR-Q (prontidão para atividade física)',
    description: 'Triagem antes de começar exercícios. Qualquer "sim" pede liberação médica.',
    questions: [
      { type: 'yes_no', label: 'Algum médico já disse que você tem problema de coração e que só deve fazer atividade física com orientação médica?', required: true },
      { type: 'yes_no', label: 'Você sente dor no peito quando faz atividade física?', required: true },
      { type: 'yes_no', label: 'No último mês, sentiu dor no peito sem estar fazendo atividade física?', required: true },
      { type: 'yes_no', label: 'Você perde o equilíbrio por causa de tontura ou já desmaiou?', required: true },
      { type: 'yes_no', label: 'Tem algum problema nos ossos ou nas articulações que pode piorar com atividade física?', required: true },
      { type: 'yes_no', label: 'Toma algum remédio para pressão arterial ou para o coração?', required: true },
      { type: 'yes_no', label: 'Existe algum outro motivo para você não fazer atividade física?', required: true },
      { type: 'long_text', label: 'Observações', required: false },
    ],
  },
];

export const starterQuestions = (key: string): FormQuestion[] =>
  (STARTER_FORMS.find((s) => s.key === key)?.questions ?? []).map((q) => ({ ...q, id: newQuestionId() }));
