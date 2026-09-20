import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';

export interface SignedUrl {
  url: string;
  expiresAt: Date;
}

const SIGNED_URL_TTL_SECONDS = 300;

/**
 * Chave de um arquivo novo: UUID v4 (imprevisível) + extensão do tipo de
 * conteúdo, sanitizada (só [a-z0-9]) — nunca vem separador de caminho nem
 * caractere estranho do tipo informado pelo cliente. Usada por todos os adapters.
 */
export function buildStorageKey(contentType: string): string {
  const extension = (contentType.split('/')[1] ?? '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  return `${randomUUID()}.${extension}`;
}

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
    let payload: { storageKey?: string; contentType?: string; purpose?: string };
    try {
      payload = this.jwtService.verify(token, { secret: this.config.get<string>('JWT_ACCESS_SECRET') });
    } catch {
      // Link expirado, adulterado ou lixo: é um pedido inválido do cliente (404), não um
      // erro do servidor — sem isso virava 500 e disparava log/rastreamento de erro.
      throw new NotFoundException('Link inválido ou expirado.');
    }
    if (
      !VALID_PURPOSES.includes(payload.purpose as DownloadPurpose) ||
      typeof payload.storageKey !== 'string' ||
      typeof payload.contentType !== 'string'
    ) {
      throw new NotFoundException('Link inválido ou expirado.');
    }
    return { storageKey: payload.storageKey, contentType: payload.contentType };
  }
}
