import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  listActive() {
    return this.prisma.plan.findMany({ where: { active: true }, orderBy: { priceCents: 'asc' } });
  }
}
