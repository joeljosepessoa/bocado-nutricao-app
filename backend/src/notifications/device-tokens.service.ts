import { ForbiddenException, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';

function ownerFilter(user: AuthenticatedUser): { clientId: string } | { professionalId: string } {
  return user.role === Role.client ? { clientId: user.id } : { professionalId: user.id };
}

@Injectable()
export class DeviceTokensService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotente por token: se o mesmo token já existir (reinstall, app
   * gerou o mesmo token de novo), só reatribui ao dono atual e limpa
   * revogação — nunca cria duas linhas para o mesmo token.
   */
  async register(user: AuthenticatedUser, dto: RegisterDeviceTokenDto) {
    const owner = ownerFilter(user);
    return this.prisma.deviceToken.upsert({
      where: { token: dto.token },
      update: { ...owner, platform: dto.platform, revokedAt: null },
      create: { ...owner, platform: dto.platform, token: dto.token },
    });
  }

  /**
   * Revoga só se o token pertencer a quem está pedindo — nunca deixa um
   * usuário revogar (ou sequer confirmar a existência de) o token de outro.
   */
  async revoke(user: AuthenticatedUser, token: string): Promise<void> {
    const owner = ownerFilter(user);
    const existing = await this.prisma.deviceToken.findUnique({ where: { token } });
    if (!existing) {
      return;
    }
    const belongsToCaller =
      ('clientId' in owner && existing.clientId === owner.clientId) ||
      ('professionalId' in owner && existing.professionalId === owner.professionalId);
    if (!belongsToCaller) {
      throw new ForbiddenException('Este token não pertence à sua conta.');
    }
    await this.prisma.deviceToken.update({ where: { token }, data: { revokedAt: new Date() } });
  }
}
