// Genera docs/informe/informe.html (autocontenido, imprimible) a partir de data/runs-demo.json.
// Los datos los produce la librería C++ (neos-cube, examples/simulate_runs.cpp). Aquí solo se cuentan y se dibujan;
// no hay inferencia ni matemática de producto.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(here, 'data/runs-demo.json'), 'utf8'));
const runs = data.runs;
const profiles = [['cautelosos', 'Prudentes', '#2f6fed'], ['arriesgados', 'Arriesgados', '#e0533d'], ['cambiantes', 'Cambiantes', '#8a5cf6']];
const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);

// Ritmo de construcción (commits por día en choisys, 4-8 oct 2026; medido con git log).
const pace = [['4 oct', 6], ['5 oct', 1], ['6 oct', 24], ['7 oct', 56], ['8 oct', 13]];

const total = runs.length;
const completed = runs.filter((r) => r.completed).length;
const visited = [0, 1, 2].map((p) => runs.filter((r) => r.sessions[p].visited).length);
const doneByProfile = profiles.map(([id]) => {
  const g = runs.filter((r) => r.profile === id);
  return { n: g.length, ok: g.filter((r) => r.completed).length, att: g.reduce((s, r) => s + r.totalAttempts, 0) / g.length };
});
const errs = { empty: 0, invalid: 0, outside: 0 };
for (const r of runs) for (const s of r.sessions) { errs.empty += s.empty; errs.invalid += s.invalid; errs.outside += s.outside; }

const grid = (filter) => {
  const g = Array.from({ length: 3 }, () => [0, 0, 0]);
  let n = 0;
  for (const r of runs) if (filter(r)) for (const m of r.measurements) { g[m.row - 1][m.column - 1]++; n++; }
  return { g, n };
};
const heat = ({ g, n }, color) => {
  const max = Math.max(...g.flat(), 1);
  const cells = g.map((row, i) => row.map((v, j) => {
    const a = (0.12 + 0.88 * v / max).toFixed(2);
    return `<rect x="${j * 62}" y="${i * 62}" width="58" height="58" rx="8" fill="${color}" fill-opacity="${a}"/>` +
      `<text x="${j * 62 + 29}" y="${i * 62 + 34}" text-anchor="middle" font-size="14" font-weight="700" fill="${v / max > 0.55 ? '#fff' : '#1b2536'}">${pct(v, n)}%</text>`;
  }).join('')).join('');
  return `<svg viewBox="0 0 182 182" class="heat">${cells}</svg>`;
};

const bars = (items, w, h, unit = '') => {
  const max = Math.max(...items.map((i) => i.v));
  const bw = w / items.length;
  return `<svg viewBox="0 0 ${w} ${h + 34}" class="chart">` + items.map((it, i) => {
    const bh = Math.round((h - 20) * it.v / max);
    return `<rect x="${i * bw + 14}" y="${h - bh}" width="${bw - 28}" height="${bh}" rx="6" fill="${it.c || '#2f6fed'}"/>` +
      `<text x="${i * bw + bw / 2}" y="${h - bh - 6}" text-anchor="middle" font-size="13" font-weight="700" fill="#1b2536">${it.v}${unit}</text>` +
      `<text x="${i * bw + bw / 2}" y="${h + 18}" text-anchor="middle" font-size="12" fill="#5b6679">${it.l}</text>`;
  }).join('') + '</svg>';
};

const funnel = [['Empiezan', total], ['Eligen en fase 1', visited[0]], ['Llegan a fase 2', visited[1]], ['Llegan a fase 3', visited[2]], ['Terminan las 3', completed]]
  .map(([l, v], i) => {
    const w = Math.round(380 * v / total);
    return `<rect x="0" y="${i * 44}" width="${w}" height="34" rx="8" fill="#2f6fed" fill-opacity="${1 - i * 0.15}"/>` +
      `<text x="${w + 10}" y="${i * 44 + 22}" font-size="14" font-weight="700" fill="#1b2536">${v} <tspan font-weight="400" fill="#5b6679">(${pct(v, total)}%) · ${l}</tspan></text>`;
  }).join('');

