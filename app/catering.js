'use strict';
/* Catering: se lleva aparte de los locales. Cada evento tiene su presupuesto (ítems), estado,
   factura, cobros (seña y resto), gastos propios y el personal que fue con su horario.
   Las horas del personal en caterings confirmados o realizados se suman a sus horas en Turnos. */

const CAT_ESTADOS = {
  presupuesto: { lbl: 'Presupuesto', cls: 'gray', ayuda: 'Se mandó el precio, todavía no confirmaron' },
  confirmado: { lbl: 'Confirmado', cls: 'inv', ayuda: 'Va a hacerse' },
  realizado: { lbl: 'Realizado', cls: 'in', ayuda: 'Ya se hizo' },
  cancelado: { lbl: 'Cancelado', cls: 'out', ayuda: 'No se hace; no suma en nada' },
};
const CAT_MEDIOS = ['Efectivo', 'Transferencia', 'Tarjeta', 'Bizum', 'Otro'];
Object.assign(ui, { catFiltro: 'proximos', catMes: todayStr().slice(0, 7) });

const catList = () => state.caterings || [];
const catTotal = (c) => (c.items || []).reduce((s, i) => s + (Number(i.c) || 0) * (Number(i.p) || 0), 0);
const catCobrado = (c) => (c.cobros || []).reduce((s, x) => s + (Number(x.monto) || 0), 0);
const catGastos = (c) => (c.gastos || []).reduce((s, x) => s + (Number(x.monto) || 0), 0);
const catSaldo = (c) => Math.max(0, Math.round((catTotal(c) - catCobrado(c)) * 100) / 100);
const catCuenta = (c) => c.estado === 'confirmado' || c.estado === 'realizado';
const catHoras = (c) => (c.equipo || []).reduce((s, e) => s + Math.max(0, e.hasta - e.desde) / 60, 0);
const catFacturado = (c) => !!(c.factura && c.factura.numero);
const catBadge = (c) => { const e = CAT_ESTADOS[c.estado] || CAT_ESTADOS.presupuesto; return `<span class="badge ${e.cls}">${e.lbl}</span>`; };
const catNombre = (c) => [c.cliente, c.tipo].filter(Boolean).join(' · ') || 'Catering';

