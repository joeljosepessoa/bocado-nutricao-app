import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ScreenContainer } from '../components/ScreenContainer';
import * as api from '../api/endpoints';
import { buildDietPresentation } from '../diet/dietPresentation';
import { dietScreenReducer, initialDietScreenState } from '../diet/dietScreenState';
import { DayIntro, DayTabs } from '../diet/components/DayTabs';
import { DietHeader, GuidelinesCard, SupplementsCard } from '../diet/components/DietSections';
import { DietEmptyState, DietErrorState, DietSkeleton, RefreshFailedBanner } from '../diet/components/DietStates';
import { MealCard } from '../diet/components/MealCard';

/**
 * "Minha dieta": dia → refeição → opções / blocos "escolha 1" / fixos →
 * alimentos, depois suplementação e orientações. O que aparece vem de
 * `buildDietPresentation` (puro); aqui ficam só o carregamento e o dia escolhido.
 */
export function DietScreen() {
  const [state, dispatch] = useReducer(dietScreenReducer, initialDietScreenState);
  const [selectedDay, setSelectedDay] = useState(0);
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

  const dayIndex = Math.min(selectedDay, Math.max(presentation.days.length - 1, 0));
  const day = presentation.days[dayIndex];

  return (
    <ScreenContainer onRefresh={load} refreshing={state.status === 'content' && state.refreshing}>
      {state.status === 'content' && state.refreshFailed ? <RefreshFailedBanner onRetry={load} /> : null}
      <DietHeader title={presentation.title} instruction={presentation.instruction} />
      {presentation.showDayTabs ? <DayTabs days={presentation.days} selected={dayIndex} onSelect={setSelectedDay} /> : null}
      {day ? <DayIntro day={day} showTitle={false} /> : null}
      {day?.meals.map((meal) => (
        <MealCard key={meal.key} meal={meal} />
      ))}
      <SupplementsCard supplements={presentation.supplements} />
      <GuidelinesCard guidelines={presentation.guidelines} />
    </ScreenContainer>
  );
}
