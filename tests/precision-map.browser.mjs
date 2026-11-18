import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
const require = createRequire(new URL('../checks.local/package.json', import.meta.url));
const { chromium } = require('playwright-core');
const out = path.resolve('checks.local/precision-map-fixture');
await build({ configFile: false, plugins: [react()], build: { outDir: out, emptyOutDir: true,
  rollupOptions: { input: path.resolve('tests/precision-map.html') } } });
const { app: { security: { csp } } } = JSON.parse(await readFile('src-tauri/tauri.conf.json', 'utf8'));
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer(async (req, res) => {
  try {
    const file = path.join(out, new URL(req.url, 'http://localhost').pathname);
    res.setHeader('Content-Type', types[path.extname(file)] ?? 'application/octet-stream');
    res.setHeader('Content-Security-Policy', csp);
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  args: ['--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text().slice(0, 250)); });
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/precision-map.html`);
  const map = page.getByLabel('Mapa dos talhões', { exact: true });
  // Inspect actual rendered pixels, rather than accepting the existence of a canvas/layer.
  async function pixels(channel) {
    const screenshot = (await map.screenshot()).toString('base64');
    return page.evaluate(async ({ screenshot, channel }) => {
      const image = new Image(); image.src = 'data:image/png;base64,' + screenshot; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + channel] > 180 && data[i + (channel === 0 ? 2 : 0)] < 100) count++;
      }
      return count;
    }, { screenshot, channel });
  }
  async function expectColor(channel) {
    for (let i = 0; i < 20; i++) {
      if (await pixels(channel) > 10000) return;
      await page.waitForTimeout(100);
    }
    assert.fail(`Image missing (channel ${channel}): ${JSON.stringify(errors)}`);
  }
  await expectColor(0);
  await map.screenshot({ path: 'checks.local/precision-map-red.png' });
  await page.getByRole('button', { name: 'Trocar imagem' }).click();
  await expectColor(2);
  await page.getByRole('button', { name: 'Ocultar imagem' }).click();
  assert.ok(await pixels(2) < 100, 'The blue raster must disappear when hidden');
  await page.getByRole('button', { name: 'Imagem inválida' }).click();
  await page.getByRole('status').filter({ hasText: 'Não foi possível exibir' }).waitFor();
  assert.ok(!errors.some(error => error.includes('Content Security Policy') || error.includes('connect-src')), JSON.stringify(errors));
  console.log('PASS: raster visible, replacement, hiding and invalid-image feedback under native CSP');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
