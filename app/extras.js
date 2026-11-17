'use strict';
/* Extras para cafetería con catering:
   - Costo de cada producto a partir de sus ingredientes (receta) y la ganancia por porción.
   - Menús de catering armados con precio por persona.
   - Cierre de caja diario por local. */

Object.assign(ui, { prodTab: 'lista', finTab: 'movs', cajaMes: todayStr().slice(0, 7) });

// ================= Receta y costo =================
const esElaborado = (p) => !!(p && p.receta && (p.receta.items || []).length);
function costoReceta(r, prof = 0) {
  if (!r || prof > 5) return 0;
  const tot = (r.items || []).reduce((s, it) => { const q = prod(it.pid); return s + (q ? costoDe(q, prof + 1) * (Number(it.cant) || 0) : 0); }, 0);
  return Math.round((tot / (Number(r.rinde) || 1)) * 100) / 100;
}
function costoDe(p, prof = 0) { if (!p) return 0; return esElaborado(p) ? costoReceta(p.receta, prof) : Number(p.costo) || 0; }
const margenDe = (p) => (p.precio > 0 ? ((p.precio - costoDe(p)) / p.precio) * 100 : 0);

// Productos que pueden ser ingredientes: los del mismo local, que no sean el mismo producto
function ingredientesPosibles(p) {
  const lid = p && p.id ? localDe(p) : localActivo();
  return state.productos.filter((x) => x.id !== (p && p.id) && localDe(x) === lid).sort((a, b) => a.nombre.localeCompare(b.nombre));
}
const filaIng = (opts, it = {}) => `<div class="rec-fila"><select class="ri">${'<option value="">— Ingrediente —</option>' + opts.map((x) => `<option value="${x.id}" ${x.id === it.pid ? 'selected' : ''}>${esc(x.nombre)} (${esc(x.unidad || 'unidades')})</option>`).join('')}</select><input class="rc" inputmode="decimal" placeholder="Cantidad" value="${it.cant ?? ''}"><span class="rs num"></span><button type="button" class="sm" data-rrm="1" title="Quitar">✕</button></div>`;

