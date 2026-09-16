import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

const execFileAsync = promisify(execFile);

// `__dirname` não é confiável aqui: o watch mode do Nest (webpack) e o
// build de produção (tsc) colocam o arquivo compilado em profundidades
// diferentes dentro de dist/, e um bundler pode até reescrever __dirname
// para apontar para o próprio bundle. process.cwd() é estável nos dois
// casos — os scripts npm (`start`, `start:dev`) sempre rodam a partir de
// backend/, então scripts/render-pdf.js está sempre um nível abaixo daqui.
const RENDER_SCRIPT_PATH = join(process.cwd(), 'scripts', 'render-pdf.js');
const RENDER_TIMEOUT_MS = 60_000;

/**
 * Wrapper fino sobre Puppeteer — roda num processo `node` separado (ver
 * scripts/render-pdf.js para o motivo) em vez de importar `puppeteer`
 * diretamente aqui. Geração é pouco frequente e sob demanda; um processo
 * novo por chamada é simplicidade > a economia de um pool nesta escala.
 */
@Injectable()
export class PdfService {
  async renderHtmlToPdf(html: string): Promise<Buffer> {
    const dir = await mkdtemp(join(tmpdir(), 'bocado-report-'));
    const inputPath = join(dir, 'input.html');
    const outputPath = join(dir, 'output.pdf');

    try {
      await writeFile(inputPath, html, 'utf-8');
      await execFileAsync('node', [RENDER_SCRIPT_PATH, inputPath, outputPath], {
        timeout: RENDER_TIMEOUT_MS,
      });
      return await readFile(outputPath);
    } catch (error) {
      throw new InternalServerErrorException(
        `Falha ao renderizar PDF: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
