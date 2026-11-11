// Сборка dist/standalone.html — один файл со всем внутри (CSS, шрифты, JS, демо-данные).
// Запуск: node scripts/build-standalone.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
let html = read('index.html');

let css = read('assets/css/style.css');
css = css.replace(/url\(\.\.\/fonts\/([^)]+)\)/g, (m, f) => `url(data:font/woff2;base64,${readFileSync(join(ROOT, 'assets/fonts', f)).toString('base64')})`);
html = html.replace(/<link rel="stylesheet" href="assets\/css\/style\.css">/, () => `<style>\n${css}\n</style>`);
html = html.replace(/<script src="([^"]+)"( defer)?><\/script>/g, (m, src) => {
  const code = read(src).replace(/<\/script/gi, '<\\/script');
  return `<script>/* ${src} */\n${code}\n</script>`;
});
mkdirSync(join(ROOT, 'dist'), { recursive: true });
writeFileSync(join(ROOT, 'dist/standalone.html'), html);
console.log(`dist/standalone.html: ${(html.length / 1024 / 1024).toFixed(2)} MB`);

// Версия для публикации артефактом: без собственных doctype/html/head/body (их добавляет хостинг) и с флагом встраивания.
const art = html
  .replace(/<!doctype html>\s*/i, '')
  .replace(/<html[^>]*>\s*<head>/i, '')
  .replace(/<\/head>\s*<body>/i, '<script>window.BL_EMBED=true;</script>')
  .replace(/<\/body>\s*<\/html>\s*$/i, '')
  .replace(/<title>[^<]*<\/title>/, '<title>BilimLens</title>')
  .replace(/<meta charset="utf-8">\s*<meta name="viewport"[^>]*>/i, '');
writeFileSync(join(ROOT, 'dist/artifact.html'), art);
console.log(`dist/artifact.html: ${(art.length / 1024 / 1024).toFixed(2)} MB; starts: ${art.slice(0, 40).replace(/\n/g, ' ')}`);
