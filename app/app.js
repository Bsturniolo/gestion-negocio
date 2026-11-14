'use strict';
/* Gestión del Negocio — app de stock, proveedores, finanzas y calendario.
   Todo funciona en el navegador (IndexedDB). En la versión de escritorio
   (Electron) además se guarda un respaldo automático en Documentos. */

// ---------- Utilidades ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const num = (v) => { const n = parseFloat(String(v ?? '').replace(/\./g, '').replace(',', '.')); return isFinite(n) ? n : 0; };
const numIn = (v) => { // acepta "1500", "1500.5", "1.500,50", "1500,5"
  let s = String(v ?? '').trim();
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s); return isFinite(n) ? n : 0;
};
const fmtMoney = (n) => {
  const sym = state.config.moneda || '$';
  const v = Number(n) || 0;
  return (v < 0 ? '−' : '') + sym + ' ' + Math.abs(v).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};
const fmtNum = (n) => (Number(n) || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 });
const todayStr = () => { const d = new Date(); return ymd(d); };
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseD = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const fmtDate = (s) => s ? parseD(s).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MES_C = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const daysBetween = (a, b) => Math.round((parseD(b) - parseD(a)) / 86400000);
const addMonths = (s, k) => { const d = parseD(s); const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + k); const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); d.setDate(Math.min(day, last)); return ymd(d); };

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), 2600);
}

// ---------- Datos ----------
const TIPOS_MOV = {
  ingreso: { lbl: 'Cobro / Venta', cls: 'in' },
  gasto: { lbl: 'Gasto', cls: 'out' },
  inversion: { lbl: 'Inversión', cls: 'inv' },
};
const CATS = {
  ingreso: ['Venta', 'Cobro de deuda', 'Servicio', 'Otro ingreso'],
  gasto: ['Alquiler', 'Sueldos', 'Luz / Gas / Agua', 'Internet / Teléfono', 'Impuestos', 'Transporte / Flete', 'Mantenimiento', 'Pago de deuda', 'Otro gasto'],
  inversion: ['Mercadería', 'Equipamiento', 'Mejoras del local', 'Otra inversión'],
};
const TIPOS_EV = {
  pagar: { lbl: 'Deuda a pagar', ico: '🔴' },
  cobrar: { lbl: 'A cobrar', ico: '🟢' },
  prestamo_dado: { lbl: 'Presté (me deben devolver)', ico: '🤝' },
  prestamo_recibido: { lbl: 'Me prestaron (tengo que devolver)', ico: '💳' },
  recordatorio: { lbl: 'Recordatorio', ico: '🔔' },
};

const EMPTY = () => ({
  version: 1,
  config: { negocio: 'Mi Negocio', moneda: '$', avisoDias: 3, ultimoRespaldo: null, turnos: { inicio: 6, fin: 22, intervalo: 60 } },
  productos: [], proveedores: [], movimientos: [], stockMovs: [], eventos: [], personal: [], turnos: [], caterings: [],
});
let state = EMPTY();

