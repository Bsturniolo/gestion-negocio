'use strict';
/* Turnos del personal: planilla por día (horas × personas, pintando con el color
   de cada uno), planilla general de la semana, horas vs. metas y rendimiento. */

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const COLORES = ['#e53935', '#fb8c00', '#fdd835', '#7cb342', '#2e7d32', '#00897b', '#1e88e5', '#3949ab', '#8e24aa', '#d81b60', '#6d4c41', '#546e7a', '#f06292', '#9ccc65', '#4dd0e1', '#ffb74d'];
Object.assign(ui, { pincel: '', calVista: 'semana', turTab: 'cal', turFecha: todayStr(), turMes: todayStr().slice(0, 7), turPintar: true });

const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const toMin = (s) => { const [h, m] = String(s || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const fmtH = (h) => fmtNum(Math.round(h * 10) / 10) + ' h';
const lunes = (f) => { const d = parseD(f); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d); };
const addDays = (f, k) => { const d = parseD(f); d.setDate(d.getDate() + k); return ymd(d); };
const semana = (f) => { const l = lunes(f); return [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(l, i)); };
const turCfg = () => Object.assign({ inicio: 6, fin: 22, intervalo: 60, columnas: 8 }, state.config.turnos || {});
const persona = (id) => state.personal.find((p) => p.id === id);
const activos = () => state.personal.filter((p) => p.activo !== false).sort((a, b) => (a.orden || 0) - (b.orden || 0) || a.nombre.localeCompare(b.nombre));
const diaDoc = (f) => state.turnos.find((t) => t.id === f);
const textoSobre = (hex) => { const n = parseInt(String(hex).slice(1), 16); const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#1d2624' : '#fff'; };

function horasDia(f, pid) { const d = diaDoc(f); return d ? ((d.celdas || {})[pid] || []).length * (d.intervalo || 60) / 60 : 0; }
function horasRango(pid, desde, hasta) { return state.turnos.filter((t) => t.fecha >= desde && t.fecha <= hasta).reduce((s, t) => s + ((t.celdas || {})[pid] || []).length * (t.intervalo || 60) / 60, 0); }
function diasTrabajados(pid, desde, hasta) { return state.turnos.filter((t) => t.fecha >= desde && t.fecha <= hasta && ((t.celdas || {})[pid] || []).length).length; }
function metaDia(p) { return p.metaDiaria > 0 ? p.metaDiaria : p.metaSemanal > 0 ? Math.round((p.metaSemanal / 6) * 10) / 10 : 0; }
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
  if (!d) { d = { id: f, fecha: f, intervalo: turCfg().intervalo, carriles: turCfg().columnas, slots: {}, celdas: {}, nota: '' }; state.turnos.push(d); }
  ensureSlots(d);
  return d;
}
// Cada día guarda sus casilleros libres en "slots": clave "columna_minuto" → id de persona, o "t:texto".
// "celdas" (persona → minutos) se recalcula de los casilleros y es lo que usan los conteos de horas.
function ensureSlots(d) {
  if (d.slots) return d;
  d.slots = {}; let lane = 0;
  Object.keys(d.celdas || {}).filter((pid) => (d.celdas[pid] || []).length).sort((a, b) => ((persona(a) || {}).orden || 0) - ((persona(b) || {}).orden || 0)).forEach((pid) => { d.celdas[pid].forEach((m) => (d.slots[`${lane}_${m}`] = pid)); lane++; });
  d.carriles = Math.max(turCfg().columnas, lane);
  return d;
}
function derivar(d) {
  const c = {};
  for (const [k, v] of Object.entries(d.slots || {})) { if (!v || v.startsWith('t:')) continue; const m = Number(k.split('_')[1]); (c[v] || (c[v] = new Set())).add(m); }
  d.celdas = Object.fromEntries(Object.entries(c).map(([pid, set]) => [pid, [...set].sort((a, b) => a - b)]));
}
const slotsDia = (d) => (d ? (d.slots ? d.slots : ensureSlots(JSON.parse(JSON.stringify(d))).slots) : {});
function limpiarVacios() { state.turnos = state.turnos.filter((t) => Object.values(t.slots || {}).some(Boolean) || Object.values(t.celdas || {}).some((a) => a.length) || t.nota); }
const difBadge = (h, meta) => {
  if (!meta) return '<span class="badge gray">Sin meta</span>';
  const d = Math.round((h - meta) * 10) / 10;
  return d >= 0 ? `<span class="badge in">Cumplió${d > 0 ? ' +' + fmtH(d) : ''}</span>` : `<span class="badge out">Debe ${fmtH(-d)}</span>`;
};

// ---------- Vistas ----------
function vTurnos() {
  const tabs = [['cal', '📅 Calendario'], ['mes', '📈 Rendimiento'], ['personal', '👤 Personal']];
  const fn = { cal: tCal, mes: tMes, personal: tPersonal }[ui.turTab] || tCal;
  return `<div class="spread"><div><h1>Turnos del personal</h1><p class="sub">Planilla por día, conteo de horas y metas.</p></div></div>
  <div class="tabs">${tabs.map(([k, l]) => `<button class="${ui.turTab === k ? 'on' : ''}" data-act="turTab" data-id="${k}">${l}</button>`).join('')}</div>${fn()}`;
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
  <div class="card"><div class="form" style="grid-template-columns:repeat(4,1fr)">
    <label class="f">Desde la hora<input id="tcIni" type="number" min="0" max="23" value="${c.inicio}"></label>
    <label class="f">Hasta la hora<input id="tcFin" type="number" min="1" max="24" value="${c.fin}"></label>
    <label class="f">Cada casillero vale<select id="tcIv"><option value="60" ${c.intervalo === 60 ? 'selected' : ''}>1 hora</option><option value="30" ${c.intervalo === 30 ? 'selected' : ''}>media hora</option></select></label>
    <label class="f">Columnas por día<input id="tcCol" type="number" min="1" max="20" value="${c.columnas}"></label>
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
    <label class="f">Meta de horas por día<input name="metaDiaria" inputmode="decimal" value="${p.metaDiaria || ''}" placeholder="Vacío = semanal ÷ 6"></label>
    <label class="f">Meta de horas por mes<input name="metaMensual" inputmode="decimal" value="${p.metaMensual || ''}" placeholder="Vacío = semanal × 4,33"></label>
    ${isNew ? '' : `<label class="f full" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="inactivo" ${p.activo === false ? 'checked' : ''} style="width:auto"> <span>Ya no trabaja (se oculta de la planilla pero se guardan sus horas)</span></label>`}
  </div><div class="modal-actions">${isNew ? '' : '<button class="danger" id="perDel">Eliminar</button>'}<button data-act="close">Cancelar</button><button class="pri" id="perOk">Guardar</button></div>`, (box) => {
    const setC = (c) => { color = c; $$('.col', box).forEach((b) => b.classList.toggle('sel', b.dataset.c === c)); const pv = $('#perPrev', box); pv.style.background = c; pv.style.color = textoSobre(c); };
    $('.colores', box).onclick = (e) => { const b = e.target.closest('button.col'); if (b) setC(b.dataset.c); };
    $('#perColor', box).oninput = (e) => setC(e.target.value);
    $('[name=nombre]', box).oninput = (e) => ($('#perPrev', box).textContent = e.target.value || 'Nombre');
    if (!isNew) $('#perDel', box).onclick = () => confirmBox(`Se va a eliminar a <b>${esc(p.nombre)}</b> <b>y todas sus horas cargadas</b>. Si solo dejó de trabajar, mejor tildá "Ya no trabaja".`, () => { state.personal = state.personal.filter((x) => x.id !== p.id); state.turnos.forEach((t) => { ensureSlots(t); for (const k of Object.keys(t.slots)) if (t.slots[k] === p.id) delete t.slots[k]; derivar(t); }); limpiarVacios(); commit(); }, 'Eliminar');
    $('#perOk', box).onclick = () => {
      const v = vals(box); if (!v.nombre) return toast('Poné el nombre');
      const data = { nombre: v.nombre, rol: v.rol, color, metaSemanal: numIn(v.metaSemanal), metaDiaria: numIn(v.metaDiaria), metaMensual: numIn(v.metaMensual), activo: !v.inactivo };
      if (isNew) state.personal.push({ id: uid(), orden: state.personal.length, ...data }); else Object.assign(p, data);
      closeModal(); commit(); toast('Guardado ✔');
    };
  });
}
function turRapido() {
  const ppl = activos(); if (!ppl.length) { ui.turTab = 'personal'; render(); return toast('Primero agregá al personal'); }
  const horas = []; for (let m = 0; m <= 24 * 60; m += 30) horas.push(m);
  const opt = (sel) => horas.map((m) => `<option value="${m}" ${m === sel ? 'selected' : ''}>${hhmm(m)}</option>`).join('');
  const pid0 = ppl.some((p) => p.id === ui.pincel) ? ui.pincel : ppl[0].id;
  openModal(`<h3>Cargar turno</h3><p class="small muted" style="margin-top:0">Se dibuja solo en la planilla. No hace falta tocar el calendario.</p><div class="form">
    <div class="full"><div class="small muted" style="margin-bottom:6px">Persona</div><div class="paleta" id="trPpl">${ppl.map((p) => `<button type="button" class="pin${p.id === pid0 ? ' sel' : ''}" data-p="${p.id}" style="background:${p.color};color:${textoSobre(p.color)}">${esc(p.nombre.toUpperCase())}</button>`).join('')}</div></div>
    <label class="f">Día<input type="date" name="fecha" id="trFecha" value="${ui.turFecha}"></label>
    <div></div>
    <label class="f">Entró a las<select name="desde">${opt(8 * 60)}</select></label>
    <label class="f">Se fue a las<select name="hasta">${opt(16 * 60)}</select></label>
    <div class="full"><div class="small muted" style="margin-bottom:6px">Repetir el mismo horario otros días de esa semana (opcional)</div><div class="row" id="trDias"></div></div>
  </div><p class="small" id="trInfo"></p><div class="modal-actions"><button data-act="close">Cancelar</button><button class="pri" id="trOk">Cargar turno</button></div>`, (box) => {
    let pid = pid0;
    const info = () => { const a = Number($('[name=desde]', box).value), b = Number($('[name=hasta]', box).value), p = persona(pid); $('#trInfo', box).innerHTML = b > a ? `${esc(p.nombre)}: de ${hhmm(a)} a ${hhmm(b)} = <b>${fmtH((b - a) / 60)}</b>` : '<span class="c-out">La salida tiene que ser después de la entrada.</span>'; };
    const dias = () => { const f = $('#trFecha', box).value || ui.turFecha; $('#trDias', box).innerHTML = semana(f).map((x, i) => (x === f ? '' : `<label class="btn" style="gap:6px"><input type="checkbox" data-d="${x}" style="width:auto"> ${DIAS[i].slice(0, 3)} ${parseD(x).getDate()}</label>`)).join(''); };
    $('#trPpl', box).onclick = (e) => { const b = e.target.closest('.pin'); if (!b) return; pid = b.dataset.p; $$('#trPpl .pin', box).forEach((x) => x.classList.toggle('sel', x === b)); info(); };
    $('#trFecha', box).onchange = dias; $('[name=desde]', box).onchange = info; $('[name=hasta]', box).onchange = info; dias(); info();
    $('#trOk', box).onclick = () => {
      const v = vals(box), a = Number(v.desde), b = Number(v.hasta); if (b <= a) return toast('La salida tiene que ser después de la entrada');
      const f = v.fecha || ui.turFecha, lista = [f, ...$$('#trDias input:checked', box).map((x) => x.dataset.d)];
      lista.forEach((x) => agregarTurno(x, pid, a, b));
      ui.turFecha = f; closeModal(); commit(); toast(`Turno cargado: ${persona(pid).nombre} ${hhmm(a)} a ${hhmm(b)}${lista.length > 1 ? ` en ${lista.length} días` : ''} ✔`);
    };
  });
}
function aMediaHora(d) { // pasa un día de casilleros de 1 hora a casilleros de media hora, sin perder nada
  if ((d.intervalo || 60) <= 30) return;
  const iv = d.intervalo || 60, nuevo = {};
  for (const [k, v] of Object.entries(d.slots || {})) { const [l, m] = k.split('_').map(Number); for (let x = m; x < m + iv; x += 30) nuevo[`${l}_${x}`] = v; }
  d.slots = nuevo; d.intervalo = 30;
}
function agregarTurno(f, pid, a, b) { // pone a la persona en la primera columna libre de ese horario
  const d = ensureDia(f);
  if (a % (d.intervalo || 60) || b % (d.intervalo || 60)) aMediaHora(d);
  const s = d.intervalo || 60, mins = []; for (let m = Math.floor(a / s) * s; m < b; m += s) mins.push(m);
  let lane = 0; while (lane < 40 && !mins.every((m) => !d.slots[`${lane}_${m}`] || d.slots[`${lane}_${m}`] === pid)) lane++;
  mins.forEach((m) => (d.slots[`${lane}_${m}`] = pid)); d.carriles = Math.max(d.carriles || 0, lane + 1); derivar(d);
}
function copiarDia(origen, destino) {
  const o = diaDoc(origen); if (!o) return false; ensureSlots(o);
  state.turnos = state.turnos.filter((t) => t.id !== destino);
  state.turnos.push({ id: destino, fecha: destino, intervalo: o.intervalo, carriles: o.carriles, slots: JSON.parse(JSON.stringify(o.slots || {})), celdas: JSON.parse(JSON.stringify(o.celdas || {})), nota: '' });
  return true;
}

Object.assign(ACTS, {
  turTab: (k) => { ui.turTab = k; render(); },
  turDia: (k) => { ui.turFecha = addDays(ui.turFecha, Number(k)); render(); },
  turSem: (k) => { ui.turFecha = addDays(ui.turFecha, Number(k)); render(); },
  turHoy: () => { ui.turFecha = todayStr(); render(); },
  turAbrir: (f) => { ui.turFecha = f; ui.turTab = 'cal'; ui.calVista = 'dia'; render(); window.scrollTo(0, 0); },
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
  turCfgSave: () => { const ini = Math.max(0, Math.min(23, Number($('#tcIni').value) || 0)), fin = Math.max(ini + 1, Math.min(24, Number($('#tcFin').value) || 24)); state.config.turnos = { inicio: ini, fin, intervalo: Number($('#tcIv').value) || 60, columnas: Math.max(1, Math.min(20, Number($('#tcCol').value) || 8)) }; commit(); toast('Horario guardado ✔'); },
  perNew: () => perForm(),
  perEdit: (id) => perForm(persona(id)),
});

// ================= Calendario estilo planilla (Día / Semana / Mes / Año) =================
const DIAS_UP = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO', 'DOMINGO'];
function periodo() {
  const f = ui.turFecha, v = ui.calVista, d = parseD(f);
  if (v === 'dia') return { desde: f, hasta: f, nombre: `Día ${DIAS[(d.getDay() + 6) % 7].toLowerCase()} ${fmtDate(f)}`, plazo: 'día' };
  if (v === 'semana') { const w = semana(f); return { desde: w[0], hasta: w[6], nombre: `Semana del ${fmtDate(w[0])} al ${fmtDate(w[6])}`, plazo: 'semana' }; }
  if (v === 'mes') { const a = ymd(new Date(d.getFullYear(), d.getMonth(), 1)), b = ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0)); return { desde: a, hasta: b, nombre: `Mes de ${MESES[d.getMonth()].toLowerCase()} ${d.getFullYear()}`, plazo: 'mes' }; }
  return { desde: `${d.getFullYear()}-01-01`, hasta: `${d.getFullYear()}-12-31`, nombre: `Año ${d.getFullYear()}`, plazo: 'año' };
}
function metaPeriodo(p, v) { return v === 'dia' ? metaDia(p) : v === 'semana' ? p.metaSemanal || 0 : v === 'mes' ? metaMes(p) : metaMes(p) * 12; }
function moverPeriodo(k) {
  const d = parseD(ui.turFecha), v = ui.calVista;
  if (v === 'dia') ui.turFecha = addDays(ui.turFecha, k);
  else if (v === 'semana') ui.turFecha = addDays(ui.turFecha, 7 * k);
  else if (v === 'mes') ui.turFecha = ymd(new Date(d.getFullYear(), d.getMonth() + k, 1));
  else ui.turFecha = ymd(new Date(d.getFullYear() + k, 0, 1));
}
const enCelda = (d, pid, m) => { if (!d) return false; const a = (d.celdas || {})[pid]; if (!a || !a.length) return false; const iv = d.intervalo || 60; return a.includes(m - (m % iv)); };
const rango = (arr, iv) => { // [[ini, fin], ...] de bloques contiguos
  const s = arr.slice().sort((a, b) => a - b), out = []; for (const m of s) { const u = out[out.length - 1]; if (u && u[1] === m) u[1] = m + iv; else out.push([m, m + iv]); } return out;
};
const hcorta = (m) => (m % 60 ? Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0') : String(m / 60));

function paleta() {
  const ppl = activos();
  if (!ppl.length) return '<p class="small"><b>Primero cargá el personal en la pestaña Personal.</b></p>';
  if (!ui.pincel || (!ui.pincel.startsWith('t:') && ui.pincel !== 'borrar' && !persona(ui.pincel))) ui.pincel = ppl[0].id;
  const txt = ui.pincel.startsWith('t:') ? ui.pincel.slice(2) : '';
  return `<div class="paleta">${ppl.map((p) => `<button class="pin${ui.pincel === p.id ? ' sel' : ''}" data-act="pincel" data-id="${p.id}" style="background:${p.color};color:${textoSobre(p.color)}">${esc(p.nombre.toUpperCase())}</button>`).join('')}
    <button class="pin pin-txt${txt ? ' sel' : ''}" data-act="pincelTexto">✏️ ${txt ? esc(txt) : 'Texto'}</button>
    <button class="pin pin-borrar${ui.pincel === 'borrar' ? ' sel' : ''}" data-act="pincel" data-id="borrar">🧽 Borrar</button></div>`;
}

function tCal() {
  const v = ui.calVista, per = periodo(), editable = v !== 'anio';
  const vistas = [['dia', 'Día'], ['semana', 'Semana'], ['mes', 'Mes'], ['anio', 'Año']];
  const cuerpo = { dia: () => xlsGrid([ui.turFecha], true), semana: () => xlsGrid(semana(ui.turFecha), false), mes: xlsMes, anio: xlsAnio }[v]();
  return `<div class="card no-print cal-barra" style="margin-bottom:10px"><div class="spread">
    <div class="tabs" style="margin:0">${vistas.map(([k, l]) => `<button class="${v === k ? 'on' : ''}" data-act="calVista" data-id="${k}">${l}</button>`).join('')}</div>
    <div class="row"><button data-act="calMov" data-id="-1">◀</button><b>${per.nombre}</b><button data-act="calMov" data-id="1">▶</button><button class="sm" data-act="turHoy">Hoy</button></div>
    <div class="row"><button class="pri sm" data-act="turRapido">➕ Cargar turno</button>${v === 'dia' || v === 'semana' ? `<button class="sm" data-act="${v === 'dia' ? 'turCopiar' : 'turCopiarSem'}" ${v === 'dia' ? 'data-id="-7"' : ''}>Copiar ${v === 'dia' ? 'de la semana pasada' : 'semana anterior'}</button>` : ''}<button class="sm" data-act="turPrint">🖨 Imprimir</button>${editable ? `<label class="small row" style="gap:6px"><input type="checkbox" data-act="turPintarTog" ${ui.turPintar ? 'checked' : ''} style="width:auto"> Pintar</label>` : ''}</div></div>
    ${editable ? `<div class="mt">${paleta()}</div><p class="small muted" style="margin:6px 0 0">Elegí a la persona arriba y tocá o arrastrá sobre cualquier cuadrado para ponerla ahí. Tocá un cuadrado que ya es suyo para sacarlo. Tocá la banda amarilla para escribir una nota del día.</p>` : '<p class="small muted" style="margin:8px 0 0">Tocá un día para abrirlo y editarlo.</p>'}</div>
  <div class="print-title">${esc(state.config.negocio)} · Turnos · ${per.nombre}</div>
  ${cuerpo}
  ${resumenPeriodo(per, v)}`;
}

// Planilla: una o varias filas de días (cada fila = una semana). Banda amarilla con número y nota,
// nombre del día y columnas libres por día. null = casillero vacío (días que no son del mes).
function xlsGrid(dias, grande) {
  const filasDias = Array.isArray(dias[0]) ? dias : [dias];
  const c = turCfg(), todos = filasDias.flat().filter(Boolean), docs = Object.fromEntries(todos.map((f) => [f, diaDoc(f)])), sl = Object.fromEntries(todos.map((f) => [f, slotsDia(docs[f])]));
  const iv = Math.min(c.intervalo, ...todos.map((f) => docs[f]).filter(Boolean).map((d) => d.intervalo || 60));
  let ini = c.inicio * 60, fin = c.fin * 60;
  todos.forEach((f) => Object.keys(sl[f]).forEach((k) => { const m = Number(k.split('_')[1]); ini = Math.min(ini, m); fin = Math.max(fin, m + ((docs[f] && docs[f].intervalo) || iv)); }));
  ini = Math.floor(ini / iv) * iv; const horas = []; for (let m = ini; m < fin; m += iv) horas.push(m);
  const lanesDe = (f) => { let n = Math.max((docs[f] && docs[f].carriles) || 0, c.columnas); Object.keys(sl[f]).forEach((k) => (n = Math.max(n, Number(k.split('_')[0]) + 1))); return n; };
  const nCol = filasDias[0].length; // columnas iguales en todas las filas para que quede alineado como un calendario
  const lanes = Array.from({ length: nCol }, (_, i) => Math.max(c.columnas, ...filasDias.map((r) => (r[i] ? lanesDe(r[i]) : 0))));
  const val = (f, l, m) => { const d = docs[f]; if (!d) return ''; const div = d.intervalo || 60; return sl[f][`${l}_${m - (m % div)}`] || ''; };
  let h = `<div class="xls-wrap"><table class="xls${ui.turPintar ? ' pintar' : ''}${grande ? '' : ' compacta'}">`;
  filasDias.forEach((fila, r) => {
    const vacio = (i) => `<th class="xls-vacio" colspan="${lanes[i] + 1}"></th>`;
    h += `<tbody class="xls-sem${r ? ' xls-sem-sig' : ''}">
    <tr>${fila.map((f, i) => (f ? `<th class="xls-num" colspan="${lanes[i] + 1}" data-act="turNota" data-id="${f}"><span>${parseD(f).getDate()}</span>${docs[f] && docs[f].nota ? `<em class="xls-nota">${esc(docs[f].nota)}</em>` : ''}</th>` : `<th class="xls-num xls-num-vacio" colspan="${lanes[i] + 1}"></th>`)).join('')}</tr>
    <tr>${fila.map((f, i) => (f ? `<th class="xls-dia" colspan="${lanes[i] + 1}">${DIAS_UP[(parseD(f).getDay() + 6) % 7]}</th>` : vacio(i))).join('')}</tr>`;
    for (const m of horas) {
      h += '<tr>' + fila.map((f, i) => {
        if (!f) return `<td class="xls-fuera" colspan="${lanes[i] + 1}"></td>`;
        return `<th class="xls-hora xls-sep">${hcorta(m)}</th>` + Array.from({ length: lanes[i] }, (_, l) => {
          const v = val(f, l, m), attrs = `class="xc" data-f="${f}" data-l="${l}" data-m="${m}"`;
          if (!v) return `<td ${attrs}></td>`;
          if (v.startsWith('t:')) return `<td ${attrs} data-v="${esc(v)}"><span class="xls-txt">${esc(v.slice(2))}</span></td>`;
          const p = persona(v); if (!p) return `<td ${attrs}></td>`;
          let k = 0; for (let x = m - iv; x >= ini && val(f, l, x) === v; x -= iv) k++;
          return `<td ${attrs} data-v="${v}" style="background:${p.color};color:${textoSobre(p.color)}">${esc(p.nombre.toUpperCase()[k] || '')}</td>`;
        }).join('');
      }).join('') + '</tr>';
    }
    h += `<tr class="xls-pie">${fila.map((f, i) => {
      if (!f) return `<td class="xls-fuera" colspan="${lanes[i] + 1}"></td>`;
      const d = docs[f], ppl = d ? Object.keys(d.celdas || {}).map(persona).filter(Boolean) : [];
      return `<th class="xls-hora xls-sep">hs</th><th class="xls-tot" colspan="${lanes[i]}">${ppl.length ? ppl.map((p) => `<span style="color:${p.color}">■</span>${esc(grande ? p.nombre : p.nombre.slice(0, 3))} ${fmtNum(horasDia(f, p.id))}`).join(' · ') : ''}${grande ? ` <button class="sm link no-print" data-act="turMasCol" data-id="${f}">+ columna</button>` : ''}</th>`;
    }).join('')}</tr></tbody>`;
  });
  return h + '</table></div>';
}

// Mes: como un calendario real. Filas de 7 días (lunes a domingo); el día 1 cae en su día de la semana
// y los casilleros de antes y después del mes quedan vacíos.
function xlsMes() {
  const d = parseD(ui.turFecha), Y = d.getFullYear(), M = d.getMonth(), nd = new Date(Y, M + 1, 0).getDate();
  const off = (new Date(Y, M, 1).getDay() + 6) % 7, celdas = [];
  for (let i = 0; i < off; i++) celdas.push(null);
  for (let k = 1; k <= nd; k++) celdas.push(ymd(new Date(Y, M, k)));
  while (celdas.length % 7) celdas.push(null);
  const filas = []; for (let i = 0; i < celdas.length; i += 7) filas.push(celdas.slice(i, i + 7));
  return `<div class="xls-mestit">${MESES[M].toUpperCase()} ${Y}</div>${xlsGrid(filas, false)}`;
}

// Pintar casilleros: tocar o arrastrar con la persona elegida
let pinta = null;
function aplicar(td) {
  const f = td.dataset.f, d = ensureDia(f), div = d.intervalo || 60, m0 = Number(td.dataset.m), key = `${td.dataset.l}_${m0 - (m0 % div)}`;
  if (pinta.modo === 'borrar') delete d.slots[key]; else d.slots[key] = pinta.valor;
  if (Number(td.dataset.l) + 1 > (d.carriles || 0)) d.carriles = Number(td.dataset.l) + 1;
  pinta.dias.add(d);
  if (pinta.modo === 'borrar') { td.style.background = ''; td.style.color = ''; td.textContent = ''; delete td.dataset.v; }
  else if (pinta.valor.startsWith('t:')) { td.style.background = ''; td.style.color = ''; td.innerHTML = `<span class="xls-txt">${esc(pinta.valor.slice(2))}</span>`; td.dataset.v = pinta.valor; }
  else { const p = persona(pinta.valor); td.style.background = p.color; td.style.color = textoSobre(p.color); td.dataset.v = pinta.valor; }
}
document.addEventListener('pointerdown', (e) => {
  const td = e.target.closest('table.pintar td.xc'); if (!td || e.button > 0) return;
  e.preventDefault();
  const pin = ui.pincel || (activos()[0] || {}).id; if (!pin) return toast('Primero cargá el personal');
  const modo = pin === 'borrar' || td.dataset.v === pin ? 'borrar' : 'poner';
  pinta = { modo, valor: pin, dias: new Set(), ultimo: null };
  aplicar(td); pinta.ultimo = td;
});
document.addEventListener('pointermove', (e) => {
  if (!pinta) return;
  const el = document.elementFromPoint(e.clientX, e.clientY), td = el && el.closest && el.closest('table.pintar td.xc');
  if (!td || td === pinta.ultimo) return;
  const u = pinta.ultimo;
  if (u && u.dataset.f === td.dataset.f && u.dataset.l === td.dataset.l) { // rellena lo que se saltó el dedo o el mouse en la misma columna
    const a = Math.min(+u.dataset.m, +td.dataset.m), b = Math.max(+u.dataset.m, +td.dataset.m);
    $$('table.pintar td.xc[data-f="' + td.dataset.f + '"][data-l="' + td.dataset.l + '"]').filter((x) => +x.dataset.m > a && +x.dataset.m < b).forEach(aplicar);
  }
  aplicar(td); pinta.ultimo = td;
});
['pointerup', 'pointercancel'].forEach((ev) => document.addEventListener(ev, () => { if (!pinta) return; pinta.dias.forEach(derivar); pinta = null; limpiarVacios(); commit(); }));

function notaForm(f) {
  const d = diaDoc(f);
  openModal(`<h3>Nota del ${DIAS[(parseD(f).getDay() + 6) % 7].toLowerCase()} ${fmtDate(f)}</h3><p class="small muted">Aparece en la banda amarilla del día, como en la planilla de papel.</p>
  <label class="f">Nota<textarea id="nTxt" placeholder="Ej: KEVIN: atención este día, quizás te pregunto por horas.">${esc((d && d.nota) || '')}</textarea></label>
  <div class="modal-actions"><button data-act="close">Cancelar</button><button class="pri" id="nOk">Guardar</button></div>`, (box) => {
    $('#nOk', box).onclick = () => { const t = $('#nTxt', box).value.trim(); const dd = t ? ensureDia(f) : diaDoc(f); if (dd) { dd.nota = t; derivar(dd); } limpiarVacios(); closeModal(); commit(); };
  });
}
function textoForm() {
  openModal(`<h3>Escribir un texto en los cuadrados</h3><p class="small muted">Para cosas como "catering", "M" o "libre". No suma horas a nadie.</p>
  <label class="f">Texto<input id="tTxt" maxlength="14" value="${esc(ui.pincel.startsWith('t:') ? ui.pincel.slice(2) : '')}" placeholder="Ej: catering"></label>
  <div class="modal-actions"><button data-act="close">Cancelar</button><button class="pri" id="tOk">Usar este texto</button></div>`, (box) => {
    const ok = () => { const t = $('#tTxt', box).value.trim(); if (!t) return toast('Escribí el texto'); ui.pincel = 't:' + t; closeModal(); render(); };
    $('#tOk', box).onclick = ok; $('#tTxt', box).onkeydown = (e) => { if (e.key === 'Enter') ok(); };
  });
}
// Año: 12 meses chicos; cada día muestra los colores de quienes trabajaron
function xlsAnio() {
  const Y = parseD(ui.turFecha).getFullYear();
  return `<div class="xls-anio">${MESES.map((mn, M) => {
    const first = new Date(Y, M, 1), off = (first.getDay() + 6) % 7, nd = new Date(Y, M + 1, 0).getDate();
    let cells = ''; for (let i = 0; i < off; i++) cells += '<td></td>';
    for (let day = 1; day <= nd; day++) {
      const f = ymd(new Date(Y, M, day)), doc = diaDoc(f);
      const ppl = doc ? state.personal.filter((p) => ((doc.celdas || {})[p.id] || []).length) : [];
      cells += `<td class="xls-adia${f === todayStr() ? ' hoy' : ''}" data-act="calIrDia" data-id="${f}" title="${ppl.map((p) => p.nombre).join(', ')}"><span>${day}</span><div class="xls-barras">${ppl.map((p) => `<i style="background:${p.color}"></i>`).join('')}</div></td>`;
      if ((off + day) % 7 === 0) cells += '</tr><tr>';
    }
    const horasMes = state.personal.reduce((s, p) => s + horasRango(p.id, ymd(first), ymd(new Date(Y, M, nd))), 0);
    return `<div class="xls-ames"><table class="xls"><thead><tr><th class="xls-num xls-anum" colspan="7" data-act="calIrMes" data-id="${ymd(first)}">${mn.toUpperCase()}</th></tr><tr>${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((x) => `<th class="xls-dia">${x}</th>`).join('')}</tr></thead><tbody><tr>${cells}</tr></tbody></table><div class="small muted" style="text-align:center;margin-top:3px">${horasMes ? fmtH(horasMes) + ' en total' : 'sin turnos'}</div></div>`;
  }).join('')}</div>`;
}

// Resumen del período que se está viendo
function resumenPeriodo(per, v) {
  const lista = state.personal.filter((p) => p.activo !== false || horasRango(p.id, per.desde, per.hasta));
  if (!lista.length) return '';
  const nDias = daysBetween(per.desde, per.hasta) + 1, hoy = todayStr();
  // si el período todavía no terminó, la meta se cuenta solo hasta hoy
  const transc = hoy >= per.hasta ? nDias : hoy < per.desde ? 0 : daysBetween(per.desde, hoy) + 1;
  const parcial = transc < nDias, factor = transc / nDias;
  const art = { 'día': 'del día', semana: 'de la semana', mes: 'del mes', 'año': 'del año' }[per.plazo];
  const filas = lista.map((p) => {
    const h = horasRango(p.id, per.desde, per.hasta), meta = v === 'dia' && !h ? 0 : Math.round(metaPeriodo(p, v) * factor * 10) / 10, dif = Math.round((h - meta) * 10) / 10, dt = diasTrabajados(p.id, per.desde, per.hasta);
    let frase;
    if (v === 'dia' && !h) frase = `${esc(p.nombre)} no trabajó este día (franco).`;
    else if (!meta) frase = `${esc(p.nombre)} trabajó ${fmtH(h)} en ${dt} día${dt === 1 ? '' : 's'}. No tiene meta cargada para este plazo.`;
    else if (dif > 0) frase = `${esc(p.nombre)} trabajó ${fmtH(h)}: hizo <b>${fmtH(dif)} de más</b> sobre su meta de ${fmtH(meta)} ${parcial ? 'hasta hoy' : 'por ' + per.plazo}.`;
    else if (dif < 0) frase = `${esc(p.nombre)} trabajó ${fmtH(h)}: ${parcial ? 'va' : 'quedó'} <b>${fmtH(-dif)} abajo</b> de su meta de ${fmtH(meta)} ${parcial ? 'hasta hoy' : 'por ' + per.plazo}.`;
    else frase = `${esc(p.nombre)} trabajó ${fmtH(h)}: cumplió justo su meta de ${fmtH(meta)} ${parcial ? 'hasta hoy' : 'por ' + per.plazo}.`;
    return { p, h, meta, dif, dt, frase };
  });
  const tot = filas.reduce((s, r) => s + r.h, 0);
  return `<h2>Resumen · ${per.nombre} <span class="muted small" style="font-weight:400">(plazo: ${per.plazo}, ${nDias} día${nDias === 1 ? '' : 's'}${parcial ? `; la meta se cuenta hasta hoy, ${transc} de ${nDias} días` : ''})</span></h2>
  <div class="tablewrap"><table class="xls-res"><thead><tr><th>Empleado</th><th class="num">Horas trabajadas</th><th class="num">Meta ${art}${parcial ? ' (hasta hoy)' : ''}</th><th class="num">De más / de menos</th><th class="num">Días trabajados</th><th>Detalle</th></tr></thead><tbody>
  ${filas.map((r) => `<tr><td><span class="xls-nom" style="background:${r.p.color};color:${textoSobre(r.p.color)}">${esc(r.p.nombre.toUpperCase())}</span></td><td class="num"><b>${fmtH(r.h)}</b></td><td class="num">${r.meta ? fmtH(r.meta) : '–'}</td><td class="num">${!r.meta ? '–' : r.dif > 0 ? `<b class="c-in">+${fmtH(r.dif)} de más</b>` : r.dif < 0 ? `<b class="c-out">−${fmtH(-r.dif)} de menos</b>` : '<b>justo</b>'}</td><td class="num">${r.dt}</td><td class="small">${r.frase}</td></tr>`).join('')}
  <tr><td><b>TOTAL</b></td><td class="num"><b>${fmtH(tot)}</b></td><td></td><td></td><td></td><td></td></tr></tbody></table></div>`;
}

Object.assign(ACTS, {
  calVista: (k) => { ui.calVista = k; render(); },
  calMov: (k) => { moverPeriodo(Number(k)); render(); },
  calIrDia: (f) => { ui.turFecha = f; ui.calVista = 'dia'; render(); window.scrollTo(0, 0); },
  calIrMes: (f) => { ui.turFecha = f; ui.calVista = 'mes'; render(); },
  pincel: (id) => { ui.pincel = id; render(); },
  pincelTexto: textoForm,
  turNota: (f) => notaForm(f),
  turMasCol: (f) => { const d = ensureDia(f); d.carriles = Math.max(d.carriles || 0, turCfg().columnas) + 1; commit(); },
});
