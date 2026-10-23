import { describe, expect, it } from 'vitest';
import type { DietTemplateContent, WorkoutTemplateContent } from '../../types/api';
import { addDay, draftProblems, draftToTemplateContent, emptyDietDraft, FOOD_LEFT_CATALOG, removeDay, templateToDraft } from '../../dietAssistant/draft';
import {
  addDay as addWorkoutDay,
  draftProblems as workoutProblems,
  draftToPayload as workoutToPayload,
  EXERCISE_LEFT_CATALOG,
  templateToDraft as workoutTemplateToDraft,
} from '../../workoutAssistant/draft';

const dietContent: DietTemplateContent = {
  objective: 'Perda de gordura',
  days: [
    {
      label: 'Dia de treino',
      kind: 'training',
      usageNotes: 'Segunda a sexta',
      meals: [
        {
          name: 'Café da manhã',
          time: '07:00',
          notes: null,
          groups: [
            { kind: 'fixed', label: null, choices: [{ label: null, foods: [{ customFoodName: 'Pão integral', foodId: 'f-pao', quantity: 2, unit: 'slice', notes: null }] }] },
            {
              kind: 'alternatives',
              label: 'Fruta',
              choices: [
                { label: null, foods: [{ customFoodName: 'Banana', foodId: 'f-banana', quantity: 1, quantityMax: 2, unit: 'unit', notes: null }] },
                { label: null, foods: [{ customFoodName: 'Salada de folhas', isFreeQuantity: true, notes: 'à vontade' }] },
              ],
            },
          ],
        },
      ],
    },
    {
      label: 'Dia de descanso',
      kind: 'rest',
      usageNotes: null,
      meals: [{ name: 'Almoço', time: null, notes: null, groups: [{ kind: 'fixed', label: null, choices: [{ label: null, foods: [{ customFoodName: 'Frango', foodId: 'f-frango', quantity: 120, unit: 'g', notes: null }] }] }] }],
    },
  ],
  supplements: [{ name: 'Creatina', quantity: 3, quantityMax: 5, unitText: 'g', timing: 'Pós-treino', notes: null }],
  patientGuidelines: 'Beber 2 L de água.',
};

const catalog = [
  { id: 'f-pao', name: 'Pão de forma integral' },
  { id: 'f-banana', name: 'Banana prata' },
  { id: 'f-frango', name: 'Peito de frango grelhado' },
];

describe('Modelo de dieta ↔ editor', () => {
  it('abrir e salvar sem mexer devolve exatamente o mesmo conteúdo', () => {
    const draft = templateToDraft(dietContent, catalog);
    expect(draftProblems(draft)).toEqual([]);
    expect(draftToTemplateContent(draft, 'Perda de gordura')).toEqual(dietContent);
  });

  it('o nome escrito continua sendo o que o paciente vê; o catálogo fica ligado para o cálculo', () => {
    const food = templateToDraft(dietContent, catalog).days[0].meals[0].groups[0].choices[0].foods[0];
    expect(food).toMatchObject({ name: 'Pão integral', food: { id: 'f-pao', name: 'Pão de forma integral' }, quantity: 2, unit: 'slice' });
  });

  it('alimento que saiu do catálogo: mantém o nome escrito, fica sem cálculo e avisa', () => {
    const draft = templateToDraft(dietContent, catalog.filter((f) => f.id !== 'f-banana'));
    const banana = draft.days[0].meals[0].groups[1].choices[0].foods[0];
    expect(banana).toMatchObject({ name: 'Banana', food: null, notices: [FOOD_LEFT_CATALOG] });
    expect(draftProblems(draft)).toEqual([]);
  });

  it('modelo novo começa com um dia e uma refeição; "+ Dia" nomeia os dias e remover nunca apaga o último', () => {
    const draft = emptyDietDraft();
    expect(draft.days).toHaveLength(1);
    expect(draft.days[0].meals).toHaveLength(1);
    const two = addDay(draft);
    expect(two.days.map((d) => d.label)).toEqual(['Dia 1', 'Dia 2']);
    const one = removeDay(two, two.days[1].key);
    expect(one.days).toHaveLength(1);
    expect(removeDay(one, one.days[0].key).days).toHaveLength(1);
  });
});

const workoutContent: WorkoutTemplateContent = {
  objective: 'Hipertrofia',
  days: [
    {
      name: 'Treino A',
      notes: 'Peito e tríceps',
      exercises: [
        {
          exerciseId: 'ex-supino',
          notes: null,
          sets: [
            { reps: 10, repsMin: null, repsMax: null, loadValue: 40, loadUnit: 'kg', durationSeconds: null, distanceMeters: null, restSeconds: 60, tempo: null, notes: null },
            { reps: null, repsMin: 8, repsMax: 12, loadValue: null, loadUnit: null, durationSeconds: null, distanceMeters: null, restSeconds: 90, tempo: '3-0-1', notes: null },
          ],
        },
      ],
    },
  ],
};

const exercises = [{ id: 'ex-supino', name: 'Supino reto', muscleGroup: 'Peito', equipment: 'Barra', imageUrl: null }];

describe('Modelo de treino ↔ editor', () => {
  it('abrir e salvar sem mexer devolve os mesmos dias, exercícios e séries', () => {
    const draft = workoutTemplateToDraft(workoutContent, exercises);
    expect(workoutProblems(draft)).toEqual([]);
    expect(workoutToPayload(draft)).toEqual({ days: workoutContent.days });
  });

  it('série salva sem alguns campos (JSON) vira "repetições exatas" e não faixa', () => {
    const partial = { days: [{ name: 'A', notes: null, exercises: [{ exerciseId: 'ex-supino', notes: null, sets: [{ reps: 12 }] }] }] } as unknown as WorkoutTemplateContent;
    const set = workoutTemplateToDraft(partial, exercises).days[0].exercises[0].sets[0];
    expect(set).toMatchObject({ repsMode: 'exact', reps: 12, repsMin: null, repsMax: null });
  });

  it('exercício que saiu do catálogo: avisa e pede para escolher outro antes de salvar', () => {
    const draft = workoutTemplateToDraft(workoutContent, []);
    expect(draft.days[0].exercises[0]).toMatchObject({ exercise: null, notices: [EXERCISE_LEFT_CATALOG] });
    expect(workoutProblems(draft).length).toBeGreaterThan(0);
  });

  it('"+ Dia de treino" segue as letras: Treino B, Treino C', () => {
    const draft = addWorkoutDay(addWorkoutDay(workoutTemplateToDraft(workoutContent, exercises)));
    expect(draft.days.map((d) => d.name)).toEqual(['Treino A', 'Treino B', 'Treino C']);
  });
});