// ---------- IGIC, clientes, copias y WhatsApp ----------
const igicDef = () => (state.config.igic ?? 7);
const catIgic = (c) => Number(c.igic ?? igicDef()) || 0;
const claveCli = (n) => String(n || '').trim().toLowerCase().replace(/\s+/g, ' ');
function clientes() { // agrupados por nombre; datos de contacto del evento más reciente
  const m = new Map();
  catList().slice().sort((a, b) => a.fecha.localeCompare(b.fecha)).forEach((c) => {
    const k = claveCli(c.cliente); if (!k) return;
    const x = m.get(k) || { clave: k, nombre: c.cliente.trim(), eventos: [], contacto: '', lugar: '' };
    x.eventos.push(c); if (c.contacto) x.contacto = c.contacto; if (c.lugar) x.lugar = c.lugar; x.nombre = c.cliente.trim(); m.set(k, x);
  });
  return [...m.values()].map((x) => { const cu = x.eventos.filter(catCuenta); return { ...x, ultimo: x.eventos[x.eventos.length - 1].fecha, vendido: cu.reduce((s, c) => s + catTotal(c), 0), cobrado: cu.reduce((s, c) => s + catCobrado(c), 0), debe: cu.reduce((s, c) => s + catSaldo(c), 0) }; })
    .sort((a, b) => b.ultimo.localeCompare(a.ultimo));
}
function vClientes() {
  const l = clientes();
  if (!l.length) return '<div class="card empty">Cuando cargues caterings, acá aparece cada cliente con lo que pidió, lo cobrado y lo que debe.</div>';
  return `<p class="small muted" style="margin:0 0 10px">Se arma solo con los caterings cargados. Tocá un cliente para ver su historial.</p><div class="cli-grid">${l.map((k) => `<div class="card cli-card clic" data-act="cliVer" data-id="${esc(k.clave)}">
    <div class="spread"><b>${esc(k.nombre)}</b>${k.debe > 0 ? `<span class="badge out">Debe ${fmtMoney(k.debe)}</span>` : '<span class="badge in">Al día</span>'}</div>
    <div class="small muted mt">${k.eventos.length} catering${k.eventos.length === 1 ? '' : 's'} · último ${fmtDate(k.ultimo)}${k.contacto ? ' · ' + esc(k.contacto) : ''}</div>
    <div class="small mt">Vendido <b>${fmtMoney(k.vendido)}</b> · Cobrado <b class="c-in">${fmtMoney(k.cobrado)}</b></div></div>`).join('')}</div>`;
}
function cliFicha(clave) {
  const k = clientes().find((x) => x.clave === clave); if (!k) return;
  openModal(`<h3>👤 ${esc(k.nombre)}</h3><p class="small muted" style="margin-top:0">${[k.contacto, k.lugar].filter(Boolean).map(esc).join(' · ') || 'Sin datos de contacto'}</p>
  <div class="grid kpis">${kpi('Vendido', fmtMoney(k.vendido), 'c-in')}${kpi('Cobrado', fmtMoney(k.cobrado), 'c-in')}${kpi('Debe', fmtMoney(k.debe), k.debe > 0 ? 'c-out' : '')}</div>
  <h4 class="cat-h">Historial</h4><div class="cli-hist">${k.eventos.slice().reverse().map((c) => `<div class="cli-ev clic" data-cat="${c.id}"><div><b>${fmtDate(c.fecha)}</b> · ${esc(c.tipo || 'Catering')}${c.personas ? ` · ${c.personas} personas` : ''}<div class="small muted">${(c.items || []).map((i) => esc(i.d)).join(', ').slice(0, 120)}</div></div><div class="right">${catBadge(c)}<div class="small">${fmtMoney(catTotal(c))}${catCuenta(c) && catSaldo(c) > 0 ? ` · <b class="c-out">falta ${fmtMoney(catSaldo(c))}</b>` : ''}</div></div></div>`).join('')}</div>
  <div class="modal-actions"><button data-act="close">Cerrar</button><button class="pri" id="cliNuevo">➕ Nuevo catering para este cliente</button></div>`, (box) => {
    box.onclick = (e) => { const r = e.target.closest('[data-cat]'); if (r) { const c = catList().find((x) => x.id === r.dataset.cat); closeModal(); catForm(c); } };
    $('#cliNuevo', box).onclick = () => { const u = k.eventos[k.eventos.length - 1]; closeModal(); catForm(catCopia(u)); };
  });
}
function catCopia(c) { // mismo cliente, menú y armado; sin cobros, factura ni fecha vieja
  const j = JSON.parse(JSON.stringify(c));
  ['id', 'creado', 'ejemplo'].forEach((k) => delete j[k]);
  return { ...j, fecha: todayStr(), estado: 'presupuesto', cobros: [], gastos: [], factura: { numero: '', fecha: '' }, material: (j.material || []).map((m) => ({ ...m, ida: false, vuelta: false })), cliente: String(j.cliente || '').replace(/ \(ejemplo\)$/, '') };
}
function catWhatsApp(c) {
  const tot = catTotal(c), t = catIgic(c), neg = state.config.negocio || '';
  const txt = [`*Presupuesto de catering${neg ? ' · ' + neg : ''}*`, `Cliente: ${c.cliente}`, `Fecha: ${fmtDate(c.fecha)}${c.hora ? ' a las ' + c.hora : ''}${c.personas ? ` · ${c.personas} personas` : ''}`, c.lugar ? `Lugar: ${c.lugar}` : '', '',
    ...(c.items || []).map((i) => `• ${fmtNum(i.c)} × ${i.d}: ${fmtMoney(i.c * i.p)}`), '', `*Total: ${fmtMoney(tot)}*${t ? ` (IGIC ${fmtNum(t)}% incluido)` : ''}`,
    catCobrado(c) ? `Ya abonado: ${fmtMoney(catCobrado(c))} · Resta: ${fmtMoney(catSaldo(c))}` : '',
    alergItems(c.items).length ? `Alérgenos: ${alergItems(c.items).map((k) => ALERG[k].n).join(', ')}` : ''].filter((x, i, a) => x !== '' || (a[i - 1] && a[i - 1] !== '')).join('\n');
  let tel = String(c.contacto || '').replace(/[^\d+]/g, ''); if (tel.startsWith('+')) tel = tel.slice(1); else if (/^[6-9]\d{8}$/.test(tel)) tel = '34' + tel;
  window.open(`https://wa.me/${tel.length >= 9 ? tel : ''}?text=${encodeURIComponent(txt)}`, '_blank');
}

