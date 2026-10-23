import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Exercise, ExerciseScope, Role, WorkoutVersionStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateExerciseDto } from './dto/create-exercise.dto';
import { UpdateExerciseDto } from './dto/update-exercise.dto';
import { normalizeExerciseName, type CatalogExerciseRef } from './exercise-name-matching';
import { ExerciseMediaStorage, PRIMARY_EXERCISE_MEDIA_QUERY, type ExerciseWithMedia } from './exercise-media-storage.service';

const LOCKED_IDENTITY_FIELDS = ['name', 'muscleGroup', 'equipment', 'type'] as const;
// Teto de sanidade: acima disso o matching só deixa de achar (vira "não encontrado"), nunca associa errado.
const CATALOG_MATCHING_LIMIT = 5000;
const LIST_LIMIT = 100;

@Injectable()
export class ExercisesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaStorage: ExerciseMediaStorage,
  ) {}

  // Fase 15: mesma regra de foods.service.ts — global só é visível a outros
  // depois de aprovado; o próprio criador vê o que criou enquanto pendente.
  private visibilityFilter(professionalId: string) {
    return {
      OR: [
        { scope: ExerciseScope.global, approvedAt: { not: null } },
        { scope: ExerciseScope.global, createdByProfessionalId: professionalId },
        { scope: ExerciseScope.private, ownerProfessionalId: professionalId },
      ],
    };
  }

  async create(professionalId: string, dto: CreateExerciseDto) {
    this.mediaStorage.assertPersistableImageUrl(dto.imageUrl);
    const scope = dto.scope ?? ExerciseScope.global;
    const exercise = await this.prisma.exercise.create({
      data: {
        name: dto.name,
        description: dto.description,
        muscleGroup: dto.muscleGroup,
        equipment: dto.equipment,
        instructions: dto.instructions,
        type: dto.type,
        scope,
        ownerProfessionalId: scope === ExerciseScope.private ? professionalId : null,
        videoUrl: dto.videoUrl,
        imageUrl: dto.imageUrl,
        createdByProfessionalId: professionalId,
      },
    });
    return this.mediaStorage.toDisplay(exercise);
  }

  /**
   * Busca do catálogo: por nome, grupo muscular ou equipamento, ignorando
   * acento e caixa ("triceps" acha "Tríceps na polia"; "peit" acha os de
   * "Peitoral"). Todas as palavras digitadas precisam aparecer; quem bate
   * pelo nome vem primeiro.
   */
  async list(professionalId: string, search?: string, type?: string) {
    const where = { ...this.visibilityFilter(professionalId), ...(type ? { type: type as never } : {}) };
    const words = normalizeExerciseName(search ?? '').split(' ').filter(Boolean);
    let ids: string[] | null = null;
    if (words.length > 0) {
      const refs = await this.prisma.exercise.findMany({
        where,
        select: { id: true, name: true, muscleGroup: true, equipment: true },
        orderBy: { name: 'asc' },
        take: CATALOG_MATCHING_LIMIT,
      });
      const byName: string[] = [];
      const byDetail: string[] = [];
      for (const ref of refs) {
        const name = normalizeExerciseName(ref.name);
        const detail = normalizeExerciseName(`${ref.name} ${ref.muscleGroup ?? ''} ${ref.equipment ?? ''}`);
        if (words.every((word) => name.includes(word))) byName.push(ref.id);
        else if (words.every((word) => detail.includes(word))) byDetail.push(ref.id);
      }
      ids = [...byName, ...byDetail].slice(0, LIST_LIMIT);
    }
    const exercises = await this.prisma.exercise.findMany({
      where: ids ? { id: { in: ids } } : where,
      include: { media: PRIMARY_EXERCISE_MEDIA_QUERY },
      orderBy: { name: 'asc' },
      take: LIST_LIMIT,
    });
    const ordered = ids ? [...exercises].sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)) : exercises;
    return Promise.all(ordered.map((exercise) => this.mediaStorage.toDisplay(exercise)));
  }

  /** Referências (com a mídia para exibir) dos exercícios visíveis entre os ids pedidos — os que sumiram do catálogo ficam de fora. */
  async visibleRefsByIds(professionalId: string, ids: string[]): Promise<CatalogExerciseRef[]> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return [];
    const refs = await this.prisma.exercise.findMany({
      where: { id: { in: unique }, ...this.visibilityFilter(professionalId) },
      select: { id: true, name: true, muscleGroup: true, equipment: true, imageUrl: true, media: PRIMARY_EXERCISE_MEDIA_QUERY },
    });
    return Promise.all(refs.map((ref) => this.mediaStorage.toDisplay(ref)));
  }

  /** Catálogo visível ao profissional (mesmo filtro de `list`), só os campos usados no matching por nome. */
  async listVisibleCatalogRefs(professionalId: string): Promise<CatalogExerciseRef[]> {
    const refs = await this.prisma.exercise.findMany({
      where: this.visibilityFilter(professionalId),
      select: { id: true, name: true, muscleGroup: true, equipment: true, imageUrl: true, media: PRIMARY_EXERCISE_MEDIA_QUERY },
      orderBy: { name: 'asc' },
      take: CATALOG_MATCHING_LIMIT,
    });
    return Promise.all(refs.map((ref) => this.mediaStorage.toDisplay(ref)));
  }

  /** `imageUrl` para exibição (mídia do R2 → imageUrl gravado) de um exercício já carregado com `media`. */
  toDisplay<T extends ExerciseWithMedia>(exercise: T) {
    return this.mediaStorage.toDisplay(exercise);
  }

  /** `findVisible` para a resposta HTTP: com a mídia resolvida. Uso interno segue com `findVisible`. */
  async findVisibleForDisplay(professionalId: string, exerciseId: string) {
    const exercise = await this.prisma.exercise.findFirst({
      where: { id: exerciseId, ...this.visibilityFilter(professionalId) },
      include: { media: PRIMARY_EXERCISE_MEDIA_QUERY },
    });
    if (!exercise) {
      throw new NotFoundException('Exercício não encontrado.');
    }
    return this.mediaStorage.toDisplay(exercise);
  }

  /** Mesmo critério de `findVisible`, para vários ids numa consulta só — falha se qualquer um não for visível. */
  async assertAllVisible(professionalId: string, exerciseIds: string[]): Promise<void> {
    const ids = [...new Set(exerciseIds)];
    if (ids.length === 0) {
      return;
    }
    const found = await this.prisma.exercise.count({ where: { id: { in: ids }, ...this.visibilityFilter(professionalId) } });
    if (found !== ids.length) {
      throw new NotFoundException('Um ou mais exercícios não foram encontrados no catálogo.');
    }
  }

  async findVisible(professionalId: string, exerciseId: string): Promise<Exercise> {
    const exercise = await this.prisma.exercise.findFirst({
      where: { id: exerciseId, ...this.visibilityFilter(professionalId) },
    });
    if (!exercise) {
      throw new NotFoundException('Exercício não encontrado.');
    }
    return exercise;
  }

  async update(user: AuthenticatedUser, exerciseId: string, dto: UpdateExerciseDto) {
    this.mediaStorage.assertPersistableImageUrl(dto.imageUrl);
    const exercise = await this.findVisible(user.id, exerciseId);

    const isOwner = exercise.scope === ExerciseScope.private && exercise.ownerProfessionalId === user.id;
    const isAuthorizedForGlobal =
      exercise.scope === ExerciseScope.global &&
      (exercise.createdByProfessionalId === user.id || user.role === Role.admin);
    if (!isOwner && !isAuthorizedForGlobal) {
      throw new ForbiddenException('Você não tem permissão para editar este exercício.');
    }

    const touchesIdentity = LOCKED_IDENTITY_FIELDS.some((field) => (dto as Record<string, unknown>)[field] !== undefined);
    if (touchesIdentity) {
      const usedInPublished = await this.prisma.workoutExercise.findFirst({
        where: {
          exerciseId,
          workoutDay: { workoutVersion: { status: { in: [WorkoutVersionStatus.published, WorkoutVersionStatus.superseded] } } },
        },
      });
      if (usedInPublished) {
        throw new ConflictException(
          'Este exercício já foi usado em um treino publicado — nome, grupo muscular, equipamento e tipo não podem ' +
            'ser alterados. O treino já publicado preserva o exercício como prescrito; para uma variação, cadastre um novo.',
        );
      }
    }

    const updated = await this.prisma.exercise.update({
      where: { id: exerciseId },
      data: {
        name: dto.name,
        description: dto.description,
        muscleGroup: dto.muscleGroup,
        equipment: dto.equipment,
        instructions: dto.instructions,
        type: dto.type,
        videoUrl: dto.videoUrl,
        imageUrl: dto.imageUrl,
      },
      include: { media: PRIMARY_EXERCISE_MEDIA_QUERY },
    });
    return this.mediaStorage.toDisplay(updated);
  }
}
