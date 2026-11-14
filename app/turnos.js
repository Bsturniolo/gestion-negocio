'use strict';
/* Turnos del personal: planilla por día (horas × personas, pintando con el color
   de cada uno), planilla general de la semana, horas vs. metas y rendimiento. */

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const COLORES = ['#e53935', '#fb8c00', '#fdd835', '#7cb342', '#2e7d32', '#00897b', '#1e88e5', '#3949ab', '#8e24aa', '#d81b60', '#6d4c41', '#546e7a', '#f06292', '#9ccc65', '#4dd0e1', '#ffb74d'];
Object.assign(ui, { turTab: 'dia', turFecha: todayStr(), turMes: todayStr().slice(0, 7), turPintar: true });

const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const toMin = (s) => { const [h, m] = String(s || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const fmtH = (h) => fmtNum(Math.round(h * 10) / 10) + ' h';
const lunes = (f) => { const d = parseD(f); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d); };
const addDays = (f, k) => { const d = parseD(f); d.setDate(d.getDate() + k); return ymd(d); };
const semana = (f) => { const l = lunes(f); return [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(l, i)); };
const turCfg = () => Object.assign({ inicio: 6, fin: 22, intervalo: 60 }, state.config.turnos || {});
const persona = (id) => state.personal.find((p) => p.id === id);
const activos = () => state.personal.filter((p) => p.activo !== false).sort((a, b) => (a.orden || 0) - (b.orden || 0) || a.nombre.localeCompare(b.nombre));
const diaDoc = (f) => state.turnos.find((t) => t.id === f);
const textoSobre = (hex) => { const n = parseInt(String(hex).slice(1), 16); const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#1d2624' : '#fff'; };

function horasDia(f, pid) { const d = diaDoc(f); return d ? ((d.celdas || {})[pid] || []).length * (d.intervalo || 60) / 60 : 0; }
function horasRango(pid, desde, hasta) { return state.turnos.filter((t) => t.fecha >= desde && t.fecha <= hasta).reduce((s, t) => s + ((t.celdas || {})[pid] || []).length * (t.intervalo || 60) / 60, 0); }
function diasTrabajados(pid, desde, hasta) { return state.turnos.filter((t) => t.fecha >= desde && t.fecha <= hasta && ((t.celdas || {})[pid] || []).length).length; }
function metaMes(p) { return p.metaMensual > 0 ? p.metaMensual : p.metaSemanal > 0 ? Math.round(p.metaSemanal * 4.33) : 0; }
function slotsDe(f) {
  const c = turCfg(), d = diaDoc(f), iv = d ? d.intervalo || 60 : c.intervalo;
  let ini = c.inicio * 60, fin = c.fin * 60;
  if (d) Object.values(d.celdas || {}).flat().forEach((m) => { ini = Math.min(ini, m); fin = Math.max(fin, m + iv); });
  ini = Math.floor(ini / iv) * iv;
  const out = []; for (let m = ini; m < fin; m += iv) out.push(m);
  return { iv, slots: out };
}
function gente(f) { // activos + quien tenga horas ese día aunque esté inactivo
  const d = diaDoc(f), ids = new Set(activos().map((p) => p.id));
  const extra = d ? Object.keys(d.celdas || {}).filter((id) => !ids.has(id) && (d.celdas[id] || []).length && persona(id)).map(persona) : [];
  return [...activos(), ...extra];
}
function ensureDia(f) {
  let d = diaDoc(f);
  if (!d) { d = { id: f, fecha: f, intervalo: turCfg().intervalo, celdas: {}, nota: '' }; state.turnos.push(d); }
  return d;
}
function limpiarVacios() { state.turnos = state.turnos.filter((t) => Object.values(t.celdas || {}).some((a) => a.length) || t.nota); }
const difBadge = (h, meta) => {
  if (!meta) return '<span class="badge gray">Sin meta</span>';
  const d = Math.round((h - meta) * 10) / 10;
  return d >= 0 ? `<span class="badge in">Cumplió${d > 0 ? ' +' + fmtH(d) : ''}</span>` : `<span class="badge out">Debe ${fmtH(-d)}</span>`;
};

// ---------- Grilla de un día ----------
function grilla(f, compact) {
  const ppl = gente(f), { iv, slots } = slotsDe(f), d = diaDoc(f), cel = (d && d.celdas) || {};
  if (!ppl.length) return `<div class="card empty">Primero cargá el personal en la pestaña <b>Personal</b>.</div>`;
  const sets = Object.fromEntries(ppl.map((p) => [p.id, new Set(cel[p.id] || [])]));
  const body = slots.map((m) => `<tr><th class="tg-h">${hhmm(m)}</th>${ppl.map((p) => {
    const on = sets[p.id].has(m);
    let letra = '';
    if (on) { let k = 0; for (let x = m - iv; sets[p.id].has(x); x -= iv) k++; const n = p.nombre.toUpperCase(); letra = n[k] || ''; }
    return `<td class="tg-c${on ? ' on' : ''}" data-p="${p.id}" data-m="${m}" data-f="${f}" style="${on ? `background:${p.color};color:${textoSobre(p.color)}` : ''}">${compact ? '' : esc(letra)}</td>`;
  }).join('')}</tr>`).join('');
  return `<div class="tg-wrap${compact ? ' compact' : ''}"><table class="tg${ui.turPintar ? ' pintar' : ''}" data-iv="${iv}">
    <thead><tr><th class="tg-h"></th>${ppl.map((p) => `<th class="tg-p" title="${esc(p.nombre)}"><span class="sw" style="background:${p.color}"></span>${esc(compact ? p.nombre.slice(0, 3) : p.nombre)}</th>`).join('')}</tr></thead>
    <tbody>${body}</tbody>
    <tfoot><tr><th class="tg-h">Horas</th>${ppl.map((p) => `<th>${fmtNum(horasDia(f, p.id))}</th>`).join('')}</tr></tfoot></table></div>`;
}

// pintar arrastrando (mouse y dedo)
let paint = null;
document.addEventListener('pointerdown', (e) => {
  const td = e.target.closest('.tg.pintar td.tg-c'); if (!td || e.button > 0) return;
  e.preventDefault();
  const d = ensureDia(td.dataset.f);
  paint = { f: td.dataset.f, pid: td.dataset.p, add: !td.classList.contains('on'), d, iv: Number(td.closest('.tg').dataset.iv) };
  paintCell(td);
});
document.addEventListener('pointermove', (e) => {
  if (!paint) return;
  const el = document.elementFromPoint(e.clientX, e.clientY); const td = el && el.closest && el.closest('td.tg-c');
  if (td && td.dataset.f === paint.f && td.dataset.p === paint.pid) paintCell(td);
});
['pointerup', 'pointercancel'].forEach((ev) => document.addEventListener(ev, () => { if (!paint) return; paint = null; limpiarVacios(); commit(); }));
function paintCell(td) {
  const m = Number(td.dataset.m), arr = paint.d.celdas[paint.pid] || (paint.d.celdas[paint.pid] = []), i = arr.indexOf(m);
  if (paint.add && i < 0) arr.push(m); else if (!paint.add && i >= 0) arr.splice(i, 1);
  arr.sort((a, b) => a - b);
  const p = persona(paint.pid); td.classList.toggle('on', paint.add);
  td.style.background = paint.add ? p.color : ''; td.style.color = paint.add ? textoSobre(p.color) : '';
}

// ---------- Vistas ----------
function vTurnos() {
  const tabs = [['dia', '📋 Día'], ['semana', '🗓 Semana'], ['mes', '📈 Rendimiento'], ['personal', '👤 Personal']];
  const fn = { dia: tDia, semana: tSemana, mes: tMes, personal: tPersonal }[ui.turTab];
  return `<div class="spread"><div><h1>Turnos del personal</h1><p class="sub">Planilla por día, conteo de horas y metas.</p></div></div>
  <div class="tabs">${tabs.map(([k, l]) => `<button class="${ui.turTab === k ? 'on' : ''}" data-act="turTab" data-id="${k}">${l}</button>`).join('')}</div>${fn()}`;
}

function tDia() {
  const f = ui.turFecha, d = parseD(f), dow = (d.getDay() + 6) % 7;
  const ppl = gente(f), tot = ppl.reduce((s, p) => s + horasDia(f, p.id), 0);
  return `<div class="card" style="margin-bottom:12px"><div class="spread">
    <div class="row"><button data-act="turDia" data-id="-1">◀</button><input type="date" data-bind="turFecha" value="${f}" style="width:auto"><button data-act="turDia" data-id="1">▶</button><button class="sm" data-act="turHoy">Hoy</button></div>
    <b style="font-size:17px">${DIAS[dow]} ${d.getDate()} de ${MESES[d.getMonth()]}</b></div>
    <div class="row mt">
      <button class="pri" data-act="turRapido">➕ Cargar turno (de … a …)</button>
      <button data-act="turCopiar" data-id="-1">Copiar del día anterior</button>
      <button data-act="turCopiar" data-id="-7">Copiar del ${DIAS[dow].toLowerCase()} pasado</button>
      <button class="danger" data-act="turLimpiar">Borrar día</button>
      <label class="small row" style="gap:6px;margin-left:auto"><input type="checkbox" data-act="turPintarTog" ${ui.turPintar ? 'checked' : ''} style="width:auto"> Pintar tocando la grilla</label>
    </div>
    <p class="small muted" style="margin:10px 0 0">${ui.turPintar ? 'Tocá o arrastrá sobre la columna de cada persona para marcar sus horas. Tocá una hora pintada para borrarla.' : 'Modo ver: la grilla no se modifica al tocarla (útil en el celular para desplazarse).'} Total del día: <b>${fmtH(tot)}</b>.</p>
  </div>${grilla(f)}`;
}

function tSemana() {
  const dias = semana(ui.turFecha), ppl = activos();
  const extra = state.personal.filter((p) => p.activo === false && dias.some((f) => horasDia(f, p.id)));
  const lista = [...ppl, ...extra];
  const [d0, d6] = [parseD(dias[0]), parseD(dias[6])];
  return `<div class="card no-print" style="margin-bottom:12px"><div class="spread">
    <div class="row"><button data-act="turSem" data-id="-7">◀</button><b>Semana del ${d0.getDate()}/${d0.getMonth() + 1} al ${d6.getDate()}/${d6.getMonth() + 1}/${d6.getFullYear()}</b><button data-act="turSem" data-id="7">▶</button><button class="sm" data-act="turHoy">Esta semana</button></div>
    <div class="row"><button data-act="turCopiarSem">Copiar semana anterior</button><button data-act="turPrint">🖨 Imprimir planilla</button></div></div>
    <p class="small muted" style="margin:8px 0 0">Tocá el título de un día para editarlo.</p></div>
  <div class="print-title">${esc(state.config.negocio)} · Turnos del ${d0.getDate()}/${d0.getMonth() + 1} al ${d6.getDate()}/${d6.getMonth() + 1}/${d6.getFullYear()}</div>
  <div class="semana">${dias.map((f, i) => `<div class="sem-dia"><div class="sem-tit" data-act="turAbrir" data-id="${f}">${DIAS[i]} ${parseD(f).getDate()}</div>${lista.length ? grillaSemana(f, lista) : ''}</div>`).join('')}</div>
  <h2>Horas de la semana</h2>
  ${lista.length ? `<div class="tablewrap"><table><thead><tr><th>Persona</th>${dias.map((f, i) => `<th class="num">${DIAS[i].slice(0, 3)} ${parseD(f).getDate()}</th>`).join('')}<th class="num">Total</th><th class="num">Meta</th><th>Estado</th></tr></thead><tbody>
  ${lista.map((p) => { const t = horasRango(p.id, dias[0], dias[6]); return `<tr><td><span class="sw" style="background:${p.color}"></span> <b>${esc(p.nombre)}</b></td>${dias.map((f) => { const h = horasDia(f, p.id); return `<td class="num ${h ? '' : 'muted'}">${h ? fmtNum(h) : '–'}</td>`; }).join('')}<td class="num"><b>${fmtH(t)}</b></td><td class="num">${p.metaSemanal ? fmtH(p.metaSemanal) : '–'}</td><td>${difBadge(t, p.metaSemanal)}</td></tr>`; }).join('')}
  <tr><td><b>Total</b></td>${dias.map((f) => `<td class="num"><b>${fmtNum(lista.reduce((s, p) => s + horasDia(f, p.id), 0))}</b></td>`).join('')}<td class="num"><b>${fmtH(lista.reduce((s, p) => s + horasRango(p.id, dias[0], dias[6]), 0))}</b></td><td></td><td></td></tr>
  </tbody></table></div>` : '<div class="card empty">Cargá el personal en la pestaña <b>Personal</b>.</div>'}`;
}
function grillaSemana(f, lista) { // versión chica, solo lectura, con nombre en vertical como la planilla en papel
  const { iv, slots } = slotsDe(f), d = diaDoc(f), cel = (d && d.celdas) || {};
  const ppl = lista.filter((p) => (cel[p.id] || []).length);
  if (!ppl.length) return `<div class="sem-vacio" data-act="turAbrir" data-id="${f}">Sin turnos<br><span class="small">tocá para cargar</span></div>`;
  const sets = Object.fromEntries(ppl.map((p) => [p.id, new Set(cel[p.id])]));
  return `<table class="tg mini" data-act="turAbrir" data-id="${f}"><tbody>${slots.map((m) => `<tr><th class="tg-h">${m % 60 === 0 ? m / 60 : ''}</th>${ppl.map((p) => {
    if (!sets[p.id].has(m)) return '<td></td>';
    let k = 0; for (let x = m - iv; sets[p.id].has(x); x -= iv) k++;
    return `<td style="background:${p.color};color:${textoSobre(p.color)}">${esc(p.nombre.toUpperCase()[k] || '')}</td>`;
  }).join('')}</tr>`).join('')}</tbody></table>`;
}

function tMes() {
  const [Y, M] = ui.turMes.split('-').map(Number), desde = `${ui.turMes}-01`, hasta = ymd(new Date(Y, M, 0));
  const lista = state.personal.filter((p) => p.activo !== false || horasRango(p.id, desde, hasta));
  // semanas (lunes) que tocan el mes
  const sems = []; for (let l = lunes(desde); l <= hasta; l = addDays(l, 7)) sems.push(l);
  const rows = lista.map((p) => { const h = horasRango(p.id, desde, hasta), meta = metaMes(p), dt = diasTrabajados(p.id, desde, hasta); return { p, h, meta, dt, pct: meta ? (h / meta) * 100 : 0 }; }).sort((a, b) => b.h - a.h);
  const totH = rows.reduce((s, r) => s + r.h, 0);
  return `<div class="row" style="margin-bottom:12px"><input type="month" data-bind="turMes" value="${ui.turMes}" style="width:auto"><span class="muted">Total del mes: <b>${fmtH(totH)}</b></span></div>
  ${rows.length ? `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr))">${rows.map((r) => `<div class="card">
    <div class="spread"><b><span class="sw" style="background:${r.p.color}"></span> ${esc(r.p.nombre)}</b>${difBadge(r.h, r.meta)}</div>
    <div style="font-size:24px;font-weight:700;margin-top:6px">${fmtH(r.h)} <span class="small muted" style="font-weight:400">${r.meta ? 'de ' + fmtH(r.meta) : ''}</span></div>
    <div class="progress mt"><div style="width:${Math.min(100, r.pct)}%;background:${r.pct >= 100 ? 'var(--in)' : r.pct >= 75 ? 'var(--warn)' : 'var(--out)'}"></div></div>
    <div class="small muted mt">${r.meta ? `${fmtNum(Math.round(r.pct))}% de la meta · ` : ''}${r.dt} día${r.dt === 1 ? '' : 's'} trabajado${r.dt === 1 ? '' : 's'}${r.dt ? ` · promedio ${fmtH(r.h / r.dt)} por día` : ''}</div>
  </div>`).join('')}</div>
  <h2>Semana por semana</h2>
  <div class="tablewrap"><table><thead><tr><th>Persona</th>${sems.map((l) => `<th class="num">Sem. ${parseD(l).getDate()}/${parseD(l).getMonth() + 1}</th>`).join('')}<th class="num">Meta semanal</th></tr></thead><tbody>
  ${rows.map(({ p }) => `<tr><td><span class="sw" style="background:${p.color}"></span> ${esc(p.nombre)}</td>${sems.map((l) => { const h = horasRango(p.id, l, addDays(l, 6)); const cls = !p.metaSemanal || !h ? '' : h >= p.metaSemanal ? 'c-in' : 'c-out'; return `<td class="num ${cls}">${h ? fmtNum(h) : '–'}</td>`; }).join('')}<td class="num">${p.metaSemanal ? fmtH(p.metaSemanal) : '–'}</td></tr>`).join('')}
  </tbody></table></div><p class="small muted">En verde las semanas que cumplió la meta y en rojo las que quedó debiendo horas. Las semanas que empiezan o terminan en otro mes se cuentan completas.</p>`
  : '<div class="card empty">Todavía no hay personal cargado.</div>'}`;
}

function tPersonal() {
  const c = turCfg();
  const lista = state.personal.slice().sort((a, b) => (a.activo === false) - (b.activo === false) || (a.orden || 0) - (b.orden || 0) || a.nombre.localeCompare(b.nombre));
  return `<div class="spread" style="margin-bottom:12px"><p class="muted" style="margin:0">Cada persona tiene su color en la planilla.</p><button class="pri" data-act="perNew">➕ Agregar persona</button></div>
  ${lista.length ? `<div class="tablewrap"><table><thead><tr><th>Nombre</th><th class="num">Meta semanal</th><th class="num">Meta mensual</th><th>Estado</th><th></th></tr></thead><tbody>
  ${lista.map((p) => `<tr${p.activo === false ? ' class="muted"' : ''}><td><span class="sw" style="background:${p.color}"></span> <b>${esc(p.nombre)}</b>${p.rol ? ` <span class="small muted">· ${esc(p.rol)}</span>` : ''}</td><td class="num">${p.metaSemanal ? fmtH(p.metaSemanal) : '–'}</td><td class="num">${metaMes(p) ? fmtH(metaMes(p)) + (p.metaMensual ? '' : ' <span class="small muted">(auto)</span>') : '–'}</td><td>${p.activo === false ? '<span class="badge gray">Ya no trabaja</span>' : '<span class="badge in">Activo</span>'}</td><td class="right"><button class="sm" data-act="perEdit" data-id="${p.id}">Editar</button></td></tr>`).join('')}
  </tbody></table></div>` : '<div class="card empty">Agregá a las personas que trabajan, cada una con su color.</div>'}
  <h2>Horario de la planilla</h2>
  <div class="card"><div class="form" style="grid-template-columns:repeat(3,1fr)">
    <label class="f">Desde la hora<input id="tcIni" type="number" min="0" max="23" value="${c.inicio}"></label>
    <label class="f">Hasta la hora<input id="tcFin" type="number" min="1" max="24" value="${c.fin}"></label>
    <label class="f">Cada casillero vale<select id="tcIv"><option value="60" ${c.intervalo === 60 ? 'selected' : ''}>1 hora</option><option value="30" ${c.intervalo === 30 ? 'selected' : ''}>media hora</option></select></label>
  </div><p class="small muted">Los días ya cargados mantienen su tamaño de casillero; el cambio se aplica a los días nuevos.</p><div class="modal-actions"><button class="pri" data-act="turCfgSave">Guardar horario</button></div></div>`;
}

// ---------- Formularios ----------
function perForm(p) {
  const isNew = !p; p = p || { nombre: '', rol: '', color: COLORES[state.personal.length % COLORES.length], metaSemanal: '', metaMensual: '', activo: true };
  let color = p.color;
  openModal(`<h3>${isNew ? 'Agregar persona' : 'Editar persona'}</h3><div class="form">
    <label class="f">Nombre *<input name="nombre" value="${esc(p.nombre)}" placeholder="Ej: Ana"></label>
    <label class="f">Puesto (opcional)<input name="rol" value="${esc(p.rol || '')}" placeholder="Ej: Barista, Cocina, Caja"></label>
    <div class="full"><div class="small muted" style="margin-bottom:6px">Color</div><div class="colores">${COLORES.map((c) => `<button type="button" class="col${c === color ? ' sel' : ''}" data-c="${c}" style="background:${c}"></button>`).join('')}<label class="col otro" title="Otro color"><input type="color" id="perColor" value="${color}"></label></div>
      <div class="mt"><span class="small muted">Así se ve: </span><span id="perPrev" class="badge" style="background:${color};color:${textoSobre(color)}">${esc(p.nombre || 'Nombre')}</span></div></div>
    <label class="f">Meta de horas por semana<input name="metaSemanal" inputmode="decimal" value="${p.metaSemanal || ''}" placeholder="Ej: 40"></label>
    <label class="f">Meta de horas por mes<input name="metaMensual" inputmode="decimal" value="${p.metaMensual || ''}" placeholder="Vacío = semanal × 4,33"></label>
    ${isNew ? '' : `<label class="f full" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="inactivo" ${p.activo === false ? 'checked' : ''} style="width:auto"> <span>Ya no trabaja (se oculta de la planilla pero se guardan sus horas)</span></label>`}
  </div><div class="modal-actions">${isNew ? '' : '<button class="danger" id="perDel">Eliminar</button>'}<button data-act="close">Cancelar</button><button class="pri" id="perOk">Guardar</button></div>`, (box) => {
    const setC = (c) => { color = c; $$('.col', box).forEach((b) => b.classList.toggle('sel', b.dataset.c === c)); const pv = $('#perPrev', box); pv.style.background = c; pv.style.color = textoSobre(c); };
    $('.colores', box).onclick = (e) => { const b = e.target.closest('button.col'); if (b) setC(b.dataset.c); };
    $('#perColor', box).oninput = (e) => setC(e.target.value);
    $('[name=nombre]', box).oninput = (e) => ($('#perPrev', box).textContent = e.target.value || 'Nombre');
    if (!isNew) $('#perDel', box).onclick = () => confirmBox(`Se va a eliminar a <b>${esc(p.nombre)}</b> <b>y todas sus horas cargadas</b>. Si solo dejó de trabajar, mejor tildá "Ya no trabaja".`, () => { state.personal = state.personal.filter((x) => x.id !== p.id); state.turnos.forEach((t) => { if (t.celdas) delete t.celdas[p.id]; }); limpiarVacios(); commit(); }, 'Eliminar');
    $('#perOk', box).onclick = () => {
      const v = vals(box); if (!v.nombre) return toast('Poné el nombre');
      const data = { nombre: v.nombre, rol: v.rol, color, metaSemanal: numIn(v.metaSemanal), metaMensual: numIn(v.metaMensual), activo: !v.inactivo };
      if (isNew) state.personal.push({ id: uid(), orden: state.personal.length, ...data }); else Object.assign(p, data);
      closeModal(); commit(); toast('Guardado ✔');
    };
  });
}
function turRapido() {
  const ppl = activos(); if (!ppl.length) { ui.turTab = 'personal'; render(); return toast('Primero agregá al personal'); }
  const iv = (diaDoc(ui.turFecha) || {}).intervalo || turCfg().intervalo;
  const horas = []; for (let m = 0; m <= 24 * 60; m += iv) horas.push(m);
  const opt = (sel) => horas.map((m) => `<option value="${m}" ${m === sel ? 'selected' : ''}>${hhmm(m)}</option>`).join('');
  openModal(`<h3>Cargar turno</h3><div class="form">
    <label class="f full">Persona<select name="pid">${ppl.map((p) => `<option value="${p.id}">${esc(p.nombre)}</option>`).join('')}</select></label>
    <label class="f">Desde<select name="desde">${opt(8 * 60)}</select></label>
    <label class="f">Hasta<select name="hasta">${opt(14 * 60)}</select></label>
    <div class="full"><div class="small muted" style="margin-bottom:6px">Días</div><div class="row">${semana(ui.turFecha).map((f, i) => `<label class="btn" style="gap:6px"><input type="checkbox" name="d${i}" ${f === ui.turFecha ? 'checked' : ''} style="width:auto"> ${DIAS[i].slice(0, 3)} ${parseD(f).getDate()}</label>`).join('')}</div></div>
  </div><div class="modal-actions"><button data-act="close">Cancelar</button><button class="pri" id="trOk">Cargar</button></div>`, (box) => {
    $('#trOk', box).onclick = () => {
      const v = vals(box), a = Number(v.desde), b = Number(v.hasta); if (b <= a) return toast('"Hasta" tiene que ser después de "Desde"');
      const dias = semana(ui.turFecha).filter((f, i) => v['d' + i]); if (!dias.length) return toast('Elegí al menos un día');
      dias.forEach((f) => { const d = ensureDia(f), s = d.intervalo || 60, arr = d.celdas[v.pid] || (d.celdas[v.pid] = []); for (let m = Math.floor(a / s) * s; m < b; m += s) if (!arr.includes(m)) arr.push(m); arr.sort((x, y) => x - y); });
      closeModal(); commit(); toast(`Turno cargado en ${dias.length} día${dias.length > 1 ? 's' : ''} ✔`);
    };
  });
}
function copiarDia(origen, destino) {
  const o = diaDoc(origen); if (!o) return false;
  state.turnos = state.turnos.filter((t) => t.id !== destino);
  state.turnos.push({ id: destino, fecha: destino, intervalo: o.intervalo, celdas: JSON.parse(JSON.stringify(o.celdas || {})), nota: '' });
  return true;
}

Object.assign(ACTS, {
  turTab: (k) => { ui.turTab = k; render(); },
  turDia: (k) => { ui.turFecha = addDays(ui.turFecha, Number(k)); render(); },
  turSem: (k) => { ui.turFecha = addDays(ui.turFecha, Number(k)); render(); },
  turHoy: () => { ui.turFecha = todayStr(); render(); },
  turAbrir: (f) => { ui.turFecha = f; ui.turTab = 'dia'; render(); window.scrollTo(0, 0); },
  turPintarTog: (_i, el) => { ui.turPintar = !ui.turPintar; render(); },
  turRapido,
  turCopiar: (k) => {
    const src = addDays(ui.turFecha, Number(k));
    if (!diaDoc(src)) return toast(`El ${fmtDate(src)} no tiene turnos cargados`);
    const go = () => { copiarDia(src, ui.turFecha); commit(); toast('Día copiado ✔'); };
    diaDoc(ui.turFecha) ? confirmBox(`Se van a reemplazar los turnos de este día por los del ${fmtDate(src)}.`, go, 'Reemplazar') : go();
  },
  turLimpiar: () => { if (!diaDoc(ui.turFecha)) return toast('Este día ya está vacío'); confirmBox('Se van a borrar todos los turnos de este día.', () => { state.turnos = state.turnos.filter((t) => t.id !== ui.turFecha); commit(); }, 'Borrar'); },
  turCopiarSem: () => {
    const dias = semana(ui.turFecha), prev = dias.map((f) => addDays(f, -7));
    if (!prev.some(diaDoc)) return toast('La semana anterior no tiene turnos');
    const go = () => { dias.forEach((f, i) => { if (diaDoc(prev[i])) copiarDia(prev[i], f); }); commit(); toast('Semana copiada ✔'); };
    dias.some(diaDoc) ? confirmBox('Se van a reemplazar los días de esta semana con los de la semana anterior.', go, 'Reemplazar') : go();
  },
  turPrint: () => { document.body.classList.add('imprimiendo'); setTimeout(() => { window.print(); document.body.classList.remove('imprimiendo'); }, 50); },
  turCfgSave: () => { const ini = Math.max(0, Math.min(23, Number($('#tcIni').value) || 0)), fin = Math.max(ini + 1, Math.min(24, Number($('#tcFin').value) || 24)); state.config.turnos = { inicio: ini, fin, intervalo: Number($('#tcIv').value) || 60 }; commit(); toast('Horario guardado ✔'); },
  perNew: () => perForm(),
  perEdit: (id) => perForm(persona(id)),
});
