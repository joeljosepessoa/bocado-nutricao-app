#!/usr/bin/env node
/**
 * Processo Node separado que faz a renderização HTML → PDF via Puppeteer.
 *
 * Por que um processo à parte em vez de `import puppeteer` direto em
 * PdfService: a partir da v22, o pacote `puppeteer` (e `puppeteer-core`)
 * só publica build ESM — o carregador de módulos do Jest/ts-jest não
 * consegue resolvê-lo dentro do processo de teste, e todo teste e2e que
 * carregasse AppModule quebraria só por este módulo existir no grafo de
 * dependências. Um `node` separado usa a resolução nativa do Node (que já
 * interopera com pacotes ESM-only), sem depender de nada do Jest — e como
 * bônus, isola o Chromium (processo pesado) do processo da API.
 */
const fs = require('fs');
const puppeteer = require('puppeteer');

async function main() {
  const [, , inputPath, outputPath] = process.argv;
  if (!inputPath || !outputPath) {
    console.error('Uso: node render-pdf.js <input.html> <output.pdf>');
    process.exit(1);
  }

  const html = fs.readFileSync(inputPath, 'utf-8');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    fs.writeFileSync(outputPath, pdf);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