function recetaSeccion(p) {
  const r = p.receta || { rinde: 1, items: [] }, opts = ingredientesPosibles(p);
  return `<div class="rec-box"><label class="f full" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="recOn" ${esElaborado(p) ? 'checked' : ''} style="width:auto;min-height:0"> <span><b>Se prepara con ingredientes del stock</b> (ej: un café con leche, una tostada). La app calcula cuánto cuesta y cuánto ganás.</span></label>
  <div id="recBody" style="${esElaborado(p) ? '' : 'display:none'}">
    ${opts.length ? '' : '<p class="small c-out">Primero cargá los ingredientes como productos (ej: café en grano en kg, leche en litros).</p>'}
    <div class="small muted" style="margin:8px 0 4px">Ingrediente y cuánto lleva (en la unidad de ese ingrediente, ej: 0,018 kg de café)</div>
    <div id="recItems">${(r.items.length ? r.items : [{}]).map((it) => filaIng(opts, it)).join('')}</div>
    <div class="row" style="justify-content:space-between;margin-top:6px"><button type="button" class="sm" id="recAdd">+ Agregar ingrediente</button><label class="row small" style="gap:6px">Con esto salen<input id="recRinde" inputmode="decimal" value="${r.rinde || 1}" style="width:70px;min-height:36px"> porciones</label></div>
    <div class="rec-res" id="recRes"></div>
  </div></div>`;
}
function recetaLeer(box) {
  if (!$('#recOn', box) || !$('#recOn', box).checked) return null;
  const items = $$('.rec-fila', box).map((r) => ({ pid: $('.ri', r).value, cant: numIn($('.rc', r).value) })).filter((i) => i.pid && i.cant > 0);
  return items.length ? { rinde: numIn($('#recRinde', box).value) || 1, items } : null;
}
function recetaBind(box, p) {
  const opts = ingredientesPosibles(p);
  const upd = () => {
    const on = $('#recOn', box).checked; $('#recBody', box).style.display = on ? '' : 'none';
    const costoIn = $('[name=costo]', box); if (costoIn) { costoIn.disabled = on; costoIn.title = on ? 'Se calcula con la receta' : ''; }
    if (!on) return;
    $$('.rec-fila', box).forEach((r) => { const q = prod($('.ri', r).value), c = numIn($('.rc', r).value); $('.rs', r).textContent = q && c ? fmtMoney(costoDe(q) * c) : ''; });
    const r = recetaLeer(box) || { rinde: 1, items: [] }, costo = costoReceta(r), precio = numIn($('[name=precio]', box).value);
    if (costoIn) costoIn.value = costo ? String(costo).replace('.', ',') : '';
    $('#recRes', box).innerHTML = r.items.length ? `Cuesta <b>${fmtMoney(costo)}</b> por porción${precio ? ` · si lo vendés a ${fmtMoney(precio)} ganás <b class="${precio - costo >= 0 ? 'c-in' : 'c-out'}">${fmtMoney(precio - costo)}</b> (${fmtNum(Math.round(((precio - costo) / precio) * 100))}% del precio)` : ' · poné el precio de venta para ver la ganancia'}` : '';
  };
  $('#recOn', box).onchange = upd;
  $('#recAdd', box).onclick = () => { $('#recItems', box).insertAdjacentHTML('beforeend', filaIng(opts)); upd(); };
  $('#recItems', box).onclick = (e) => { if (e.target.dataset.rrm) { e.target.closest('.rec-fila').remove(); upd(); } };
  $('#recItems', box).oninput = upd; $('#recItems', box).onchange = upd; $('#recRinde', box).oninput = upd;
  const pr = $('[name=precio]', box); if (pr) pr.addEventListener('input', upd);
  upd();
}
function recetaDetalle(p) {
  const r = p.receta;
  return `<h2>Receta</h2><table class="small"><tbody>${r.items.map((it) => { const q = prod(it.pid); return `<tr><td>${esc(q ? q.nombre : 'Ingrediente borrado')}</td><td class="num">${fmtNum(it.cant)} ${esc((q && q.unidad) || '')}</td><td class="num">${q ? fmtMoney(costoDe(q) * it.cant) : '–'}</td></tr>`; }).join('')}
  <tr><td colspan="2"><b>Costo${Number(r.rinde) > 1 ? ` (rinde ${fmtNum(r.rinde)} porciones)` : ''}</b></td><td class="num"><b>${fmtMoney(costoDe(p))}</b> por porción</td></tr></tbody></table>`;
}
// Al vender algo elaborado se descuentan sus ingredientes del stock
function descontarReceta(p, cant, fecha, nota, prof = 0, ref = '') { // cant negativa = devolver (venta anulada)
  if (prof > 5) return;
  const r = p.receta, f = cant / (Number(r.rinde) || 1);
  for (const it of r.items) {
    const q = prod(it.pid); if (!q) continue;
    if (esElaborado(q)) { descontarReceta(q, it.cant * f, fecha, nota, prof + 1, ref); continue; }
    const c = Math.round(it.cant * f * 1000) / 1000; if (!c) continue;
    stockMov(q, -c, c > 0 ? 'salida' : 'entrada', nota, fecha, ref);
  }
}

