import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Fila em processo (sem Redis/BullMQ — mesmo raciocínio da Fase 18, que
 * preferiu @nestjs/schedule a uma fila externa) que limita quantos PDFs
 * renderizam em paralelo. Cada render sobe um processo `node`/Puppeteer
 * novo (ver PdfService); sem limite, um pico de gerações simultâneas
 * poderia esgotar memória/CPU do servidor.
 */
@Injectable()
export class PdfQueueService {
  private readonly concurrency: number;
  private active = 0;
  private readonly pending: Array<() => void> = [];

  constructor(config: ConfigService) {
    this.concurrency = Number(config.get<string>('PDF_QUEUE_CONCURRENCY') ?? '2');
  }

  get activeCount(): number {
    return this.active;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquireSlot();
    try {
      return await task();
    } finally {
      this.releaseSlot();
    }
  }

  private acquireSlot(): Promise<void> {
    if (this.active < this.concurrency) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.pending.push(() => {
        this.active++;
        resolve();
      });
    });
  }

  private releaseSlot(): void {
    this.active--;
    const next = this.pending.shift();
    if (next) {
      next();
    }
  }
}
