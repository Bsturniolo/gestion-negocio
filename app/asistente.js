'use strict';
/* Asistente: se pega o se escribe un mensaje (por ejemplo uno de WhatsApp) y la app entiende qué es
   y propone anotarlo donde corresponde: mercadería, ventas, gastos, deudas, catering o turnos.
   Funciona sin internet, con reglas. Siempre muestra lo que entendió antes de guardar, para corregirlo.
   Para sumar una IA más adelante alcanza con reemplazar asEntender(texto) por otra función que
   devuelva la misma lista de acciones. */

// ---------- Conversación (se guarda en este dispositivo) ----------
const AS = { msgs: [] }; // [{ id, txt, cuando, resp, acciones: [{ tipo, estado, ...campos }] }]
try { AS.msgs = JSON.parse(localStorage.getItem('asisChat') || '[]') || []; } catch { AS.msgs = []; }
const asGuardar = () => { try { localStorage.setItem('asisChat', JSON.stringify(AS.msgs.slice(-30))); } catch {} };
Object.assign(ui, { asTxt: '' });

// ---------- Texto ----------
const asN = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\(ejemplo\)/g, ' ').replace(/\s+/g, ' ').trim();
const AS_STOP = new Set(['del', 'las', 'los', 'con', 'para', 'por', 'una', 'uno', 'unos', 'unas', 'que', 'mas', 'muy', 'sin', 'hoy', 'nos', 'les', 'este', 'esta', 'ese', 'esa', 'son', 'hay']);
const asRaiz = (w) => (w.length > 4 ? w.replace(/(es|s)$/, '') : w);
const asToks = (s) => asN(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !AS_STOP.has(w)).map(asRaiz);
const asNum = (s) => { let t = String(s).trim(); if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, ''); return Number(t.replace(',', '.')) || 0; };
const asCap = (s) => { s = String(s || '').trim(); return s.charAt(0).toUpperCase() + s.slice(1); };
const MESES_N = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DSEM_N = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

// Fecha dentro de un texto ya normalizado. Devuelve 'AAAA-MM-DD' o ''.
function asFecha(t) {
  const hoy = parseD(todayStr()), mk = (y, m, d) => { const x = new Date(y, m, d); return x.getMonth() === ((m % 12) + 12) % 12 ? x : null; };
  const ajustaAnio = (d, m) => { let x = mk(hoy.getFullYear(), m, d); if (!x) return ''; const dif = (x - hoy) / 864e5; if (dif < -120) x = mk(hoy.getFullYear() + 1, m, d); else if (dif > 240) x = mk(hoy.getFullYear() - 1, m, d); return x ? ymd(x) : ''; };
  let m;
  if ((m = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/))) return m[0];
  if ((m = t.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/))) { const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]); const x = mk(y, m[2] - 1, Number(m[1])); if (x && m[2] <= 12) return ymd(x); }
  if ((m = t.match(/\b(\d{1,2})\/(\d{1,2})\b/)) && m[2] >= 1 && m[2] <= 12) { const f = ajustaAnio(Number(m[1]), m[2] - 1); if (f) return f; }
  if ((m = t.match(new RegExp(`\\b(\\d{1,2}) de (${MESES_N.join('|')}|setiembre)(?: de(?:l)? (\\d{4}))?`)))) {
    const mes = m[2] === 'setiembre' ? 8 : MESES_N.indexOf(m[2]);
    if (m[3]) { const x = mk(Number(m[3]), mes, Number(m[1])); if (x) return ymd(x); } else { const f = ajustaAnio(Number(m[1]), mes); if (f) return f; }
  }
  if (/\bpasado manana\b/.test(t)) return addDays(todayStr(), 2);
  if (/\bmanana\b/.test(t.replace(/\b(la|esta|por la|de la) manana\b/g, ''))) return addDays(todayStr(), 1);
  if (/\banteayer\b/.test(t)) return addDays(todayStr(), -2);
  if (/\bayer\b/.test(t)) return addDays(todayStr(), -1);
  if ((m = t.match(/\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo)(?: (\d{1,2})\b(?!\s*(?:[:.]\d|h\b|hs|hrs|personas|pax)))?/))) {
    if (m[2]) { const d = Number(m[2]); let x = mk(hoy.getFullYear(), hoy.getMonth(), d); if (!x || x < hoy) x = mk(hoy.getFullYear(), hoy.getMonth() + 1, d); if (x) return ymd(x); }
    const k = DSEM_N.indexOf(m[1]); return addDays(todayStr(), (k - hoy.getDay() + 7) % 7);
  }
  if (/\bhoy\b/.test(t)) return todayStr();
  if ((m = t.match(/\b(?:el|dia|para el|hasta el|antes del|vence el|vence)\s+(\d{1,2})\b(?!\s*(?:[:.,]\d|h\b|hs|hrs|personas|pax|kg|kilo|litro|l\b|unidad|€|eur|x\b))/))) {
    const d = Number(m[1]); if (d >= 1 && d <= 31) { let x = mk(hoy.getFullYear(), hoy.getMonth(), d); if (!x || x < hoy) x = mk(hoy.getFullYear(), hoy.getMonth() + 1, d); if (x) return ymd(x); }
  }
  if ((m = t.match(/\ben (\d{1,3}) dias\b|\ba (\d{1,3}) dias\b/))) return addDays(todayStr(), Number(m[1] || m[2]));
  return '';
}
// Una hora suelta ("a las 10", "10:30", "10h") → minutos, o -1
function asHora(t) {
  const m = t.match(/\ba las (\d{1,2})(?:[:.](\d{2}))?\b|\b(\d{1,2}):(\d{2})\b|\b(\d{1,2})\s*(?:h|hs|hrs)\b/);
  if (!m) return -1;
  const h = Number(m[1] ?? m[3] ?? m[5]), mi = Number(m[2] ?? m[4] ?? 0);
  return h <= 24 && mi < 60 ? h * 60 + mi : -1;
}
// Rango "de 8 a 14", "8:30-16h" → [desde, hasta] en minutos
function asRango(t) {
  const m = t.match(/\b(?:de\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*(?:h|hs|hrs)?\s*(?:a|-|hasta)\s*(?:las\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*(?:h|hs|hrs)?\b/);
  if (!m) return null;
  const a = Number(m[1]) * 60 + Number(m[2] || 0), b = Number(m[3]) * 60 + Number(m[4] || 0);
  return a < b && b <= 24 * 60 ? [a, b] : null;
}
// Montos con € / euros / $
const AS_PLATA = /(?:€|\$)\s*(\d[\d.,]*)|(\d[\d.,]*)\s*(?:€|euros?\b|eur\b|\$)/g;
const asPlata = (t) => [...t.matchAll(AS_PLATA)].map((m) => asNum(m[1] || m[2])).filter((n) => n > 0);
const asTotal = (t) => { const m = t.match(/\b(?:total|importe|son|monto|suma)\s*:?\s*(?:de\s+)?(?:€\s*)?(\d[\d.,]*)/); return m ? asNum(m[1]) : 0; };

// Mensajes copiados de WhatsApp: "[15/11/26, 10:32] Juan: texto" o "15/11/26 10:32 - Juan: texto"
const AS_WA = /^\s*\[?\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]\.?\s*m\.?)?\]?\s*(?:-\s*)?([^:\n]{1,40}):\s*/i;
function asLineas(txt) {
  let quien = '';
  const lineas = String(txt || '').split(/\r?\n/).map((l) => { const m = l.match(AS_WA); if (m) { quien = quien || m[1].trim(); l = l.slice(m[0].length); } return l.replace(/^\s*(?:[-*•·]+|\d+[).]\s)\s*/, '').trim(); }).filter(Boolean);
  return { lineas, quien };
}

