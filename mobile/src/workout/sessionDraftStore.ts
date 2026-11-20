import { asyncStorageStore } from '../offline/storage';
import type { ExecutionDraft } from './executionModel';

const KEY_PREFIX = '@bocado/client/workout-draft:';
/** Treino deixado pela metade por mais que isto volta zerado (o peso da última vez continua vindo preenchido). */
export const DRAFT_MAX_AGE_MS = 18 * 60 * 60 * 1000;

interface StoredDrafts {
  [sessionKey: string]: { savedAt: string; draft: ExecutionDraft };
}

const keyFor = (userId: string) => `${KEY_PREFIX}${userId}`;

async function readAll(userId: string): Promise<StoredDrafts> {
  try {
    const raw = await asyncStorageStore.getItem(keyFor(userId));
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function writeAll(userId: string, drafts: StoredDrafts): Promise<void> {
  try {
    await asyncStorageStore.setItem(keyFor(userId), JSON.stringify(drafts));
  } catch {
    // Sem armazenamento: o treino continua funcionando, só não sobrevive a fechar o app.
  }
}

/** Rascunhos ainda válidos deste paciente, por treino/dia. */
export async function readWorkoutDrafts(userId: string, now = Date.now()): Promise<Record<string, ExecutionDraft>> {
  const all = await readAll(userId);
  const result: Record<string, ExecutionDraft> = {};
  for (const [key, entry] of Object.entries(all)) {
    const age = now - new Date(entry?.savedAt).getTime();
    if (entry?.draft && typeof entry.draft === 'object' && age >= 0 && age <= DRAFT_MAX_AGE_MS) result[key] = entry.draft;
  }
  return result;
}

/** Grava o rascunho de um treino/dia (descarta os vencidos). */
export async function saveWorkoutDraft(userId: string, sessionKey: string, draft: ExecutionDraft, now = Date.now()): Promise<void> {
  const all = await readAll(userId);
  const next: StoredDrafts = {};
  for (const [key, entry] of Object.entries(all)) {
    const age = now - new Date(entry?.savedAt).getTime();
    if (entry?.draft && age >= 0 && age <= DRAFT_MAX_AGE_MS) next[key] = entry;
  }
  next[sessionKey] = { savedAt: new Date(now).toISOString(), draft };
  await writeAll(userId, next);
}

/** Treino finalizado: o rascunho dele sai do aparelho. */
export async function clearWorkoutDraft(userId: string, sessionKey: string): Promise<void> {
  const all = await readAll(userId);
  if (!(sessionKey in all)) return;
  delete all[sessionKey];
  await writeAll(userId, all);
}
