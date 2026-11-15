'use strict';
/* Alérgenos, producción y compras por evento, y hoja del evento para catering. */

// ================= Alérgenos (los 14 obligatorios en la UE / España) =================
const ALERGENOS = [['gluten', '🌾', 'Gluten'], ['crustaceos', '🦐', 'Crustáceos'], ['huevo', '🥚', 'Huevo'], ['pescado', '🐟', 'Pescado'], ['cacahuete', '🥜', 'Cacahuete'], ['soja', '🫘', 'Soja'], ['lacteos', '🥛', 'Lácteos'], ['frutos', '🌰', 'Frutos de cáscara'], ['apio', '🥬', 'Apio'], ['mostaza', '🟡', 'Mostaza'], ['sesamo', '⚪', 'Sésamo'], ['sulfitos', '🍷', 'Sulfitos'], ['altramuces', '🫛', 'Altramuces'], ['moluscos', '🦪', 'Moluscos']];
const ALERG = Object.fromEntries(ALERGENOS.map(([k, i, n]) => [k, { i, n }]));
const ordenAlerg = (s) => ALERGENOS.map(([k]) => k).filter((k) => s.has(k));
function alergDe(p, prof = 0) {
  if (!p || prof > 5) return [];
  const s = new Set(p.alergenos || []);
  if (esElaborado(p)) p.receta.items.forEach((it) => alergDe(prod(it.pid), prof + 1).forEach((a) => s.add(a)));
  return ordenAlerg(s);
}
const alergMenu = (m) => { const s = new Set(); (m.items || []).forEach((it) => alergDe(prod(it.pid)).forEach((a) => s.add(a))); return ordenAlerg(s); };
const alergItems = (items) => { const s = new Set(); (items || []).forEach((it) => { const m = it.menuId && menus().find((x) => x.id === it.menuId); if (m) alergMenu(m).forEach((a) => s.add(a)); }); return ordenAlerg(s); };
const alergChips = (l, txt = true) => (l.length ? `<span class="alg-lista">${l.map((k) => `<span class="alg" title="${ALERG[k].n}">${ALERG[k].i}${txt ? ' ' + ALERG[k].n : ''}</span>`).join('')}</span>` : '');
function alergSeccion(p) {
  const propios = new Set(p.alergenos || []), heredados = esElaborado(p) ? new Set(alergDe({ ...p, alergenos: [] })) : new Set();
  return `<div class="rec-box"><b>Alérgenos</b> <span class="small muted">(tocá los que tiene${esElaborado(p) ? '; los de los ingredientes se suman solos' : ''})</span>
  <div class="alg-pick mt">${ALERGENOS.map(([k, i, n]) => `<label class="alg-op${propios.has(k) || heredados.has(k) ? ' on' : ''}"><input type="checkbox" data-alg="${k}" ${propios.has(k) || heredados.has(k) ? 'checked' : ''} ${heredados.has(k) ? 'disabled' : ''}> ${i} ${n}</label>`).join('')}</div></div>`;
}
const alergLeer = (box) => $$('[data-alg]', box).filter((x) => x.checked && !x.disabled).map((x) => x.dataset.alg);
document.addEventListener('change', (e) => { if (e.target.matches && e.target.matches('[data-alg]')) e.target.closest('.alg-op').classList.toggle('on', e.target.checked); });

// ================= Producción y compras de un catering =================
// Con los menús del presupuesto y las personas: qué preparar, qué ingredientes hacen falta y qué comprar.
function necesidades(items) {
  const preparar = new Map(), base = new Map(), aMano = new Map();
  const sumar = (map, k, v, extra) => { const x = map.get(k) || { ...extra, cant: 0 }; x.cant += v; map.set(k, x); };
  const explotar = (p, q, prof = 0) => {
    if (!p || prof > 5) return;
    if (esElaborado(p)) { const f = q / (Number(p.receta.rinde) || 1); p.receta.items.forEach((it) => explotar(prod(it.pid), it.cant * f, prof + 1)); }
    else sumar(base, p.id, q, { p });
  };
  (items || []).forEach((it) => {
    const m = it.menuId && menus().find((x) => x.id === it.menuId); if (!m) return;
    const pers = Number(it.c) || 0;
    (m.items || []).forEach((mi) => {
      const q = (Number(mi.cant) || 0) * pers, p = mi.pid && prod(mi.pid);
      if (p) { sumar(preparar, p.id, q, { p }); explotar(p, q); } else if (mi.d) sumar(aMano, mi.d, q, { d: mi.d });
    });
  });
  return {
    preparar: [...preparar.values()], aMano: [...aMano.values()],
    base: [...base.values()].map((x) => ({ ...x, stock: Number(x.p.stock) || 0, falta: Math.max(0, Math.round((x.cant - (Number(x.p.stock) || 0)) * 1000) / 1000) })),
  };
}
const fmtCant = (n) => fmtNum(Math.round(n * 1000) / 1000);
function produccionHTML(items) {
  const n = necesidades(items);
  if (!n.preparar.length && !n.aMano.length) return '<p class="small muted">Agregá un menú armado al presupuesto y acá aparece cuánto preparar y qué comprar.</p>';
  const faltan = n.base.filter((x) => x.falta > 0);
  return `<b>Para preparar</b><ul class="prod-lista">${n.preparar.map((x) => `<li>${fmtCant(x.cant)} × ${esc(x.p.nombre)}</li>`).join('')}${n.aMano.map((x) => `<li>${fmtCant(x.cant)} × ${esc(x.d)}</li>`).join('')}</ul>
  ${n.base.length ? `<b>Ingredientes y mercadería</b><div class="tablewrap mt"><table class="small"><thead><tr><th>Producto</th><th class="num">Hace falta</th><th class="num">En stock</th><th class="num">Comprar</th></tr></thead><tbody>${n.base.map((x) => `<tr><td>${esc(x.p.nombre)}</td><td class="num">${fmtCant(x.cant)} ${esc(x.p.unidad || '')}</td><td class="num">${fmtCant(x.stock)}</td><td class="num">${x.falta > 0 ? `<b class="c-out">${fmtCant(x.falta)} ${esc(x.p.unidad || '')}</b>` : '<span class="c-in">✔</span>'}</td></tr>`).join('')}</tbody></table></div>
  <p class="small ${faltan.length ? 'c-out' : 'c-in'}">${faltan.length ? `Hay que comprar ${faltan.length} cosa${faltan.length === 1 ? '' : 's'}.` : 'Con el stock alcanza.'}</p>` : ''}`;
}

