/**
 * 真实浏览器验证：两个产物的行为是否真的不同。
 * 静态 grep 只能看到字符串在不在，看不到 transport 到底解析成什么。
 */
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
  '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png' };

function serve(dir, port) {
  const s = createServer((req, res) => {
    let p = join(dir, decodeURIComponent(req.url.split('?')[0]));
    if (!existsSync(p) || !extname(p)) p = join(dir, 'index.html');
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] ?? 'application/octet-stream' });
    res.end(readFileSync(p));
  });
  return new Promise(r => s.listen(port, () => r(s)));
}

const check = async (browser, url, label) => {
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 1200));
  const out = await page.evaluate(() => {
    const t = document.body.innerText || '';
    return {
      badge: t.includes('DEMO BUILD') && t.includes('MOCK VOICE'),
    };
  });
  console.log(`  ${label}: badge=${out.badge} pageErrors=${errs.length}`);
  if (errs.length) console.log('    ' + errs[0].slice(0, 160));
  await page.close();
  return out.badge;
};

const s1 = await serve('dist', 4311);
const s2 = await serve('dist-voice-demo', 4312);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--use-fake-ui-for-media-stream'] });

console.log('--- 真实浏览器行为 ---');
const prodBadge = await check(browser, 'http://localhost:4311/', 'dist            (npm run build)');
const demoBadge = await check(browser, 'http://localhost:4312/', 'dist-voice-demo (build:voice-demo)');

await browser.close(); s1.close(); s2.close();

console.log('');
console.log(`  正式包不显示 DEMO 标识 : ${prodBadge === false ? 'PASS' : 'FAIL'}`);
console.log(`  演示包常驻 DEMO 标识   : ${demoBadge === true ? 'PASS' : 'FAIL'}`);
process.exit(prodBadge === false && demoBadge === true ? 0 : 1);
