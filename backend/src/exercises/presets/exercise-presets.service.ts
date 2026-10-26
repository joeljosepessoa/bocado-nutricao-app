import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { repsPrescriptionProblem } from '../../workouts/workout-set-reps';
import { ExercisesService } from '../exercises.service';
import type { CreateExercisePresetDto } from './exercise-preset.dto';

/** Presets do profissional ("exercício + séries" para inserir rápido em treinos e modelos). Só o dono vê e mexe. */
@Injectable()
export class ExercisePresetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exercises: ExercisesService,
  ) {}

  async list(professionalId: string) {
    const presets = await this.prisma.exercisePreset.findMany({
      where: { professionalId },
      orderBy: { createdAt: 'desc' },
      include: { exercise: { select: { id: true, name: true, muscleGroup: true, muscleGroups: true, equipment: true } } },
    });
    // GIF de cada exercício (link para exibir), para o preset já entrar no treino com a demonstração.
    const display = new Map((await this.exercises.visibleRefsByIds(professionalId, presets.map((p) => p.exerciseId))).map((e) => [e.id, e.imageUrl]));
    return presets.map(({ exercise, ...preset }) => ({
      id: preset.id,
      sets: preset.sets,
      reps: preset.reps,
      repsMin: preset.repsMin,
      repsMax: preset.repsMax,
      restSeconds: preset.restSeconds,
      createdAt: preset.createdAt,
      exercise: {
        id: exercise.id,
        name: exercise.name,
        muscleGroups: exercise.muscleGroups.length > 0 ? exercise.muscleGroups : exercise.muscleGroup ? [exercise.muscleGroup] : [],
        equipment: exercise.equipment,
        imageUrl: display.get(exercise.id) ?? null,
      },
    }));
  }

  async create(professionalId: string, dto: CreateExercisePresetDto) {
    const problem = repsPrescriptionProblem({ reps: dto.reps ?? null, repsMin: dto.repsMin ?? null, repsMax: dto.repsMax ?? null });
    if (problem) throw new BadRequestException(problem);
    await this.exercises.findVisible(professionalId, dto.exerciseId);
    const preset = await this.prisma.exercisePreset.create({
      data: {
        professionalId,
        exerciseId: dto.exerciseId,
        sets: dto.sets,
        reps: dto.reps ?? null,
        repsMin: dto.repsMin ?? null,
        repsMax: dto.repsMax ?? null,
        restSeconds: dto.restSeconds ?? null,
      },
    });
    return (await this.list(professionalId)).find((p) => p.id === preset.id)!;
  }

  async remove(professionalId: string, id: string) {
    const preset = await this.prisma.exercisePreset.findFirst({ where: { id, professionalId } });
    if (!preset) throw new NotFoundException('Preset não encontrado.');
    await this.prisma.exercisePreset.delete({ where: { id } });
  }
}
