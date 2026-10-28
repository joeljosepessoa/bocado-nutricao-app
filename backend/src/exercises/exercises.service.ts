import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Exercise, ExerciseMediaCurationStatus, ExerciseScope, Prisma, Role, WorkoutVersionStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateExerciseDto } from './dto/create-exercise.dto';
import { UpdateExerciseDto } from './dto/update-exercise.dto';
import { normalizeExerciseName, type CatalogExerciseRef } from './exercise-name-matching';
import { ExerciseMediaStorage, PRIMARY_EXERCISE_MEDIA_QUERY, type ExerciseWithMedia } from './exercise-media-storage.service';
import { buildGifIndex, suggestGifCandidates } from './exercise-gif-suggestions';

/** Marca, em ExerciseMedia.sourceFileName, o GIF ligado da biblioteca (o que "Desfazer" pode tirar). */
export const LIBRARY_GIF_MARK = 'biblioteca:';

const LOCKED_IDENTITY_FIELDS = ['name', 'muscleGroup', 'muscleGroups', 'equipment', 'type'] as const;
// Teto de sanidade: acima disso o matching só deixa de achar (vira "não encontrado"), nunca associa errado.
// A biblioteca tem ~5 mil exercícios oficiais (mais os particulares de cada profissional).
const CATALOG_MATCHING_LIMIT = 20000;
const LIST_LIMIT = 100;
/** Filtro "Sem grupos definidos" da biblioteca. */
export const NO_GROUP = '__sem_grupo__';

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
        // Lista de grupos manda; o grupo principal é o primeiro dela.
        muscleGroups: dto.muscleGroups ?? (dto.muscleGroup ? [dto.muscleGroup] : []),
        muscleGroup: dto.muscleGroups !== undefined ? (dto.muscleGroups[0] ?? null) : dto.muscleGroup,
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

  /** Quem cuida do catálogo oficial pode editar os exercícios da biblioteca (não só os próprios). */
  async canEditCatalog(professionalId: string): Promise<boolean> {
    const professional = await this.prisma.professional.findUnique({ where: { id: professionalId }, select: { canEditCatalog: true } });
    return professional?.canEditCatalog === true;
  }

  /**
   * Tela "Exercícios": busca por nome (sem acento/caixa; todas as palavras), filtro por grupo muscular e
   * equipamento, contagens para os filtros (de acordo com os outros filtros) e paginação. O GIF de cada
   * item da página vem com link temporário (abre ao clicar).
   */
  async library(professionalId: string, query: { search?: string; group?: string; equipment?: string; page?: number; pageSize?: number }) {
    const rows = await this.prisma.exercise.findMany({
      where: this.visibilityFilter(professionalId),
      select: {
        id: true,
        name: true,
        muscleGroup: true,
        muscleGroups: true,
        equipment: true,
        section: true,
        scope: true,
        ownerProfessionalId: true,
        createdByProfessionalId: true,
      },
      take: CATALOG_MATCHING_LIMIT,
    });
    type Row = (typeof rows)[number];
    const words = normalizeExerciseName(query.search ?? '').split(' ').filter(Boolean);
    const groupsOf = (row: Row) => (row.muscleGroups.length > 0 ? row.muscleGroups : row.muscleGroup ? [row.muscleGroup] : []);
    const bySearch =
      words.length > 0
        ? rows.filter((row) => {
            const name = normalizeExerciseName(row.name);
            return words.every((word) => name.includes(word));
          })
        : rows;
    const matchesGroup = (row: Row) => !query.group || (query.group === NO_GROUP ? groupsOf(row).length === 0 : groupsOf(row).includes(query.group));
    const matchesEquipment = (row: Row) => !query.equipment || (row.equipment ?? '') === query.equipment;
    const count = (list: Row[], keysOf: (row: Row) => string[]) => {
      const counts = new Map<string, number>();
      for (const row of list) for (const key of keysOf(row)) counts.set(key, (counts.get(key) ?? 0) + 1);
      return [...counts].map(([name, total]) => ({ name, count: total })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pt-BR'));
    };
    const forGroups = bySearch.filter(matchesEquipment);
    const groups = count(forGroups, groupsOf);
    const withoutGroup = forGroups.filter((row) => groupsOf(row).length === 0).length;
    const equipments = count(bySearch.filter(matchesGroup), (row) => (row.equipment ? [row.equipment] : []));

    const filtered = bySearch.filter((row) => matchesGroup(row) && matchesEquipment(row)).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    const pageSize = Math.min(Math.max(query.pageSize ?? 30, 1), 100);
    const page = Math.max(query.page ?? 1, 1);
    const slice = filtered.slice((page - 1) * pageSize, page * pageSize);
    const catalogEditor = await this.canEditCatalog(professionalId);
    const withMedia = await this.prisma.exercise.findMany({
      where: { id: { in: slice.map((row) => row.id) } },
      select: { id: true, imageUrl: true, media: PRIMARY_EXERCISE_MEDIA_QUERY },
    });
    const gifs = new Map((await Promise.all(withMedia.map((e) => this.mediaStorage.toDisplay(e)))).map((e) => [e.id, e.imageUrl]));

    return {
      items: slice.map((row) => ({
        id: row.id,
        name: row.name,
        muscleGroups: groupsOf(row),
        equipment: row.equipment,
        section: row.section,
        scope: row.scope,
        gifUrl: gifs.get(row.id) ?? null,
        canEdit:
          (row.scope === ExerciseScope.private && row.ownerProfessionalId === professionalId) ||
          (row.scope === ExerciseScope.global && (row.createdByProfessionalId === professionalId || catalogEditor)),
      })),
      total: filtered.length,
      page,
      pageSize,
      groups,
      withoutGroup,
      equipments,
    };
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

  /** Catálogo para a IA: todos os exercícios visíveis, com os grupos e se têm GIF aprovado (sem gerar links). */
  async listCatalogForAi(professionalId: string): Promise<Array<{ id: string; name: string; muscleGroups: string[]; equipment: string | null; hasGif: boolean }>> {
    const rows = await this.prisma.exercise.findMany({
      where: this.visibilityFilter(professionalId),
      select: {
        id: true,
        name: true,
        muscleGroup: true,
        muscleGroups: true,
        equipment: true,
        media: { where: { curationStatus: 'approved', contentType: { startsWith: 'image/' } }, select: { id: true }, take: 1 },
      },
      orderBy: { id: 'asc' },
      take: CATALOG_MATCHING_LIMIT,
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      muscleGroups: row.muscleGroups.length > 0 ? row.muscleGroups : row.muscleGroup ? [row.muscleGroup] : [],
      equipment: row.equipment,
      hasGif: row.media.length > 0,
    }));
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

  /**
   * Tela "Sem GIF": os exercícios particulares do profissional que ainda não têm GIF, com quantas vezes
   * aparecem nos treinos dele e sugestões da biblioteca (com o GIF para conferir antes de ligar).
   */
  async withoutGif(professionalId: string) {
    const own = await this.prisma.exercise.findMany({
      where: {
        scope: ExerciseScope.private,
        ownerProfessionalId: professionalId,
        media: { none: { curationStatus: ExerciseMediaCurationStatus.approved, contentType: { startsWith: 'image/' } } },
      },
      select: { id: true, name: true },
    });
    if (own.length === 0) return { items: [] };

    const usage = await this.prisma.workoutExercise.findMany({
      where: { exerciseId: { in: own.map((e) => e.id) }, workoutDay: { workoutVersion: { workout: { professionalId } } } },
      select: { exerciseId: true, workoutDay: { select: { workoutVersion: { select: { workout: { select: { clientId: true } } } } } } },
    });
    const uses = new Map<string, { count: number; clients: Set<string> }>();
    for (const row of usage) {
      const entry = uses.get(row.exerciseId) ?? { count: 0, clients: new Set<string>() };
      entry.count += 1;
      entry.clients.add(row.workoutDay.workoutVersion.workout.clientId);
      uses.set(row.exerciseId, entry);
    }

    const library = buildGifIndex(await this.libraryWithGif());
    const items = await Promise.all(
      own.map(async (exercise) => ({
        id: exercise.id,
        name: exercise.name,
        uses: uses.get(exercise.id)?.count ?? 0,
        clients: uses.get(exercise.id)?.clients.size ?? 0,
        suggestions: await Promise.all(
          suggestGifCandidates(exercise.name, library).map(async (c) => ({ id: c.id, name: c.name, section: c.section, gifUrl: await this.mediaStorage.presignedGetUrl(c.storageKey) })),
        ),
      })),
    );
    items.sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name, 'pt-BR'));
    return { items };
  }

  /** Exercícios oficiais com GIF aprovado (o GIF principal de cada um). */
  private async libraryWithGif(where: Prisma.ExerciseWhereInput = {}) {
    const rows = await this.prisma.exercise.findMany({
      where: { ...where, scope: ExerciseScope.global, approvedAt: { not: null }, media: { some: { curationStatus: ExerciseMediaCurationStatus.approved, contentType: { startsWith: 'image/' } } } },
      select: {
        id: true,
        name: true,
        section: true,
        muscleGroup: true,
        muscleGroups: true,
        equipment: true,
        media: {
          where: { curationStatus: ExerciseMediaCurationStatus.approved, contentType: { startsWith: 'image/' } },
          orderBy: PRIMARY_EXERCISE_MEDIA_QUERY.orderBy,
          take: 1,
          select: { storageKey: true, contentType: true, sizeBytes: true, sha256: true, sourceFileName: true },
        },
      },
      take: CATALOG_MATCHING_LIMIT,
    });
    return rows.map(({ media, ...rest }) => ({ ...rest, ...media[0] }));
  }

  /**
   * Liga ao exercício particular o GIF de um exercício da biblioteca. O exercício continua o mesmo (nome,
   * treinos publicados, cargas registradas); só passa a mostrar o GIF. Grupos e equipamento vazios são
   * preenchidos com os do exercício da biblioteca.
   */
  async linkLibraryGif(professionalId: string, exerciseId: string, fromExerciseId: string) {
    const exercise = await this.ownPrivateExercise(professionalId, exerciseId);
    const [source] = await this.libraryWithGif({ id: fromExerciseId });
    if (!source) throw new NotFoundException('Exercício da biblioteca com GIF não encontrado.');

    await this.prisma.$transaction(async (tx) => {
      await tx.exerciseMedia.updateMany({ where: { exerciseId }, data: { isPrimary: false } });
      await tx.exerciseMedia.deleteMany({ where: { exerciseId, sourceFileName: { startsWith: LIBRARY_GIF_MARK } } });
      await tx.exerciseMedia.create({
        data: {
          exerciseId,
          storageKey: source.storageKey,
          contentType: source.contentType,
          sizeBytes: source.sizeBytes,
          sha256: source.sha256,
          curationStatus: ExerciseMediaCurationStatus.approved,
          isPrimary: true,
          sourceFileName: `${LIBRARY_GIF_MARK}${source.id}`,
          reviewedAt: new Date(),
        },
      });
      const groups = source.muscleGroups.length > 0 ? source.muscleGroups : source.muscleGroup ? [source.muscleGroup] : [];
      const fillGroups = exercise.muscleGroups.length === 0 && !exercise.muscleGroup && groups.length > 0;
      if (fillGroups || (!exercise.equipment && source.equipment)) {
        await tx.exercise.update({
          where: { id: exerciseId },
          data: {
            ...(fillGroups ? { muscleGroups: groups, muscleGroup: groups[0] } : {}),
            ...(!exercise.equipment && source.equipment ? { equipment: source.equipment } : {}),
          },
        });
      }
    });
    return { id: exerciseId, gifUrl: await this.mediaStorage.presignedGetUrl(source.storageKey), fromExercise: { id: source.id, name: source.name } };
  }

  /** Desfaz `linkLibraryGif`: tira só o GIF que veio da biblioteca. */
  async unlinkLibraryGif(professionalId: string, exerciseId: string) {
    await this.ownPrivateExercise(professionalId, exerciseId);
    const removed = await this.prisma.exerciseMedia.deleteMany({ where: { exerciseId, sourceFileName: { startsWith: LIBRARY_GIF_MARK } } });
    if (removed.count === 0) throw new NotFoundException('Este exercício não tem GIF ligado da biblioteca.');
  }

  private async ownPrivateExercise(professionalId: string, exerciseId: string) {
    const exercise = await this.prisma.exercise.findFirst({ where: { id: exerciseId, scope: ExerciseScope.private, ownerProfessionalId: professionalId } });
    if (!exercise) throw new NotFoundException('Exercício particular não encontrado.');
    return exercise;
  }

  async update(user: AuthenticatedUser, exerciseId: string, dto: UpdateExerciseDto) {
    this.mediaStorage.assertPersistableImageUrl(dto.imageUrl);
    const exercise = await this.findVisible(user.id, exerciseId);

    const isOwner = exercise.scope === ExerciseScope.private && exercise.ownerProfessionalId === user.id;
    const isAuthorizedForGlobal =
      exercise.scope === ExerciseScope.global &&
      (exercise.createdByProfessionalId === user.id || user.role === Role.admin || (await this.canEditCatalog(user.id)));
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
        // Lista de grupos manda; o grupo principal é o primeiro dela.
        ...(dto.muscleGroups !== undefined ? { muscleGroups: dto.muscleGroups } : {}),
        muscleGroup: dto.muscleGroups !== undefined ? (dto.muscleGroups[0] ?? null) : dto.muscleGroup,
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
