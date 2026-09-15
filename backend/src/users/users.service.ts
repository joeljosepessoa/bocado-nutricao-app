import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        mustChangePassword: true,
        privacyAcceptedAt: true,
      },
    });
    return user;
  }

  async acceptPrivacyTerms(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { privacyAcceptedAt: new Date() },
    });
  }
}
