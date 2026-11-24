/* ============================================================
   Datos — Bloque 3
   Guarda en el teléfono una copia de los productos, el stock y los lotes,
   para poder mostrarlos aunque no haya señal. Se actualiza al conectarse.
   ============================================================ */

const Datos = (() => {
  const CLAVE = 'datos';
  let cache = leerCache();

  function leerCache() {
    try { return JSON.parse(localStorage.getItem(CLAVE)) || null; } catch (e) { return null; }
  }

  /** Pide al servidor la información más reciente y la guarda en el teléfono. */
  async function actualizar() {
    const s = Acceso.sesion();
    if (!s || !navigator.onLine) return false;
    const r = await llamarServidor('datos', { token: s.token });
    cache = {
      productos: r.productos, lotes: r.lotes, stock: r.stock,
      movimientos: r.movimientos, actualizado: r.actualizado
    };
    localStorage.setItem(CLAVE, JSON.stringify(cache));
    return true;
  }

  function hay() { return !!cache; }
  function olvidar() { cache = null; localStorage.removeItem(CLAVE); }

  // ---------- Consultas ----------
  function productos(tipo) {
    const lista = (cache && cache.productos) || [];
    return lista
      .filter((p) => p.activo !== 'no' && (!tipo || p.tipo === tipo))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }
  function producto(id) { return ((cache && cache.productos) || []).find((p) => p.id === id) || null; }
  function stock(id) { return Number(((cache && cache.stock) || {})[id] || 0); }
  function lotesDe(id) {
    return ((cache && cache.lotes) || [])
      .filter((l) => l.producto_id === id)
      .sort((a, b) => String(a.vencimiento || '9999').localeCompare(String(b.vencimiento || '9999')));
  }
  function movimientosDe(id, cuantos = 5) {
    return ((cache && cache.movimientos) || []).filter((m) => m.producto_id === id).slice(-cuantos).reverse();
  }
  function actualizado() { return cache && cache.actualizado; }

  /** Sugerencias al escribir: primero los que empiezan con el texto, luego los que lo contienen. */
  function buscar(texto, max = 6) {
    const t = normalizar(texto);
    if (!t) return [];
    const lista = productos();
    const empiezan = lista.filter((p) => normalizar(p.nombre).startsWith(t));
    const contienen = lista.filter((p) => !normalizar(p.nombre).startsWith(t) && normalizar(p.nombre).includes(t));
    return empiezan.concat(contienen).slice(0, max);
  }

  // ---------- Formato de cantidades ----------
  /** Ej.: "86 comprimidos · 2 cajas + 26" */
  function textoStock(p, unidades) {
    const n = unidades === undefined ? stock(p.id) : unidades;
    const upp = Number(p.unidades_por_presentacion);
    if (!(upp > 0) || !p.unidad_minima) return n ? n + ' unidades' : 'Sin stock';
    let texto = n + ' ' + plural(p.unidad_minima, n);
    if (upp > 1 && n >= upp) {
      const enteras = Math.floor(n / upp), resto = n % upp;
      texto += ' · ' + enteras + ' ' + plural(p.presentacion || 'presentación', enteras) + (resto ? ' + ' + resto : '');
    }
    return texto;
  }

  /** Datos que faltan para poder usar el producto. */
  function faltanDatos(p) {
    return !(Number(p.unidades_por_presentacion) > 0) || !p.unidad_minima || /^[\d.,\s]+$/.test(String(p.unidad_minima));
  }
  function bajoMinimo(p) {
    const min = Number(p.stock_minimo);
    return min > 0 && stock(p.id) < min;
  }

  return { actualizar, hay, olvidar, productos, producto, stock, lotesDe, movimientosDe, actualizado, buscar, textoStock, faltanDatos, bajoMinimo };
})();

// ---------- Ayudantes generales ----------
function normalizar(t) {
  return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function plural(palabra, n) {
  if (n === 1 || !palabra) return palabra;
  if (/[sx]$/i.test(palabra) || palabra === 'ml') return palabra;
  if (/[aeiouáéó]$/i.test(palabra)) return palabra + 's';
  return palabra + 'es';
}

/** Identificador único para cada registro (evita duplicados al reintentar). */
function nuevoId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

/** "2027-03" → "03/2027" */
function textoMes(valor) {
  const m = /^(\d{4})-(\d{2})/.exec(valor || '');
  return m ? m[2] + '/' + m[1] : (valor || '');
}

/** "2026-11-24T10:40" o "2026-11-24" → "24/11/2026" */
function textoFecha(valor) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor || '');
  return m ? m[3] + '/' + m[2] + '/' + m[1] : (valor || '');
}
