// Детерминированный генератор синтетических демо-данных BilimLens.
// Запуск: node scripts/generate-demo.mjs
// Все «истории» заложены в модель генерации; дашборд обнаруживает их расчётом, а не хардкодом.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEED = 20261111;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(SEED);
const randn = () => { let u = 0, v = 0; while (u === 0) u = rnd(); while (v === 0) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const randint = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const clamp = (x) => Math.max(0, Math.min(100, Math.round(x)));

const districts = [
  { id: 'taraz', ru: 'г. Тараз', kz: 'Тараз қ.' },
  { id: 'baizak', ru: 'Байзакский район', kz: 'Байзақ ауданы' },
  { id: 'zhualy', ru: 'Жуалынский район', kz: 'Жуалы ауданы' },
  { id: 'korday', ru: 'Кордайский район', kz: 'Қордай ауданы' },
  { id: 'merki', ru: 'Меркенский район', kz: 'Меркі ауданы' },
  { id: 'shu', ru: 'Шуский район', kz: 'Шу ауданы' },
  { id: 'talas', ru: 'Таласский район', kz: 'Талас ауданы' },
  { id: 'moiynkum', ru: 'Мойынкумский район', kz: 'Мойынқұм ауданы' },
];
const placeRu = { taraz: 'Тараз', baizak: 'с. Сарыкемер', zhualy: 'с. Б. Момышулы', korday: 'с. Кордай', merki: 'с. Мерке', shu: 'г. Шу', talas: 'г. Каратау', moiynkum: 'с. Мойынкум' };
const placeKz = { taraz: 'Тараз', baizak: 'Сарыкемер а.', zhualy: 'Б. Момышұлы а.', korday: 'Қордай а.', merki: 'Меркі а.', shu: 'Шу қ.', talas: 'Қаратау қ.', moiynkum: 'Мойынқұм а.' };

const subjects = [
  {
    id: 'alg7', ru: 'Алгебра, 7 класс', kz: 'Алгебра, 7-сынып', totalHours: 102,
    topics: [
      { id: 'T01', ru: 'Линейные уравнения с одной переменной', kz: 'Бір айнымалысы бар сызықтық теңдеулер', planned: 8, base: 76, sd: 10, slope: 0.3 },
      { id: 'T02', ru: 'Степень с натуральным показателем', kz: 'Натурал көрсеткішті дәреже', planned: 8, base: 78, sd: 10, slope: 0.3 },
      { id: 'T03', ru: 'Одночлены', kz: 'Бірмүшелер', planned: 6, base: 80, sd: 9, slope: 0.2 },
      { id: 'T04', ru: 'Многочлены: сложение и вычитание', kz: 'Көпмүшелерді қосу және азайту', planned: 8, base: 75, sd: 10, slope: 0.3 },
      { id: 'T05', ru: 'Умножение многочленов', kz: 'Көпмүшелерді көбейту', planned: 8, base: 70, sd: 11, slope: 0.5 },
      { id: 'T06', ru: 'Формулы сокращённого умножения', kz: 'Қысқаша көбейту формулалары', planned: 10, base: 63, sd: 12, slope: 1.1 },
      { id: 'T07', ru: 'Разложение многочлена на множители', kz: 'Көпмүшені көбейткіштерге жіктеу', planned: 10, base: 49, sd: 17, slope: 2.4 },
      { id: 'T08', ru: 'Алгебраические дроби', kz: 'Алгебралық бөлшектер', planned: 10, base: 47, sd: 17, slope: 2.2 },
      { id: 'T09', ru: 'Функции и их графики', kz: 'Функциялар және олардың графиктері', planned: 8, base: 63, sd: 12, slope: 0.8 },
      { id: 'T10', ru: 'Линейная функция', kz: 'Сызықтық функция', planned: 8, base: 68, sd: 11, slope: 0.6 },
      { id: 'T11', ru: 'Системы линейных уравнений', kz: 'Сызықтық теңдеулер жүйесі', planned: 10, base: 56, sd: 15, slope: 1.8 },
      { id: 'T12', ru: 'Элементы статистики', kz: 'Статистика элементтері', planned: 8, base: 74, sd: 10, slope: 0.3 },
    ],
    // Истинные эффекты учебников (баллы к post при равном pre). А — опорный.
    tb: { B: { _all: 2, T09: 10, T10: 8 }, C: { T08: -9 } },
    itemTopics: ['T07', 'T08', 'T11'],
  },
  {
    id: 'phy8', ru: 'Физика, 8 класс', kz: 'Физика, 8-сынып', totalHours: 68,
    topics: [
      { id: 'P01', ru: 'Тепловые явления', kz: 'Жылулық құбылыстар', planned: 12, base: 72, sd: 11, slope: 0.3 },
      { id: 'P02', ru: 'Изменение агрегатных состояний', kz: 'Заттың агрегаттық күйлерінің өзгеруі', planned: 8, base: 70, sd: 11, slope: 0.4 },
      { id: 'P03', ru: 'Электрические явления', kz: 'Электрлік құбылыстар', planned: 12, base: 61, sd: 13, slope: 1.2 },
      { id: 'P04', ru: 'Постоянный электрический ток', kz: 'Тұрақты электр тогы', planned: 14, base: 51, sd: 16, slope: 2.0 },
      { id: 'P05', ru: 'Электромагнитные явления', kz: 'Электромагниттік құбылыстар', planned: 8, base: 66, sd: 12, slope: 0.6 },
      { id: 'P06', ru: 'Световые явления', kz: 'Жарық құбылыстары', planned: 10, base: 64, sd: 12, slope: 0.7 },
      { id: 'P07', ru: 'Строение атома', kz: 'Атом құрылысы', planned: 4, base: 76, sd: 10, slope: 0.2 },
    ],
    tb: { B: { P04: 6 }, C: { P03: -5 } },
    itemTopics: [],
  },
];
for (const s of subjects) {
  const sum = s.topics.reduce((a, t) => a + t.planned, 0);
  if (sum !== s.totalHours) throw new Error(`${s.id}: planned ${sum} != ${s.totalHours}`);
}

// 16 школ: учебник А — в основном городские школы Тараза (выше входной уровень).
const schoolSpec = [
  ['S01', 1, 'taraz', 'A'], ['S02', 7, 'taraz', 'A'], ['S03', 14, 'taraz', 'A'], ['S04', 23, 'taraz', 'A'], ['S05', 41, 'taraz', 'A'],
  ['S06', 2, 'baizak', 'B'], ['S07', 5, 'zhualy', 'B'], ['S08', 3, 'korday', 'B'], ['S09', 8, 'merki', 'B'], ['S10', 30, 'taraz', 'B'],
  ['S11', 4, 'shu', 'C'], ['S12', 6, 'talas', 'C'], ['S13', 11, 'baizak', 'C'], ['S14', 9, 'korday', 'C'], ['S15', 12, 'merki', 'A'],
  ['S16', 1, 'moiynkum', 'C'],
];
const schools = schoolSpec.map(([id, num, d, tb]) => ({
  id, district: d, textbook: tb,
  ru: `Школа №${num}, ${placeRu[d]}`, kz: `№${num} мектеп, ${placeKz[d]}`,
  shift: (tb === 'A' && d === 'taraz' ? 14 : tb === 'A' ? 9 : 0) + randn() * 3,
  small: id === 'S16',
}));
// Физику в демо сдают 9 школ (учебник по физике свой).
const physicsSchools = { S01: 'A', S02: 'A', S04: 'A', S06: 'B', S08: 'B', S10: 'B', S11: 'C', S12: 'C', S16: 'C' };

const rows = [];
const items = [];
const hoursLog = [];
const subjectsOut = [];

for (const subj of subjects) {
  const topicIds = subj.topics.map((t) => t.id);
  const hard = subj.topics.filter((t) => t.slope >= 1.5).map((t) => t.id);
  const easy = subj.topics.filter((t) => t.slope <= 0.5).map((t) => t.id);
  const list = subj.id === 'alg7' ? schools : schools.filter((s) => physicsSchools[s.id]);
  for (const sc of list) {
    const tb = subj.id === 'alg7' ? sc.textbook : physicsSchools[sc.id];
    // Отклонения от плана часов (сумма сохраняется): у ~60% школ.
    const actual = Object.fromEntries(subj.topics.map((t) => [t.id, t.planned]));
    if (rnd() < 0.65 || sc.id === 'S03' || sc.id === 'S12') {
      const moves = randint(1, 3);
      for (let m = 0; m < moves; m++) {
        const h = randint(2, 4);
        let from, to;
        if (rnd() < 0.7) { from = pick(easy); to = pick(hard.length ? hard : topicIds); }
        else { from = pick(topicIds); to = pick(topicIds); }
        if (from === to || actual[from] - h < 3) continue;
        actual[from] -= h; actual[to] += h;
      }
    }
    hoursLog.push({ subject: subj.id, school: sc.id, actual });
    const nClasses = sc.small ? 1 : randint(2, 3);
    for (let c = 1; c <= nClasses; c++) {
      const classId = `${sc.id}-${subj.id === 'alg7' ? '7' : '8'}${'АБВ'[c - 1]}`;
      const classEff = randn() * 3;
      const nStud = sc.small ? 17 : randint(20, 30);
      for (let k = 1; k <= nStud; k++) {
        const sid = `${classId}-${String(k).padStart(2, '0')}`;
        const theta = randn();
        const preBase = 42 + sc.shift + 13 * theta + randn() * 4;
        for (const t of subj.topics) {
          // Итоговый тест по последней теме года сдали не все школы с учебником В (малые выборки).
          if (t.id === 'T12' && tb === 'C' && !sc.small) continue;
          const pre = clamp(preBase + randn() * 6);
          const eff = (subj.tb[tb]?._all || 0) + (subj.tb[tb]?.[t.id] || 0);
          const delta = actual[t.id] - t.planned;
          const hoursEff = t.slope * delta - (delta > 0 ? 0.04 * t.slope * delta * delta : 0);
          const post = clamp(t.base + 0.72 * (pre - 42) + eff + hoursEff + classEff + randn() * t.sd * 0.8);
          rows.push([subj.id, sc.id, classId, tb, sid, t.id, t.planned, actual[t.id], pre, post]);
          if (subj.itemTopics.includes(t.id)) {
            const z = (post - 52) / 17;
            for (let i = 1; i <= 10; i++) {
              let a = 1.0 + ((i * 37) % 9) / 10, b = -1.6 + ((i * 53) % 31) / 10;
              if (t.id === 'T08' && i === 7) { a = -0.5; b = 0; }   // ошибка в ключе
              if (t.id === 'T07' && i === 3) { a = 1.0; b = -3.6; } // слишком лёгкое
              if (t.id === 'T11' && i === 9) { a = 0.05; b = 0.3; } // не различает
              if (t.id === 'T08' && i === 10) { a = 1.2; b = 2.4; } // очень трудное
              const p = 1 / (1 + Math.exp(-1.7 * a * (z - b)));
              items.push([sid, t.id, `${t.id}-Q${String(i).padStart(2, '0')}`, rnd() < p ? 1 : 0]);
            }
          }
        }
      }
    }
  }
  subjectsOut.push({ id: subj.id, ru: subj.ru, kz: subj.kz, totalHours: subj.totalHours, topics: subj.topics.map(({ id, ru, kz, planned }) => ({ id, ru, kz, planned })) });
}

const demo = {
  version: 1,
  seed: SEED,
  note: 'Синтетические демо-данные BilimLens. Сгенерированы scripts/generate-demo.mjs для демонстрации; не относятся к реальным школам и издательствам.',
  textbooks: [{ id: 'A', ru: 'Учебник А', kz: 'А оқулығы' }, { id: 'B', ru: 'Учебник Б', kz: 'Б оқулығы' }, { id: 'C', ru: 'Учебник В', kz: 'В оқулығы' }],
  subjects: subjectsOut,
  districts,
  schools: schools.map(({ id, ru, kz, district }) => ({ id, ru, kz, district })),
  rows: { cols: ['subject', 'school_id', 'class_id', 'textbook', 'student_id', 'topic_id', 'planned_hours', 'actual_hours', 'pre_score', 'post_score'], data: rows },
  items: { cols: ['student_id', 'topic_id', 'item_id', 'correct'], data: items },
};

mkdirSync(join(ROOT, 'assets/data'), { recursive: true });
mkdirSync(join(ROOT, 'sample-data'), { recursive: true });
const json = JSON.stringify(demo);
writeFileSync(join(ROOT, 'assets/data/demo.json'), json);
writeFileSync(join(ROOT, 'assets/data/demo.js'), `/* Синтетические демо-данные BilimLens (генератор: scripts/generate-demo.mjs) */\nwindow.DEMO_DATA=${json};\n`);

// ---- CSV для импорта ----
const H = ['subject', 'school_id', 'school_name', 'district', 'class_id', 'textbook', 'student_id', 'topic_id', 'topic_name', 'planned_hours', 'actual_hours', 'pre_score', 'post_score'];
const esc = (v) => { const s = String(v); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const tbName = { A: 'Учебник А', B: 'Учебник Б', C: 'Учебник В' };
const sById = Object.fromEntries(schools.map((s) => [s.id, s]));
const tById = {}; subjects.forEach((s) => s.topics.forEach((t) => (tById[t.id] = t)));
const dById = Object.fromEntries(districts.map((d) => [d.id, d]));
const subjName = Object.fromEntries(subjects.map((s) => [s.id, s.ru]));
const toCsvRow = (r) => [subjName[r[0]], r[1], sById[r[1]].ru, dById[sById[r[1]].district].ru, r[2], tbName[r[3]], r[4], r[5], tById[r[5]].ru, r[6], r[7], r[8], r[9]].map(esc).join(',');
const algRows = rows.filter((r) => r[0] === 'alg7');
writeFileSync(join(ROOT, 'sample-data/algebra7_results.csv'), '﻿' + [H.join(','), ...algRows.map(toCsvRow)].join('\n') + '\n');
// Небольшой файл: 4 школы (по одной на учебник + малая) — для быстрой проверки импорта.
const smallSet = new Set(['S02', 'S07', 'S12', 'S15']);
const small = algRows.filter((r) => smallSet.has(r[1]));
writeFileSync(join(ROOT, 'sample-data/sample_4_schools.csv'), '﻿' + [H.join(','), ...small.map(toCsvRow)].join('\n') + '\n');
// Файл с ошибками: портим несколько строк.
const broken = small.slice(0, 60).map((r, i) => {
  const f = toCsvRow(r);
  const cells = [subjName[r[0]], r[1], sById[r[1]].ru, dById[sById[r[1]].district].ru, r[2], tbName[r[3]], r[4], r[5], tById[r[5]].ru, r[6], r[7], r[8], r[9]];
  if (i === 3) cells[12] = 134;          // балл вне 0–100
  if (i === 7) cells[11] = '';           // пустой pre_score
  if (i === 12) cells[5] = 'Учебник Г';  // неизвестный учебник
  if (i === 20) cells[10] = 'много';     // нечисловые часы
  if (i === 25) cells[6] = '';           // нет student_id
  return f && cells.map(esc).join(',');
});
writeFileSync(join(ROOT, 'sample-data/sample_with_errors.csv'), '﻿' + [H.join(','), ...broken].join('\n') + '\n');
writeFileSync(join(ROOT, 'sample-data/template.csv'), '﻿' + [H.join(','), ...algRows.slice(0, 3).map(toCsvRow)].join('\n') + '\n');
writeFileSync(join(ROOT, 'sample-data/items_algebra7.csv'), '﻿' + ['student_id,topic_id,item_id,correct', ...items.map((r) => r.join(','))].join('\n') + '\n');

const nStudents = new Set(rows.map((r) => r[4])).size;
console.log(`rows=${rows.length} items=${items.length} students=${nStudents} schools=${schools.length} json=${(json.length / 1024).toFixed(0)}KB`);
console.log('hours deviations:', hoursLog.filter((h) => h.subject === 'alg7').map((h) => h.school + ':' + Object.entries(h.actual).filter(([k, v]) => v !== subjects[0].topics.find((t) => t.id === k).planned).map(([k, v]) => `${k}=${v}`).join(' ')).join(' | '));
