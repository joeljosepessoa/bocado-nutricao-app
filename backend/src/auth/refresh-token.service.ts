import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../common/prisma/prisma.service';
import { parseDurationMs } from '../common/utils/duration';

export interface IssuedRefreshToken {
  rawToken: string;
  familyId: string;
  expiresAt: Date;
}

export interface RotatedRefreshToken extends IssuedRefreshToken {
  userId: string;
}

export interface RequestMeta {
  userAgent?: string;
  ipAddress?: string;
}

@Injectable()
export class RefreshTokenService {
  private readonly ttlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.ttlMs = parseDurationMs(this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d');
  }

  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  async issue(userId: string, meta: RequestMeta = {}, familyId: string = randomUUID()): Promise<IssuedRefreshToken> {
    const rawToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.ttlMs);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: this.hashToken(rawToken),
        expiresAt,
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
      },
    });

    return { rawToken, familyId, expiresAt };
  }

  /**
   * Valida e rotaciona um refresh token. Se o token apresentado já tiver
   * sido usado antes (usedAt preenchido), trata como indício de roubo e
   * revoga toda a família, forçando novo login.
   */
  async rotate(rawToken: string, meta: RequestMeta = {}): Promise<RotatedRefreshToken> {
    const tokenHash = this.hashToken(rawToken);
    const record = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token inválido ou expirado.');
    }

    if (record.usedAt) {
      await this.revokeFamily(record.familyId);
      throw new UnauthorizedException('Refresh token já utilizado. Faça login novamente.');
    }

    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });

    const issued = await this.issue(record.userId, meta, record.familyId);
    return { ...issued, userId: record.userId };
  }

  async revoke(rawToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
