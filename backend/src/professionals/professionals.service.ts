import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { PasswordService } from '../auth/password.service';
import { CreateClientDto } from './dto/create-client.dto';

@Injectable()
export class ProfessionalsService {
  private readonly logger = new Logger(ProfessionalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
  ) {}

  async me(professionalId: string) {
    const professional = await this.prisma.professional.findUnique({
      where: { id: professionalId },
      include: { user: { select: { id: true, email: true, fullName: true } } },
    });
    if (!professional) {
      throw new NotFoundException('Profissional não encontrado.');
    }
    return professional;
  }

  async createClient(professionalId: string, dto: CreateClientDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      this.logger.warn(`Tentativa de cadastro de cliente com e-mail já existente: ${dto.email}`);
      throw new BadRequestException('Não foi possível concluir o cadastro com os dados informados.');
    }

    const temporaryPassword = this.passwordService.generateTemporaryPassword();
    const passwordHash = await this.passwordService.hash(temporaryPassword);

    const client = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          fullName: dto.fullName,
          role: Role.client,
          mustChangePassword: true,
        },
      });
      return tx.client.create({
        data: {
          id: user.id,
          professionalId,
          birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
        },
        include: { user: { select: { id: true, email: true, fullName: true } } },
      });
    });

    return { client, temporaryPassword };
  }
}