const tabsProductos = () => `<div class="tabs"><button class="${!['costos', 'cambios'].includes(ui.prodTab) ? 'on' : ''}" data-act="prodTab" data-id="lista">📦 Productos y stock</button><button class="${ui.prodTab === 'costos' ? 'on' : ''}" data-act="prodTab" data-id="costos">🧮 Costos y ganancia</button><button class="${ui.prodTab === 'cambios' ? 'on' : ''}" data-act="prodTab" data-id="cambios">🕓 Historial de cambios</button></div>`;
function vCostos() {
  const elab = prods().filter(esElaborado).sort((a, b) => margenDe(a) - margenDe(b));
  const resto = prods().filter((p) => !esElaborado(p) && p.precio > 0);
  const fila = (p) => { const c = costoDe(p), m = margenDe(p); return `<tr class="clic" data-act="prodView" data-id="${p.id}"><td><b>${esc(p.nombre)}</b>${esElaborado(p) ? '' : '<div class="small muted">Se vende como se compra</div>'}</td><td class="num">${fmtMoney(c)}</td><td class="num">${fmtMoney(p.precio)}</td><td class="num"><b class="${p.precio - c >= 0 ? 'c-in' : 'c-out'}">${fmtMoney(p.precio - c)}</b></td><td class="num"><span class="badge ${m >= 65 ? 'in' : m >= 50 ? 'warn' : 'out'}">${fmtNum(Math.round(m))}%</span></td></tr>`; };
  const tabla = (l) => `<div class="tablewrap"><table><thead><tr><th>Producto</th><th class="num">Cuesta</th><th class="num">Se vende a</th><th class="num">Ganás</th><th class="num">Margen</th></tr></thead><tbody>${l.map(fila).join('')}</tbody></table></div>`;
  return `<div class="spread"><div><h1>Costos y ganancia</h1><p class="sub">Cuánto cuesta hacer cada cosa y cuánto deja.</p></div><div class="row"><button class="pri" data-act="prodNew">➕ Nuevo producto</button></div></div>
  ${selLocal()}${tabsProductos()}
  <div class="card ayuda-card"><b>¿Cómo se usa?</b> Cargá los ingredientes como productos con su precio de costo (ej: <i>Café en grano, kg, 18 €</i>). Después creá lo que vendés (ej: <i>Café con leche</i>), tildá <b>"Se prepara con ingredientes"</b> y poné cuánto lleva de cada uno. Cuando cambie el precio de un ingrediente, el costo se actualiza solo. Al vender algo elaborado se descuentan sus ingredientes del stock.</div>
  <h2>Elaborados ${elab.length ? `<span class="small muted" style="font-weight:400">(los de menor margen arriba)</span>` : ''}</h2>
  ${elab.length ? tabla(elab) : '<div class="card empty">Todavía no hay productos con receta.</div>'}
  ${resto.length ? `<h2>Productos de reventa</h2>${tabla(resto)}` : ''}
  <p class="small muted">Margen = qué parte del precio queda de ganancia después de pagar los ingredientes. Verde: 65% o más · amarillo: 50 a 65% · rojo: menos de 50%.</p>`;
}