// Cubo isométrico con el recorrido del primer Run completado.
const example = runs.find((r) => r.completed);
const iso = (x, y, z) => [180 + (x - y) * 52, 215 + (x + y) * 30 - z * 60];
const pt = (a) => a.map((v) => v.toFixed(1)).join(',');
const cube = (() => {
  let s = '';
  for (let k = 0; k < 3; k++) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const f = [iso(j, i, k + 1), iso(j + 1, i, k + 1), iso(j + 1, i + 1, k + 1), iso(j, i + 1, k + 1)];
    const hit = example.measurements.find((m) => m.phase === k + 1 && m.row === i + 1 && m.column === j + 1);
    s += `<polygon points="${f.map(pt).join(' ')}" fill="${hit ? '#e0533d' : '#2f6fed'}" fill-opacity="${hit ? 0.9 : 0.07 + k * 0.03}" stroke="#2f6fed" stroke-opacity="0.35"/>`;
  }
  const c = example.measurements.map((m) => iso(m.column - 0.5, m.row - 0.5, m.phase - 0.5));
  s += `<polyline points="${c.map(pt).join(' ')}" fill="none" stroke="#1b2536" stroke-width="3" stroke-dasharray="6 5"/>`;
  s += c.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="11" fill="#1b2536"/><text x="${p[0]}" y="${p[1] + 4}" text-anchor="middle" font-size="12" font-weight="700" fill="#fff">${i + 1}</text>`).join('');
  return `<svg viewBox="0 20 360 340" class="chart">${s}</svg>`;
})();

const box = (x, y, w, t1, t2, c) => `<rect x="${x}" y="${y}" width="${w}" height="74" rx="12" fill="${c}"/><text x="${x + w / 2}" y="${y + 32}" text-anchor="middle" font-size="15" font-weight="700" fill="#fff">${t1}</text><text x="${x + w / 2}" y="${y + 53}" text-anchor="middle" font-size="12" fill="#fff" fill-opacity=".85">${t2}</text>`;
const flow = `<svg viewBox="0 0 760 110" class="chart">${box(0, 18, 168, 'Aplicación móvil', 'La persona decide', '#2f6fed')}${box(196, 18, 168, 'Servicio del producto', 'Controla acceso y orden', '#4b5d7a')}${box(392, 18, 168, 'Librería de cálculo', 'C++ · registra cada decisión', '#e0533d')}${box(588, 18, 172, 'Base de datos', 'Guarda solo lo aprobado', '#2b9a6b')}` +
  [168, 364, 560].map((x) => `<path d="M${x + 4} 55 h20" stroke="#1b2536" stroke-width="2.5" marker-end="url(#a)"/>`).join('') + `<defs><marker id="a" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8z" fill="#1b2536"/></marker></defs></svg>`;

const light = (c, t, d) => `<div class="light"><i style="background:${c}"></i><div><b>${t}</b><span>${d}</span></div></div>`;
const G = '#2b9a6b', Y = '#e6a700', R = '#c9402e';
const kpi = (v, l) => `<div class="kpi"><b>${v}</b><span>${l}</span></div>`;

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Informe ejecutivo · choisys y el Cubo de Neo</title>
<style>
@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;font:15px/1.55 -apple-system,"Segoe UI",Roboto,sans-serif;color:#1b2536;background:#e9edf3}
.page{width:210mm;height:297mm;margin:12px auto;padding:16mm 17mm;background:#fff;position:relative;page-break-after:always;break-after:page;overflow:hidden}
@media print{body{background:#fff}.page{margin:0}}
h1{font-size:40px;line-height:1.1;margin:0 0 12px}h2{font-size:26px;margin:0 0 6px}h3{font-size:16px;margin:16px 0 6px}p{margin:6px 0}.lead{font-size:18px;color:#34425a}
.tag{display:inline-block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#2f6fed;font-weight:700;margin-bottom:8px}
.cover{background:linear-gradient(145deg,#0f1b33,#1d3a8a 60%,#e0533d);color:#fff}.cover .lead,.cover p{color:#dbe4ff}.cover .tag{color:#ffb4a6}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:16px 0}.kpi{background:#f3f6fb;border-radius:12px;padding:12px}.kpi b{display:block;font-size:26px;color:#2f6fed}.kpi span{font-size:12px;color:#5b6679}
.cover .kpi{background:rgba(255,255,255,.12)}.cover .kpi b{color:#fff}.cover .kpi span{color:#dbe4ff}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:20px}.chart{width:100%;height:auto}.heat{width:100%;max-width:170px}
.card{background:#f3f6fb;border-radius:14px;padding:14px 16px;margin:10px 0}.note{font-size:12.5px;color:#5b6679}
.sim{display:inline-block;background:#fff3d6;color:#8a5d00;border-radius:999px;padding:2px 10px;font-size:11.5px;font-weight:700}
.light{display:flex;gap:12px;align-items:flex-start;margin:9px 0}.light i{flex:none;width:16px;height:16px;border-radius:50%;margin-top:4px}.light b{display:block}.light span{font-size:13px;color:#5b6679}
.heats{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;text-align:center}.heats b{display:block;margin-top:6px;font-size:13px}
table{border-collapse:collapse;width:100%;font-size:13px}td,th{border-bottom:1px solid #dfe5ee;padding:6px 8px;text-align:left}th{color:#5b6679;font-weight:600}
dt{font-weight:700;margin-top:8px}dd{margin:0;color:#34425a}
</style></head><body>

<section class="page cover"><span class="tag">Informe ejecutivo · 8 de octubre de 2026</span>
<h1>choisys y el Cubo de Neo</h1>
<p class="lead">Una forma estructurada de registrar cómo se toman decisiones, construida en pocos días y ya funcionando de extremo a extremo.</p>
<div class="kpis">${kpi('5 días', 'de construcción (4–8 oct)')}${kpi('100', 'cambios guardados en el producto')}${kpi('27', 'decisiones posibles por recorrido')}${kpi('0', 'datos de personas reales en este informe')}</div>
<p style="margin-top:40mm">Preparado para equipos no técnicos. No exige conocimientos de programación ni de matemáticas.</p>
<p class="note" style="color:#c7d3f5">Los números de uso de este documento proceden de una <b>simulación</b> hecha con la librería real, para ilustrar qué se podrá ver. No describen a ninguna persona.</p></section>

<section class="page"><span class="tag">Resumen</span><h2>Lo esencial en un minuto</h2>
<p class="lead">choisys presenta a una persona una sucesión de decisiones sencillas y guarda, de forma ordenada y verificable, qué eligió y cómo lo hizo.</p>
<div class="card"><b>Qué hace hoy</b><br>Recoge 3 decisiones por persona, cada una en una cuadrícula de 3×3. Anota qué casilla eligió, cuántos intentos necesitó y si dudó o se equivocó. Todo pasa por un motor de cálculo propio, escrito en C++.</div>
<div class="card"><b>Qué todavía no hace (y lo decimos claro)</b><br>No interpreta ni puntúa a nadie. Esa capa —la que convertiría el registro en conclusiones— no está construida y no se construirá hasta que una especificación aprobada defina cómo.</div>
<div class="card"><b>Por qué importa</b><br>Un registro fiable y estandarizado es la base de cualquier análisis posterior. Hoy ya se puede probar con grupos piloto y comparar resultados con un criterio común.</div>
<h3>Cifras de la demostración <span class="sim">SIMULADO</span></h3>
<div class="kpis">${kpi(total, 'recorridos simulados')}${kpi(pct(completed, total) + '%', 'los terminan')}${kpi((runs.reduce((s, r) => s + r.totalAttempts, 0) / total).toFixed(1), 'intentos de media')}${kpi(runs.reduce((s, r) => s + r.measurements.length, 0), 'decisiones registradas')}</div></section>

<section class="page"><span class="tag">Cómo funciona</span><h2>Del toque en el móvil al dato guardado</h2>
<p>Cada pieza hace una sola cosa y las decisiones importantes pasan siempre por el motor de cálculo.</p>${flow}
<div class="cols"><div><h3>El Cubo, explicado sin números</h3><p>Imagine tres cuadrículas apiladas, como tres plantas de un edificio. En cada planta la persona elige <b>una</b> casilla entre nueve. Tres plantas × nueve casillas = <b>27 posibles puntos de decisión</b>, y cada recorrido deja una línea que une las tres elecciones.</p><p>Esa línea es el “rastro” de una persona: sencillo de guardar, fácil de comparar.</p></div><div>${cube}<p class="note" style="text-align:center">Ejemplo generado por la librería: los puntos rojos son las tres elecciones, unidas por la línea.</p></div></div></section>

<section class="page"><span class="tag">Datos de demostración · simulado</span><h2>Qué se podrá ver con grupos reales</h2>
<p class="note">${total} recorridos generados por la librería C++ con tres comportamientos inventados. Sirven para enseñar el tipo de lectura, no para sacar conclusiones sobre nadie.</p>
<h3>¿Cuánta gente llega hasta el final?</h3><svg viewBox="0 0 760 222" class="chart">${funnel}</svg>
<h3>¿Qué casillas se eligen más? (cada grupo, 3 fases juntas)</h3>
<div class="heats">${profiles.map(([id, name, c]) => `<div>${heat(grid((r) => r.profile === id), c)}<b>${name}</b></div>`).join('')}</div>
<p class="note">Más intenso = más elegida. Los prudentes se agrupan en el centro, los arriesgados en las esquinas, los cambiantes se reparten: una diferencia visible a simple vista.</p></section>

<section class="page"><span class="tag">Datos de demostración · simulado</span><h2>Comparar grupos y detectar fricción</h2>
<div class="cols"><div><h3>% que termina</h3>${bars(profiles.map(([, n, c], i) => ({ l: n, v: pct(doneByProfile[i].ok, doneByProfile[i].n), c })), 330, 190, '%')}</div>
<div><h3>Intentos medios por recorrido</h3>${bars(profiles.map(([, n, c], i) => ({ l: n, v: +doneByProfile[i].att.toFixed(2), c })), 330, 190)}</div></div>
<h3>Qué tropiezos aparecen</h3>${bars([{ l: 'Sin responder', v: errs.empty, c: '#e6a700' }, { l: 'Casilla inválida', v: errs.invalid, c: '#c9402e' }, { l: 'Toque fuera', v: errs.outside, c: '#8a5cf6' }], 520, 170)}
<div class="card"><b>Cómo se usaría</b><br>Si un grupo abandona más en la fase 2 o acumula toques fuera, el problema suele ser de diseño de la pantalla, no de las personas. Esta vista permite corregirlo antes de un despliegue amplio.</div></section>

<section class="page"><span class="tag">Estado</span><h2>Dónde estamos</h2>
${light(G, 'Registro de decisiones', 'Funciona de extremo a extremo y está cubierto por pruebas automáticas.')}
${light(G, 'Motor de cálculo en C++', 'Público, determinista (mismo dato, mismo resultado) y con pruebas propias.')}
${light(G, 'Instalación en un comando', 'Windows, Mac y Linux. Verificado en Windows.')}
${light(Y, 'Funcionamiento en Mac', 'Preparado; la primera ejecución real está pendiente de hacerse en el equipo.')}
${light(Y, 'Base de datos y cuentas', 'Estructura y roles listos; falta rotar una contraseña de pruebas y abrir cuentas reales.')}
${light(R, 'Interpretación de resultados', 'No existe, por decisión: requiere antes una especificación matemática aprobada.')}
<h3>Calidad y seguridad (nivel directivo)</h3>
<p>El motor solo acepta conexiones de la propia máquina, exige credencial, limita tamaño y tiempo de cada petición y no guarda en sus registros ni las elecciones ni los identificadores. Se hizo una revisión de amenazas y se corrigió una regresión antes de integrarla. Todo cambio pasa por revisión del propietario antes de entrar.</p>
<h3>Ritmo de construcción · cambios por día</h3>${bars(pace.map(([l, v]) => ({ l, v, c: '#2f6fed' })), 520, 150)}</section>

<section class="page"><span class="tag">Siguientes pasos</span><h2>Hoja de ruta y oportunidades</h2>
<table><tr><th>Fase</th><th>Qué</th><th>Necesita</th></tr>
<tr><td><b>Ahora</b></td><td>Prueba en Mac, cuentas reales, piloto interno de 20–50 personas</td><td>Equipo y 2 semanas</td></tr>
<tr><td><b>Después</b></td><td>Panel de resultados para responsables (vistas como las de este informe, con datos reales)</td><td>Decisión sobre qué mostrar</td></tr>
<tr><td><b>Con aprobación</b></td><td>Capa de interpretación en el motor</td><td>Especificación matemática aprobada</td></tr></table>
<h3>Hipótesis de valor para empresas <span class="sim">por validar</span></h3>
<p>Son hipótesis, no resultados medidos: (1) <b>selección y desarrollo</b>, comparando cómo decide cada equipo con un criterio común; (2) <b>formación</b>, midiendo dónde se atascan los participantes; (3) <b>investigación interna</b>, con registros homogéneos entre grupos. Cada una exige piloto y revisión legal de protección de datos antes de usarse con personas reales.</p>
<h3>Glosario</h3><dl><dt>Recorrido</dt><dd>Las tres decisiones de una persona, de principio a fin.</dd><dt>Fase</dt><dd>Cada una de las tres cuadrículas.</dd><dt>Motor / librería</dt><dd>El programa en C++ que registra y ordena las decisiones.</dd><dt>Determinista</dt><dd>Con los mismos datos, siempre el mismo resultado.</dd></dl>
<h3>Anexo · repositorios</h3><p class="note">choisys (producto, TypeScript) · neos-cube (motor, C++, ~1.150 líneas) · neo-cube-web (utilidades públicas) · scenarys (web corporativa, privado). Reproducible: <code>node docs/informe/build.mjs</code> y <code>examples/simulate_runs.cpp</code>.</p></section>
</body></html>`;
writeFileSync(join(here, 'informe.html'), html);
console.log('informe.html', html.length, 'bytes');
