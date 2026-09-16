import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../common/prisma/prisma.service';
import { parseDurationMs } from '../common/utils/duration';

export interface IssuedPasswordResetToken {
  rawToken: string;
  expiresAt: Date;
}

export interface RequestMeta {
  ipAddress?: string;
}

/**
 * Mesmo padrão de segurança de RefreshTokenService (Fase 2): token opaco
 * gerado por `randomBytes`, só o hash SHA-256 é persistido, uso único.
 * Deliberadamente mais simples — sem família nem rotação, porque isto não
 * é uma cadeia de sessão, é um token de uso único e vida curta.
 */
@Injectable()
export class PasswordResetTokenService {
  private readonly ttlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.ttlMs = parseDurationMs(this.config.get<string>('PASSWORD_RESET_EXPIRES_IN') ?? '30m');
  }

  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  async issue(userId: string, meta: RequestMeta = {}): Promise<IssuedPasswordResetToken> {
    // Só um token de redefinição ativo por vez — pedir de novo invalida o anterior.
    await this.prisma.passwordResetToken.deleteMany({ where: { userId, usedAt: null } });

    const rawToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.ttlMs);

    await this.prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(rawToken),
        expiresAt,
        ipAddress: meta.ipAddress,
      },
    });

    return { rawToken, expiresAt };
  }

  /** Valida e marca como usado; devolve o userId ao qual o token pertence. */
  async consume(rawToken: string): Promise<string> {
    const tokenHash = this.hashToken(rawToken);
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Token de redefinição inválido ou expirado.');
    }

    await this.prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });

    return record.userId;
  }
}
