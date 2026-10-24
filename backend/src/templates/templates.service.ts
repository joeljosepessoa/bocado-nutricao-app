import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DietStatus, DietVersionStatus, Prisma, Template, TemplateKind, WorkoutStatus, WorkoutVersionStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { DietsService, RequestMeta } from '../diets/diets.service';
import { proposalStructureProblems } from '../diets/diet-proposal';
import { ExercisesService } from '../exercises/exercises.service';
import { FoodsService } from '../foods/foods.service';
import { repsPrescriptionProblem } from '../workouts/workout-set-reps';
import { WorkoutsService } from '../workouts/workouts.service';
import type { DietTemplateContentDto, WorkoutTemplateContentDto } from './dto/template.dto';

interface TemplateFields<C> {
  name?: string;
  description?: string | null;
  content?: C;
}

type Content = DietTemplateContentDto | WorkoutTemplateContentDto;

const blank = (value: string | null | undefined) => (value && value.trim() ? value.trim() : null);
/** Guarda só dado puro (sem instâncias de classe nem campos indefinidos). */
const toJson = (content: Content) => JSON.parse(JSON.stringify(content)) as Prisma.InputJsonValue;

/**
 * Biblioteca de modelos do profissional (dieta ou treino sem paciente).
 * O conteúdo é validado com as mesmas regras de quando vira rascunho do
 * paciente, então "Usar com paciente" só falha por motivo do paciente
 * (ex.: rascunho de dieta já aberto) ou por alimento/exercício que saiu do catálogo depois.
 */
