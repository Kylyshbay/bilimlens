/* BilimLens — интерфейс. Без сборки и фреймворков; вся аналитика — в analytics.js. */
(function () {
  'use strict';
  const A = window.Analytics;
  const I = window.I18N;
  const LS = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* noop */ } },
  };
  const ROUTES = ['home', 'overview', 'topics', 'textbooks', 'hours', 'school', 'report', 'data'];
  const MIN_N = 30;
  const TB = ['A', 'B', 'C'];

  const state = {
    lang: LS.get('bl_lang') === 'kz' ? 'kz' : 'ru',
    theme: LS.get('bl_theme') === 'dark' ? 'dark' : 'light',
    route: 'home',
    ds: null,
    f: { subject: null, district: 'all', school: 'all', textbook: 'all' },
    threshold: 60,
    tbTopic: 'all',
    itemTopic: null,
    hoursTopic: null,
    whatIf: null, whatIfKey: null,
    importReport: null, pendingImport: null,
    schoolId: null,
  };
  window.__missingKeys = new Set();

  // ---------- утилиты ----------
  function t(key, p) {
    let s = I[state.lang][key];
    if (s === undefined) { window.__missingKeys.add(state.lang + ':' + key); s = I.ru[key] !== undefined ? I.ru[key] : key; }
    if (p) s = s.replace(/\{(\w+)\}/g, (m, k) => (p[k] !== undefined ? p[k] : m));
    return s;
  }
  const esc = (s) => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const L = (name) => (name && typeof name === 'object' ? name[state.lang] || name.ru : name);
  const nf = (d) => new Intl.NumberFormat('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmt = (x, d = 1) => (Number.isFinite(x) ? nf(d).format(x).replace('-', '−') : '—');
  const fmtS = (x, d = 1) => (Number.isFinite(x) ? (x > 0 ? '+' : '') + fmt(x, d) : '—');
  const pct = (x, d = 0) => (Number.isFinite(x) ? fmt(x * 100, d) + '%' : '—');
  const tbName = (code) => t('tb_' + code);
  const $ = (sel, el = document) => el.querySelector(sel);

  // ---------- данные ----------
  function buildDemo() {
    const D = window.DEMO_DATA;
    const schools = new Map(D.schools.map((s) => [s.id, { id: s.id, name: { ru: s.ru, kz: s.kz }, district: s.district }]));
    const districts = new Map(D.districts.map((d) => [d.id, { id: d.id, name: { ru: d.ru, kz: d.kz } }]));
    const rows = D.rows.data.map((r) => ({ subject: r[0], school_id: r[1], class_id: r[2], textbook: r[3], student_id: r[4], topic_id: r[5], planned_hours: r[6], actual_hours: r[7], pre: r[8], post: r[9], district: schools.get(r[1]).district }));
    const items = D.items.data.map((r) => ({ student_id: r[0], topic_id: r[1], item_id: r[2], correct: r[3] }));
    return {
      source: 'demo', name: { ru: 'Демо-данные (синтетические)', kz: 'Демо-деректер (синтетикалық)' },
      subjects: D.subjects.map((s) => ({ id: s.id, name: { ru: s.ru, kz: s.kz }, totalHours: s.totalHours, topics: s.topics.map((x) => ({ id: x.id, name: { ru: x.ru, kz: x.kz }, planned: x.planned })) })),
      schools, districts, rows, items,
    };
  }
  function buildUploaded(rows, items, fileName) {
    const subjects = [];
    for (const [sid, rs] of A.groupBy(rows, (r) => r.subject)) {
      const topics = [];
      for (const [tid, trs] of A.groupBy(rs, (r) => r.topic_id)) {
        const counts = {};
        trs.forEach((r) => (counts[r.planned_hours] = (counts[r.planned_hours] || 0) + 1));
        const planned = +Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
        topics.push({ id: tid, name: trs[0].topic_name || tid, planned });
      }
      topics.sort((a, b) => (a.id < b.id ? -1 : 1));
      subjects.push({ id: sid, name: sid === 'uploaded' ? { ru: 'Загруженные данные', kz: 'Жүктелген деректер' } : sid, totalHours: topics.reduce((s, x) => s + x.planned, 0), topics });
    }
    const schools = new Map(), districts = new Map();
    rows.forEach((r) => {
      if (!schools.has(r.school_id)) schools.set(r.school_id, { id: r.school_id, name: r.school_name || r.school_id, district: r.district });
      if (!districts.has(r.district)) districts.set(r.district, { id: r.district, name: r.district });
    });
    return { source: 'upload', fileName, name: { ru: 'Загружено: ' + fileName, kz: 'Жүктелді: ' + fileName }, subjects, schools, districts, rows, items: items || [] };
  }
  function loadInitialDataset() {
    const saved = LS.get('bl_dataset');
    if (saved) {
      try { const o = JSON.parse(saved); if (o && o.rows && o.rows.length) return buildUploaded(o.rows, o.items, o.fileName); } catch (e) { LS.del('bl_dataset'); }
    }
    return buildDemo();
  }
  function setDataset(ds) {
    state.ds = ds;
    state.f = { subject: ds.subjects[0].id, district: 'all', school: 'all', textbook: 'all' };
    state.tbTopic = 'all'; state.itemTopic = null; state.hoursTopic = null; state.whatIf = null; state.schoolId = null;
    cache.key = null;
  }

  const subj = () => state.ds.subjects.find((s) => s.id === state.f.subject) || state.ds.subjects[0];
  const topicName = (id) => { const tp = subj().topics.find((x) => x.id === id); return tp ? L(tp.name) : id; };
  const schoolName = (id) => { const s = state.ds.schools.get(id); return s ? L(s.name) : id; };
  const districtName = (id) => { const d = state.ds.districts.get(id); return d ? L(d.name) : id; };

  function filterRows({ textbook = true, district = true, school = true } = {}) {
    const f = state.f;
    return state.ds.rows.filter((r) => r.subject === f.subject
      && (!district || f.district === 'all' || r.district === f.district)
      && (!school || f.school === 'all' || r.school_id === f.school)
      && (!textbook || f.textbook === 'all' || r.textbook === f.textbook));
  }

  // ---------- расчёты (кэш по фильтрам) ----------
  const cache = { key: null, val: null };
  function compute() {
    const key = JSON.stringify([state.ds.name, state.f, state.threshold]);
    if (cache.key === key) return cache.val;
    const S = subj();
    const thr = state.threshold;
    const topicIds = S.topics.map((x) => x.id);
    const rows = filterRows();
    const rowsNoTb = filterRows({ textbook: false });
    const subjRows = state.ds.rows.filter((r) => r.subject === S.id);
    const statsArr = A.classifyTopics(A.topicStats(rows, topicIds, thr));
    const stats = new Map(statsArr.map((s) => [s.topic_id, s]));
    const he = new Map(topicIds.map((id) => [id, A.hoursEffect(subjRows, id)]));
    const recIn = S.topics.map((tp) => {
      const st = stats.get(tp.id), h = he.get(tp.id);
      return { id: tp.id, planned: tp.planned, status: st ? st.status : 'nodata', slope: h.slope, maxAdd: h.maxDelta, maxCut: -h.minDelta };
    });
    const rec = A.recommendHours(recIn).map((r) => {
      const st = stats.get(r.id);
      const scores = rows.filter((x) => x.topic_id === r.id).map((x) => x.post);
      const after = A.masteryRate(scores.map((x) => Math.min(100, x + r.expectedShift)), thr);
      return { ...r, mastery: st ? st.mastery : NaN, masteryAfter: after, n: scores.length, he: he.get(r.id) };
    });
    // Общее сравнение учебников — по темам, где у всех учебников n ≥ 30 (иначе разный набор тем исказит средние).
    const tbPresent = TB.filter((tb) => rowsNoTb.some((r) => r.textbook === tb));
    const overallTopics = topicIds.filter((id) => tbPresent.every((tb) => rowsNoTb.filter((r) => r.topic_id === id && r.textbook === tb).length >= MIN_N));
    const overallSet = new Set(overallTopics);
    const overall = A.compareTextbooks(rowsNoTb.filter((r) => overallSet.has(r.topic_id)), { textbooks: TB, minN: MIN_N });
    const findings = A.textbookFindings(rowsNoTb, topicIds, { textbooks: TB, minN: MIN_N });
    const students = new Set(rows.map((r) => r.student_id));
    const items = state.ds.items.filter((it) => students.has(it.student_id) && topicIds.includes(it.topic_id));
    const itemRes = A.itemAnalysis(items);
    const masteryAll = A.masteryRate(rows.map((r) => r.post), thr);
    const val = { S, thr, topicIds, rows, rowsNoTb, subjRows, statsArr, stats, he, rec, overall, overallTopics, findings, students, itemRes, masteryAll, tbPresent };
    cache.key = key; cache.val = val;
    return val;
  }

  // ---------- общие элементы ----------
  const STATUS_ORDER = ['critical', 'risk', 'norm', 'mastered'];
  const chip = (status) => `<span class="chip st-${status}">${esc(t('status_' + status))}</span>`;
  const tbChip = (code) => `<span class="tb tb-${code}">${esc(tbName(code))}</span>`;
  function heatColor(v) {
    if (!Number.isFinite(v)) return ['#EEF2F4', '#6B7C85'];
    const stops = [[0, [176, 52, 36]], [0.4, [226, 120, 58]], [0.55, [242, 190, 102]], [0.7, [214, 233, 226]], [0.85, [111, 190, 160]], [1, [24, 128, 100]]];
    let i = 0; while (i < stops.length - 2 && v > stops[i + 1][0]) i++;
    const [p0, c0] = stops[i], [p1, c1] = stops[i + 1];
    const k = Math.max(0, Math.min(1, (v - p0) / (p1 - p0)));
    const c = c0.map((x, j) => Math.round(x + (c1[j] - x) * k));
    const lum = (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
    return [`rgb(${c.join(',')})`, lum < 0.58 ? '#fff' : '#17323A'];
  }
  function details(titleKey, bodyHtml, open = false) {
    return `<details class="howto"${open ? ' open' : ''}><summary>${esc(t(titleKey))}</summary><div class="howto-body">${bodyHtml}</div></details>`;
  }
  function note(kind, html) { return `<div class="note note-${kind}" role="${kind === 'warn' ? 'alert' : 'note'}">${html}</div>`; }
  const STATUS_COLOR = { critical: 'var(--st-critical)', risk: 'var(--st-risk)', norm: 'var(--st-norm)', mastered: 'var(--st-mastered)', nodata: 'var(--muted)' };

  function barList(items, { max = 1, threshold = null } = {}) {
    return `<div class="barlist">${items.map((it) => `
      <div class="bl-row">
        <div class="bl-label" title="${esc(it.label)}">${esc(it.label)}${it.sub ? `<span class="bl-sub">${it.sub}</span>` : ''}</div>
        <div class="bl-track">${threshold !== null ? `<span class="bl-thr" style="left:${(threshold / max) * 100}%"></span>` : ''}<span class="bl-bar" style="width:${Math.max(0, Math.min(100, (it.value / max) * 100))}%;background:${it.color}"></span></div>
        <div class="bl-val">${esc(it.valueText)}</div>
      </div>`).join('')}</div>`;
  }

  // ---------- фильтры ----------
  function renderFilters() {
    const el = $('#filters');
    const show = ['overview', 'topics', 'textbooks', 'hours', 'report', 'school'].includes(state.route);
    el.hidden = !show;
    if (!show) { el.innerHTML = ''; return; }
    const ds = state.ds, f = state.f;
    const subjRows = ds.rows.filter((r) => r.subject === f.subject);
    const dists = [...new Set(subjRows.map((r) => r.district))];
    const schools = [...new Set(subjRows.filter((r) => f.district === 'all' || r.district === f.district).map((r) => r.school_id))];
    const opt = (v, label, cur) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(label)}</option>`;
    const tbDisabled = state.route === 'textbooks';
    el.innerHTML = `
      <div class="filters-inner">
        <label class="fl"><span>${esc(t('f_subject'))}</span><select data-filter="subject">${ds.subjects.map((s) => opt(s.id, L(s.name), f.subject)).join('')}</select></label>
        <label class="fl"><span>${esc(t('f_district'))}</span><select data-filter="district">${opt('all', t('f_all_districts'), f.district)}${dists.map((d) => opt(d, districtName(d), f.district)).join('')}</select></label>
        <label class="fl"><span>${esc(t('f_school'))}</span><select data-filter="school">${opt('all', t('f_all_schools'), f.school)}${schools.map((s) => opt(s, schoolName(s), f.school)).join('')}</select></label>
        <label class="fl"><span>${esc(t('f_textbook'))}</span><select data-filter="textbook"${tbDisabled ? ' disabled title="' + esc(t('f_tb_disabled')) + '"' : ''}>${opt('all', t('f_all_textbooks'), f.textbook)}${TB.filter((x) => subjRows.some((r) => r.textbook === x)).map((x) => opt(x, tbName(x), f.textbook)).join('')}</select></label>
        <label class="fl fl-thr"><span>${esc(t('f_threshold'))}: <b id="thr-val">${state.threshold}</b></span><input id="thr" type="range" min="40" max="80" step="5" value="${state.threshold}" aria-label="${esc(t('f_threshold'))}"></label>
      </div>`;
  }

  // ---------- страницы ----------
  function viewHome() {
    const ds = state.ds;
    const nStud = new Set(ds.rows.map((r) => r.student_id)).size;
    const feats = [['f1', 'i-topics'], ['f2', 'i-alert'], ['f3', 'i-book'], ['f4', 'i-clock']];
    return `
    <section class="hero">
      <div class="hero-text">
        <p class="eyebrow">${esc(t('hero_eyebrow'))}</p>
        <h1>${esc(t('hero_title'))}</h1>
        <p class="lead">${esc(t('hero_lead'))}</p>
        <div class="hero-cta">
          <a class="btn btn-primary" href="#overview" data-testid="open-demo">${esc(t('cta_demo'))}</a>
          <a class="btn btn-ghost" href="#data">${esc(t('cta_upload'))}</a>
        </div>
        <p class="hero-meta">${esc(t('hero_meta', { students: fmt(nStud, 0), schools: ds.schools.size, subjects: ds.subjects.length }))}</p>
      </div>
      <div class="hero-visual" aria-hidden="true">${heroVisual()}</div>
    </section>
    <section class="split">
      <div class="card problem"><h2>${esc(t('problem_title'))}</h2><ul class="ticks ticks-x">${[1, 2, 3].map((i) => `<li>${esc(t('problem_' + i))}</li>`).join('')}</ul></div>
      <div class="card solution"><h2>${esc(t('solution_title'))}</h2><ul class="ticks">${[1, 2, 3].map((i) => `<li>${esc(t('solution_' + i))}</li>`).join('')}</ul></div>
    </section>
    <section>
      <h2 class="section-title">${esc(t('features_title'))}</h2>
      <div class="features">${feats.map(([k, ic], i) => `
        <a class="feature" href="#${['topics', 'topics', 'textbooks', 'hours'][i]}">
          <span class="feature-num">0${i + 1}</span>
          <h3>${esc(t(k + '_title'))}</h3><p>${esc(t(k + '_text'))}</p>
        </a>`).join('')}</div>
    </section>
    <section class="card steps-card">
      <h2 class="section-title">${esc(t('how_title'))}</h2>
      <ol class="steps">${[1, 2, 3, 4].map((i) => `<li><b>${esc(t('how_' + i + '_t'))}</b><span>${esc(t('how_' + i))}</span></li>`).join('')}</ol>
    </section>`;
  }
  function heroVisual() {
    const c = compute();
    const cells = c.S.topics.slice(0, 12).map((tp) => { const st = c.stats.get(tp.id); return st ? st.mastery : NaN; });
    const bars = cells.map((v, i) => { const [bg] = heatColor(v); const h = Math.max(8, v * 120); return `<rect x="${20 + i * 26}" y="${150 - h}" width="18" height="${h}" rx="3" fill="${bg}"/>`; }).join('');
    return `<svg viewBox="0 0 360 230" role="img"><rect x="0" y="0" width="360" height="230" rx="18" fill="#fff" stroke="#DCE5E8"/>
      <text x="20" y="28" font-size="12" font-weight="600" fill="#0B5563">${esc(t('hero_vis_title'))}</text>
      <line x1="16" x2="344" y1="${150 - 0.6 * 120}" y2="${150 - 0.6 * 120}" stroke="#E39B2D" stroke-dasharray="4 4"/>
      ${bars}<line x1="16" x2="344" y1="150" y2="150" stroke="#C9D5DA"/>
      <g font-size="11" fill="#4A5D66"><circle cx="26" cy="178" r="5" fill="${heatColor(0.3)[0]}"/><text x="36" y="182">${esc(t('status_critical'))}</text>
      <circle cx="130" cy="178" r="5" fill="${heatColor(0.92)[0]}"/><text x="140" y="182">${esc(t('status_mastered'))}</text>
      <line x1="226" x2="246" y1="178" y2="178" stroke="#E39B2D" stroke-dasharray="4 4"/><text x="252" y="182">${esc(t('threshold_short'))}</text></g>
      <text x="20" y="210" font-size="10.5" fill="#6B7C85">${esc(t('hero_vis_note'))}</text></svg>`;
  }

  function kpis(c) {
    const nSchools = new Set(c.rows.map((r) => r.school_id)).size;
    const atRisk = c.statsArr.filter((s) => s.status === 'critical' || s.status === 'risk').length;
    const crit = c.statsArr.filter((s) => s.status === 'critical').length;
    const tiles = [
      [t('kpi_students'), fmt(c.students.size, 0), ''],
      [t('kpi_schools'), fmt(nSchools, 0), ''],
      [t('kpi_topics'), fmt(c.statsArr.length, 0), t('kpi_hours', { h: c.S.totalHours })],
      [t('kpi_mastery'), pct(c.masteryAll), t('kpi_mastery_sub', { thr: c.thr })],
      [t('kpi_risk'), fmt(atRisk, 0), t('kpi_risk_sub', { n: crit })],
    ];
    return `<div class="kpis">${tiles.map(([l, v, s], i) => `<div class="kpi${i === 4 && atRisk ? ' kpi-alert' : ''}"><div class="kpi-label">${esc(l)}</div><div class="kpi-val">${esc(v)}</div>${s ? `<div class="kpi-sub">${esc(s)}</div>` : ''}</div>`).join('')}</div>`;
  }

  function viewOverview() {
    const c = compute();
    if (!c.rows.length) return emptyState();
    const topics = c.S.topics.filter((tp) => c.stats.has(tp.id));
    const bySchool = A.groupBy(c.rows, (r) => r.school_id);
    const schoolList = [...bySchool.keys()].sort((a, b) => {
      const ma = A.masteryRate(bySchool.get(a).map((r) => r.post), c.thr), mb = A.masteryRate(bySchool.get(b).map((r) => r.post), c.thr);
      return mb - ma;
    });
    let small = false;
    const head = `<tr><th class="hm-school">${esc(t('hm_school'))}</th>${topics.map((tp, i) => `<th class="hm-col" title="${esc(L(tp.name))}"><span>${i + 1}</span></th>`).join('')}<th class="hm-col hm-total">Σ</th></tr>`;
    const body = schoolList.map((sid) => {
      const rs = bySchool.get(sid);
      const byT = A.groupBy(rs, (r) => r.topic_id);
      const tb = rs[0].textbook;
      const cells = topics.map((tp) => {
        const tr = byT.get(tp.id) || [];
        const v = A.masteryRate(tr.map((r) => r.post), c.thr);
        const [bg, fg] = heatColor(v);
        const isSmall = tr.length > 0 && tr.length < MIN_N;
        if (isSmall) small = true;
        return `<td class="hm-cell${isSmall ? ' hm-small' : ''}" style="background:${bg};color:${fg}" title="${esc(L(tp.name))} — ${esc(schoolName(sid))}: ${pct(v)} (n=${tr.length})">${tr.length ? Math.round(v * 100) + (isSmall ? '*' : '') : '—'}</td>`;
      }).join('');
      const tot = A.masteryRate(rs.map((r) => r.post), c.thr);
      const [bg, fg] = heatColor(tot);
      return `<tr><th class="hm-school"><a href="#school" data-action="goto-school" data-id="${esc(sid)}">${esc(schoolName(sid))}</a><span class="hm-meta">${tbChip(tb)} · n=${new Set(rs.map((r) => r.student_id)).size}</span></th>${cells}<td class="hm-cell hm-total" style="background:${bg};color:${fg}">${Math.round(tot * 100)}</td></tr>`;
    }).join('');
    const legend = `<div class="hm-legend"><span>0%</span><span class="hm-grad"></span><span>100%</span><span class="muted">${esc(t('hm_legend'))}</span>${small ? `<span class="muted">· ${esc(t('hm_small'))}</span>` : ''}</div>`;
    const topicKey = `<ol class="topic-key">${topics.map((tp) => `<li>${esc(L(tp.name))}</li>`).join('')}</ol>`;
    const bars = barList(c.statsArr.slice().sort((a, b) => a.mastery - b.mastery).map((s) => ({ label: topicName(s.topic_id), value: s.mastery, color: STATUS_COLOR[s.status], valueText: pct(s.mastery), sub: chip(s.status) })), { threshold: null });
    return `
      <div class="page-head"><h1>${esc(t('nav_overview'))}</h1><p class="muted">${esc(t('overview_sub', { subject: L(c.S.name) }))}</p></div>
      ${kpis(c)}
      <section class="card">
        <div class="card-head"><h2>${esc(t('hm_title'))}</h2><p class="muted">${esc(t('hm_sub', { thr: c.thr }))}</p></div>
        ${legend}
        <div class="table-wrap"><table class="heatmap" data-testid="heatmap"><thead>${head}</thead><tbody>${body}</tbody></table></div>
        ${details('topic_key', topicKey)}
      </section>
      <section class="card">
        <div class="card-head"><h2>${esc(t('bars_title'))}</h2><p class="muted">${esc(t('bars_sub'))}</p></div>
        ${bars}
        <p class="more"><a href="#topics">${esc(t('go_topics'))} →</a></p>
      </section>`;
  }

  function emptyState() {
    return `<div class="card empty"><h2>${esc(t('empty_title'))}</h2><p>${esc(t('empty_text'))}</p><button class="btn" data-action="reset-filters">${esc(t('reset_filters'))}</button></div>`;
  }

  function ruleBox() {
    const r = A.DEFAULT_RULES;
    return `<div class="rule-box"><h3>${esc(t('rule_title'))}</h3><ul>
      <li>${chip('critical')} ${esc(t('rule_critical', { c: r.critical * 100 }))}</li>
      <li>${chip('risk')} ${esc(t('rule_risk', { r: r.risk * 100 }))}</li>
      <li>${chip('norm')} ${esc(t('rule_norm', { r: r.risk * 100, m: r.mastered * 100 }))}</li>
      <li>${chip('mastered')} ${esc(t('rule_mastered', { m: r.mastered * 100 }))}</li></ul>
      <p class="muted small">${esc(t('rule_note', { thr: state.threshold }))}</p></div>`;
  }

  function viewTopics() {
    const c = compute();
    if (!c.rows.length) return emptyState();
    const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, c.statsArr.filter((x) => x.status === s).length]));
    const sorted = c.statsArr.slice().sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.mastery - b.mastery);
    const rows = sorted.map((s) => `
      <tr class="row-${s.status}">
        <td class="td-topic"><b>${esc(topicName(s.topic_id))}</b>${s.n < MIN_N ? `<span class="warn-inline">${esc(t('small_n', { n: s.n }))}</span>` : ''}</td>
        <td>${chip(s.status)}</td>
        <td class="num">${fmt(s.mean)}</td>
        <td class="num">${fmt(s.median, 0)}</td>
        <td class="num"><div class="mini"><span style="width:${s.mastery * 100}%;background:${STATUS_COLOR[s.status]}"></span></div>${pct(s.mastery)}</td>
        <td class="num">${fmt(s.sd)}<span class="muted small"> (${fmt(s.q1, 0)}–${fmt(s.q3, 0)})</span></td>
        <td class="num">${fmtS(s.gain)}</td>
        <td class="num muted">${fmt(s.n, 0)}</td>
      </tr>`).join('');
    const hardest = sorted.filter((s) => s.status === 'critical');
    const insight = hardest.length ? note('warn', t('topics_insight', { list: hardest.map((s) => `«${esc(topicName(s.topic_id))}» (${pct(s.mastery)})`).join(', ') })) : note('ok', esc(t('topics_insight_none')));
    return `
      <div class="page-head"><h1>${esc(t('nav_topics'))}</h1><p class="muted">${esc(t('topics_sub', { thr: c.thr }))}</p></div>
      <div class="status-counts">${STATUS_ORDER.map((s) => `<div class="sc sc-${s}"><b>${counts[s]}</b>${chip(s)}</div>`).join('')}</div>
      ${insight}
      <div class="grid-2-1">
        <section class="card"><div class="card-head"><h2>${esc(t('topics_table'))}</h2></div>
          <div class="table-wrap"><table class="data" data-testid="topics-table"><thead><tr>
            <th>${esc(t('col_topic'))}</th><th>${esc(t('col_status'))}</th><th class="num">${esc(t('col_mean'))}</th><th class="num">${esc(t('col_median'))}</th>
            <th class="num">${esc(t('col_mastery', { thr: c.thr }))}</th><th class="num">${esc(t('col_spread'))}</th><th class="num">${esc(t('col_gain'))}</th><th class="num">n</th>
          </tr></thead><tbody>${rows}</tbody></table></div>
          ${details('how_topics', `<p>${t('how_topics_text')}</p>`)}
        </section>
        <aside>${ruleBox()}</aside>
      </div>
      ${viewItems(c)}`;
  }

  function viewItems(c) {
    const topics = c.topicIds.filter((id) => c.itemRes[id] && c.itemRes[id].length);
    if (!topics.length) return `<section class="card"><div class="card-head"><h2>${esc(t('items_title'))}</h2></div><p class="muted">${esc(t('items_none'))}</p></section>`;
    if (!topics.includes(state.itemTopic)) state.itemTopic = topics[0];
    const list = c.itemRes[state.itemTopic];
    const bad = list.filter((x) => x.flag);
    const rows = list.map((it) => `
      <tr class="${it.flag ? 'row-flag' : ''}">
        <td><b>${esc(it.item_id)}</b></td>
        <td class="num"><div class="mini"><span style="width:${it.p * 100}%;background:var(--teal)"></span></div>${fmt(it.p, 2)}</td>
        <td class="num"><div class="mini mini-c"><span style="left:${it.rpb < 0 ? 50 + it.rpb * 50 : 50}%;width:${Math.abs(it.rpb) * 50}%;background:${it.rpb < 0.2 ? 'var(--st-critical)' : 'var(--st-mastered)'}"></span></div>${fmt(it.rpb, 2)}</td>
        <td>${it.flag ? `<span class="chip flag">${esc(t('flag_' + it.flag))}</span>` : `<span class="chip ok">${esc(t('flag_ok'))}</span>`}</td>
        <td class="num muted">${it.n}</td>
      </tr>`).join('');
    return `<section class="card" id="items">
      <div class="card-head"><h2>${esc(t('items_title'))}</h2><p class="muted">${esc(t('items_sub'))}</p></div>
      <div class="tabs" role="tablist">${topics.map((id) => `<button role="tab" class="tab${id === state.itemTopic ? ' active' : ''}" data-action="item-topic" data-id="${esc(id)}">${esc(topicName(id))}</button>`).join('')}</div>
      ${bad.length ? note('warn', t('items_bad', { n: bad.length, list: bad.map((b) => `<b>${esc(b.item_id)}</b> — ${esc(t('flag_' + b.flag))}`).join('; ') })) : note('ok', esc(t('items_good')))}
      <div class="table-wrap"><table class="data"><thead><tr><th>${esc(t('col_item'))}</th><th class="num">${esc(t('col_p'))}</th><th class="num">${esc(t('col_rpb'))}</th><th>${esc(t('col_verdict'))}</th><th class="num">n</th></tr></thead><tbody>${rows}</tbody></table></div>
      ${details('how_items', `<p>${t('how_items_text')}</p>`)}
    </section>`;
  }

  // --- учебники ---
  function dotWhisker(res) {
    const gs = res.groups.filter((g) => Number.isFinite(g.rawMean));
    const vals = gs.flatMap((g) => [g.rawCI && g.rawCI[0], g.rawCI && g.rawCI[1], g.adjCI && g.adjCI[0], g.adjCI && g.adjCI[1]]).filter(Number.isFinite);
    let lo = Math.floor(Math.min(...vals) - 2), hi = Math.ceil(Math.max(...vals) + 2);
    if (hi - lo < 10) { const m = (hi + lo) / 2; lo = Math.floor(m - 5); hi = Math.ceil(m + 5); }
    const x = (v) => ((v - lo) / (hi - lo)) * 100;
    const ticks = []; const step = hi - lo > 30 ? 10 : hi - lo > 14 ? 5 : 2;
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);
    const line = (cls, mean, ci, label) => `<div class="dw-line ${cls}" title="${esc(label)}: ${fmt(mean)} [${fmt(ci[0])}; ${fmt(ci[1])}]">
        <span class="dw-ci" style="left:${x(ci[0])}%;width:${x(ci[1]) - x(ci[0])}%"></span><span class="dw-dot" style="left:${x(mean)}%"></span><span class="dw-num" style="left:${x(mean)}%">${fmt(mean)}</span></div>`;
    return `<div class="dw">
      <div class="dw-legend"><span class="lg lg-raw"></span>${esc(t('dw_raw'))}<span class="lg lg-adj"></span>${esc(t('dw_adj'))}<span class="muted">${esc(t('dw_ci'))}</span></div>
      ${gs.map((g) => `<div class="dw-row${g.insufficient ? ' dw-insuf' : ''}"><div class="dw-label">${tbChip(g.tb)}<span class="muted small">n=${g.n}${g.insufficient ? ' · ' + esc(t('insufficient_short')) : ''}</span></div>
        <div class="dw-plot">${ticks.map((v) => `<span class="dw-grid" style="left:${x(v)}%"></span>`).join('')}
          ${line('raw', g.rawMean, g.rawCI, t('dw_raw'))}${Number.isFinite(g.adjMean) ? line('adj', g.adjMean, g.adjCI, t('dw_adj')) : ''}</div></div>`).join('')}
      <div class="dw-row dw-axis"><div class="dw-label"></div><div class="dw-plot">${ticks.map((v) => `<span class="dw-tick" style="left:${x(v)}%">${v}</span>`).join('')}</div></div>
    </div>`;
  }

  function findingsText(c) {
    const f = c.findings;
    const parts = [];
    for (const dir of ['better', 'worse']) {
      for (const tb of TB) {
        const fs = f.findings.filter((x) => x.tb === tb && x.dir === dir);
        if (!fs.length) continue;
        const list = fs.map((x) => `«${esc(topicName(x.topicId))}» (${fmtS(x.diff)} ${esc(t('pts'))}, d = ${fmt(x.d, 2)})`).join(', ');
        parts.push(`<li class="find-${dir}">${t('find_' + dir, { tb: `<b>${esc(tbName(tb))}</b>`, list })}</li>`);
      }
    }
    if (!f.findings.length) parts.push(`<li>${esc(t('find_none'))}</li>`);
    else parts.push(`<li class="find-neutral">${esc(t('find_rest'))}</li>`);
    if (f.insufficientTopics.length) parts.push(`<li class="find-insuf">${t('find_insuf', { list: f.insufficientTopics.map((x) => `«${esc(topicName(x.topicId))}» — ${x.groups.map((g) => `${esc(tbName(g.tb))} (n = ${g.n})`).join(', ')}`).join('; ') })}</li>`);
    return `<ul class="findings">${parts.join('')}</ul>`;
  }
  function paradoxNote(res) {
    if (!res.paradox) return '';
    const raw = res.groups.find((g) => g.tb === res.rawLeader), adj = res.groups.find((g) => g.tb === res.adjLeader);
    return `<div class="paradox" data-testid="paradox"><div class="paradox-icon">!</div><div><h3>${t('paradox_title', { raw: esc(tbName(res.rawLeader)), adj: esc(tbName(res.adjLeader)) })}</h3>
      <p>${t('paradox_text', { raw: esc(tbName(res.rawLeader)), adj: esc(tbName(res.adjLeader)), preRaw: fmt(raw.preMean), preAdj: fmt(adj.preMean) })}</p></div></div>`;
  }
  function contrastTable(res) {
    const rows = res.contrasts.map((c0) => {
      const c = c0.diff < 0 ? A.contrast(res, c0.b, c0.a) : c0;
      const verdict = c.insufficient ? `<span class="chip insuf">${esc(t('insufficient'))}</span>` : c.significant ? `<span class="chip ok">${esc(t('sig_yes'))}</span>` : `<span class="chip neutral">${esc(t('sig_no'))}</span>`;
      return `<tr><td class="nowrap">${tbChip(c.a)} − ${tbChip(c.b)}</td><td class="num"><b>${fmtS(c.diff)}</b></td><td class="num">[${fmt(c.ci[0])}; ${fmt(c.ci[1])}]</td><td class="num">${fmt(c.d, 2)}</td><td>${verdict}</td></tr>`;
    }).join('');
    return `<div class="table-wrap"><table class="data"><thead><tr><th>${esc(t('col_pair'))}</th><th class="num">${esc(t('col_diff'))}</th><th class="num">${esc(t('col_ci'))}</th><th class="num">Cohen's d</th><th>${esc(t('col_verdict'))}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  function viewTextbooks() {
    const c = compute();
    if (!c.rowsNoTb.length) return emptyState();
    const topicOpt = state.tbTopic;
    const res = topicOpt === 'all' ? c.overall : (c.findings.perTopic.find((p) => p.topicId === topicOpt) || {}).res;
    const insuf = res && res.groups.filter((g) => g.insufficient);
    const tbs = c.tbPresent;
    let body = '';
    if (!res || res.groups.length < 2) body = note('info', esc(t('tb_need_two')));
    else {
      const cards = res.groups.map((g) => `<div class="tbcard tbc-${g.tb}${g.tb === res.adjLeader ? ' leader' : ''}">
          <div class="tbcard-head">${tbChip(g.tb)}${g.tb === res.adjLeader ? `<span class="badge">${esc(t('leader_adj'))}</span>` : ''}</div>
          <dl><dt>${esc(t('tb_n'))}</dt><dd>${fmt(g.n, 0)}</dd><dt>${esc(t('tb_pre'))}</dt><dd>${fmt(g.preMean)}</dd>
          <dt>${esc(t('tb_raw'))}</dt><dd>${fmt(g.rawMean)}</dd><dt>${esc(t('tb_adj'))}</dt><dd><b>${g.insufficient ? '—' : fmt(g.adjMean)}</b></dd></dl>
          ${g.insufficient ? `<p class="warn-inline">${esc(t('insufficient_n', { n: g.n }))}</p>` : ''}</div>`).join('');
      body = `${paradoxNote(res)}
        ${insuf.length ? note('warn', t('insuf_banner', { list: insuf.map((g) => `${esc(tbName(g.tb))} (n = ${g.n})`).join(', ') })) : ''}
        <div class="tbcards">${cards}</div>
        <div class="grid-2">
          <section class="card"><div class="card-head"><h2>${esc(t('dw_title'))}</h2><p class="muted">${esc(t('dw_sub'))}</p></div>${dotWhisker(res)}</section>
          <section class="card"><div class="card-head"><h2>${esc(t('contrast_title'))}</h2><p class="muted">${esc(t('contrast_sub'))}</p></div>${contrastTable(res)}</section>
        </div>`;
    }
    // матрица тема × учебник
    const matrix = c.findings.perTopic.map(({ topicId, res: r }) => {
      const best = c.findings.findings.filter((x) => x.topicId === topicId);
      const cells = tbs.map((tb) => {
        const g = r.groups.find((x) => x.tb === tb);
        if (!g) return '<td class="num muted">—</td>';
        const f = best.find((x) => x.tb === tb);
        const cls = g.insufficient ? 'cell-insuf' : f ? (f.dir === 'better' ? 'cell-better' : 'cell-worse') : '';
        return `<td class="num ${cls}">${g.insufficient ? `<span title="${esc(t('insufficient'))}">${esc(t('insufficient_short'))} <small>(n=${g.n})</small></span>` : `${fmt(g.adjMean)}<small class="muted"> / ${fmt(g.rawMean)}</small>`}</td>`;
      }).join('');
      const fl = r.paradox ? `<span class="chip par" title="${esc(t('paradox_chip_t'))}">${esc(t('paradox_chip'))}</span>` : '';
      return `<tr><td class="td-topic"><a href="#textbooks" data-action="tb-topic" data-id="${esc(topicId)}">${esc(topicName(topicId))}</a> ${fl}</td>${cells}</tr>`;
    }).join('');
    const sel = `<label class="fl inline"><span>${esc(t('tb_topic_sel'))}</span><select data-ui="tbTopic"><option value="all">${esc(t('tb_all_topics'))}</option>${c.topicIds.map((id) => `<option value="${esc(id)}"${id === topicOpt ? ' selected' : ''}>${esc(topicName(id))}</option>`).join('')}</select></label>`;
    return `
      <div class="page-head"><h1>${esc(t('nav_textbooks'))}</h1><p class="muted">${esc(t('tb_sub'))}</p></div>
      <section class="card summary-card"><div class="card-head"><h2>${esc(t('find_title'))}</h2></div>${findingsText(c)}</section>
      <div class="toolbar">${sel}${topicOpt === 'all' && c.overallTopics.length < c.topicIds.length ? `<span class="muted small">${esc(t('overall_topics_note', { n: c.overallTopics.length, total: c.topicIds.length }))}</span>` : ''}</div>
      ${body}
      <section class="card"><div class="card-head"><h2>${esc(t('matrix_title'))}</h2><p class="muted">${esc(t('matrix_sub'))}</p></div>
        <div class="table-wrap"><table class="data matrix" data-testid="tb-matrix"><thead><tr><th>${esc(t('col_topic'))}</th>${tbs.map((tb) => `<th class="num">${tbChip(tb)}</th>`).join('')}</tr></thead><tbody>${matrix}</tbody></table></div>
        <div class="legend-row"><span class="lg-box cell-better"></span>${esc(t('lg_better'))}<span class="lg-box cell-worse"></span>${esc(t('lg_worse'))}<span class="lg-box cell-insuf"></span>${esc(t('insufficient'))}</div>
      </section>
      ${details('how_tb', t('how_tb_text', { minN: MIN_N }))}`;
  }

  // --- часы ---
  function reasonText(r) {
    const p = { status: t('status_' + r.status), m: pct(r.mastery), m2: pct(r.masteryAfter), slope: fmt(r.slope, 1), ch: r.change, abs: Math.abs(r.change), shift: fmt(Math.abs(r.expectedShift), 1), max: r.maxH - r.planned, min: r.minH };
    switch (r.code) {
      case 'add': return t('why_add', p);
      case 'add_cap': return t('why_add', p) + ' ' + t('why_cap', p);
      case 'take': return t(Math.abs(r.expectedShift) < 0.05 ? 'why_take0' : 'why_take', p);
      case 'take_min': return t(Math.abs(r.expectedShift) < 0.05 ? 'why_take0' : 'why_take', p) + ' ' + t(r.minH > Math.ceil(r.planned * 0.7 - 1e-9) ? 'why_min_obs' : 'why_min', p);
      case 'keep_nodata': return t('why_nodata');
      case 'keep_nodonor': return t('why_nodonor');
      case 'keep_noeffect': return t('why_noeffect');
      default: return t('why_keep');
    }
  }
  function viewHours() {
    const c = compute();
    if (!c.rows.length) return emptyState();
    const total = c.S.totalHours;
    const sumRec = c.rec.reduce((s, r) => s + r.recommended, 0);
    const sumPlan = c.rec.reduce((s, r) => s + r.planned, 0);
    const moved = c.rec.filter((r) => r.change > 0).reduce((s, r) => s + r.change, 0);
    const adds = c.rec.filter((r) => r.change > 0), takes = c.rec.filter((r) => r.change < 0);
    const maxH = Math.max(...c.rec.map((r) => Math.max(r.planned, r.recommended)));
    const rows = c.rec.map((r) => `
      <tr class="${r.change > 0 ? 'row-add' : r.change < 0 ? 'row-take' : ''}">
        <td class="td-topic"><b>${esc(topicName(r.id))}</b><div>${chip(r.status)}</div></td>
        <td class="num">${r.planned}</td>
        <td class="num"><b>${r.recommended}</b></td>
        <td class="num delta ${r.change > 0 ? 'pos' : r.change < 0 ? 'neg' : ''}">${r.change ? fmtS(r.change, 0) : '0'}</td>
        <td class="hbar-cell"><div class="hbar"><span class="hb-plan" style="width:${(r.planned / maxH) * 100}%"></span><span class="hb-rec" style="width:${(r.recommended / maxH) * 100}%"></span></div></td>
        <td class="num">${r.slope === null ? '<span class="muted">—</span>' : fmt(r.slope)}</td>
        <td class="num">${r.change ? `${fmtS(r.expectedShift)}<div class="muted small">${pct(r.mastery)} → ${pct(r.masteryAfter)}</div>` : '—'}</td>
        <td class="why">${esc(reasonText(r))}</td>
      </tr>`).join('');
    const headline = moved ? t('hours_headline', {
      take: takes.map((r) => `${fmtS(r.change, 0)} ${esc(t('h_short'))} «${esc(topicName(r.id))}»`).join(', '),
      add: adds.map((r) => `${fmtS(r.change, 0)} ${esc(t('h_short'))} «${esc(topicName(r.id))}»`).join(', '),
    }) : esc(t('hours_nochange'));
    return `
      <div class="page-head"><h1>${esc(t('nav_hours'))}</h1><p class="muted">${esc(t('hours_sub', { total }))}</p></div>
      <div class="kpis kpis-3">
        <div class="kpi"><div class="kpi-label">${esc(t('hours_total'))}</div><div class="kpi-val" data-testid="hours-sum">${sumPlan} → ${sumRec}</div><div class="kpi-sub">${sumPlan === sumRec ? '✓ ' + esc(t('hours_total_ok')) : '✗'}</div></div>
        <div class="kpi"><div class="kpi-label">${esc(t('hours_moved'))}</div><div class="kpi-val">${moved} ${esc(t('h_short'))}</div><div class="kpi-sub">${esc(t('hours_moved_sub', { p: fmt((moved / total) * 100, 0) }))}</div></div>
        <div class="kpi"><div class="kpi-label">${esc(t('hours_min'))}</div><div class="kpi-val">70%</div><div class="kpi-sub">${esc(t('hours_min_sub'))}</div></div>
      </div>
      ${note('info', headline)}
      <section class="card">
        <div class="card-head row-between"><div><h2>${esc(t('rec_title'))}</h2><p class="muted">${esc(t('rec_sub'))}</p></div><button class="btn btn-small" data-action="export-rec">${esc(t('export_csv'))}</button></div>
        <div class="table-wrap"><table class="data hours" data-testid="hours-table"><thead><tr>
          <th>${esc(t('col_topic'))}</th><th class="num">${esc(t('col_plan'))}</th><th class="num">${esc(t('col_rec'))}</th><th class="num">Δ</th><th class="hbar-cell"><span class="lg lg-plan"></span>${esc(t('col_plan'))} <span class="lg lg-rec"></span>${esc(t('col_rec'))}</th>
          <th class="num" title="${esc(t('col_slope_t'))}">${esc(t('col_slope'))}</th><th class="num">${esc(t('col_effect'))}</th><th>${esc(t('col_why'))}</th>
        </tr></thead><tbody>${rows}</tbody>
        <tfoot><tr><td>${esc(t('total'))}</td><td class="num">${sumPlan}</td><td class="num"><b>${sumRec}</b></td><td class="num">${fmtS(sumRec - sumPlan, 0)}</td><td colspan="4"></td></tr></tfoot></table></div>
      </section>
      ${viewWhatIf(c)}
      ${details('how_hours', t('how_hours_text') + slopeTable(c))}`;
  }
  function slopeTable(c) {
    return `<div class="table-wrap"><table class="data compact"><thead><tr><th>${esc(t('col_topic'))}</th><th class="num">${esc(t('col_slope'))}</th><th class="num">95% CI</th><th class="num">${esc(t('col_dev_schools'))}</th><th class="num">${esc(t('col_range'))}</th></tr></thead><tbody>${c.rec.map((r) => {
      const h = r.he;
      return `<tr><td>${esc(topicName(r.id))}</td><td class="num">${h.slope === null ? '—' : fmt(h.slope, 2)}</td><td class="num">${h.slope === null ? '—' : `[${fmt(h.slope - 1.96 * h.se, 2)}; ${fmt(h.slope + 1.96 * h.se, 2)}]`}</td><td class="num">${h.nSchoolsDeviating}</td><td class="num">${fmtS(h.minDelta, 0)}…${fmtS(h.maxDelta, 0)}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  }
  function whatIfKey() { return cache.key; }
  function viewWhatIf(c) {
    if (state.whatIfKey !== whatIfKey() || !state.whatIf) { state.whatIf = Object.fromEntries(c.rec.map((r) => [r.id, r.recommended])); state.whatIfKey = whatIfKey(); }
    const sliders = c.rec.map((r) => {
      const lo = Math.max(1, Math.floor(r.planned * 0.5)), hi = Math.ceil(r.planned * 1.8);
      return `<div class="wi-row" data-id="${esc(r.id)}">
        <label for="wi-${esc(r.id)}" class="wi-label">${esc(topicName(r.id))}</label>
        <input type="range" id="wi-${esc(r.id)}" data-wi="${esc(r.id)}" min="${lo}" max="${hi}" step="1" value="${state.whatIf[r.id]}">
        <span class="wi-h"><b data-wi-h="${esc(r.id)}">${state.whatIf[r.id]}</b> ${esc(t('h_short'))}</span>
        <span class="wi-eff" data-wi-eff="${esc(r.id)}"></span>
      </div>`;
    }).join('');
    return `<section class="card" id="whatif">
      <div class="card-head row-between"><div><h2>${esc(t('wi_title'))}</h2><p class="muted">${esc(t('wi_sub'))}</p></div>
        <div class="btn-row"><button class="btn btn-small" data-action="wi-rec">${esc(t('wi_take_rec'))}</button><button class="btn btn-small btn-ghost" data-action="wi-plan">${esc(t('wi_reset_plan'))}</button></div></div>
      <div class="wi-summary" id="wi-summary"></div>
      <div class="wi-grid">${sliders}</div>
      ${note('info', esc(t('wi_disclaimer')))}
    </section>`;
  }
  function updateWhatIf() {
    const box = $('#whatif'); if (!box) return;
    const c = compute();
    let sum = 0, wBefore = 0, wAfter = 0, n = 0, critBefore = 0, critAfter = 0, outOfRange = 0;
    for (const r of c.rec) {
      const h = state.whatIf[r.id]; sum += h;
      const delta = h - r.planned;
      const shift = r.slope === null ? 0 : A.hoursShift(r.slope, delta, r.he.maxDelta);
      const scores = c.rows.filter((x) => x.topic_id === r.id).map((x) => x.post);
      const before = A.masteryRate(scores, c.thr), after = A.masteryRate(scores.map((x) => Math.min(100, x + shift)), c.thr);
      if (scores.length) { wBefore += before * scores.length; wAfter += after * scores.length; n += scores.length; }
      if (before < 0.5) critBefore++; if (after < 0.5) critAfter++;
      const oor = r.slope !== null && (delta > r.he.maxDelta || delta < r.he.minDelta);
      if (oor && delta !== 0) outOfRange++;
      const el = box.querySelector(`[data-wi-eff="${r.id}"]`);
      const hEl = box.querySelector(`[data-wi-h="${r.id}"]`);
      if (hEl) hEl.textContent = h;
      if (el) el.innerHTML = delta === 0 ? `<span class="muted">${esc(t('wi_plan'))} · ${pct(before)}</span>` : r.slope === null ? `<span class="muted">${esc(t('wi_nodata'))}</span>` : `<span class="${shift >= 0 ? 'pos' : 'neg'}">${fmtS(shift)} ${esc(t('pts'))}</span> · ${pct(before)} → <b>${pct(after)}</b>${oor && delta !== 0 ? ` <span class="warn-inline" title="${esc(t('wi_oor_t'))}">${esc(t('wi_oor'))}</span>` : ''}`;
    }
    const total = c.S.totalHours;
    const ok = sum === total;
    $('#wi-summary').innerHTML = `
      <div class="wi-kpi ${ok ? 'ok' : 'bad'}"><span>${esc(t('wi_sum'))}</span><b>${sum} / ${total} ${esc(t('h_short'))}</b><small>${ok ? '✓ ' + esc(t('wi_sum_ok')) : esc(t('wi_sum_bad', { d: fmtS(sum - total, 0) }))}</small></div>
      <div class="wi-kpi"><span>${esc(t('wi_mastery'))}</span><b>${pct(wBefore / n)} → ${pct(wAfter / n)}</b><small>${fmtS((wAfter - wBefore) / n * 100)} ${esc(t('pp'))}</small></div>
      <div class="wi-kpi"><span>${esc(t('wi_crit'))}</span><b>${critBefore} → ${critAfter}</b><small>${esc(t('wi_crit_sub'))}</small></div>`;
  }

  // --- карточка школы ---
  function viewSchool() {
    const c = compute();
    const all = c.subjRows;
    const schoolIds = [...new Set(all.map((r) => r.school_id))];
    if (!schoolIds.length) return emptyState();
    if (!schoolIds.includes(state.schoolId)) state.schoolId = state.f.school !== 'all' && schoolIds.includes(state.f.school) ? state.f.school : schoolIds[0];
    const sid = state.schoolId;
    const sRows = all.filter((r) => r.school_id === sid);
    const dist = sRows[0].district;
    const dRows = all.filter((r) => r.district === dist);
    const thr = c.thr;
    const nStud = new Set(sRows.map((r) => r.student_id)).size;
    const mr = (rs) => A.masteryRate(rs.map((r) => r.post), thr);
    const rows = c.S.topics.map((tp) => {
      const s = sRows.filter((r) => r.topic_id === tp.id), d = dRows.filter((r) => r.topic_id === tp.id), o = all.filter((r) => r.topic_id === tp.id);
      if (!s.length) return null;
      const ms = mr(s), md = mr(d), mo = mr(o);
      return { tp, ms, md, mo, diff: ms - mo, n: s.length, hours: s[0].actual_hours, planned: tp.planned };
    }).filter(Boolean);
    const weakest = rows.filter((r) => r.diff < -0.1).sort((a, b) => a.diff - b.diff).slice(0, 3);
    const opts = schoolIds.map((id) => `<option value="${esc(id)}"${id === sid ? ' selected' : ''}>${esc(schoolName(id))}</option>`).join('');
    const tr = rows.map((r) => `<tr><td class="td-topic">${esc(L(r.tp.name))}${r.n < MIN_N ? `<span class="warn-inline">${esc(t('small_n', { n: r.n }))}</span>` : ''}</td>
      <td class="num"><b>${pct(r.ms)}</b></td><td class="num">${pct(r.md)}</td><td class="num">${pct(r.mo)}</td>
      <td class="num delta ${r.diff > 0.05 ? 'pos' : r.diff < -0.05 ? 'neg' : ''}">${fmtS(r.diff * 100, 0)} ${esc(t('pp'))}</td>
      <td class="num">${r.hours}${r.hours !== r.planned ? ` <small class="muted">(${esc(t('col_plan'))} ${r.planned})</small>` : ''}</td></tr>`).join('');
    return `
      <div class="page-head"><h1>${esc(t('nav_school'))}</h1><p class="muted">${esc(t('school_sub'))}</p></div>
      <div class="toolbar"><label class="fl inline"><span>${esc(t('f_school'))}</span><select data-ui="schoolId">${opts}</select></label></div>
      <div class="kpis kpis-4">
        <div class="kpi"><div class="kpi-label">${esc(t('f_district'))}</div><div class="kpi-val kpi-text">${esc(districtName(dist))}</div></div>
        <div class="kpi"><div class="kpi-label">${esc(t('f_textbook'))}</div><div class="kpi-val kpi-text">${tbChip(sRows[0].textbook)}</div></div>
        <div class="kpi"><div class="kpi-label">${esc(t('kpi_students'))}</div><div class="kpi-val">${nStud}</div>${nStud < MIN_N ? `<div class="kpi-sub warn-inline">${esc(t('school_small'))}</div>` : ''}</div>
        <div class="kpi"><div class="kpi-label">${esc(t('kpi_mastery'))}</div><div class="kpi-val">${pct(mr(sRows))}</div><div class="kpi-sub">${esc(t('school_vs', { d: pct(mr(dRows)), o: pct(mr(all)) }))}</div></div>
      </div>
      ${weakest.length ? note('warn', t('school_weak', { list: weakest.map((r) => `«${esc(L(r.tp.name))}» (${fmtS(r.diff * 100, 0)} ${esc(t('pp'))})`).join(', ') })) : note('ok', esc(t('school_ok')))}
      <section class="card"><div class="table-wrap"><table class="data"><thead><tr><th>${esc(t('col_topic'))}</th><th class="num">${esc(t('col_school'))}</th><th class="num">${esc(t('col_district'))}</th><th class="num">${esc(t('col_region'))}</th><th class="num">${esc(t('col_vs_region'))}</th><th class="num">${esc(t('col_hours_fact'))}</th></tr></thead><tbody>${tr}</tbody></table></div></section>`;
  }

  // --- отчёт ---
  function viewReport() {
    const c = compute();
    if (!c.rows.length) return emptyState();
    const date = new Intl.DateTimeFormat(state.lang === 'kz' ? 'kk-KZ' : 'ru-RU', { dateStyle: 'long' }).format(new Date());
    const f = state.f;
    const filt = [L(c.S.name), f.district === 'all' ? t('f_all_districts') : districtName(f.district), f.school === 'all' ? t('f_all_schools') : schoolName(f.school), f.textbook === 'all' ? t('f_all_textbooks') : tbName(f.textbook)].join(' · ');
    const crit = c.statsArr.filter((s) => s.status === 'critical'), risk = c.statsArr.filter((s) => s.status === 'risk'), mast = c.statsArr.filter((s) => s.status === 'mastered');
    const lst = (arr) => arr.map((s) => `«${esc(topicName(s.topic_id))}» (${pct(s.mastery)})`).join(', ') || '—';
    const badItems = c.topicIds.flatMap((id) => (c.itemRes[id] || []).filter((x) => x.flag).map((x) => `<li><b>${esc(x.item_id)}</b> (${esc(topicName(id))}): ${esc(t('flag_' + x.flag))}, p = ${fmt(x.p, 2)}, r = ${fmt(x.rpb, 2)}</li>`));
    const ch = c.rec.filter((r) => r.change !== 0);
    const res = c.overall;
    return `<article class="report" data-testid="report">
      <div class="report-actions no-print"><button class="btn btn-primary" data-action="print">${esc(t('print_pdf'))}</button><span class="muted small">${esc(t('print_hint'))}</span></div>
      <div id="print-embed" class="note note-info no-print" hidden>${esc(t('embed_print'))}</div>
      <header class="report-head">
        <div class="report-brand">${logoSvg(28)}<span>BilimLens</span></div>
        <h1>${esc(t('report_title'))}</h1>
        <p>${esc(filt)}</p>
        <p class="muted">${esc(t('report_meta', { date, thr: c.thr, students: c.students.size, ds: L(state.ds.name) }))}</p>
      </header>
      ${state.ds.source === 'demo' ? `<p class="report-demo">${esc(t('demo_note'))}</p>` : ''}
      <section><h2>1. ${esc(t('rep_s1'))}</h2>
        <p>${t('rep_s1_text', { m: pct(c.masteryAll), n: c.statsArr.length, crit: crit.length, risk: risk.length, mast: mast.length })}</p>
        <div class="table-wrap"><table class="data compact"><thead><tr><th>${esc(t('col_topic'))}</th><th>${esc(t('col_status'))}</th><th class="num">${esc(t('col_mean'))}</th><th class="num">${esc(t('col_mastery', { thr: c.thr }))}</th><th class="num">${esc(t('col_gain'))}</th></tr></thead>
        <tbody>${c.statsArr.map((s) => `<tr><td>${esc(topicName(s.topic_id))}</td><td>${chip(s.status)}</td><td class="num">${fmt(s.mean)}</td><td class="num">${pct(s.mastery)}</td><td class="num">${fmtS(s.gain)}</td></tr>`).join('')}</tbody></table></div></section>
      <section><h2>2. ${esc(t('rep_s2'))}</h2>
        <p><b>${esc(t('status_critical'))}:</b> ${lst(crit)}.<br><b>${esc(t('status_risk'))}:</b> ${lst(risk)}.</p>
        ${badItems.length ? `<p>${esc(t('rep_items'))}</p><ul>${badItems.join('')}</ul>` : `<p class="muted">${esc(t('items_none'))}</p>`}</section>
      <section><h2>3. ${esc(t('rep_s3'))}</h2>
        ${res.paradox ? `<p class="report-par"><b>${t('paradox_title', { raw: esc(tbName(res.rawLeader)), adj: esc(tbName(res.adjLeader)) })}.</b> ${t('paradox_text', { raw: esc(tbName(res.rawLeader)), adj: esc(tbName(res.adjLeader)), preRaw: fmt(res.groups.find((g) => g.tb === res.rawLeader).preMean), preAdj: fmt(res.groups.find((g) => g.tb === res.adjLeader).preMean) })}</p>` : ''}
        <div class="table-wrap"><table class="data compact"><thead><tr><th>${esc(t('f_textbook'))}</th><th class="num">n</th><th class="num">${esc(t('tb_pre'))}</th><th class="num">${esc(t('tb_raw'))}</th><th class="num">${esc(t('tb_adj'))}</th></tr></thead>
        <tbody>${res.groups.map((g) => `<tr><td>${esc(tbName(g.tb))}</td><td class="num">${g.n}</td><td class="num">${fmt(g.preMean)}</td><td class="num">${fmt(g.rawMean)}</td><td class="num">${g.insufficient ? esc(t('insufficient_short')) : fmt(g.adjMean)}</td></tr>`).join('')}</tbody></table></div>
        ${findingsText(c)}</section>
      <section><h2>4. ${esc(t('rep_s4'))}</h2>
        <p>${t('rep_s4_text', { total: c.S.totalHours, moved: ch.filter((r) => r.change > 0).reduce((s, r) => s + r.change, 0) })}</p>
        ${ch.length ? `<div class="table-wrap"><table class="data compact"><thead><tr><th>${esc(t('col_topic'))}</th><th class="num">${esc(t('col_plan'))}</th><th class="num">${esc(t('col_rec'))}</th><th class="num">Δ</th><th>${esc(t('col_why'))}</th></tr></thead>
        <tbody>${ch.map((r) => `<tr><td>${esc(topicName(r.id))}</td><td class="num">${r.planned}</td><td class="num">${r.recommended}</td><td class="num">${fmtS(r.change, 0)}</td><td class="small">${esc(reasonText(r))}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td>${esc(t('total'))}</td><td class="num">${c.rec.reduce((s, r) => s + r.planned, 0)}</td><td class="num">${c.rec.reduce((s, r) => s + r.recommended, 0)}</td><td class="num">0</td><td></td></tr></tfoot></table></div>` : `<p>${esc(t('hours_nochange'))}</p>`}</section>
      <section class="report-method"><h2>${esc(t('rep_method'))}</h2><p class="small">${t('rep_method_text', { minN: MIN_N })}</p></section>
    </article>`;
  }

  // --- данные ---
  function viewData() {
    const rep = state.importReport;
    let repHtml = '';
    if (rep) {
      if (rep.fatal) repHtml = note('warn', esc(t('imp_fatal', { msg: rep.fatal })));
      else if (rep.missing && rep.missing.length) repHtml = note('warn', t('imp_missing', { cols: rep.missing.map((x) => `<code>${esc(x)}</code>`).join(', ') }));
      else {
        const errRows = rep.errors.slice(0, 50).map((e) => `<tr><td class="num">${e.line}</td><td><code>${esc(e.field)}</code></td><td>${esc(t('err_' + e.code))}</td><td>${esc(e.value)}</td></tr>`).join('');
        repHtml = `${rep.applied ? note('ok', t('imp_applied', { n: fmt(rep.valid, 0), file: esc(rep.fileName) })) : ''}
          ${rep.errors.length ? note('warn', t('imp_errors', { total: fmt(rep.total, 0), valid: fmt(rep.valid, 0), bad: fmt(rep.total - rep.valid, 0) })) : ''}
          ${rep.errors.length ? `<div class="table-wrap"><table class="data compact" data-testid="import-errors"><thead><tr><th class="num">${esc(t('col_line'))}</th><th>${esc(t('col_field'))}</th><th>${esc(t('col_problem'))}</th><th>${esc(t('col_value'))}</th></tr></thead><tbody>${errRows}</tbody></table></div>
          ${rep.errors.length > 50 ? `<p class="muted small">${esc(t('imp_more', { n: rep.errors.length - 50 }))}</p>` : ''}
          ${!rep.applied && rep.valid > 0 ? `<button class="btn btn-primary" data-action="apply-import">${esc(t('imp_apply_valid', { n: fmt(rep.valid, 0) }))}</button>` : ''}` : ''}
          ${rep.itemsApplied ? note('ok', esc(t('imp_items_ok', { n: fmt(rep.itemsApplied, 0) }))) : ''}`;
      }
    }
    const cols = ['subject', 'school_id', 'school_name', 'district', 'class_id', 'textbook', 'student_id', 'topic_id', 'topic_name', 'planned_hours', 'actual_hours', 'pre_score', 'post_score'];
    return `
      <div class="page-head"><h1>${esc(t('nav_data'))}</h1><p class="muted">${esc(t('data_sub'))}</p></div>
      <div class="current-ds">${esc(t('ds_current'))}: <b>${esc(L(state.ds.name))}</b> · ${fmt(state.ds.rows.length, 0)} ${esc(t('ds_rows'))}
        ${state.ds.source !== 'demo' ? `<button class="btn btn-small" data-action="reset-demo">${esc(t('reset_demo'))}</button>` : `<button class="btn btn-small btn-ghost" data-action="reset-demo">${esc(t('reset_demo'))}</button>`}</div>
      <div class="grid-2">
        <section class="card">
          <h2>${esc(t('up_results'))}</h2>
          <label class="drop" for="file-results"><span class="drop-ic">⇪</span><b>${esc(t('up_choose'))}</b><span class="muted small">${esc(t('up_formats'))}</span>
            <input type="file" id="file-results" accept=".csv,.txt,.xlsx,.xls" data-upload="results"></label>
          <div class="btn-row"><button class="btn btn-small" data-action="download-template">${esc(t('dl_template'))}</button><button class="btn btn-small btn-ghost" data-action="download-sample">${esc(t('dl_sample'))}</button></div>
          <h3>${esc(t('up_items'))}</h3>
          <label class="drop drop-small" for="file-items"><b>${esc(t('up_choose'))}</b><span class="muted small">student_id, topic_id, item_id, correct (0/1)</span>
            <input type="file" id="file-items" accept=".csv,.txt" data-upload="items"></label>
          <div id="import-report">${repHtml}</div>
        </section>
        <section class="card">
          <h2>${esc(t('fmt_title'))}</h2>
          <p class="small">${esc(t('fmt_text'))}</p>
          <div class="table-wrap"><table class="data compact"><thead><tr><th>${esc(t('fmt_col'))}</th><th>${esc(t('fmt_desc'))}</th></tr></thead>
          <tbody>${cols.map((cname) => `<tr><td><code>${cname}</code>${A.REQUIRED.includes(cname) ? ' *' : ''}</td><td>${esc(t('fmt_' + cname))}</td></tr>`).join('')}</tbody></table></div>
          <p class="muted small">${esc(t('fmt_req'))}</p>
          <h3>${esc(t('privacy_title'))}</h3><p class="small">${esc(t('privacy_text'))}</p>
        </section>
      </div>`;
  }

  // ---------- импорт ----------
  function readFile(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      const isX = /\.xlsx?$/i.test(file.name);
      fr.onerror = () => reject(new Error('read'));
      fr.onload = () => {
        try {
          if (isX) {
            if (!window.XLSX) return reject(new Error(t('xlsx_missing')));
            const wb = window.XLSX.read(new Uint8Array(fr.result), { type: 'array' });
            resolve(window.XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]));
          } else resolve(fr.result);
        } catch (e) { reject(e); }
      };
      if (isX) fr.readAsArrayBuffer(file); else fr.readAsText(file, 'utf-8');
    });
  }
  async function handleUpload(kind, file) {
    try {
      const text = await readFile(file);
      const parsed = A.parseCSV(text);
      if (kind === 'results') {
        const v = A.validateResults(parsed);
        state.pendingImport = { rows: v.rows, fileName: file.name };
        state.importReport = { fileName: file.name, total: v.total, valid: v.rows.length, errors: v.errors, missing: v.missingColumns, applied: false };
        if (!v.missingColumns.length && !v.errors.length && v.rows.length) applyImport();
      } else {
        const v = A.validateItems(parsed);
        state.importReport = state.importReport || { fileName: file.name, total: 0, valid: 0, errors: [], missing: [] };
        if (v.missingColumns.length) state.importReport = { ...state.importReport, missing: v.missingColumns, applied: false };
        else {
          state.ds.items = v.rows; cache.key = null;
          state.importReport = { ...state.importReport, itemsApplied: v.rows.length, errors: v.errors, total: v.total, valid: v.rows.length, missing: [], applied: true, fileName: file.name };
          persist();
        }
      }
    } catch (e) {
      state.importReport = { fatal: e.message || String(e) };
    }
    render();
  }
  function applyImport() {
    const p = state.pendingImport; if (!p || !p.rows.length) return;
    setDataset(buildUploaded(p.rows, [], p.fileName));
    persist();
    state.importReport = { ...state.importReport, applied: true };
    state.pendingImport = null;
  }
  function persist() {
    if (state.ds.source !== 'upload') return;
    const ok = LS.set('bl_dataset', JSON.stringify({ rows: state.ds.rows, items: state.ds.items, fileName: state.ds.fileName }));
    if (!ok) LS.del('bl_dataset');
  }
  function download(name, text) {
    if (window.BL_EMBED) { showTextFallback(name, text); return; }
    const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  // Во встроенном просмотре (артефакт) загрузки файлов заблокированы — показываем текст для копирования.
  function showTextFallback(name, text) {
    let box = document.getElementById('dl-fallback');
    if (!box) { box = document.createElement('section'); box.id = 'dl-fallback'; box.className = 'card'; $('#view').prepend(box); }
    const short = text.length > 20000 ? text.slice(0, 20000) + '\n…' : text;
    box.innerHTML = `<div class="row-between"><h2>${esc(name)}</h2><button class="btn btn-small" id="dl-copy">${esc(t('copy'))}</button></div><p class="muted small">${esc(t('embed_dl'))}</p><textarea id="dl-text" readonly rows="8" style="width:100%;font:12px ui-monospace,monospace">${esc(short)}</textarea>`;
    $('#dl-copy').onclick = () => { const ta = $('#dl-text'); (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => { $('#dl-copy').textContent = t('copied'); }).catch(() => { ta.select(); }); };
    box.scrollIntoView({ behavior: 'smooth' });
  }
  const csvEsc = (v) => { const s = String(v); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  function templateCsv(sample = false) {
    const H = ['subject', 'school_id', 'school_name', 'district', 'class_id', 'textbook', 'student_id', 'topic_id', 'topic_name', 'planned_hours', 'actual_hours', 'pre_score', 'post_score'];
    const D = buildDemo();
    const src = sample ? D.rows.filter((r) => r.school_id === 'S07' || r.school_id === 'S02') : D.rows.slice(0, 3);
    const subjN = Object.fromEntries(D.subjects.map((s) => [s.id, s.name.ru]));
    const topN = {}; D.subjects.forEach((s) => s.topics.forEach((x) => (topN[x.id] = x.name.ru)));
    const lines = src.map((r) => [subjN[r.subject], r.school_id, D.schools.get(r.school_id).name.ru, D.districts.get(r.district).name.ru, r.class_id, { A: 'Учебник А', B: 'Учебник Б', C: 'Учебник В' }[r.textbook], r.student_id, r.topic_id, topN[r.topic_id], r.planned_hours, r.actual_hours, r.pre, r.post].map(csvEsc).join(','));
    return [H.join(','), ...lines].join('\n') + '\n';
  }

  // ---------- каркас ----------
  function logoSvg(size = 30) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true"><circle cx="14" cy="14" r="11" fill="none" stroke="currentColor" stroke-width="2.6"/><rect x="8.5" y="14" width="3" height="5" rx="1" fill="#E39B2D"/><rect x="12.5" y="10" width="3" height="9" rx="1" fill="currentColor"/><rect x="16.5" y="12" width="3" height="7" rx="1" fill="currentColor" opacity=".6"/><path d="M22.5 22.5 29 29" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`;
  }
  function renderChrome() {
    document.documentElement.lang = state.lang === 'kz' ? 'kk' : 'ru';
    document.title = 'BilimLens — ' + t('tagline');
    const nav = [['home', 'nav_home'], ['overview', 'nav_overview'], ['topics', 'nav_topics'], ['textbooks', 'nav_textbooks'], ['hours', 'nav_hours'], ['school', 'nav_school'], ['report', 'nav_report'], ['data', 'nav_data']];
    $('#nav').innerHTML = nav.map(([r, k]) => `<a href="#${r}" class="${state.route === r ? 'active' : ''}"${state.route === r ? ' aria-current="page"' : ''} data-testid="nav-${r}">${esc(t(k))}</a>`).join('');
    $('#brand-tag').textContent = t('tagline');
    document.documentElement.dataset.theme = state.theme;
    $('#lang').innerHTML = `<button class="theme-btn" data-action="theme" data-testid="theme" title="${esc(t('theme_toggle'))}" aria-label="${esc(t('theme_toggle'))}">${state.theme === 'dark' ? '☀' : '☾'}</button>` + ['ru', 'kz'].map((l) => `<button data-action="lang" data-lang="${l}" class="${state.lang === l ? 'active' : ''}" aria-pressed="${state.lang === l}" data-testid="lang-${l}">${l === 'ru' ? 'RU' : 'ҚАЗ'}</button>`).join('');
    $('#demo-banner').innerHTML = state.ds.source === 'demo' ? `<span class="dot"></span>${esc(t('demo_note'))}` : `<span class="dot dot-up"></span>${esc(t('ds_current'))}: <b>${esc(L(state.ds.name))}</b> · <a href="#data">${esc(t('nav_data'))}</a>`;
    $('#footer').innerHTML = `<div>${logoSvg(20)} <b>BilimLens</b> · ${esc(t('footer'))}</div><div class="muted">${esc(t('footer_hack'))} · <a href="https://github.com/Kylyshbay/bilimlens" target="_blank" rel="noopener">GitHub</a> · <a href="presentation/presentation.pdf" target="_blank" rel="noopener">${esc(t('footer_deck'))}</a></div>`;
  }
  function render() {
    renderChrome();
    renderFilters();
    const views = { home: viewHome, overview: viewOverview, topics: viewTopics, textbooks: viewTextbooks, hours: viewHours, school: viewSchool, report: viewReport, data: viewData };
    let html;
    try { html = views[state.route](); } catch (e) { console.error(e); html = note('warn', esc(t('render_error')) + ' <code>' + esc(e.message) + '</code>'); }
    const v = $('#view');
    v.innerHTML = html;
    v.className = 'view view-' + state.route;
    if (state.route === 'hours') updateWhatIf();
  }
  function renderViewOnly() {
    const v = $('#view'); const y = window.scrollY;
    const views = { home: viewHome, overview: viewOverview, topics: viewTopics, textbooks: viewTextbooks, hours: viewHours, school: viewSchool, report: viewReport, data: viewData };
    v.innerHTML = views[state.route]();
    if (state.route === 'hours') updateWhatIf();
    window.scrollTo(0, y);
  }

  // ---------- события ----------
  function onRoute() {
    const r = (location.hash || '#home').slice(1);
    state.route = ROUTES.includes(r) ? r : 'home';
    render();
    window.scrollTo(0, 0);
  }
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    if (a === 'lang') { state.lang = el.dataset.lang; LS.set('bl_lang', state.lang); render(); }
    else if (a === 'theme') { state.theme = state.theme === 'dark' ? 'light' : 'dark'; LS.set('bl_theme', state.theme); render(); }
    else if (a === 'print') { if (window.BL_EMBED) { const n = $('#print-embed'); if (n) n.hidden = false; } else window.print(); }
    else if (a === 'reset-demo') { LS.del('bl_dataset'); setDataset(buildDemo()); state.importReport = null; render(); }
    else if (a === 'reset-filters') { state.f = { ...state.f, district: 'all', school: 'all', textbook: 'all' }; render(); }
    else if (a === 'download-template') download('bilimlens_template.csv', templateCsv(false));
    else if (a === 'download-sample') download('bilimlens_sample_2_schools.csv', templateCsv(true));
    else if (a === 'apply-import') { applyImport(); render(); }
    else if (a === 'item-topic') { e.preventDefault(); state.itemTopic = el.dataset.id; renderViewOnly(); }
    else if (a === 'tb-topic') { e.preventDefault(); state.tbTopic = el.dataset.id; renderViewOnly(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    else if (a === 'goto-school') { state.schoolId = el.dataset.id; }
    else if (a === 'wi-rec') { const c = compute(); state.whatIf = Object.fromEntries(c.rec.map((r) => [r.id, r.recommended])); syncSliders(); updateWhatIf(); }
    else if (a === 'wi-plan') { const c = compute(); state.whatIf = Object.fromEntries(c.rec.map((r) => [r.id, r.planned])); syncSliders(); updateWhatIf(); }
    else if (a === 'export-rec') {
      const c = compute();
      const H = ['topic_id', 'topic_name', 'status', 'planned_hours', 'recommended_hours', 'change', 'slope_points_per_hour', 'expected_shift_points', 'mastery_now', 'mastery_expected', 'reason'];
      const lines = c.rec.map((r) => [r.id, topicName(r.id), t('status_' + r.status), r.planned, r.recommended, r.change, r.slope === null ? '' : r.slope.toFixed(2), r.expectedShift.toFixed(1), (r.mastery * 100).toFixed(0) + '%', (r.masteryAfter * 100).toFixed(0) + '%', reasonText(r)].map(csvEsc).join(','));
      download('bilimlens_hours_recommendation.csv', [H.join(','), ...lines].join('\n') + '\n');
    }
  });
  function syncSliders() { document.querySelectorAll('[data-wi]').forEach((s) => { s.value = state.whatIf[s.dataset.wi]; }); }
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.filter) {
      state.f[el.dataset.filter] = el.value;
      if (el.dataset.filter === 'subject') { state.f.district = 'all'; state.f.school = 'all'; state.f.textbook = 'all'; state.tbTopic = 'all'; state.itemTopic = null; }
      if (el.dataset.filter === 'district') state.f.school = 'all';
      render();
    } else if (el.dataset.ui) { state[el.dataset.ui] = el.value; renderViewOnly(); }
    else if (el.dataset.upload && el.files && el.files[0]) handleUpload(el.dataset.upload, el.files[0]);
    else if (el.id === 'thr') { state.threshold = +el.value; renderViewOnly(); }
  });
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.id === 'thr') { $('#thr-val').textContent = el.value; }
    else if (el.dataset.wi) { state.whatIf[el.dataset.wi] = +el.value; updateWhatIf(); }
  });
  window.addEventListener('hashchange', onRoute);

  // ---------- старт ----------
  setDataset(loadInitialDataset());
  window.BilimLens = { state, compute, t, setLang: (l) => { state.lang = l; render(); } };
  onRoute();
})();
