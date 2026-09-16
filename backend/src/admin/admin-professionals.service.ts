import { Injectable, NotFoundException } from '@nestjs/common';
import { AdminAuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { RefreshTokenService } from '../auth/refresh-token.service';
import { AdminAuditLogService } from './admin-audit-log.service';

const PROFESSIONAL_LIST_SELECT = {
  id: true,
  professionalRegister: true,
  user: { select: { email: true, fullName: true, suspendedAt: true, createdAt: true } },
};

export interface ListProfessionalsOptions {
  search?: string;
  status?: 'all' | 'active' | 'suspended';
  page?: number;
  pageSize?: number;
}

@Injectable()
export class AdminProfessionalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly auditLog: AdminAuditLogService,
  ) {}

  async list(options: ListProfessionalsOptions = {}) {
    const page = options.page && options.page > 0 ? options.page : 1;
    const pageSize = options.pageSize && options.pageSize > 0 ? options.pageSize : 20;

    const userWhere: Prisma.UserWhereInput = {};
    if (options.status === 'active') {
      userWhere.suspendedAt = null;
    } else if (options.status === 'suspended') {
      userWhere.suspendedAt = { not: null };
    }
    if (options.search) {
      userWhere.OR = [
        { fullName: { contains: options.search, mode: 'insensitive' } },
        { email: { contains: options.search, mode: 'insensitive' } },
      ];
    }
    const where: Prisma.ProfessionalWhereInput = { user: userWhere };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.professional.findMany({
        where,
        select: PROFESSIONAL_LIST_SELECT,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { user: { createdAt: 'desc' } },
      }),
      this.prisma.professional.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async findOne(professionalId: string) {
    const professional = await this.prisma.professional.findUnique({
      where: { id: professionalId },
      select: PROFESSIONAL_LIST_SELECT,
    });
    if (!professional) {
      throw new NotFoundException('Profissional não encontrado.');
    }
    return professional;
  }

  /**
   * Bloqueia login (User.suspendedAt, checado em AuthService.login) e
   * revoga imediatamente toda sessão ativa — mesmo mecanismo já usado no
   * reset de senha (Fase 13). Nunca apaga dado nenhum: clientes, dietas,
   * avaliações, treinos e relatórios do profissional continuam intactos.
   */
  async suspend(adminId: string, professionalId: string, ipAddress?: string) {
    await this.findOne(professionalId);

    await this.prisma.user.update({
      where: { id: professionalId },
      data: { suspendedAt: new Date() },
    });
    await this.refreshTokenService.revokeAllForUser(professionalId);
    await this.auditLog.record({
      adminId,
      targetType: 'professional',
      targetId: professionalId,
      action: AdminAuditAction.professional_suspended,
      ipAddress,
    });

    return this.findOne(professionalId);
  }

  async reactivate(adminId: string, professionalId: string, ipAddress?: string) {
    await this.findOne(professionalId);

    await this.prisma.user.update({
      where: { id: professionalId },
      data: { suspendedAt: null },
    });
    await this.auditLog.record({
      adminId,
      targetType: 'professional',
      targetId: professionalId,
      action: AdminAuditAction.professional_reactivated,
      ipAddress,
    });

    return this.findOne(professionalId);
  }
}