// ================= Hoja del evento =================
const MATERIAL_TIPICO = ['Termos de café', 'Jarras de leche', 'Vasos y tazas', 'Servilletas', 'Manteles', 'Bandejas', 'Cubiertos', 'Azúcar y endulzantes', 'Hielo', 'Bolsas de basura', 'Alargue'];
const filaMat = (m = {}) => `<div class="cat-fila ma"><input class="d" placeholder="Ej: Termos de café" value="${esc(m.d || '')}"><input class="c" inputmode="decimal" placeholder="Cant." value="${m.cant ?? ''}"><label class="chk ci"><input type="checkbox" class="ida" ${m.ida ? 'checked' : ''}> Cargado</label><label class="chk cv"><input type="checkbox" class="vu" ${m.vuelta ? 'checked' : ''}> Volvió</label><button type="button" class="sm" data-rm="1" title="Quitar">✕</button></div>`;
const leerMat = (box) => $$('.cat-fila.ma', box).map((r) => ({ d: $('.d', r).value.trim(), cant: numIn($('.c', r).value) || '', ida: $('.ida', r).checked, vuelta: $('.vu', r).checked })).filter((m) => m.d);
function catHoja(c) {
  const al = alergItems(c.items), n = necesidades(c.items);
  let el = $('#catPrintArea'); if (!el) { el = document.createElement('div'); el.id = 'catPrintArea'; document.body.appendChild(el); }
  el.innerHTML = `<h1>Hoja del evento · ${esc(c.cliente)}</h1>
  <p><b>${fmtDate(c.fecha)}</b>${c.hora ? ` · evento a las <b>${esc(c.hora)}</b>` : ''}${c.armado ? ` · armado a las <b>${esc(c.armado)}</b>` : ''}${c.personas ? ` · <b>${c.personas}</b> personas` : ''}${c.tipo ? ` · ${esc(c.tipo)}` : ''}<br>
  ${c.lugar ? `<b>Dirección:</b> ${esc(c.lugar)}<br>` : ''}${c.contacto ? `<b>Contacto:</b> ${esc(c.contacto)}` : ''}</p>
  ${al.length || c.dietas ? `<div class="hoja-alerta"><b>⚠️ Alérgenos del menú:</b> ${al.length ? al.map((k) => ALERG[k].n).join(', ') : 'ninguno marcado'}${c.dietas ? `<br><b>Dietas especiales:</b> ${esc(c.dietas)}` : ''}</div>` : ''}
  ${(c.equipo || []).length ? `<h2>Personal</h2><p>${c.equipo.map((e) => `${esc((persona(e.pid) || {}).nombre || '')} de ${hhmm(e.desde)} a ${hhmm(e.hasta)}`).join(' · ')}</p>` : ''}
  <h2>Menú</h2><ul>${(c.items || []).map((i) => `<li>${fmtNum(i.c)} × ${esc(i.d)}</li>`).join('')}</ul>
  ${n.preparar.length || n.aMano.length ? `<h2>Para preparar</h2><ul>${n.preparar.map((x) => `<li>☐ ${fmtCant(x.cant)} × ${esc(x.p.nombre)}</li>`).join('')}${n.aMano.map((x) => `<li>☐ ${fmtCant(x.cant)} × ${esc(x.d)}</li>`).join('')}</ul>` : ''}
  ${(c.material || []).length ? `<h2>Material</h2><table><thead><tr><th>Qué</th><th class="num">Cant.</th><th>Cargado</th><th>Volvió</th></tr></thead><tbody>${c.material.map((m) => `<tr><td>${esc(m.d)}</td><td class="num">${m.cant || ''}</td><td>${m.ida ? '☑' : '☐'}</td><td>${m.vuelta ? '☑' : '☐'}</td></tr>`).join('')}</tbody></table>` : ''}
  ${c.notas ? `<h2>Notas</h2><p>${esc(c.notas)}</p>` : ''}`;
  document.body.classList.add('cat-print');
  setTimeout(() => { window.print(); document.body.classList.remove('cat-print'); }, 50);
}
