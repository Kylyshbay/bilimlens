/*!
 * BilimLens — analytics.js
 * Чистые функции аналитики: статистика по темам, классификация, анализ заданий,
 * сравнение учебников с поправкой на входной уровень (ANCOVA-упрощение),
 * оценка эффекта часов, перераспределение часов, парсинг и валидация CSV.
 * UMD: window.Analytics в браузере, module.exports в Node (тесты: node --test).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Analytics = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- базовая статистика ----------
  const sum = (a) => a.reduce((s, x) => s + x, 0);
  const mean = (a) => (a.length ? sum(a) / a.length : NaN);
  function variance(a) {
    if (a.length < 2) return NaN;
    const m = mean(a);
    return sum(a.map((x) => (x - m) ** 2)) / (a.length - 1);
  }
  const sd = (a) => Math.sqrt(variance(a));
  function quantile(a, q) {
    if (!a.length) return NaN;
    const s = [...a].sort((x, y) => x - y);
    const pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return s[lo] + (s[hi] - s[lo]) * (pos - lo);
  }
  const median = (a) => quantile(a, 0.5);
  const Z95 = 1.959964;
  function meanCI(a) {
    const m = mean(a), se = sd(a) / Math.sqrt(a.length);
    return [m - Z95 * se, m + Z95 * se];
  }
  function groupBy(arr, keyFn) {
    const m = new Map();
    for (const x of arr) { const k = keyFn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
    return m;
  }
  function pearson(x, y) {
    const mx = mean(x), my = mean(y);
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < x.length; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
    return sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN;
  }

  // ---------- усвоение по темам ----------
  /** Доля значений >= порога (0..1). */
  function masteryRate(scores, threshold = 60) {
    if (!scores.length) return NaN;
    return scores.filter((s) => s >= threshold).length / scores.length;
  }

  /**
   * Статистика по темам. rows: {topic_id, pre, post}. topicOrder: массив id тем (порядок вывода).
   */
  function topicStats(rows, topicOrder, threshold = 60) {
    const by = groupBy(rows, (r) => r.topic_id);
    const ids = topicOrder || [...by.keys()];
    return ids.filter((id) => by.has(id)).map((id) => {
      const rs = by.get(id);
      const post = rs.map((r) => r.post), pre = rs.map((r) => r.pre);
      return {
        topic_id: id,
        n: rs.length,
        mean: mean(post),
        median: median(post),
        sd: sd(post),
        q1: quantile(post, 0.25),
        q3: quantile(post, 0.75),
        mastery: masteryRate(post, threshold),
        preMean: mean(pre),
        gain: mean(post) - mean(pre),
      };
    });
  }

  const DEFAULT_RULES = { critical: 0.5, risk: 0.65, mastered: 0.85 };
  /**
   * Классификация тем. Правило (прозрачное):
   *  критическая — усвоение < rules.critical И средний балл ниже медианы средних по темам;
   *  зона риска — усвоение < rules.risk (или < critical, но средний выше медианы);
   *  освоена — усвоение ≥ rules.mastered; иначе — норма.
   */
  function classifyTopics(stats, rules = DEFAULT_RULES) {
    const med = median(stats.map((s) => s.mean));
    return stats.map((s) => {
      let status;
      if (s.mastery < rules.critical && s.mean < med) status = 'critical';
      else if (s.mastery < rules.risk) status = 'risk';
      else if (s.mastery >= rules.mastered) status = 'mastered';
      else status = 'norm';
      return { ...s, status, medianOfMeans: med };
    });
  }

  // ---------- анализ заданий (item-level) ----------
  /**
   * items: {student_id, topic_id, item_id, correct}. Возвращает по каждой теме список заданий:
   * p — индекс трудности (доля верных), rpb — точечно-бисериальная корреляция задания
   * с суммой остальных заданий (скорректированная), flag — проблема.
   */
  function itemAnalysis(items) {
    const out = {};
    for (const [topic, rs] of groupBy(items, (r) => r.topic_id)) {
      const byStudent = groupBy(rs, (r) => r.student_id);
      const totals = new Map();
      for (const [sid, list] of byStudent) totals.set(sid, sum(list.map((r) => +r.correct)));
      const list = [];
      for (const [item, irs] of groupBy(rs, (r) => r.item_id)) {
        const x = irs.map((r) => +r.correct);
        const y = irs.map((r) => totals.get(r.student_id) - +r.correct);
        const p = mean(x);
        const rpb = pearson(x, y);
        let flag = null;
        if (rpb < 0) flag = 'negative';
        else if (p > 0.95) flag = 'too_easy';
        else if (p < 0.15) flag = 'too_hard';
        else if (!(rpb >= 0.2)) flag = 'low_disc';
        list.push({ item_id: item, n: x.length, p, rpb, flag });
      }
      list.sort((a, b) => (a.item_id < b.item_id ? -1 : 1));
      out[topic] = list;
    }
    return out;
  }

  // ---------- линейная регрессия (МНК) ----------
  function invert(M) {
    const n = M.length, A = M.map((r, i) => [...r, ...r.map((_, j) => (i === j ? 1 : 0))]);
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      if (Math.abs(A[p][c]) < 1e-12) return null;
      [A[c], A[p]] = [A[p], A[c]];
      const d = A[c][c];
      for (let j = 0; j < 2 * n; j++) A[c][j] /= d;
      for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c]; if (f) for (let j = 0; j < 2 * n; j++) A[r][j] -= f * A[c][j]; }
    }
    return A.map((r) => r.slice(n));
  }
  /** OLS: X — массив строк (с единицей для свободного члена), y — вектор. */
  function ols(X, y) {
    const n = X.length, k = X[0].length;
    const XtX = Array.from({ length: k }, () => new Array(k).fill(0));
    const Xty = new Array(k).fill(0);
    for (let i = 0; i < n; i++) {
      const xi = X[i];
      for (let a = 0; a < k; a++) { Xty[a] += xi[a] * y[i]; for (let b = 0; b < k; b++) XtX[a][b] += xi[a] * xi[b]; }
    }
    const inv = invert(XtX);
    if (!inv) return null;
    const beta = inv.map((row) => sum(row.map((v, j) => v * Xty[j])));
    let rss = 0;
    for (let i = 0; i < n; i++) { const e = y[i] - sum(X[i].map((v, j) => v * beta[j])); rss += e * e; }
    const sigma2 = rss / Math.max(1, n - k);
    const cov = inv.map((row) => row.map((v) => v * sigma2));
    return { beta, cov, sigma2, n, k };
  }
  const quad = (c, V) => sum(c.map((ci, i) => ci * sum(c.map((cj, j) => cj * V[i][j]))));

  // ---------- сравнение учебников ----------
  /**
   * Сравнение учебников. rows: {student_id, textbook, pre, post, topic_id}.
   * Если topicId не задан — каждый ученик усредняется по всем темам (общий уровень).
   * Возвращает сырые и скорректированные (post ~ pre + учебник) средние с 95% CI,
   * контрасты лидера с остальными, Cohen's d и флаги «недостаточно данных».
   */
  function compareTextbooks(rows, opts = {}) {
    const { topicId = null, minN = 30, maxCIWidth = 20 } = opts;
    let units;
    if (topicId) units = rows.filter((r) => r.topic_id === topicId).map((r) => ({ tb: r.textbook, pre: r.pre, post: r.post }));
    else units = [...groupBy(rows, (r) => r.student_id).values()].map((rs) => ({ tb: rs[0].textbook, pre: mean(rs.map((r) => r.pre)), post: mean(rs.map((r) => r.post)) }));
    const present = [...new Set(units.map((u) => u.tb))].sort();
    const tbs = (opts.textbooks || present).filter((t) => present.includes(t));
    const empty = { topicId, n: units.length, groups: [], contrasts: [], rawLeader: null, adjLeader: null, paradox: false, valid: false };
    if (tbs.length < 2 || units.length < tbs.length + 3) return { ...empty, groups: tbs.map((tb) => { const g = units.filter((u) => u.tb === tb); return { tb, n: g.length, rawMean: mean(g.map((u) => u.post)), insufficient: true }; }) };
    const ref = tbs[0];
    const others = tbs.slice(1);
    const X = units.map((u) => [1, u.pre, ...others.map((t) => (u.tb === t ? 1 : 0))]);
    const fit = ols(X, units.map((u) => u.post));
    if (!fit) return empty;
    const preAll = mean(units.map((u) => u.pre));
    const cvec = (tb) => [1, preAll, ...others.map((t) => (t === tb ? 1 : 0))];
    const dummy = (tb) => [0, 0, ...others.map((t) => (t === tb ? 1 : 0))];
    // объединённое внутригрупповое SD итоговых баллов — знаменатель Cohen's d
    let ssw = 0, dfw = 0;
    const groups = tbs.map((tb) => {
      const g = units.filter((u) => u.tb === tb);
      const post = g.map((u) => u.post);
      if (g.length > 1) { ssw += variance(post) * (g.length - 1); dfw += g.length - 1; }
      const c = cvec(tb);
      const adj = sum(c.map((v, i) => v * fit.beta[i]));
      const se = Math.sqrt(quad(c, fit.cov));
      return {
        tb, n: g.length,
        rawMean: mean(post), rawCI: g.length > 1 ? meanCI(post) : [NaN, NaN],
        preMean: mean(g.map((u) => u.pre)),
        adjMean: adj, adjCI: [adj - Z95 * se, adj + Z95 * se],
        insufficient: g.length < minN,
      };
    });
    const pooledSD = Math.sqrt(ssw / Math.max(1, dfw));
    const valid = groups.filter((g) => !g.insufficient);
    const best = (key) => (valid.length ? valid.reduce((a, b) => (b[key] > a[key] ? b : a)).tb : null);
    const rawLeader = best('rawMean'), adjLeader = best('adjMean');
    const contrasts = [];
    for (let i = 0; i < tbs.length; i++) for (let j = i + 1; j < tbs.length; j++) {
      const a = tbs[i], b = tbs[j];
      const c = dummy(a).map((v, k) => v - dummy(b)[k]);
      const diff = sum(c.map((v, k) => v * fit.beta[k]));
      const se = Math.sqrt(quad(c, fit.cov));
      const ci = [diff - Z95 * se, diff + Z95 * se];
      const ga = groups[i], gb = groups[j];
      const insufficient = ga.insufficient || gb.insufficient || ci[1] - ci[0] > maxCIWidth;
      const d = diff / pooledSD;
      contrasts.push({ a, b, diff, ci, d, se, insufficient, significant: !insufficient && (ci[0] > 0 || ci[1] < 0) && Math.abs(d) >= 0.2 });
    }
    return { topicId, n: units.length, preAll, slopePre: fit.beta[1], groups, contrasts, pooledSD, rawLeader, adjLeader, paradox: !!(rawLeader && adjLeader && rawLeader !== adjLeader), valid: valid.length >= 2 };
  }

  /** Контраст «a − b» из результата compareTextbooks (с учётом порядка). */
  function contrast(res, a, b) {
    const c = res.contrasts.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
    if (!c) return null;
    if (c.a === a) return c;
    return { ...c, a, b, diff: -c.diff, ci: [-c.ci[1], -c.ci[0]], d: -c.d };
  }

  /**
   * Сводка по темам: какой учебник практически значимо лучше/хуже всех остальных
   * (95% CI разницы не включает 0 и |d| ≥ 0.2).
   */
  function textbookFindings(rows, topicIds, opts = {}) {
    const perTopic = topicIds.map((id) => ({ topicId: id, res: compareTextbooks(rows, { ...opts, topicId: id }) }));
    const findings = [];
    const insufficientTopics = [];
    for (const { topicId, res } of perTopic) {
      if (res.groups.some((g) => g.insufficient)) insufficientTopics.push({ topicId, groups: res.groups.filter((g) => g.insufficient).map((g) => ({ tb: g.tb, n: g.n })) });
      const tbs = res.groups.filter((g) => !g.insufficient).map((g) => g.tb);
      for (const t of tbs) {
        const cs = tbs.filter((o) => o !== t).map((o) => contrast(res, t, o));
        if (!cs.length) continue;
        if (cs.every((c) => c.significant && c.diff > 0)) findings.push({ tb: t, dir: 'better', topicId, diff: Math.min(...cs.map((c) => c.diff)), d: Math.min(...cs.map((c) => c.d)) });
        if (cs.every((c) => c.significant && c.diff < 0)) findings.push({ tb: t, dir: 'worse', topicId, diff: Math.max(...cs.map((c) => c.diff)), d: Math.max(...cs.map((c) => c.d)) });
      }
    }
    const flagged = new Set(findings.map((f) => f.topicId));
    return { perTopic, findings, insufficientTopics, neutralTopics: topicIds.filter((id) => !flagged.has(id)) };
  }

  // ---------- эффект часов ----------
  /**
   * Наклон «баллы за 1 доп. час» по теме: post ~ pre + учебник + (факт − план).
   * Оценивается на школах, где фактические часы отличались от плана.
   */
  function hoursEffect(rows, topicId) {
    const rs = rows.filter((r) => r.topic_id === topicId);
    const deltas = rs.map((r) => r.actual_hours - r.planned_hours);
    const schoolsDev = new Set(rs.filter((r) => r.actual_hours !== r.planned_hours).map((r) => r.school_id));
    const base = { topicId, n: rs.length, nSchoolsDeviating: schoolsDev.size, minDelta: deltas.length ? Math.min(...deltas) : 0, maxDelta: deltas.length ? Math.max(...deltas) : 0 };
    if (schoolsDev.size < 2 || rs.length < 30) return { ...base, slope: null, se: null };
    const tbs = [...new Set(rs.map((r) => r.textbook))].sort().slice(1);
    const X = rs.map((r) => [1, r.pre, ...tbs.map((t) => (r.textbook === t ? 1 : 0)), r.actual_hours - r.planned_hours]);
    const fit = ols(X, rs.map((r) => r.post));
    if (!fit) return { ...base, slope: null, se: null };
    const k = fit.beta.length - 1;
    return { ...base, slope: fit.beta[k], se: Math.sqrt(fit.cov[k][k]) };
  }

  /** Насыщение: k-й добавленный час (k с 0) даёт долю эффекта; к пределу наблюдаемого диапазона — 50%, дальше не ниже 25%. */
  function saturation(k, cap) { return Math.max(0.25, 1 - 0.5 * k / Math.max(1, cap || 1)); }
  /** Ожидаемый сдвиг среднего балла при изменении часов на delta (с насыщением для добавления). */
  function hoursShift(slope, delta, cap) {
    const s = Math.max(0, slope || 0);
    if (delta <= 0) return s * delta;
    let g = 0;
    for (let k = 0; k < delta; k++) g += s * saturation(k, cap);
    return g;
  }

  /** Ожидаемый эффект изменения часов: сдвиг баллов на slope×Δ и новая доля усвоения. */
  function expectedEffect(postScores, deltaHours, slope, threshold = 60) {
    const s = Math.max(0, slope || 0);
    const shift = s * deltaHours;
    return {
      shift,
      masteryBefore: masteryRate(postScores, threshold),
      masteryAfter: masteryRate(postScores.map((x) => Math.min(100, x + shift)), threshold),
    };
  }

  /**
   * Перераспределение часов при фиксированном общем объёме.
   * topics: [{id, planned, status, slope, maxAdd}]. Доноры — освоенные и «норма»
   * (не ниже minShare плана), получатели — критические и зона риска (не больше maxAdd,
   * т.е. в пределах наблюдавшихся в данных отклонений; maxCut ограничивает сокращение так же). Жадно по 1 часу, пока выигрыш
   * получателя больше потери донора на minGain баллов.
   */
  function recommendHours(topics, opts = {}) {
    const { minShare = 0.7, minGain = 0.5, maxStep = 200 } = opts;
    const st = topics.map((t) => ({ ...t, rec: t.planned, known: t.slope !== null && t.slope !== undefined && Number.isFinite(t.slope), slopeUsed: Math.max(0, t.slope || 0), minH: Math.max(Math.ceil(t.planned * minShare - 1e-9), Number.isFinite(t.maxCut) ? t.planned - Math.max(0, Math.floor(t.maxCut)) : 0), maxH: t.planned + Math.max(0, Math.floor(t.maxAdd || 0)) }));
    // Насыщение: каждый следующий добавленный час даёт меньше — к пределу наблюдаемого диапазона эффект падает до 50%.
    const marginalGain = (t) => t.slopeUsed * saturation(t.rec - t.planned, t.maxH - t.planned);
    const donorOk = (t) => t.known && (t.status === 'mastered' || t.status === 'norm') && t.rec - 1 >= t.minH;
    const recipOk = (t) => t.known && (t.status === 'critical' || t.status === 'risk') && t.rec + 1 <= t.maxH && t.slopeUsed > 0;
    const prio = { mastered: 0, norm: 1 };
    for (let step = 0; step < maxStep; step++) {
      const recips = st.filter(recipOk);
      const donors = st.filter(donorOk).sort((a, b) => a.slopeUsed - b.slopeUsed || prio[a.status] - prio[b.status] || (b.rec - b.minH) - (a.rec - a.minH));
      if (!recips.length || !donors.length) break;
      const r = recips.reduce((best, t) => (marginalGain(t) > marginalGain(best) ? t : best), recips[0]);
      const d = donors[0];
      if (marginalGain(r) - d.slopeUsed < minGain) break;
      r.rec += 1; d.rec -= 1;
    }
    return st.map((t) => {
      const change = t.rec - t.planned;
      let code;
      if (change > 0) code = t.rec >= t.maxH ? 'add_cap' : 'add';
      else if (change < 0) code = t.rec <= t.minH ? 'take_min' : 'take';
      else if (!t.known) code = 'keep_nodata';
      else if (t.status === 'critical' || t.status === 'risk') code = t.slopeUsed > 0 ? 'keep_nodonor' : 'keep_noeffect';
      else if (t.rec <= t.minH) code = 'keep_min';
      else code = 'keep';
      const expectedShift = hoursShift(t.slopeUsed, change, t.maxH - t.planned);
      return { id: t.id, planned: t.planned, recommended: t.rec, change, status: t.status, slope: t.known ? t.slopeUsed : null, expectedShift, minH: t.minH, maxH: t.maxH, code };
    });
  }

  // ---------- CSV ----------
  function detectDelimiter(line) {
    const c = { ',': 0, ';': 0, '\t': 0 };
    let q = false;
    for (const ch of line) { if (ch === '"') q = !q; else if (!q && ch in c) c[ch]++; }
    return Object.entries(c).sort((a, b) => b[1] - a[1])[0][1] ? Object.entries(c).sort((a, b) => b[1] - a[1])[0][0] : ',';
  }
  /** RFC4180-совместимый парсер: кавычки, переводы строк в кавычках, BOM, , ; \t. */
  function parseCSV(text) {
    text = String(text).replace(/^﻿/, '');
    const firstLine = text.split(/\r?\n/, 1)[0] || '';
    const delim = detectDelimiter(firstLine);
    const out = [];
    let row = [], field = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
        else field += ch;
      } else if (ch === '"') q = true;
      else if (ch === delim) { row.push(field); field = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        out.push(row); row = [];
      } else field += ch;
    }
    if (field !== '' || row.length) { row.push(field); out.push(row); }
    const nonEmpty = out.filter((r) => r.some((v) => v.trim() !== ''));
    return { delimiter: delim, headers: (nonEmpty[0] || []).map((h) => h.trim()), records: nonEmpty.slice(1) };
  }

  const COLUMN_ALIASES = {
    subject: ['subject', 'предмет', 'пән'],
    school_id: ['school_id', 'id_школы', 'код_школы', 'мектеп_id'],
    school_name: ['school_name', 'школа', 'название_школы', 'мектеп'],
    district: ['district', 'район', 'аудан'],
    class_id: ['class_id', 'класс', 'сынып'],
    textbook: ['textbook', 'учебник', 'оқулық'],
    student_id: ['student_id', 'ученик', 'id_ученика', 'оқушы'],
    topic_id: ['topic_id', 'id_темы', 'код_темы', 'тақырып_id'],
    topic_name: ['topic_name', 'тема', 'тақырып'],
    planned_hours: ['planned_hours', 'часы_план', 'план_часы', 'жоспар_сағат'],
    actual_hours: ['actual_hours', 'часы_факт', 'факт_часы', 'нақты_сағат'],
    pre_score: ['pre_score', 'входной_балл', 'балл_до', 'бастапқы_балл'],
    post_score: ['post_score', 'итоговый_балл', 'балл_после', 'қорытынды_балл'],
  };
  const REQUIRED = ['school_id', 'textbook', 'student_id', 'topic_id', 'planned_hours', 'actual_hours', 'pre_score', 'post_score'];
  const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, '_');

  /** Приводит название учебника к коду A/B/C; null — неизвестный учебник. */
  function normalizeTextbook(v) {
    let s = String(v || '').trim().toLowerCase().replace(/[«»"']/g, '');
    s = s.replace(/учебник|оқулығы|оқулық|textbook|book/g, '').replace(/[\s._-]+/g, '');
    const map = { a: 'A', 'а': 'A', b: 'B', 'б': 'B', c: 'C', 'в': 'C', v: 'C' };
    return map[s] || null;
  }

  function mapHeaders(headers) {
    const idx = {};
    const h = headers.map(norm);
    for (const [col, aliases] of Object.entries(COLUMN_ALIASES)) {
      const i = h.findIndex((x) => aliases.includes(x));
      if (i >= 0) idx[col] = i;
    }
    return idx;
  }

  /**
   * Валидация результатов. Возвращает {rows, errors, missingColumns, total}.
   * Ошибки: {line, field, code, value}; line — номер строки файла (заголовок = 1).
   */
  function validateResults(parsed, opts = {}) {
    const { maxErrors = 500 } = opts;
    const idx = mapHeaders(parsed.headers);
    const missingColumns = REQUIRED.filter((c) => !(c in idx));
    const errors = [], rows = [];
    if (missingColumns.length) return { rows, errors, missingColumns, total: parsed.records.length };
    const seen = new Set();
    parsed.records.forEach((rec, i) => {
      const line = i + 2;
      const get = (c) => (c in idx ? String(rec[idx[c]] ?? '').trim() : '');
      const errs = [];
      for (const c of REQUIRED) if (get(c) === '') errs.push({ line, field: c, code: 'empty', value: '' });
      const num = (c, lo, hi, code) => {
        const raw = get(c); if (raw === '') return NaN;
        const v = Number(raw.replace(',', '.'));
        if (!Number.isFinite(v)) { errs.push({ line, field: c, code: 'not_number', value: raw }); return NaN; }
        if (v < lo || v > hi) errs.push({ line, field: c, code, value: raw });
        return v;
      };
      const pre = num('pre_score', 0, 100, 'out_of_range');
      const post = num('post_score', 0, 100, 'out_of_range');
      const ph = num('planned_hours', 0, 200, 'bad_hours');
      const ah = num('actual_hours', 0, 200, 'bad_hours');
      const tbRaw = get('textbook');
      const tb = tbRaw ? normalizeTextbook(tbRaw) : null;
      if (tbRaw && !tb) errs.push({ line, field: 'textbook', code: 'unknown_textbook', value: tbRaw });
      const key = get('student_id') + '|' + get('topic_id');
      if (!errs.length && seen.has(key)) errs.push({ line, field: 'student_id', code: 'duplicate', value: key.replace('|', ' / ') });
      if (errs.length) { if (errors.length < maxErrors) errors.push(...errs.slice(0, maxErrors - errors.length)); return; }
      seen.add(key);
      rows.push({
        subject: get('subject') || 'uploaded',
        school_id: get('school_id'), school_name: get('school_name') || get('school_id'),
        district: get('district') || '—', class_id: get('class_id') || get('school_id'),
        textbook: tb, student_id: get('student_id'), topic_id: get('topic_id'),
        topic_name: get('topic_name') || get('topic_id'),
        planned_hours: ph, actual_hours: ah, pre, post,
      });
    });
    return { rows, errors, missingColumns, total: parsed.records.length, invalidCount: parsed.records.length - rows.length };
  }

  /** Валидация item-level файла: student_id, topic_id, item_id, correct (0/1). */
  function validateItems(parsed) {
    const h = parsed.headers.map(norm);
    const need = ['student_id', 'topic_id', 'item_id', 'correct'];
    const missingColumns = need.filter((c) => !h.includes(c));
    if (missingColumns.length) return { rows: [], errors: [], missingColumns, total: parsed.records.length };
    const ix = Object.fromEntries(need.map((c) => [c, h.indexOf(c)]));
    const rows = [], errors = [];
    parsed.records.forEach((rec, i) => {
      const v = Object.fromEntries(need.map((c) => [c, String(rec[ix[c]] ?? '').trim()]));
      const bad = need.filter((c) => v[c] === '');
      if (bad.length) { if (errors.length < 500) errors.push({ line: i + 2, field: bad[0], code: 'empty', value: '' }); return; }
      if (v.correct !== '0' && v.correct !== '1') { if (errors.length < 500) errors.push({ line: i + 2, field: 'correct', code: 'not_binary', value: v.correct }); return; }
      rows.push({ student_id: v.student_id, topic_id: v.topic_id, item_id: v.item_id, correct: +v.correct });
    });
    return { rows, errors, missingColumns, total: parsed.records.length };
  }

  return {
    mean, median, sd, variance, quantile, meanCI, pearson, groupBy,
    masteryRate, topicStats, classifyTopics, DEFAULT_RULES, itemAnalysis,
    ols, compareTextbooks, contrast, textbookFindings,
    hoursEffect, expectedEffect, recommendHours, hoursShift, saturation,
    parseCSV, validateResults, validateItems, normalizeTextbook, mapHeaders, COLUMN_ALIASES, REQUIRED,
  };
});
