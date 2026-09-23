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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildFooterTemplate(footerDateLabel) {
  const label = escapeHtml(footerDateLabel || '');
  return `
    <div style="width:100%; font-size:8px; color:#8b988e; padding:0 14mm; display:flex; justify-content:space-between; font-family:Helvetica,Arial,sans-serif;">
      <span>Bocado de Nutrição &middot; @bocadodenutricao</span>
      <span>${label}${label ? ' &middot; ' : ''}Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
    </div>`;
}

async function main() {
  const [, , inputPath, outputPath, footerDateLabelBase64] = process.argv;
  if (!inputPath || !outputPath) {
    console.error('Uso: node render-pdf.js <input.html> <output.pdf> [footerDateLabelBase64]');
    process.exit(1);
  }

  const html = fs.readFileSync(inputPath, 'utf-8');
  const footerDateLabel = footerDateLabelBase64 ? Buffer.from(footerDateLabelBase64, 'base64').toString('utf-8') : '';

  const browser = await puppeteer.launch({
    headless: true,
    // --disable-dev-shm-usage evita o erro mais comum de "Puppeteer funciona
    // local mas falha em Docker/Railway": containers limitam /dev/shm a
    // 64MB por padrão, e o Chromium usa /dev/shm por padrão para memória
    // compartilhada entre processos — insuficiente para uma página A4 com
    // gráficos SVG e fotos embutidas. Sem essa flag, o lançamento do
    // Chromium falha silenciosamente com um erro genérico.
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: buildFooterTemplate(footerDateLabel),
      margin: { top: '16mm', right: '14mm', bottom: '22mm', left: '14mm' },
    });
    fs.writeFileSync(outputPath, pdf);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