const DB_NAME = 'gestion-negocio', STORE = 'kv';
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function load() {
  try {
    const db = await idb();
    const data = await new Promise((res, rej) => { const q = db.transaction(STORE).objectStore(STORE).get('state'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
    if (data) state = Object.assign(EMPTY(), data, { config: Object.assign(EMPTY().config, data.config || {}) });
  } catch (e) { console.error(e); alertBox('No se pudieron leer los datos guardados: ' + e.message); }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}
let saveTimer = null, backupTimer = null;
async function saveLocal() {
  try { const db = await idb(); const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(state, 'state'); } catch (e) { console.error(e); }
}
async function save() {
  try {
    const db = await idb();
    await new Promise((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(state, 'state'); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  } catch (e) { console.error(e); toast('⚠️ Error al guardar: ' + e.message); }
  if (cloud.uid && cloud.live) pushDiff();
  if (window.desktop) { clearTimeout(backupTimer); backupTimer = setTimeout(() => window.desktop.saveBackup(JSON.stringify(state)).catch(console.error), 1500); }
}
function commit() { save(); render(); }

const prov = (id) => state.proveedores.find((p) => p.id === id);
const prod = (id) => state.productos.find((p) => p.id === id);

// ---------- Nube (Firebase) ----------
const cloud = { cfg: null, uid: null, email: '', live: false, synced: {}, buffer: {}, reported: new Set(), unsub: null, pending: false, error: '', deferred: {} };
const COLS = ['productos', 'proveedores', 'movimientos', 'stockMovs', 'eventos', 'personal', 'turnos', 'caterings'];
function stable(v) { // JSON con claves ordenadas, para comparar registros
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}
function parseFirebaseConfig(txt) {
  const out = {}; const re = /(\w+)\s*:\s*["']([^"']+)["']/g; let m;
  while ((m = re.exec(txt))) out[m[1]] = m[2];
  if (!out.apiKey || !out.projectId) throw new Error('No encontré apiKey y projectId en el texto pegado.');
  return out;
}
function getCloudCfg() {
  if (window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey) return window.FIREBASE_CONFIG;
  try { const c = JSON.parse(localStorage.getItem('firebaseConfig') || 'null'); if (c && c.apiKey) return c; } catch {}
  return null;
}
function pushDiff() {
  const ops = [];
  for (const c of COLS) {
    const prev = cloud.synced[c] || (cloud.synced[c] = {}); const seen = new Set();
    for (const r of state[c]) { seen.add(r.id); const sj = stable(r); if (prev[r.id] !== sj) { prev[r.id] = sj; ops.push({ col: c, id: r.id, data: JSON.parse(JSON.stringify(r)) }); } }
    for (const id of Object.keys(prev)) if (!seen.has(id)) { delete prev[id]; ops.push({ col: c, id, del: true }); }
  }
  const cj = stable(state.config); if (cloud.synced.config !== cj) { cloud.synced.config = cj; ops.push({ col: 'config', data: JSON.parse(JSON.stringify(state.config)) }); }
  if (ops.length) { window.Cloud.write(cloud.uid, ops); cloud.pending = true; syncBadge(); }
}
function applyRemote(col, data) {
  if (col === 'config') { if (data) { state.config = Object.assign(EMPTY().config, data); cloud.synced.config = stable(state.config); } return; }
  state[col] = data; cloud.synced[col] = Object.fromEntries(data.map((r) => [r.id, stable(r)]));
}
let remoteRender = null;
function onCloudData(col, data, meta) {
  cloud.pending = meta.pending; syncBadge();
  if (!cloud.live) { cloud.buffer[col] = data; if (!meta.fromCache) cloud.reported.add(col); if (cloud.reported.size === COLS.length + 1) goLive(); return; }
  if (meta.pending) return; // es eco de nuestra propia escritura
  if (!$('#modal').classList.contains('hidden')) { cloud.deferred[col] = data; return; } // no pisar un formulario abierto
  applyRemote(col, data);
  clearTimeout(remoteRender); remoteRender = setTimeout(() => { saveLocal(); render(); }, 60);
}
function flushDeferred() {
  const ks = Object.keys(cloud.deferred); if (!ks.length) return;
  ks.forEach((k) => applyRemote(k, cloud.deferred[k])); cloud.deferred = {};
  // lo que se haya editado localmente mientras tanto vuelve a subirse en el próximo save
}
function goLive() {
  if (cloud.live) return;
  const local = state;
  const cloudEmpty = COLS.every((c) => !(cloud.buffer[c] || []).length);
  const localHas = COLS.some((c) => local[c].length);
  cloud.live = true;
  if (cloudEmpty && localHas) {
    cloud.synced = {}; pushDiff(); saveLocal(); render();
    toast('Subiendo los datos de este dispositivo a la nube…');
  } else {
    COLS.forEach((c) => applyRemote(c, cloud.buffer[c] || []));
    applyRemote('config', cloud.buffer.config || null);
    if (!cloud.buffer.config) pushDiff();
    saveLocal(); render(); setTimeout(notificar, 500);
  }
  cloud.buffer = {};
}
function startCloud() {
  cloud.cfg = getCloudCfg(); if (!cloud.cfg || !window.Cloud) return false;
  try { window.Cloud.init(cloud.cfg); } catch (e) { console.error(e); cloud.error = e.message; return false; }
  window.addEventListener('cloud-error', (e) => { const err = e.detail || {}; cloud.error = err.code === 'permission-denied' ? 'Sin permiso en la nube: revisá las reglas de Firestore.' : (err.message || String(err)); syncBadge(); toast('⚠️ ' + cloud.error); });
  window.addEventListener('online', syncBadge); window.addEventListener('offline', syncBadge);
  window.Cloud.onAuth((u) => {
    if (cloud.unsub) { cloud.unsub(); cloud.unsub = null; }
    cloud.live = false; cloud.reported = new Set(); cloud.buffer = {}; cloud.synced = {};
    if (!u) { cloud.uid = null; cloud.email = ''; syncBadge(); render(); return; }
    cloud.uid = u.uid; cloud.email = u.email || '';
    cloud.unsub = window.Cloud.subscribe(u.uid, onCloudData, (err) => { cloud.error = err.code === 'permission-denied' ? 'Sin permiso en la nube: revisá las reglas de Firestore.' : err.message; syncBadge(); });
    // sin internet: a los 6 s usamos lo que haya en la caché local
    setTimeout(() => { if (cloud.uid === u.uid && !cloud.live && Object.keys(cloud.buffer).length) goLive(); }, 6000);
    syncBadge(); render();
  });
  return true;
}
function syncBadge() {
  const el = $('#sync'); if (!el) return;
  if (!cloud.cfg) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden', 'warn');
  let t;
  if (!cloud.uid) t = '☁️ Sin sesión';
  else if (cloud.error) { t = '⚠️ Error de nube'; el.classList.add('warn'); }
  else if (!navigator.onLine) { t = '📴 Sin internet · se guarda y sube después'; el.classList.add('warn'); }
  else if (!cloud.live) t = '⏳ Cargando datos…';
  else if (cloud.pending) t = '⏳ Subiendo cambios…';
  else t = '☁️ Sincronizado';
  el.textContent = t; el.title = cloud.error || cloud.email;
}
const needLogin = () => cloud.cfg && !cloud.uid;
function vLogin() {
  return `<div class="login-box card"><div class="row"><img src="icon-192.png" alt=""><div><h1>${esc(state.config.negocio || 'Gestión del Negocio')}</h1><p class="sub" style="margin:0">Iniciá sesión para ver tus datos en la PC y en el celular.</p></div></div>
  <div class="form mt" style="grid-template-columns:1fr"><label class="f">Email<input id="lgMail" type="email" autocomplete="username" value="${esc(localStorage.getItem('lastEmail') || '')}"></label>
  <label class="f">Contraseña<input id="lgPass" type="password" autocomplete="current-password"></label></div>
  <p class="small c-out" id="lgErr"></p>
  <div class="modal-actions" style="justify-content:space-between"><button class="link" data-act="lgReset">Olvidé mi contraseña</button><button class="pri" data-act="lgGo">Entrar</button></div></div>`;
}
const authMsg = (e) => ({ 'auth/invalid-credential': 'Email o contraseña incorrectos.', 'auth/wrong-password': 'Contraseña incorrecta.', 'auth/user-not-found': 'No existe un usuario con ese email.', 'auth/invalid-email': 'El email no es válido.', 'auth/too-many-requests': 'Demasiados intentos. Esperá unos minutos.', 'auth/network-request-failed': 'Sin conexión a internet. La primera vez hace falta internet para entrar.' }[e.code] || e.message);

// ---------- Cálculos ----------
function resumen(filtro) {
  let ingresos = 0, gastos = 0, inversion = 0, cmv = 0;
  for (const m of movs()) {
    if (!filtro(m.fecha)) continue;
    if (m.tipo === 'ingreso') { ingresos += m.monto; if (m.productoId && m.cantidad) cmv += m.cantidad * (m.costoUnit || 0); }
    else if (m.tipo === 'gasto') gastos += m.monto;
    else if (m.tipo === 'inversion') inversion += m.monto;
  }
  return { ingresos, gastos, inversion, cmv, ganancia: ingresos - cmv - gastos, caja: ingresos - gastos - inversion };
}
// Stock y plata por local: cada producto y cada movimiento es de un local (sin local = el primero).
// Con "Todos juntos" se ve la suma de todos los locales.
const enAlcance = (x) => typeof verTodos !== 'function' || verTodos() || localDe(x) === localActivo();
const prods = () => state.productos.filter(enAlcance);
const movs = () => state.movimientos.filter(enAlcance);
const localSelect = (sel) => (typeof multiLocal === 'function' && multiLocal() ? `<label class="f">Local<select name="local">${locales().map((l) => `<option value="${l.id}" ${l.id === (sel || localActivo()) ? 'selected' : ''}>${esc(l.nombre)}</option>`).join('')}</select></label>` : '');
const selLocal = () => (typeof selectorLocal === 'function' ? selectorLocal() : '');
const valorStock = () => prods().reduce((s, p) => s + Math.max(0, p.stock) * (p.costo || 0), 0);
const stockBajo = () => prods().filter((p) => p.stockMin > 0 && p.stock <= p.stockMin);
function avisos() {
  const hoy = todayStr(), lim = state.config.avisoDias || 3;
  const pend = state.eventos.filter((e) => !e.hecho);
  return {
    vencidos: pend.filter((e) => e.fecha < hoy).sort((a, b) => a.fecha.localeCompare(b.fecha)),
    proximos: pend.filter((e) => e.fecha >= hoy && daysBetween(hoy, e.fecha) <= lim).sort((a, b) => a.fecha.localeCompare(b.fecha)),
  };
}

// ---------- Navegación ----------
let view = 'inicio';
const ui = { prodQ: '', prodCat: '', movTipo: '', movMes: todayStr().slice(0, 7), movQ: '', balAnio: new Date().getFullYear(), balMes: new Date().getMonth(), calMes: todayStr().slice(0, 7), calSel: todayStr(), provQ: '' };
$('#nav').addEventListener('click', (e) => { const a = e.target.closest('a[data-view]'); if (a) go(a.dataset.view); });
function go(v) { view = v; $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.view === v)); render(); window.scrollTo(0, 0); }

function render() {
  $('#brandName').textContent = state.config.negocio || 'Mi Negocio';
  const ver = $('#ver'); if (ver) ver.textContent = 'versión ' + (window.APP_VERSION || '');
  document.title = (state.config.negocio || 'Mi Negocio') + ' — Gestión';
  document.body.classList.toggle('login', !!needLogin());
  syncBadge();
  if (needLogin()) { $('#main').innerHTML = vLogin(); const pw = $('#lgPass'); if (pw) pw.onkeydown = (e) => { if (e.key === 'Enter') ACTS.lgGo(); }; return; }
  const fn = { inicio: vInicio, productos: vProductos, proveedores: vProveedores, finanzas: vFinanzas, balance: vBalance, calendario: vCalendario, turnos: vTurnos, catering: vCatering, ajustes: vAjustes }[view];
  // al redibujar, la pantalla y las planillas con desplazamiento quedan donde estaban
  const scrolls = $$('#main .xls-wrap, #main .tablewrap, #main .tg-wrap').map((el) => [el.scrollLeft, el.scrollTop]);
  const winX = window.scrollX, winY = window.scrollY, mismaVista = render._ultima === view;
  $('#main').innerHTML = fn();
  if (mismaVista) {
    $$('#main .xls-wrap, #main .tablewrap, #main .tg-wrap').forEach((el, i) => { if (scrolls[i]) { el.scrollLeft = scrolls[i][0]; el.scrollTop = scrolls[i][1]; } });
    window.scrollTo(winX, winY);
  }
  render._ultima = view;
  bindView();
}

// Delegación de clicks en toda la app: data-act="accion" data-id="..."
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = ACTS[el.dataset.act]; if (act) { e.preventDefault(); act(el.dataset.id, el); }
});
function bindView() {
  $$('[data-bind]').forEach((el) => {
    const k = el.dataset.bind;
    el.addEventListener(el.tagName === 'INPUT' && el.type !== 'month' ? 'input' : 'change', () => {
      ui[k] = el.type === 'number' ? Number(el.value) : el.value;
      const pos = el.selectionStart; render();
      const again = $(`[data-bind="${k}"]`); if (again && again.tagName === 'INPUT' && again.type === 'search') { again.focus(); try { again.setSelectionRange(pos, pos); } catch {} }
    });
  });
}

// ---------- Vistas ----------
function kpi(lbl, val, cls = '', hint = '') { return `<div class="card kpi"><div class="lbl">${lbl}</div><div class="val ${cls}">${val}</div>${hint ? `<div class="hint">${hint}</div>` : ''}</div>`; }

function evLine(e, venc) {
  const t = TIPOS_EV[e.tipo];
  const d = daysBetween(todayStr(), e.fecha);
  const cuando = d < 0 ? `venció hace ${-d} día${d === -1 ? '' : 's'}` : d === 0 ? 'vence HOY' : `en ${d} día${d === 1 ? '' : 's'}`;
  return `<div class="alert ${venc ? 'venc' : 'prox'}"><div>${t.ico} <b>${esc(e.titulo)}</b>${e.persona ? ' · ' + esc(e.persona) : ''}${e.monto ? ' · <b>' + fmtMoney(e.monto) + '</b>' : ''}<div class="small muted">${t.lbl} · ${fmtDate(e.fecha)} (${cuando})</div></div><div class="row"><button class="sm" data-act="evDone" data-id="${e.id}">✔ Marcar resuelto</button><button class="sm" data-act="evEdit" data-id="${e.id}">Ver</button></div></div>`;
}

function vInicio() {
  const hoy = todayStr(), mes = hoy.slice(0, 7), anio = hoy.slice(0, 4);
  const rm = resumen((f) => f.startsWith(mes)), total = resumen(() => true);
  const { vencidos, proximos } = avisos(), bajo = stockBajo();
  const recup = total.inversion > 0 ? (total.ganancia / total.inversion) * 100 : 0;
  return `
  <h1>Hola 👋</h1><p class="sub">${new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
  ${selLocal()}
  <div class="row" style="margin-bottom:16px">
    <button class="pri" data-act="venta">🛒 Registrar venta</button>
    <button data-act="compra">📥 Registrar compra</button>
    <button data-act="movNew" data-id="gasto">➖ Cargar gasto</button>
    <button data-act="evNew">📅 Nueva deuda / aviso</button>
    <button data-act="prodNew">➕ Nuevo producto</button>
  </div>
  ${vencidos.length || proximos.length || bajo.length ? `<h2>⚠️ Avisos</h2>` : ''}
  ${vencidos.map((e) => evLine(e, true)).join('')}
  ${proximos.map((e) => evLine(e, false)).join('')}
  ${typeof cateringProximos === 'function' ? cateringProximos() : ''}
  ${bajo.length ? `<div class="alert stock"><div>📦 <b>Stock bajo:</b> ${bajo.map((p) => `${esc(p.nombre)} (${fmtNum(p.stock)})`).join(', ')}</div><button class="sm" data-act="goto" data-id="productos">Ver productos</button></div>` : ''}
  <h2>Este mes (${MESES[new Date().getMonth()]})</h2>
  <div class="grid kpis">
    ${kpi('Cobros / Ventas', fmtMoney(rm.ingresos), 'c-in')}
    ${kpi('Gastos', fmtMoney(rm.gastos), 'c-out')}
    ${kpi('Inversión', fmtMoney(rm.inversion), 'c-inv')}
    ${kpi('Ganancia', fmtMoney(rm.ganancia), rm.ganancia >= 0 ? 'c-in' : 'c-out', 'Ventas − costo de lo vendido − gastos')}
  </div>
  <h2>Inversión vs. ganancia (desde el inicio)</h2>
  <div class="card">
    <div class="spread"><div>Invertiste <b class="c-inv">${fmtMoney(total.inversion)}</b> y la ganancia acumulada es <b class="${total.ganancia >= 0 ? 'c-in' : 'c-out'}">${fmtMoney(total.ganancia)}</b></div><b>${fmtNum(Math.max(0, recup))}% recuperado</b></div>
    <div class="progress mt"><div style="width:${Math.min(100, Math.max(0, recup))}%"></div></div>
    <p class="small muted" style="margin:8px 0 0">Mercadería en stock hoy (a costo): <b>${fmtMoney(valorStock())}</b>. ${total.inversion > 0 && recup < 100 ? `Faltan ${fmtMoney(total.inversion - total.ganancia)} de ganancia para recuperar lo invertido.` : total.inversion > 0 ? '¡Ya recuperaste lo invertido! 🎉' : ''}</p>
  </div>
  <h2>Últimos movimientos</h2>
  ${movTable(movs().sort(byFechaDesc).slice(0, 8), true)}
  `;
}
const byFechaDesc = (a, b) => (b.fecha + (b.creado || '')).localeCompare(a.fecha + (a.creado || ''));

// Productos
function vProductos() {
  const cats = [...new Set(prods().map((p) => p.categoria).filter(Boolean))].sort();
  const q = ui.prodQ.toLowerCase();
  const list = prods().filter((p) => (!ui.prodCat || p.categoria === ui.prodCat) && (!q || [p.nombre, p.categoria, p.codigo, (prov(p.proveedorId) || {}).nombre].join(' ').toLowerCase().includes(q))).sort((a, b) => a.nombre.localeCompare(b.nombre));
  return `
  <div class="spread"><div><h1>Productos y stock</h1><p class="sub">${prods().length} productos · valor del stock: <b>${fmtMoney(valorStock())}</b></p></div>
  <div class="row"><button data-act="compra">📥 Entrada de stock</button><button data-act="venta">🛒 Venta</button><button class="pri" data-act="prodNew">➕ Nuevo producto</button></div></div>
  ${selLocal()}
  <div class="row" style="margin-bottom:14px"><input type="search" class="search" placeholder="Buscar producto, código o proveedor…" data-bind="prodQ" value="${esc(ui.prodQ)}">
  <select data-bind="prodCat" style="width:auto"><option value="">Todas las categorías</option>${cats.map((c) => `<option ${c === ui.prodCat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
  ${list.length ? `<div class="grid prods">${list.map((p) => {
    const bajo = p.stockMin > 0 && p.stock <= p.stockMin;
    return `<div class="card prod" data-act="prodView" data-id="${p.id}"><div class="ph" style="${p.foto ? `background-image:url('${p.foto}')` : ''}">${p.foto ? '' : '📦'}</div>
    <div class="bd"><div class="nm">${esc(p.nombre)}</div><div class="meta">${typeof verTodos === 'function' && verTodos() ? `<span class="sw" style="background:${localInfo(localDe(p)).color}"></span>${esc(localInfo(localDe(p)).nombre)} · ` : ''}${esc(p.categoria || 'Sin categoría')}${p.proveedorId && prov(p.proveedorId) ? ' · ' + esc(prov(p.proveedorId).nombre) : ''}</div>
    <div class="spread"><span>${fmtMoney(p.precio)}</span><span class="badge ${p.stock <= 0 ? 'out' : bajo ? 'warn' : 'in'}">Stock: ${fmtNum(p.stock)} ${esc(p.unidad || '')}</span></div></div></div>`;
  }).join('')}</div>` : `<div class="card empty">${prods().length ? 'No hay productos que coincidan con la búsqueda.' : 'Todavía no cargaste productos. Tocá <b>➕ Nuevo producto</b> para empezar.'}</div>`}`;
}

// Proveedores
function vProveedores() {
  const q = ui.provQ.toLowerCase();
  const list = state.proveedores.filter((p) => !q || [p.nombre, p.contacto, p.rubro, p.telefono].join(' ').toLowerCase().includes(q)).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const tot = (id) => state.movimientos.filter((m) => m.proveedorId === id && m.tipo !== 'ingreso').reduce((s, m) => s + m.monto, 0);
  return `
  <div class="spread"><div><h1>Proveedores</h1><p class="sub">Contactos y cuánto le compraste a cada uno.</p></div><button class="pri" data-act="provNew">➕ Nuevo proveedor</button></div>
  <div class="row" style="margin-bottom:14px"><input type="search" class="search" placeholder="Buscar proveedor…" data-bind="provQ" value="${esc(ui.provQ)}"></div>
  ${list.length ? `<div class="tablewrap"><table><thead><tr><th>Proveedor</th><th class="hide-m">Rubro</th><th class="hide-m">Contacto</th><th class="num">Total comprado</th><th class="num hide-m">Productos</th><th></th></tr></thead><tbody>
  ${list.map((p) => `<tr><td><a href="#" data-act="provView" data-id="${p.id}"><b>${esc(p.nombre)}</b></a></td><td class="hide-m">${esc(p.rubro)}</td><td class="hide-m">${esc([p.contacto, p.telefono].filter(Boolean).join(' · '))}</td><td class="num c-inv">${fmtMoney(tot(p.id))}</td><td class="num hide-m">${state.productos.filter((x) => x.proveedorId === p.id).length}</td><td class="right"><button class="sm" data-act="provView" data-id="${p.id}">Ver</button></td></tr>`).join('')}
  </tbody></table></div>` : `<div class="card empty">${state.proveedores.length ? 'Sin resultados.' : 'Todavía no cargaste proveedores.'}</div>`}`;
}

// Movimientos
function movTable(list, compact) {
  if (!list.length) return `<div class="card empty">No hay movimientos ${compact ? 'cargados todavía' : 'en este período'}.</div>`;
  return `<div class="tablewrap"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Detalle</th>${compact ? '' : '<th class="hide-m">Proveedor</th>'}<th class="num">Monto</th><th></th></tr></thead><tbody>
  ${list.map((m) => {
    const t = TIPOS_MOV[m.tipo];
    const det = [m.categoria, m.descripcion, m.productoId && prod(m.productoId) ? `${fmtNum(m.cantidad)} × ${prod(m.productoId).nombre}` : ''].filter(Boolean).join(' · ');
    return `<tr><td>${fmtDate(m.fecha)}</td><td><span class="badge ${t.cls}">${t.lbl}</span></td><td>${esc(det)}</td>${compact ? '' : `<td class="hide-m">${esc((prov(m.proveedorId) || {}).nombre || '')}</td>`}<td class="num c-${t.cls}"><b>${m.tipo === 'ingreso' ? '+' : '−'}${fmtMoney(m.monto)}</b></td><td class="right"><button class="sm" data-act="movEdit" data-id="${m.id}">Editar</button></td></tr>`;
  }).join('')}</tbody></table></div>`;
}
function vFinanzas() {
  const q = ui.movQ.toLowerCase();
  const list = movs().filter((m) => (!ui.movMes || m.fecha.startsWith(ui.movMes)) && (!ui.movTipo || m.tipo === ui.movTipo) && (!q || [m.categoria, m.descripcion, (prov(m.proveedorId) || {}).nombre, (prod(m.productoId) || {}).nombre].join(' ').toLowerCase().includes(q))).sort(byFechaDesc);
  const r = { ingreso: 0, gasto: 0, inversion: 0 }; list.forEach((m) => (r[m.tipo] += m.monto));
  return `
  <div class="spread"><div><h1>Movimientos de dinero</h1><p class="sub">Todo lo que entra y sale: cobros, gastos e inversiones.</p></div>
  <div class="row"><button data-act="movNew" data-id="ingreso">➕ Cobro</button><button data-act="movNew" data-id="gasto">➖ Gasto</button><button data-act="movNew" data-id="inversion">📈 Inversión</button></div></div>
  ${selLocal()}
  <div class="row" style="margin-bottom:14px">
    <input type="month" data-bind="movMes" value="${esc(ui.movMes)}" style="width:auto"> <button class="sm" data-act="movAll">Ver todo</button>
    <select data-bind="movTipo" style="width:auto"><option value="">Todos los tipos</option>${Object.entries(TIPOS_MOV).map(([k, t]) => `<option value="${k}" ${k === ui.movTipo ? 'selected' : ''}>${t.lbl}</option>`).join('')}</select>
    <input type="search" class="search" placeholder="Buscar…" data-bind="movQ" value="${esc(ui.movQ)}">
    <button class="sm" data-act="exportCsv">⬇ Exportar a Excel (CSV)</button>
  </div>
  <div class="grid kpis" style="margin-bottom:14px">${kpi('Cobros', fmtMoney(r.ingreso), 'c-in')}${kpi('Gastos', fmtMoney(r.gasto), 'c-out')}${kpi('Inversión', fmtMoney(r.inversion), 'c-inv')}${kpi('Neto (caja)', fmtMoney(r.ingreso - r.gasto - r.inversion), r.ingreso - r.gasto - r.inversion >= 0 ? 'c-in' : 'c-out')}</div>
  ${movTable(list)}`;
}

// Balance
function barChart(data) {
  const W = 760, H = 240, pl = 8, pb = 24, pt = 10, n = data.length;
  const max = Math.max(1, ...data.flatMap((d) => [d.ingresos, d.egresos]));
  const gw = (W - pl) / n, bw = Math.min(16, gw / 3);
  const y = (v) => pt + (H - pt - pb) * (1 - v / max);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Cobros y egresos por mes">
  <line x1="0" x2="${W}" y1="${H - pb}" y2="${H - pb}" stroke="#dfe5e3"/>
  ${data.map((d, i) => { const x = pl + i * gw + gw / 2; return `
    <rect x="${x - bw - 1}" y="${y(d.ingresos)}" width="${bw}" height="${H - pb - y(d.ingresos)}" rx="3" fill="#1a7f4b"><title>${d.lbl}: cobros ${fmtMoney(d.ingresos)}</title></rect>
    <rect x="${x + 1}" y="${y(d.egresos)}" width="${bw}" height="${H - pb - y(d.egresos)}" rx="3" fill="#c0392b"><title>${d.lbl}: gastos + inversión ${fmtMoney(d.egresos)}</title></rect>
    <text x="${x}" y="${H - 7}" text-anchor="middle" font-size="12" fill="#66736f">${d.lbl}</text>`; }).join('')}
  </svg>`;
}
function vBalance() {
  const A = ui.balAnio, M = ui.balMes;
  const mesKey = `${A}-${String(M + 1).padStart(2, '0')}`;
  const rm = resumen((f) => f.startsWith(mesKey)), ra = resumen((f) => f.startsWith(String(A))), rt = resumen(() => true);
  const meses = MES_C.map((lbl, i) => { const k = `${A}-${String(i + 1).padStart(2, '0')}`; const r = resumen((f) => f.startsWith(k)); return { lbl, k, ...r, egresos: r.gastos + r.inversion }; });
  const anios = [...new Set([new Date().getFullYear(), ...movs().map((m) => Number(m.fecha.slice(0, 4)))])].sort((a, b) => b - a);
  const gastoCats = {}; movs().filter((m) => m.tipo === 'gasto' && m.fecha.startsWith(String(A))).forEach((m) => (gastoCats[m.categoria || 'Otro'] = (gastoCats[m.categoria || 'Otro'] || 0) + m.monto));
  const provTot = {}; movs().filter((m) => m.tipo === 'inversion' && m.proveedorId).forEach((m) => (provTot[m.proveedorId] = (provTot[m.proveedorId] || 0) + m.monto));
  const recup = rt.inversion > 0 ? (rt.ganancia / rt.inversion) * 100 : 0;
  const block = (r) => `<div class="grid kpis">${kpi('Cobros / Ventas', fmtMoney(r.ingresos), 'c-in')}${kpi('Costo de lo vendido', fmtMoney(r.cmv), 'c-out', 'Lo que te costó la mercadería vendida')}${kpi('Gastos', fmtMoney(r.gastos), 'c-out')}${kpi('Ganancia', fmtMoney(r.ganancia), r.ganancia >= 0 ? 'c-in' : 'c-out', 'Ventas − costo − gastos')}${kpi('Inversión', fmtMoney(r.inversion), 'c-inv')}${kpi('Caja neta', fmtMoney(r.caja), r.caja >= 0 ? 'c-in' : 'c-out', 'Lo que entró − todo lo que salió')}</div>`;
  return `
  <h1>Balance</h1><p class="sub">Mensual, anual, y cuánto recuperaste de lo invertido.</p>
  ${selLocal()}
  <div class="row" style="margin-bottom:6px"><select data-bind="balAnio" style="width:auto">${anios.map((a) => `<option ${a === A ? 'selected' : ''}>${a}</option>`).join('')}</select>
  <select data-bind="balMes" style="width:auto">${MESES.map((m, i) => `<option value="${i}" ${i === M ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
  <h2>Mes: ${MESES[M]} ${A}</h2>${block(rm)}
  <h2>Año ${A}</h2>${block(ra)}
  <div class="card mt"><div class="spread"><b>Mes a mes</b><div class="legend"><span><i style="background:#1a7f4b"></i>Cobros</span><span><i style="background:#c0392b"></i>Gastos + inversión</span></div></div>${barChart(meses)}</div>
  <div class="tablewrap mt"><table><thead><tr><th>Mes</th><th class="num">Cobros</th><th class="num">Gastos</th><th class="num">Inversión</th><th class="num">Ganancia</th><th class="num hide-m">Caja</th></tr></thead><tbody>
  ${meses.map((m, i) => `<tr><td>${MESES[i]}</td><td class="num c-in">${fmtMoney(m.ingresos)}</td><td class="num c-out">${fmtMoney(m.gastos)}</td><td class="num c-inv">${fmtMoney(m.inversion)}</td><td class="num ${m.ganancia >= 0 ? 'c-in' : 'c-out'}"><b>${fmtMoney(m.ganancia)}</b></td><td class="num hide-m">${fmtMoney(m.caja)}</td></tr>`).join('')}
  <tr><td><b>Total ${A}</b></td><td class="num c-in"><b>${fmtMoney(ra.ingresos)}</b></td><td class="num c-out"><b>${fmtMoney(ra.gastos)}</b></td><td class="num c-inv"><b>${fmtMoney(ra.inversion)}</b></td><td class="num"><b>${fmtMoney(ra.ganancia)}</b></td><td class="num hide-m"><b>${fmtMoney(ra.caja)}</b></td></tr>
  </tbody></table></div>
  <div class="grid mt" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
    <div class="card"><b>¿En qué se fue la plata en ${A}?</b>${Object.keys(gastoCats).length ? `<table class="mt"><tbody>${Object.entries(gastoCats).sort((a, b) => b[1] - a[1]).map(([c, v]) => `<tr><td>${esc(c)}</td><td class="num c-out">${fmtMoney(v)}</td><td class="num muted small">${fmtNum((v / ra.gastos) * 100)}%</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Sin gastos cargados.</p>'}</div>
    <div class="card"><b>Inversión vs. ganancia (total)</b>
      <table class="mt"><tbody>
      <tr><td>Total invertido</td><td class="num c-inv"><b>${fmtMoney(rt.inversion)}</b></td></tr>
      <tr><td>Ganancia acumulada</td><td class="num ${rt.ganancia >= 0 ? 'c-in' : 'c-out'}"><b>${fmtMoney(rt.ganancia)}</b></td></tr>
      <tr><td>Mercadería en stock (a costo)</td><td class="num">${fmtMoney(valorStock())}</td></tr>
      <tr><td>Recuperado</td><td class="num"><b>${fmtNum(Math.max(0, recup))}%</b></td></tr></tbody></table>
      <div class="progress mt"><div style="width:${Math.min(100, Math.max(0, recup))}%"></div></div>
      <p class="small muted">${rt.inversion === 0 ? 'Cargá tus inversiones (compras de mercadería, equipamiento, etc.) para ver si la ganancia se corresponde.' : recup >= 100 ? '✅ La ganancia ya cubre todo lo invertido.' : `La ganancia cubre el ${fmtNum(Math.max(0, recup))}% de lo invertido. Faltan ${fmtMoney(rt.inversion - rt.ganancia)}.`}</p>
      ${Object.keys(provTot).length ? `<b class="small">Invertido por proveedor</b><table><tbody>${Object.entries(provTot).sort((a, b) => b[1] - a[1]).map(([id, v]) => `<tr><td>${esc((prov(id) || {}).nombre || '—')}</td><td class="num c-inv">${fmtMoney(v)}</td></tr>`).join('')}</tbody></table>` : ''}
    </div>
  </div>`;
}

// Calendario
function vCalendario() {
  const [Y, Mo] = ui.calMes.split('-').map(Number);
  const first = new Date(Y, Mo - 1, 1), start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
  const days = []; for (let i = 0; i < 42; i++) { const d = new Date(start); d.setDate(start.getDate() + i); days.push(d); }
  const hoy = todayStr();
  const byDay = {}; state.eventos.forEach((e) => (byDay[e.fecha] = byDay[e.fecha] || []).push(e));
  const sel = (byDay[ui.calSel] || []);
  const pend = state.eventos.filter((e) => !e.hecho).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const totPagar = pend.filter((e) => e.tipo === 'pagar' || e.tipo === 'prestamo_recibido').reduce((s, e) => s + (e.monto || 0), 0);
  const totCobrar = pend.filter((e) => e.tipo === 'cobrar' || e.tipo === 'prestamo_dado').reduce((s, e) => s + (e.monto || 0), 0);
  return `
  <div class="spread"><div><h1>Calendario y avisos</h1><p class="sub">Deudas a pagar o cobrar, préstamos y recordatorios.</p></div><button class="pri" data-act="evNew" data-id="${ui.calSel}">➕ Nuevo aviso</button></div>
  <div class="grid kpis" style="margin-bottom:14px">${kpi('Pendiente de pagar', fmtMoney(totPagar), 'c-out')}${kpi('Pendiente de cobrar', fmtMoney(totCobrar), 'c-in')}${kpi('Avisos pendientes', pend.length)}</div>
  <div class="card">
    <div class="spread" style="margin-bottom:10px"><button data-act="calMove" data-id="-1">◀</button><b style="font-size:17px">${MESES[Mo - 1]} ${Y}</b><div class="row"><button class="sm" data-act="calHoy">Hoy</button><button data-act="calMove" data-id="1">▶</button></div></div>
    <div class="cal">${['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => `<div class="dow">${d}</div>`).join('')}
    ${days.map((d) => { const k = ymd(d); const evs = byDay[k] || []; return `<div class="day ${d.getMonth() !== Mo - 1 ? 'other' : ''} ${k === hoy ? 'today' : ''} ${k === ui.calSel ? 'sel' : ''}" data-act="calSel" data-id="${k}"><div>${d.getDate()}</div>${evs.slice(0, 3).map((e) => `<div class="ev ${e.tipo} ${e.hecho ? 'done' : ''}">${esc(e.titulo)}</div>`).join('')}${evs.length > 3 ? `<div class="small muted">+${evs.length - 3}</div>` : ''}</div>`; }).join('')}
    </div>
  </div>
  <h2>${fmtDate(ui.calSel)}</h2>
  ${sel.length ? sel.map(evCard).join('') : `<div class="card empty">Nada para este día. <button class="link" data-act="evNew" data-id="${ui.calSel}">Agregar aviso</button></div>`}
  <h2>Todos los pendientes</h2>
  ${pend.length ? pend.map(evCard).join('') : '<div class="card empty">No hay deudas ni avisos pendientes. 👌</div>'}`;
}
function evCard(e) {
  const t = TIPOS_EV[e.tipo], venc = !e.hecho && e.fecha < todayStr();
  return `<div class="card" style="margin-bottom:8px"><div class="spread"><div>${t.ico} <b>${esc(e.titulo)}</b> ${e.hecho ? '<span class="badge gray">Resuelto</span>' : venc ? '<span class="badge out">Vencido</span>' : ''}
  <div class="small muted">${t.lbl} · ${fmtDate(e.fecha)}${e.persona ? ' · ' + esc(e.persona) : ''}${e.cuota ? ` · cuota ${e.cuota}` : ''}</div>${e.notas ? `<div class="small">${esc(e.notas)}</div>` : ''}</div>
  <div class="row">${e.monto ? `<b>${fmtMoney(e.monto)}</b>` : ''}${e.hecho ? '' : `<button class="sm" data-act="evDone" data-id="${e.id}">✔ Resuelto</button>`}<button class="sm" data-act="evEdit" data-id="${e.id}">Editar</button></div></div></div>`;
}

// Ajustes
function vAjustes() {
  const c = state.config;
  return `
  <h1>Ajustes y respaldo</h1><p class="sub">Datos del negocio y copias de seguridad.</p>
  <div class="card"><div class="form">
    <label class="f full">Nombre del negocio<input id="cfgNeg" value="${esc(c.negocio)}"></label>
    <label class="f">Símbolo de moneda<input id="cfgMon" value="${esc(c.moneda)}"></label>
    <label class="f">Avisar deudas con cuántos días de anticipación<input id="cfgDias" type="number" min="0" value="${c.avisoDias}"></label>
  </div><div class="modal-actions"><button class="pri" data-act="cfgSave">Guardar</button></div></div>
  <h2>Nube (sincronizar PC y celular)</h2>
  <div class="card">${cloud.cfg ? `
    <p style="margin-top:0">${cloud.uid ? `Sesión iniciada como <b>${esc(cloud.email)}</b>. Todo lo que cargues se guarda en la nube y aparece en los demás dispositivos donde entres con este usuario.` : 'No hay sesión iniciada.'}</p>
    ${cloud.error ? `<p class="small c-out">⚠️ ${esc(cloud.error)}</p>` : ''}
    <div class="row">${cloud.uid ? '<button data-act="lgOut">Cerrar sesión</button>' : ''}${window.FIREBASE_CONFIG ? '' : '<button class="danger" data-act="cfgCloudDel">Desconectar este dispositivo de la nube</button>'}</div>` : `
    <p style="margin-top:0">Ahora los datos se guardan solo en este dispositivo. Para sincronizar con otro, pegá acá la configuración de Firebase (el bloque <code>firebaseConfig</code>).</p>
    <label class="f">Configuración de Firebase<textarea id="cfgCloud" placeholder='const firebaseConfig = { apiKey: "...", authDomain: "...", projectId: "...", ... };'></textarea></label>
    <div class="modal-actions"><button class="pri" data-act="cfgCloudSave">Conectar</button></div>`}
  </div>
  <h2>Copia de seguridad</h2>
  <div class="card">
    <p style="margin-top:0">Guardá una copia de todos tus datos (productos, fotos, movimientos, avisos) en un archivo. Sirve para no perder nada y para <b>pasar los datos de la computadora al celular</b> (o al revés): exportás en uno e importás en el otro.</p>
    ${window.desktop ? '<p class="small muted">En la computadora además se guarda una copia automática cada vez que cargás algo, en la carpeta <b>Documentos › Gestion Negocio - Respaldos</b>.</p>' : ''}
    <p class="small muted">Último respaldo exportado: ${c.ultimoRespaldo ? new Date(c.ultimoRespaldo).toLocaleString('es-AR') : 'nunca'}</p>
    <div class="row"><button class="pri" data-act="exportJson">⬇ Exportar copia</button><button data-act="importJson">⬆ Importar copia</button>${window.desktop ? '<button data-act="openBackups">📂 Abrir carpeta de respaldos</button>' : ''}</div>
  </div>
  <h2>Zona peligrosa</h2>
  <div class="card"><p style="margin-top:0" class="small muted">Borra todos los datos${cloud.uid ? ' <b>de la nube y de todos los dispositivos</b>' : ' de este dispositivo'}. Exportá una copia antes.</p><button class="danger" data-act="wipe">🗑 Borrar todo</button></div>
  <p class="small muted mt">Gestión del Negocio · versión ${esc(window.APP_VERSION || '')}</p>`;
}

// ---------- Modales ----------
function openModal(html, onReady) {
  const m = $('#modal'), bx = $('.modal-box', m); bx.className = 'modal-box'; bx.onclick = bx.oninput = bx.onchange = null; bx.innerHTML = html; m.classList.remove('hidden');
  const first = $('input:not([type=hidden]):not([type=file]),select,textarea', m); if (first && window.innerWidth > 760) first.focus();
  onReady && onReady($('.modal-box', m));
}
function closeModal() { $('#modal').classList.add('hidden'); $('#modal .modal-box').innerHTML = ''; if (Object.keys(cloud.deferred).length) { flushDeferred(); saveLocal(); render(); } }
$('#modal').addEventListener('mousedown', (e) => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
function alertBox(msg) { openModal(`<h3>Aviso</h3><p>${esc(msg)}</p><div class="modal-actions"><button class="pri" data-act="close">Entendido</button></div>`); }
function confirmBox(msg, ok, okLbl = 'Sí, continuar') {
  openModal(`<h3>¿Seguro?</h3><p>${msg}</p><div class="modal-actions"><button data-act="close">Cancelar</button><button class="pri" id="cOk">${okLbl}</button></div>`, (box) => { $('#cOk', box).onclick = () => { closeModal(); ok(); }; });
}
const vals = (box) => { const o = {}; $$('[name]', box).forEach((el) => (o[el.name] = el.type === 'checkbox' ? el.checked : el.value.trim())); return o; };
const provOptions = (sel) => `<option value="">— Ninguno —</option>${state.proveedores.slice().sort((a, b) => a.nombre.localeCompare(b.nombre)).map((p) => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}`;
const prodOptions = (sel) => `<option value="">— Elegí un producto —</option>${prods().sort((a, b) => a.nombre.localeCompare(b.nombre)).map((p) => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.nombre)} (stock ${fmtNum(p.stock)})</option>`).join('')}`;

function resizeImage(file, max = 800) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      res(c.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('No se pudo leer la imagen')); };
    img.src = url;
  });
}

// Producto
function prodForm(p) {
  const isNew = !p; p = p || { nombre: '', categoria: '', codigo: '', unidad: 'unidades', costo: 0, precio: 0, stock: 0, stockMin: 0, proveedorId: '', campos: [], notas: '', foto: '' };
  const cats = [...new Set(state.productos.map((x) => x.categoria).filter(Boolean))];
  let foto = p.foto;
  openModal(`<h3>${isNew ? 'Nuevo producto' : 'Editar producto'}</h3>
  <div class="form">
    <div class="full photo-pick"><div class="prev" id="pPrev" style="${foto ? `background-image:url('${foto}')` : ''}">${foto ? '' : '📷'}</div>
      <div class="row"><label class="btn" style="cursor:pointer">📷 ${foto ? 'Cambiar foto' : 'Agregar foto'}<input type="file" accept="image/*" id="pFoto" hidden></label>${foto ? '<button class="sm danger" id="pFotoDel">Quitar</button>' : ''}</div></div>
    <label class="f full">Nombre *<input name="nombre" value="${esc(p.nombre)}" placeholder="Ej: Coca-Cola 1,5 L"></label>
    ${isNew ? localSelect() : ''}
    <label class="f">Categoría<input name="categoria" list="catList" value="${esc(p.categoria)}" placeholder="Ej: Bebidas"><datalist id="catList">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></label>
    <label class="f">Código / SKU<input name="codigo" value="${esc(p.codigo)}"></label>
    <label class="f">Precio de costo (lo que pagás)<input name="costo" inputmode="decimal" value="${p.costo || ''}"></label>
    <label class="f">Precio de venta<input name="precio" inputmode="decimal" value="${p.precio || ''}"></label>
    ${isNew ? `<label class="f">Stock inicial<input name="stock" inputmode="decimal" value=""></label>` : `<label class="f">Stock actual<input value="${fmtNum(p.stock)}" disabled title="Usá Entrada / Venta / Ajuste para cambiarlo"></label>`}
    <label class="f">Unidad<input name="unidad" list="uniList" value="${esc(p.unidad)}"><datalist id="uniList"><option value="unidades"><option value="kg"><option value="litros"><option value="metros"><option value="cajas"><option value="paquetes"></datalist></label>
    <label class="f">Avisar cuando el stock baje de<input name="stockMin" inputmode="decimal" value="${p.stockMin || ''}"></label>
    <label class="f">Proveedor<select name="proveedorId">${provOptions(p.proveedorId)}</select></label>
    <div class="full"><div class="spread small" style="margin-bottom:4px"><b>Otros datos (los que quieras)</b><button class="sm" id="addCampo">+ Agregar dato</button></div><div id="campos">${(p.campos || []).map(campoRow).join('')}</div><div class="small muted">Ej: Talle → M · Color → Rojo · Vencimiento → 12/2026</div></div>
    <label class="f full">Notas<textarea name="notas">${esc(p.notas)}</textarea></label>
  </div>
  <div class="modal-actions">${isNew ? '' : '<button class="danger" id="pDel">Eliminar</button>'}<button data-act="close">Cancelar</button><button class="pri" id="pSave">Guardar</button></div>`, (box) => {
    $('#pFoto', box).onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { foto = await resizeImage(f); const pv = $('#pPrev', box); pv.style.backgroundImage = `url('${foto}')`; pv.textContent = ''; } catch (err) { toast(err.message); } };
    const del = $('#pFotoDel', box); if (del) del.onclick = () => { foto = ''; const pv = $('#pPrev', box); pv.style.backgroundImage = ''; pv.textContent = '📷'; del.remove(); };
    $('#addCampo', box).onclick = () => $('#campos', box).insertAdjacentHTML('beforeend', campoRow({ k: '', v: '' }));
    $('#campos', box).onclick = (e) => { if (e.target.dataset.rm) e.target.closest('.extra').remove(); };
    if (!isNew) $('#pDel', box).onclick = () => confirmBox(`Se va a eliminar <b>${esc(p.nombre)}</b>. Los movimientos de dinero ya cargados se mantienen.`, () => { state.productos = state.productos.filter((x) => x.id !== p.id); commit(); toast('Producto eliminado'); }, 'Eliminar');
    $('#pSave', box).onclick = () => {
      const v = vals(box); if (!v.nombre) return toast('Poné un nombre al producto');
      const campos = $$('.extra', box).map((r) => ({ k: $('.ck', r).value.trim(), v: $('.cv', r).value.trim() })).filter((c) => c.k || c.v);
      const data = { nombre: v.nombre, categoria: v.categoria, codigo: v.codigo, unidad: v.unidad, costo: numIn(v.costo), precio: numIn(v.precio), stockMin: numIn(v.stockMin), proveedorId: v.proveedorId, notas: v.notas, campos, foto };
      if (isNew) {
        const np = { id: uid(), creado: new Date().toISOString(), stock: numIn(v.stock), local: v.local || localActivo(), ...data }; state.productos.push(np);
        if (np.stock) state.stockMovs.push({ id: uid(), fecha: todayStr(), productoId: np.id, tipo: 'ajuste', cantidad: np.stock, nota: 'Stock inicial' });
      } else Object.assign(p, data);
      closeModal(); commit(); toast('Producto guardado ✔');
    };
  });
}
const campoRow = (c) => `<div class="extra"><input class="ck" placeholder="Dato (ej: Talle)" value="${esc(c.k)}"><input class="cv" placeholder="Valor (ej: M)" value="${esc(c.v)}"><button class="sm danger" data-rm="1" type="button">✕</button></div>`;

function prodView(id) {
  const p = prod(id); if (!p) return;
  const movs = state.stockMovs.filter((m) => m.productoId === id).sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 15);
  const vendidos = state.movimientos.filter((m) => m.productoId === id && m.tipo === 'ingreso');
  const uVend = vendidos.reduce((s, m) => s + (m.cantidad || 0), 0), $vend = vendidos.reduce((s, m) => s + m.monto, 0);
  const margen = p.costo > 0 ? ((p.precio - p.costo) / p.costo) * 100 : 0;
  openModal(`<div class="spread"><h3 style="margin:0">${esc(p.nombre)}</h3><button class="sm" data-act="close">✕</button></div>
  ${p.foto ? `<img src="${p.foto}" alt="" style="width:100%;max-height:300px;object-fit:contain;border-radius:10px;background:#f4f6f5;margin-top:12px">` : ''}
  <div class="grid kpis mt">${kpi('Stock', `${fmtNum(p.stock)} <span class="small muted">${esc(p.unidad || '')}</span>`, p.stockMin && p.stock <= p.stockMin ? 'c-warn' : '')}${kpi('Precio venta', fmtMoney(p.precio))}${kpi('Costo', fmtMoney(p.costo), '', p.costo ? `Margen ${fmtNum(margen)}%` : '')}${kpi('Vendido', fmtNum(uVend), '', fmtMoney($vend))}</div>
  <table class="mt small"><tbody>
    <tr><td class="muted">Categoría</td><td>${esc(p.categoria || '—')}</td></tr>
    ${p.codigo ? `<tr><td class="muted">Código</td><td>${esc(p.codigo)}</td></tr>` : ''}
    <tr><td class="muted">Proveedor</td><td>${esc((prov(p.proveedorId) || {}).nombre || '—')}</td></tr>
    ${(p.campos || []).map((c) => `<tr><td class="muted">${esc(c.k)}</td><td>${esc(c.v)}</td></tr>`).join('')}
    ${p.notas ? `<tr><td class="muted">Notas</td><td>${esc(p.notas)}</td></tr>` : ''}
  </tbody></table>
  <div class="row mt"><button class="pri" data-act="venta" data-id="${p.id}">🛒 Venta</button><button data-act="compra" data-id="${p.id}">📥 Entrada / compra</button><button data-act="ajuste" data-id="${p.id}">✏️ Ajustar stock</button><button data-act="prodEdit" data-id="${p.id}">Editar producto</button></div>
  <h2>Historial de stock</h2>
  ${movs.length ? `<table class="small"><tbody>${movs.map((m) => `<tr><td>${fmtDate(m.fecha)}</td><td><span class="badge ${m.tipo === 'entrada' ? 'in' : m.tipo === 'salida' ? 'out' : 'gray'}">${{ entrada: 'Entrada', salida: 'Venta', ajuste: 'Ajuste' }[m.tipo]}</span></td><td class="num">${m.cantidad > 0 ? '+' : ''}${fmtNum(m.cantidad)}</td><td class="muted">${esc(m.nota || '')}</td></tr>`).join('')}</tbody></table>` : '<p class="muted small">Sin movimientos todavía.</p>'}`);
}

// Venta
function ventaForm(prodId) {
  if (!prods().length) return alertBox(typeof verTodos === 'function' && verTodos() ? 'Elegí un local arriba para registrar ventas o compras.' : 'Primero cargá al menos un producto en este local.');
  openModal(`<h3>🛒 Registrar venta</h3><div class="form">
    <label class="f full">Producto *<select name="productoId" id="vProd">${prodOptions(prodId)}</select></label>
    <label class="f">Cantidad *<input name="cantidad" id="vCant" inputmode="decimal" value="1"></label>
    <label class="f">Precio unitario<input name="precio" id="vPre" inputmode="decimal"></label>
    <label class="f">Fecha<input type="date" name="fecha" value="${todayStr()}"></label>
    <label class="f">Total cobrado<input name="total" id="vTot" inputmode="decimal"></label>
    <label class="f full">Nota (opcional)<input name="descripcion" placeholder="Ej: cliente, forma de pago…"></label>
    <label class="f full" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="fiado" id="vFiado" style="width:auto"> <span>Lo dejó fiado (crear aviso "a cobrar" en el calendario)</span></label>
    <label class="f full hidden" id="vFiadoBox" style="display:none">Fecha en que te paga<input type="date" name="fechaCobro" value="${addMonths(todayStr(), 1)}"></label>
  </div><p class="small muted" id="vInfo"></p>
  <div class="modal-actions"><button data-act="close">Cancelar</button><button class="pri" id="vOk">Registrar venta</button></div>`, (box) => {
    const upd = (fromTotal) => {
      const p = prod($('#vProd', box).value); const c = numIn($('#vCant', box).value);
      if (!fromTotal) $('#vTot', box).value = c * numIn($('#vPre', box).value) || '';
      $('#vInfo', box).textContent = p ? `Stock disponible: ${fmtNum(p.stock)} ${p.unidad || ''}${p.stock - c < 0 ? ' ⚠️ quedaría en negativo' : ''}` : '';
    };
    $('#vProd', box).onchange = () => { const p = prod($('#vProd', box).value); $('#vPre', box).value = p ? p.precio : ''; upd(); };
    $('#vCant', box).oninput = () => upd(); $('#vPre', box).oninput = () => upd(); $('#vTot', box).oninput = () => upd(true);
    $('#vFiado', box).onchange = (e) => ($('#vFiadoBox', box).style.display = e.target.checked ? 'flex' : 'none');
    if (prodId) $('#vProd', box).onchange();
    $('#vOk', box).onclick = () => {
      const v = vals(box), p = prod(v.productoId), cant = numIn(v.cantidad), total = numIn(v.total);
      if (!p) return toast('Elegí un producto'); if (cant <= 0) return toast('La cantidad tiene que ser mayor a 0');
      p.stock -= cant;
      state.stockMovs.push({ id: uid(), fecha: v.fecha, productoId: p.id, tipo: 'salida', cantidad: -cant, nota: v.descripcion || 'Venta' });
      if (v.fiado) {
        state.eventos.push({ id: uid(), tipo: 'cobrar', titulo: `Venta fiada: ${cant} × ${p.nombre}`, persona: v.descripcion, monto: total, fecha: v.fechaCobro || todayStr(), notas: '', hecho: false, venta: { productoId: p.id, cantidad: cant, costoUnit: p.costo || 0, fechaVenta: v.fecha } });
        closeModal(); commit(); toast('Venta fiada registrada. Cuando te pague, marcala como resuelta en el calendario.');
      } else {
        state.movimientos.push({ id: uid(), creado: new Date().toISOString(), fecha: v.fecha, tipo: 'ingreso', categoria: 'Venta', descripcion: v.descripcion, monto: total, productoId: p.id, cantidad: cant, costoUnit: p.costo || 0, local: localDe(p) });
        closeModal(); commit(); toast('Venta registrada ✔');
      }
    };
  });
}

// Compra / entrada de stock
function compraForm(prodId) {
  if (!prods().length) return alertBox(typeof verTodos === 'function' && verTodos() ? 'Elegí un local arriba para registrar ventas o compras.' : 'Primero cargá al menos un producto en este local.');
  const p0 = prod(prodId);
  openModal(`<h3>📥 Entrada de mercadería</h3><div class="form">
    <label class="f full">Producto *<select name="productoId" id="cProd">${prodOptions(prodId)}</select></label>
    <label class="f">Cantidad *<input name="cantidad" id="cCant" inputmode="decimal" value=""></label>
    <label class="f">Costo unitario<input name="costo" id="cCos" inputmode="decimal" value="${p0 ? p0.costo || '' : ''}"></label>
    <label class="f">Proveedor<select name="proveedorId" id="cProv">${provOptions(p0 ? p0.proveedorId : '')}</select></label>
    <label class="f">Fecha<input type="date" name="fecha" value="${todayStr()}"></label>
    <label class="f">Total pagado<input name="total" id="cTot" inputmode="decimal"></label>
    <label class="f full" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="registrar" checked style="width:auto"> <span>Registrar el pago como <b>inversión</b> en el balance</span></label>
    <label class="f full" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="actCosto" checked style="width:auto"> <span>Actualizar el precio de costo del producto</span></label>
    <label class="f full" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="debo" id="cDebo" style="width:auto"> <span>Lo pago más adelante (crear aviso "a pagar")</span></label>
    <label class="f full" id="cDeboBox" style="display:none">Fecha de pago<input type="date" name="fechaPago" value="${addMonths(todayStr(), 1)}"></label>
    <label class="f full">Nota (opcional)<input name="descripcion" placeholder="Ej: N° de factura"></label>
  </div><div class="modal-actions"><button data-act="close">Cancelar</button><button class="pri" id="cOk">Registrar entrada</button></div>`, (box) => {
    const upd = () => ($('#cTot', box).value = numIn($('#cCant', box).value) * numIn($('#cCos', box).value) || '');
    $('#cProd', box).onchange = () => { const p = prod($('#cProd', box).value); if (p) { $('#cCos', box).value = p.costo || ''; if (p.proveedorId) $('#cProv', box).value = p.proveedorId; } upd(); };
    $('#cCant', box).oninput = upd; $('#cCos', box).oninput = upd;
    $('#cDebo', box).onchange = (e) => ($('#cDeboBox', box).style.display = e.target.checked ? 'flex' : 'none');
    $('#cOk', box).onclick = () => {
      const v = vals(box), p = prod(v.productoId), cant = numIn(v.cantidad), total = numIn(v.total);
      if (!p) return toast('Elegí un producto'); if (cant <= 0) return toast('Poné la cantidad');
      p.stock += cant; if (v.actCosto && numIn(v.costo)) p.costo = numIn(v.costo); if (v.proveedorId && !p.proveedorId) p.proveedorId = v.proveedorId;
      state.stockMovs.push({ id: uid(), fecha: v.fecha, productoId: p.id, tipo: 'entrada', cantidad: cant, nota: [(prov(v.proveedorId) || {}).nombre, v.descripcion].filter(Boolean).join(' · ') || 'Compra' });
      if (v.debo) state.eventos.push({ id: uid(), tipo: 'pagar', titulo: `Pagar compra: ${cant} × ${p.nombre}`, persona: (prov(v.proveedorId) || {}).nombre || '', monto: total, fecha: v.fechaPago, notas: v.descripcion, hecho: false, mov: v.registrar && total ? { tipo: 'inversion', categoria: 'Mercadería', proveedorId: v.proveedorId, productoId: p.id, cantidad: cant } : null });
      else if (v.registrar && total) state.movimientos.push({ id: uid(), creado: new Date().toISOString(), fecha: v.fecha, tipo: 'inversion', categoria: 'Mercadería', descripcion: v.descripcion, monto: total, proveedorId: v.proveedorId, productoId: p.id, cantidad: cant, compra: true, local: localDe(p) });
      closeModal(); commit(); toast('Entrada registrada ✔');
    };
    if (prodId) upd();
  });
}

function ajusteForm(prodId) {
  const p = prod(prodId); if (!p) return;
  openModal(`<h3>✏️ Ajustar stock: ${esc(p.nombre)}</h3><p class="small muted">Para corregir el stock (conteo, rotura, pérdida, etc). No afecta el dinero.</p><div class="form">
    <label class="f">Stock real ahora<input name="real" inputmode="decimal" value="${p.stock}"></label>
    <label class="f">Motivo<input name="nota" placeholder="Ej: conteo, se rompió…"></label></div>
    <div class="modal-actions"><button data-act="close">Cancelar</button><button class="pri" id="aOk">Guardar</button></div>`, (box) => {
    $('#aOk', box).onclick = () => { const v = vals(box), real = numIn(v.real), dif = real - p.stock; if (dif) { state.stockMovs.push({ id: uid(), fecha: todayStr(), productoId: p.id, tipo: 'ajuste', cantidad: dif, nota: v.nota || 'Ajuste' }); p.stock = real; } closeModal(); commit(); toast('Stock actualizado'); };
  });
}

// Proveedor
function provForm(p) {
  const isNew = !p; p = p || { nombre: '', rubro: '', contacto: '', telefono: '', email: '', direccion: '', cuit: '', notas: '' };
  openModal(`<h3>${isNew ? 'Nuevo proveedor' : 'Editar proveedor'}</h3><div class="form">
    <label class="f full">Nombre / Empresa *<input name="nombre" value="${esc(p.nombre)}"></label>
    <label class="f">Rubro<input name="rubro" value="${esc(p.rubro)}" placeholder="Ej: Bebidas"></label>
    <label class="f">Persona de contacto<input name="contacto" value="${esc(p.contacto)}"></label>
    <label class="f">Teléfono / WhatsApp<input name="telefono" inputmode="tel" value="${esc(p.telefono)}"></label>
    <label class="f">Email<input name="email" type="email" value="${esc(p.email)}"></label>
    <label class="f">Dirección<input name="direccion" value="${esc(p.direccion)}"></label>
    <label class="f">CUIT<input name="cuit" value="${esc(p.cuit)}"></label>
    <label class="f full">Notas (días de entrega, condiciones de pago…)<textarea name="notas">${esc(p.notas)}</textarea></label>
  </div><div class="modal-actions">${isNew ? '' : '<button class="danger" id="prDel">Eliminar</button>'}<button data-act="close">Cancelar</button><button class="pri" id="prOk">Guardar</button></div>`, (box) => {
    if (!isNew) $('#prDel', box).onclick = () => confirmBox(`Se va a eliminar <b>${esc(p.nombre)}</b>. Los productos y movimientos quedan, pero sin proveedor.`, () => { state.proveedores = state.proveedores.filter((x) => x.id !== p.id); state.productos.forEach((x) => { if (x.proveedorId === p.id) x.proveedorId = ''; }); commit(); }, 'Eliminar');
    $('#prOk', box).onclick = () => { const v = vals(box); if (!v.nombre) return toast('Poné un nombre'); if (isNew) state.proveedores.push({ id: uid(), ...v }); else Object.assign(p, v); closeModal(); commit(); toast('Proveedor guardado ✔'); };
  });
}
function provView(id) {
  const p = prov(id); if (!p) return;
  const movs = state.movimientos.filter((m) => m.proveedorId === id).sort(byFechaDesc);
  const tot = movs.filter((m) => m.tipo !== 'ingreso').reduce((s, m) => s + m.monto, 0);
  const anio = String(new Date().getFullYear()), totA = movs.filter((m) => m.tipo !== 'ingreso' && m.fecha.startsWith(anio)).reduce((s, m) => s + m.monto, 0);
  const prods = state.productos.filter((x) => x.proveedorId === id);
  const deuda = state.eventos.filter((e) => !e.hecho && e.tipo === 'pagar' && e.persona === p.nombre).reduce((s, e) => s + (e.monto || 0), 0);
  const tel = (p.telefono || '').replace(/[^\d]/g, '');
  openModal(`<div class="spread"><h3 style="margin:0">🚚 ${esc(p.nombre)}</h3><button class="sm" data-act="close">✕</button></div>
  <p class="small muted">${[p.rubro, p.contacto, p.telefono, p.email, p.direccion, p.cuit && 'CUIT ' + p.cuit].filter(Boolean).map(esc).join(' · ')}</p>
  ${p.notas ? `<p class="small">${esc(p.notas)}</p>` : ''}
  <div class="grid kpis">${kpi('Total comprado', fmtMoney(tot), 'c-inv')}${kpi('Comprado en ' + anio, fmtMoney(totA), 'c-inv')}${kpi('Le debés', fmtMoney(deuda), deuda ? 'c-out' : '')}</div>
  <div class="row mt">${tel ? `<a class="btn" href="https://wa.me/${tel}" target="_blank">💬 WhatsApp</a>` : ''}<button data-act="provEdit" data-id="${p.id}">Editar</button><button data-act="movNewProv" data-id="${p.id}">📈 Cargar pago / inversión</button></div>
  <h2>Productos (${prods.length})</h2>${prods.length ? `<p class="small">${prods.map((x) => esc(x.nombre)).join(', ')}</p>` : '<p class="small muted">Ninguno asignado.</p>'}
  <h2>Compras y pagos</h2>${movTable(movs.slice(0, 20), true)}`);
}

// Movimiento de dinero
function movForm(m, tipo, extra = {}) {
  const isNew = !m; m = m || { tipo: tipo || 'gasto', fecha: todayStr(), categoria: '', descripcion: '', monto: '', proveedorId: '', ...extra };
  const catOpts = (t, sel) => CATS[t].map((c) => `<option ${c === sel ? 'selected' : ''}>${c}</option>`).join('');
  openModal(`<h3>${isNew ? 'Nuevo movimiento' : 'Editar movimiento'}</h3><div class="form">
    <label class="f">Tipo<select name="tipo" id="mTipo">${Object.entries(TIPOS_MOV).map(([k, t]) => `<option value="${k}" ${k === m.tipo ? 'selected' : ''}>${t.lbl}</option>`).join('')}</select></label>
    <label class="f">Fecha<input type="date" name="fecha" value="${m.fecha}"></label>
    <label class="f">Categoría<input name="categoria" id="mCat" list="mCats" value="${esc(m.categoria || CATS[m.tipo][0])}"><datalist id="mCats">${catOpts(m.tipo)}</datalist></label>
    <label class="f">Monto *<input name="monto" inputmode="decimal" value="${m.monto || ''}"></label>
    <label class="f">Proveedor (opcional)<select name="proveedorId">${provOptions(m.proveedorId)}</select></label>
    <label class="f">Detalle<input name="descripcion" value="${esc(m.descripcion)}"></label>
    ${m.productoId ? '' : localSelect(m.local)}
    ${m.productoId ? `<p class="full small muted">Vinculado a ${fmtNum(m.cantidad)} × ${esc((prod(m.productoId) || {}).nombre || 'producto eliminado')}. Editar este movimiento no cambia el stock.</p>` : ''}
  </div><div class="modal-actions">${isNew ? '' : '<button class="danger" id="mDel">Eliminar</button>'}<button data-act="close">Cancelar</button><button class="pri" id="mOk">Guardar</button></div>`, (box) => {
    $('#mTipo', box).onchange = (e) => { $('#mCats', box).innerHTML = catOpts(e.target.value); $('#mCat', box).value = CATS[e.target.value][0]; };
    if (!isNew) $('#mDel', box).onclick = () => confirmBox(`Se va a eliminar este movimiento de ${fmtMoney(m.monto)}.${m.productoId ? '<br><span class="small">El stock no se modifica: si hace falta, ajustalo desde el producto.</span>' : ''}`, () => { state.movimientos = state.movimientos.filter((x) => x.id !== m.id); commit(); toast('Movimiento eliminado'); }, 'Eliminar');
    $('#mOk', box).onclick = () => {
      const v = vals(box), monto = numIn(v.monto); if (monto <= 0) return toast('Poné el monto');
      const data = { tipo: v.tipo, fecha: v.fecha, categoria: v.categoria, descripcion: v.descripcion, monto, proveedorId: v.proveedorId, ...(v.local ? { local: v.local } : {}) };
      if (isNew) state.movimientos.push({ id: uid(), creado: new Date().toISOString(), ...extra, ...data }); else Object.assign(m, data);
      closeModal(); commit(); toast('Movimiento guardado ✔');
    };
  });
}

// Evento del calendario
function evForm(e, fecha) {
  const isNew = !e; e = e || { tipo: 'pagar', titulo: '', persona: '', monto: '', fecha: fecha || todayStr(), notas: '', hecho: false };
  openModal(`<h3>${isNew ? 'Nuevo aviso' : 'Editar aviso'}</h3><div class="form">
    <label class="f full">¿Qué es?<select name="tipo">${Object.entries(TIPOS_EV).map(([k, t]) => `<option value="${k}" ${k === e.tipo ? 'selected' : ''}>${t.ico} ${t.lbl}</option>`).join('')}</select></label>
    <label class="f full">Descripción *<input name="titulo" value="${esc(e.titulo)}" placeholder="Ej: Cuota del préstamo, Factura de luz…"></label>
    <label class="f">Persona / empresa<input name="persona" value="${esc(e.persona)}" list="persList"><datalist id="persList">${state.proveedores.map((p) => `<option value="${esc(p.nombre)}">`).join('')}</datalist></label>
    <label class="f">Monto<input name="monto" inputmode="decimal" value="${e.monto || ''}"></label>
    <label class="f">Fecha de vencimiento<input type="date" name="fecha" value="${e.fecha}"></label>
    ${isNew ? `<label class="f">Repetir todos los meses (cuotas)<select name="cuotas"><option value="1">No repetir</option>${[2, 3, 4, 5, 6, 9, 10, 12, 18, 24, 36].map((n) => `<option value="${n}">${n} cuotas</option>`).join('')}</select></label>` : `<label class="f" style="flex-direction:row;align-items:center;gap:8px;margin-top:20px"><input type="checkbox" name="hecho" ${e.hecho ? 'checked' : ''} style="width:auto"> <span>Ya está resuelto</span></label>`}
    <label class="f full">Notas<textarea name="notas">${esc(e.notas)}</textarea></label>
  </div><div class="modal-actions">${isNew ? '' : '<button class="danger" id="eDel">Eliminar</button>'}<button data-act="close">Cancelar</button><button class="pri" id="eOk">Guardar</button></div>`, (box) => {
    if (!isNew) $('#eDel', box).onclick = () => confirmBox('Se va a eliminar este aviso.', () => { state.eventos = state.eventos.filter((x) => x.id !== e.id); commit(); }, 'Eliminar');
    $('#eOk', box).onclick = () => {
      const v = vals(box); if (!v.titulo) return toast('Poné una descripción');
      const data = { tipo: v.tipo, titulo: v.titulo, persona: v.persona, monto: numIn(v.monto), fecha: v.fecha, notas: v.notas };
      if (isNew) {
        const n = Number(v.cuotas) || 1;
        for (let i = 0; i < n; i++) state.eventos.push({ id: uid(), ...data, fecha: addMonths(v.fecha, i), cuota: n > 1 ? `${i + 1}/${n}` : '', hecho: false });
      } else Object.assign(e, data, { hecho: !!v.hecho });
      closeModal(); ui.calSel = v.fecha; ui.calMes = v.fecha.slice(0, 7); commit(); toast('Aviso guardado ✔');
    };
  });
}
function evDone(id) {
  const e = state.eventos.find((x) => x.id === id); if (!e) return;
  const map = { pagar: 'gasto', prestamo_recibido: 'gasto', cobrar: 'ingreso', prestamo_dado: 'ingreso' };
  const tipoMov = e.mov ? e.mov.tipo : e.venta ? 'ingreso' : map[e.tipo];
  if (!tipoMov || !e.monto) { e.hecho = true; commit(); toast('Marcado como resuelto ✔'); return; }
  const lbl = tipoMov === 'ingreso' ? 'cobro' : tipoMov === 'inversion' ? 'inversión' : 'gasto';
  openModal(`<h3>✔ Marcar como resuelto</h3><p><b>${esc(e.titulo)}</b> · ${fmtMoney(e.monto)}</p>
  <p>¿Querés registrar también el ${lbl} de <b>${fmtMoney(e.monto)}</b> en tus movimientos de dinero?</p>
  <label class="f">Fecha del ${lbl}<input type="date" id="dFecha" value="${todayStr()}"></label>
  <div class="modal-actions"><button id="dNo">Solo marcar resuelto</button><button class="pri" id="dSi">Sí, registrar ${lbl}</button></div>`, (box) => {
    $('#dNo', box).onclick = () => { e.hecho = true; closeModal(); commit(); };
    $('#dSi', box).onclick = () => {
      const fecha = $('#dFecha', box).value || todayStr();
      const cat = e.venta ? 'Venta' : e.mov ? e.mov.categoria : tipoMov === 'ingreso' ? 'Cobro de deuda' : 'Pago de deuda';
      state.movimientos.push({ id: uid(), creado: new Date().toISOString(), fecha, tipo: tipoMov, categoria: cat, descripcion: [e.titulo, e.persona].filter(Boolean).join(' · '), monto: e.monto, ...(e.venta ? { productoId: e.venta.productoId, cantidad: e.venta.cantidad, costoUnit: e.venta.costoUnit } : {}), ...(e.mov ? { proveedorId: e.mov.proveedorId, productoId: e.mov.productoId, cantidad: e.mov.cantidad } : {}), local: (e.venta || e.mov) && prod((e.venta || e.mov).productoId) ? localDe(prod((e.venta || e.mov).productoId)) : localActivo() });
      e.hecho = true; closeModal(); commit(); toast(`Resuelto y ${lbl} registrado ✔`);
    };
  });
}

// Respaldo
function download(name, content, type) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type })); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function exportJson() { state.config.ultimoRespaldo = new Date().toISOString(); save(); download(`respaldo-negocio-${todayStr()}.json`, JSON.stringify(state), 'application/json'); toast('Copia exportada ✔'); render(); }
function importJson() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text()); if (!data || !Array.isArray(data.productos) || !Array.isArray(data.movimientos)) throw new Error('El archivo no es una copia válida de esta app.');
      confirmBox(`Se van a <b>reemplazar</b> los datos de este dispositivo por los del archivo (${data.productos.length} productos, ${data.movimientos.length} movimientos, ${(data.eventos || []).length} avisos).`, () => { state = Object.assign(EMPTY(), data, { config: Object.assign(EMPTY().config, data.config || {}) }); commit(); toast('Datos importados ✔'); }, 'Reemplazar');
    } catch (err) { alertBox('No se pudo importar: ' + err.message); }
  };
  inp.click();
}
function exportCsv() {
  const rows = [['Fecha', 'Tipo', 'Categoría', 'Detalle', 'Producto', 'Cantidad', 'Proveedor', 'Monto']];
  state.movimientos.slice().sort((a, b) => a.fecha.localeCompare(b.fecha)).forEach((m) => rows.push([m.fecha, TIPOS_MOV[m.tipo].lbl, m.categoria, m.descripcion, (prod(m.productoId) || {}).nombre || '', m.cantidad || '', (prov(m.proveedorId) || {}).nombre || '', String(m.tipo === 'ingreso' ? m.monto : -m.monto).replace('.', ',')]));
  const csv = '﻿' + rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  download(`movimientos-${todayStr()}.csv`, csv, 'text/csv;charset=utf-8');
}

