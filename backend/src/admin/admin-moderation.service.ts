import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AdminAuditAction, ExerciseScope, FoodScope } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AdminAuditLogService } from './admin-audit-log.service';

/**
 * Governança de conteúdo global (Fase 15). Conteúdo privado nunca passa por
 * aqui — as queries abaixo são sempre restritas a scope: global, então um
 * alimento/exercício privado de um profissional nunca aparece na fila nem
 * pode ser aprovado/rejeitado por engano.
 */
@Injectable()
export class AdminModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminAuditLogService,
  ) {}

  async listPendingFoods() {
    return this.prisma.food.findMany({
      where: { scope: FoodScope.global, approvedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  async listPendingExercises() {
    return this.prisma.exercise.findMany({
      where: { scope: ExerciseScope.global, approvedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  async approveFood(adminId: string, foodId: string, ipAddress?: string) {
    const food = await this.prisma.food.findFirst({ where: { id: foodId, scope: FoodScope.global } });
    if (!food) {
      throw new NotFoundException('Alimento global não encontrado.');
    }

    const updated = await this.prisma.food.update({ where: { id: foodId }, data: { approvedAt: new Date() } });
    await this.auditLog.record({
      adminId,
      targetType: 'food',
      targetId: foodId,
      action: AdminAuditAction.content_approved,
      ipAddress,
    });
    return updated;
  }

  async approveExercise(adminId: string, exerciseId: string, ipAddress?: string) {
    const exercise = await this.prisma.exercise.findFirst({ where: { id: exerciseId, scope: ExerciseScope.global } });
    if (!exercise) {
      throw new NotFoundException('Exercício global não encontrado.');
    }

    const updated = await this.prisma.exercise.update({ where: { id: exerciseId }, data: { approvedAt: new Date() } });
    await this.auditLog.record({
      adminId,
      targetType: 'exercise',
      targetId: exerciseId,
      action: AdminAuditAction.content_approved,
      ipAddress,
    });
    return updated;
  }

  /**
   * Rejeitar = tentar excluir. Sem estado "rejected" persistente (decisão
   * aprovada da Fase 15) — se o conteúdo já estiver em uso, 409 explicando
   * por quê, sem excluir nada silenciosamente. Mesma checagem proativa que
   * FoodsService.update()/ExercisesService.update() já usam para o caso de
   * "usado em dieta/treino publicado", mas aqui olhando QUALQUER uso (não só
   * publicado), porque é isso que a FK (onDelete: Restrict) exige para não
   * falhar.
   */
  async rejectFood(adminId: string, foodId: string, ipAddress?: string): Promise<void> {
    const food = await this.prisma.food.findFirst({ where: { id: foodId, scope: FoodScope.global } });
    if (!food) {
      throw new NotFoundException('Alimento global não encontrado.');
    }

    const [inMeal, inSubstitution] = await Promise.all([
      this.prisma.mealFood.findFirst({ where: { foodId } }),
      this.prisma.foodSubstitution.findFirst({ where: { OR: [{ originalFoodId: foodId }, { substituteFoodId: foodId }] } }),
    ]);
    if (inMeal || inSubstitution) {
      throw new ConflictException(
        'Este alimento já está em uso em uma ou mais dietas e não pode ser excluído. ' +
          'Peça ao(s) profissional(is) responsável(is) para deixar de usá-lo antes de rejeitar.',
      );
    }

    await this.prisma.food.delete({ where: { id: foodId } });
    await this.auditLog.record({
      adminId,
      targetType: 'food',
      targetId: foodId,
      action: AdminAuditAction.content_rejected,
      ipAddress,
    });
  }

  async rejectExercise(adminId: string, exerciseId: string, ipAddress?: string): Promise<void> {
    const exercise = await this.prisma.exercise.findFirst({ where: { id: exerciseId, scope: ExerciseScope.global } });
    if (!exercise) {
      throw new NotFoundException('Exercício global não encontrado.');
    }

    const inWorkout = await this.prisma.workoutExercise.findFirst({ where: { exerciseId } });
    if (inWorkout) {
      throw new ConflictException(
        'Este exercício já está em uso em um ou mais treinos e não pode ser excluído. ' +
          'Peça ao(s) profissional(is) responsável(is) para deixar de usá-lo antes de rejeitar.',
      );
    }

    await this.prisma.exercise.delete({ where: { id: exerciseId } });
    await this.auditLog.record({
      adminId,
      targetType: 'exercise',
      targetId: exerciseId,
      action: AdminAuditAction.content_rejected,
      ipAddress,
    });
  }
}
