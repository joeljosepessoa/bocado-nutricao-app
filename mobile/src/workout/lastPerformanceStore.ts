import { asyncStorageStore } from '../offline/storage';
import type { CreateExecutionLogInput } from '../types/api';
import { localLastFromPayload, type LocalLastPerformance } from './executionModel';

const STORAGE_KEY = '@bocado/client/last-performance';

/** Última carga de cada exercício guardada no aparelho — cobre o treino que ainda está na fila sem internet. */
export async function readLocalLastPerformance(): Promise<LocalLastPerformance> {
  try {
    const raw = await asyncStorageStore.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** Guarda as cargas digitadas (mesmo sem finalizar) por cima do que já estava guardado. */
export async function rememberTypedLoads(memory: LocalLastPerformance): Promise<void> {
  if (Object.keys(memory).length === 0) return;
  try {
    const merged = { ...(await readLocalLastPerformance()), ...memory };
    await asyncStorageStore.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // Sem espaço/armazenamento: fica o rascunho do dia e o que estiver no servidor.
  }
}

/** Junta o treino que acabou de ser feito ao que já estava guardado e devolve o resultado. */
export async function rememberLastPerformance(payload: CreateExecutionLogInput): Promise<LocalLastPerformance> {
  const merged = { ...(await readLocalLastPerformance()), ...localLastFromPayload(payload) };
  try {
    await asyncStorageStore.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // Sem espaço/armazenamento: a próxima vez usa só o que vier do servidor.
  }
  return merged;
}
