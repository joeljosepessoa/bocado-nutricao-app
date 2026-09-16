import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthWebController } from './auth-web.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { RefreshTokenService } from './refresh-token.service';
import { PasswordResetTokenService } from './password-reset-token.service';
import { EmailService } from './email/email.service';
import { ConsoleEmailService } from './email/console-email.service';
import { CookieAuthService } from './cookie-auth.service';
import { WebCsrfGuard } from './web-csrf.guard';
import { JwtStrategy } from './strategies/jwt.strategy';

const jwtModule = JwtModule.registerAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    secret: config.get<string>('JWT_ACCESS_SECRET'),
    signOptions: { expiresIn: config.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m' },
  }),
});

@Module({
  imports: [PassportModule, jwtModule],
  controllers: [AuthController, AuthWebController],
  providers: [
    AuthService,
    PasswordService,
    RefreshTokenService,
    PasswordResetTokenService,
    ConsoleEmailService,
    { provide: EmailService, useExisting: ConsoleEmailService },
    CookieAuthService,
    WebCsrfGuard,
    JwtStrategy,
  ],
  exports: [PasswordService, RefreshTokenService, jwtModule],
})
export class AuthModule {}
