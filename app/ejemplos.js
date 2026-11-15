'use strict';
/* Datos de ejemplo: muestran para qué sirve cada sección. Todos llevan "(ejemplo)" en el nombre
   y la marca ejemplo:true, se pueden editar o borrar uno por uno, o todos juntos sin tocar lo real. */

const EJ = ' (ejemplo)';
const hayEjemplos = () => ['productos', 'proveedores', 'movimientos', 'eventos', 'personal', 'caterings', 'cierres'].some((c) => (state[c] || []).some((x) => x.ejemplo)) || menus().some((m) => m.ejemplo);

function cargarEjemplos() {
  if (hayEjemplos()) return toast('Los ejemplos ya están cargados');
  const hoy = todayStr(), lid = verTodos() ? locales()[0].id : localActivo(), loc = lid;
  const d = (k) => addDays(hoy, k), id = () => uid(), E = { ejemplo: true };
  // proveedores
  const pv1 = { id: id(), nombre: 'Cafés del Atlántico' + EJ, rubro: 'Café en grano', contacto: 'Laura', telefono: '+34 600 000 001', email: '', direccion: '', cuit: '', notas: 'Reparte martes y viernes.', ...E };
  const pv2 = { id: id(), nombre: 'Lácteos del Norte' + EJ, rubro: 'Leche y lácteos', contacto: 'Jorge', telefono: '+34 600 000 002', email: '', direccion: '', cuit: '', notas: '', ...E };
  state.proveedores.push(pv1, pv2);
  // productos: ingredientes, elaborados con receta y reventa
  const P = (o) => ({ id: id(), creado: new Date().toISOString(), codigo: '', campos: [], notas: '', foto: '', local: loc, stockMin: 0, precio: 0, ...o, ...E });
  // Productos al estilo di Nardi (pastelería y cafetería). Precios y costos estimados: el tío los corrige.
  const I = (nombre, unidad, costo, stock, stockMin, o = {}) => P({ nombre: nombre + EJ, categoria: 'Ingredientes', unidad, costo, stock, stockMin, ...o });
  const cafe = I('Café en grano', 'kg', 18, 6, 3, { proveedorId: pv1.id });
  const leche = I('Leche entera', 'litros', 0.95, 20, 12, { proveedorId: pv2.id, alergenos: ['lacteos'] });
  const harina = I('Harina de trigo', 'kg', 0.9, 25, 10, { alergenos: ['gluten'] });
  const manteca = I('Mantequilla', 'kg', 7.5, 4, 2, { proveedorId: pv2.id, alergenos: ['lacteos'] });
  const huevos = I('Huevos', 'unidades', 0.25, 90, 30, { alergenos: ['huevo'] });
  const azucar = I('Azúcar', 'kg', 1.1, 15, 5);
  const choco = I('Chocolate de cobertura', 'kg', 9, 3, 1, { alergenos: ['lacteos', 'soja'] });
  const fresas = I('Fresas', 'kg', 4.5, 2, 1);
  const mascarpone = I('Mascarpone', 'kg', 8, 2, 1, { proveedorId: pv2.id, alergenos: ['lacteos'] });
  const pan = I('Baguette', 'unidades', 0.6, 30, 10, { alergenos: ['gluten'] });
  const pollo = I('Pollo asado desmenuzado', 'kg', 7, 3, 1);
  const aguacate = I('Aguacate', 'unidades', 0.8, 12, 6);
  const NE = 'Precio estimado: corregir con la carta real.';
  const R = (nombre, categoria, precio, rinde, items) => P({ nombre: nombre + EJ, categoria, unidad: 'unidades', precio, stock: 0, notas: NE, receta: { rinde, items: items.map(([p, cant]) => ({ pid: p.id, cant })) } });
  const cl = R('Café con leche', 'Cafetería', 1.6, 1, [[cafe, 0.018], [leche, 0.15]]);
  const cortado = R('Cortado', 'Cafetería', 1.4, 1, [[cafe, 0.018], [leche, 0.05]]);
  const croissant = R('Croissant de mantequilla', 'Pastelería', 1.8, 12, [[harina, 0.5], [manteca, 0.3], [huevos, 1], [azucar, 0.06]]);
  const tiramisu = R('Tiramisú (porción)', 'Pastelería', 4.5, 10, [[mascarpone, 0.5], [huevos, 4], [azucar, 0.15], [cafe, 0.03], [harina, 0.15]]);
  const eclair = R('Éclair de chocolate', 'Pastelería', 3.2, 12, [[harina, 0.15], [manteca, 0.1], [huevos, 4], [choco, 0.2], [leche, 0.5]]);
  const tarta = R('Tarta de fresas (porción)', 'Pastelería', 4.2, 8, [[harina, 0.25], [manteca, 0.12], [huevos, 2], [azucar, 0.15], [fresas, 0.5], [leche, 0.3]]);
  const tost = R('Baguette de pollo y aguacate', 'Salado', 6.5, 1, [[pan, 1], [pollo, 0.08], [aguacate, 0.5]]);
  // Más productos que se nombran en reseñas de di Nardi (Tripadvisor, Gastroranking, Too Good To Go); sin receta, costo y precio estimados
  const V = (nombre, categoria, costo, precio) => P({ nombre: nombre + EJ, categoria, unidad: 'unidades', costo, precio, stock: 0, notas: NE });
  const panIberico = V('Pan de aceitunas con ibérico, tomate y aceite', 'Salado', 1.9, 5.5);
  const miniSand = V('Mini sándwich gourmet', 'Salado', 0.55, 1.6);
  const flauta = V('Flauta de viento', 'Pastelería', 0.35, 1.3);
  const trucha = V('Trucha de batata (canaria)', 'Pastelería', 0.4, 1.5);
  const manzana = V('Pastel de manzana (porción)', 'Pastelería', 0.6, 3.5);
  const miniPast = V('Mini pastelito surtido', 'Pastelería', 0.25, 0.9);
  const fruta = V('Brocheta de fruta fresca', 'Catering', 0.5, 1.8);
  const ensalada = V('Ensalada fresca (ración)', 'Catering', 1.2, 4.5);
  const zumo = V('Zumo de naranja natural', 'Bebidas', 0.9, 3);
  const agua = P({ nombre: 'Agua 500 ml' + EJ, categoria: 'Bebidas', unidad: 'unidades', costo: 0.3, precio: 1.5, stock: 10, stockMin: 12 });
  const elab = [cl, cortado, croissant, tiramisu, eclair, tarta, tost];
  const sinReceta = [panIberico, miniSand, flauta, trucha, manzana, miniPast, fruta, ensalada, zumo];
  elab.forEach((p) => (p.costo = costoReceta(p.receta)));
  state.productos.push(cafe, leche, harina, manteca, huevos, azucar, choco, fresas, mascarpone, pan, pollo, aguacate, ...elab, ...sinReceta, agua);
  // movimientos de plata
  const M = (o) => ({ id: id(), creado: new Date().toISOString(), local: loc, ...o, ...E });
  state.movimientos.push(
    M({ fecha: d(-6), tipo: 'inversion', categoria: 'Mercadería', descripcion: '6 kg de café' + EJ, monto: 108, proveedorId: pv1.id, productoId: cafe.id, cantidad: 6, compra: true }),
    M({ fecha: d(-4), tipo: 'gasto', categoria: 'Servicios', descripcion: 'Luz del local' + EJ, monto: 180 }),
  );
  // avisos de deudas
  state.eventos.push(
    { id: id(), tipo: 'pagar', titulo: 'Factura de leche' + EJ, persona: pv2.nombre, monto: 86, fecha: d(5), notas: 'Ejemplo de deuda a pagar: avisa antes de que venza.', hecho: false, ...E },
    { id: id(), tipo: 'cobrar', titulo: 'Saldo catering Empresa López' + EJ, persona: 'Empresa López', monto: 155, fecha: d(9), notas: '', hecho: false, ...E },
  );
  // personal y turnos de esta semana
  const s1 = { id: id(), nombre: 'Sofía' + EJ, rol: 'Barista', color: '#8e24aa', metaSemanal: 30, activo: true, orden: 90, ...E };
  const s2 = { id: id(), nombre: 'Mateo' + EJ, rol: 'Cocina', color: '#00897b', metaSemanal: 20, activo: true, orden: 91, ...E };
  state.personal.push(s1, s2);
  semana(hoy).slice(0, 5).forEach((f, i) => {
    if (diaDoc(f, lid)) return; // no se mezcla con días que ya tienen turnos reales
    agregarTurno(f, s1.id, 8 * 60, (i === 4 ? 12 : 14) * 60, lid);
    if (i % 2 === 0) agregarTurno(f, s2.id, 12 * 60, 16 * 60, lid);
    const dd = diaDoc(f, lid); if (dd) dd.ejemplo = true;
  });
  // menús y caterings
  // Los 4 servicios que ofrece pasteleriadinardi.com/catering. Precios por persona estimados (la web no publica precios).
  const MN = (nombre, descripcion, precioPersona, items) => ({ id: id(), nombre: nombre + EJ, descripcion, precioPersona, items: items.map(([p, cant]) => ({ pid: p.id, cant })), notas: NE, ...E });
  const mn1 = MN('Coffee break', 'Café recién hecho, agua, bollería artesanal y mini pastelitos', 7.5, [[cl, 1], [agua, 1], [croissant, 1], [miniPast, 2]]);
  const mn2 = MN('Desayuno de trabajo', 'Café con leche, baguette de pollo y aguacate y zumo natural', 11, [[cl, 1], [tost, 1], [zumo, 1]]);
  const mn3 = MN('Merienda artesanal', 'Café, tiramisú, tarta de fresas y flautas de viento', 9, [[cortado, 1], [tiramisu, 1], [tarta, 1], [flauta, 1]]);
  const mn4 = MN('Almuerzo', 'Buffet fresco: mini sándwiches gourmet, pan de aceitunas con ibérico, ensalada, fruta y agua', 16, [[miniSand, 3], [panIberico, 1], [ensalada, 1], [fruta, 1], [agua, 1]]);
  state.config.menus = [...menus(), mn1, mn2, mn3, mn4];
  state.caterings = state.caterings || [];
  state.caterings.push(
    { id: id(), creado: new Date().toISOString(), fecha: d(4), hora: '10:00', cliente: 'Empresa López' + EJ, contacto: '+34 600 000 003', lugar: 'Oficinas, calle Mayor 10', tipo: 'Coffee break', personas: 30, estado: 'confirmado', items: [{ d: mn1.nombre + ': ' + mn1.descripcion, c: 30, p: 7.5, menuId: mn1.id }], cobros: [{ fecha: d(-2), monto: 70, medio: 'Transferencia', nota: 'seña' }], gastos: [{ concepto: 'Alquiler de termos', monto: 25, fecha: d(-1) }], equipo: [{ pid: s2.id, desde: 9 * 60, hasta: 12 * 60 }], factura: { numero: '', fecha: '' }, armado: '09:15', dietas: '2 sin gluten, 1 sin lactosa', material: [{ d: 'Termos de café', cant: 3, ida: false, vuelta: false }, { d: 'Vasos y tazas', cant: 35, ida: false, vuelta: false }, { d: 'Bandejas', cant: 4, ida: false, vuelta: false }], notas: 'Entrar por la puerta de atrás; preguntar por Carla.', ...E },
    { id: id(), creado: new Date().toISOString(), fecha: d(12), hora: '09:00', cliente: 'Cumple de Marta' + EJ, contacto: '', lugar: '', tipo: 'Desayuno', personas: 15, estado: 'presupuesto', items: [{ d: mn2.nombre + ': ' + mn2.descripcion, c: 15, p: 11, menuId: mn2.id }], cobros: [], gastos: [], equipo: [], factura: { numero: '', fecha: '' }, notas: '', ...E },
  );
  // cierres de caja: uno que cuadra y uno con faltante
  state.cierres = state.cierres || [];
  [[-2, 588, 290, 40, 8, 350], [-1, 642.5, 310, 45, 12, 370.5]].forEach(([k, ventas, tarjeta, bizum, gastosEf, contado]) => {
    const mv = M({ fecha: d(k), tipo: 'ingreso', categoria: 'Venta', descripcion: 'Ventas del día (cierre de caja)' + EJ, monto: ventas });
    state.movimientos.push(mv);
    state.cierres.push({ id: id(), creado: new Date().toISOString(), local: loc, fecha: d(k), quien: s1.id, fondo: 100, fondoSig: 100, ventas, tarjeta, bizum, otros: 0, gastosEf, contado, nota: k === -1 ? 'Faltan 5 € (ejemplo de diferencia)' : '', registrar: true, movId: mv.id, ...E });
  });
  state.config.ejemplosVisto = true;
  commit(); toast('Ejemplos cargados: buscá los que dicen "(ejemplo)" en cada sección');
}

