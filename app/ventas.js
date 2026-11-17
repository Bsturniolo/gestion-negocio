'use strict';
/* Ideas tomadas de un sistema de gestión clásico (cabecera + renglones, ficha de stock, auditoría):
   - Venta y compra con varios productos en un mismo comprobante. Cada renglón guarda una "foto del
     momento": nombre, precio de lista, descuento y costo. Si mañana cambia el precio, lo vendido no cambia.
   - Ficha de stock (kardex): cada movimiento con entrada, salida, saldo y el comprobante que lo generó.
   - Historial de cambios: quién cambió qué, con el valor de antes y el de después.
   - Cuenta de cada proveedor: lo comprado, lo pagado y lo que falta pagar. */

const MEDIOS_PAGO = ['Efectivo', 'Tarjeta', 'Bizum', 'Transferencia', 'Otro'];
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const r3 = (n) => Math.round((Number(n) || 0) * 1000) / 1000;
function nroComp(letra) { // T-0001, C-0001… correlativo por tipo de comprobante
  const k = 'nro' + letra, n = (Number(state.config[k]) || 0) + 1; state.config[k] = n;
  return `${letra}-${String(n).padStart(4, '0')}`;
}

// ================= Ficha de stock (kardex) =================
// Único lugar donde se toca el stock: siempre queda anotado cuánto, por qué y con qué comprobante.
function stockMov(p, cant, tipo, nota, fecha, ref) {
  p.stock = r3((Number(p.stock) || 0) + cant);
  state.stockMovs.push({ id: uid(), creado: new Date().toISOString(), fecha: fecha || todayStr(), productoId: p.id, tipo, cantidad: r3(cant), saldo: p.stock, nota: nota || '', ...(ref ? { ref } : {}) });
}
const KX_TIPO = { entrada: ['Entrada', 'in'], salida: ['Salida', 'out'], ajuste: ['Ajuste', 'gray'] };
function kardex(p) { // del más nuevo al más viejo, con el saldo que quedó después de cada movimiento
  const l = state.stockMovs.map((m, i) => [m, i]).filter(([m]) => m.productoId === p.id).sort((a, b) => b[0].fecha.localeCompare(a[0].fecha) || b[1] - a[1]).map(([m]) => m);
  let saldo = Number(p.stock) || 0;
  return l.map((m) => { const fila = { ...m, saldo: r3(saldo) }; saldo -= Number(m.cantidad) || 0; return fila; });
}
function kardexHTML(p, limite) {
  const l = kardex(p), ver = limite ? l.slice(0, limite) : l;
  if (!l.length) return '<p class="small muted">Todavía no hay movimientos de stock.</p>';
  return `<div class="tablewrap"><table class="small kx"><thead><tr><th>Fecha</th><th>Motivo</th><th class="num"><span class="f-l">Entrada</span><span class="f-c">Entra</span></th><th class="num"><span class="f-l">Salida</span><span class="f-c">Sale</span></th><th class="num">Saldo</th></tr></thead><tbody>
  ${ver.map((m) => { const [lbl, cls] = KX_TIPO[m.tipo] || KX_TIPO.ajuste, c = Number(m.cantidad) || 0; return `<tr><td><span class="f-l">${fmtDate(m.fecha)}</span><span class="f-c">${fmtDate(m.fecha).slice(0, 5)}</span></td><td><span class="badge ${cls}">${lbl}</span> ${m.ref ? `<b>${esc(m.ref)}</b> ` : ''}<span class="muted">${esc(m.nota || '')}</span></td><td class="num c-in">${c > 0 ? fmtNum(c) : ''}</td><td class="num c-out">${c < 0 ? fmtNum(-c) : ''}</td><td class="num"><b>${fmtNum(m.saldo)}</b></td></tr>`; }).join('')}
  </tbody></table></div>${limite && l.length > limite ? `<div class="mt"><button class="sm" data-act="kardexVer" data-id="${p.id}">Ver la ficha completa (${l.length} movimientos)</button></div>` : ''}`;
}
function kardexVer(id) {
  const p = prod(id); if (!p) return;
  openModal(`<div class="spread"><h3 style="margin:0">📒 Ficha de stock · ${esc(p.nombre)}</h3><button class="sm" data-act="close">✕</button></div>
  <p class="small muted">Stock actual: <b>${fmtNum(p.stock)} ${esc(p.unidad || '')}</b>. Cada renglón dice cuánto entró o salió, por qué, y cuánto quedó.</p>${kardexHTML(p)}
  <div class="modal-actions"><button data-act="prodView" data-id="${p.id}">Volver al producto</button></div>`, (box) => box.classList.add('modal-ancho'));
}

