// E2E smoke-тест BilimLens: все вкладки, RU/KZ, импорт CSV, консоль без ошибок, скриншоты.
// Запуск: node scripts/smoke.mjs [url]   (по умолчанию — file:// на index.html)
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = createRequire(join(process.cwd(), 'x.js'))('playwright'); }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL0 = process.argv[2] || pathToFileURL(join(ROOT, 'index.html')).href;
const OUT = join(ROOT, 'screenshots');
mkdirSync(OUT, { recursive: true });
const ROUTES = ['home', 'overview', 'topics', 'textbooks', 'hours', 'school', 'report', 'data'];

const problems = [];
const check = (cond, msg) => { if (!cond) problems.push(msg); console.log((cond ? '  ✓ ' : '  ✗ ') + msg); };

const browser = await playwright.chromium.launch();
async function session(name, viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: opts.dpr || 1, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL0 + '#home');
  await page.waitForSelector('.hero');
  console.log(`\n[${name}] ${viewport.width}×${viewport.height}`);
  for (const lang of opts.langs || ['ru']) {
    await page.click(`[data-testid=lang-${lang}]`);
    for (const r of ROUTES) {
      await page.evaluate((h) => { location.hash = h; }, r);
      await page.waitForTimeout(150);
      const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check(ov <= 1, `${lang}/${r}: нет горизонтального скролла (${ov}px)`);
      const err = await page.locator('.note-warn code').count();
      check(err === 0, `${lang}/${r}: страница построилась без ошибки`);
      if (!opts.noShots) await page.screenshot({ path: join(OUT, `${name}-${lang}-${r}.png`), fullPage: true });
    }
    const missing = await page.evaluate(() => [...window.__missingKeys]);
    check(missing.length === 0, `${lang}: нет непереведённых ключей ${missing.join(', ')}`);
  }
  return { ctx, page, errors };
}

// --- десктоп 1366: RU + KZ, все экраны, проверки логики ---
const d = await session('desktop', { width: 1366, height: 860 }, { langs: ['ru', 'kz'] });
const p = d.page;
await p.click('[data-testid=lang-ru]');
await p.evaluate(() => { location.hash = 'textbooks'; });
await p.waitForTimeout(150);
check(await p.locator('[data-testid=paradox]').count() === 1, 'учебники: показана плашка «наивно vs с поправкой»');
check(/Без учёта входного уровня лидирует Учебник А, с учётом — Учебник Б/.test(await p.locator('[data-testid=paradox]').innerText()), 'учебники: «лидирует А, с учётом — Б»');
check(/Недостаточно данных для вывода/.test(await p.locator('.findings').innerText()), 'учебники: предупреждение о малой выборке');
await p.click('[data-testid=theme]');
for (const r of ['overview', 'textbooks', 'hours']) { await p.evaluate((h) => { location.hash = h; }, r); await p.waitForTimeout(150); await p.screenshot({ path: join(OUT, `desktop-dark-${r}.png`), clip: { x: 0, y: 0, width: 1366, height: 860 } }); }
await p.click('[data-testid=theme]');
await p.evaluate(() => { location.hash = 'hours'; });
await p.waitForTimeout(150);
const sumText = await p.locator('[data-testid=hours-sum]').innerText();
check(/102\s*→\s*102/.test(sumText), `часы: сумма сохраняется (${sumText})`);
const whyEmpty = await p.$$eval('.hours .why', (els) => els.filter((e) => !e.textContent.trim()).length);
check(whyEmpty === 0, 'часы: у каждой строки есть обоснование');
await p.locator('[data-wi]').first().fill('4');
await p.waitForTimeout(100);
check(/расхождение/.test(await p.locator('#wi-summary').innerText()), 'что-если: при изменении суммы показано расхождение');
await p.screenshot({ path: join(OUT, 'desktop-ru-hours-whatif.png'), fullPage: false, clip: { x: 0, y: 0, width: 1366, height: 860 } });

// Импорт: корректный файл, затем файл с ошибками
await p.evaluate(() => { location.hash = 'data'; });
await p.waitForTimeout(150);
await p.setInputFiles('#file-results', join(ROOT, 'sample-data/sample_4_schools.csv'));
await p.waitForSelector('.note-ok');
check(/Загружено/.test(await p.locator('.note-ok').first().innerText()), 'импорт: корректный CSV загружен');
await p.evaluate(() => { location.hash = 'overview'; });
await p.waitForTimeout(150);
check(await p.locator('[data-testid=heatmap] tbody tr').count() === 4, 'импорт: обзор пересчитан (4 школы)');
await p.screenshot({ path: join(OUT, 'desktop-ru-overview-uploaded.png'), fullPage: true });
await p.evaluate(() => { location.hash = 'data'; });
await p.waitForTimeout(150);
await p.setInputFiles('#file-results', join(ROOT, 'sample-data/sample_with_errors.csv'));
await p.waitForSelector('[data-testid=import-errors]');
const errRows = await p.locator('[data-testid=import-errors] tbody tr').count();
check(errRows >= 5, `импорт с ошибками: показано ${errRows} ошибок по строкам, сайт не упал`);
await p.screenshot({ path: join(OUT, 'desktop-ru-data-errors.png'), fullPage: true });
await p.click('[data-action=apply-import]');
await p.waitForTimeout(150);
check(/Загружено 55/.test(await p.locator('.note-ok').first().innerText()), 'импорт: загружены только корректные строки');
const dl = p.waitForEvent('download', { timeout: 5000 }).catch(() => null);
await p.click('[data-action=download-template]');
const dlf = await dl;
check(!!dlf && /bilimlens_template\.csv/.test(dlf.suggestedFilename()), 'скачивание шаблона CSV работает');
await p.click('[data-action=reset-demo]');
await p.waitForTimeout(150);
check(/Демо-данные/.test(await p.locator('#demo-banner').innerText()), 'сброс к демо-данным');
// Отчёт в PDF (печатный CSS)
await p.evaluate(() => { location.hash = 'report'; });
await p.waitForTimeout(200);
await p.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
await p.click('[data-action=print]');
check(await p.evaluate(() => window.__printed) === 1, 'кнопка «Скачать PDF» вызывает печать');
await p.emulateMedia({ media: 'print' });
await p.pdf({ path: join(OUT, 'report-print.pdf'), format: 'A4', printBackground: true });
await p.emulateMedia({ media: 'screen' });
check(d.errors.length === 0, `десктоп: 0 ошибок в консоли ${d.errors.join(' | ')}`);
await d.ctx.close();

// --- проектор 1920 ---
const pr = await session('projector', { width: 1920, height: 1080 }, { langs: ['ru'] });
check(pr.errors.length === 0, 'проектор: 0 ошибок в консоли');
await pr.ctx.close();

// --- телефон 390 ---
const m = await session('phone', { width: 390, height: 844 }, { langs: ['ru', 'kz'], dpr: 2 });
check(m.errors.length === 0, `телефон: 0 ошибок в консоли ${m.errors.join(' | ')}`);
await m.ctx.close();

await browser.close();
console.log(problems.length ? `\nПРОБЛЕМ: ${problems.length}` : '\nВСЁ ОК');
process.exit(problems.length ? 1 : 0);
