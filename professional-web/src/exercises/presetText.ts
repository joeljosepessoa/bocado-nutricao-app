/** Sugestões de séries da biblioteca ("4x 12 a 15 / 60" descanso"). */
export interface SetsSuggestion {
  sets: number;
  reps: number | null;
  repsMin: number | null;
  repsMax: number | null;
  restSeconds: number | null;
}

export const SETS_SUGGESTIONS: SetsSuggestion[] = [
  { sets: 4, reps: null, repsMin: 12, repsMax: 15, restSeconds: 60 },
  { sets: 3, reps: null, repsMin: 8, repsMax: 10, restSeconds: 90 },
  { sets: 4, reps: null, repsMin: 10, repsMax: 12, restSeconds: 60 },
];

/** 60 → 60"; 90 → 1'30"; 120 → 2'. */
export function restText(seconds: number | null): string | null {
  if (seconds == null) return null;
  if (seconds < 60) return `${seconds}"`;
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  if (seconds === 60) return '60"';
  return sec === 0 ? `${min}'` : `${min}'${String(sec).padStart(2, '0')}"`;
}

/** "4x 12 a 15 / 60" descanso" — ou "3x 10" sem descanso. */
export function setsText(s: SetsSuggestion): string {
  const reps = s.reps != null ? `${s.reps}` : s.repsMin != null && s.repsMax != null ? `${s.repsMin} a ${s.repsMax}` : '';
  const rest = restText(s.restSeconds);
  return `${s.sets}x${reps ? ` ${reps}` : ''}${rest ? ` / ${rest} descanso` : ''}`;
}
