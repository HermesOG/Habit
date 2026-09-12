// Собирает vendor/icons.css: только те иконки Tabler, что реально используются в index.html
// и CharacterStage.dc.html, как mask-image (data:URI). Заменяет шрифт на 878 КБ.
//
//   node tools/build-icons.mjs <путь к распакованному пакету @tabler/icons>
//
// Разметка в шаблонах не меняется: <i class="ti ti-flame"> работает как раньше,
// размер — от font-size (1em), цвет — от color (currentColor).
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = process.argv[2];
if (!pkg) { console.error('usage: node tools/build-icons.mjs <tabler-icons-package-dir>'); process.exit(1); }

const sources = ['index.html', 'CharacterStage.dc.html']
  .map((f) => readFileSync(join(root, f), 'utf8')).join('\n');
const names = [...new Set([...sources.matchAll(/\bti-([a-z0-9-]+)/g)].map((m) => m[1]))].sort();

function svgFor(name) {
  // «-filled» — из набора filled, остальное — outline
  const filled = name.endsWith('-filled');
  const file = filled ? join(pkg, 'icons/filled', name.replace(/-filled$/, '') + '.svg')
                      : join(pkg, 'icons/outline', name + '.svg');
  if (!existsSync(file)) return null;
  let svg = readFileSync(file, 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+class="[^"]*"/g, '')
    .replace(/\s+width="\d+"\s+height="\d+"/, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/>\s+</g, '><')
    .trim();
  // Маска использует только альфа-канал, поэтому цвет внутри SVG не важен —
  // но stroke должен быть непрозрачным.
  svg = svg.replace(/stroke="currentColor"/g, 'stroke="#000"').replace(/fill="currentColor"/g, 'fill="#000"');
  return svg;
}

const enc = (svg) => "url(\"data:image/svg+xml," + svg
  .replace(/"/g, "'")
  .replace(/#/g, '%23')
  .replace(/</g, '%3C').replace(/>/g, '%3E')
  .replace(/\s/g, ' ') + "\")";

let css = `/* Сгенерировано tools/build-icons.mjs — ${names.length} иконок Tabler 3.24 как mask-image.
   Не редактировать руками: добавил иконку в шаблон — пересобери. */
.ti{display:inline-block;width:1em;height:1em;flex:none;vertical-align:-.125em;background-color:currentColor;
  -webkit-mask:var(--ti) no-repeat center/contain;mask:var(--ti) no-repeat center/contain}
`;
const missing = [];
for (const n of names) {
  const svg = svgFor(n);
  if (!svg) { missing.push(n); continue; }
  css += `.ti-${n}{--ti:${enc(svg)}}\n`;
}
writeFileSync(join(root, 'vendor/icons.css'), css);
console.log(`icons: ${names.length - missing.length} written, ${Buffer.byteLength(css)} bytes` + (missing.length ? `, MISSING: ${missing.join(' ')}` : ''));
if (missing.length) process.exit(2);