// ================= Menús de catering =================
const menus = () => state.config.menus || [];
function costoMenu(m) { return Math.round((m.items || []).reduce((s, it) => s + (it.pid && prod(it.pid) ? costoDe(prod(it.pid)) : Number(it.costo) || 0) * (Number(it.cant) || 0), 0) * 100) / 100; }
function vMenus() {
  const l = menus();
  return `<div class="spread" style="margin-bottom:12px"><p class="muted" style="margin:0">Paquetes fijos con precio por persona para armar el presupuesto en dos toques.</p><button class="pri" data-act="menuNew">➕ Nuevo menú</button></div>
  ${l.length ? `<div class="grid menus-grid">${l.map((m) => { const c = costoMenu(m), g = (m.precioPersona || 0) - c; return `<div class="card menu-card" data-act="menuEdit" data-id="${m.id}"><div class="spread"><b>${esc(m.nombre)}</b><span class="badge in">${fmtMoney(m.precioPersona)} / persona</span></div>
    ${m.descripcion ? `<div class="small muted mt">${esc(m.descripcion)}</div>` : ''}
    <div class="small mt">${(m.items || []).map((it) => esc(it.pid && prod(it.pid) ? prod(it.pid).nombre : it.d)).join(' · ')}</div>
    ${alergMenu(m).length ? `<div class="mt">${alergChips(alergMenu(m), false)}</div>` : ''}
    <div class="small mt">Cuesta ${fmtMoney(c)} por persona · ganás <b class="${g >= 0 ? 'c-in' : 'c-out'}">${fmtMoney(g)}</b></div></div>`; }).join('')}</div>`
  : '<div class="card empty">Todavía no hay menús. Creá por ejemplo <b>Desayuno de trabajo</b>, <b>Coffee break</b> o <b>Cóctel</b>.</div>'}`;
}
const filaMenu = (it = {}) => `<div class="cat-fila mn"><select class="mp"><option value="">Escribir a mano →</option>${state.productos.slice().sort((a, b) => a.nombre.localeCompare(b.nombre)).map((x) => `<option value="${x.id}" ${x.id === it.pid ? 'selected' : ''}>${esc(x.nombre)}${multiLocal() ? ` (${esc(localInfo(localDe(x)).nombre)})` : ''}</option>`).join('')}</select><input class="md" placeholder="Ej: Mini sándwich" value="${esc(it.d || '')}"><input class="mc" inputmode="decimal" placeholder="Por persona" value="${it.cant ?? ''}"><input class="mo" inputmode="decimal" placeholder="Costo c/u" value="${it.costo ?? ''}"><button type="button" class="sm" data-rm="1" title="Quitar">✕</button></div>`;
function menuForm(m) {
  const isNew = !m; m = m || { nombre: '', descripcion: '', items: [], precioPersona: '' };
  openModal(`<h3>${isNew ? 'Nuevo menú de catering' : 'Editar menú'}</h3><div class="form">
    <label class="f">Nombre *<input name="nombre" value="${esc(m.nombre)}" placeholder="Ej: Coffee break"></label>
    <label class="f">Precio por persona *<input name="precioPersona" inputmode="decimal" value="${m.precioPersona || ''}"></label>
    <label class="f full">Descripción (sale en el presupuesto)<input name="descripcion" value="${esc(m.descripcion || '')}" placeholder="Ej: Café, jugo, medialunas y fruta"></label></div>
  <h4 class="cat-h">Qué lleva por persona</h4>
  <div class="small muted" style="margin-bottom:6px">Elegí un producto (el costo sale solo) o escribilo a mano con su costo.</div>
  <div id="mnItems">${(m.items.length ? m.items : [{}]).map(filaMenu).join('')}</div>
  <div class="spread"><button type="button" class="sm" id="mnAdd">+ Agregar</button><span id="mnRes" class="small"></span></div>
  <div class="modal-actions">${isNew ? '' : '<button class="danger" id="mnDel">Eliminar</button>'}<button data-act="close">Cancelar</button><button class="pri" id="mnOk">Guardar</button></div>`, (box) => {
    box.classList.add('modal-ancho');
    const leer = () => $$('.cat-fila.mn', box).map((r) => ({ pid: $('.mp', r).value, d: $('.md', r).value.trim(), cant: numIn($('.mc', r).value), costo: numIn($('.mo', r).value) })).filter((i) => (i.pid || i.d) && i.cant > 0);
    const upd = () => {
      $$('.cat-fila.mn', box).forEach((r) => { const q = prod($('.mp', r).value); $('.md', r).style.display = q ? 'none' : ''; $('.mo', r).style.display = q ? 'none' : ''; });
      const c = costoMenu({ items: leer() }), pr = numIn($('[name=precioPersona]', box).value);
      const al = alergMenu({ items: leer() });
      $('#mnRes', box).innerHTML = (al.length ? `<div class="mb6">Alérgenos: ${alergChips(al, false)}</div>` : '') + `Cuesta <b>${fmtMoney(c)}</b> por persona${pr ? ` · ganás <b class="${pr - c >= 0 ? 'c-in' : 'c-out'}">${fmtMoney(pr - c)}</b>` : c ? ` · precio sugerido ${fmtMoney(Math.ceil(c / 0.35 * 2) / 2)} (costo ≈ 35%)` : ''}`;
    };
    $('#mnAdd', box).onclick = () => { $('#mnItems', box).insertAdjacentHTML('beforeend', filaMenu()); upd(); };
    box.onclick = (e) => { if (e.target.dataset.rm && e.target.closest('.cat-fila')) { e.target.closest('.cat-fila').remove(); upd(); } };
    box.oninput = upd; box.onchange = upd; upd();
    if (!isNew) $('#mnDel', box).onclick = () => confirmBox(`Se va a eliminar el menú <b>${esc(m.nombre)}</b>. Los presupuestos ya hechos no cambian.`, () => { state.config.menus = menus().filter((x) => x.id !== m.id); commit(); }, 'Eliminar');
    $('#mnOk', box).onclick = () => {
      const v = vals(box); if (!v.nombre) return toast('Poné el nombre del menú'); if (!numIn(v.precioPersona)) return toast('Poné el precio por persona');
      const data = { nombre: v.nombre, descripcion: v.descripcion, precioPersona: numIn(v.precioPersona), items: leer() };
      const lista = menus().map((x) => ({ ...x }));
      if (isNew) lista.push({ id: uid(), ...data }); else Object.assign(lista.find((x) => x.id === m.id) || {}, data);
      state.config.menus = lista; closeModal(); commit(); toast('Menú guardado ✔');
    };
  });
}