const ACTS = {
  close: closeModal,
  goto: (v) => go(v),
  prodNew: () => prodForm(),
  prodEdit: (id) => prodForm(prod(id)),
  prodView: (id) => prodView(id),
  venta: (id) => ventaForm(id),
  compra: (id) => compraForm(id),
  ajuste: (id) => ajusteForm(id),
  provNew: () => provForm(),
  provEdit: (id) => provForm(prov(id)),
  provView: (id) => provView(id),
  movNew: (t) => movForm(null, t),
  movNewProv: (id) => movForm(null, 'inversion', { proveedorId: id, categoria: 'Mercadería' }),
  movEdit: (id) => movForm(state.movimientos.find((m) => m.id === id)),
  movAll: () => { ui.movMes = ''; render(); },
  exportCsv,
  evNew: (f) => evForm(null, f),
  evEdit: (id) => evForm(state.eventos.find((e) => e.id === id)),
  evDone,
  calSel: (d) => { ui.calSel = d; render(); },
  calMove: (k) => { ui.calMes = addMonths(ui.calMes + '-01', Number(k)).slice(0, 7); render(); },
  calHoy: () => { ui.calMes = todayStr().slice(0, 7); ui.calSel = todayStr(); render(); },
  cfgSave: () => { state.config.negocio = $('#cfgNeg').value.trim() || 'Mi Negocio'; state.config.moneda = $('#cfgMon').value.trim() || '$'; state.config.avisoDias = Math.max(0, Number($('#cfgDias').value) || 0); commit(); toast('Ajustes guardados ✔'); },
  exportJson, importJson,
  lgGo: async () => {
    const mail = $('#lgMail').value.trim(), pass = $('#lgPass').value; if (!mail || !pass) return ($('#lgErr').textContent = 'Completá email y contraseña.');
    $('#lgErr').textContent = 'Entrando…';
    try { localStorage.setItem('lastEmail', mail); } catch {}
    try { await window.Cloud.login(mail, pass); } catch (e) { $('#lgErr').textContent = authMsg(e); }
  },
  lgReset: async () => { const mail = $('#lgMail').value.trim(); if (!mail) return ($('#lgErr').textContent = 'Escribí tu email arriba y tocá de nuevo.'); try { await window.Cloud.reset(mail); $('#lgErr').textContent = 'Te mandamos un mail para cambiar la contraseña.'; } catch (e) { $('#lgErr').textContent = authMsg(e); } },
  lgOut: () => confirmBox('Vas a cerrar sesión en este dispositivo. Los datos siguen guardados en la nube.', async () => { await window.Cloud.logout(); state = EMPTY(); saveLocal(); render(); }, 'Cerrar sesión'),
  cfgCloudSave: () => { try { const c = parseFirebaseConfig($('#cfgCloud').value); localStorage.setItem('firebaseConfig', JSON.stringify(c)); location.reload(); } catch (e) { alertBox(e.message); } },
  cfgCloudDel: () => confirmBox('Este dispositivo deja de sincronizar. Los datos de la nube no se borran.', async () => { try { await window.Cloud.logout(); } catch {} localStorage.removeItem('firebaseConfig'); location.reload(); }, 'Desconectar'),
  openBackups: () => window.desktop && window.desktop.openBackups(),
  wipe: () => confirmBox(`Se van a <b>borrar todos los datos</b>${cloud.uid ? ' de la nube (PC y celular)' : ' de este dispositivo'}. Esto no se puede deshacer.`, () => { state = EMPTY(); commit(); toast('Datos borrados'); }, 'Borrar todo'),
};