function vCatering() {
  const hoy = todayStr(), orden = (a, b) => (a.fecha + (a.hora || '')).localeCompare(b.fecha + (b.hora || ''));
  const all = catList().slice().sort(orden), mes = ui.catMes, [Y, M] = mes.split('-').map(Number);
  const delMes = all.filter((c) => c.fecha.startsWith(mes)), cuentan = delMes.filter(catCuenta);
  const sum = (arr, fn) => arr.reduce((s, c) => s + fn(c), 0);
  const porCobrar = all.filter((c) => catCuenta(c) && catSaldo(c) > 0), sinFactura = all.filter((c) => catCuenta(c) && !catFacturado(c));
  const filtros = [['proximos', 'Próximos'], ['mes', 'Por mes'], ['cobrar', `Por cobrar (${porCobrar.length})`], ['factura', `Sin factura (${sinFactura.length})`], ['todos', 'Todos'], ['clientes', '👤 Clientes'], ['menus', '📋 Menús armados']];
  const list = { proximos: () => all.filter((c) => c.fecha >= hoy && c.estado !== 'cancelado'), mes: () => delMes, cobrar: () => porCobrar, factura: () => sinFactura, todos: () => all.slice().reverse(), menus: () => [], clientes: () => [] }[ui.catFiltro || 'proximos']();
  const ganancia = sum(cuentan, catTotal) - sum(cuentan, catGastos);
  return `<div class="spread"><div><h1>Catering</h1><p class="sub">Eventos, presupuestos, facturas y cobros. Se lleva aparte de los locales.</p></div>
  <div class="row"><button class="pri" data-act="catNew">➕ Nuevo catering</button></div></div>
  <div class="row" style="margin-bottom:10px"><b>Resumen de</b><input type="month" data-bind="catMes" value="${mes}" style="width:auto"></div>
  <div class="grid kpis" style="margin-bottom:6px">
    ${kpi('Vendido en ' + MESES[M - 1].toLowerCase(), fmtMoney(sum(cuentan, catTotal)), 'c-in', `${cuentan.length} catering${cuentan.length === 1 ? '' : 's'} confirmado${cuentan.length === 1 ? '' : 's'} o realizado${cuentan.length === 1 ? '' : 's'}`)}
    ${kpi('Cobrado', fmtMoney(sum(cuentan, catCobrado)), 'c-in', 'De los caterings de ese mes')}
    ${kpi('Gastos', fmtMoney(sum(cuentan, catGastos)), 'c-out', 'Lo que se gastó para hacerlos')}
    ${kpi('Ganancia', fmtMoney(ganancia), ganancia >= 0 ? 'c-in' : 'c-out', 'Vendido − gastos')}
  </div>
  <p class="small muted" style="margin:0 0 14px">Falta cobrar en total: <b class="c-out">${fmtMoney(sum(porCobrar, catSaldo))}</b> · Presupuestos esperando respuesta: <b>${all.filter((c) => c.estado === 'presupuesto' && c.fecha >= hoy).length}</b> · Horas del personal en ${MESES[M - 1].toLowerCase()}: <b>${fmtH(sum(cuentan, catHoras))}</b></p>
  <div class="tabs">${filtros.map(([k, l]) => `<button class="${ui.catFiltro === k ? 'on' : ''}" data-act="catFiltro" data-id="${k}">${l}</button>`).join('')}</div>
  ${ui.catFiltro === 'clientes' ? vClientes() : ui.catFiltro === 'menus' && typeof vMenus === 'function' ? vMenus() : list.length ? `<div class="tablewrap"><table><thead><tr><th>Fecha</th><th>Cliente / evento</th><th class="num hide-m">Personas</th><th class="hide-m">Estado</th><th class="num">Total</th><th class="num">Falta cobrar</th><th class="hide-m">Factura</th><th class="hide-m"></th></tr></thead><tbody>
  ${list.map((c) => { const saldo = catSaldo(c); return `<tr class="clic" data-act="catEdit" data-id="${c.id}"><td>${fmtDate(c.fecha)}${c.hora ? `<div class="small muted">${esc(c.hora)}</div>` : ''}</td><td><b>${esc(c.cliente || 'Sin nombre')}</b>${c.tipo || c.lugar ? `<div class="small muted">${esc([c.tipo, c.lugar].filter(Boolean).join(' · '))}</div>` : ''}<div class="solo-m">${catBadge(c)}</div></td><td class="num hide-m">${c.personas || '–'}</td><td class="hide-m">${catBadge(c)}</td><td class="num"><b>${fmtMoney(catTotal(c))}</b></td><td class="num">${!catCuenta(c) ? '–' : saldo > 0 ? `<b class="c-out">${fmtMoney(saldo)}</b>` : '<span class="badge in">Cobrado</span>'}</td><td class="hide-m">${catFacturado(c) ? `<span class="badge in">N° ${esc(c.factura.numero)}</span>` : catCuenta(c) ? '<span class="badge warn">Sin factura</span>' : '–'}</td><td class="right hide-m"><button class="sm">Abrir</button></td></tr>`; }).join('')}
  </tbody></table></div>` : `<div class="card empty">${catList().length ? 'No hay caterings en esta lista.' : 'Todavía no hay caterings. Tocá <b>➕ Nuevo catering</b> para cargar el primero.'}</div>`}`;
}

