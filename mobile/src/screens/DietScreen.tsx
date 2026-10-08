import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ScreenContainer } from '../components/ScreenContainer';
import * as api from '../api/endpoints';
import { buildDietPresentation } from '../diet/dietPresentation';
import { dietScreenReducer, initialDietScreenState } from '../diet/dietScreenState';
import { DayIntro, DayTabs } from '../diet/components/DayTabs';
import { DietHeader, GuidelinesCard, SupplementsCard } from '../diet/components/DietSections';
import { DietEmptyState, DietErrorState, DietSkeleton, RefreshFailedBanner } from '../diet/components/DietStates';
import { MealCard } from '../diet/components/MealCard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dietDays } from '../diet/dietView';
import { DIET_DAY_STORAGE_KEY, dietDayIndex, nextMeal } from '../dashboard/dashboardModel';

/**
 * "Minha dieta": dia → refeição → opções / blocos "escolha 1" / fixos →
 * alimentos, depois suplementação e orientações. O que aparece vem de
 * `buildDietPresentation` (puro); aqui ficam só o carregamento e o dia escolhido.
 */
export function DietScreen() {
  const [state, dispatch] = useReducer(dietScreenReducer, initialDietScreenState);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const lastRequest = useRef(0);

  const load = useCallback(async () => {
    const request = ++lastRequest.current;
    dispatch({ type: 'load' });
    try {
      const diet = await api.getCurrentDiet();
      if (request === lastRequest.current) dispatch({ type: 'loaded', diet });
    } catch {
      // Erro de rede/API nunca vira "dieta não publicada".
      if (request === lastRequest.current) dispatch({ type: 'failed' });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const diet = state.status === 'content' ? state.diet : null;
  const presentation = useMemo(() => (diet ? buildDietPresentation(diet) : null), [diet]);

  // Abre no dia escolhido no Dashboard (treino/descanso), lembrado no aparelho.
  useEffect(() => {
    if (!diet || selectedDay !== null) return;
    AsyncStorage.getItem(DIET_DAY_STORAGE_KEY)
      .catch(() => null)
      .then((saved) => setSelectedDay(Math.max(dietDayIndex(dietDays(diet), saved === 'rest' ? 'rest' : 'training'), 0)));
  }, [diet, selectedDay]);

  if (state.status === 'loading') {
    return (
      <ScreenContainer>
        <DietSkeleton />
      </ScreenContainer>
    );
  }

  if (state.status === 'error') {
    return (
      <ScreenContainer onRefresh={load} refreshing={false}>
        <DietErrorState onRetry={load} retrying={state.retrying} />
      </ScreenContainer>
    );
  }

  if (state.status === 'empty' || !presentation) {
    return (
      <ScreenContainer onRefresh={load} refreshing={state.status === 'empty' && state.refreshing}>
        <DietEmptyState />
      </ScreenContainer>
    );
  }

  const dayIndex = Math.min(selectedDay ?? 0, Math.max(presentation.days.length - 1, 0));
  const day = presentation.days[dayIndex];
  // A próxima refeição do dia (pelo horário) já vem aberta; sem horários, a primeira.
  const upcoming = day ? nextMeal(day.meals, new Date()) : null;
  const openKey = day?.meals.find((m) => upcoming && m.name === upcoming.name && m.time === upcoming.time)?.key ?? day?.meals[0]?.key;

  return (
    <ScreenContainer onRefresh={load} refreshing={state.status === 'content' && state.refreshing}>
      {state.status === 'content' && state.refreshFailed ? <RefreshFailedBanner onRetry={load} /> : null}
      <DietHeader title={presentation.title} instruction={presentation.instruction} />
      {presentation.showDayTabs ? <DayTabs days={presentation.days} selected={dayIndex} onSelect={setSelectedDay} /> : null}
      {day ? <DayIntro day={day} showTitle={false} /> : null}
      {day?.meals.map((meal) => (
        <MealCard key={`${dayIndex}-${meal.key}`} meal={meal} initiallyOpen={meal.key === openKey} />
      ))}
      <SupplementsCard supplements={presentation.supplements} />
      <GuidelinesCard guidelines={presentation.guidelines} />
    </ScreenContainer>
  );
}