// ================= Cierre de caja =================
const tabsFinanzas = () => `<div class="tabs"><button class="${ui.finTab !== 'caja' ? 'on' : ''}" data-act="finTab" data-id="movs">💵 Movimientos</button><button class="${ui.finTab === 'caja' ? 'on' : ''}" data-act="finTab" data-id="caja">🧾 Cierre de caja</button></div>`;
const cajaEsperado = (c) => (Number(c.fondo) || 0) + (Number(c.ventas) || 0) - (Number(c.tarjeta) || 0) - (Number(c.bizum) || 0) - (Number(c.otros) || 0) - (Number(c.gastosEf) || 0);
const cajaDif = (c) => Math.round(((Number(c.contado) || 0) - cajaEsperado(c)) * 100) / 100;
const difTxt = (d) => (Math.abs(d) < 0.01 ? '<span class="badge in">Cuadra</span>' : d > 0 ? `<span class="badge warn">Sobran ${fmtMoney(d)}</span>` : `<span class="badge out">Faltan ${fmtMoney(-d)}</span>`);
function vCaja() {
  const l = (state.cierres || []).filter(enAlcance).filter((c) => c.fecha.startsWith(ui.cajaMes)).sort((a, b) => (b.fecha + (b.creado || '')).localeCompare(a.fecha + (a.creado || '')));
  const sum = (k) => l.reduce((s, c) => s + (Number(c[k]) || 0), 0), faltas = l.reduce((s, c) => s + Math.min(0, cajaDif(c)), 0);
  const quien = (c) => (c.quien && persona(c.quien) ? persona(c.quien).nombre : c.quienTxt || '');
  return `<div class="spread"><div><h1>Cierre de caja</h1><p class="sub">Al final del día: cuánto se vendió, cuánto entró por tarjeta y Bizum, y si el efectivo cuadra.</p></div>
  <div class="row"><button class="pri" data-act="cajaNew">➕ Cerrar la caja de hoy</button></div></div>
  ${selLocal()}${tabsFinanzas()}
  <div class="row" style="margin-bottom:14px"><input type="month" data-bind="cajaMes" value="${esc(ui.cajaMes)}" style="width:auto"></div>
  <div class="grid kpis" style="margin-bottom:14px">${kpi('Ventas del mes', fmtMoney(sum('ventas')), 'c-in', `${l.length} cierre${l.length === 1 ? '' : 's'}`)}${kpi('Tarjeta', fmtMoney(sum('tarjeta')))}${kpi('Bizum', fmtMoney(sum('bizum')))}${kpi('Faltantes', fmtMoney(-faltas), faltas < 0 ? 'c-out' : '', 'Suma de lo que faltó en los cierres')}</div>
  ${l.length ? `<div class="tablewrap"><table><thead><tr><th>Día</th>${verTodos() ? '<th>Local</th>' : ''}<th class="hide-m">Cerró</th><th class="num">Ventas</th><th class="num hide-m">Efectivo esperado</th><th class="num hide-m">Contado</th><th>Diferencia</th></tr></thead><tbody>
  ${l.map((c) => `<tr class="clic" data-act="cajaEdit" data-id="${c.id}"><td>${fmtDate(c.fecha)}</td>${verTodos() ? `<td><span class="sw" style="background:${localInfo(localDe(c)).color}"></span>${esc(localInfo(localDe(c)).nombre)}</td>` : ''}<td class="hide-m">${esc(quien(c))}</td><td class="num"><b>${fmtMoney(c.ventas)}</b></td><td class="num hide-m">${fmtMoney(cajaEsperado(c))}</td><td class="num hide-m">${fmtMoney(c.contado)}</td><td>${difTxt(cajaDif(c))}</td></tr>`).join('')}
  </tbody></table></div>` : '<div class="card empty">No hay cierres de caja este mes.</div>'}`;
}
function cajaForm(c) {
  const isNew = !c;
  if (isNew && verTodos()) return alertBox('Elegí arriba el local del que vas a cerrar la caja.');
  const ant = (state.cierres || []).filter((x) => localDe(x) === localActivo()).sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
  c = c || { fecha: todayStr(), local: localActivo(), fondo: ant ? ant.fondoSig ?? ant.fondo : '', ventas: '', tarjeta: '', bizum: '', otros: '', gastosEf: '', contado: '', quien: '', nota: '', registrar: true };
  const ppl = activos(), m$ = (k) => (c[k] === '' || c[k] == null ? '' : c[k]);
  openModal(`<h3>🧾 ${isNew ? 'Cierre de caja' : 'Cierre del ' + fmtDate(c.fecha)}${multiLocal() ? ' · ' + esc(localInfo(c.local || localActivo()).nombre) : ''}</h3>
  <div class="form">
    <label class="f">Día<input type="date" name="fecha" value="${c.fecha}"></label>
    <label class="f">Quién cierra<select name="quien"><option value="">—</option>${ppl.map((p) => `<option value="${p.id}" ${p.id === c.quien ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select></label>
    <label class="f">Fondo de caja al abrir<input name="fondo" inputmode="decimal" value="${m$('fondo')}" placeholder="Ej: 100"></label>
    <label class="f">Ventas del día (total del ticket Z / TPV) *<input name="ventas" inputmode="decimal" value="${m$('ventas')}"></label>
    <label class="f">Cobrado con tarjeta<input name="tarjeta" inputmode="decimal" value="${m$('tarjeta')}"></label>
    <label class="f">Cobrado por Bizum<input name="bizum" inputmode="decimal" value="${m$('bizum')}"></label>
    <label class="f">Otros (vales, invitaciones…)<input name="otros" inputmode="decimal" value="${m$('otros')}"></label>
    <label class="f">Pagos hechos con efectivo de la caja<input name="gastosEf" inputmode="decimal" value="${m$('gastosEf')}"></label>
    <label class="f full">Efectivo contado al cerrar *<input name="contado" inputmode="decimal" value="${m$('contado')}"></label>
  </div>
  <div class="small muted" id="cjTk" style="margin:8px 0"></div>
  <div class="caja-res" id="cjRes"></div>
  <div class="form mt">
    <label class="f">Se deja de fondo para mañana<input name="fondoSig" inputmode="decimal" value="${m$('fondoSig')}" placeholder="Igual que hoy"></label>
    <label class="f">Nota<input name="nota" value="${esc(c.nota || '')}" placeholder="Ej: faltan 5 € por cambio"></label>
    <label class="f full" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="registrar" ${c.registrar !== false ? 'checked' : ''} style="width:auto;min-height:0"> <span>Anotar las ventas del día en Movimientos (así salen en el Balance)</span></label>
  </div>
  <div class="modal-actions">${isNew ? '' : '<button class="danger" id="cjDel">Eliminar</button>'}<button data-act="close">Cancelar</button><button class="pri" id="cjOk">Guardar cierre</button></div>`, (box) => {
    const upd = () => {
      const v = vals(box), x = {}; ['fondo', 'ventas', 'tarjeta', 'bizum', 'otros', 'gastosEf', 'contado'].forEach((k) => (x[k] = numIn(v[k])));
      const esp = cajaEsperado(x), d = cajaDif(x);
      $('#cjTk', box).innerHTML = typeof cajaTickets === 'function' ? cajaTickets(v.fecha, c.local || localActivo()) : '';
      $('#cjRes', box).innerHTML = `<div class="spread"><span>En la caja tendría que haber</span><b>${fmtMoney(esp)}</b></div><div class="small muted">Fondo + ventas − tarjeta − Bizum − otros − pagos en efectivo</div>${v.contado !== '' ? `<div class="spread mt"><span>Contaste ${fmtMoney(x.contado)}</span>${difTxt(d)}</div>` : ''}`;
    };
    box.oninput = upd; box.onchange = upd; upd();
    if (!isNew) $('#cjDel', box).onclick = () => confirmBox('Se va a eliminar este cierre de caja' + (c.movId ? ' y las ventas que anotó en Movimientos' : '') + '.', () => { state.cierres = state.cierres.filter((x) => x.id !== c.id); if (c.movId) state.movimientos = state.movimientos.filter((m) => m.id !== c.movId); commit(); }, 'Eliminar');
    $('#cjOk', box).onclick = () => {
      const v = vals(box); if (v.ventas === '') return toast('Poné el total de ventas del día'); if (v.contado === '') return toast('Poné el efectivo que contaste');
      const data = { fecha: v.fecha || todayStr(), quien: v.quien, nota: v.nota, registrar: !!v.registrar };
      ['fondo', 'ventas', 'tarjeta', 'bizum', 'otros', 'gastosEf', 'contado'].forEach((k) => (data[k] = numIn(v[k])));
      data.fondoSig = v.fondoSig === '' ? data.fondo : numIn(v.fondoSig);
      if (isNew) { c = { id: uid(), creado: new Date().toISOString(), local: localActivo(), ...data }; (state.cierres || (state.cierres = [])).push(c); } else Object.assign(c, data);
      // ventas del día en Movimientos, una sola vez por cierre
      const mv = c.movId && state.movimientos.find((m) => m.id === c.movId);
      if (c.registrar && data.ventas > 0) {
        const mdata = { fecha: c.fecha, tipo: 'ingreso', categoria: 'Venta', descripcion: 'Ventas del día (cierre de caja)', monto: data.ventas, local: localDe(c) };
        if (mv) Object.assign(mv, mdata); else { const id = uid(); state.movimientos.push({ id, creado: new Date().toISOString(), ...mdata }); c.movId = id; }
      } else if (mv) { state.movimientos = state.movimientos.filter((m) => m !== mv); c.movId = null; }
      closeModal(); commit(); const d = cajaDif(c); toast(Math.abs(d) < 0.01 ? 'Caja cerrada: cuadra ✔' : d > 0 ? `Caja cerrada: sobran ${fmtMoney(d)}` : `Caja cerrada: faltan ${fmtMoney(-d)}`);
    };
  });
}

Object.assign(ACTS, {
  prodTab: (k) => { ui.prodTab = k; render(); },
  finTab: (k) => { ui.finTab = k; render(); },
  menuNew: () => menuForm(),
  menuEdit: (id) => menuForm(menus().find((m) => m.id === id)),
  cajaNew: () => cajaForm(),
  cajaEdit: (id) => cajaForm((state.cierres || []).find((c) => c.id === id)),
});
