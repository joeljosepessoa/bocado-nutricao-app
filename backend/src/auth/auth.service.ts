import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { PasswordService } from './password.service';
import { RefreshTokenService, RequestMeta } from './refresh-token.service';
import { PasswordResetTokenService } from './password-reset-token.service';
import { EmailService } from './email/email.service';
import { RegisterProfessionalDto } from './dto/register-professional.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

export interface AuthTokenPair {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: Role;
    mustChangePassword: boolean;
    privacyAcceptedAt: Date | null;
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly passwordResetTokenService: PasswordResetTokenService,
    private readonly emailService: EmailService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  private signAccessToken(userId: string, role: Role): string {
    return this.jwtService.sign(
      { sub: userId, role },
      {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m',
      },
    );
  }

  async registerProfessional(dto: RegisterProfessionalDto): Promise<AuthTokenPair> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      this.logger.warn(`Tentativa de cadastro com e-mail já existente: ${dto.email}`);
      throw new BadRequestException('Não foi possível concluir o cadastro com os dados informados.');
    }

    const passwordHash = await this.passwordService.hash(dto.password);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          fullName: dto.fullName,
          role: Role.professional,
        },
      });
      await tx.professional.create({
        data: { id: created.id, professionalRegister: dto.professionalRegister },
      });
      return created;
    });

    const { rawToken } = await this.refreshTokenService.issue(user.id);
    return {
      accessToken: this.signAccessToken(user.id, user.role),
      refreshToken: rawToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
        privacyAcceptedAt: user.privacyAcceptedAt,
      },
    };
  }

  async login(dto: LoginDto, meta: RequestMeta = {}): Promise<AuthTokenPair> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    if (!user) {
      await this.passwordService.compareAgainstDummy();
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    const passwordMatches = await this.passwordService.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    const { rawToken } = await this.refreshTokenService.issue(user.id, meta);
    return {
      accessToken: this.signAccessToken(user.id, user.role),
      refreshToken: rawToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
        privacyAcceptedAt: user.privacyAcceptedAt,
      },
    };
  }

  async refresh(rawRefreshToken: string, meta: RequestMeta = {}): Promise<AuthTokenPair> {
    const rotated = await this.refreshTokenService.rotate(rawRefreshToken, meta);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: rotated.userId } });

    return {
      accessToken: this.signAccessToken(user.id, user.role),
      refreshToken: rotated.rawToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
        privacyAcceptedAt: user.privacyAcceptedAt,
      },
    };
  }

  async logout(rawRefreshToken: string): Promise<void> {
    await this.refreshTokenService.revoke(rawRefreshToken);
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const currentMatches = await this.passwordService.compare(dto.currentPassword, user.passwordHash);
    if (!currentMatches) {
      throw new UnauthorizedException('Senha atual incorreta.');
    }

    const newHash = await this.passwordService.hash(dto.newPassword);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash, mustChangePassword: false },
    });
  }

  /**
   * Sempre resolve com sucesso, exista ou não o e-mail — nunca revela isso
   * ao chamador (nem por corpo de resposta, nem por tempo: o caminho de
   * "não existe" faz um bcrypt.compare de mesma duração via
   * compareAgainstDummy, o mesmo truque já usado em login()).
   */
  async requestPasswordReset(email: string, meta: RequestMeta = {}): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      await this.passwordService.compareAgainstDummy();
      return;
    }

    const { rawToken, expiresAt } = await this.passwordResetTokenService.issue(user.id, {
      ipAddress: meta.ipAddress,
    });
    const resetUrlBase = this.config.get<string>('PASSWORD_RESET_URL') ?? 'http://localhost:5173/reset-password';
    const minutesValid = Math.max(1, Math.round((expiresAt.getTime() - Date.now()) / 60_000));

    await this.emailService.send({
      to: user.email,
      subject: 'Redefinição de senha — Bocado de Nutrição',
      text:
        `Recebemos uma solicitação para redefinir sua senha. Use o link abaixo em até ${minutesValid} minutos:\n\n` +
        `${resetUrlBase}?token=${rawToken}\n\n` +
        'Se você não pediu isso, ignore este e-mail — sua senha continua a mesma.',
    });
  }

  /**
   * Ao redefinir, revoga todo refresh token já emitido para o usuário
   * (mobile e web) — nenhuma sessão aberta antes do reset continua válida
   * depois dele.
   */
  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const userId = await this.passwordResetTokenService.consume(rawToken);
    const newHash = await this.passwordService.hash(newPassword);

    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: newHash } });
    await this.refreshTokenService.revokeAllForUser(userId);
  }
}
