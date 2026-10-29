/**
 * Formulários próprios do profissional: tipos de pergunta e validação das respostas.
 * Funções puras (sem banco) — o serviço só chama estas regras e grava.
 */
export const QUESTION_TYPES = ['short_text', 'long_text', 'number', 'scale', 'yes_no', 'single_choice', 'multiple_choice'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export interface FormQuestion {
  id: string;
  type: QuestionType;
  label: string;
  help?: string;
  required: boolean;
  /** Só "number": unidade mostrada ao lado (kg, cm, horas…). */
  unit?: string;
  /** Só escolha única/múltipla. */
  options?: string[];
}

export type Answer = string | number | boolean | string[] | null;
export type Answers = Record<string, Answer>;

export const MAX_QUESTIONS = 60;
export const MAX_OPTIONS = 30;
const MAX_LABEL = 300;
const MAX_HELP = 500;
const MAX_OPTION = 120;
const MAX_UNIT = 20;
const MAX_SHORT_TEXT = 300;
const MAX_LONG_TEXT = 5000;
export const SCALE_MIN = 0;
export const SCALE_MAX = 10;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/**
 * Confere e limpa as perguntas enviadas pelo painel. Devolve as perguntas normalizadas ou a lista de
 * problemas em português ("Pergunta 3: …").
 */
export function normalizeQuestions(input: unknown): { questions: FormQuestion[]; problems: string[] } {
  const problems: string[] = [];
  if (!Array.isArray(input)) return { questions: [], problems: ['Envie a lista de perguntas.'] };
  if (input.length === 0) problems.push('O formulário precisa de pelo menos uma pergunta.');
  if (input.length > MAX_QUESTIONS) problems.push(`No máximo ${MAX_QUESTIONS} perguntas por formulário.`);
  const ids = new Set<string>();
  const questions: FormQuestion[] = [];
  input.slice(0, MAX_QUESTIONS).forEach((raw, i) => {
    const where = `Pergunta ${i + 1}`;
    if (!isRecord(raw)) {
      problems.push(`${where}: formato inválido.`);
      return;
    }
    const id = text(raw.id);
    const type = raw.type as QuestionType;
    const label = text(raw.label);
    if (!id || id.length > 64) problems.push(`${where}: identificador inválido.`);
    else if (ids.has(id)) problems.push(`${where}: identificador repetido.`);
    ids.add(id);
    if (!QUESTION_TYPES.includes(type)) problems.push(`${where}: tipo de pergunta inválido.`);
    if (!label) problems.push(`${where}: escreva a pergunta.`);
    if (label.length > MAX_LABEL) problems.push(`${where}: a pergunta pode ter até ${MAX_LABEL} caracteres.`);
    const help = text(raw.help);
    if (help.length > MAX_HELP) problems.push(`${where}: a explicação pode ter até ${MAX_HELP} caracteres.`);
    const question: FormQuestion = { id, type, label, required: raw.required === true, ...(help ? { help } : {}) };
    if (type === 'number') {
      const unit = text(raw.unit);
      if (unit.length > MAX_UNIT) problems.push(`${where}: a unidade pode ter até ${MAX_UNIT} caracteres.`);
      if (unit) question.unit = unit;
    }
    if (type === 'single_choice' || type === 'multiple_choice') {
      const options = Array.isArray(raw.options) ? raw.options.map(text).filter(Boolean) : [];
      if (options.length < 2) problems.push(`${where}: coloque pelo menos 2 opções.`);
      if (options.length > MAX_OPTIONS) problems.push(`${where}: no máximo ${MAX_OPTIONS} opções.`);
      if (options.some((o) => o.length > MAX_OPTION)) problems.push(`${where}: cada opção pode ter até ${MAX_OPTION} caracteres.`);
      if (new Set(options.map((o) => o.toLocaleLowerCase('pt-BR'))).size !== options.length) problems.push(`${where}: há opções repetidas.`);
      question.options = options;
    }
    questions.push(question);
  });
  return { questions, problems };
}

const isEmpty = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);

/**
 * Confere as respostas contra as perguntas (as gravadas na resposta, não as atuais do formulário).
 * Resposta de pergunta que não existe é ignorada; obrigatória vazia é recusada.
 */
export function normalizeAnswers(questions: FormQuestion[], input: unknown): { answers: Answers; problems: string[] } {
  const problems: string[] = [];
  const answers: Answers = {};
  const source = isRecord(input) ? input : {};
  questions.forEach((q, i) => {
    const where = `"${q.label.length > 60 ? `${q.label.slice(0, 57)}…` : q.label}"`;
    const raw = source[q.id];
    if (isEmpty(raw)) {
      if (q.required) problems.push(`${where} é obrigatória.`);
      answers[q.id] = null;
      return;
    }
    switch (q.type) {
      case 'short_text':
      case 'long_text': {
        const value = typeof raw === 'string' ? raw.trim() : String(raw);
        const max = q.type === 'short_text' ? MAX_SHORT_TEXT : MAX_LONG_TEXT;
        if (value.length > max) problems.push(`${where}: até ${max} caracteres.`);
        answers[q.id] = value.slice(0, max);
        return;
      }
      case 'number':
      case 'scale': {
        const value = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
        if (!Number.isFinite(value)) problems.push(`${where}: informe um número.`);
        else if (q.type === 'scale' && (!Number.isInteger(value) || value < SCALE_MIN || value > SCALE_MAX)) problems.push(`${where}: escolha de ${SCALE_MIN} a ${SCALE_MAX}.`);
        answers[q.id] = Number.isFinite(value) ? value : null;
        return;
      }
      case 'yes_no': {
        if (typeof raw !== 'boolean') problems.push(`${where}: responda sim ou não.`);
        answers[q.id] = typeof raw === 'boolean' ? raw : null;
        return;
      }
      case 'single_choice': {
        const value = typeof raw === 'string' ? raw : '';
        if (!q.options?.includes(value)) problems.push(`${where}: escolha uma das opções.`);
        answers[q.id] = q.options?.includes(value) ? value : null;
        return;
      }
      case 'multiple_choice': {
        const values = Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : [];
        const valid = (q.options ?? []).filter((o) => values.includes(o));
        if (valid.length !== values.length || values.length === 0) problems.push(`${where}: escolha entre as opções.`);
        answers[q.id] = valid;
        return;
      }
      default:
        answers[q.id] = null;
        problems.push(`Pergunta ${i + 1}: tipo desconhecido.`);
    }
  });
  return { answers, problems };
}

/** Quantas perguntas têm resposta (para a lista do paciente). */
export function answeredCount(questions: FormQuestion[], answers: Answers): number {
  return questions.filter((q) => !isEmpty(answers[q.id])).length;
}