// ---------- Avisos al abrir ----------
function notificar() {
  const { vencidos, proximos } = avisos(); const n = vencidos.length + proximos.length; if (!n || !('Notification' in window)) return;
  const send = () => { try { new Notification(state.config.negocio || 'Gestión del Negocio', { body: `${vencidos.length ? vencidos.length + ' vencido(s). ' : ''}${proximos.length ? proximos.length + ' por vencer pronto.' : ''} Abrí el calendario para ver el detalle.`, icon: 'icon-192.png' }); } catch {} };
  if (Notification.permission === 'granted') send(); else if (Notification.permission !== 'denied') Notification.requestPermission().then((p) => p === 'granted' && send());
}

window.addEventListener('DOMContentLoaded', async function init() {
  await load();
  startCloud();
  render();
  if (!cloud.cfg) setTimeout(notificar, 800);
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    // cuando se publica una versión nueva, la app se actualiza sola (sin borrar nada a mano)
    const habia = !!navigator.serviceWorker.controller;
    let recargando = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (habia && !recargando) { recargando = true; location.reload(); } });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => { reg.update(); setInterval(() => reg.update(), 30 * 60000); }).catch(() => {});
  }
  // si la app queda abierta, revisar avisos al cambiar de día
  let dia = todayStr(); setInterval(() => { if (todayStr() !== dia) { dia = todayStr(); render(); notificar(); } }, 60000);
});
