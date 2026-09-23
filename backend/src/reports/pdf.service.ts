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
interface ExecFileErrorLike {
  message?: string;
  stderr?: string;
}

@Injectable()
export class PdfService {
  /** `footerDateLabel` vai pro rodapé do PDF (ex.: "Gerado em 23/09/2026") — ver render-pdf.js. */
  async renderHtmlToPdf(html: string, footerDateLabel = ''): Promise<Buffer> {
    const dir = await mkdtemp(join(tmpdir(), 'bocado-report-'));
    const inputPath = join(dir, 'input.html');
    const outputPath = join(dir, 'output.pdf');

    try {
      await writeFile(inputPath, html, 'utf-8');
      const footerArg = Buffer.from(footerDateLabel, 'utf-8').toString('base64');
      await execFileAsync('node', [RENDER_SCRIPT_PATH, inputPath, outputPath, footerArg], {
        timeout: RENDER_TIMEOUT_MS,
      });
      return await readFile(outputPath);
    } catch (error) {
      // `error.stderr` (anexado pelo Node em falhas de execFile) traz a
      // causa real (ex.: "Could not find Chrome", ERR_REQUIRE_ESM) — sem
      // isso, só sobrava uma mensagem genérica "Command failed" que nunca
      // dizia por que o Chromium não subiu.
      const err = error as ExecFileErrorLike;
      const detail = err?.stderr?.trim() || err?.message || String(error);
      throw new InternalServerErrorException(`Falha ao renderizar PDF: ${detail}`);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
