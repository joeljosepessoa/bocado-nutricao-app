import { BadRequestException, Injectable } from '@nestjs/common';
import { LegalConsentStatus, Role } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CURRENT_LEGAL_DOCUMENTS, CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from './legal-documents';
import type { AcceptLegalDto } from './dto/accept-legal.dto';

export interface LegalStatus {
  /** true = precisa aceitar as versões atuais antes de usar o app. */
  acceptanceRequired: boolean;
  currentTermsVersion: string;
  currentPrivacyVersion: string;
  /** Último aceite válido das versões atuais (null se ainda não aceitou). */
  accepted: { termsVersion: string; privacyVersion: string; acceptedAt: string } | null;
}

export interface AcceptMeta {
  ipAddress?: string;
  userAgent?: string;
}

/** Quanto tempo a resposta "já aceitou" fica em memória (evita uma consulta por requisição). */
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_TEXT = 200;

@Injectable()
export class LegalService {
  /** Só guarda quem JÁ aceitou as versões atuais — quem não aceitou sempre consulta o banco. */
  private readonly acceptedCache = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  documents() {
    return {
      termsVersion: CURRENT_TERMS_VERSION,
      privacyVersion: CURRENT_PRIVACY_VERSION,
      documents: [CURRENT_LEGAL_DOCUMENTS.terms, CURRENT_LEGAL_DOCUMENTS.privacy],
    };
  }

  private currentAcceptance(userId: string) {
    return this.prisma.legalConsent.findFirst({
      where: {
        userId,
        status: LegalConsentStatus.accepted,
        termsVersion: CURRENT_TERMS_VERSION,
        privacyVersion: CURRENT_PRIVACY_VERSION,
      },
      orderBy: { acceptedAt: 'desc' },
      select: { termsVersion: true, privacyVersion: true, acceptedAt: true },
    });
  }

  async status(userId: string): Promise<LegalStatus> {
    const accepted = await this.currentAcceptance(userId);
    return {
      acceptanceRequired: !accepted,
      currentTermsVersion: CURRENT_TERMS_VERSION,
      currentPrivacyVersion: CURRENT_PRIVACY_VERSION,
      accepted: accepted
        ? { termsVersion: accepted.termsVersion, privacyVersion: accepted.privacyVersion, acceptedAt: accepted.acceptedAt.toISOString() }
        : null,
    };
  }

  /** Só pacientes precisam aceitar (profissional e admin usam o painel). */
  async acceptanceRequired(userId: string, role: Role): Promise<boolean> {
    if (role !== Role.client) return false;
    return !(await this.hasAcceptedCurrent(userId));
  }

  async hasAcceptedCurrent(userId: string): Promise<boolean> {
    const cachedAt = this.acceptedCache.get(userId);
    if (cachedAt && Date.now() - cachedAt < CACHE_TTL_MS) return true;
    const accepted = !!(await this.currentAcceptance(userId));
    if (accepted) this.acceptedCache.set(userId, Date.now());
    else this.acceptedCache.delete(userId);
    return accepted;
  }

  /**
   * Registra o aceite. Exige as duas confirmações e as versões que a pessoa leu iguais às atuais —
   * se o texto mudou enquanto a tela estava aberta, ela precisa ver a versão nova.
   * Aceitar de novo as mesmas versões não cria linha repetida.
   */
  async accept(userId: string, dto: AcceptLegalDto, meta: AcceptMeta = {}): Promise<LegalStatus> {
    if (dto.acceptTerms !== true || dto.acceptPrivacy !== true) {
      throw new BadRequestException('É preciso confirmar os Termos de Uso e a Política de Privacidade.');
    }
    if (dto.termsVersion !== CURRENT_TERMS_VERSION || dto.privacyVersion !== CURRENT_PRIVACY_VERSION) {
      throw new BadRequestException({
        message: 'Os documentos foram atualizados. Leia a versão mais recente para continuar.',
        code: 'LEGAL_VERSION_OUTDATED',
        currentTermsVersion: CURRENT_TERMS_VERSION,
        currentPrivacyVersion: CURRENT_PRIVACY_VERSION,
      });
    }

    const existing = await this.currentAcceptance(userId);
    if (!existing) {
      const now = new Date();
      await this.prisma.$transaction([
        this.prisma.legalConsent.create({
          data: {
            userId,
            termsVersion: CURRENT_TERMS_VERSION,
            privacyVersion: CURRENT_PRIVACY_VERSION,
            status: LegalConsentStatus.accepted,
            acceptedAt: now,
            source: dto.source ?? 'mobile_app',
            appVersion: dto.appVersion?.slice(0, 40) ?? null,
            platform: dto.platform?.slice(0, 40) ?? null,
            ipAddress: meta.ipAddress?.slice(0, 80) ?? null,
            userAgent: meta.userAgent?.slice(0, MAX_TEXT) ?? null,
          },
        }),
        // Compatibilidade: o campo antigo continua preenchido (apps antigos e relatórios usam).
        this.prisma.user.updateMany({ where: { id: userId, privacyAcceptedAt: null }, data: { privacyAcceptedAt: now } }),
      ]);
    }
    this.acceptedCache.set(userId, Date.now());
    return this.status(userId);
  }

  /** Histórico completo (para a exportação de dados do paciente). */
  history(userId: string) {
    return this.prisma.legalConsent.findMany({
      where: { userId },
      orderBy: { acceptedAt: 'asc' },
      select: { termsVersion: true, privacyVersion: true, status: true, acceptedAt: true, source: true, appVersion: true, platform: true },
    });
  }
}
