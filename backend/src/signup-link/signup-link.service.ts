import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { LegalConsentStatus, Prisma, Role } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../common/prisma/prisma.service';
import { PasswordService } from '../auth/password.service';
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from '../legal/legal-documents';
import { PublicSignupDto } from './dto/public-signup.dto';

/** Formato do código no link (base64url). Qualquer outra coisa nem consulta o banco. */
const CODE_PATTERN = /^[A-Za-z0-9_-]{8,40}$/;

export const SIGNUP_EMAIL_TAKEN_MESSAGE =
  'Não foi possível fazer o cadastro com este e-mail. Se você já tem conta no app, entre com ela; se não, fale com seu nutricionista.';

export const SIGNUP_LINK_GONE_MESSAGE = 'Este link de cadastro não existe mais. Peça um link novo ao seu nutricionista.';

export interface SignupMeta {
  ipAddress?: string;
  userAgent?: string;
}

/** Data de nascimento plausível: não no futuro e depois de 1900. */
export function validBirthDate(value: string, now: Date = new Date()): boolean {
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  return date.getUTCFullYear() >= 1900 && date.getTime() <= now.getTime();
}

/**
 * Link de cadastro do paciente: o profissional liga (gera um código), manda o link e o paciente
 * cria a própria conta — com o e-mail digitado por ele e a senha escolhida por ele. Desligar ou
 * gerar um código novo invalida o link anterior na hora.
 */
@Injectable()
export class SignupLinkService {
  private readonly logger = new Logger(SignupLinkService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
  ) {}

  async get(professionalId: string) {
    const professional = await this.prisma.professional.findUnique({ where: { id: professionalId }, select: { signupCode: true } });
    if (!professional) throw new NotFoundException('Profissional não encontrado.');
    return { code: professional.signupCode };
  }

  /** Liga o link ou troca o código (o link antigo deixa de funcionar). */
  async renew(professionalId: string) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = randomBytes(9).toString('base64url');
      try {
        await this.prisma.professional.update({ where: { id: professionalId }, data: { signupCode: code } });
        return { code };
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') continue;
        throw err;
      }
    }
    throw new Error('Não foi possível gerar um código de cadastro único.');
  }

  async disable(professionalId: string) {
    await this.prisma.professional.update({ where: { id: professionalId }, data: { signupCode: null } });
    return { code: null };
  }

  /** Profissional dono do código — só conta ativa (não suspensa nem excluída). */
  private async professionalByCode(code: string) {
    if (!CODE_PATTERN.test(code)) throw new NotFoundException(SIGNUP_LINK_GONE_MESSAGE);
    const professional = await this.prisma.professional.findUnique({
      where: { signupCode: code },
      select: { id: true, user: { select: { fullName: true, suspendedAt: true, anonymizedAt: true } } },
    });
    if (!professional || professional.user.suspendedAt || professional.user.anonymizedAt) {
      throw new NotFoundException(SIGNUP_LINK_GONE_MESSAGE);
    }
    return professional;
  }

  /** O que a página pública mostra antes do formulário. */
  async info(code: string) {
    const professional = await this.professionalByCode(code);
    return { professionalName: professional.user.fullName };
  }

  async register(code: string, dto: PublicSignupDto, meta: SignupMeta = {}) {
    const professional = await this.professionalByCode(code);

    if (dto.termsVersion !== CURRENT_TERMS_VERSION || dto.privacyVersion !== CURRENT_PRIVACY_VERSION) {
      throw new BadRequestException({
        message: 'Os Termos de Uso ou a Política de Privacidade foram atualizados. Recarregue a página e leia a versão mais recente.',
        code: 'LEGAL_VERSION_OUTDATED',
      });
    }
    const fullName = dto.fullName.trim().replace(/\s+/g, ' ');
    if (fullName.length < 3) throw new BadRequestException('Informe seu nome completo.');
    if (dto.birthDate && !validBirthDate(dto.birthDate)) throw new BadRequestException('Data de nascimento inválida.');

    // Guardado em minúsculas; recusa também a mesma conta escrita com outra caixa.
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } });
    if (existing) {
      this.logger.warn('Cadastro pelo link recusado: e-mail já tem conta.');
      throw new BadRequestException(SIGNUP_EMAIL_TAKEN_MESSAGE);
    }

    const passwordHash = await this.passwordService.hash(dto.password);
    const now = new Date();
    try {
      await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { email, passwordHash, fullName, role: Role.client, mustChangePassword: false, privacyAcceptedAt: now },
        });
        await tx.client.create({
          data: {
            id: user.id,
            professionalId: professional.id,
            // Como no cadastro pelo painel: a data à meia-noite UTC.
            birthDate: dto.birthDate ? new Date(dto.birthDate.slice(0, 10)) : undefined,
            phone: dto.phone?.trim() || null,
            gender: dto.gender ?? null,
            selfRegisteredAt: now,
          },
        });
        // O paciente leu e aceitou na própria página: o app não pede de novo (só a autorização da IA).
        await tx.legalConsent.create({
          data: {
            userId: user.id,
            termsVersion: CURRENT_TERMS_VERSION,
            privacyVersion: CURRENT_PRIVACY_VERSION,
            status: LegalConsentStatus.accepted,
            acceptedAt: now,
            source: 'signup_link',
            ipAddress: meta.ipAddress?.slice(0, 80) ?? null,
            userAgent: meta.userAgent?.slice(0, 200) ?? null,
          },
        });
      });
    } catch (err) {
      // Dois envios ao mesmo tempo com o mesmo e-mail: o índice único segura o segundo.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException(SIGNUP_EMAIL_TAKEN_MESSAGE);
      }
      throw err;
    }
    return { email, professionalName: professional.user.fullName };
  }
}