@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly foods: FoodsService,
    private readonly exercises: ExercisesService,
    private readonly diets: DietsService,
    private readonly workouts: WorkoutsService,
  ) {}

  async list(professionalId: string, kind: TemplateKind, trash: boolean) {
    const rows = await this.prisma.template.findMany({
      where: { professionalId, kind, deletedAt: trash ? { not: null } : null },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((row) => this.summary(row));
  }

  /** Modelo completo para abrir no editor, com o nome atual dos alimentos/exercícios do catálogo. */
  async get(professionalId: string, kind: TemplateKind, id: string) {
    const row = await this.owned(professionalId, kind, id);
    if (kind === TemplateKind.diet) {
      const content = row.content as unknown as DietTemplateContentDto;
      const foodIds = content.days.flatMap((d) => d.meals.flatMap((m) => m.groups.flatMap((g) => g.choices.flatMap((c) => c.foods.map((f) => f.foodId)))));
      const foods = await this.foods.visibleRefsByIds(professionalId, foodIds.filter((foodId): foodId is string => !!foodId));
      return { ...this.summary(row), content, foods };
    }
    const content = row.content as unknown as WorkoutTemplateContentDto;
    const exercises = await this.exercises.visibleRefsByIds(
      professionalId,
      content.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)),
    );
    return { ...this.summary(row), content, exercises };
  }

  async create(professionalId: string, kind: TemplateKind, dto: Required<Pick<TemplateFields<Content>, 'name' | 'content'>> & TemplateFields<Content>) {
    await this.validate(professionalId, kind, dto.content);
    const row = await this.prisma.template.create({
      data: { professionalId, kind, name: dto.name.trim(), description: blank(dto.description), content: toJson(dto.content) },
    });
    return this.summary(row);
  }

  async update(professionalId: string, kind: TemplateKind, id: string, dto: TemplateFields<Content>) {
    const row = await this.owned(professionalId, kind, id);
    if (row.deletedAt) throw new BadRequestException('Este modelo está na lixeira. Restaure antes de editar.');
    if (dto.content) await this.validate(professionalId, kind, dto.content);
    const updated = await this.prisma.template.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: blank(dto.description) } : {}),
        ...(dto.content ? { content: toJson(dto.content) } : {}),
      },
    });
    return this.summary(updated);
  }

  async duplicate(professionalId: string, kind: TemplateKind, id: string) {
    const row = await this.owned(professionalId, kind, id);
    const copy = await this.prisma.template.create({
      data: {
        professionalId,
        kind,
        name: `${row.name} (cópia)`.slice(0, 120),
        description: row.description,
        content: row.content as Prisma.InputJsonValue,
      },
    });
    return this.summary(copy);
  }

  /** Vai para a lixeira — dá para restaurar. */
  async remove(professionalId: string, kind: TemplateKind, id: string) {
    const row = await this.owned(professionalId, kind, id);
    if (!row.deletedAt) await this.prisma.template.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async restore(professionalId: string, kind: TemplateKind, id: string) {
    await this.owned(professionalId, kind, id);
    const row = await this.prisma.template.update({ where: { id }, data: { deletedAt: null } });
    return this.summary(row);
  }

  /** Atribuir a um paciente: o modelo vira RASCUNHO na ficha dele (as regras do paciente valem como sempre). */
  async apply(professionalId: string, kind: TemplateKind, id: string, clientId: string, replaceDraft: boolean, meta: RequestMeta = {}) {
    const row = await this.owned(professionalId, kind, id);
    if (row.deletedAt) throw new BadRequestException('Este modelo está na lixeira. Restaure antes de usar.');
    if (kind === TemplateKind.diet) {
      const content = row.content as unknown as DietTemplateContentDto;
      return this.diets.createFromProposal(professionalId, clientId, { ...content, ...(replaceDraft ? { replaceDraft: true } : {}) }, meta);
    }
    return this.workouts.createFromProposal(professionalId, clientId, row.content as unknown as WorkoutTemplateContentDto, meta);
  }

  /**
   * "Salvar como modelo" a partir do paciente: copia a versão em edição (rascunho) ou,
   * sem rascunho, a publicada. Observações internas da versão (notes) não vão para o modelo.
   */
  async fromClient(professionalId: string, kind: TemplateKind, clientId: string, name: string, description?: string | null) {
    const client = await this.prisma.client.findFirst({ where: { id: clientId, professionalId }, select: { id: true } });
    if (!client) throw new NotFoundException('Paciente não encontrado.');
    const content = kind === TemplateKind.diet ? await this.dietContentOf(clientId) : await this.workoutContentOf(clientId);
    if (!content) {
      throw new BadRequestException(
        kind === TemplateKind.diet
          ? 'Este paciente ainda não tem dieta com refeições para salvar como modelo.'
          : 'Este paciente ainda não tem treino com dias para salvar como modelo.',
      );
    }
    return this.create(professionalId, kind, { name, description, content });
  }

  /**
   * Ponto de partida da conversa com a IA dentro do paciente: a dieta/treino atual (rascunho, se houver;
   * senão a publicada) no formato do editor, com o nome atual dos alimentos/exercícios, e se o paciente
   * já autorizou a IA (sem isso a conversa é bloqueada).
   */
  async clientContent(professionalId: string, kind: TemplateKind, clientId: string) {
    const client = await this.prisma.client.findFirst({ where: { id: clientId, professionalId }, select: { aiDataProcessingConsentAt: true } });
    if (!client) throw new NotFoundException('Paciente não encontrado.');
    const patientAiConsent = client.aiDataProcessingConsentAt !== null;
    if (kind === TemplateKind.diet) {
      const content = await this.dietContentOf(clientId);
      const ids = (content?.days ?? []).flatMap((d) => d.meals.flatMap((m) => m.groups.flatMap((g) => g.choices.flatMap((c) => c.foods.map((f) => f.foodId)))));
      const foods = await this.foods.visibleRefsByIds(professionalId, ids.filter((id): id is string => !!id));
      return { content, foods, patientAiConsent };
    }
    const content = await this.workoutContentOf(clientId);
    const exercises = await this.exercises.visibleRefsByIds(professionalId, (content?.days ?? []).flatMap((d) => d.exercises.map((e) => e.exerciseId)));
    return { content, exercises, patientAiConsent };
  }

  private async dietContentOf(clientId: string): Promise<DietTemplateContentDto | null> {
    const order = { orderBy: { order: 'asc' as const } };
    const version = await this.prisma.dietVersion.findFirst({
      where: { diet: { clientId, status: DietStatus.active }, status: { in: [DietVersionStatus.draft, DietVersionStatus.published] } },
      // Rascunho (o que está sendo editado) vem antes da publicada; empate pela versão mais nova.
      orderBy: [{ diet: { createdAt: 'desc' } }, { status: 'asc' }, { versionNumber: 'desc' }],
      include: {
        supplements: order,
        days: { ...order, include: { meals: { ...order, include: { groups: { ...order, include: { choices: { ...order, include: { foods: order } } } } } } } },
      },
    });
    if (!version || version.days.every((day) => day.meals.length === 0)) return null;
    return {
      ...(version.objective ? { objective: version.objective } : {}),
      days: version.days
        .filter((day) => day.meals.length > 0)
        .map((day) => ({
          label: day.label,
          kind: day.kind,
          usageNotes: day.usageNotes,
          meals: day.meals.map((meal) => ({
            name: meal.name,
            time: meal.time,
            notes: meal.notes,
            groups: meal.groups.map((group) => ({
              kind: group.kind,
              label: group.label,
              choices: group.choices.map((choice) => ({
                label: choice.label,
                foods: choice.foods.map((food) => ({
                  ...(food.foodId ? { foodId: food.foodId } : {}),
                  ...(food.customFoodName ? { customFoodName: food.customFoodName } : {}),
                  ...(food.isFreeQuantity ? { isFreeQuantity: true } : {}),
                  ...(!food.isFreeQuantity && food.quantity !== null ? { quantity: food.quantity } : {}),
                  ...(!food.isFreeQuantity && food.quantityMax !== null ? { quantityMax: food.quantityMax } : {}),
                  ...(!food.isFreeQuantity && food.unit ? { unit: food.unit } : {}),
                  notes: food.notes,
                })),
              })),
            })),
          })),
        })),
      supplements: version.supplements.map((s) => ({
        name: s.name,
        ...(s.quantity !== null ? { quantity: s.quantity } : {}),
        ...(s.quantityMax !== null ? { quantityMax: s.quantityMax } : {}),
        unitText: s.unitText,
        timing: s.timing,
        notes: s.notes,
      })),
      patientGuidelines: version.patientGuidelines,
    } as DietTemplateContentDto;
  }

  private async workoutContentOf(clientId: string): Promise<WorkoutTemplateContentDto | null> {
    const order = { orderBy: { order: 'asc' as const } };
    const version = await this.prisma.workoutVersion.findFirst({
      where: { workout: { clientId, status: WorkoutStatus.active }, status: { in: [WorkoutVersionStatus.draft, WorkoutVersionStatus.published] } },
      orderBy: [{ workout: { createdAt: 'desc' } }, { status: 'asc' }, { versionNumber: 'desc' }],
      include: { days: { ...order, include: { exercises: { ...order, include: { sets: order } } } } },
    });
    if (!version || version.days.length === 0) return null;
    return {
      ...(version.objective ? { objective: version.objective } : {}),
      days: version.days.map((day) => ({
        name: day.name,
        notes: day.notes,
        exercises: day.exercises.map((exercise) => ({
          exerciseId: exercise.exerciseId,
          notes: exercise.notes,
          sets: exercise.sets.map((set) => ({
            reps: set.reps,
            repsMin: set.repsMin,
            repsMax: set.repsMax,
            loadValue: set.loadValue,
            loadUnit: set.loadUnit,
            durationSeconds: set.durationSeconds,
            distanceMeters: set.distanceMeters,
            restSeconds: set.restSeconds,
            tempo: set.tempo,
            notes: set.notes,
          })),
        })),
      })),
    } as WorkoutTemplateContentDto;
  }

  private async owned(professionalId: string, kind: TemplateKind, id: string): Promise<Template> {
    const row = await this.prisma.template.findFirst({ where: { id, professionalId, kind } });
    if (!row) throw new NotFoundException('Modelo não encontrado.');
    return row;
  }

  private async validate(professionalId: string, kind: TemplateKind, content: Content) {
    if (kind === TemplateKind.diet) {
      const diet = content as DietTemplateContentDto;
      const problems = proposalStructureProblems(diet.days, diet.supplements ?? []);
      if (problems.length > 0) throw new BadRequestException(`Corrija a estrutura da dieta: ${problems.slice(0, 5).join(' ')}`);
      const ids = [
        ...new Set(diet.days.flatMap((d) => d.meals.flatMap((m) => m.groups.flatMap((g) => g.choices.flatMap((c) => c.foods.map((f) => f.foodId)))))),
      ].filter((foodId): foodId is string => !!foodId);
      const visible = await this.foods.visibleRefsByIds(professionalId, ids);
      if (visible.length !== ids.length) throw new NotFoundException('Um ou mais alimentos não foram encontrados no catálogo.');
      return;
    }
    const workout = content as WorkoutTemplateContentDto;
    workout.days.forEach((day, d) =>
      day.exercises.forEach((exercise, e) =>
        exercise.sets.forEach((set, s) => {
          const problem = repsPrescriptionProblem(set);
          if (problem) throw new BadRequestException(`Dia ${d + 1}, exercício ${e + 1}, série ${s + 1}: ${problem}`);
        }),
      ),
    );
    await this.exercises.assertAllVisible(
      professionalId,
      workout.days.flatMap((day) => day.exercises.map((exercise) => exercise.exerciseId)),
    );
  }

  /** Lista: nome, descrição, datas e um resumo do tamanho (sem o conteúdo inteiro). */
  private summary(row: Template) {
    const days = (row.content as { days?: Array<{ meals?: unknown[]; exercises?: unknown[] }> }).days ?? [];
    const counts =
      row.kind === TemplateKind.diet
        ? { days: days.length, meals: days.reduce((sum, d) => sum + (d.meals?.length ?? 0), 0) }
        : { days: days.length, exercises: days.reduce((sum, d) => sum + (d.exercises?.length ?? 0), 0) };
    return {
      id: row.id,
      kind: row.kind,
      name: row.name,
      description: row.description,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
      counts,
    };
  }
}
