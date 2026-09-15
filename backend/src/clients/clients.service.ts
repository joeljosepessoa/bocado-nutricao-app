import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ClientStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { UpdateClientDto } from './dto/update-client.dto';
import { UpdateClientSelfDto } from './dto/update-client-self.dto';

const CLIENT_LIST_SELECT = {
  id: true,
  status: true,
  createdAt: true,
  user: { select: { email: true, fullName: true } },
};

const CLIENT_DETAIL_SELECT = {
  id: true,
  professionalId: true,
  birthDate: true,
  phone: true,
  gender: true,
  notes: true,
  status: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { email: true, fullName: true } },
};

const CLIENT_SELF_SELECT = {
  id: true,
  birthDate: true,
  phone: true,
  gender: true,
  user: { select: { email: true, fullName: true } },
};

export interface ListClientsOptions {
  search?: string;
  status?: ClientStatus | 'all';
  page?: number;
  pageSize?: number;
}

@Injectable()
export class ClientsService {
  private readonly logger = new Logger(ClientsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listForProfessional(professionalId: string, options: ListClientsOptions = {}) {
    const page = options.page && options.page > 0 ? options.page : 1;
    const pageSize = options.pageSize && options.pageSize > 0 ? options.pageSize : 20;

    const where: Prisma.ClientWhereInput = { professionalId };

    if (!options.status) {
      where.status = { not: ClientStatus.archived };
    } else if (options.status !== 'all') {
      where.status = options.status;
    }

    if (options.search) {
      where.user = {
        OR: [
          { fullName: { contains: options.search, mode: 'insensitive' } },
          { email: { contains: options.search, mode: 'insensitive' } },
        ],
      };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.client.findMany({
        where,
        select: CLIENT_LIST_SELECT,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.client.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async findOneForProfessional(professionalId: string, clientId: string) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, professionalId },
      select: CLIENT_DETAIL_SELECT,
    });
    if (!client) {
      throw new NotFoundException('Cliente não encontrado.');
    }
    return client;
  }

  async update(professionalId: string, clientId: string, dto: UpdateClientDto) {
    const existing = await this.prisma.client.findFirst({ where: { id: clientId, professionalId } });
    if (!existing) {
      throw new NotFoundException('Cliente não encontrado.');
    }

    if (dto.email) {
      const owner = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (owner && owner.id !== clientId) {
        this.logger.warn(`Tentativa de atualizar cliente para e-mail já existente: ${dto.email}`);
        throw new BadRequestException('Não foi possível concluir a atualização com os dados informados.');
      }
    }

    const archivedAt =
      dto.status === undefined
        ? undefined
        : dto.status === ClientStatus.archived
          ? new Date()
          : null;

    await this.prisma.$transaction(async (tx) => {
      if (dto.email || dto.fullName) {
        await tx.user.update({
          where: { id: clientId },
          data: { email: dto.email, fullName: dto.fullName },
        });
      }
      await tx.client.update({
        where: { id: clientId },
        data: {
          phone: dto.phone,
          gender: dto.gender,
          birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
          notes: dto.notes,
          status: dto.status,
          archivedAt,
        },
      });
    });

    return this.findOneForProfessional(professionalId, clientId);
  }

  async me(clientId: string) {
    const client = await this.prisma.client.findUniqueOrThrow({
      where: { id: clientId },
      select: CLIENT_SELF_SELECT,
    });
    return client;
  }

  async updateSelf(clientId: string, dto: UpdateClientSelfDto) {
    await this.prisma.$transaction(async (tx) => {
      if (dto.fullName !== undefined) {
        await tx.user.update({ where: { id: clientId }, data: { fullName: dto.fullName } });
      }
      if (dto.phone !== undefined) {
        await tx.client.update({ where: { id: clientId }, data: { phone: dto.phone } });
      }
    });
    return this.me(clientId);
  }
}
