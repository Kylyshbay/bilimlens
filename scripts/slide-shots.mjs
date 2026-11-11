// Скриншоты фрагментов интерфейса для презентации (2x, ширина 1440). Запуск: node scripts/slide-shots.mjs
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = createRequire(join(process.cwd(), 'x.js'))('playwright'); }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'presentation/img'); mkdirSync(OUT, { recursive: true });
const b = await pw.chromium.launch();
const page = await (await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage();
await page.goto(pathToFileURL(join(ROOT, 'index.html')).href + '#home');
const go = async (h) => { await page.evaluate((x) => { location.hash = x; }, h); await page.waitForTimeout(250); };
const shot = async (sel, name, idx = 0) => { const el = page.locator(sel).nth(idx); await el.scrollIntoViewIfNeeded(); await el.screenshot({ path: join(OUT, name + '.png') }); console.log(name); };
await page.addStyleTag({ content: '.topbar,.filters{position:static!important}' });
await go('home'); await page.screenshot({ path: join(OUT, 'home.png') });
await go('overview'); await page.screenshot({ path: join(OUT, 'overview.png') });
await shot('.card', 'heatmap', 0);
await go('topics'); await shot('.status-counts', 'topic-counts'); await shot('[data-testid=topics-table]', 'topics-table'); await shot('#items', 'items');
await go('textbooks'); await shot('.summary-card', 'tb-summary'); await shot('[data-testid=paradox]', 'paradox'); await shot('.tbcards', 'tb-cards'); await shot('.grid-2 .card', 'tb-dw', 0); await shot('[data-testid=tb-matrix]', 'tb-matrix');
await go('hours'); await shot('.kpis', 'hours-kpis'); await shot('[data-testid=hours-table]', 'hours-table'); await shot('#whatif', 'whatif');
await go('report'); await shot('.report', 'report');
await page.click('[data-testid=lang-kz]'); await go('textbooks'); await shot('[data-testid=paradox]', 'paradox-kz');
await page.click('[data-testid=lang-ru]');
const facts = await page.evaluate(() => {
  const c = window.BilimLens.compute(); const tn = (id) => c.S.topics.find((x) => x.id === id).name.ru;
  return {
    students: c.students.size, schools: new Set(c.rows.map((r) => r.school_id)).size, topics: c.statsArr.length, mastery: c.masteryAll, totalHours: c.S.totalHours,
    stats: c.statsArr.map((s) => ({ id: s.topic_id, name: tn(s.topic_id), status: s.status, mastery: s.mastery, mean: s.mean, sd: s.sd })),
    overall: { raw: c.overall.rawLeader, adj: c.overall.adjLeader, groups: c.overall.groups.map((g) => ({ tb: g.tb, n: g.n, pre: g.preMean, raw: g.rawMean, adj: g.adjMean })), contrasts: c.overall.contrasts.map((x) => ({ a: x.a, b: x.b, diff: x.diff, ci: x.ci, d: x.d, sig: x.significant })) },
    findings: c.findings.findings.map((f) => ({ ...f, name: tn(f.topicId) })), insufficient: c.findings.insufficientTopics.map((x) => ({ ...x, name: tn(x.topicId) })),
    rec: c.rec.map((r) => ({ id: r.id, name: tn(r.id), planned: r.planned, rec: r.recommended, change: r.change, slope: r.slope, shift: r.expectedShift, m0: r.mastery, m1: r.masteryAfter, status: r.status })),
    items: Object.fromEntries(Object.entries(c.itemRes).map(([k, v]) => [k, v.filter((i) => i.flag).map((i) => ({ id: i.item_id, flag: i.flag, p: i.p, r: i.rpb }))])),
  };
});
(await import('node:fs')).writeFileSync(join(ROOT, 'presentation/facts.json'), JSON.stringify(facts, null, 1));
console.log(JSON.stringify({ overall: facts.overall, findings: facts.findings, rec: facts.rec.filter((r) => r.change).map((r) => `${r.name} ${r.change} ${r.m0.toFixed(2)}->${r.m1.toFixed(2)}`) }, null, 1));
await b.close();
