import type { AlertActivityKind, ProfessionalAlerts } from '../types/api';

export const INACTIVE_DAYS_OPTIONS = [3, 7, 14, 30] as const;
export const PLAN_DAYS_OPTIONS = [30, 45, 60, 90] as const;

const KIND_TEXT: Record<AlertActivityKind, string> = {
  workout: 'treino',
  weight: 'peso',
  water: 'água',
  photo: 'foto',
  scale: 'balança',
  message: 'mensagem',
};

const dias = (n: number) => (n === 1 ? '1 dia' : `${n} dias`);

/** "Último registro: peso, há 10 dias · abriu o app há 2 dias" */
export function inactiveText(item: ProfessionalAlerts['inactive'][number], now: Date = new Date()): string {
  const seen = item.lastSeenAt ? `abriu o app ${agoText(item.lastSeenAt, now)}` : 'não abriu o app desde então';
  const seenAfter = item.lastSeenAt && item.lastSeenAt > item.lastRecordAt;
  return `Último registro: ${KIND_TEXT[item.lastRecordKind]}, há ${dias(item.days)}${seenAfter ? ` · ${seen}` : ''}`;
}

export function neverRecordedText(item: ProfessionalAlerts['neverRecorded'][number]): string {
  return item.everOpenedApp ? `Cadastrado há ${dias(item.days)} · já entrou no app, mas não registrou nada` : `Cadastrado há ${dias(item.days)} · ainda não entrou no app`;
}

/** "Hoje — faz 36 anos", "Amanhã — faz 41 anos", "Em 4 dias (02/11) — faz 41 anos" */
export function birthdayText(item: ProfessionalAlerts['birthdays'][number]): string {
  const [, month, day] = item.date.split('-');
  const when = item.inDays === 0 ? 'Hoje' : item.inDays === 1 ? 'Amanhã' : `Em ${item.inDays} dias (${day}/${month})`;
  return `${when} — faz ${item.age} anos`;
}

export function unreadText(item: ProfessionalAlerts['unreadMessages'][number]): string {
  const count = item.count === 1 ? '1 mensagem sem ler' : `${item.count} mensagens sem ler`;
  const wait = item.hours < 1 ? 'agora há pouco' : item.hours < 24 ? `há ${item.hours} h` : `há ${dias(Math.floor(item.hours / 24))}`;
  return `${count} · a mais antiga ${wait}`;
}

export function stalePlanText(item: ProfessionalAlerts['stalePlans'][number]): string {
  return `${item.kind === 'diet' ? 'Dieta' : 'Treino'} publicado há ${dias(item.days)}`.replace('Dieta publicado', 'Dieta publicada');
}

export function newSignupText(item: NonNullable<ProfessionalAlerts['newSignups']>[number]): string {
  return item.days === 0 ? 'Cadastrou-se pelo link hoje' : item.days === 1 ? 'Cadastrou-se pelo link ontem' : `Cadastrou-se pelo link há ${dias(item.days)}`;
}

function agoText(iso: string, now: Date): string {
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
  return days <= 0 ? 'hoje' : days === 1 ? 'ontem' : `há ${dias(days)}`;
}

export function alertsTotal(data: ProfessionalAlerts): number {
  return data.inactive.length + data.neverRecorded.length + data.birthdays.length + data.unreadMessages.length + data.stalePlans.length + (data.newSignups?.length ?? 0);
}