// ---------- Productos y proveedores ----------
const AS_UNI = { kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg', k: 'kg', g: 'g', gr: 'g', grs: 'g', gramo: 'g', gramos: 'g', l: 'l', lt: 'l', lts: 'l', litro: 'l', litros: 'l', ml: 'ml', u: 'u', ud: 'u', uds: 'u', und: 'u', unid: 'u', unidad: 'u', unidades: 'u', docena: 'docena', docenas: 'docena', caja: 'caja', cajas: 'caja', paquete: 'paquete', paquetes: 'paquete', paq: 'paquete', bolsa: 'bolsa', bolsas: 'bolsa', bandeja: 'bandeja', bandejas: 'bandeja', botella: 'botella', botellas: 'botella', lata: 'lata', latas: 'lata', saco: 'saco', sacos: 'saco', pack: 'pack', packs: 'pack', barra: 'barra', barras: 'barra', tarrina: 'tarrina', tarrinas: 'tarrina', cajon: 'cajon', cajones: 'cajon', garrafa: 'garrafa', garrafas: 'garrafa', bote: 'bote', botes: 'bote', pieza: 'u', piezas: 'u', porcion: 'u', porciones: 'u', rebanada: 'u', rebanadas: 'u', brick: 'brick', bricks: 'brick', brik: 'brick', briks: 'brick', envase: 'envase', envases: 'envase', tarro: 'tarro', tarros: 'tarro', frasco: 'frasco', frascos: 'frasco', rollo: 'rollo', rollos: 'rollo', manojo: 'manojo', manojos: 'manojo', cartón: 'carton', carton: 'carton', cartones: 'carton', bidon: 'bidon', bidones: 'bidon' };
const AS_UNIRE = Object.keys(AS_UNI).sort((a, b) => b.length - a.length).join('|');
const AS_NOITEM = /\b(total|subtotal|iva|igic|importe|gracias|hola|buen[oa]s?|saludos|envio|transporte|personas?|pax|minutos?|horas?|dias?|semanas?|meses|años?)\b/;
const AS_VERBO = /^(?:hoy\s+|ayer\s+)?(?:me\s+|nos\s+|te\s+)?(?:llego|llegaron|llegan|llega|recibi|recibimos|recibido|compre|compramos|traje|trajeron|trajo|vendi|vendimos|se vendieron|vendido|pedido|pedi|pedimos|albaran|entrega|entregaron|mandaron|mando|paso|pasamos|te paso)\b\s*:?\s*(?:de\s+)?/;

// Una parte de línea con cantidad y producto: "20 litros de leche", "café x6", "huevos: 90 a 0,25€ c/u"
function asItem(parte) {
  let t = asN(parte).replace(AS_VERBO, '').replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, ' ').trim();
  if (!t || AS_NOITEM.test(t)) return null;
  let cu = 0, tot = 0;
  t = t.replace(/(?:\ba\s+)?(?:€\s*(\d[\d.,]*)|(\d[\d.,]*)\s*(?:€|euros?\b|eur\b))\s*(\/\s*(?:kg|kilo|l|lt|litro|u|ud|unidad)\b|c\/u\b|cada una?\b|la unidad\b|el kilo\b|el litro\b|por (?:kg|kilo|litro|unidad)\b)?/g, (all, a, b, por) => { const n = asNum(a || b); if (por || /^\s*a\s/.test(all)) cu = n; else tot = n; return ' '; }).replace(/\s+/g, ' ').trim();
  const U = `(?:(${AS_UNIRE})\\b\\.?)?`;
  let m = t.match(new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*(?:x\\s*)?${U}\\s*(?:de\\s+)?(.*[a-z].*)$`)), cant, uni, nombre;
  if (m) [, cant, uni, nombre] = m;
  else if ((m = t.match(new RegExp(`^(.*[a-z].*?)\\s*(?:[:=]|-|x)?\\s*(\\d+(?:[.,]\\d+)?)\\s*${U}$`)))) [, nombre, cant, uni] = m;
  else return null;
  nombre = nombre.replace(/^(?:de|del)\s+/, '').replace(/[\s:,.\-–]+$/, '').trim();
  if (!nombre || !/[a-z]{2}/.test(nombre) || AS_NOITEM.test(nombre)) return null;
  const q = asNum(cant); if (!(q > 0)) return null;
  return { nombre, cant: q, uni: AS_UNI[uni] || '', cu, tot };
}
// Busca el producto más parecido (en el local indicado)
function asBuscarProd(nombre, lid, soloBase) {
  const tk = asToks(nombre); if (!tk.length) return null;
  let best = null, bs = 0;
  state.productos.filter((p) => localDe(p) === lid && (!soloBase || !esElaborado(p))).forEach((p) => {
    const pt = asToks(p.nombre); if (!pt.length) return;
    const igual = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)));
    const inter = tk.filter((w) => pt.some((x) => igual(w, x))).length; if (!inter) return;
    const s = 0.6 * (inter / pt.length) + 0.4 * (inter / tk.length);
    if (s > bs) { bs = s; best = p; }
  });
  return bs >= 0.5 ? best : null;
}
const asUniProd = (p) => { const u = asN(p && p.unidad); return /kg|kilo/.test(u) ? 'kg' : /^g$|gramo/.test(u) ? 'g' : /litro|^l$|^lt/.test(u) ? 'l' : /^ml$/.test(u) ? 'ml' : 'u'; };
function asConvertir(cant, uni, p) { // pasa la cantidad a la unidad del producto
  const pu = p ? asUniProd(p) : '';
  if (uni === 'g' && pu === 'kg') return cant / 1000;
  if (uni === 'kg' && pu === 'g') return cant * 1000;
  if (uni === 'ml' && pu === 'l') return cant / 1000;
  if (uni === 'l' && pu === 'ml') return cant * 1000;
  if (uni === 'docena') return cant * 12;
  return cant;
}
function asBuscarProv(t, quien) {
  const tt = new Set(asToks(t + ' ' + (quien || '')));
  let best = null, bs = 0;
  state.proveedores.forEach((p) => {
    const pt = asToks(p.nombre); if (!pt.length) return;
    const n = pt.filter((w) => tt.has(w)).length, s = n / pt.length;
    const porContacto = quien && p.contacto && asN(quien).includes(asN(p.contacto).split(' ')[0]);
    if ((s >= 0.6 && n >= 1 && s > bs) || (porContacto && bs < 0.6)) { bs = porContacto ? 0.6 : s; best = p; }
  });
  return best;
}
function asLocalEnTexto(t) { const l = locales().find((x) => { const tk = asToks(x.nombre).filter((w) => !['nardi', 'local'].includes(w)); return tk.length && tk.some((w) => new RegExp(`\\b${w}`).test(t)); }); return l ? l.id : ''; }
const asLocal = () => (typeof localActivo === 'function' ? localActivo() : 'principal');

// ---------- Entender ----------
const AS_CAT_GASTO = [[/\bluz\b|electric|\bgas\b|\bagua\b|endesa|naturgy|emalsa/, 'Luz / Gas / Agua'], [/alquiler|arriendo/, 'Alquiler'], [/sueldo|nomina|salario|jornal|paga\b/, 'Sueldos'], [/internet|telefono|movil|fibra|wifi/, 'Internet / Teléfono'], [/impuesto|hacienda|igic|iva|tasa|seguridad social|autonomo/, 'Impuestos'], [/transporte|flete|gasolina|combustible|taxi|envio|parking|aparcamiento/, 'Transporte / Flete'], [/arreglo|reparacion|mantenimiento|tecnico|fontanero|electricista|limpieza/, 'Mantenimiento']];
const AS_TIPOS_CAT = [['coffee break', 'Coffee break'], ['desayuno', 'Desayuno'], ['brunch', 'Brunch'], ['almuerzo', 'Almuerzo'], ['comida', 'Almuerzo'], ['merienda', 'Merienda'], ['cena', 'Cena'], ['cumple', 'Cumpleaños'], ['boda', 'Boda'], ['bautizo', 'Bautizo'], ['comunion', 'Comunión'], ['congreso', 'Congreso'], ['reunion', 'Reunión'], ['cocktail', 'Cóctel'], ['coctel', 'Cóctel'], ['aperitivo', 'Aperitivo']];

function asEntender(txt) {
  const { lineas, quien } = asLineas(txt), todo = asN(lineas.join('\n')), acciones = [];
  if (!lineas.length) return acciones;
  const lid = asLocal();
  // 1) Catering: es todo el mensaje
  if (/\bcatering|coffee ?break|\bevento\b|\bpax\b/.test(todo) || (/\b\d+\s*(?:personas|invitados|comensales)\b/.test(todo) && asFecha(todo))) { acciones.push(asCatering(lineas, todo, quien)); return acciones; }
  // 2) Turnos: líneas con el nombre de alguien del personal y un horario
  const libres = [];
  lineas.forEach((l) => {
    const t = asN(l), r = asRango(t);
    const quienes = r ? activos().filter((p) => { const n = asToks(p.nombre)[0]; return n && new RegExp(`\\b${n}`).test(t.split(/[^a-z0-9]+/).map(asRaiz).join(' ')); }) : [];
    if (quienes.length) quienes.forEach((p) => acciones.push({ tipo: 'turno', pid: p.id, fecha: asFecha(t) || asFecha(todo) || todayStr(), desde: r[0], hasta: r[1], local: asLocalEnTexto(t) || lid }));
    else libres.push(l);
  });
  if (!libres.length) return acciones;
  const resto = asN(libres.join('\n'));
  // 3) Mercadería o venta de productos: partes con cantidad + producto
  const venta = /\b(vendi|vendimos|se vendieron|vendido|venta|ventas)\b/.test(resto);
  const items = [];
  libres.forEach((l) => l.split(/;|,(?!\d)|\.\s+|\s+y\s+(?=\d)|:(?=\s*\d)/).forEach((parte) => { const it = asItem(parte); if (it) items.push(it); }));
  if (items.length) { acciones.push(venta ? asVentaProd(items, resto, lid) : asMercaderia(items, resto, quien, lid)); return acciones; }
  // 4) Deudas, gastos, ventas en plata y recordatorios: el mensaje entero
  const plata = asPlata(resto), monto = asTotal(resto) || plata[0] || 0, fecha = asFecha(resto);
  const titulo = asCap(libres.join(' ').replace(AS_WA, '').slice(0, 90));
  const pv = asBuscarProv(resto, quien);
  const pasado = /\b(pague|pagamos|pagado|pago la|gaste|gastamos|gasto de|compre|compramos)\b/.test(resto);
  if (!pasado && /\b(hay que pagar|tengo que pagar|tenemos que pagar|pagar|vence|vencimiento|debo|debemos|deuda|pendiente de pago|a pagar)\b/.test(resto)) acciones.push({ tipo: 'aviso', ev: 'pagar', titulo, persona: pv ? pv.nombre : '', monto, fecha: fecha || todayStr() });
  else if (/\b(cobrar|me deben|nos deben|me debe|nos debe|hay que cobrar|a cobrar|fiado)\b/.test(resto)) acciones.push({ tipo: 'aviso', ev: 'cobrar', titulo, persona: '', monto, fecha: fecha || todayStr() });
  else if (/\b(recordar|recordame|recordatorio|acordarme|acordate|no olvidar|no olvides|avisame|avisar)\b/.test(resto)) acciones.push({ tipo: 'aviso', ev: 'recordatorio', titulo, persona: '', monto, fecha: fecha || addDays(todayStr(), 1) });
  else if (monto && /\b(vendi|vendimos|venta|ventas|recaudacion|recaudamos|facturamos|cobre|cobramos|hicimos|caja)\b/.test(resto)) acciones.push({ tipo: 'mov', mov: 'ingreso', categoria: 'Venta', descripcion: titulo, monto, fecha: fecha || todayStr(), local: asLocalEnTexto(resto) || lid });
  else if (monto && (pasado || /\b(gasto|gastos|factura|recibo|ticket)\b/.test(resto) || AS_CAT_GASTO.some(([re]) => re.test(resto)))) {
    const cat = (AS_CAT_GASTO.find(([re]) => re.test(resto)) || [0, 'Otro gasto'])[1];
    acciones.push({ tipo: 'mov', mov: 'gasto', categoria: cat, descripcion: titulo, monto, fecha: fecha || todayStr(), proveedorId: pv ? pv.id : '', local: asLocalEnTexto(resto) || lid });
  }
  return acciones;
}
function asMercaderia(items, t, quien, lid) {
  const pv = asBuscarProv(t, quien);
  const filas = items.map((it) => {
    const p = asBuscarProd(it.nombre, lid, true), cant = asConvertir(it.cant, it.uni, p);
    const tot = it.tot || (it.cu ? it.cu * it.cant : 0);
    return { nombre: asCap(it.nombre), pid: p ? p.id : 'nuevo', cant: Math.round(cant * 1000) / 1000, tot: Math.round(tot * 100) / 100, orig: `${fmtNum(it.cant)}${it.uni ? ' ' + it.uni : ''}`, uni: it.uni };
  });
  const sum = filas.reduce((s, f) => s + (f.tot || 0), 0), total = asTotal(t) || (sum ? 0 : asPlata(t).slice(-1)[0] || 0);
  const debo = /\b(a pagar|pendiente|a cuenta|vence|vencimiento|a \d+ dias|fiado|te lo pago|lo pago|pagar el|pago el)\b/.test(t) && !/\b(pagado|ya pague|pagamos|al contado)\b/.test(t);
  return { tipo: 'mercaderia', items: filas, proveedorId: pv ? pv.id : '', fecha: debo ? todayStr() : asFecha(t) || todayStr(), total: Math.round(total * 100) / 100, pago: debo ? 'debo' : 'pagado', fechaPago: debo ? asFecha(t.replace(/.*?(vence|pagar|pago|a \d+ dias)/, '$1')) || addMonths(todayStr(), 1) : addMonths(todayStr(), 1), local: lid };
}
function asVentaProd(items, t, lid) {
  return { tipo: 'venta', fecha: asFecha(t) || todayStr(), local: lid, items: items.map((it) => { const p = asBuscarProd(it.nombre, lid, false); return { nombre: asCap(it.nombre), pid: p ? p.id : '', cant: it.cant, tot: it.tot || (p ? Math.round(p.precio * it.cant * 100) / 100 : 0) }; }) };
}
function asCatering(lineas, t, quien) {
  const orig = lineas.join('\n');
  let cliente = '';
  for (const m of orig.matchAll(/\b(?:para|cliente:?|empresa|de parte de)\s+(?!\d)([^,.;\n]{2,60}?)(?=\s*[,.;\n]|\s+(?:el|la|los|para|de las|a las|con|en|que|\d)\b|$)/gi)) {
    const c = m[1].trim(); if (!/^(el|la|los|las|un|una|unas|unos|catering|evento|coffee|desayuno|almuerzo|merienda|personas)\b/i.test(c) && !/\b\d+\s*(personas|pax)\b/i.test(c)) { cliente = c; break; }
  }
  if (!cliente) { const m = orig.match(/\b(?:me escribi[oó]|escribi[oó]|me llam[oó]|llam[oó]|pidi[oó]|cumple(?:años)? de|boda de|bautizo de|comuni[oó]n de)\s+([A-ZÁÉÍÓÚÑ][\wáéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][\wáéíóúñ]+)?)/); if (m) cliente = m[1]; }
  const personas = Number((t.match(/\b(\d{1,4})\s*(?:personas|pers\b|pax|invitados|comensales|asistentes)/) || [])[1]) || '';
  const tipo = (AS_TIPOS_CAT.find(([k]) => t.includes(k)) || [0, ''])[1];
  const hora = (() => { const sinArmado = t.replace(/(armado|montaje)[^,.\n]*/g, ''); const h = asHora(sinArmado); return h >= 0 ? hhmm(h) : ''; })();
  const arm = (t.match(/(?:armado|montaje)[^,.\n]*/) || [''])[0], armado = arm && asHora(arm) >= 0 ? hhmm(asHora(arm)) : '';
  const lugarM = orig.match(/\b(?:en|lugar:?|direcci[oó]n:?)\s+((?:la |el )?(?:calle|c\/|av\.?|avda\.?|avenida|plaza|hotel|oficinas?|sede|sal[oó]n|local|parque|edificio|finca|restaurante|colegio|universidad|club)[^,;\n]{0,60})/i);
  const tel = (orig.match(/(?:\+\d{2}\s?)?\b[6-9]\d{2}\s?\d{2,3}\s?\d{2,3}\s?\d{0,3}\b/) || [''])[0].trim();
  const dietas = (t.match(/[^,.;\n]*\b(sin gluten|celiac|vegan|vegetarian|sin lactosa|alergi|intoleran|halal|kosher)[^,.;\n]*/) || [''])[0].trim();
  const items = [];
  menus().forEach((m) => { const n = asN(m.nombre); if (n && t.includes(n)) items.push({ d: m.nombre + (m.descripcion ? ': ' + m.descripcion : ''), c: personas || 1, p: m.precioPersona, menuId: m.id }); });
  const pp = t.match(/(\d[\d.,]*)\s*(?:€|euros?)\s*(?:por persona|\/persona|pp\b|p\.p\.|por cabeza|el cubierto)/);
  const total = asTotal(t);
  if (!items.length && pp) items.push({ d: tipo || 'Catering', c: personas || 1, p: asNum(pp[1]) });
  else if (!items.length && total) items.push({ d: tipo || 'Catering', c: 1, p: total });
  const sena = t.match(/\b(?:sena|senal|adelanto|anticipo|deposito|a cuenta)\s*(?:de\s*)?(\d[\d.,]*)\s*(?:€|euros?)?/);
  return { tipo: 'catering', cliente: cliente || quien || '', fecha: asFecha(t) || '', hora, armado, personas, tipoEv: tipo, lugar: lugarM ? lugarM[1].trim() : '', contacto: tel, dietas, estado: /\bconfirmad|reservad|cerrad[oa]\b|\bseguro\b/.test(t) ? 'confirmado' : 'presupuesto', items, sena: sena ? asNum(sena[1]) : 0, notas: orig };
}

// ---------- Guardar ----------
function asAplicar(a) {
  if (a.tipo === 'mercaderia') {
    const pv = prov(a.proveedorId), filas = a.items.filter((f) => f.cant > 0 && (f.pid !== 'nuevo' || f.nombre.trim()));
    if (!filas.length) return toast('No hay productos para anotar'), null;
    const nombres = [];
    filas.forEach((f) => {
      let p = f.pid !== 'nuevo' && prod(f.pid);
      if (!p) { p = { id: uid(), creado: new Date().toISOString(), nombre: asCap(f.nombre), categoria: 'Ingredientes', codigo: '', unidad: { kg: 'kg', g: 'kg', l: 'litros', ml: 'litros' }[f.uni] || 'unidades', costo: 0, precio: 0, stock: 0, stockMin: 0, proveedorId: a.proveedorId || '', campos: [], notas: 'Creado desde el Asistente', foto: '', local: a.local }; if (f.uni === 'g' || f.uni === 'ml') f.cant = f.cant / 1000; state.productos.push(p); }
      p.stock = Math.round(((Number(p.stock) || 0) + f.cant) * 1000) / 1000;
      if (f.tot > 0) p.costo = Math.round((f.tot / f.cant) * 10000) / 10000;
      if (a.proveedorId && !p.proveedorId) p.proveedorId = a.proveedorId;
      state.stockMovs.push({ id: uid(), fecha: a.fecha, productoId: p.id, tipo: 'entrada', cantidad: f.cant, nota: [pv && pv.nombre, 'Asistente'].filter(Boolean).join(' · ') });
      nombres.push(`${fmtNum(f.cant)} ${p.unidad || ''} ${p.nombre}`.replace(/\s+/g, ' '));
    });
    const total = a.total || filas.reduce((s, f) => s + (f.tot || 0), 0), desc = 'Mercadería: ' + nombres.join(', ');
    if (total > 0 && a.pago === 'debo') state.eventos.push({ id: uid(), tipo: 'pagar', titulo: 'Pagar mercadería' + (pv ? ' · ' + pv.nombre : ''), persona: pv ? pv.nombre : '', monto: total, fecha: a.fechaPago, notas: desc, hecho: false, mov: { tipo: 'inversion', categoria: 'Mercadería', proveedorId: a.proveedorId } });
    else if (total > 0 && a.pago === 'pagado') state.movimientos.push({ id: uid(), creado: new Date().toISOString(), fecha: a.fecha, tipo: 'inversion', categoria: 'Mercadería', descripcion: desc, monto: total, proveedorId: a.proveedorId, local: a.local });
    return { txt: `Anoté la mercadería: ${nombres.join(', ')}${total > 0 ? ` · ${fmtMoney(total)} ${a.pago === 'debo' ? 'a pagar el ' + fmtDate(a.fechaPago) : a.pago === 'pagado' ? 'como inversión' : ''}` : ''}.`, ir: 'productos' };
  }
  if (a.tipo === 'venta') {
    const filas = a.items.filter((f) => prod(f.pid) && f.cant > 0); if (!filas.length) return toast('Elegí qué producto se vendió'), null;
    filas.forEach((f) => {
      const p = prod(f.pid);
      if (esElaborado(p)) descontarReceta(p, f.cant, a.fecha, 'Venta de ' + p.nombre);
      else { p.stock -= f.cant; state.stockMovs.push({ id: uid(), fecha: a.fecha, productoId: p.id, tipo: 'salida', cantidad: -f.cant, nota: 'Venta (Asistente)' }); }
      state.movimientos.push({ id: uid(), creado: new Date().toISOString(), fecha: a.fecha, tipo: 'ingreso', categoria: 'Venta', descripcion: 'Asistente', monto: f.tot || 0, productoId: p.id, cantidad: f.cant, costoUnit: costoDe(p), local: localDe(p) });
    });
    return { txt: `Anoté la venta de ${filas.map((f) => `${fmtNum(f.cant)} × ${prod(f.pid).nombre}`).join(', ')}.`, ir: 'finanzas' };
  }
  if (a.tipo === 'mov') {
    if (!(a.monto > 0)) return toast('Poné el monto'), null;
    state.movimientos.push({ id: uid(), creado: new Date().toISOString(), fecha: a.fecha, tipo: a.mov, categoria: a.categoria, descripcion: a.descripcion, monto: a.monto, proveedorId: a.proveedorId || '', local: a.local });
    return { txt: `Anoté ${a.mov === 'ingreso' ? 'el cobro' : 'el gasto'} de ${fmtMoney(a.monto)} (${a.categoria}).`, ir: 'finanzas' };
  }
  if (a.tipo === 'aviso') {
    if (!a.titulo) return toast('Poné una descripción'), null;
    state.eventos.push({ id: uid(), tipo: a.ev, titulo: a.titulo, persona: a.persona || '', monto: a.monto || 0, fecha: a.fecha, notas: 'Desde el Asistente', hecho: false });
    ui.calSel = a.fecha; ui.calMes = a.fecha.slice(0, 7);
    return { txt: `Anoté en el calendario: ${TIPOS_EV[a.ev].lbl.toLowerCase()} el ${fmtDate(a.fecha)}${a.monto ? ' por ' + fmtMoney(a.monto) : ''}.`, ir: 'calendario' };
  }
  if (a.tipo === 'catering') {
    if (!a.cliente) return toast('Poné el nombre del cliente'), null;
    if (!a.fecha) return toast('Poné la fecha del catering'), null;
    const c = asCateringObj(a); c.id = uid(); c.creado = new Date().toISOString();
    (state.caterings || (state.caterings = [])).push(c);
    a.catId = c.id; ui.calSel = c.fecha; ui.calMes = c.fecha.slice(0, 7);
    return { txt: `Anoté el catering de ${c.cliente} el ${fmtDate(c.fecha)}${c.hora ? ' a las ' + c.hora : ''}. Ya aparece en el calendario y en Turnos.`, ir: 'catering' };
  }
  if (a.tipo === 'turno') {
    const p = persona(a.pid); if (!p) return toast('Elegí la persona'), null;
    if (!(a.hasta > a.desde)) return toast('La salida tiene que ser después de la entrada'), null;
    agregarTurno(a.fecha, a.pid, a.desde, a.hasta, a.local);
    ui.turFecha = a.fecha;
    return { txt: `Anoté a ${p.nombre} el ${fmtDate(a.fecha)} de ${hhmm(a.desde)} a ${hhmm(a.hasta)}${multiLocal() ? ' en ' + localInfo(a.local).nombre : ''}.`, ir: 'turnos' };
  }
  return null;
}
const asCateringObj = (a) => ({ fecha: a.fecha || todayStr(), hora: a.hora || '', cliente: a.cliente, contacto: a.contacto || '', lugar: a.lugar || '', tipo: a.tipoEv || '', personas: a.personas || '', estado: a.estado, items: (a.items || []).map((i) => ({ ...i })), equipo: [], gastos: [], cobros: a.sena ? [{ fecha: todayStr(), monto: a.sena, medio: 'Transferencia', nota: 'seña' }] : [], factura: { numero: '', fecha: '' }, armado: a.armado || '', dietas: a.dietas || '', material: [], igic: typeof igicDef === 'function' ? igicDef() : 7, notas: a.notas || '' });

// ---------- Pantalla ----------
const AS_INFO = {
  mercaderia: ['📥', 'Entrada de mercadería'], venta: ['🛒', 'Venta de productos'], mov: ['💶', 'Movimiento de plata'],
  aviso: ['📅', 'Aviso en el calendario'], catering: ['🍽️', 'Catering'], turno: ['👥', 'Turno'],
};
const AS_EJEMPLOS = [
  ['📥 Mercadería', 'Llegó de Lácteos del Norte: 20 litros de leche, 2 kg de mantequilla y 90 huevos. Total 54,50€, pagado'],
  ['🍽️ Catering', 'Catering sábado 28 para Empresa Pérez, 25 personas a las 10, coffee break. 2 sin gluten'],
  ['💶 Gasto', 'Pagué la luz del local 120€'],
  ['📅 Deuda', 'Hay que pagar la factura de harina 90€ el 30/11'],
  ['👥 Turno', 'Sofía mañana de 8 a 14'],
  ['🛒 Venta', 'Vendí 3 tiramisú y 2 éclair de chocolate'],
];
const asLbl = (txt, html) => `<label class="f">${txt}${html}</label>`;
const asIn = (k, v, extra = '') => `<input data-k="${k}" value="${esc(v ?? '')}" ${extra}>`;
const asSel = (k, opts, v) => `<select data-k="${k}">${opts.map(([val, l]) => `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
const asLocSel = (a) => (multiLocal() ? asLbl('Local', asSel('local', locales().map((l) => [l.id, l.nombre]), a.local)) : '');
const asHorasOpt = () => { const o = []; for (let m = 0; m <= 24 * 60; m += 30) o.push([m, hhmm(m)]); return o; };

function asCampos(a) {
  const fecha = (k = 'fecha', l = 'Fecha') => asLbl(l, asIn(k, a[k], 'type="date"'));
  if (a.tipo === 'mercaderia') {
    const opts = state.productos.filter((p) => localDe(p) === a.local && !esElaborado(p)).sort((x, y) => x.nombre.localeCompare(y.nombre)).map((p) => [p.id, `${p.nombre} (${p.unidad || 'u'})`]);
    const sum = a.items.reduce((s, f) => s + (f.tot || 0), 0);
    return `<div class="as-items">${a.items.map((f, i) => `<div class="as-it" data-i="${i}">
      <div class="as-it-p">${asSel('pid', [['nuevo', `➕ Producto nuevo: ${f.nombre}`], ...opts], f.pid)}${f.pid === 'nuevo' ? `<input data-k="nombre" value="${esc(f.nombre)}" placeholder="Nombre del producto nuevo">` : ''}${f.orig ? `<span class="small muted">En el mensaje: ${esc(f.orig)} de ${esc(f.nombre.toLowerCase())}</span>` : ''}</div>
      <label class="f">Cantidad<input data-k="cant" inputmode="decimal" value="${f.cant}"></label>
      <label class="f">Costo total<input data-k="tot" inputmode="decimal" value="${f.tot || ''}" placeholder="€"></label>
      <button class="sm" data-act="asRmItem" aria-label="Quitar">✕</button></div>`).join('')}</div>
      <div class="as-grid">${asLbl('Proveedor', `<select data-k="proveedorId">${provOptions(a.proveedorId)}</select>`)}${fecha('fecha', 'Fecha de llegada')}
      ${asLbl('Total de la compra', asIn('total', a.total || '', `inputmode="decimal" placeholder="${sum ? fmtNum(sum) + ' (suma)' : '€'}"`))}
      ${asLbl('Pago', asSel('pago', [['pagado', 'Ya está pagado (inversión)'], ['debo', 'Lo pago más adelante'], ['no', 'No anotar el pago']], a.pago))}
      ${a.pago === 'debo' ? fecha('fechaPago', 'Fecha de pago') : ''}${asLocSel(a)}</div>`;
  }
  if (a.tipo === 'venta') {
    const opts = state.productos.filter((p) => localDe(p) === a.local).sort((x, y) => x.nombre.localeCompare(y.nombre)).map((p) => [p.id, `${p.nombre} · ${fmtMoney(p.precio)}`]);
    return `<div class="as-items">${a.items.map((f, i) => `<div class="as-it" data-i="${i}"><div class="as-it-p">${asSel('pid', [['', `¿Cuál es "${f.nombre}"?`], ...opts], f.pid)}</div>
      <label class="f">Cantidad<input data-k="cant" inputmode="decimal" value="${f.cant}"></label><label class="f">Total cobrado<input data-k="tot" inputmode="decimal" value="${f.tot || ''}"></label>
      <button class="sm" data-act="asRmItem" aria-label="Quitar">✕</button></div>`).join('')}</div><div class="as-grid">${fecha()}${asLocSel(a)}</div>`;
  }
  if (a.tipo === 'mov') return `<div class="as-grid">${asLbl('Tipo', asSel('mov', [['gasto', 'Gasto'], ['ingreso', 'Cobro / venta'], ['inversion', 'Inversión']], a.mov))}${asLbl('Monto', asIn('monto', a.monto || '', 'inputmode="decimal"'))}
    ${asLbl('Categoría', `<input data-k="categoria" list="asCats${a.mov}" value="${esc(a.categoria)}"><datalist id="asCats${a.mov}">${(CATS[a.mov] || []).map((c) => `<option value="${esc(c)}">`).join('')}</datalist>`)}${fecha()}
    <label class="f full">Detalle${asIn('descripcion', a.descripcion)}</label>${asLocSel(a)}</div>`;
  if (a.tipo === 'aviso') return `<div class="as-grid">${asLbl('¿Qué es?', asSel('ev', Object.entries(TIPOS_EV).map(([k, t]) => [k, `${t.ico} ${t.lbl}`]), a.ev))}${fecha('fecha', 'Fecha')}
    <label class="f full">Descripción${asIn('titulo', a.titulo)}</label>${asLbl('Persona / empresa', asIn('persona', a.persona))}${asLbl('Monto', asIn('monto', a.monto || '', 'inputmode="decimal"'))}</div>`;
  if (a.tipo === 'catering') return `<div class="as-grid">${asLbl('Cliente', asIn('cliente', a.cliente, 'placeholder="¿Para quién es?"'))}${asLbl('Día' + (a.fecha ? '' : ' <b class="c-out">(no la encontré)</b>'), asIn('fecha', a.fecha, 'type="date"'))}
    ${asLbl('Hora', asIn('hora', a.hora, 'type="time"'))}${asLbl('Personas', asIn('personas', a.personas, 'inputmode="numeric"'))}
    ${asLbl('Tipo de evento', asIn('tipoEv', a.tipoEv))}${asLbl('Estado', asSel('estado', Object.entries(CAT_ESTADOS).map(([k, e]) => [k, e.lbl]), a.estado))}
    <label class="f full">Lugar${asIn('lugar', a.lugar)}</label>${asLbl('Teléfono', asIn('contacto', a.contacto))}${asLbl('Dietas especiales', asIn('dietas', a.dietas))}</div>
    <div class="small mt as-cat-it">${asCatItems(a)}</div>
    ${a.sena ? `<div class="small">💶 Seña de ${fmtMoney(a.sena)}</div>` : ''}`;
  if (a.tipo === 'turno') return `<div class="as-grid">${asLbl('Persona', asSel('pid', activos().map((p) => [p.id, p.nombre]), a.pid))}${fecha()}
    ${asLbl('Desde', asSel('desde', asHorasOpt(), a.desde))}${asLbl('Hasta', asSel('hasta', asHorasOpt(), a.hasta))}${asLocSel(a)}</div>`;
  return '';
}
const asCatItems = (a) => (a.items.length ? '🧾 ' + a.items.map((i) => `${fmtNum(i.c)} × ${esc(i.d)} = <b>${fmtMoney(i.c * i.p)}</b>`).join('<br>') : '<span class="muted">Sin menú ni precio: los podés agregar con "Abrir completo".</span>');
function asAccHTML(a, mi, ai) {
  const [ico, lbl] = AS_INFO[a.tipo] || ['❓', a.tipo], id = `${mi}|${ai}`;
  if (a.estado === 'hecho') return `<div class="as-acc hecho"><div>✔ ${esc(a.res || 'Anotado')}</div>${a.ir ? `<button class="sm" data-act="goto" data-id="${a.ir}">Ver</button>` : ''}</div>`;
  if (a.estado === 'no') return `<div class="as-acc descartado"><span>${ico} ${lbl}: descartado</span><button class="sm" data-act="asVolver" data-id="${id}">Deshacer</button></div>`;
  return `<div class="as-acc" data-m="${mi}" data-a="${ai}"><div class="as-acc-t">${ico} <b>${lbl}</b></div>${asCampos(a)}
    <div class="as-acc-b"><button class="sm" data-act="asNo" data-id="${id}">Descartar</button>${a.tipo === 'catering' ? `<button class="sm" data-act="asAbrir" data-id="${id}">Abrir completo</button>` : ''}<button class="pri sm" data-act="asOk" data-id="${id}">✔ Anotar</button></div></div>`;
}
function asResp(acc) {
  if (!acc.length) return 'No me di cuenta de qué anotar. Probá escribiendo, por ejemplo, <i>"llegaron 10 kg de café"</i>, <i>"catering sábado 28 para López, 30 personas"</i>, <i>"pagué la luz 120€"</i> o <i>"Sofía mañana de 8 a 14"</i>.';
  const n = (t) => acc.filter((a) => a.tipo === t).length;
  const partes = [];
  if (n('mercaderia')) partes.push(`una <b>entrada de mercadería</b> con ${acc.find((a) => a.tipo === 'mercaderia').items.length} producto${acc.find((a) => a.tipo === 'mercaderia').items.length === 1 ? '' : 's'}`);
  if (n('venta')) partes.push('una <b>venta</b>');
  if (n('mov')) partes.push(acc.find((a) => a.tipo === 'mov').mov === 'ingreso' ? 'un <b>cobro</b>' : 'un <b>gasto</b>');
  if (n('aviso')) partes.push(`un <b>aviso</b> para el calendario`);
  if (n('catering')) partes.push('un <b>catering</b>');
  if (n('turno')) partes.push(n('turno') === 1 ? 'un <b>turno</b>' : `${n('turno')} <b>turnos</b>`);
  return `Entendí ${partes.join(' y ')}. Revisá que esté bien y tocá <b>Anotar</b>.`;
}
function vAsistente() {
  const pend = (m) => m.acciones.filter((a) => !a.estado).length;
  return `<h1>💬 Asistente</h1><p class="sub">Pegá un mensaje (por ejemplo, de WhatsApp) o escribí lo que pasó. La app lo entiende y te muestra lo que va a anotar antes de guardarlo.</p>
  <div class="card as-comp"><textarea id="asTxt" rows="4" placeholder="Ej: Llegaron 20 litros de leche y 5 kg de harina, total 40€">${esc(ui.asTxt || '')}</textarea>
    <div class="as-comp-b">${navigator.clipboard && navigator.clipboard.readText ? '<button data-act="asPegar">📋 Pegar</button>' : ''}<button class="pri" data-act="asEnviar">Entender ➜</button></div></div>
  <div class="as-ej"><span class="small muted">Probá con:</span>${AS_EJEMPLOS.map(([l], i) => `<button class="sm" data-act="asEj" data-id="${i}">${l}</button>`).join('')}</div>
  <div class="as-lista">${AS.msgs.map((m, mi) => [m, mi]).reverse().map(([m, mi]) => `<div class="as-par">
    <div class="as-yo"><div class="as-burb">${esc(m.txt).replace(/\n/g, '<br>')}</div></div>
    <div class="as-app"><div class="as-burb"><div>${asResp(m.acciones)}</div>${m.acciones.map((a, ai) => asAccHTML(a, mi, ai)).join('')}${pend(m) > 1 ? `<div class="as-acc-b"><button class="pri" data-act="asOkTodo" data-id="${mi}">✔ Anotar todo</button></div>` : ''}</div></div></div>`).join('')}</div>
  ${AS.msgs.length ? '<div class="right mt"><button class="sm" data-act="asLimpiar">🧹 Borrar la conversación</button></div>' : ''}`;
}

// Editar lo que entendió: los cambios se guardan en la acción sin redibujar todo
const AS_NUM = new Set(['cant', 'tot', 'total', 'monto', 'personas', 'desde', 'hasta']);
function asCampo(e) {
  const el = e.target; if (!el.dataset || !el.dataset.k) return;
  const box = el.closest('.as-acc'); if (!box || box.dataset.m === undefined) return;
  const a = AS.msgs[box.dataset.m] && AS.msgs[box.dataset.m].acciones[box.dataset.a]; if (!a) return;
  const k = el.dataset.k, v = AS_NUM.has(k) ? (k === 'personas' ? Number(el.value) || '' : numIn(el.value)) : el.value;
  const fila = el.closest('[data-i]');
  if (fila) a.items[fila.dataset.i][k] = v; else a[k] = v;
  if (a.tipo === 'catering' && k === 'personas' && v) a.items.forEach((i) => { if (i.menuId) i.c = v; });
  asGuardar();
  if (a.tipo === 'catering' && k === 'personas') { const d = $('.as-cat-it', box); if (d) d.innerHTML = asCatItems(a); }
  if (e.type === 'change' && ['pid', 'pago', 'local', 'mov', 'ev'].includes(k)) {
    if (k === 'local' && a.items) a.items.forEach((f) => { const p = asBuscarProd(f.nombre, a.local, a.tipo === 'mercaderia'); f.pid = p ? p.id : a.tipo === 'mercaderia' ? 'nuevo' : ''; });
    if (k === 'pid' && fila && a.tipo === 'venta') { const f = a.items[fila.dataset.i], p = prod(f.pid); if (p && !f.tot) f.tot = Math.round(p.precio * f.cant * 100) / 100; }
    if (k === 'mov') a.categoria = (CATS[a.mov] || [''])[0];
    asGuardar(); render();
  }
}
document.addEventListener('input', asCampo);
document.addEventListener('change', asCampo);
document.addEventListener('input', (e) => { if (e.target.id === 'asTxt') ui.asTxt = e.target.value; });
document.addEventListener('keydown', (e) => { if (e.target.id === 'asTxt' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); ACTS.asEnviar(); } });

const asAcc = (id) => { const [mi, ai] = String(id).split('|').map(Number); return AS.msgs[mi] && AS.msgs[mi].acciones[ai]; };
function asOk(a) {
  const r = asAplicar(a); if (!r) return false;
  a.estado = 'hecho'; a.res = r.txt; a.ir = r.ir; return true;
}
Object.assign(ACTS, {
  asEnviar: () => {
    const el = $('#asTxt'), txt = (el ? el.value : ui.asTxt || '').trim(); if (!txt) return toast('Escribí o pegá un mensaje');
    AS.msgs.push({ id: uid(), txt, cuando: new Date().toISOString(), acciones: asEntender(txt) });
    ui.asTxt = ''; asGuardar(); render(); window.scrollTo(0, 0);
  },
  asPegar: async () => { try { const t = await navigator.clipboard.readText(); if (!t) return toast('No hay nada copiado'); ui.asTxt = t; render(); } catch { toast('Mantené apretado el cuadro de texto y elegí "Pegar"'); } },
  asEj: (i) => { ui.asTxt = AS_EJEMPLOS[i][1]; render(); const el = $('#asTxt'); if (el) el.focus(); },
  asOk: (id) => { const a = asAcc(id); if (a && asOk(a)) { asGuardar(); commit(); toast('Anotado ✔'); } },
  asOkTodo: (mi) => { let n = 0; AS.msgs[mi].acciones.forEach((a) => { if (!a.estado && asOk(a)) n++; }); asGuardar(); commit(); if (n) toast(`Anotado ✔ (${n})`); },
  asNo: (id) => { const a = asAcc(id); if (a) { a.estado = 'no'; asGuardar(); render(); } },
  asVolver: (id) => { const a = asAcc(id); if (a) { delete a.estado; asGuardar(); render(); } },
  asAbrir: (id) => { const a = asAcc(id); if (!a) return; catForm(asCateringObj(a)); },
  asRmItem: (id, el) => { const box = el.closest('.as-acc'), fila = el.closest('[data-i]'); const a = asAcc(`${box.dataset.m}|${box.dataset.a}`); if (!a) return; a.items.splice(Number(fila.dataset.i), 1); if (!a.items.length) a.estado = 'no'; asGuardar(); render(); },
  asLimpiar: () => confirmBox('Se borra la conversación del Asistente. Lo que ya se anotó queda guardado.', () => { AS.msgs = []; asGuardar(); render(); }, 'Borrar'),
});
