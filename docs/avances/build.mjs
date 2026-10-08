// Genera docs/avances/index.html (presentación 16:9, imprimible a PDF) a partir de slides.json.
// Uso: node docs/avances/build.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const deck = JSON.parse(readFileSync(join(here, 'slides.json'), 'utf8'));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

const flow = (items) => `<div class="flow">${items.map((t, i) => `<div class="box c${i}">${esc(t)}</div>${i < items.length - 1 ? '<span class="arrow">→</span>' : ''}`).join('')}</div>`;
const table = (rows) => `<table>${rows.map((r, i) => `<tr>${r.map((c) => (i ? `<td>${esc(c)}</td>` : `<th>${esc(c)}</th>`)).join('')}</tr>`).join('')}</table>`;
const stats = (items) => `<div class="stats">${items.map(([v, l]) => `<div><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>`;

const slides = deck.slides.map((s, n) => {
  if (s.kind === 'cover') return `<section class="slide cover"><h1>${esc(s.title)}</h1><p>${esc(s.subtitle)}</p><small>${esc(deck.date)}</small></section>`;
  return `<section class="slide"><h2>${esc(s.title)}</h2><p class="lead">${esc(s.lead ?? '')}</p>` +
    (s.flow ? flow(s.flow) : '') + (s.stats ? stats(s.stats) : '') + (s.table ? table(s.table) : '') +
    (s.bullets?.length ? `<ul>${s.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : '') +
    (s.note ? `<p class="note">${esc(s.note)}</p>` : '') + `<footer>${esc(deck.title)} · ${n + 1}/${deck.slides.length}</footer></section>`;
}).join('\n');

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(deck.title)}</title><style>
@page{size:1280px 720px;margin:0}*{box-sizing:border-box}body{margin:0;background:#dfe5ef;font:22px/1.45 -apple-system,"Segoe UI",Roboto,sans-serif;color:#1b2536}
.slide{width:1280px;height:720px;margin:16px auto;padding:56px 72px;background:#fff;position:relative;overflow:hidden;break-after:page;page-break-after:always}
@media print{body{background:#fff}.slide{margin:0}}@media screen and (max-width:1320px){body{zoom:.7}}@media screen and (max-width:960px){body{zoom:.45}}
h1{font-size:76px;line-height:1.05;margin:0 0 18px}h2{font-size:46px;margin:0 0 6px}.lead{font-size:26px;color:#4a5872;margin:0 0 26px}
ul{margin:0;padding-left:30px}li{margin:10px 0}.note{position:absolute;left:72px;right:72px;bottom:70px;color:#5b6679;font-size:20px}
footer{position:absolute;left:72px;bottom:26px;font-size:15px;color:#8a95a8}
.cover{background:linear-gradient(145deg,#0f1b33,#1d3a8a 62%,#e0533d);color:#fff;display:flex;flex-direction:column;justify-content:center}.cover p{font-size:30px;color:#dbe4ff;margin:0 0 40px}.cover small{color:#ffb4a6;font-size:20px}
.flow{display:flex;align-items:center;gap:14px;margin:40px 0}.box{flex:1;padding:30px 12px;border-radius:16px;color:#fff;font-weight:700;text-align:center;font-size:24px}.arrow{font-size:34px}
.c0{background:#2f6fed}.c1{background:#4b5d7a}.c2{background:#e0533d}.c3{background:#2b9a6b}
table{border-collapse:collapse;width:100%;font-size:24px}td,th{padding:14px 16px;border-bottom:2px solid #e3e8f1;text-align:left}th{color:#5b6679}
.stats{display:flex;gap:24px;margin:10px 0 26px}.stats div{flex:1;background:#f1f5fb;border-radius:16px;padding:20px 24px}.stats b{display:block;font-size:64px;color:#2f6fed;line-height:1}.stats span{color:#5b6679}
</style></head><body>
${slides}
</body></html>`;
writeFileSync(join(here, 'index.html'), html);
console.log('docs/avances/index.html', html.length, 'bytes,', deck.slides.length, 'diapositivas');
