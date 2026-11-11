import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const A = require('../assets/js/analytics.js');

// детерминированный RNG для синтетических тестовых выборок
function rng(seed) { return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }
function randn(r) { const u = r() || 1e-9, v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

test('masteryRate: доля учеников не ниже порога', () => {
  assert.equal(A.masteryRate([40, 60, 61, 90], 60), 0.75);
  assert.equal(A.masteryRate([10, 20], 60), 0);
  assert.ok(Number.isNaN(A.masteryRate([], 60)));
});

test('базовая статистика: mean, median, sd, quantile', () => {
  assert.equal(A.mean([1, 2, 3, 4]), 2.5);
  assert.equal(A.median([5, 1, 3]), 3);
  assert.ok(Math.abs(A.sd([2, 4, 4, 4, 5, 5, 7, 9]) - 2.138) < 1e-3);
  assert.equal(A.quantile([0, 10], 0.25), 2.5);
});

test('topicStats: средний балл, усвоение и прирост по теме', () => {
  const rows = [
    { topic_id: 'T1', pre: 40, post: 70 }, { topic_id: 'T1', pre: 50, post: 50 },
    { topic_id: 'T2', pre: 30, post: 30 },
  ];
  const [t1, t2] = A.topicStats(rows, ['T1', 'T2'], 60);
  assert.equal(t1.n, 2); assert.equal(t1.mean, 60); assert.equal(t1.mastery, 0.5); assert.equal(t1.gain, 15);
  assert.equal(t2.mastery, 0);
});

test('classifyTopics: прозрачное правило критическая / риск / норма / освоена', () => {
  const s = [
    { topic_id: 'a', mean: 40, mastery: 0.3 }, // ниже медианы и < 50% → критическая
    { topic_id: 'b', mean: 62, mastery: 0.6 }, // < 65% → риск
    { topic_id: 'c', mean: 70, mastery: 0.75 }, // норма
    { topic_id: 'd', mean: 85, mastery: 0.9 }, // освоена
    { topic_id: 'e', mean: 90, mastery: 0.45 }, // < 50%, но выше медианы → риск, а не критическая
  ];
  const st = Object.fromEntries(A.classifyTopics(s).map((x) => [x.topic_id, x.status]));
  assert.deepEqual(st, { a: 'critical', b: 'risk', c: 'norm', d: 'mastered', e: 'risk' });
});

test('ols: восстанавливает коэффициенты линейной модели', () => {
  const X = [], y = [];
  for (let i = 0; i < 50; i++) { const x = i; X.push([1, x]); y.push(3 + 2 * x); }
  const f = A.ols(X, y);
  assert.ok(Math.abs(f.beta[0] - 3) < 1e-6 && Math.abs(f.beta[1] - 2) < 1e-6);
});

// Синтетика «парадокса»: у учебника A выше входной уровень, но истинный эффект B на +5.
function paradoxRows(nPer = 200) {
  const r = rng(42), rows = [];
  for (const [tb, shift, eff] of [['A', 15, 0], ['B', 0, 5]]) {
    for (let i = 0; i < nPer; i++) {
      const pre = 45 + shift + 10 * randn(r);
      rows.push({ student_id: tb + i, textbook: tb, topic_id: 'T', pre, post: 30 + 0.8 * pre + eff + 6 * randn(r) });
    }
  }
  return rows;
}

test('compareTextbooks: поправка на pre-test разворачивает наивный вывод (парадокс)', () => {
  const res = A.compareTextbooks(paradoxRows(), { topicId: 'T' });
  assert.equal(res.rawLeader, 'A');
  assert.equal(res.adjLeader, 'B');
  assert.equal(res.paradox, true);
  const c = A.contrast(res, 'B', 'A');
  assert.ok(Math.abs(c.diff - 5) < 1.5, `diff=${c.diff}`);
  assert.ok(Math.abs(res.slopePre - 0.8) < 0.1);
});

test('compareTextbooks: 95% CI накрывает истинную разницу, Cohen d = diff / pooled SD', () => {
  const res = A.compareTextbooks(paradoxRows(), { topicId: 'T' });
  const c = A.contrast(res, 'B', 'A');
  assert.ok(c.ci[0] < 5 && c.ci[1] > 5);
  assert.ok(c.ci[0] > 0, 'разница значима');
  assert.ok(Math.abs(c.d - c.diff / res.pooledSD) < 1e-9);
  assert.equal(c.significant, true);
});

test('compareTextbooks: при n < 30 — «недостаточно данных», вывод не делается', () => {
  const rows = paradoxRows(200).filter((x) => x.textbook === 'A' || +x.student_id.slice(1) < 20);
  const res = A.compareTextbooks(rows, { topicId: 'T' });
  const gB = res.groups.find((g) => g.tb === 'B');
  assert.equal(gB.n, 20); assert.equal(gB.insufficient, true);
  assert.equal(A.contrast(res, 'B', 'A').significant, false);
  assert.equal(res.paradox, false);
});

test('meanCI: интервал симметричен вокруг среднего и сужается с ростом n', () => {
  const r = rng(7);
  const small = Array.from({ length: 20 }, () => 50 + 10 * randn(r));
  const big = Array.from({ length: 2000 }, () => 50 + 10 * randn(r));
  const [l1, h1] = A.meanCI(small), [l2, h2] = A.meanCI(big);
  assert.ok(Math.abs((l1 + h1) / 2 - A.mean(small)) < 1e-9);
  assert.ok(h2 - l2 < h1 - l1);
});

test('hoursEffect: оценивает наклон «баллы за 1 час» по школам с отклонением от плана', () => {
  const r = rng(3), rows = [];
  for (let s = 0; s < 8; s++) {
    const delta = s - 3; // от −3 до +4 часов
    for (let i = 0; i < 30; i++) {
      const pre = 50 + 10 * randn(r);
      rows.push({ school_id: 'S' + s, textbook: s % 2 ? 'A' : 'B', topic_id: 'T', planned_hours: 10, actual_hours: 10 + delta, pre, post: 20 + 0.7 * pre + 2 * delta + 5 * randn(r) });
    }
  }
  const h = A.hoursEffect(rows, 'T');
  assert.ok(Math.abs(h.slope - 2) < 0.5, `slope=${h.slope}`);
  assert.equal(h.maxDelta, 4); assert.equal(h.nSchoolsDeviating, 7);
});

test('recommendHours: сумма часов сохраняется, минимумы и потолки соблюдаются', () => {
  const topics = [
    { id: 'easy1', planned: 10, status: 'mastered', slope: 0.1, maxAdd: 0 },
    { id: 'easy2', planned: 8, status: 'mastered', slope: 0.2, maxAdd: 2 },
    { id: 'mid', planned: 12, status: 'norm', slope: 0.6, maxAdd: 2 },
    { id: 'hard1', planned: 10, status: 'critical', slope: 2.5, maxAdd: 4 },
    { id: 'hard2', planned: 10, status: 'risk', slope: 1.5, maxAdd: 3 },
    { id: 'unknown', planned: 6, status: 'norm', slope: null, maxAdd: 0 },
  ];
  const rec = A.recommendHours(topics, { minShare: 0.7 });
  const total = (k) => rec.reduce((s, r) => s + r[k], 0);
  assert.equal(total('recommended'), total('planned'));
  for (const r of rec) {
    assert.ok(r.recommended >= Math.ceil(r.planned * 0.7), `${r.id} ниже минимума`);
    assert.ok(r.recommended <= r.maxH, `${r.id} выше потолка`);
  }
  const by = Object.fromEntries(rec.map((r) => [r.id, r]));
  assert.ok(by.hard1.change > 0 && by.easy1.change < 0);
  assert.equal(by.unknown.change, 0); // нет данных об эффекте часов — не трогаем
  assert.equal(by.unknown.code, 'keep_nodata');
});

test('expectedEffect: сдвиг баллов увеличивает долю усвоения, отрицательный наклон не используется', () => {
  const e = A.expectedEffect([57, 58, 70], 2, 2, 60);
  assert.equal(e.shift, 4);
  assert.ok(Math.abs(e.masteryBefore - 1 / 3) < 1e-9);
  assert.equal(e.masteryAfter, 1);
  assert.equal(A.expectedEffect([55], 3, -1, 60).shift, 0);
});

test('itemAnalysis: индекс трудности и дискриминативность, подсветка плохих заданий', () => {
  const r = rng(11), items = [];
  for (let s = 0; s < 300; s++) {
    const z = randn(r);
    for (let i = 1; i <= 6; i++) {
      const p = i === 6 ? 1 / (1 + Math.exp(2 * z)) : 1 / (1 + Math.exp(-1.7 * (z - (i - 3) * 0.5)));
      items.push({ student_id: 's' + s, topic_id: 'T', item_id: 'Q' + i, correct: r() < p ? 1 : 0 });
    }
  }
  const res = A.itemAnalysis(items).T;
  assert.equal(res.length, 6);
  assert.ok(res[0].p > res[4].p, 'первое задание легче пятого');
  assert.ok(res[0].rpb > 0.2);
  assert.equal(res[5].flag, 'negative'); // обратная связь со способностью — вероятно, ошибка в ключе
});

test('parseCSV: кавычки, точка с запятой, BOM и пустые строки', () => {
  const p = A.parseCSV('﻿a;b;c\n1;"x; ""y""";3\n\n4;5;6\n');
  assert.equal(p.delimiter, ';');
  assert.deepEqual(p.headers, ['a', 'b', 'c']);
  assert.deepEqual(p.records, [['1', 'x; "y"', '3'], ['4', '5', '6']]);
});

test('validateResults: понятные ошибки по строкам, корректные строки сохраняются', () => {
  const csv = [
    'school_id,school_name,district,class_id,textbook,student_id,topic_id,topic_name,planned_hours,actual_hours,pre_score,post_score',
    'S1,Школа 1,Тараз,7А,Учебник А,st1,T01,Тема,8,8,40,70',
    'S1,Школа 1,Тараз,7А,Учебник Г,st2,T01,Тема,8,8,40,70',
    'S1,Школа 1,Тараз,7А,Б,st3,T01,Тема,8,8,,70',
    'S1,Школа 1,Тараз,7А,В оқулығы,st4,T01,Тема,8,8,40,134',
    'S1,Школа 1,Тараз,7А,A,st1,T01,Тема,8,8,40,70',
  ].join('\n');
  const v = A.validateResults(A.parseCSV(csv));
  assert.equal(v.rows.length, 1);
  const codes = v.errors.map((e) => `${e.line}:${e.code}`);
  assert.deepEqual(codes, ['3:unknown_textbook', '4:empty', '5:out_of_range', '6:duplicate']);
  assert.equal(v.rows[0].textbook, 'A');
});

test('validateResults: отсутствующие обязательные колонки и русские заголовки', () => {
  const miss = A.validateResults(A.parseCSV('school_id,textbook\nS1,A'));
  assert.ok(miss.missingColumns.includes('post_score'));
  const ru = A.validateResults(A.parseCSV('id_школы;учебник;ученик;id_темы;часы_план;часы_факт;входной_балл;итоговый_балл\nS1;Учебник Б;u1;T1;8;9;45,5;60'));
  assert.equal(ru.missingColumns.length, 0);
  assert.equal(ru.rows[0].pre, 45.5);
  assert.equal(ru.rows[0].textbook, 'B');
});

test('normalizeTextbook: варианты написания на RU/KZ/EN', () => {
  assert.equal(A.normalizeTextbook('Учебник В'), 'C');
  assert.equal(A.normalizeTextbook('Б оқулығы'), 'B');
  assert.equal(A.normalizeTextbook('a'), 'A');
  assert.equal(A.normalizeTextbook('Учебник Г'), null);
});
