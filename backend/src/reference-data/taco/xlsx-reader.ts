import { readFileSync } from 'fs';
import { inflateRawSync } from 'zlib';

/**
 * Leitor mínimo e SOMENTE LEITURA de .xlsx (sem dependência nova): abre o
 * arquivo zip em memória, lê as strings compartilhadas e as células de uma
 * aba. Suficiente para a planilha da TACO — não avalia fórmulas (usa o valor
 * gravado em cache) e não interpreta formatação.
 */

export type CellValue = string | number | null;

export interface SheetRow {
  /** Número da linha na planilha (1 = primeira). */
  row: number;
  cells: CellValue[];
}

export interface Workbook {
  sheetNames: string[];
  sheet(index: number): SheetRow[];
}

function unzip(buffer: Buffer): Map<string, Buffer> {
  // Fim do diretório central: assinatura 0x06054b50 nos últimos bytes.
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65_557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Arquivo .xlsx inválido (zip sem diretório central).');
  const entries = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const files = new Map<string, Buffer>();
  for (let n = 0; n < entries; n++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('Arquivo .xlsx inválido (entrada do zip corrompida).');
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeader = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    const localNameLength = buffer.readUInt16LE(localHeader + 26);
    const localExtraLength = buffer.readUInt16LE(localHeader + 28);
    const start = localHeader + 30 + localNameLength + localExtraLength;
    const data = buffer.subarray(start, start + compressedSize);
    if (method === 0) files.set(name, Buffer.from(data));
    else if (method === 8) files.set(name, inflateRawSync(data));
    else throw new Error(`Compressão ${method} não suportada em ${name}.`);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, '&');
}

const textOf = (xml: string) => decodeXml([...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''));

function columnIndex(letters: string): number {
  return [...letters].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
}

export function readWorkbook(path: string): Workbook {
  const files = unzip(readFileSync(path));
  const read = (name: string) => {
    const file = files.get(name);
    if (!file) throw new Error(`Parte ${name} ausente no .xlsx.`);
    return file.toString('utf8');
  };

  const shared = files.has('xl/sharedStrings.xml') ? [...read('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1])) : [];
  const workbook = read('xl/workbook.xml');
  const rels = read('xl/_rels/workbook.xml.rels');
  const targets = new Map([...rels.matchAll(/<Relationship [^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]));
  const sheets = [...workbook.matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)].map((m) => ({
    name: decodeXml(m[1]),
    path: `xl/${targets.get(m[2])!.replace(/^\/?xl\//, '')}`,
  }));

  return {
    sheetNames: sheets.map((s) => s.name),
    sheet(index: number): SheetRow[] {
      const xml = read(sheets[index].path);
      const rows: SheetRow[] = [];
      for (const row of xml.matchAll(/<row[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
        const cells: CellValue[] = [];
        for (const c of row[2].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
          const type = (c[2].match(/\bt="(\w+)"/) || [])[1];
          const inner = c[3] ?? '';
          const raw = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
          let value: CellValue = null;
          if (type === 's' && raw !== undefined) value = shared[Number(raw)];
          else if (type === 'inlineStr') value = textOf(inner);
          else if (type === 'str' && raw !== undefined) value = decodeXml(raw);
          else if (raw !== undefined) value = Number(raw);
          cells[columnIndex(c[1])] = value;
        }
        rows.push({ row: Number(row[1]), cells: Array.from(cells, (v) => (v === undefined ? null : v)) });
      }
      return rows;
    },
  };
}
