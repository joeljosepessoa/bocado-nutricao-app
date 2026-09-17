import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

export interface SignedUrl {
  url: string;
  expiresAt: Date;
}

const SIGNED_URL_TTL_SECONDS = 300;

export type DownloadPurpose = 'photo-download' | 'report-download';
const VALID_PURPOSES: DownloadPurpose[] = ['photo-download', 'report-download'];

/**
 * Abstração de armazenamento de arquivo — mesmo padrão de EmailService
 * (Fase 13) e AiProvider (Fase 12): o domínio (avaliações, relatórios)
 * depende só desta interface, nunca de um backend concreto. `getSignedUrl`
 * e `verifySignedToken` ficam aqui (não em cada adapter) porque o esquema
 * de autorização — posse de um JWT de curta duração assinado por nós — é
 * o mesmo independente de o arquivo estar em disco local ou num bucket;
 * é o que permite `/files/:token` continuar público (mas só útil para
 * quem tem o token) nos dois casos, sem expor o bucket diretamente.
 */
@Injectable()
export abstract class StorageService {
  constructor(
    protected readonly jwtService: JwtService,
    protected readonly config: ConfigService,
  ) {}

  abstract save(buffer: Buffer, contentType: string): Promise<{ storageKey: string; sizeBytes: number }>;
  abstract read(storageKey: string): Promise<Buffer>;
  abstract delete(storageKey: string): Promise<void>;

  getSignedUrl(storageKey: string, contentType: string, purpose: DownloadPurpose = 'photo-download'): SignedUrl {
    const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000);
    const token = this.jwtService.sign(
      { storageKey, contentType, purpose },
      {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: SIGNED_URL_TTL_SECONDS,
      },
    );
    return { url: `/files/${token}`, expiresAt };
  }

  verifySignedToken(token: string): { storageKey: string; contentType: string } {
    const payload = this.jwtService.verify<{ storageKey: string; contentType: string; purpose: string }>(
      token,
      { secret: this.config.get<string>('JWT_ACCESS_SECRET') },
    );
    if (!VALID_PURPOSES.includes(payload.purpose as DownloadPurpose)) {
      throw new NotFoundException('Token inválido.');
    }
    return payload;
  }
}
