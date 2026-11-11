// Сборка презентации: presentation/index.html (HTML-слайды 16:9) + presentation/presentation.pdf (1920×1080 на слайд).
// Все цифры берутся из presentation/facts.json (его пишет scripts/slide-shots.mjs по реальным расчётам сайта).
// Запуск: node scripts/build-presentation.mjs [MVP_URL] [REPO_URL]
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const QR = require(join(ROOT, 'scripts/node_modules/qrcode'));
let pw; try { pw = require('playwright'); } catch { pw = createRequire(join(process.cwd(), 'x.js'))('playwright'); }

const MVP = process.argv[2] || readFileSync(join(ROOT, 'presentation/mvp-url.txt'), 'utf8').trim();
const REPO = process.argv[3] || 'https://github.com/Kylyshbay/bilimlens';
const F = JSON.parse(readFileSync(join(ROOT, 'presentation/facts.json'), 'utf8'));
const nf = (x, d = 1) => new Intl.NumberFormat('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d }).format(x).replace('-', '−');
const pct = (x) => Math.round(x * 100) + '%';
const sgn = (x, d = 1) => (x > 0 ? '+' : '') + nf(x, d);
const TB = { A: 'Учебник А', B: 'Учебник Б', C: 'Учебник В' };
const TBg = { A: 'учебника А', B: 'учебника Б', C: 'учебника В' };
const G = Object.fromEntries(F.overall.groups.map((g) => [g.tb, g]));
const BA = F.overall.contrasts.find((c) => c.a === 'A' && c.b === 'B');
const better = F.findings.filter((f) => f.dir === 'better' && f.tb === 'B').sort((a, b) => b.d - a.d);
const worse = F.findings.filter((f) => f.dir === 'worse');
const crit = F.stats.filter((s) => s.status === 'critical').sort((a, b) => a.mastery - b.mastery);
const risk = F.stats.filter((s) => s.status === 'risk');
const adds = F.rec.filter((r) => r.change > 0).sort((a, b) => b.change - a.change);
const takes = F.rec.filter((r) => r.change < 0);
const moved = adds.reduce((s, r) => s + r.change, 0);
const T08bad = (F.items.T08 || []).find((i) => i.flag === 'negative');
const qrSvg = await QR.toString(MVP, { type: 'svg', margin: 1, color: { dark: '#0B3F4A', light: '#FFFFFF' } });

const font = (w) => `@font-face{font-family:Inter;font-weight:${w};src:url(../assets/fonts/inter-cyrillic-ext-${w}-normal.woff2) format('woff2');unicode-range:U+0460-052F}
@font-face{font-family:Inter;font-weight:${w};src:url(../assets/fonts/inter-cyrillic-${w}-normal.woff2) format('woff2');unicode-range:U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116}
@font-face{font-family:Inter;font-weight:${w};src:url(../assets/fonts/inter-latin-${w}-normal.woff2) format('woff2');unicode-range:U+0000-00FF,U+2000-206F,U+2212}`;

const head = (n, ru, kz) => `<header class="sh"><span class="sn">${String(n).padStart(2, '0')}</span><div><h2>${ru}</h2><p class="kz">${kz}</p></div></header>`;
const slides = [];
const S = (cls, html) => slides.push(`<section class="slide ${cls}">${html}<footer class="sf"><span><b>BilimLens</b> · EdTech Hackathon by Zhambyl Hub · кейс 1</span><span class="pg"></span></footer></section>`);

// 1. Титул
S('title', `<div class="t-left">
  <div class="logo">${logo(64)}<span>BilimLens</span></div>
  <h1>Решения об учебниках и учебных часах — по измеримым результатам учеников</h1>
  <p class="kz big">Оқулықтар мен оқу сағаттары туралы шешімдер — оқушылардың өлшенетін нәтижелері бойынша</p>
  <p class="case">Кейс 1 · Data-Driven Curriculum · интеллектуальная система оценки эффективности учебников и учебных программ</p>
  <div class="team"><span>Команда:</span> Кылышбай Фархат</div>
</div><div class="t-right"><img src="img/home.png" alt=""></div>`);

// 2. Проблема
S('', `${head(2, 'Проблема: решения принимаются «по традиции»', 'Мәселе: шешімдер «дәстүр бойынша» қабылданады')}
<div class="cols3">
  <div class="pc"><div class="pi">А·Б·В</div><h3>Выбор учебника</h3><p>По привычке, мнению коллег или презентации издательства. Связь с результатами учеников не проверяется.</p></div>
  <div class="pc"><div class="pi">102 ч</div><h3>Распределение часов</h3><p>КТП переносится «как в прошлом году», даже если тема годами не усваивается, а на освоенные темы уходят лишние часы.</p></div>
  <div class="pc"><div class="pi">≠</div><h3>Сравнение «в лоб»</h3><p>Средние баллы сравнивают напрямую и не учитывают, что в разные школы приходят дети с разным входным уровнем.</p></div>
</div>
<div class="quote">Результаты СОР, СОЧ и пробных тестов уже собираются — но превращаются в отчёт «для галочки», а не в решение.</div>`);

// 3. Пользователь
S('', `${head(3, 'Пользователь: методист и завуч', 'Пайдаланушы: әдіскер және оқу ісінің меңгерушісі')}
<div class="cols2">
  <div class="card"><h3>Кто</h3><ul><li><b>Методист</b> районного или областного отдела образования: отвечает за предмет в 20–100 школах.</li><li><b>Завуч</b> школы: утверждает КТП и распределение часов.</li></ul>
  <h3>Боль</h3><ul><li>Данные есть, но в разрозненных таблицах Excel.</li><li>Нет инструмента, который отделит «плохой учебник» от «слабого набора учеников».</li><li>Любое решение приходится защищать перед руководством без цифр.</li></ul></div>
  <div class="card"><h3>Сценарий с BilimLens</h3><ol class="tl">
    <li><b>После СОЧ</b> — выгружает результаты в CSV/Excel и загружает в BilimLens (5 минут).</li>
    <li><b>Видит</b> карту «школа × тема» и 2–3 критические темы района.</li>
    <li><b>Проверяет</b>, какой учебник реально сильнее на этих темах при равном входном уровне.</li>
    <li><b>Получает</b> план перераспределения часов и печатный отчёт для методобъединения.</li></ol></div>
</div>`);

// 4. Решение
S('', `${head(4, 'Решение: BilimLens', 'Шешім: BilimLens')}
<p class="lead">Веб-платформа, которая превращает результаты тестирования по темам в обоснованные решения об учебниках и учебных часах — с прозрачной статистикой и на двух языках.</p>
<div class="cols4">
  <div class="fc"><span>01</span><h3>Анализ по темам</h3><p>Средний балл, медиана, разброс, доля усвоивших, прирост от входного теста.</p></div>
  <div class="fc"><span>02</span><h3>Сложные разделы</h3><p>Автоклассификация «критическая / риск / норма / освоена» и анализ заданий.</p></div>
  <div class="fc"><span>03</span><h3>Сравнение учебников</h3><p>С поправкой на входной уровень, 95% CI, Cohen’s d, защита от малых выборок.</p></div>
  <div class="fc"><span>04</span><h3>Рекомендации по часам</h3><p>Перераспределение при фиксированных ${F.totalHours} ч, объяснение и симулятор «что если».</p></div>
</div>
<p class="note">Только анализ: тесты проводятся как обычно, в систему загружаются результаты (CSV/Excel). Интерфейс RU/KZ, работает в браузере без установки.</p>`);

// 5. Демо: сложные темы
S('demo', `${head(5, 'Демо: какие темы не усваиваются', 'Демо: қай тақырыптар меңгерілмейді')}
<div class="demo-grid"><div class="shot"><img src="img/topics-table.png" alt=""></div>
<div class="side">
  <div class="big-num">${pct(crit[0].mastery)}</div><p>учеников усвоили тему <b>«${crit[0].name}»</b> — критическая тема (порог 60 баллов).</p>
  <ul>${crit.slice(1).map((s) => `<li>«${s.name}» — ${pct(s.mastery)}, критическая</li>`).join('')}${risk.map((s) => `<li>«${s.name}» — ${pct(s.mastery)}, зона риска</li>`).join('')}</ul>
  ${T08bad ? `<div class="callout">Анализ заданий: в задании <b>${T08bad.id}</b> сильные ученики ошибаются чаще слабых (r = ${nf(T08bad.r, 2)}) — вероятная ошибка в ключе.</div>` : ''}
  <p class="rule">Правило: критическая — усвоение &lt; 50% и средний балл ниже медианы по темам.</p>
</div></div>`);

// 6. Парадокс
S('paradox', `${head(6, 'Главное: наивное сравнение учебников ошибается', 'Басты нәтиже: оқулықтарды тікелей салыстыру қате')}
<div class="par-grid">
  <div class="par-col naive"><p class="lbl">«В лоб» — средний итоговый балл</p>
    ${['A', 'B', 'C'].map((tb) => `<div class="pbar"><span>${TB[tb]}</span><div><i style="width:${(G[tb].raw - 55) * 4}%"></i></div><b>${nf(G[tb].raw)}</b></div>`).join('')}
    <p class="verdict bad">Лидер: ${TB[F.overall.raw]}</p></div>
  <div class="par-mid"><div class="arrow">→</div><p>учитываем<br>входной тест</p><p class="small">входной балл школ<br>с учебником А: <b>${nf(G.A.pre)}</b><br>у остальных: <b>${nf(G.B.pre)}</b></p></div>
  <div class="par-col adj"><p class="lbl">С поправкой на входной уровень</p>
    ${['A', 'B', 'C'].map((tb) => `<div class="pbar"><span>${TB[tb]}</span><div><i style="width:${(G[tb].adj - 55) * 4}%"></i></div><b>${nf(G[tb].adj)}</b></div>`).join('')}
    <p class="verdict good">Лидер: ${TB[F.overall.adj]} (${sgn(-BA.diff)} балла к А, 95% CI [${nf(-BA.ci[1])}; ${nf(-BA.ci[0])}])</p></div>
</div>
<div class="par-find"><b>Вывод системы:</b> ${TB.B} эффективнее на темах ${better.filter((f) => f.d >= 0.5).map((f) => `«${f.name}» (${sgn(f.diff)} балла, d = ${nf(f.d, 2)})`).join(', ')}; ${worse.map((f) => `${TB[f.tb]} слабее на теме «${f.name}» (${sgn(f.diff)}, d = ${nf(f.d, 2)})`).join('; ')}. ${F.insufficient.map((x) => `По теме «${x.name}» для ${x.groups.map((g) => `${TBg[g.tb]} (n = ${g.n})`).join(', ')} система честно пишет «недостаточно данных».`).join(' ')}</div>`);

// 7. Часы
S('demo', `${head(7, 'Демо: рекомендации по часам', 'Демо: сағаттар бойынша ұсыныстар')}
<div class="demo-grid"><div class="shot"><img src="img/hours-table.png" alt=""></div>
<div class="side">
  <div class="big-num">${F.totalHours} → ${F.totalHours} ч</div><p>годовой объём не меняется; перераспределяется <b>${moved} ч</b></p>
  <div class="moves"><div class="mv neg">${takes.map((r) => `<span>${r.change} ч · ${r.name}</span>`).join('')}</div>
  <div class="mv pos">${adds.map((r) => `<span>+${r.change} ч · ${r.name}<em>${pct(r.m0)} → ${pct(r.m1)}</em></span>`).join('')}</div></div>
  <p class="small">Эффект часа оценён по школам, которые сами отклонялись от плана; освоенные темы не опускаются ниже 70% плана и наблюдаемого минимума. Это оценка, а не гарантия — проверяется в пилоте.</p>
</div></div>`);

// 8. Как работает
S('', `${head(8, 'Как это работает', 'Қалай жұмыс істейді')}
<div class="flow">
  <div class="fl"><span>1</span><h3>Данные</h3><p>CSV/Excel: школа, учебник, ученик (обезличенный код), тема, часы план/факт, входной и итоговый балл. Опционально — ответы по заданиям 0/1.</p></div>
  <div class="fa">→</div>
  <div class="fl"><span>2</span><h3>Метрики</h3><p>Усвоение (доля ≥ порога), медиана, разброс, прирост; индекс трудности p и дискриминативность r заданий.</p></div>
  <div class="fa">→</div>
  <div class="fl"><span>3</span><h3>Статистика</h3><p>Регрессия итоговый ~ входной + учебник; 95% CI, Cohen’s d; оценка «балл за час» по отклонениям от плана.</p></div>
  <div class="fa">→</div>
  <div class="fl"><span>4</span><h3>Решения</h3><p>Классификация тем, вывод по учебникам словами, план часов с обоснованием, PDF-отчёт.</p></div>
</div>
<div class="csv"><p>Пример строки входного файла</p><code>Алгебра, 7 класс, S07, Школа №5, Жуалынский район, S07-7А, Учебник Б, S07-7А-12, T08, Алгебраические дроби, 10, 12, 44, 58</code></div>
<div class="tech"><span>Статический сайт: HTML + JS, без сервера</span><span>Расчёты в браузере — данные не покидают компьютер</span><span>17 unit-тестов аналитики + E2E-тест</span><span>RU / KZ</span></div>`);

// 9. Доверие
S('', `${head(9, 'Почему этим выводам можно доверять', 'Неліктен бұл қорытындыларға сенуге болады')}
<div class="cols2x2">
  <div class="card"><h3>Поправка на входной уровень</h3><p>Сравниваем учеников с одинаковым входным баллом, а не «сильные школы против слабых». Именно это разворачивает вывод: А «в лоб» → Б с поправкой.</p></div>
  <div class="card"><h3>Интервалы и размер эффекта</h3><p>Каждая разница — с 95% доверительным интервалом и Cohen’s d. Вывод «лучше» — только если интервал не включает 0 и d ≥ 0,2.</p></div>
  <div class="card"><h3>Честное «не знаю»</h3><p>При n &lt; 30 или слишком широком интервале система пишет «недостаточно данных», а часы не экстраполирует за пределы того, что реально наблюдалось.</p></div>
  <div class="card"><h3>Прозрачные формулы</h3><p>Правила и формулы открыты в блоках «Как это посчитано». Код аналитики покрыт тестами; демо-данные синтетические, генератор детерминированный.</p></div>
</div>`);

// 10. Внедрение
S('', `${head(10, 'Внедрение: пилот в Жамбылской области', 'Енгізу: Жамбыл облысындағы пилот')}
<div class="road">
  <div class="rs"><span>Месяц 1</span><h3>Старт</h3><p>Алгебра 7 класса, 2–3 района, 15–20 школ. Шаблон выгрузки результатов СОР/СОЧ и пробных тестов из электронного журнала или Excel.</p></div>
  <div class="rs"><span>Месяц 2</span><h3>Анализ</h3><p>Отчёт по району: критические темы, сравнение учебников, проект перераспределения часов. Обсуждение на методобъединении.</p></div>
  <div class="rs"><span>Месяцы 3–5</span><h3>Проверка</h3><p>Часть школ корректирует КТП по рекомендации, часть работает по плану. Сравнение по итогам четверти.</p></div>
  <div class="rs"><span>Далее</span><h3>Масштаб</h3><p>Все районы области, физика/химия/казахский язык; затем другие регионы. Данные — только обезличенные коды учеников.</p></div>
</div>
<p class="note">Нужно от управления образования: доступ к выгрузке результатов, 1 ответственный методист на район, согласование формата данных.</p>`);

// 11. Модель ценности
S('', `${head(11, 'Модель ценности', 'Құндылық моделі')}
<div class="cols3">
  <div class="card"><h3>Управления образования</h3><p>Закупка учебников и распределение часов на основании результатов; единый отчёт по области вместо ручных таблиц.</p><p class="pay">Модель: годовая лицензия на регион / госзаказ.</p></div>
  <div class="card"><h3>Школы и методисты</h3><p>Готовый анализ после каждого СОЧ, план КТП с обоснованием, проверка качества заданий.</p><p class="pay">Бесплатно для школ в рамках региональной лицензии.</p></div>
  <div class="card"><h3>Издательства и авторы</h3><p>Обратная связь: на каких темах учебник проигрывает, какие разделы переписать.</p><p class="pay">Платная агрегированная аналитика без доступа к данным учеников.</p></div>
</div>
<p class="note">Альтернатива финансирования на старте: грант / акселератор EdTech, пилот за счёт регионального бюджета на цифровизацию.</p>`);

// 12. Roadmap
S('', `${head(12, 'Дорожная карта', 'Даму жоспары')}
<div class="road">
  <div class="rs"><span>Сейчас · MVP</span><h3>Готово</h3><p>4 модуля анализа, импорт CSV/Excel с валидацией, RU/KZ, отчёт PDF, карточка школы, симулятор часов.</p></div>
  <div class="rs"><span>+3 месяца</span><h3>Интеграции</h3><p>Импорт из электронных журналов, личные кабинеты отделов образования, история по годам.</p></div>
  <div class="rs"><span>+6 месяцев</span><h3>Глубже</h3><p>Многоуровневые модели (ученик–класс–школа), банк заданий с анализом по заданиям, больше предметов.</p></div>
  <div class="rs"><span>+12 месяцев</span><h3>Масштаб</h3><p>Все регионы, рекомендации по методике для каждой критической темы, открытые обезличенные датасеты.</p></div>
</div>
<p class="note">Принцип развития: каждая новая рекомендация сначала проверяется на пилотных школах и сравнивается с контрольной группой.</p>`);

// 13. Ссылки
S('cta', `<div class="cta-left">
  <div class="logo">${logo(54)}<span>BilimLens</span></div>
  <h1>Откройте демо — все цифры этой презентации посчитаны в нём</h1>
  <p class="kz big">Демоны ашыңыз — бұл таныстырылымдағы барлық сандар сонда есептелген</p>
  <dl><dt>MVP</dt><dd>${MVP}</dd><dt>Репозиторий</dt><dd>${REPO}</dd><dt>Команда</dt><dd>Кылышбай Фархат · github.com/Kylyshbay</dd></dl>
  <p class="small">Демо-данные синтетические (${F.students} учеников, ${F.schools} школ, алгебра 7 класс), сгенерированы для демонстрации; на реальных данных система работает так же.</p>
</div><div class="qr">${qrSvg}<p>Сканируйте, чтобы открыть MVP</p></div>`);

function logo(s) { return `<svg width="${s}" height="${s}" viewBox="0 0 32 32"><circle cx="14" cy="14" r="11" fill="none" stroke="currentColor" stroke-width="2.6"/><rect x="8.5" y="14" width="3" height="5" rx="1" fill="#E39B2D"/><rect x="12.5" y="10" width="3" height="9" rx="1" fill="currentColor"/><rect x="16.5" y="12" width="3" height="7" rx="1" fill="currentColor" opacity=".6"/><path d="M22.5 22.5 29 29" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`; }

const css = `${[400, 500, 600, 700, 800].map(font).join('\n')}
:root{--ink:#12303A;--text:#24414B;--muted:#63777F;--line:#DCE5E8;--bg:#F3F6F7;--primary:#0B5563;--teal:#14A3A3;--amber:#E39B2D;--crit:#C2412D;--ok:#2E9B6A}
*{box-sizing:border-box}html,body{margin:0;background:#0C2C33;font-family:Inter,system-ui,sans-serif;color:var(--text)}
.deck{width:1920px;height:1080px;position:absolute;left:50%;top:50%;transform-origin:center}
.slide{position:absolute;inset:0;width:1920px;height:1080px;background:var(--bg);padding:80px 110px 100px;display:none;flex-direction:column;overflow:hidden}
.slide.active{display:flex}
h1,h2,h3{color:var(--ink);margin:0;letter-spacing:-.02em}
.sh{display:flex;gap:28px;align-items:flex-start;margin-bottom:46px}.sn{font-size:22px;font-weight:800;color:var(--amber);padding-top:14px}
.sh h2{font-size:60px;font-weight:800;line-height:1.08}.kz{color:var(--muted);font-size:24px;margin:8px 0 0}.kz.big{font-size:28px}
.sf{position:absolute;left:110px;right:110px;bottom:34px;display:flex;justify-content:space-between;font-size:18px;color:var(--muted)}
.card{background:#fff;border:1px solid var(--line);border-radius:20px;padding:34px 38px}.card h3{font-size:30px;margin-bottom:14px}.card p,.card li{font-size:24px;line-height:1.45}
.card ul,.card ol{margin:0 0 24px;padding-left:28px;display:flex;flex-direction:column;gap:10px}
.cols2{display:grid;grid-template-columns:1fr 1fr;gap:34px}.cols3{display:grid;grid-template-columns:repeat(3,1fr);gap:30px}.cols4{display:grid;grid-template-columns:repeat(4,1fr);gap:26px}.cols2x2{display:grid;grid-template-columns:1fr 1fr;gap:28px}
.title{flex-direction:row!important;gap:60px;align-items:center;background:linear-gradient(120deg,#fff 0%,#EAF4F4 60%,#D7ECEB 100%)}
.t-left{flex:1.05}.t-right{flex:1}.t-right img{width:100%;border-radius:18px;box-shadow:0 30px 80px rgba(11,85,99,.25);border:1px solid var(--line)}
.logo{display:flex;align-items:center;gap:16px;color:var(--primary);font-size:46px;font-weight:800;letter-spacing:-.03em;margin-bottom:40px}
.title h1{font-size:68px;line-height:1.07;font-weight:800;margin-bottom:22px}.case{font-size:22px;color:var(--primary);font-weight:600;margin:34px 0 0}
.team{margin-top:46px;font-size:26px;color:var(--ink);background:#fff;border:1px dashed #9FB7BE;border-radius:14px;padding:16px 22px;display:inline-block}.team span{color:var(--muted);margin-right:8px}
.pc{background:#fff;border:1px solid var(--line);border-top:6px solid var(--crit);border-radius:20px;padding:38px}.pi{font-size:44px;margin-bottom:12px;color:var(--crit);font-weight:800}.pc h3{font-size:34px;margin-bottom:14px}.pc p{font-size:25px;line-height:1.45;margin:0}
.quote{margin-top:44px;font-size:34px;font-weight:600;color:var(--primary);border-left:8px solid var(--amber);padding:6px 0 6px 30px;line-height:1.3}
.tl{counter-reset:s;list-style:none;padding:0!important}.tl li{position:relative;padding-left:56px}.tl li::before{counter-increment:s;content:counter(s);position:absolute;left:0;top:0;width:38px;height:38px;border-radius:50%;background:var(--primary);color:#fff;display:grid;place-items:center;font-weight:700;font-size:20px}
.lead{font-size:36px;line-height:1.35;color:var(--ink);font-weight:500;margin:0 0 46px;max-width:1500px}
.fc{background:#fff;border:1px solid var(--line);border-radius:20px;padding:32px}.fc span{color:var(--amber);font-weight:800;font-size:22px}.fc h3{font-size:30px;margin:10px 0 12px}.fc p{font-size:22px;line-height:1.45;margin:0}
.note{margin-top:auto;font-size:22px;color:var(--muted);background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px 24px}
.demo-grid{display:grid;grid-template-columns:1.45fr 1fr;gap:48px;flex:1;min-height:0}
.shot{min-height:0;overflow:hidden;border-radius:18px;border:1px solid var(--line);box-shadow:0 20px 60px rgba(11,85,99,.15);background:#fff}.shot img{width:100%;display:block}
.side p{font-size:25px;line-height:1.4;margin:0 0 18px}.side ul{font-size:24px;line-height:1.5;padding-left:26px;margin:0 0 22px}
.big-num{font-size:110px;font-weight:800;color:var(--crit);letter-spacing:-.04em;line-height:1}
.callout{background:#FFF6EA;border:1px solid #F3D5A6;border-radius:14px;padding:18px 22px;font-size:22px;line-height:1.4;margin-bottom:18px}
.rule{font-size:19px!important;color:var(--muted)}.small{font-size:19px!important;color:var(--muted);line-height:1.45}
.par-grid{display:grid;grid-template-columns:1fr 220px 1fr;gap:30px;align-items:center}
.par-col{background:#fff;border-radius:22px;padding:34px 38px;border:1px solid var(--line)}.par-col.adj{border:3px solid var(--teal)}
.lbl{font-size:24px;font-weight:700;color:var(--ink);margin:0 0 24px}
.pbar{display:grid;grid-template-columns:170px 1fr 90px;gap:16px;align-items:center;margin-bottom:18px;font-size:24px}.pbar div{height:30px;background:#EAF0F2;border-radius:8px;overflow:hidden}.pbar i{display:block;height:100%;border-radius:8px}
.naive .pbar i{background:#9AA9AF}.adj .pbar i{background:var(--teal)}.pbar b{font-size:30px;text-align:right;color:var(--ink)}
.verdict{font-size:26px;font-weight:700;margin:20px 0 0;padding:12px 18px;border-radius:12px}.verdict.bad{background:#FBE6E2;color:#9E2F1E}.verdict.good{background:#DFF3EA;color:#1F7350}
.par-mid{text-align:center}.par-mid .arrow{font-size:90px;color:var(--amber);font-weight:800;line-height:1}.par-mid p{font-size:24px;margin:6px 0;color:var(--ink)}
.par-find{margin-top:40px;font-size:25px;line-height:1.45;background:#fff;border-left:8px solid var(--teal);border-radius:12px;padding:22px 28px}
.moves{display:flex;flex-direction:column;gap:14px;margin:20px 0}.mv{display:flex;flex-wrap:wrap;gap:8px}.mv span{font-size:19px;padding:6px 12px;border-radius:10px;font-weight:600}
.mv.neg span{background:#F4EFE7;color:#7A5410}.mv.pos span{background:#DFF3EA;color:#1F7350;font-size:22px}.mv em{font-style:normal;font-weight:800;margin-left:10px}
.demo .big-num{color:var(--primary);font-size:84px}
.flow{display:grid;grid-template-columns:1fr 60px 1fr 60px 1fr 60px 1fr;align-items:stretch}.fl{background:#fff;border:1px solid var(--line);border-radius:20px;padding:30px}.fl span{display:grid;place-items:center;width:52px;height:52px;border-radius:50%;background:var(--primary);color:#fff;font-weight:800;font-size:24px;margin-bottom:16px}.fl h3{font-size:30px;margin-bottom:10px}.fl{min-height:330px}.fl p{font-size:22px;line-height:1.45;margin:0}
.fa{display:grid;place-items:center;font-size:48px;color:var(--amber);font-weight:800}
.csv{margin-top:40px}.csv p{font-size:20px;color:var(--muted);margin:0 0 8px}.csv code{display:block;font:22px ui-monospace,Menlo,monospace;background:#0F3A44;color:#D9F0EE;padding:20px 24px;border-radius:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tech{display:flex;gap:16px;flex-wrap:wrap;margin-top:auto}.tech span{background:#fff;border:1px solid var(--line);border-radius:999px;padding:12px 24px;font-size:21px;font-weight:600;color:var(--primary)}
.road{display:grid;grid-template-columns:repeat(4,1fr);gap:24px;position:relative}.rs{background:#fff;border:1px solid var(--line);border-radius:20px;padding:30px;border-top:6px solid var(--teal)}.rs span{font-size:20px;font-weight:700;color:var(--amber)}.rs h3{font-size:30px;margin:8px 0 12px}.rs p{font-size:21px;line-height:1.45;margin:0}
.pay{color:var(--primary)!important;font-weight:600;border-top:1px dashed var(--line);padding-top:14px}
.cta{flex-direction:row!important;gap:70px;align-items:center;background:linear-gradient(120deg,#fff,#E3F2F1)}.cta-left{flex:1}.cta h1{font-size:60px;line-height:1.1;font-weight:800;margin-bottom:16px}
.cta dl{display:grid;grid-template-columns:200px 1fr;gap:14px 20px;font-size:26px;margin:40px 0}.cta dt{color:var(--muted)}.cta dd{margin:0;color:var(--ink);font-weight:600;word-break:break-all}
.qr{width:480px;text-align:center;background:#fff;border-radius:26px;padding:34px;box-shadow:0 30px 80px rgba(11,85,99,.2)}.qr svg{width:100%;height:auto}.qr p{font-size:22px;color:var(--muted);margin:12px 0 0}
.hint{position:fixed;right:16px;bottom:12px;color:#9FC3CA;font:13px Inter,sans-serif}
@media print{@page{size:1920px 1080px;margin:0}html,body{background:var(--bg)}.deck{position:static;transform:none!important;width:auto;height:auto}.slide{display:flex!important;position:relative;break-after:page;page-break-after:always}.hint{display:none}}`;

const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>BilimLens — презентация</title><style>${css}</style></head><body>
<div class="deck" id="deck">${slides.join('\n')}</div>
<div class="hint">← → / пробел · F — полный экран</div>
<script>
const sl=[...document.querySelectorAll('.slide')];sl.forEach((s,i)=>s.querySelector('.pg').textContent=(i+1)+' / '+sl.length);
let i=Math.max(0,Math.min(sl.length-1,(parseInt(location.hash.slice(1))||1)-1));
function show(){sl.forEach((s,k)=>s.classList.toggle('active',k===i));history.replaceState(null,'','#'+(i+1));}
function fit(){const k=Math.min(innerWidth/1920,innerHeight/1080);document.getElementById('deck').style.transform='translate(-50%,-50%) scale('+k+')';}
addEventListener('resize',fit);fit();show();
addEventListener('keydown',e=>{if(['ArrowRight','PageDown',' '].includes(e.key)){i=Math.min(sl.length-1,i+1);show();}else if(['ArrowLeft','PageUp'].includes(e.key)){i=Math.max(0,i-1);show();}else if(e.key==='f'||e.key==='F'){document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen().catch(()=>{});}});
addEventListener('click',e=>{i=e.clientX>innerWidth/2?Math.min(sl.length-1,i+1):Math.max(0,i-1);show();});
</script></body></html>`;
writeFileSync(join(ROOT, 'presentation/index.html'), html);
console.log('slides:', slides.length);

// PDF + PNG-превью слайдов
const b = await pw.chromium.launch();
const page = await (await b.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
await page.goto(pathToFileURL(join(ROOT, 'presentation/index.html')).href);
await page.waitForTimeout(400);
for (let k = 1; k <= slides.length; k++) {
  await page.evaluate((n) => { location.hash = n; location.reload(); }, k);
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(ROOT, `presentation/preview/slide-${String(k).padStart(2, '0')}.png`) });
}
await page.emulateMedia({ media: 'print' });
await page.pdf({ path: join(ROOT, 'presentation/presentation.pdf'), width: '1920px', height: '1080px', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
await b.close();
console.log('PDF ok');
