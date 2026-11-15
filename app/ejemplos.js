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
  const cafe = P({ nombre: 'Café en grano' + EJ, categoria: 'Ingredientes', unidad: 'kg', costo: 18, stock: 6, stockMin: 3, proveedorId: pv1.id });
  const leche = P({ nombre: 'Leche entera' + EJ, categoria: 'Ingredientes', unidad: 'litros', costo: 0.95, stock: 20, stockMin: 12, proveedorId: pv2.id, alergenos: ['lacteos'] });
  const pan = P({ nombre: 'Pan para tostar' + EJ, categoria: 'Ingredientes', unidad: 'rebanadas', costo: 0.22, stock: 60, stockMin: 20, alergenos: ['gluten', 'sesamo'] });
  const tomate = P({ nombre: 'Tomate triturado' + EJ, categoria: 'Ingredientes', unidad: 'kg', costo: 2.4, stock: 3, stockMin: 1 });
  const aceite = P({ nombre: 'Aceite de oliva' + EJ, categoria: 'Ingredientes', unidad: 'litros', costo: 8, stock: 4, stockMin: 1 });
  const cl = P({ nombre: 'Café con leche' + EJ, categoria: 'Cafetería', unidad: 'unidades', precio: 1.6, stock: 0, receta: { rinde: 1, items: [{ pid: cafe.id, cant: 0.018 }, { pid: leche.id, cant: 0.15 }] } });
  const tost = P({ nombre: 'Tostada con tomate' + EJ, categoria: 'Desayunos', unidad: 'unidades', precio: 2.8, stock: 0, receta: { rinde: 1, items: [{ pid: pan.id, cant: 2 }, { pid: tomate.id, cant: 0.05 }, { pid: aceite.id, cant: 0.01 }] } });
  const agua = P({ nombre: 'Agua 500 ml' + EJ, categoria: 'Bebidas', unidad: 'unidades', costo: 0.3, precio: 1.5, stock: 10, stockMin: 12 });
  cl.costo = costoReceta(cl.receta); tost.costo = costoReceta(tost.receta);
  state.productos.push(cafe, leche, pan, tomate, aceite, cl, tost, agua);
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
  const mn1 = { id: id(), nombre: 'Coffee break' + EJ, descripcion: 'Café con leche, agua y bollería surtida', precioPersona: 7.5, items: [{ pid: cl.id, cant: 1 }, { pid: agua.id, cant: 1 }, { pid: '', d: 'Bollería surtida', cant: 2, costo: 0.6 }], ...E };
  const mn2 = { id: id(), nombre: 'Desayuno de trabajo' + EJ, descripcion: 'Café con leche, tostada con tomate y zumo natural', precioPersona: 9.5, items: [{ pid: cl.id, cant: 1 }, { pid: tost.id, cant: 1 }, { pid: '', d: 'Zumo de naranja natural', cant: 1, costo: 0.9 }], ...E };
  state.config.menus = [...menus(), mn1, mn2];
  state.caterings = state.caterings || [];
  state.caterings.push(
    { id: id(), creado: new Date().toISOString(), fecha: d(4), hora: '10:00', cliente: 'Empresa López' + EJ, contacto: '+34 600 000 003', lugar: 'Oficinas, calle Mayor 10', tipo: 'Coffee break', personas: 30, estado: 'confirmado', items: [{ d: mn1.nombre + ': ' + mn1.descripcion, c: 30, p: 7.5, menuId: mn1.id }], cobros: [{ fecha: d(-2), monto: 70, medio: 'Transferencia', nota: 'seña' }], gastos: [{ concepto: 'Alquiler de termos', monto: 25, fecha: d(-1) }], equipo: [{ pid: s2.id, desde: 9 * 60, hasta: 12 * 60 }], factura: { numero: '', fecha: '' }, armado: '09:15', dietas: '2 sin gluten, 1 sin lactosa', material: [{ d: 'Termos de café', cant: 3, ida: false, vuelta: false }, { d: 'Vasos y tazas', cant: 35, ida: false, vuelta: false }, { d: 'Bandejas', cant: 4, ida: false, vuelta: false }], notas: 'Entrar por la puerta de atrás; preguntar por Carla.', ...E },
    { id: id(), creado: new Date().toISOString(), fecha: d(12), hora: '09:00', cliente: 'Cumple de Marta' + EJ, contacto: '', lugar: '', tipo: 'Desayuno', personas: 15, estado: 'presupuesto', items: [{ d: mn2.nombre + ': ' + mn2.descripcion, c: 15, p: 9.5, menuId: mn2.id }], cobros: [], gastos: [], equipo: [], factura: { numero: '', fecha: '' }, notas: '', ...E },
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

function bannerEjemplos() {
  if (hayEjemplos()) return `<div class="card banner-ej"><div><b>📚 Estás viendo datos de ejemplo.</b> Son los que dicen <i>(ejemplo)</i> en Productos, Movimientos, Turnos, Catering, Cierre de caja y Calendario. Se pueden abrir, editar o borrar como cualquier otro.</div><button class="sm" data-act="ejBorrar">🧹 Borrar todos los ejemplos</button></div>`;
  if (state.config.ejemplosVisto) return '';
  return `<div class="card banner-ej"><div><b>👋 ¿Primera vez?</b> Cargá unos datos de ejemplo para ver cómo funciona cada sección. No tocan lo que ya está cargado y después se borran todos juntos con un botón.</div><div class="row"><button class="pri sm" data-act="ejCargar">📚 Cargar ejemplos</button><button class="sm" data-act="ejNo">No, gracias</button></div></div>`;
}
function ajustesEjemplos() {
  return `<h2>Datos de ejemplo</h2><div class="card"><p style="margin-top:0">Ejemplos de productos con receta, menús de catering, turnos, cierres de caja y deudas para ver cómo funciona todo. Llevan <i>(ejemplo)</i> en el nombre y se pueden borrar todos juntos sin tocar lo real.</p>
  <div class="row">${hayEjemplos() ? '<button data-act="ejBorrar">🧹 Borrar todos los ejemplos</button>' : '<button class="pri" data-act="ejCargar">📚 Cargar ejemplos</button>'}</div></div>`;
}

Object.assign(ACTS, {
  ejCargar: () => cargarEjemplos(),
  ejBorrar: () => confirmBox('Se van a borrar todos los datos que dicen <b>(ejemplo)</b>. Lo que cargaste vos no se toca.', borrarEjemplos, 'Borrar ejemplos'),
  ejNo: () => { state.config.ejemplosVisto = true; commit(); },
});
