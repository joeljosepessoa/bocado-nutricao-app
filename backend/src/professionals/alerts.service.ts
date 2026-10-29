import { Injectable } from '@nestjs/common';
import { ClientStatus, DietStatus, DietVersionStatus, MessageSenderRole, WorkoutStatus, WorkoutVersionStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  ALERTS_TIME_ZONE,
  BIRTHDAY_WINDOW_DAYS,
  daysSince,
  INACTIVE_DAYS_OPTIONS,
  latest,
  nextBirthday,
  pickOption,
  PLAN_DAYS_OPTIONS,
  todayIn,
} from './alerts';

/** Fontes do "último registro" do paciente no app. */
export type ActivityKind = 'workout' | 'weight' | 'water' | 'photo' | 'scale' | 'message';

/**
 * "Avisos para você": calculado na hora, só leitura, só pacientes ativos do profissional.
 * - sem registrar nada no app há X dias (treino, peso, água, foto, balança, mensagem);
 * - nunca registraram nada (cadastrados há mais de X dias);
 * - aniversário nos próximos 7 dias;
 * - mensagem do paciente ainda não lida;
 * - dieta/treino publicados há mais de N dias.
 */
@Injectable()
export class AlertsService {
  constructor(private readonly prisma: PrismaService) {}

  async forProfessional(professionalId: string, query: { inactiveDays?: number; planDays?: number }, now: Date = new Date()) {
    const inactiveDays = pickOption(query.inactiveDays, INACTIVE_DAYS_OPTIONS, 7);
    const planDays = pickOption(query.planDays, PLAN_DAYS_OPTIONS, 45);

    const clients = await this.prisma.client.findMany({
      where: { professionalId, status: ClientStatus.active },
      select: { id: true, birthDate: true, createdAt: true, user: { select: { fullName: true } } },
    });
    const empty = { generatedAt: now.toISOString(), settings: { inactiveDays, planDays }, inactive: [], neverRecorded: [], birthdays: [], unreadMessages: [], stalePlans: [] };
    if (clients.length === 0) return empty;
    const ids = clients.map((c) => c.id);
    const inIds = { clientId: { in: ids } };

    const [workouts, weights, waters, photos, scales, threads, sessions, diets, plans] = await Promise.all([
      this.prisma.workoutExecutionLog.groupBy({ by: ['clientId'], where: { ...inIds, loggedByProfessionalId: null }, _max: { createdAt: true } }),
      this.prisma.clientWeightLog.groupBy({ by: ['clientId'], where: inIds, _max: { createdAt: true } }),
      this.prisma.clientWaterLog.groupBy({ by: ['clientId'], where: inIds, _max: { loggedAt: true } }),
      this.prisma.clientProgressPhoto.groupBy({ by: ['clientId'], where: inIds, _max: { createdAt: true } }),
      this.prisma.scaleReading.groupBy({ by: ['clientId'], where: inIds, _max: { createdAt: true } }),
      this.prisma.messageThread.findMany({ where: { professionalId, ...inIds }, select: { id: true, clientId: true } }),
      this.prisma.refreshToken.groupBy({ by: ['userId'], where: { userId: { in: ids } }, _max: { issuedAt: true } }),
      this.prisma.dietVersion.findMany({
        where: { status: DietVersionStatus.published, diet: { professionalId, status: DietStatus.active, ...inIds } },
        select: { publishedAt: true, diet: { select: { clientId: true } } },
      }),
      this.prisma.workoutVersion.findMany({
        where: { status: WorkoutVersionStatus.published, workout: { professionalId, status: WorkoutStatus.active, ...inIds } },
        select: { publishedAt: true, workout: { select: { clientId: true } } },
      }),
    ]);

    const threadClient = new Map(threads.map((t) => [t.id, t.clientId]));
    const threadIds = threads.map((t) => t.id);
    const [clientMessages, unread] = threadIds.length
      ? await Promise.all([
          this.prisma.message.groupBy({ by: ['threadId'], where: { threadId: { in: threadIds }, senderRole: MessageSenderRole.client }, _max: { createdAt: true } }),
          this.prisma.message.groupBy({
            by: ['threadId'],
            where: { threadId: { in: threadIds }, senderRole: MessageSenderRole.client, readAt: null },
            _count: { _all: true },
            _min: { createdAt: true },
          }),
        ])
      : [[], []];

    const byClient = <T>(rows: T[], key: (r: T) => string, value: (r: T) => Date | null | undefined) => new Map(rows.map((r) => [key(r), value(r) ?? null]));
    const sources: Array<[ActivityKind, Map<string, Date | null>]> = [
      ['workout', byClient(workouts, (r) => r.clientId, (r) => r._max.createdAt)],
      ['weight', byClient(weights, (r) => r.clientId, (r) => r._max.createdAt)],
      ['water', byClient(waters, (r) => r.clientId, (r) => r._max.loggedAt)],
      ['photo', byClient(photos, (r) => r.clientId, (r) => r._max.createdAt)],
      ['scale', byClient(scales, (r) => r.clientId, (r) => r._max.createdAt)],
      ['message', byClient(clientMessages, (r) => threadClient.get(r.threadId)!, (r) => r._max.createdAt)],
    ];
    const lastSeen = byClient(sessions, (r) => r.userId, (r) => r._max.issuedAt);

    const today = todayIn(ALERTS_TIME_ZONE, now);
    const inactive: Array<{ clientId: string; name: string; lastRecordAt: string; lastRecordKind: ActivityKind; days: number; lastSeenAt: string | null }> = [];
    const neverRecorded: Array<{ clientId: string; name: string; since: string; days: number; everOpenedApp: boolean }> = [];
    const birthdays: Array<{ clientId: string; name: string; date: string; inDays: number; age: number }> = [];

    for (const client of clients) {
      const name = client.user.fullName;
      let lastRecordAt: Date | null = null;
      let lastRecordKind: ActivityKind | null = null;
      for (const [kind, map] of sources) {
        const at = map.get(client.id) ?? null;
        if (at && (!lastRecordAt || at > lastRecordAt)) {
          lastRecordAt = at;
          lastRecordKind = kind;
        }
      }
      const seen = lastSeen.get(client.id) ?? null;
      if (lastRecordAt) {
        const days = daysSince(lastRecordAt, now);
        if (days >= inactiveDays) {
          inactive.push({ clientId: client.id, name, lastRecordAt: lastRecordAt.toISOString(), lastRecordKind: lastRecordKind!, days, lastSeenAt: seen?.toISOString() ?? null });
        }
      } else {
        const days = daysSince(client.createdAt, now);
        if (days >= inactiveDays) neverRecorded.push({ clientId: client.id, name, since: client.createdAt.toISOString(), days, everOpenedApp: seen !== null });
      }
      if (client.birthDate) {
        const next = nextBirthday(client.birthDate, today);
        if (next.inDays < BIRTHDAY_WINDOW_DAYS) birthdays.push({ clientId: client.id, name, ...next });
      }
    }

    const names = new Map(clients.map((c) => [c.id, c.user.fullName]));
    const unreadMessages = unread
      .map((r) => ({ clientId: threadClient.get(r.threadId)!, count: r._count._all, oldestAt: r._min.createdAt! }))
      .map((r) => ({ ...r, name: names.get(r.clientId)!, oldestAt: r.oldestAt.toISOString(), hours: Math.floor((now.getTime() - r.oldestAt.getTime()) / 3_600_000) }))
      .sort((a, b) => a.oldestAt.localeCompare(b.oldestAt));

    const latestPlan = new Map<string, { diet: Date | null; workout: Date | null }>();
    const note = (clientId: string, kind: 'diet' | 'workout', at: Date | null) => {
      const entry = latestPlan.get(clientId) ?? { diet: null, workout: null };
      entry[kind] = latest(entry[kind], at);
      latestPlan.set(clientId, entry);
    };
    diets.forEach((d) => note(d.diet.clientId, 'diet', d.publishedAt));
    plans.forEach((w) => note(w.workout.clientId, 'workout', w.publishedAt));
    const stalePlans: Array<{ clientId: string; name: string; kind: 'diet' | 'workout'; publishedAt: string; days: number }> = [];
    for (const [clientId, entry] of latestPlan) {
      for (const kind of ['diet', 'workout'] as const) {
        const at = entry[kind];
        if (at && daysSince(at, now) >= planDays) stalePlans.push({ clientId, name: names.get(clientId)!, kind, publishedAt: at.toISOString(), days: daysSince(at, now) });
      }
    }

    return {
      generatedAt: now.toISOString(),
      settings: { inactiveDays, planDays },
      inactive: inactive.sort((a, b) => b.days - a.days || a.name.localeCompare(b.name, 'pt-BR')),
      neverRecorded: neverRecorded.sort((a, b) => b.days - a.days || a.name.localeCompare(b.name, 'pt-BR')),
      birthdays: birthdays.sort((a, b) => a.inDays - b.inDays || a.name.localeCompare(b.name, 'pt-BR')),
      unreadMessages,
      stalePlans: stalePlans.sort((a, b) => b.days - a.days || a.name.localeCompare(b.name, 'pt-BR')),
    };
  }
}
