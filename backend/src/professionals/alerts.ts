/**
 * "Avisos para você" no painel: regras puras (sem banco) para aniversário e dias sem atividade.
 * Nada aqui decide nada pelo profissional nem manda nada ao paciente — só aponta quem olhar.
 */
export const ALERTS_TIME_ZONE = 'America/Sao_Paulo';
export const BIRTHDAY_WINDOW_DAYS = 7;
export const INACTIVE_DAYS_OPTIONS = [3, 7, 14, 30] as const;
export const PLAN_DAYS_OPTIONS = [30, 45, 60, 90] as const;

const DAY = 24 * 60 * 60 * 1000;

/** Data de hoje (ano, mês 1–12, dia) no fuso do Brasil. */
export function todayIn(timeZone: string, now: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

const isLeap = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/**
 * Próximo aniversário a partir de hoje (data de nascimento guardada como data, à meia-noite UTC).
 * 29/02 vira 28/02 em ano que não é bissexto.
 */
export function nextBirthday(birthDate: Date, today: { year: number; month: number; day: number }): { inDays: number; date: string; age: number } {
  const bMonth = birthDate.getUTCMonth() + 1;
  const bDay = birthDate.getUTCDate();
  const todayUtc = Date.UTC(today.year, today.month - 1, today.day);
  const occurrence = (year: number) => Date.UTC(year, bMonth - 1, bMonth === 2 && bDay === 29 && !isLeap(year) ? 28 : bDay);
  let year = today.year;
  if (occurrence(year) < todayUtc) year += 1;
  const at = occurrence(year);
  return {
    inDays: Math.round((at - todayUtc) / DAY),
    date: new Date(at).toISOString().slice(0, 10),
    age: year - birthDate.getUTCFullYear(),
  };
}

/** Dias inteiros desde uma data (0 = hoje há pouco). */
export const daysSince = (date: Date, now: Date) => Math.floor((now.getTime() - date.getTime()) / DAY);

/** Maior data entre as fontes (ignora vazias). */
export function latest(...dates: Array<Date | null | undefined>): Date | null {
  return dates.reduce<Date | null>((best, d) => (d && (!best || d > best) ? d : best), null);
}

/** Valor permitido mais próximo do pedido (o painel só oferece essas opções). */
export function pickOption(value: number | undefined, options: readonly number[], fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return options.reduce((best, o) => (Math.abs(o - value) < Math.abs(best - value) ? o : best), options[0]);
}
