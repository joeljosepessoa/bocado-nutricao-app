import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

const CLIENT_SELECT = {
  id: true,
  professionalId: true,
  birthDate: true,
  user: { select: { email: true, fullName: true } },
};

const CLIENT_SELF_SELECT = {
  id: true,
  birthDate: true,
  user: { select: { email: true, fullName: true } },
};

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForProfessional(professionalId: string, page = 1, pageSize = 20) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.client.findMany({
        where: { professionalId },
        select: CLIENT_SELECT,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { id: 'asc' },
      }),
      this.prisma.client.count({ where: { professionalId } }),
    ]);
    return { items, total, page, pageSize };
  }

  async findOneForProfessional(professionalId: string, clientId: string) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, professionalId },
      select: CLIENT_SELECT,
    });
    if (!client) {
      throw new NotFoundException('Cliente não encontrado.');
    }
    return client;
  }

  async me(clientId: string) {
    const client = await this.prisma.client.findUniqueOrThrow({
      where: { id: clientId },
      select: CLIENT_SELF_SELECT,
    });
    return client;
  }
}
