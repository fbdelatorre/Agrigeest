const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('../checks.local/node_modules/playwright-core');

// Reproduce an installed /sw.js worker whose old application bundle vanished.
const staleHTML = '<!doctype html><div id="root"></div><script src="/assets/removed-old-version.js"></script>';
const previousWorker = `self.addEventListener('install',()=>self.skipWaiting());
  self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
  self.addEventListener('fetch',event=>{if(event.request.mode==='navigate')
    event.respondWith(Promise.resolve(new Response(${JSON.stringify(staleHTML)},{headers:{'Content-Type':'text/html'}})));});`;
let phase = 'old';
const mime = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.png':'image/png', '.webmanifest':'application/manifest+json' };
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  res.setHeader('Cache-Control', 'no-store');
  if (pathname === '/sw.js' && phase !== 'fixed') {
    res.setHeader('Content-Type', phase === 'old' ? 'application/javascript' : 'text/html');
    return res.end(phase === 'old' ? previousWorker : '<!doctype html><div>SPA fallback</div>');
  }
  if (pathname === '/legacy-install') {
    res.setHeader('Content-Type', 'text/html');
    return res.end('<!doctype html><p>Instalação anterior</p>');
  }
  const relative = pathname.includes('.') ? pathname : '/index.html';
  try {
    const body = await fs.readFile(path.join('dist-audit-test.local', relative));
    res.setHeader('Content-Type', mime[path.extname(relative)] ?? 'application/octet-stream');
    res.end(body);
  } catch { res.writeHead(404).end(); }
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless:true, executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  try {
    const context = await browser.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true });
    const page = await context.newPage();
    const origin = 'http://127.0.0.1:' + server.address().port;
    await page.goto(origin + '/legacy-install');
    await page.evaluate(async () => {
      localStorage.setItem('agrigest-upgrade-pending', 'preserve-me');
      await new Promise((resolve, reject) => {
        const open = indexedDB.open('agrigest-upgrade-test', 1);
        open.onupgradeneeded = () => open.result.createObjectStore('pending');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('pending', 'readwrite');
          tx.objectStore('pending').put({ report:'Lançamento pendente' }, 'report-a');
          tx.oncomplete = () => { db.close(); resolve(); };
        };
      });
      await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, {once:true}));
    });
    phase = 'broken';
    await page.goto(origin + '/login');
    assert.equal(await page.locator('#root').innerHTML(), '');
    await page.evaluate(async () => {
      let refused = false;
      try { await (await navigator.serviceWorker.getRegistration()).update(); }
      catch { refused = true; }
      if (!refused) throw new Error('Expected HTML response to reject the old worker update');
    });
    phase = 'fixed';
    await page.evaluate(async () => {
      const activated = new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, {once:true}));
      await (await navigator.serviceWorker.getRegistration()).update();
      await activated;
    });
    await page.reload();
    await page.getByRole('heading', {name:'Bem-vindo'}).waitFor({timeout:30000});
    assert.equal(await page.evaluate(() => localStorage.getItem('agrigest-upgrade-pending')), 'preserve-me');
    const pending = await page.evaluate(() => new Promise((resolve, reject) => {
      const open = indexedDB.open('agrigest-upgrade-test', 1);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const request = db.transaction('pending').objectStore('pending').get('report-a');
        request.onsuccess = () => { db.close(); resolve(request.result); };
      };
    }));
    assert.equal(pending.report, 'Lançamento pendente');
    console.log('PASS: legacy worker recovers the mobile login and preserves localStorage and pending IndexedDB records');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
