import { answeredCount, normalizeAnswers, normalizeQuestions, type FormQuestion } from './custom-form-rules';

const QUESTIONS: FormQuestion[] = [
  { id: 'fome', type: 'scale', label: 'Fome durante a semana (0 a 10)', required: true },
  { id: 'peso', type: 'number', label: 'Peso em casa', unit: 'kg', required: false },
  { id: 'treinos', type: 'yes_no', label: 'Treinou 3x ou mais?', required: true },
  { id: 'intestino', type: 'single_choice', label: 'Intestino', options: ['Normal', 'Preso', 'Solto'], required: false },
  { id: 'dificuldades', type: 'multiple_choice', label: 'Dificuldades', options: ['Fim de semana', 'Doces', 'Tempo'], required: false },
  { id: 'obs', type: 'long_text', label: 'Observações', required: false },
];

describe('formulários próprios — perguntas', () => {
  it('limpa espaços, mantém só o que o tipo usa e aceita perguntas válidas', () => {
    const { questions, problems } = normalizeQuestions([
      { id: 'a', type: 'short_text', label: '  Como foi a semana?  ', required: true, options: ['x', 'y'], unit: 'kg' },
      { id: 'b', type: 'number', label: 'Horas de sono', unit: ' h ', required: false },
      { id: 'c', type: 'single_choice', label: 'Humor', options: [' Bom ', '', 'Ruim'] },
    ]);
    expect(problems).toEqual([]);
    expect(questions).toEqual([
      { id: 'a', type: 'short_text', label: 'Como foi a semana?', required: true },
      { id: 'b', type: 'number', label: 'Horas de sono', unit: 'h', required: false },
      { id: 'c', type: 'single_choice', label: 'Humor', options: ['Bom', 'Ruim'], required: false },
    ]);
  });

  it('aponta o problema de cada pergunta', () => {
    expect(normalizeQuestions([]).problems).toEqual(['O formulário precisa de pelo menos uma pergunta.']);
    const { problems } = normalizeQuestions([
      { id: 'a', type: 'short_text', label: '' },
      { id: 'a', type: 'qualquer', label: 'X' },
      { id: 'c', type: 'multiple_choice', label: 'Opções', options: ['Só uma'] },
      { id: 'd', type: 'single_choice', label: 'Rep', options: ['Sim', 'sim'] },
    ]);
    expect(problems).toEqual([
      'Pergunta 1: escreva a pergunta.',
      'Pergunta 2: identificador repetido.',
      'Pergunta 2: tipo de pergunta inválido.',
      'Pergunta 3: coloque pelo menos 2 opções.',
      'Pergunta 4: há opções repetidas.',
    ]);
  });
});

describe('formulários próprios — respostas', () => {
  it('confere cada tipo e aceita vírgula em número', () => {
    const { answers, problems } = normalizeAnswers(QUESTIONS, {
      fome: 7,
      peso: '72,5',
      treinos: true,
      intestino: 'Normal',
      dificuldades: ['Doces', 'Tempo'],
      obs: '  Comeu fora 2x  ',
      inventada: 'ignorada',
    });
    expect(problems).toEqual([]);
    expect(answers).toEqual({ fome: 7, peso: 72.5, treinos: true, intestino: 'Normal', dificuldades: ['Doces', 'Tempo'], obs: 'Comeu fora 2x' });
    expect(answeredCount(QUESTIONS, answers)).toBe(6);
  });

  it('recusa obrigatória vazia, escala fora de 0–10 e opção que não existe', () => {
    const { problems, answers } = normalizeAnswers(QUESTIONS, { fome: 11, intestino: 'Ótimo', dificuldades: ['Doces', 'Outra'] });
    expect(problems).toEqual([
      '"Fome durante a semana (0 a 10)": escolha de 0 a 10.',
      '"Treinou 3x ou mais?" é obrigatória.',
      '"Intestino": escolha uma das opções.',
      '"Dificuldades": escolha entre as opções.',
    ]);
    expect(answers.peso).toBeNull();
  });
});