// Para Inicio: los caterings de los próximos 7 días
function cateringProximos() {
  const hoy = todayStr(), lim = ymd(new Date(Date.now() + 7 * 864e5));
  const l = catList().filter((c) => c.fecha >= hoy && c.fecha <= lim && c.estado !== 'cancelado').sort((a, b) => (a.fecha + (a.hora || '')).localeCompare(b.fecha + (b.hora || '')));
  if (!l.length) return '';
  return `<h2>🍽️ Caterings de esta semana</h2>${l.map((c) => `<div class="alert"><div><b>${fmtDate(c.fecha)}${c.hora ? ' ' + esc(c.hora) : ''}</b> · ${esc(catNombre(c))}${c.personas ? ` · ${c.personas} personas` : ''} ${catBadge(c)}${catCuenta(c) && catSaldo(c) > 0 ? ` <span class="small c-out">falta cobrar ${fmtMoney(catSaldo(c))}</span>` : ''}</div><button class="sm" data-act="catEdit" data-id="${c.id}">Abrir</button></div>`).join('')}`;
}

// ---------- Formulario ----------
const horasOpt = (sel) => { let h = ''; for (let m = 0; m <= 24 * 60; m += 30) h += `<option value="${m}" ${m === sel ? 'selected' : ''}>${hhmm(m)}</option>`; return h; };
const filaItem = (i = {}) => `<div class="cat-fila it"${i.menuId ? ` data-menu="${esc(i.menuId)}"` : ''}><input class="d" placeholder="Ej: Medialunas de manteca" value="${esc(i.d || '')}"><input class="c" inputmode="decimal" placeholder="Cant." value="${i.c ?? ''}"><input class="p" inputmode="decimal" placeholder="Precio c/u" value="${i.p ?? ''}"><span class="st num"></span><button type="button" class="sm" data-rm="1" title="Quitar">✕</button></div>`;
const filaEquipo = (e = {}) => `<div class="cat-fila eq"><select class="pid">${activos().concat(e.pid && persona(e.pid) && persona(e.pid).activo === false ? [persona(e.pid)] : []).map((p) => `<option value="${p.id}" ${p.id === e.pid ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select><select class="a">${horasOpt(e.desde ?? 9 * 60)}</select><select class="b">${horasOpt(e.hasta ?? 14 * 60)}</select><span class="st num"></span><button type="button" class="sm" data-rm="1" title="Quitar">✕</button></div>`;
const filaGasto = (g = {}) => `<div class="cat-fila ga"><input class="d" placeholder="Ej: Alquiler de vajilla, transporte" value="${esc(g.concepto || '')}"><input class="m" inputmode="decimal" placeholder="Monto" value="${g.monto ?? ''}"><input class="f" type="date" value="${g.fecha || todayStr()}"><button type="button" class="sm" data-rm="1" title="Quitar">✕</button></div>`;
const filaCobro = (x = {}) => `<div class="cat-fila co"><input class="f" type="date" value="${x.fecha || todayStr()}"><input class="m" inputmode="decimal" placeholder="Monto" value="${x.monto ?? ''}"><select class="me">${CAT_MEDIOS.map((m) => `<option ${m === x.medio ? 'selected' : ''}>${m}</option>`).join('')}</select><input class="n" placeholder="Nota (ej: seña)" value="${esc(x.nota || '')}"><button type="button" class="sm" data-rm="1" title="Quitar">✕</button></div>`;

function leerFilas(box) {
  const n = (el) => numIn(el.value);
  return {
    items: $$('.cat-fila.it', box).map((r) => ({ d: $('.d', r).value.trim(), c: n($('.c', r)), p: n($('.p', r)), ...(r.dataset.menu ? { menuId: r.dataset.menu } : {}) })).filter((i) => i.d || i.c || i.p),
    equipo: $$('.cat-fila.eq', box).map((r) => ({ pid: $('.pid', r).value, desde: Number($('.a', r).value), hasta: Number($('.b', r).value) })).filter((e) => e.pid),
    gastos: $$('.cat-fila.ga', box).map((r) => ({ concepto: $('.d', r).value.trim(), monto: n($('.m', r)), fecha: $('.f', r).value })).filter((g) => g.concepto || g.monto),
    cobros: $$('.cat-fila.co', box).map((r) => ({ fecha: $('.f', r).value, monto: n($('.m', r)), medio: $('.me', r).value, nota: $('.n', r).value.trim() })).filter((x) => x.monto),
  };
}

function catForm(c) {
  const isNew = !c || !c.id;
  c = c || { fecha: todayStr(), hora: '', cliente: '', contacto: '', lugar: '', tipo: '', personas: '', estado: 'presupuesto', items: [], equipo: [], gastos: [], cobros: [], factura: { numero: '', fecha: '' }, notas: '' };
  const f = c.factura || {};
  openModal(`<h3>${isNew ? 'Nuevo catering' : 'Catering · ' + esc(catNombre(c))}</h3>
  <div class="form">
    <label class="f">Cliente *<input name="cliente" list="catClis" value="${esc(c.cliente)}" placeholder="Ej: Empresa López / Cumple de Marta"><datalist id="catClis">${clientes().map((k) => `<option value="${esc(k.nombre)}">`).join('')}</datalist></label>
    <label class="f">Teléfono o email<input name="contacto" value="${esc(c.contacto || '')}"></label>
    <label class="f">Día<input type="date" name="fecha" value="${c.fecha}"></label>
    <label class="f">Hora<input type="time" name="hora" value="${esc(c.hora || '')}"></label>
    <label class="f">Tipo de evento<input name="tipo" list="catTipos" value="${esc(c.tipo || '')}" placeholder="Ej: Coffee break"><datalist id="catTipos"><option value="Desayuno"><option value="Coffee break"><option value="Merienda"><option value="Brunch"><option value="Cumpleaños"><option value="Evento de empresa"><option value="Boda"></datalist></label>
    <label class="f">Personas<input name="personas" inputmode="numeric" value="${c.personas || ''}"></label>
    <label class="f full">Lugar / dirección<input name="lugar" value="${esc(c.lugar || '')}"></label>
    <label class="f">Hora de armado<input type="time" name="armado" value="${esc(c.armado || '')}"></label>
    <label class="f">Dietas especiales de los invitados<input name="dietas" value="${esc(c.dietas || '')}" placeholder="Ej: 2 sin gluten, 1 vegano"></label>
    <label class="f">IGIC incluido en los precios (%)<input name="igic" inputmode="decimal" value="${c.igic ?? igicDef()}"></label>
    <label class="f full">Estado<select name="estado">${Object.entries(CAT_ESTADOS).map(([k, e]) => `<option value="${k}" ${k === c.estado ? 'selected' : ''}>${e.lbl} · ${e.ayuda}</option>`).join('')}</select></label>
  </div>
  <h4 class="cat-h">🧾 Presupuesto <span class="small muted">(lo que se cobra)</span></h4>
  <div class="cat-cab small muted"><span>Detalle</span><span>Cant.</span><span>Precio c/u</span><span>Subtotal</span><span></span></div>
  <div id="catItems">${(c.items.length ? c.items : [{}]).map(filaItem).join('')}</div>
  <div class="spread"><div class="row" style="gap:8px"><button type="button" class="sm" data-add="it">+ Agregar ítem</button>${typeof menus === 'function' && menus().length ? `<select id="catMenu" style="width:auto"><option value="">📋 Agregar un menú armado…</option>${menus().map((m) => `<option value="${m.id}">${esc(m.nombre)} · ${fmtMoney(m.precioPersona)}/persona</option>`).join('')}</select>` : ''}</div><div class="right"><b>Total: <span id="catTot"></span></b><div class="small muted" id="catIgic"></div></div></div>
  <div id="catAlerg" class="mt"></div>
  <details class="cat-prod mt"><summary>📋 Producción y compras para este evento</summary><div id="catProd"></div></details>

  <h4 class="cat-h">💶 Cobros <span class="small muted">(seña, resto…)</span></h4>
  <div id="catCobros">${c.cobros.map(filaCobro).join('')}</div>
  <div class="spread"><button type="button" class="sm" data-add="co">+ Agregar cobro</button><span>Cobrado <b id="catCob"></b> · Falta <b id="catSal" class="c-out"></b></span></div>

  <h4 class="cat-h">📄 Factura</h4>
  <div class="form"><label class="f">Número de factura<input name="facNum" value="${esc(f.numero || '')}" placeholder="Vacío = todavía no se hizo"></label><label class="f">Fecha de la factura<input type="date" name="facFecha" value="${f.fecha || ''}"></label></div>

  <h4 class="cat-h">🛒 Gastos del catering</h4>
  <div id="catGastos">${c.gastos.map(filaGasto).join('')}</div>
  <div class="spread"><button type="button" class="sm" data-add="ga">+ Agregar gasto</button><span>Gastos <b id="catGas"></b> · Ganancia <b id="catGan"></b></span></div>

  <h4 class="cat-h">👥 Personal que va</h4>
  ${activos().length ? `<div id="catEquipo">${(c.equipo || []).map(filaEquipo).join('')}</div>
  <div class="spread"><button type="button" class="sm" data-add="eq">+ Agregar persona</button><span>Horas: <b id="catHs"></b></span></div>
  <p class="small muted" style="margin:4px 0 0">Si el catering está confirmado o realizado, estas horas se suman a las de cada persona en Turnos.</p>` : '<p class="small muted">Cargá al personal en Turnos → Personal para poder anotarlo acá.</p>'}

  <h4 class="cat-h">🧺 Material para llevar</h4>
  <div id="catMat">${(c.material || []).map(filaMat).join('')}</div>
  <div class="spread"><div class="row" style="gap:8px"><button type="button" class="sm" data-add="ma">+ Agregar</button><button type="button" class="sm" id="matTipica">Poner la lista típica</button></div><span class="small muted">Tildá al cargar y al volver</span></div>

  <label class="f mt">Notas<textarea name="notas" placeholder="Menú, alergias, horario de entrega…">${esc(c.notas || '')}</textarea></label>
  <div class="modal-actions">${isNew ? '' : '<button class="danger" id="catDel">Eliminar</button><button id="catPrint">🖨 Presupuesto</button><button id="catWa">💬 WhatsApp</button><button id="catHoja">🗒 Hoja del evento</button><button id="catDup">📄 Duplicar</button>'}<button data-act="close">Cancelar</button><button class="pri" id="catOk">Guardar</button></div>`, (box) => {
    box.classList.add('modal-ancho');
    $('[name=cliente]', box).addEventListener('change', (e) => { const k = clientes().find((x) => x.clave === claveCli(e.target.value)); if (!k) return; [['contacto', k.contacto], ['lugar', k.lugar]].forEach(([n, val]) => { const el = $(`[name=${n}]`, box); if (!el.value && val) el.value = val; }); });
    const selMenu = $('#catMenu', box);
    if (selMenu) selMenu.addEventListener('change', () => {
      const m = menus().find((x) => x.id === selMenu.value); selMenu.value = ''; if (!m) return;
      const pers = numIn($('[name=personas]', box).value) || 1;
      $$('.cat-fila.it', box).forEach((r) => { if (!$('.d', r).value.trim() && !$('.c', r).value && !$('.p', r).value) r.remove(); });
      $('#catItems', box).insertAdjacentHTML('beforeend', filaItem({ d: m.nombre + (m.descripcion ? ': ' + m.descripcion : ''), c: pers, p: m.precioPersona, menuId: m.id }));
      upd(); toast(`Menú agregado para ${pers} persona${pers === 1 ? '' : 's'}`);
    });
    const upd = () => {
      const r = leerFilas(box), tmp = { ...r }, tot = catTotal(tmp), cob = catCobrado(tmp), gas = catGastos(tmp);
      $$('.cat-fila.it', box).forEach((row) => { $('.st', row).textContent = fmtMoney(numIn($('.c', row).value) * numIn($('.p', row).value)); });
      $$('.cat-fila.eq', box).forEach((row) => { const h = (Number($('.b', row).value) - Number($('.a', row).value)) / 60; $('.st', row).textContent = h > 0 ? fmtH(h) : '⚠️'; });
      $('#catTot', box).textContent = fmtMoney(tot); { const t = numIn($('[name=igic]', box).value); $('#catIgic', box).textContent = t ? `Base ${fmtMoney(tot / (1 + t / 100))} + IGIC ${fmtNum(t)}% ${fmtMoney(tot - tot / (1 + t / 100))}` : 'Sin IGIC'; } $('#catCob', box).textContent = fmtMoney(cob); $('#catSal', box).textContent = fmtMoney(Math.max(0, tot - cob));
      $('#catGas', box).textContent = fmtMoney(gas); const g = $('#catGan', box); g.textContent = fmtMoney(tot - gas); g.className = tot - gas >= 0 ? 'c-in' : 'c-out';
      const hs = $('#catHs', box); if (hs) hs.textContent = fmtH(catHoras(tmp));
      const al = alergItems(r.items), dts = $('[name=dietas]', box).value.trim();
      $('#catAlerg', box).innerHTML = al.length || dts ? `<div class="alg-aviso">⚠️ <b>Alérgenos del menú:</b> ${al.length ? alergChips(al) : 'ninguno marcado'}${dts ? `<div class="small mt">Dietas especiales: <b>${esc(dts)}</b></div>` : ''}</div>` : '';
      $('#catProd', box).innerHTML = produccionHTML(r.items.map((i) => ({ ...i })));
    };
    const filas = { it: ['#catItems', filaItem], co: ['#catCobros', filaCobro], ga: ['#catGastos', filaGasto], eq: ['#catEquipo', filaEquipo], ma: ['#catMat', filaMat] };
    $('#matTipica', box).onclick = () => { const ya = new Set(leerMat(box).map((m) => m.d.toLowerCase())); MATERIAL_TIPICO.filter((d) => !ya.has(d.toLowerCase())).forEach((d) => $('#catMat', box).insertAdjacentHTML('beforeend', filaMat({ d }))); };
    let luegoHoja = false;
    box.onclick = (e) => {
      const add = e.target.closest('[data-add]'); if (add) { const [sel, fn] = filas[add.dataset.add]; $(sel, box).insertAdjacentHTML('beforeend', fn()); upd(); return; }
      if (e.target.dataset.rm && e.target.closest('.cat-fila')) { e.target.closest('.cat-fila').remove(); upd(); }
    };
    box.oninput = upd; box.onchange = upd; upd();
    if (!isNew) {
      $('#catDel', box).onclick = () => confirmBox(`Se va a eliminar el catering de <b>${esc(catNombre(c))}</b> del ${fmtDate(c.fecha)}.`, () => { state.caterings = catList().filter((x) => x.id !== c.id); commit(); toast('Catering eliminado'); }, 'Eliminar');
      $('#catPrint', box).onclick = () => catImprimir(c);
      $('#catWa', box).onclick = () => catWhatsApp(c);
      $('#catDup', box).onclick = () => { closeModal(); catForm(catCopia(c)); toast('Copia lista: cambiá la fecha y guardá'); };
      $('#catHoja', box).onclick = () => { luegoHoja = true; $('#catOk', box).click(); };
    }
    $('#catOk', box).onclick = () => {
      const v = vals(box), r = leerFilas(box);
      if (!v.cliente) return toast('Poné el nombre del cliente');
      if (r.equipo.some((e) => e.hasta <= e.desde)) return toast('En el personal, la salida tiene que ser después de la entrada');
      const data = { cliente: v.cliente, contacto: v.contacto, fecha: v.fecha || todayStr(), hora: v.hora, tipo: v.tipo, personas: numIn(v.personas) || '', lugar: v.lugar, armado: v.armado, dietas: v.dietas, material: leerMat(box), igic: numIn(v.igic), estado: v.estado, notas: v.notas, factura: { numero: v.facNum, fecha: v.facFecha || (v.facNum ? todayStr() : '') }, ...r };
      if (isNew) { c = { id: uid(), creado: new Date().toISOString(), ...data }; (state.caterings || (state.caterings = [])).push(c); } else Object.assign(c, data);
      closeModal(); commit();
      if (luegoHoja) return catHoja(c);
      const ch = catCuenta(c) ? choques(c.fecha, c.fecha).filter((x) => (x.l1 === 'catering' || x.l2 === 'catering') && c.equipo.some((e) => e.pid === x.pid)) : [];
      if (ch.length) openModal(`<h3>⚠️ Ojo</h3><p>Se guardó el catering, pero ${ch.map((x) => `<b>${esc(persona(x.pid).nombre)}</b> también figura en <b>${esc(localInfo(x.l1 === 'catering' ? x.l2 : x.l1).nombre)}</b> de ${hhmm(x.a)} a ${hhmm(x.b)}`).join('; ')}. Revisá cuál va.</p><div class="modal-actions"><button class="pri" data-act="close">Entendido</button></div>`);
      else toast('Catering guardado ✔');
    };
  });
}

// Presupuesto para imprimir o guardar como PDF y mandar al cliente
function catImprimir(c) {
  const tot = catTotal(c);
  let el = $('#catPrintArea'); if (!el) { el = document.createElement('div'); el.id = 'catPrintArea'; document.body.appendChild(el); }
  el.innerHTML = `<h1>${esc(state.config.negocio || '')}</h1><h2>Presupuesto de catering</h2>
  <p><b>Cliente:</b> ${esc(c.cliente)}${c.contacto ? ' · ' + esc(c.contacto) : ''}<br><b>Fecha del evento:</b> ${fmtDate(c.fecha)}${c.hora ? ' a las ' + esc(c.hora) : ''}${c.lugar ? '<br><b>Lugar:</b> ' + esc(c.lugar) : ''}${c.personas ? `<br><b>Personas:</b> ${c.personas}` : ''}${c.tipo ? `<br><b>Evento:</b> ${esc(c.tipo)}` : ''}</p>
  <table><thead><tr><th>Detalle</th><th class="num">Cantidad</th><th class="num">Precio c/u</th><th class="num">Subtotal</th></tr></thead><tbody>
  ${(c.items || []).map((i) => `<tr><td>${esc(i.d)}</td><td class="num">${fmtNum(i.c)}</td><td class="num">${fmtMoney(i.p)}</td><td class="num">${fmtMoney(i.c * i.p)}</td></tr>`).join('')}
  ${catIgic(c) ? `<tr><td colspan="3">Base imponible</td><td class="num">${fmtMoney(tot / (1 + catIgic(c) / 100))}</td></tr><tr><td colspan="3">IGIC ${fmtNum(catIgic(c))}%</td><td class="num">${fmtMoney(tot - tot / (1 + catIgic(c) / 100))}</td></tr>` : ''}
  <tr><td colspan="3"><b>TOTAL${catIgic(c) ? ' (IGIC incluido)' : ''}</b></td><td class="num"><b>${fmtMoney(tot)}</b></td></tr></tbody></table>
  ${alergItems(c.items).length ? `<p><b>Alérgenos:</b> ${alergItems(c.items).map((k) => ALERG[k].n).join(', ')}</p>` : ''}${c.dietas ? `<p><b>Dietas especiales:</b> ${esc(c.dietas)}</p>` : ''}
  ${catCobrado(c) ? `<p>Ya abonado: ${fmtMoney(catCobrado(c))} · Resta: <b>${fmtMoney(catSaldo(c))}</b></p>` : ''}
  <p class="small">Presupuesto emitido el ${fmtDate(todayStr())}.</p>`;
  document.body.classList.add('cat-print');
  setTimeout(() => { window.print(); document.body.classList.remove('cat-print'); }, 50);
}

Object.assign(ACTS, {
  catNew: () => catForm(),
  catEdit: (id) => catForm(catList().find((c) => c.id === id)),
  catFiltro: (k) => { ui.catFiltro = k; render(); },
  cliVer: (k) => cliFicha(k),
});
