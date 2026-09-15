import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { PasswordService } from './password.service';
import { RefreshTokenService, RequestMeta } from './refresh-token.service';
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
}
