export interface SetPrescription {
  reps: number | null;
  repsMin?: number | null;
  repsMax?: number | null;
  loadValue: number | null;
  loadUnit: string | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  restSeconds: number | null;
  tempo: string | null;
}

const LOAD_UNIT_LABELS: Record<string, string> = {
  kg: 'kg',
  lb: 'lb',
  bodyweight: 'peso corporal',
  band_level: 'elástico',
  other: '',
};

export const LOAD_UNIT_OPTIONS = [
  { value: 'kg', label: 'kg' },
  { value: 'lb', label: 'lb' },
  { value: 'bodyweight', label: 'peso corporal' },
  { value: 'band_level', label: 'elástico (nível)' },
  { value: 'other', label: 'outra' },
] as const;

/** "12" (exata), "6–10" (faixa) ou null — nunca converte uma forma na outra. */
export function formatReps(set: Pick<SetPrescription, 'reps' | 'repsMin' | 'repsMax'>): string | null {
  if (set.repsMin != null && set.repsMax != null) {
    return `${set.repsMin}–${set.repsMax}`;
  }
  return set.reps != null ? String(set.reps) : null;
}

export function formatSeconds(total: number): string {
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return seconds ? `${minutes}min${String(seconds).padStart(2, '0')}` : `${minutes}min`;
}

function formatDistance(meters: number): string {
  return meters >= 1000 ? `${Number((meters / 1000).toFixed(2))} km` : `${meters} m`;
}

/** Tudo o que foi prescrito, menos o descanso (mostrado à parte no resumo). */
function describeWork(set: SetPrescription): string[] {
  const parts: string[] = [];
  const reps = formatReps(set);
  if (reps) parts.push(`${reps} reps`);
  if (set.loadValue != null) {
    const unit = set.loadUnit ? LOAD_UNIT_LABELS[set.loadUnit] ?? set.loadUnit : '';
    parts.push(unit ? `${set.loadValue} ${unit}` : String(set.loadValue));
  } else if (set.loadUnit === 'bodyweight') {
    parts.push('peso corporal');
  }
  if (set.durationSeconds != null) parts.push(formatSeconds(set.durationSeconds));
  if (set.distanceMeters != null) parts.push(formatDistance(set.distanceMeters));
  if (set.tempo) parts.push(`cadência ${set.tempo}`);
  return parts;
}

export function describeSet(set: SetPrescription): string {
  const parts = describeWork(set);
  if (set.restSeconds != null) parts.push(`descanso ${formatSeconds(set.restSeconds)}`);
  return parts.length ? parts.join(' · ') : 'sem prescrição informada';
}

const signature = (set: SetPrescription) =>
  JSON.stringify([set.reps, set.repsMin ?? null, set.repsMax ?? null, set.loadValue, set.loadUnit, set.durationSeconds, set.distanceMeters, set.restSeconds, set.tempo]);

/**
 * Séries iguais: "4 × 6–10 reps · descanso 90s". Séries diferentes: uma
 * linha por série, na ordem — nada é "média" ou arredondado.
 */
export function summarizeSets(sets: SetPrescription[]): string[] {
  if (sets.length === 0) return ['Nenhuma série prescrita'];
  if (sets.every((set) => signature(set) === signature(sets[0]))) {
    const work = describeWork(sets[0]);
    const rest = sets[0].restSeconds != null ? [`descanso ${formatSeconds(sets[0].restSeconds)}`] : [];
    const head = work.length ? `${sets.length} × ${work.join(' · ')}` : `${sets.length} série(s)`;
    return [[head, ...rest].join(' · ')];
  }
  return sets.map((set, i) => `Série ${i + 1}: ${describeSet(set)}`);
}
