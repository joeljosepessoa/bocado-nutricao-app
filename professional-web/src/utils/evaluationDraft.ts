/**
 * Rascunho automático do formulário de avaliação física, em `sessionStorage`
 * (nunca `localStorage`: é dado de saúde, e `sessionStorage` some ao fechar a
 * aba/navegador — não fica acumulando em disco). Cada chave é isolada por
 * cliente + avaliação, então o rascunho de um cliente nunca aparece pra outro,
 * nem o de uma avaliação vaza pra outra do mesmo cliente.
 *
 * Toda operação é best-effort: modo privado, quota excedida ou o navegador
 * simplesmente não tendo `sessionStorage` nunca podem travar o preenchimento
 * do formulário — só significa que o autosave fica indisponível nessa sessão.
 */

const DRAFT_KEY_PREFIX = 'bocado:eval-draft:';

export interface EvaluationDraftData {
  heightCm: string;
  weightKg: string;
  biologicalSex: 'male' | 'female' | '';
  protocolCode: string;
  bloodPressureSystolic: string;
  bloodPressureDiastolic: string;
  heartRate: string;
  glucose: string;
  notes: string;
  draftInstructions: string;
  measurements: Record<string, string>;
  skinfolds: Record<string, string>;
  bioimpedance: Record<string, string>;
  /** ISO 8601 — só informativo (não é usado para decidir nada), ajuda a mostrar "de quando" é o rascunho. */
  savedAt: string;
}

export function evaluationDraftKey(clientId: string, evaluationId?: string): string {
  return `${DRAFT_KEY_PREFIX}${clientId}:${evaluationId ?? 'new'}`;
}

/** Confirma que sessionStorage existe e realmente aceita escrita (modo privado de alguns navegadores expõe o objeto mas lança ao usar). */
function getStorage(): Storage | null {
  try {
    const probe = '__bocado_storage_probe__';
    window.sessionStorage.setItem(probe, '1');
    window.sessionStorage.removeItem(probe);
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Um rascunho só com campos vazios não vale a pena persistir (evitaria mostrar "rascunho encontrado" pra um formulário nunca tocado). */
export function isEvaluationDraftEmpty(data: Pick<EvaluationDraftData, 'heightCm' | 'weightKg' | 'notes' | 'draftInstructions' | 'measurements' | 'skinfolds' | 'bioimpedance'>): boolean {
  const scalarsEmpty = !data.heightCm && !data.weightKg && !data.notes && !data.draftInstructions;
  const groupsEmpty = [data.measurements, data.skinfolds, data.bioimpedance].every((g) => Object.keys(g).length === 0);
  return scalarsEmpty && groupsEmpty;
}

export function loadEvaluationDraft(key: string): EvaluationDraftData | null {
  const storage = getStorage();
  if (!storage) return null;
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') throw new Error('formato inesperado');
    return parsed as EvaluationDraftData;
  } catch {
    // JSON corrompido (ex.: gravação interrompida) — descarta em vez de quebrar a tela.
    try {
      storage.removeItem(key);
    } catch {
      /* mesmo a remoção pode falhar (storage indisponível); não há mais nada a fazer aqui */
    }
    return null;
  }
}

export function saveEvaluationDraft(key: string, data: Omit<EvaluationDraftData, 'savedAt'>): void {
  const storage = getStorage();
  if (!storage) return;
  if (isEvaluationDraftEmpty(data)) {
    // Formulário voltou a ficar vazio (ex.: usuário apagou tudo) — não deixa lixo salvo.
    try {
      storage.removeItem(key);
    } catch {
      /* best-effort */
    }
    return;
  }
  try {
    const payload: EvaluationDraftData = { ...data, savedAt: new Date().toISOString() };
    storage.setItem(key, JSON.stringify(payload));
  } catch {
    // Quota excedida ou storage indisponível — autosave é best-effort, nunca bloqueia o preenchimento.
  }
}

export function removeEvaluationDraft(key: string): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    /* best-effort */
  }
}

/** Chamado no logout: limpa todo rascunho de avaliação desta aplicação, de qualquer cliente. */
export function clearAllEvaluationDrafts(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key?.startsWith(DRAFT_KEY_PREFIX)) keysToRemove.push(key);
    }
    keysToRemove.forEach((key) => storage.removeItem(key));
  } catch {
    /* best-effort */
  }
}