function borrarEjemplos() {
  const pidsEj = new Set(state.personal.filter((p) => p.ejemplo).map((p) => p.id)), prodEj = new Set(state.productos.filter((p) => p.ejemplo).map((p) => p.id));
  ['productos', 'proveedores', 'movimientos', 'eventos', 'personal', 'caterings', 'cierres'].forEach((c) => (state[c] = (state[c] || []).filter((x) => !x.ejemplo)));
  state.stockMovs = state.stockMovs.filter((m) => !prodEj.has(m.productoId));
  state.config.menus = menus().filter((m) => !m.ejemplo);
  // en los turnos se sacan solo las horas de las personas de ejemplo
  state.turnos.forEach((t) => { if (!pidsEj.size) return; ensureSlots(t); for (const k of Object.keys(t.slots)) if (pidsEj.has(t.slots[k])) delete t.slots[k]; derivar(t); });
  limpiarVacios();
  commit(); toast('Ejemplos borrados. Lo que cargaste vos quedó igual ✔');
}

// ================= Datos del local real (pasteleriadinardi.com) =================
const DINARDI = [
  { nombre: 'di Nardi >< di Work', color: '#4d2d18', dir: 'León y Castillo 8', tel: '+34 928 98 56 70' },
  { nombre: 'di Nardi Marítima', color: '#b87332', dir: 'Av. José Ramírez Bethancourt 18', tel: '+34 928 24 14 21' },
  { nombre: 'di Nardi Venegas', color: '#506345', dir: 'Venegas 12', tel: '+34 928 43 54 73' },
];
const esDiNardi = () => /nardi/i.test(state.config.negocio || '');
// Los locales que ya existen se renombran en orden (1º, 2º, 3º) y conservan su id, así sus turnos,
// stock y plata siguen igual. Si hay menos de 3 se agregan los que faltan; si hay más, los demás no se tocan.
function aplicarDiNardi(silencio) {
  state.config.negocio = 'di Nardi'; state.config.moneda = '€'; state.config.dnAuto = true;
  if (!state.config.saludo) state.config.saludo = 'Paulo Nardi';
  const lista = locales().map((x) => ({ ...x }));
  DINARDI.forEach((d, i) => {
    if (lista[i]) Object.assign(lista[i], { nombre: d.nombre, color: d.color, dir: d.dir, tel: d.tel });
    else lista.push({ id: uid(), nombre: d.nombre, color: d.color, dir: d.dir, tel: d.tel });
  });
  state.config.locales = lista;
  commit(); toast(silencio ? 'Los locales ahora tienen los nombres de di Nardi ✔' : 'Listo: di Nardi con sus 3 locales ✔');
}
function autoDiNardi() {
  if (!state.config.dnAuto) return aplicarDiNardi(true); // una sola vez por cuenta
  if (!state.config.dnColores) { // 1.8.3: colores de la web para los locales que tenían los de la 1.8.2
    const viejos = { '#7a4a2e': '#4d2d18', '#1e88e5': '#b87332', '#2e7d32': '#506345' };
    state.config.locales = locales().map((l) => (/nardi/i.test(l.nombre) && viejos[l.color] ? { ...l, color: viejos[l.color] } : l));
    state.config.dnColores = true; commit();
  }
}
const preguntarDiNardi = () => confirmBox(`Se pone el nombre <b>di Nardi</b>, la moneda en <b>€</b> y los 3 locales de la web: ${DINARDI.map((d) => `<b>${esc(d.nombre)}</b> (${esc(d.dir)})`).join(', ')}.<br><br>Los locales que ya existen cambian de nombre en orden y conservan sus turnos, stock y plata. No se borra nada.`, aplicarDiNardi, 'Usar datos de di Nardi');

