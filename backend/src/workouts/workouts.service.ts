import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { WorkoutAuditAction, WorkoutVersionStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { ExercisesService } from '../exercises/exercises.service';
import { WorkoutAuditLogService } from './workout-audit-log.service';
import { CreateWorkoutDto } from './dto/create-workout.dto';
import { UpdateWorkoutDto } from './dto/update-workout.dto';
import { UpdateWorkoutVersionDto } from './dto/update-workout-version.dto';
import { CreateWorkoutDayDto } from './dto/create-workout-day.dto';
import { UpdateWorkoutDayDto } from './dto/update-workout-day.dto';
import { CreateWorkoutExerciseDto } from './dto/create-workout-exercise.dto';
import { UpdateWorkoutExerciseDto } from './dto/update-workout-exercise.dto';
import { CreateWorkoutSetDto } from './dto/create-workout-set.dto';
import { UpdateWorkoutSetDto } from './dto/update-workout-set.dto';
import { CreateExecutionLogDto } from './dto/create-execution-log.dto';

export interface RequestMeta {
  ipAddress?: string;
}

const VERSION_DETAIL_INCLUDE = {
  days: {
    include: {
      exercises: {
        include: {
          exercise: { select: { id: true, name: true, type: true, muscleGroup: true, equipment: true } },
          sets: true,
        },
      },
    },
  },
} as const;

/* eslint-disable @typescript-eslint/no-explicit-any */
function sortVersionDetail(version: any) {
  const days = [...version.days]
    .sort((a: any, b: any) => a.order - b.order)
    .map((day: any) => ({
      ...day,
      exercises: [...day.exercises]
        .sort((a: any, b: any) => a.order - b.order)
        .map((ex: any) => ({ ...ex, sets: [...ex.sets].sort((a: any, b: any) => a.order - b.order) })),
    }));
  return { ...version, days };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

@Injectable()
export class WorkoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exercisesService: ExercisesService,
    private readonly auditLog: WorkoutAuditLogService,
  ) {}

  private async assertOwnedClient(professionalId: string, clientId: string) {
    const client = await this.prisma.client.findFirst({ where: { id: clientId, professionalId } });
    if (!client) {
      throw new NotFoundException('Cliente não encontrado.');
    }
    return client;
  }

  private async assertOwnedWorkout(professionalId: string, clientId: string, workoutId: string) {
    await this.assertOwnedClient(professionalId, clientId);
    const workout = await this.prisma.workout.findFirst({ where: { id: workoutId, clientId } });
    if (!workout) {
      throw new NotFoundException('Treino não encontrado.');
    }
    return workout;
  }

  private async getVersionOrThrow(workoutId: string, versionId: string) {
    const version = await this.prisma.workoutVersion.findFirst({ where: { id: versionId, workoutId } });
    if (!version) {
      throw new NotFoundException('Versão não encontrada.');
    }
    return version;
  }

  private async assertDraftVersion(workoutId: string, versionId: string) {
    const version = await this.getVersionOrThrow(workoutId, versionId);
    if (version.status !== WorkoutVersionStatus.draft) {
      throw new ConflictException('Só é possível alterar dias/exercícios/séries em uma versão em rascunho.');
    }
    return version;
  }

  async create(professionalId: string, clientId: string, dto: CreateWorkoutDto, meta: RequestMeta = {}) {
    await this.assertOwnedClient(professionalId, clientId);

    const workout = await this.prisma.$transaction(async (tx) => {
      const created = await tx.workout.create({ data: { clientId, professionalId } });
      await tx.workoutVersion.create({
        data: {
          workoutId: created.id,
          versionNumber: 1,
          createdByProfessionalId: professionalId,
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          endDate: dto.endDate ? new Date(dto.endDate) : undefined,
          objective: dto.objective,
          notes: dto.notes,
        },
      });
      return created;
    });

    await this.auditLog.record({
      professionalId,
      clientId,
      workoutId: workout.id,
      action: WorkoutAuditAction.created,
      ipAddress: meta.ipAddress,
    });

    return this.findOne(professionalId, clientId, workout.id, meta, false);
  }

  async list(professionalId: string, clientId: string, page = 1, pageSize = 20) {
    await this.assertOwnedClient(professionalId, clientId);
    const safePage = page > 0 ? page : 1;
    const safePageSize = pageSize > 0 ? pageSize : 20;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.workout.findMany({
        where: { clientId },
        select: { id: true, status: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
      }),
      this.prisma.workout.count({ where: { clientId } }),
    ]);

    return { items, total, page: safePage, pageSize: safePageSize };
  }

  async findOne(professionalId: string, clientId: string, workoutId: string, meta: RequestMeta = {}, audit = true) {
    const workout = await this.assertOwnedWorkout(professionalId, clientId, workoutId);

    const versions = await this.prisma.workoutVersion.findMany({
      where: { workoutId },
      select: { id: true, versionNumber: true, status: true, publishedAt: true, supersededAt: true, createdAt: true },
      orderBy: { versionNumber: 'desc' },
    });

    const published = versions.find((v) => v.status === WorkoutVersionStatus.published);
    const relevantVersionId = published?.id ?? versions.find((v) => v.status === WorkoutVersionStatus.draft)?.id;

    const currentVersion = relevantVersionId
      ? await this.findVersion(professionalId, clientId, workoutId, relevantVersionId, meta, false)
      : null;

    if (audit) {
      await this.auditLog.record({
        professionalId,
        clientId,
        workoutId,
        action: WorkoutAuditAction.read,
        ipAddress: meta.ipAddress,
      });
    }

    return { ...workout, versions, currentVersion };
  }

  async update(professionalId: string, clientId: string, workoutId: string, dto: UpdateWorkoutDto, meta: RequestMeta = {}) {
    await this.assertOwnedWorkout(professionalId, clientId, workoutId);
    await this.prisma.workout.update({ where: { id: workoutId }, data: { status: dto.status } });

    await this.auditLog.record({
      professionalId,
      clientId,
      workoutId,
      action: dto.status === 'archived' ? WorkoutAuditAction.archived : WorkoutAuditAction.updated,
      ipAddress: meta.ipAddress,
    });

    return this.findOne(professionalId, clientId, workoutId, meta, false);
  }

  async listVersions(professionalId: string, clientId: string, workoutId: string, meta: RequestMeta = {}) {
    await this.assertOwnedWorkout(professionalId, clientId, workoutId);
    await this.auditLog.record({
      professionalId,
      clientId,
      workoutId,
      action: WorkoutAuditAction.listed,
      ipAddress: meta.ipAddress,
    });
    return this.prisma.workoutVersion.findMany({ where: { workoutId }, orderBy: { versionNumber: 'desc' } });
  }

  async findVersion(
    professionalId: string,
    clientId: string,
    workoutId: string,
    versionId: string,
    meta: RequestMeta = {},
    audit = true,
  ) {
    await this.assertOwnedWorkout(professionalId, clientId, workoutId);
    const version = await this.prisma.workoutVersion.findFirst({
      where: { id: versionId, workoutId },
      include: VERSION_DETAIL_INCLUDE,
    });
    if (!version) {
      throw new NotFoundException('Versão não encontrada.');
    }

    if (audit) {
      await this.auditLog.record({
        professionalId,
        clientId,
        workoutId,
        workoutVersionId: versionId,
        action: WorkoutAuditAction.read,
        ipAddress: meta.ipAddress,
      });
    }

    return sortVersionDetail(version);
  }

  async createVersion(professionalId: string, clientId: string, workoutId: string, meta: RequestMeta = {}) {
    await this.assertOwnedWorkout(professionalId, clientId, workoutId);

    const existingDraft = await this.prisma.workoutVersion.findFirst({
      where: { workoutId, status: WorkoutVersionStatus.draft },
    });
    if (existingDraft) {
      throw new ConflictException(
        `Já existe um rascunho em aberto (versão ${existingDraft.versionNumber}). Edite-o ou publique-o antes de criar outro.`,
      );
    }

    const [publishedVersion, lastVersion] = await Promise.all([
      this.prisma.workoutVersion.findFirst({
        where: { workoutId, status: WorkoutVersionStatus.published },
        include: VERSION_DETAIL_INCLUDE,
      }),
      this.prisma.workoutVersion.findFirst({ where: { workoutId }, orderBy: { versionNumber: 'desc' } }),
    ]);

    const nextVersionNumber = (lastVersion?.versionNumber ?? 0) + 1;

    const newVersion = await this.prisma.$transaction(async (tx) => {
      const created = await tx.workoutVersion.create({
        data: {
          workoutId,
          versionNumber: nextVersionNumber,
          createdByProfessionalId: professionalId,
          startDate: publishedVersion?.startDate,
          endDate: publishedVersion?.endDate,
          objective: publishedVersion?.objective,
          notes: publishedVersion?.notes,
        },
      });

      if (publishedVersion) {
        for (const day of publishedVersion.days as any[]) {
          const clonedDay = await tx.workoutDay.create({
            data: { workoutVersionId: created.id, name: day.name, order: day.order, notes: day.notes },
          });
          for (const ex of day.exercises as any[]) {
            const clonedExercise = await tx.workoutExercise.create({
              data: {
                workoutDayId: clonedDay.id,
                exerciseId: ex.exerciseId,
                order: ex.order,
                notes: ex.notes,
              },
            });
            for (const set of ex.sets as any[]) {
              await tx.workoutSet.create({
                data: {
                  workoutExerciseId: clonedExercise.id,
                  order: set.order,
                  reps: set.reps,
                  loadValue: set.loadValue,
                  loadUnit: set.loadUnit,
                  durationSeconds: set.durationSeconds,
                  distanceMeters: set.distanceMeters,
                  restSeconds: set.restSeconds,
                  tempo: set.tempo,
                  notes: set.notes,
                },
              });
            }
          }
        }
      }

      return created;
    });

    await this.auditLog.record({
      professionalId,
      clientId,
      workoutId,
      workoutVersionId: newVersion.id,
      action: WorkoutAuditAction.version_created,
      ipAddress: meta.ipAddress,
    });

    return this.findVersion(professionalId, clientId, workoutId, newVersion.id, meta, false);
  }

  async updateVersion(
    professionalId: string,
    clientId: string,
    workoutId: string,
    versionId: string,
    dto: UpdateWorkoutVersionDto,
    meta: RequestMeta = {},
  ) {
    await this.assertOwnedWorkout(professionalId, clientId, workoutId);
    const version = await this.getVersionOrThrow(workoutId, versionId);
    if (version.status !== WorkoutVersionStatus.draft) {
      throw new ConflictException('Só é possível editar uma versão em rascunho. Crie uma nova versão.');
    }

    await this.prisma.workoutVersion.update({
      where: { id: versionId },
      data: {
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        objective: dto.objective,
        notes: dto.notes,
      },
    });

    await this.auditLog.record({
      professionalId,
      clientId,
      workoutId,
      workoutVersionId: versionId,
      action: WorkoutAuditAction.version_updated,
      ipAddress: meta.ipAddress,
    });

    return this.findVersion(professionalId, clientId, workoutId, versionId, meta, false);
  }

  async publishVersion(professionalId: string, clientId: string, workoutId: string, versionId: string, meta: RequestMeta = {}) {
    await this.assertOwnedWorkout(professionalId, clientId, workoutId);
    const version = await this.getVersionOrThrow(workoutId, versionId);
    if (version.status !== WorkoutVersionStatus.draft) {
      throw new ConflictException('Só é possível publicar uma versão em rascunho.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.workoutVersion.updateMany({
        where: { workoutId, status: WorkoutVersionStatus.published },
        data: { status: WorkoutVersionStatus.superseded, supersededAt: new Date() },
      });
      await tx.workoutVersion.update({
        where: { id: versionId },
        data: { status: WorkoutVersionStatus.published, publishedAt: new Date() },
      });
    });

    await this.auditLog.record({
      professionalId,
      clientId,
      workoutId,
      workoutVersionId: versionId,
      action: WorkoutAuditAction.published,
      ipAddress: meta.ipAddress,
    });

    return this.findVersion(professionalId, clientId, workoutId, versionId, meta, false);
  }

  async compareVersions(
    professionalId: string,
    clientId: string,
    workoutId: string,
    fromId: string,
    toId: string,
    meta: RequestMeta = {},
  ) {
    const [from, to] = await Promise.all([
      this.findVersion(professionalId, clientId, workoutId, fromId, meta, false),
      this.findVersion(professionalId, clientId, workoutId, toId, meta, false),
    ]);

    const volumeByExercise = (version: any) => {
      const map = new Map<string, { exerciseName: string; volume: number }>();
      for (const day of version.days) {
        for (const ex of day.exercises) {
          const volume = ex.sets.reduce(
            (sum: number, set: any) => sum + (set.reps != null && set.loadValue != null ? set.reps * set.loadValue : 0),
            0,
          );
          const existing = map.get(ex.exerciseId);
          map.set(ex.exerciseId, { exerciseName: ex.exercise.name, volume: (existing?.volume ?? 0) + volume });
        }
      }
      return map;
    };

    const fromVolumes = volumeByExercise(from);
    const toVolumes = volumeByExercise(to);
    const exerciseIds = new Set([...fromVolumes.keys(), ...toVolumes.keys()]);

    const deltas = [...exerciseIds].map((exerciseId) => {
      const fromEntry = fromVolumes.get(exerciseId);
      const toEntry = toVolumes.get(exerciseId);
      return {
        exerciseId,
        exerciseName: (toEntry ?? fromEntry)!.exerciseName,
        fromVolume: fromEntry?.volume ?? null,
        toVolume: toEntry?.volume ?? null,
        delta: fromEntry && toEntry ? Math.round((toEntry.volume - fromEntry.volume) * 100) / 100 : null,
      };
    });

    await this.auditLog.record({
      professionalId,
      clientId,
      workoutId,
      workoutVersionId: fromId,
      action: WorkoutAuditAction.compared,
      ipAddress: meta.ipAddress,
    });
    await this.auditLog.record({
      professionalId,
      clientId,
      workoutId,
      workoutVersionId: toId,
      action: WorkoutAuditAction.compared,
      ipAddress: meta.ipAddress,
    });

    return { from, to, exerciseVolumeDeltas: deltas };
  }

  async createDay(
    professionalId: string,
    clientId: string,
    workoutId: string,
    versionId: string,
    dto: CreateWorkoutDayDto,
    meta: RequestMeta = {},
  ) {
    await this.assertOwnedWorkout(professionalId, clientId, workoutId);
    await this.assertDraftVersion(workoutId, versionId);

    let order = dto.order;
    if (order == null) {
      const last = await this.prisma.workoutDay.findFirst({ where: { workoutVersionId: versionId }, orderBy: { order: 'desc' } });
      order = (last?.order ?? -1) + 1;
    }

    const day = await this.prisma.workoutDay.create({
      data: { workoutVersionId: versionId, name: dto.name, order, notes: dto.notes },
    });

    await this.auditLog.record({
      professionalId,
      clientId,
      workoutId,
      workoutVersionId: versionId,
      action: WorkoutAuditAction.day_added,
      ipAddress: meta.ipAddress,
    });

    return day;
  }

  private async getDayOrThrow(versionId: string, dayId: string) {
    const day = await this.prisma.workoutDay.findFirst({ where: { id: dayId, workoutVersionId: versionId } });
    if (!day) {
      throw new NotFoundException('Dia de treino não encontrado.');
    }
    return day;
  }

  async updateDay(
    professionalId: string,
    clientId: string,
    workoutId: string,
    versionId: string,
    dayId: string,
    dto: UpdateWorkoutDayDto,
    meta: RequestMeta = {},
  ) {
    await this.assertOwnedWorkout(professionalId, clientId, workoutId);
    await this.assertDraftVersion(workoutId, versionId);
    await this.getDayOrThrow(versionId, dayId);

    const day = await this.prisma.workoutDay.update({
      where: { id: dayId },
      data: { name: dto.name, order: dto.order, notes: dto.notes },
    });

    await this.auditLog.record({
      professionalId,
      clientId,
      workoutId,
      workoutVersionId: versionId,
      action: WorkoutAuditAction.day_updated,
      ipAddress: meta.ipAddress,
    });

    return day;
  }

  async deleteDay(
    professionalId: string,
    clientId: string,
    workoutId: string,
    versionId: string,
    dayId: string,
    meta: RequestMeta = {},
  ) {
    await this.assertOwnedWorkout(professionalId, clientId, workoutId);
    await this.assertDraftVersion(workoutId, versionId);
    await this.getDayOrThrow(versionId, dayId);

    const exercises = await this.prisma.workoutExercise.findMany({ where: { workoutDayId: dayId } });
    await this.prisma.workoutSet.deleteMany({ where: { workoutExerciseId: { in: exercises.map((e) => e.id) } } });
    await this.prisma.workoutExercise.deleteMany({ where: { workoutDayId: dayId } });
    await this.prisma.workoutDay.delete({ where: { id: dayId } });

    await this.auditLog.record({
      professionalId,
      clientId,
      workoutId,
      workoutVersionId: versionId,
      action: WorkoutAuditAction.day_removed,
      ipAddress: meta.ipAddress,
    });
  }

  async createExercise(
    professionalId: string,
    clientId: string,
    workoutId: string,
    versionId: string,
    dayId: string,
    dto: CreateWorkoutExerciseDto,
    meta: RequestMeta = {},
  ) {
    await this.assertOwnedWorkout(professionalId, clientId, workoutId);
    await this.assertDraftVersion(workoutId, versionId);
    await this.getDayOrThrow(versionId, dayId);

    const exercise = await this.exercisesService.findVisible(professionalId, dto.exerciseId);

    let order = dto.order;
    if (order == null) {
      const last = await this.prisma.workoutExercise.findFirst({ where: { workoutDayId: dayId }, orderBy: { order: 'desc' } });
      order = (last?.order ?? -1) + 1;
    }

    const workoutExercise = await this.prisma.workoutExercise.create({
      data: { workoutDayId: dayId, exerciseId: exercise.id, order, notes: dto.notes },
      include: { exercise: { select: { id: true, name: true } } },
    });

    await this.auditLog.record({
      professionalId,
      clientId,
      workoutId,
      workoutVersionId: versionId,
      action: WorkoutAuditAction.exercise_added,
      ipAddress: meta.ipAddress,
    });

    return workoutExercise;
  }

  private async getWorkoutExerciseOrThrow(dayId: string, workoutExerciseId: string) {
    const workoutExercise = await this.prisma.workoutExercise.findFirst({
      where: { id: workoutExerciseId, workoutDayId: dayId },
    });
    if (!workoutExercise) {
      throw new NotFoundException('Exercício do treino não encontrado.');
    }
    return workoutExercise;
  }

  async updateExercise(
    professionalId: string,
    clientId: string,
    workoutId: string,
    versionId: string,
    dayId: string,
    workoutExerciseId: string,
    dto: UpdateWorkoutExerciseDto,
    meta: RequestMeta = {},
  ) {
    await this.assertOwnedWorkout(professionalId, clientId, workoutId);
    await this.assertDraftVersion(workoutId, versionId);
    await this.getWorkoutExerciseOrThrow(dayId, workoutExerciseId);

    const workoutExercise = await this.prisma.workoutExercise.update({
      where: { id: workoutExerciseId },
      data: { order: dto.order, notes: dto.notes },
    });

    await this.auditLog.record({
      professionalId,
      clientId,
      workoutId,
      workoutVersionId: versionId,
      action: WorkoutAuditAction.exercise_updated,
      ipAddress: meta.ipAddress,
    });

    return workoutExercise;
  }

  async deleteExercise(
    professionalId: string,
    clientId: string,
    workoutId: string,
    versionId: string,
    dayId: string,
    workoutExerciseId: string,
    meta: RequestMeta = {},
  ) {
    await this.assertOwnedWorkout(professionalId, clientId, workoutId);
    await this.assertDraftVersion(workoutId, versionId);
    await this.getWorkoutExerciseOrThrow(dayId, workoutExerciseId);

    await this.prisma.workoutSet.deleteMany({ where: { workoutExerciseId } });
    await this.prisma.workoutExercise.delete({ where: { id: workoutExerciseId } });

    await this.auditLog.record({
      professionalId,
      clientId,
      workoutId,
      workoutVersionId: versionId,
      action: WorkoutAuditAction.exercise_removed,
      ipAddress: meta.ipAddress,
    });
  }

  async createSet(
    professionalId: string,
    clientId: string,
    workoutId: string,
    versionId: string,
    dayId: string,
    workoutExerciseId: string,
    dto: CreateWorkoutSetDto,
    meta: RequestMeta = {},
  ) {
    await this.assertOwnedWorkout(professionalId, clientId, workoutId);
    await this.assertDraftVersion(workoutId, versionId);
    await this.getWorkoutExerciseOrThrow(dayId, workoutExerciseId);

    let order = dto.order;
    if (order == null) {
      const last = await this.prisma.workoutSet.findFirst({ where: { workoutExerciseId }, orderBy: { order: 'desc' } });
      order = (last?.order ?? -1) + 1;
    }

    const set = await this.prisma.workoutSet.create({
      data: {
        workoutExerciseId,
        order,
        reps: dto.reps,
        loadValue: dto.loadValue,
        loadUnit: dto.loadUnit,
        durationSeconds: dto.durationSeconds,
        distanceMeters: dto.distanceMeters,
        restSeconds: dto.restSeconds,
        tempo: dto.tempo,
        notes: dto.notes,
      },
    });

    await this.auditLog.record({
      professionalId,
      clientId,
      workoutId,
      workoutVersionId: versionId,
      action: WorkoutAuditAction.set_added,
      ipAddress: meta.ipAddress,
    });

    return set;
  }

  async updateSet(
    professionalId: string,
    clientId: string,
    workoutId: string,
    versionId: string,
    dayId: string,
    workoutExerciseId: string,
    setId: string,
    dto: UpdateWorkoutSetDto,
    meta: RequestMeta = {},
  ) {
    await this.assertOwnedWorkout(professionalId, clientId, workoutId);
    await this.assertDraftVersion(workoutId, versionId);
    await this.getWorkoutExerciseOrThrow(dayId, workoutExerciseId);
    const existing = await this.prisma.workoutSet.findFirst({ where: { id: setId, workoutExerciseId } });
    if (!existing) {
      throw new NotFoundException('Série não encontrada.');
    }

    const set = await this.prisma.workoutSet.update({
      where: { id: setId },
      data: {
        order: dto.order,
        reps: dto.reps,
        loadValue: dto.loadValue,
        loadUnit: dto.loadUnit,
        durationSeconds: dto.durationSeconds,
        distanceMeters: dto.distanceMeters,
        restSeconds: dto.restSeconds,
        tempo: dto.tempo,
        notes: dto.notes,
      },
    });

    await this.auditLog.record({
      professionalId,
      clientId,
      workoutId,
      workoutVersionId: versionId,
      action: WorkoutAuditAction.set_updated,
      ipAddress: meta.ipAddress,
    });

    return set;
  }

  async deleteSet(
    professionalId: string,
    clientId: string,
    workoutId: string,
    versionId: string,
    dayId: string,
    workoutExerciseId: string,
    setId: string,
    meta: RequestMeta = {},
  ) {
    await this.assertOwnedWorkout(professionalId, clientId, workoutId);
    await this.assertDraftVersion(workoutId, versionId);
    await this.getWorkoutExerciseOrThrow(dayId, workoutExerciseId);
    const existing = await this.prisma.workoutSet.findFirst({ where: { id: setId, workoutExerciseId } });
    if (!existing) {
      throw new NotFoundException('Série não encontrada.');
    }

    await this.prisma.workoutSet.delete({ where: { id: setId } });

    await this.auditLog.record({
      professionalId,
      clientId,
      workoutId,
      workoutVersionId: versionId,
      action: WorkoutAuditAction.set_removed,
      ipAddress: meta.ipAddress,
    });
  }

  async createExecutionLog(
    professionalId: string,
    clientId: string,
    workoutId: string,
    dto: CreateExecutionLogDto,
    meta: RequestMeta = {},
  ) {
    await this.assertOwnedWorkout(professionalId, clientId, workoutId);

    const day = await this.prisma.workoutDay.findFirst({
      where: { id: dto.workoutDayId, workoutVersion: { workoutId } },
    });
    if (!day) {
      throw new NotFoundException('Dia de treino não encontrado.');
    }

    const log = await this.prisma.workoutExecutionLog.create({
      data: {
        clientId,
        workoutDayId: day.id,
        workoutVersionId: day.workoutVersionId,
        loggedByProfessionalId: professionalId,
        performedAt: dto.performedAt ? new Date(dto.performedAt) : new Date(),
        notes: dto.notes,
        sets: {
          createMany: {
            data: dto.sets.map((s) => ({
              workoutExerciseId: s.workoutExerciseId,
              setOrder: s.setOrder,
              repsPerformed: s.repsPerformed,
              loadValue: s.loadValue,
              loadUnit: s.loadUnit,
              durationSeconds: s.durationSeconds,
              distanceMeters: s.distanceMeters,
              perceivedEffort: s.perceivedEffort,
              notes: s.notes,
            })),
          },
        },
      },
      include: { sets: true },
    });

    await this.auditLog.record({
      professionalId,
      clientId,
      workoutId,
      workoutVersionId: day.workoutVersionId,
      action: WorkoutAuditAction.execution_logged,
      ipAddress: meta.ipAddress,
    });

    return log;
  }

  async listExecutionLogs(professionalId: string, clientId: string, workoutId: string, page = 1, pageSize = 20) {
    await this.assertOwnedWorkout(professionalId, clientId, workoutId);
    const safePage = page > 0 ? page : 1;
    const safePageSize = pageSize > 0 ? pageSize : 20;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.workoutExecutionLog.findMany({
        where: { workoutVersion: { workoutId } },
        orderBy: { performedAt: 'desc' },
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
      }),
      this.prisma.workoutExecutionLog.count({ where: { workoutVersion: { workoutId } } }),
    ]);

    return { items, total, page: safePage, pageSize: safePageSize };
  }

  async findExecutionLog(professionalId: string, clientId: string, workoutId: string, logId: string) {
    await this.assertOwnedWorkout(professionalId, clientId, workoutId);
    const log = await this.prisma.workoutExecutionLog.findFirst({
      where: { id: logId, workoutVersion: { workoutId } },
      include: { sets: true },
    });
    if (!log) {
      throw new NotFoundException('Registro de execução não encontrado.');
    }
    return log;
  }
}