// ================= Historial de cambios (auditoría) =================
const quienGuardado = () => { try { return localStorage.getItem('quien') || ''; } catch { return ''; } };
const quienSoy = () => quienGuardado() || (typeof cloud !== 'undefined' && cloud.email) || 'Este dispositivo';
function audit(que, sobre, antes, despues, nota) {
  const l = state.auditoria || (state.auditoria = []);
  l.push({ id: uid(), cuando: new Date().toISOString(), quien: quienSoy(), que, sobre: sobre || '', antes: antes ?? '', despues: despues ?? '', nota: nota || '' });
  if (l.length > 800) state.auditoria = l.slice(-800);
}
const auFecha = (iso) => { const d = new Date(iso); return `${fmtDate(ymd(d))} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
function vCambios() {
  const q = (ui.auQ || '').toLowerCase();
  const l = (state.auditoria || []).filter((a) => !q || [a.que, a.sobre, a.quien, a.nota, a.antes, a.despues].join(' ').toLowerCase().includes(q)).sort((a, b) => b.cuando.localeCompare(a.cuando)).slice(0, 200);
  const cambio = (a) => (a.antes !== '' || a.despues !== '' ? `${a.antes !== '' ? `<span class="au-antes">${esc(String(a.antes))}</span> ➜ ` : ''}<b>${esc(String(a.despues))}</b>` : '');
  return `<div class="spread"><div><h1>Productos y stock</h1><p class="sub">Historial de cambios: quién cambió qué, con el valor de antes y el de después.</p></div></div>
  ${selLocal()}${tabsProductos()}
  <div class="row" style="margin-bottom:14px"><input type="search" class="search" placeholder="Buscar producto, persona o tipo de cambio…" data-bind="auQ" value="${esc(ui.auQ || '')}"></div>
  ${l.length ? `<div class="tablewrap hide-m"><table><thead><tr><th>Cuándo</th><th>Qué cambió</th><th>Dónde</th><th>Antes ➜ Después</th><th>Quién</th></tr></thead><tbody>
  ${l.map((a) => `<tr><td class="small">${auFecha(a.cuando)}</td><td><b>${esc(a.que)}</b>${a.nota ? `<div class="small muted">${esc(a.nota)}</div>` : ''}</td><td>${esc(a.sobre)}</td><td>${cambio(a)}</td><td class="small muted">${esc(a.quien)}</td></tr>`).join('')}</tbody></table></div>
  <div class="au-cards solo-m">${l.map((a) => `<div class="card"><div class="spread"><b>${esc(a.que)}</b><span class="small muted">${auFecha(a.cuando)}</span></div><div>${esc(a.sobre)}</div><div class="mt">${cambio(a)}</div><div class="small muted mt">${esc(a.quien)}${a.nota ? ' · ' + esc(a.nota) : ''}</div></div>`).join('')}</div>`
    : `<div class="card empty">${(state.auditoria || []).length ? 'Sin resultados.' : 'Acá van a aparecer los cambios de precio, de costo y de stock, las ventas anuladas y lo que se borre.'}</div>`}`;
}

// ================= Venta con varios productos =================
// Guarda un movimiento por renglón (así el balance y la ganancia siguen igual), todos con el mismo ticket.
function registrarVenta({ fecha, lineas, descPct = 0, medio = 'Efectivo', nota = '', fiado = false, fechaCobro = '' }) {
  fecha = fecha || todayStr();
  const nro = nroComp('T'), ticketId = uid(), filas = [];
  lineas.forEach((l) => {
    const p = prod(l.pid); if (!p || !(l.cant > 0)) return;
    const precio = Number(l.precio) || 0, monto = r2(l.cant * precio * (1 - descPct / 100));
    filas.push({ productoId: p.id, nombreProd: p.nombre, cantidad: l.cant, precioLista: Number(p.precio) || 0, precioUnit: precio, descPct, costoUnit: costoDe(p), monto, ticket: nro, ticketId, medio, local: localDe(p) });
    if (esElaborado(p)) descontarReceta(p, l.cant, fecha, `Venta de ${p.nombre}`, 0, nro);
    else stockMov(p, -l.cant, 'salida', nota || 'Venta', fecha, nro);
  });
  if (!filas.length) return null;
  const total = r2(filas.reduce((s, f) => s + f.monto, 0));
  if (fiado) state.eventos.push({ id: uid(), tipo: 'cobrar', titulo: `Venta fiada ${nro}: ${filas.map((f) => `${fmtNum(f.cantidad)} × ${f.nombreProd}`).join(', ')}`.slice(0, 140), persona: nota, monto: total, fecha: fechaCobro || todayStr(), notas: '', hecho: false, ventas: filas.map((f) => ({ ...f, fechaVenta: fecha })) });
  else filas.forEach((f) => state.movimientos.push({ id: uid(), creado: new Date().toISOString(), fecha, tipo: 'ingreso', categoria: 'Venta', descripcion: nota, ...f }));
  return { nro, ticketId, total, filas };
}
const filaVenta = (pid = '') => `<div class="vt-fila"><select class="vp">${prodOptions(pid)}</select><input class="vc" inputmode="decimal" value="1" aria-label="Cantidad"><input class="vpr" inputmode="decimal" placeholder="Precio" aria-label="Precio unitario"><span class="vs"></span><button type="button" class="sm" data-rm="1" title="Quitar">✕</button></div>`;
function buscarProdCodigo(txt) { // por código o sinónimo exacto; si no, por nombre
  const t = String(txt || '').trim().toLowerCase(); if (!t) return null;
  const l = prods(), codigos = (p) => [p.codigo, ...String(p.sinonimos || '').split(',')].map((x) => String(x || '').trim().toLowerCase()).filter(Boolean);
  const porCodigo = l.find((p) => codigos(p).includes(t)); if (porCodigo) return porCodigo;
  // por nombre: primero el que coincide entero, después palabra entera, después el comienzo; a igualdad, lo que tiene precio de venta
  const sinAcento = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''), q = sinAcento(t);
  const puntos = (p) => { const n = sinAcento(p.nombre).replace(/\s*\(ejemplo\)$/, ''); return n === q ? 5 : n.startsWith(q + ' ') ? 4 : (' ' + n + ' ').includes(' ' + q + ' ') ? 3 : n.startsWith(q) ? 2 : n.includes(q) ? 1 : 0; };
  return l.map((p) => [puntos(p) * 2 + (p.precio > 0 ? 1 : 0), p]).filter(([s]) => s >= 2).sort((a, b) => b[0] - a[0] || a[1].nombre.localeCompare(b[1].nombre)).map(([, p]) => p)[0] || null;
}
function ventaForm(prodId) {
  if (!prods().length) return alertBox(typeof verTodos === 'function' && verTodos() ? 'Elegí un local arriba para registrar ventas o compras.' : 'Primero cargá al menos un producto en este local.');
  openModal(`<h3>🛒 Registrar venta</h3>
  <label class="f">Buscar por nombre o código (o escanear) y Enter<input id="vBus" placeholder="Ej: tiramisú, 8410…" autocomplete="off"></label>
  <div class="vt-cab small muted mt"><span>Producto</span><span>Cant.</span><span>Precio c/u</span><span>Subtotal</span><span></span></div>
  <div id="vFilas">${filaVenta(prodId)}</div>
  <div class="spread"><button type="button" class="sm" id="vAdd">+ Agregar otro producto</button><div class="right"><b>Total: <span id="vTot"></span></b><div class="small muted" id="vGan"></div></div></div>
  <div class="form mt">
    <label class="f">Fecha<input type="date" name="fecha" value="${todayStr()}"></label>
    <label class="f">Forma de pago<select name="medio">${MEDIOS_PAGO.map((m) => `<option>${m}</option>`).join('')}</select></label>
    <label class="f">Descuento (%)<input name="desc" id="vDesc" inputmode="decimal" placeholder="0"></label>
    <label class="f">Nota (opcional)<input name="descripcion" placeholder="Ej: cliente"></label>
    <label class="f full" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="fiado" id="vFiado" style="width:auto"> <span>Lo dejó fiado (crear aviso "a cobrar" en el calendario)</span></label>
    <label class="f full" id="vFiadoBox" style="display:none">Fecha en que te paga<input type="date" name="fechaCobro" value="${addMonths(todayStr(), 1)}"></label>
  </div><p class="small c-warn" id="vInfo"></p>
  <div class="modal-actions"><button data-act="close">Cancelar</button><button class="pri" id="vOk">Registrar venta</button></div>`, (box) => {
    box.classList.add('modal-ancho');
    const leer = () => $$('.vt-fila', box).map((r) => ({ r, pid: $('.vp', r).value, cant: numIn($('.vc', r).value), precio: numIn($('.vpr', r).value) }));
    const upd = () => {
      const d = Math.min(100, Math.max(0, numIn($('#vDesc', box).value))); let tot = 0, cos = 0; const usado = {}, avisos = [];
      leer().forEach((l) => { const p = prod(l.pid), sub = r2(l.cant * l.precio * (1 - d / 100)); $('.vs', l.r).textContent = p ? fmtMoney(sub) : ''; if (!p) return; tot += sub; cos += l.cant * costoDe(p); usado[p.id] = (usado[p.id] || 0) + l.cant; });
      Object.entries(usado).forEach(([id, c]) => { const p = prod(id); if (!esElaborado(p) && p.stock - c < 0) avisos.push(`${p.nombre}: hay ${fmtNum(p.stock)} y quedaría en negativo`); });
      $('#vTot', box).textContent = fmtMoney(tot); $('#vGan', box).textContent = tot ? `Ganancia de esta venta: ${fmtMoney(tot - cos)}` : '';
      $('#vInfo', box).textContent = avisos.length ? '⚠️ ' + avisos.join(' · ') : '';
    };
    const ponerPrecio = (r) => { const p = prod($('.vp', r).value); $('.vpr', r).value = p ? p.precio || '' : ''; };
    const agregar = (pid) => {
      const ya = pid && leer().find((l) => l.pid === pid);
      if (ya) { $('.vc', ya.r).value = fmtNum(ya.cant + 1).replace(/\./g, ''); return upd(); }
      const vacia = leer().find((l) => !l.pid);
      if (vacia && pid) { $('.vp', vacia.r).value = pid; ponerPrecio(vacia.r); return upd(); }
      $('#vFilas', box).insertAdjacentHTML('beforeend', filaVenta(pid)); ponerPrecio($('#vFilas', box).lastElementChild); upd();
    };
    $$('.vt-fila', box).forEach(ponerPrecio);
    $('#vAdd', box).onclick = () => agregar('');
    $('#vBus', box).onkeydown = (e) => { if (e.key !== 'Enter') return; e.preventDefault(); const p = buscarProdCodigo(e.target.value); if (!p) return toast('No encontré ese producto'); agregar(p.id); e.target.value = ''; };
    box.onclick = (e) => { if (e.target.dataset.rm && e.target.closest('.vt-fila')) { if ($$('.vt-fila', box).length > 1) e.target.closest('.vt-fila').remove(); else { const r = e.target.closest('.vt-fila'); $('.vp', r).value = ''; $('.vpr', r).value = ''; } upd(); } };
    box.onchange = (e) => { if (e.target.classList.contains('vp')) ponerPrecio(e.target.closest('.vt-fila')); if (e.target.id === 'vFiado') $('#vFiadoBox', box).style.display = e.target.checked ? 'flex' : 'none'; upd(); };
    box.oninput = upd; upd();
    $('#vOk', box).onclick = () => {
      const v = vals(box), lineas = leer().filter((l) => prod(l.pid) && l.cant > 0);
      if (!lineas.length) return toast('Elegí al menos un producto y su cantidad');
      const res = registrarVenta({ fecha: v.fecha, lineas, descPct: Math.min(100, Math.max(0, numIn(v.desc))), medio: v.medio, nota: v.descripcion, fiado: v.fiado, fechaCobro: v.fechaCobro });
      closeModal(); commit();
      toast(v.fiado ? `Venta fiada ${res.nro} registrada. Cuando te pague, marcala como resuelta en el calendario.` : `Venta ${res.nro} registrada: ${fmtMoney(res.total)} ✔`);
    };
  });
}
// Ver un ticket ya cargado, imprimirlo o anularlo (anular devuelve el stock)
const ticketMovs = (ticketId) => state.movimientos.filter((m) => m.ticketId === ticketId);
function ticketVer(ticketId) {
  const l = ticketMovs(ticketId); if (!l.length) return toast('Ese ticket ya no existe');
  const c = l[0], tot = r2(l.reduce((s, m) => s + m.monto, 0)), cos = l.reduce((s, m) => s + (m.cantidad || 0) * (m.costoUnit || 0), 0);
  openModal(`<div class="spread"><h3 style="margin:0">🧾 Venta ${esc(c.ticket)}</h3><button class="sm" data-act="close">✕</button></div>
  <p class="small muted">${fmtDate(c.fecha)} · ${esc(c.medio || '')}${multiLocal() ? ' · ' + esc(localInfo(localDe(c)).nombre) : ''}${c.descripcion ? ' · ' + esc(c.descripcion) : ''}</p>
  <div class="tablewrap"><table class="small"><thead><tr><th>Producto</th><th class="num">Cant.</th><th class="num">Precio</th><th class="num">Subtotal</th></tr></thead><tbody>
  ${l.map((m) => `<tr><td>${esc(m.nombreProd || (prod(m.productoId) || {}).nombre || '')}${m.descPct ? ` <span class="small muted">(−${fmtNum(m.descPct)}%)</span>` : ''}</td><td class="num">${fmtNum(m.cantidad)}</td><td class="num">${fmtMoney(m.precioUnit)}</td><td class="num">${fmtMoney(m.monto)}</td></tr>`).join('')}
  <tr><td colspan="3"><b>Total</b></td><td class="num"><b>${fmtMoney(tot)}</b></td></tr></tbody></table></div>
  <p class="small muted">Costo de lo vendido ${fmtMoney(cos)} · Ganancia <b class="${tot - cos >= 0 ? 'c-in' : 'c-out'}">${fmtMoney(tot - cos)}</b> (con los precios y costos del día de la venta)</p>
  <div class="modal-actions"><button class="danger" id="tkAnular">↩️ Anular venta</button><button id="tkPrint">🖨 Imprimir</button><button class="pri" data-act="close">Listo</button></div>`, (box) => {
    $('#tkPrint', box).onclick = () => ticketImprimir(ticketId);
    $('#tkAnular', box).onclick = () => confirmBox(`Se anula la venta <b>${esc(c.ticket)}</b> por ${fmtMoney(tot)}: se borra el cobro y <b>la mercadería vuelve al stock</b>.`, () => {
      l.forEach((m) => { const p = prod(m.productoId); if (!p) return; if (esElaborado(p)) descontarReceta(p, -m.cantidad, todayStr(), `Anulación de ${p.nombre}`, 0, c.ticket); else stockMov(p, m.cantidad, 'entrada', 'Venta anulada', todayStr(), c.ticket); });
      state.movimientos = state.movimientos.filter((m) => m.ticketId !== ticketId);
      audit('Venta anulada', c.ticket, fmtMoney(tot), 'anulada', l.map((m) => `${fmtNum(m.cantidad)} × ${m.nombreProd}`).join(', '));
      commit(); toast('Venta anulada y stock devuelto');
    }, 'Anular venta');
  });
}
function ticketImprimir(ticketId) {
  const l = ticketMovs(ticketId); if (!l.length) return;
  const c = l[0], tot = r2(l.reduce((s, m) => s + m.monto, 0));
  let el = $('#catPrintArea'); if (!el) { el = document.createElement('div'); el.id = 'catPrintArea'; document.body.appendChild(el); }
  el.innerHTML = `<h1>${esc(state.config.negocio || '')}</h1><h2>Venta ${esc(c.ticket)}</h2><p>${fmtDate(c.fecha)}${multiLocal() ? ' · ' + esc(localInfo(localDe(c)).nombre) : ''}${c.medio ? ' · ' + esc(c.medio) : ''}</p>
  <table><thead><tr><th>Producto</th><th class="num">Cant.</th><th class="num">Precio</th><th class="num">Subtotal</th></tr></thead><tbody>
  ${l.map((m) => `<tr><td>${esc(m.nombreProd || '')}</td><td class="num">${fmtNum(m.cantidad)}</td><td class="num">${fmtMoney(m.precioUnit)}</td><td class="num">${fmtMoney(m.monto)}</td></tr>`).join('')}
  <tr><td colspan="3"><b>TOTAL</b></td><td class="num"><b>${fmtMoney(tot)}</b></td></tr></tbody></table>${c.descPct ? `<p class="small">Descuento aplicado: ${fmtNum(c.descPct)}%</p>` : ''}<p class="small">Documento interno, no válido como factura.</p>`;
  document.body.classList.add('cat-print');
  setTimeout(() => { window.print(); document.body.classList.remove('cat-print'); }, 50);
}

// Para el cierre de caja: lo que se cargó ese día en la app, separado por forma de pago
function cajaTickets(fecha, lid) {
  const l = state.movimientos.filter((m) => m.ticketId && m.fecha === fecha && localDe(m) === lid); if (!l.length) return '';
  const por = {}; l.forEach((m) => (por[m.medio || 'Efectivo'] = r2((por[m.medio || 'Efectivo'] || 0) + m.monto)));
  return `🧾 Ventas cargadas en la app ese día: <b>${fmtMoney(l.reduce((s, m) => s + m.monto, 0))}</b> en ${new Set(l.map((m) => m.ticketId)).size} ticket(s) · ${Object.entries(por).map(([k, v]) => `${esc(k)} ${fmtMoney(v)}`).join(' · ')}`;
}

// ================= Compra con varios productos =================
function registrarCompra({ fecha, proveedorId = '', lineas, factura = '', pago = 'pagado', fechaPago = '', actCosto = true, nota = '', total = 0 }) {
  fecha = fecha || todayStr();
  const nro = nroComp('C'), pv = prov(proveedorId), items = [];
  lineas.forEach((l) => {
    const p = prod(l.pid); if (!p || !(l.cant > 0)) return;
    const costo = Number(l.costo) || 0;
    stockMov(p, l.cant, 'entrada', [pv && pv.nombre, factura && 'Fact. ' + factura].filter(Boolean).join(' · ') || 'Compra', fecha, nro);
    if (actCosto && costo > 0) { if (r2(costo) !== r2(p.costo)) audit('Costo', p.nombre, fmtMoney(p.costo || 0), fmtMoney(costo), `Compra ${nro}`); p.costo = costo; }
    if (proveedorId && !p.proveedorId) p.proveedorId = proveedorId;
    items.push({ productoId: p.id, nombre: p.nombre, cantidad: l.cant, costoUnit: costo || p.costo || 0, unidad: p.unidad || '' });
  });
  if (!items.length) return null;
  total = r2(total || items.reduce((s, i) => s + i.cantidad * i.costoUnit, 0));
  const detalle = items.map((i) => `${fmtNum(i.cantidad)} ${i.unidad} ${i.nombre}`.replace(/\s+/g, ' ')).join(', ');
  const uno = items.length === 1 ? { productoId: items[0].productoId, cantidad: items[0].cantidad } : {};
  const loc = localDe(prod(items[0].productoId));
  if (total > 0 && pago === 'debo') state.eventos.push({ id: uid(), tipo: 'pagar', titulo: `Pagar compra ${nro}${factura ? ` (fact. ${factura})` : ''}`, persona: pv ? pv.nombre : '', proveedorId, monto: total, fecha: fechaPago || addMonths(fecha, 1), notas: nota || detalle, hecho: false, compraNro: nro, mov: { tipo: 'inversion', categoria: 'Mercadería', proveedorId, ...uno } });
  else if (total > 0 && pago === 'pagado') state.movimientos.push({ id: uid(), creado: new Date().toISOString(), fecha, tipo: 'inversion', categoria: 'Mercadería', descripcion: nota || (items.length > 1 ? detalle : ''), monto: total, proveedorId, compra: true, compraNro: nro, factura, items, ...uno, local: loc });
  return { nro, total, detalle, items };
}
const filaCompra = (pid = '') => `<div class="vt-fila"><select class="vp">${prodOptions(pid)}</select><input class="vc" inputmode="decimal" placeholder="Cant." aria-label="Cantidad"><input class="vpr" inputmode="decimal" placeholder="Costo c/u" aria-label="Costo unitario"><span class="vs"></span><button type="button" class="sm" data-rm="1" title="Quitar">✕</button></div>`;
function compraForm(prodId, provId) {
  if (!prods().length) return alertBox(typeof verTodos === 'function' && verTodos() ? 'Elegí un local arriba para registrar ventas o compras.' : 'Primero cargá al menos un producto en este local.');
  const p0 = prod(prodId);
  openModal(`<h3>📥 Entrada de mercadería</h3>
  <div class="form">
    <label class="f">Proveedor<select name="proveedorId" id="cProv">${provOptions(p0 ? p0.proveedorId : provId || '')}</select></label>
    <label class="f">N° de factura o albarán (opcional)<input name="factura"></label>
  </div>
  <div class="vt-cab small muted mt"><span>Producto</span><span>Cant.</span><span>Costo c/u</span><span>Subtotal</span><span></span></div>
  <div id="vFilas">${filaCompra(prodId)}</div>
  <div class="spread"><button type="button" class="sm" id="vAdd">+ Agregar otro producto</button><b>Total: <span id="vTot"></span></b></div>
  <div class="form mt">
    <label class="f">Fecha<input type="date" name="fecha" value="${todayStr()}"></label>
    <label class="f">Pago<select name="pago" id="cPago"><option value="pagado">Ya está pagado (inversión en el balance)</option><option value="debo">Lo pago más adelante (aviso "a pagar")</option><option value="no">No anotar el pago</option></select></label>
    <label class="f full" id="cDeboBox" style="display:none">Vence / fecha de pago<input type="date" name="fechaPago" value="${addMonths(todayStr(), 1)}"></label>
    <label class="f full" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="actCosto" checked style="width:auto"> <span>Actualizar el precio de costo de los productos</span></label>
    <label class="f full">Nota (opcional)<input name="descripcion"></label>
  </div><div class="modal-actions"><button data-act="close">Cancelar</button><button class="pri" id="cOk">Registrar entrada</button></div>`, (box) => {
    box.classList.add('modal-ancho');
    const leer = () => $$('.vt-fila', box).map((r) => ({ r, pid: $('.vp', r).value, cant: numIn($('.vc', r).value), costo: numIn($('.vpr', r).value) }));
    const upd = () => { let tot = 0; leer().forEach((l) => { const sub = r2(l.cant * l.costo); $('.vs', l.r).textContent = prod(l.pid) && sub ? fmtMoney(sub) : ''; if (prod(l.pid)) tot += sub; }); $('#vTot', box).textContent = fmtMoney(tot); };
    const ponerCosto = (r) => { const p = prod($('.vp', r).value); $('.vpr', r).value = p ? p.costo || '' : ''; if (p && p.proveedorId && !$('#cProv', box).value) $('#cProv', box).value = p.proveedorId; };
    $$('.vt-fila', box).forEach(ponerCosto);
    $('#vAdd', box).onclick = () => { $('#vFilas', box).insertAdjacentHTML('beforeend', filaCompra()); };
    box.onclick = (e) => { if (e.target.dataset.rm && e.target.closest('.vt-fila')) { if ($$('.vt-fila', box).length > 1) e.target.closest('.vt-fila').remove(); upd(); } };
    box.onchange = (e) => { if (e.target.classList.contains('vp')) ponerCosto(e.target.closest('.vt-fila')); if (e.target.id === 'cPago') $('#cDeboBox', box).style.display = e.target.value === 'debo' ? 'flex' : 'none'; upd(); };
    box.oninput = upd; upd();
    $('#cOk', box).onclick = () => {
      const v = vals(box), lineas = leer().filter((l) => prod(l.pid) && l.cant > 0);
      if (!lineas.length) return toast('Elegí al menos un producto y su cantidad');
      const res = registrarCompra({ fecha: v.fecha, proveedorId: v.proveedorId, lineas, factura: v.factura, pago: v.pago, fechaPago: v.fechaPago, actCosto: v.actCosto, nota: v.descripcion });
      closeModal(); commit(); toast(`Entrada ${res.nro} registrada ✔`);
    };
  });
}

// ================= Cuenta del proveedor =================
const deudasProv = (p) => state.eventos.filter((e) => !e.hecho && e.tipo === 'pagar' && (e.proveedorId === p.id || e.persona === p.nombre || (e.mov && e.mov.proveedorId === p.id))).sort((a, b) => a.fecha.localeCompare(b.fecha));
const deudaProv = (p) => r2(deudasProv(p).reduce((s, e) => s + (e.monto || 0), 0));
function cuentaProvHTML(p) {
  const l = deudasProv(p), hoy = todayStr();
  if (!l.length) return '<p class="small c-in">No le debés nada. 👌</p>';
  return `<div class="cta-lista">${l.map((e) => `<div class="cta-fila"><div><b>${esc(e.titulo)}</b><div class="small ${e.fecha < hoy ? 'c-out' : 'muted'}">${e.fecha < hoy ? '⚠️ Venció el ' : 'Vence el '}${fmtDate(e.fecha)}${e.notas ? ' · ' + esc(e.notas) : ''}</div></div><div class="row"><b>${fmtMoney(e.monto)}</b><button class="sm" data-act="evDone" data-id="${e.id}">✔ Pagar</button></div></div>`).join('')}</div>`;
}

Object.assign(ACTS, {
  ticketVer: (id) => ticketVer(id),
  ticketPrint: (id) => ticketImprimir(id),
  kardexVer: (id) => kardexVer(id),
});
