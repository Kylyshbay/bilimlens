// Декодирует QR-код на последнем слайде и сверяет с адресом MVP. Запуск: node scripts/check-qr.mjs
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const jsQR = require(join(ROOT, 'scripts/node_modules/jsqr'));
const { PNG } = require(join(ROOT, 'scripts/node_modules/pngjs'));
const png = PNG.sync.read(readFileSync(join(ROOT, 'presentation/preview/slide-13.png')));
const code = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
const want = readFileSync(join(ROOT, 'presentation/mvp-url.txt'), 'utf8').trim();
console.log('QR:', code && code.data, code && code.data === want ? 'OK' : 'MISMATCH (ожидалось ' + want + ')');
process.exit(code && code.data === want ? 0 : 1);