function bannerEjemplos() {
  if (hayEjemplos()) return `<div class="card banner-ej"><div><b>📚 Estás viendo datos de ejemplo.</b> Son los que dicen <i>(ejemplo)</i> en Productos, Movimientos, Turnos, Catering, Cierre de caja y Calendario. Se pueden abrir, editar o borrar como cualquier otro.</div><button class="sm" data-act="ejBorrar">🧹 Borrar todos los ejemplos</button></div>`;
  const dn = esDiNardi() ? '' : `<div class="card banner-ej"><div><b>☕ ¿Es para di Nardi?</b> Con un toque se pone el nombre, el euro y los 3 locales (di Work, Marítima y Venegas).</div><button class="pri sm" data-act="dnUsar">Usar datos de di Nardi</button></div>`;
  if (state.config.ejemplosVisto) return dn;
  return dn + `<div class="card banner-ej"><div><b>👋 ¿Primera vez?</b> Cargá unos datos de ejemplo para ver cómo funciona cada sección. No tocan lo que ya está cargado y después se borran todos juntos con un botón.</div><div class="row"><button class="pri sm" data-act="ejCargar">📚 Cargar ejemplos</button><button class="sm" data-act="ejNo">No, gracias</button></div></div>`;
}
function ajustesEjemplos() {
  return `<h2>di Nardi</h2><div class="card"><p style="margin-top:0">${esDiNardi() ? 'La app ya está con los datos de di Nardi.' : 'Pone el nombre di Nardi, el euro y los 3 locales de la web.'} Locales: ${DINARDI.map((d) => `<b>${esc(d.nombre)}</b> · ${esc(d.dir)} · ${esc(d.tel)}`).join('<br>')}</p>
  <div class="row"><button ${esDiNardi() ? '' : 'class="pri" '}data-act="dnUsar">${esDiNardi() ? 'Volver a poner los locales de di Nardi' : '☕ Usar datos de di Nardi'}</button></div></div>
  <h2>Datos de ejemplo</h2><div class="card"><p style="margin-top:0">Ejemplos de productos con receta, menús de catering, turnos, cierres de caja y deudas para ver cómo funciona todo. Llevan <i>(ejemplo)</i> en el nombre y se pueden borrar todos juntos sin tocar lo real.</p>
  <div class="row">${hayEjemplos() ? '<button data-act="ejRenovar">🔄 Cambiar por los ejemplos nuevos</button><button data-act="ejBorrar">🧹 Borrar todos los ejemplos</button>' : '<button class="pri" data-act="ejCargar">📚 Cargar ejemplos</button>'}</div></div>`;
}

Object.assign(ACTS, {
  ejCargar: () => cargarEjemplos(),
  ejBorrar: () => confirmBox('Se van a borrar todos los datos que dicen <b>(ejemplo)</b>. Lo que cargaste vos no se toca.', borrarEjemplos, 'Borrar ejemplos'),
  dnUsar: () => preguntarDiNardi(),
  ejRenovar: () => confirmBox('Se borran los ejemplos que hay y se cargan los nuevos (productos y menús de catering de di Nardi). Lo que cargaste vos no se toca.', () => { borrarEjemplos(); cargarEjemplos(); }, 'Cambiar ejemplos'),
  ejNo: () => { state.config.ejemplosVisto = true; commit(); },
});
