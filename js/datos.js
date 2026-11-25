/* ============================================================
   Datos — Bloques 3 y 4
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
      movimientos: r.movimientos, tutores: r.tutores || [], documentos: r.documentos || [], actualizado: r.actualizado
    };
    // Lo que todavía está en la cola (sin subir) se vuelve a reflejar encima de los datos nuevos.
    leerCola().forEach((x) => aplicarLocal(x.accion, x.datos, false));
    guardarCache();
    return true;
  }

  function guardarCache() { localStorage.setItem(CLAVE, JSON.stringify(cache)); }
  function leerCola() {
    try { return JSON.parse(localStorage.getItem('cola')) || []; } catch (e) { return []; }
  }

  /**
   * Refleja en la app un registro hecho sin señal (stock, lotes, movimientos, tutores),
   * para que todo se vea al día aunque todavía no se haya subido.
   */
  function aplicarLocal(accion, d, guardar = true) {
    if (!cache) return;
    const usuario = (Acceso.usuario() || {}).nombre || '';
    cache.stock = cache.stock || {};
    cache.movimientos = cache.movimientos || [];

    if (accion === 'registrarSalida') {
      const s = d.salida;
      if (cache.movimientos.some((m) => m.id === s.id_mov)) return;
      let tutorId = '';
      if (s.tutor && s.tutor.rut) {
        cache.tutores = cache.tutores || [];
        let t = tutorPorRut(s.tutor.rut);
        if (t) Object.assign(t, { nombre: s.tutor.nombre, direccion: s.tutor.direccion, telefono: s.tutor.telefono });
        else {
          t = { id: 'pend-' + limpiarRut(s.tutor.rut), rut: formatearRut(s.tutor.rut), nombre: s.tutor.nombre, direccion: s.tutor.direccion, telefono: s.tutor.telefono };
          cache.tutores.push(t);
        }
        tutorId = t.id;
      }
      cache.stock[s.producto_id] = (cache.stock[s.producto_id] || 0) - Number(s.cantidad_unidades);
      cache.movimientos.push({ id: s.id_mov, fecha_hora: ahoraLocal(), producto_id: s.producto_id, tipo: 'salida', cantidad_unidades: Number(s.cantidad_unidades), usuario, tutor_id: tutorId, especie: s.especie, pendiente: true });
    }

    if (accion === 'registrarIngreso') {
      const doc = d.documento || {};
      d.lineas.forEach((l) => {
        if (cache.movimientos.some((m) => m.id === l.id_mov)) return;
        const p = producto(l.producto_id);
        if (!p) return;
        if (l.completar) Object.assign(p, l.completar);
        const total = (Number(l.cantidad_presentaciones) || 0) * Number(p.unidades_por_presentacion) + (Number(l.unidades_sueltas) || 0);
        cache.stock[p.id] = (cache.stock[p.id] || 0) + total;
        cache.lotes.push({ id: 'pend-' + l.id_mov, producto_id: p.id, cantidad_presentaciones: l.cantidad_presentaciones, cantidad_unidades: total, n_lote: l.n_lote, vencimiento: l.vencimiento, alerta_revisada: 'no', doc_tipo: doc.tipo, doc_numero: doc.n_documento, fecha_recepcion: doc.fecha_recepcion, proveedor: doc.proveedor, pendiente: true });
        cache.movimientos.push({ id: l.id_mov, fecha_hora: ahoraLocal(), producto_id: p.id, tipo: 'ingreso', cantidad_unidades: total, usuario, pendiente: true });
      });
    }

    if (accion === 'actualizarLote') {
      const lote = (cache.lotes || []).find((x) => x.id === d.lote.id);
      if (lote) Object.assign(lote, d.lote);
    }

    if (guardar) guardarCache();
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
  function lotes() { return (cache && cache.lotes) || []; }
  function documentos() {
    return ((cache && cache.documentos) || []).slice().sort((a, b) => String(b.id).localeCompare(String(a.id)));
  }
  function documento(id) { return ((cache && cache.documentos) || []).find((d) => d.id === id) || null; }
  function movimientos() { return ((cache && cache.movimientos) || []).slice().reverse(); }

  // ---------- Tutores ----------
  function tutores() {
    return ((cache && cache.tutores) || []).slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }
  function tutor(id) { return ((cache && cache.tutores) || []).find((t) => t.id === id) || null; }
  function tutorPorRut(rut) {
    const limpio = limpiarRut(rut);
    return ((cache && cache.tutores) || []).find((t) => limpiarRut(t.rut) === limpio) || null;
  }

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

  return { actualizar, aplicarLocal, lotes, documentos, documento, hay, olvidar, productos, producto, stock, lotesDe, movimientosDe, movimientos, actualizado, buscar, textoStock, faltanDatos, bajoMinimo, tutores, tutor, tutorPorRut };
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

/* ---------- RUT ---------- */
/** "12.345.678-5" → "123456785" */
function limpiarRut(rut) { return String(rut || '').replace(/[^0-9kK]/g, '').toUpperCase(); }

/** Revisa el dígito verificador del RUT (módulo 11). */
function rutValido(rut) {
  const r = limpiarRut(rut);
  if (!/^\d{7,8}[0-9K]$/.test(r)) return false;
  let suma = 0, factor = 2;
  for (let i = r.length - 2; i >= 0; i--) {
    suma += Number(r[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  const dv = resto === 11 ? '0' : resto === 10 ? 'K' : String(resto);
  return dv === r.slice(-1);
}

/** "123456785" → "12.345.678-5" */
function formatearRut(rut) {
  const r = limpiarRut(rut);
  if (r.length < 2) return r;
  return r.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + r.slice(-1);
}

/** "2026-11-24T10:40" → "10:40" */
function textoHora(valor) {
  const m = /T(\d{2}:\d{2})/.exec(valor || '');
  return m ? m[1] : '';
}

/** Fecha y hora actual en formato "2026-11-24T17:30" (hora del teléfono). */
function ahoraLocal() {
  const d = new Date(), dos = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + dos(d.getMonth() + 1) + '-' + dos(d.getDate()) + 'T' + dos(d.getHours()) + ':' + dos(d.getMinutes());
}
