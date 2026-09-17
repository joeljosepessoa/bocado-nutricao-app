import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { Public } from './common/decorators/public.decorator';
import { PrismaService } from './common/prisma/prisma.service';

@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  // Health-check de produção: um processo "no ar" que não consegue falar
  // com o banco não está realmente saudável — um orquestrador (Docker,
  // Kubernetes, um load balancer) precisa saber disso para não rotear
  // tráfego para ele nem considerá-lo "up".
  @Public()
  @HttpCode(HttpStatus.OK)
  @Get('health')
  async health() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({ status: 'error', service: 'bocado-de-nutricao-api', database: 'down' });
    }
    return { status: 'ok', service: 'bocado-de-nutricao-api', database: 'up' };
  }
}
