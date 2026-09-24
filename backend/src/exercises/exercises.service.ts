import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Exercise, ExerciseScope, Role, WorkoutVersionStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateExerciseDto } from './dto/create-exercise.dto';
import { UpdateExerciseDto } from './dto/update-exercise.dto';
import type { CatalogExerciseRef } from './exercise-name-matching';

const LOCKED_IDENTITY_FIELDS = ['name', 'muscleGroup', 'equipment', 'type'] as const;
// Teto de sanidade: acima disso o matching só deixa de achar (vira "não encontrado"), nunca associa errado.
const CATALOG_MATCHING_LIMIT = 5000;

@Injectable()
export class ExercisesService {
  constructor(private readonly prisma: PrismaService) {}

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
    const scope = dto.scope ?? ExerciseScope.global;
    return this.prisma.exercise.create({
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
  }

  async list(professionalId: string, search?: string, type?: string) {
    return this.prisma.exercise.findMany({
      where: {
        ...this.visibilityFilter(professionalId),
        ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
        ...(type ? { type: type as never } : {}),
      },
      orderBy: { name: 'asc' },
      take: 100,
    });
  }

  /** Catálogo visível ao profissional (mesmo filtro de `list`), só os campos usados no matching por nome. */
  async listVisibleCatalogRefs(professionalId: string): Promise<CatalogExerciseRef[]> {
    return this.prisma.exercise.findMany({
      where: this.visibilityFilter(professionalId),
      select: { id: true, name: true, muscleGroup: true, equipment: true, imageUrl: true },
      orderBy: { name: 'asc' },
      take: CATALOG_MATCHING_LIMIT,
    });
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

    return this.prisma.exercise.update({
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
    });
  }
}
