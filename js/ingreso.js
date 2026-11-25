/* ============================================================
   Registrar ingreso — Bloque 3
   Un documento (Factura, Boleta, Sin documento o Inventario inicial)
   con una o varias líneas de productos. Cada línea crea un lote.
   El borrador se guarda en el teléfono: si se cierra la app, no se pierde.
   ============================================================ */

const TIPOS_DOCUMENTO = ['Factura', 'Boleta', 'Sin documento', 'Inventario inicial'];

const Ingreso = (() => {
  const CLAVE = 'borradorIngreso';
  let e = cargar();
  let archivos = []; // fotos o PDF elegidos para adjuntar (solo en memoria, no en el borrador)

  function hoy() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function vacio() {
    return { tipo: 'Factura', n_documento: '', fecha: hoy(), proveedor: '', lineas: [], completados: {}, editor: editorVacio() };
  }
  function editorVacio() {
    return { texto: '', producto_id: null, cant: '', sueltas: '', n_lote: '', venc: '', creando: false };
  }
  function cargar() {
    try { return JSON.parse(localStorage.getItem(CLAVE)) || vacio(); } catch (x) { return vacio(); }
  }
  function guardarBorrador() { localStorage.setItem(CLAVE, JSON.stringify(e)); }
  function borrarBorrador() { e = vacio(); localStorage.removeItem(CLAVE); }

  /** Producto con los datos que se completaron en este ingreso (si faltaban). */
  function datosProducto(id) {
    const p = Datos.producto(id);
    return p ? Object.assign({}, p, e.completados[id] || {}) : null;
  }
  const esInventario = () => e.tipo === 'Inventario inicial';

  // ---------- Dibujo ----------
  function html(param) {
    // Si se llega desde la ficha de un producto (#ingreso/P001), queda elegido.
    if (param && Datos.producto(param) && !e.editor.producto_id && !e.lineas.length) {
      e.editor = editorVacio(); e.editor.producto_id = param; guardarBorrador();
    }
    return `
      ${encabezado('Registrar ingreso', { volver: '#inicio' })}
      <main class="contenido" id="ingreso"></main>`;
  }

  function dibujar() {
    const caja = document.getElementById('ingreso');
    if (!caja) return;
    caja.innerHTML = `
      <div class="chips" role="radiogroup" aria-label="Tipo de documento">
        ${TIPOS_DOCUMENTO.map((t) => `<button type="button" class="chip ${e.tipo === t ? 'activo' : ''}" data-tipo="${t}" role="radio" aria-checked="${e.tipo === t}">${t}</button>`).join('')}
      </div>
      ${seccionDocumento()}
      <p class="titulo-seccion">Productos de este ingreso (${e.lineas.length})</p>
      ${e.lineas.map(filaLinea).join('')}
      ${seccionEditor()}
      ${esInventario() ? '' : `
      <section class="tarjeta formulario">
        <p class="titulo-seccion" style="margin:0">Adjuntar ${e.tipo === 'Sin documento' ? 'documento' : e.tipo.toLowerCase()} (opcional)</p>
        ${archivos.length ? archivos.map((a, i) => `<div class="fila-entre"><span class="detalle">📎 ${escapar(a.name || 'foto')}</span><button type="button" class="boton-texto" data-quitar-archivo="${i}">Quitar</button></div>`).join('') : ''}
        ${botonesAdjuntar('ingreso')}
        <p class="ayuda izquierda">Se sube junto con el ingreso (necesita señal). También puedes agregarlo después desde Documentos.</p>
      </section>`}
      <p id="mensaje-ingreso" class="mensaje error" role="alert"></p>
      <button type="button" class="boton-principal" id="guardar-ingreso" ${e.lineas.length ? '' : 'disabled'}>
        Guardar ingreso${e.lineas.length ? ' (' + e.lineas.length + ' producto' + (e.lineas.length > 1 ? 's' : '') + ')' : ''}
      </button>
      ${e.lineas.length || e.n_documento || e.proveedor ? '<button type="button" class="boton-texto centrado" id="descartar">Descartar este ingreso</button>' : ''}
      <p class="ayuda">Fecha, hora y usuario se registran solos.</p>`;
    conectar();
  }

  function seccionDocumento() {
    if (esInventario()) {
      return `<div class="tarjeta alerta-amarilla">Se carga en el documento <strong>Inventario inicial</strong>. El N° de lote y el vencimiento son opcionales: pueden completarse después.</div>`;
    }
    const conNumero = e.tipo === 'Factura' || e.tipo === 'Boleta';
    return `
      <section class="tarjeta formulario">
        ${conNumero ? `<label>N° de ${e.tipo.toLowerCase()}<input data-campo="n_documento" value="${escapar(e.n_documento)}" inputmode="numeric" autocomplete="off"></label>` : ''}
        <div class="dos-columnas">
          <label>Fecha de llegada<input type="date" data-campo="fecha" value="${escapar(e.fecha)}"></label>
          <label>${conNumero ? 'Proveedor' : 'Origen (opcional)'}<input data-campo="proveedor" value="${escapar(e.proveedor)}" autocomplete="off" placeholder="${conNumero ? 'Empresa' : 'Ej.: donación'}"></label>
        </div>
      </section>`;
  }

  function filaLinea(l, i) {
    const p = datosProducto(l.producto_id) || { nombre: '?' };
    const cantidad = [l.cant ? l.cant + ' ' + plural(p.presentacion || 'presentación', Number(l.cant)) : '', l.sueltas ? l.sueltas + ' ' + plural(p.unidad_minima || 'unidad', Number(l.sueltas)) + ' sueltos' : ''].filter(Boolean).join(' + ');
    return `
      <div class="tarjeta linea">
        <div class="fila-entre"><strong>${escapar(p.nombre)}</strong><button type="button" class="boton-texto" data-quitar="${i}" aria-label="Quitar ${escapar(p.nombre)}">Quitar</button></div>
        <span class="detalle">${escapar(cantidad)}${l.n_lote ? ' · lote ' + escapar(l.n_lote) : ''}${l.venc ? ' · vence ' + escapar(textoMes(l.venc)) : ''}</span>
      </div>`;
  }

  function seccionEditor() {
    const ed = e.editor;
    if (ed.creando) {
      return `
        <section class="tarjeta formulario editor" id="editor">
          <p class="titulo-seccion" style="margin:0">Producto nuevo</p>
          ${camposProducto({ nombre: ed.texto, tipo: 'Farmacia' }, 'np')}
          <button type="button" class="boton-principal" id="crear-producto">Crear producto</button>
          <button type="button" class="boton-texto centrado" id="cancelar-crear">Cancelar</button>
        </section>`;
    }
    if (!ed.producto_id) {
      return `
        <section class="tarjeta formulario editor" id="editor">
          <label>Agregar producto
            <input id="buscar-producto" value="${escapar(ed.texto)}" placeholder="Escribe el nombre…" autocomplete="off">
          </label>
          <div id="sugerencias" class="sugerencias"></div>
        </section>`;
    }
    const p = datosProducto(ed.producto_id);
    const falta = Datos.faltanDatos(p);
    const obligatorio = p.tipo === 'Farmacia' && !esInventario();
    const upp = Number(p.unidades_por_presentacion);
    return `
      <section class="tarjeta formulario editor" id="editor">
        <div class="fila-entre"><strong>${escapar(p.nombre)}</strong><button type="button" class="boton-texto" id="cambiar-producto">Cambiar</button></div>
        ${falta ? `
          <div class="alerta-amarilla">Faltan datos de este producto. Complétalos una vez y quedan guardados.</div>
          ${camposContenido(p, 'c', p.presentacion)}`
        : `<span class="detalle">${escapar(p.presentacion || '')}${upp ? ' de ' + upp + ' ' + escapar(plural(p.unidad_minima, upp)) : ''}</span>`}
        <div class="dos-columnas">
          <label>Cantidad (${escapar(plural(p.presentacion || 'presentación', 2))})<input data-ed="cant" type="number" inputmode="numeric" min="0" step="1" value="${escapar(ed.cant)}"></label>
          <label>Sueltos${p.unidad_minima ? ' (' + escapar(plural(p.unidad_minima, 2)) + ')' : ''}, opcional<input data-ed="sueltas" type="number" inputmode="decimal" min="0" step="any" value="${escapar(ed.sueltas)}"></label>
        </div>
        <div class="dos-columnas">
          <label>N° de lote${obligatorio ? ' *' : ''}<input data-ed="n_lote" value="${escapar(ed.n_lote)}" autocomplete="off"></label>
          <label>Vencimiento${obligatorio ? ' *' : ''}<input data-ed="venc" type="month" value="${escapar(ed.venc)}"></label>
        </div>
        ${obligatorio ? '<p class="ayuda izquierda">* Obligatorios en Farmacia.</p>' : ''}
        <p id="mensaje-linea" class="mensaje error" role="alert"></p>
        <button type="button" class="boton-borde" id="agregar-linea">${icono('mas')} Agregar a la lista</button>
      </section>`;
  }

  function dibujarSugerencias() {
    const caja = document.getElementById('sugerencias');
    if (!caja) return;
    const texto = e.editor.texto;
    const lista = Datos.buscar(texto);
    caja.innerHTML = !texto ? '' : `
      ${lista.map((p) => `<button type="button" class="sugerencia" data-elegir="${p.id}">${resaltar(p.nombre, texto)} <span class="detalle">· ${escapar(p.tipo)}${p.presentacion ? ' · ' + escapar(p.presentacion) : ''}</span></button>`).join('')}
      <button type="button" class="sugerencia crear" id="nuevo-producto">${icono('mas')} Crear "${escapar(texto)}" como producto nuevo</button>`;
    caja.querySelectorAll('[data-elegir]').forEach((b) => b.addEventListener('click', () => {
      e.editor.producto_id = b.dataset.elegir; guardarBorrador(); dibujar();
    }));
    const nuevo = document.getElementById('nuevo-producto');
    if (nuevo) nuevo.addEventListener('click', () => { e.editor.creando = true; guardarBorrador(); dibujar(); });
  }

  function resaltar(nombre, texto) {
    const i = normalizar(nombre).indexOf(normalizar(texto));
    if (i < 0) return escapar(nombre);
    return escapar(nombre.slice(0, i)) + '<strong>' + escapar(nombre.slice(i, i + texto.length)) + '</strong>' + escapar(nombre.slice(i + texto.length));
  }

  // ---------- Acciones ----------
  function conectar() {
    document.querySelectorAll('[data-tipo]').forEach((b) => b.addEventListener('click', () => {
      e.tipo = b.dataset.tipo; guardarBorrador(); dibujar();
    }));
    document.querySelectorAll('[data-campo]').forEach((c) => c.addEventListener('input', () => {
      e[c.dataset.campo] = c.value; guardarBorrador();
    }));
    document.querySelectorAll('[data-ed]').forEach((c) => c.addEventListener('input', () => {
      e.editor[c.dataset.ed] = c.value; guardarBorrador();
    }));
    document.querySelectorAll('[data-quitar]').forEach((b) => b.addEventListener('click', () => {
      e.lineas.splice(Number(b.dataset.quitar), 1); guardarBorrador(); dibujar();
    }));

    const buscar = document.getElementById('buscar-producto');
    if (buscar) {
      buscar.addEventListener('input', () => { e.editor.texto = buscar.value; guardarBorrador(); dibujarSugerencias(); });
      dibujarSugerencias();
    }
    const cambiar = document.getElementById('cambiar-producto');
    if (cambiar) cambiar.addEventListener('click', () => { e.editor = editorVacio(); guardarBorrador(); dibujar(); });

    conectarContenido('c');
    conectarContenido('np');
    const agregar = document.getElementById('agregar-linea');
    if (agregar) agregar.addEventListener('click', agregarLinea);

    const crear = document.getElementById('crear-producto');
    if (crear) crear.addEventListener('click', crearProducto);
    const cancelar = document.getElementById('cancelar-crear');
    if (cancelar) cancelar.addEventListener('click', () => { e.editor.creando = false; guardarBorrador(); dibujar(); });

    document.querySelectorAll('[data-adjuntar]').forEach((input) => input.addEventListener('change', () => {
      archivos = archivos.concat(Array.from(input.files)); dibujar();
    }));
    document.querySelectorAll('[data-quitar-archivo]').forEach((b) => b.addEventListener('click', () => {
      archivos.splice(Number(b.dataset.quitarArchivo), 1); dibujar();
    }));
    document.getElementById('guardar-ingreso').addEventListener('click', guardarIngreso);
    const descartar = document.getElementById('descartar');
    if (descartar) descartar.addEventListener('click', () => {
      if (descartar.dataset.seguro) { borrarBorrador(); dibujar(); return; }
      descartar.dataset.seguro = '1';
      descartar.textContent = 'Toca otra vez para borrar todo lo anotado';
    });
  }

  function agregarLinea() {
    const ed = e.editor;
    const error = (t) => { document.getElementById('mensaje-linea').textContent = t; };
    let p = datosProducto(ed.producto_id);

    // Si faltaban datos del producto, se toman del formulario.
    if (Datos.faltanDatos(p)) {
      const completar = {
        unidad_minima: leerUnidad('c'),
        unidades_por_presentacion: document.getElementById('c-upp').value.trim(),
        stock_minimo: document.getElementById('c-minimo').value.trim()
      };
      const problema = errorContenido(completar.unidad_minima, completar.unidades_por_presentacion, p.presentacion);
      if (problema) return error(problema);
      e.completados[p.id] = completar;
      p = datosProducto(p.id);
    }

    const cant = Number(ed.cant) || 0, sueltas = Number(ed.sueltas) || 0;
    if (cant < 0 || sueltas < 0 || cant + sueltas <= 0) return error('Indica la cantidad que llegó.');
    if (!Number.isInteger(cant)) return error('La cantidad de ' + plural(p.presentacion || 'presentación', 2) + ' debe ser un número entero. Usa "sueltos" para el resto.');
    if (p.tipo === 'Farmacia' && !esInventario() && (!ed.n_lote.trim() || !ed.venc)) return error('En Farmacia, el N° de lote y el vencimiento son obligatorios.');

    e.lineas.push({
      id_mov: nuevoId(), producto_id: p.id,
      cant: cant || '', sueltas: sueltas || '',
      n_lote: ed.n_lote.trim(), venc: ed.venc
    });
    e.editor = editorVacio();
    guardarBorrador();
    dibujar();
    aviso(p.nombre + ' agregado a la lista');
  }

  async function crearProducto() {
    const boton = document.getElementById('crear-producto');
    const producto = leerCamposProducto('np');
    boton.disabled = true; boton.textContent = 'Creando…';
    try {
      const r = await llamarServidor('guardarProducto', { token: Acceso.sesion().token, producto });
      await Datos.actualizar();
      e.editor = editorVacio(); e.editor.producto_id = r.producto.id;
      guardarBorrador(); dibujar();
      aviso('Producto creado');
    } catch (x) {
      boton.disabled = false; boton.textContent = 'Crear producto';
      aviso(navigator.onLine ? x.message : 'Crear un producto nuevo necesita señal. Anótalo y créalo al subir a la oficina.', 'error');
    }
  }

  async function guardarIngreso() {
    const boton = document.getElementById('guardar-ingreso');
    const mensaje = document.getElementById('mensaje-ingreso');
    if ((e.tipo === 'Factura' || e.tipo === 'Boleta') && !String(e.n_documento).trim()) {
      mensaje.textContent = 'Falta el N° de ' + e.tipo.toLowerCase() + '.';
      return;
    }
    boton.disabled = true; boton.textContent = 'Guardando…';
    try {
      const lineas = e.lineas.length;
      const r = await Cola.enviar('registrarIngreso', {
        id_dispositivo: idDispositivo(),
        documento: { tipo: e.tipo, n_documento: e.n_documento, fecha_recepcion: e.fecha, proveedor: e.proveedor },
        lineas: e.lineas.map((l) => ({
          id_mov: l.id_mov, producto_id: l.producto_id,
          cantidad_presentaciones: l.cant || 0, unidades_sueltas: l.sueltas || 0,
          n_lote: l.n_lote, vencimiento: l.venc,
          completar: e.completados[l.producto_id] || null
        }))
      }, 'Ingreso (' + e.tipo + (e.n_documento ? ' ' + e.n_documento : '') + '): ' + lineas + ' producto' + (lineas > 1 ? 's' : ''));
      borrarBorrador();
      // Adjuntos: se suben al documento recién creado (si se guardó con señal).
      let fallaron = 0;
      if (archivos.length && !r.enCola && r.resultado && r.resultado.documento_id) {
        boton.textContent = 'Subiendo adjuntos…';
        for (const a of archivos) {
          try { await Adjuntos.subir(r.resultado.documento_id, a); } catch (x) { fallaron++; }
        }
      } else if (archivos.length) {
        fallaron = archivos.length;
      }
      archivos = [];
      if (!r.enCola) await Datos.actualizar().catch(() => {});
      if (fallaron) setTimeout(() => aviso(fallaron + ' adjunto(s) no se subieron. Agrégalos desde Inicio → Documentos de compra.', 'error'), 3600);
      aviso(r.enCola ? 'Sin señal: ingreso guardado en el teléfono. Se subirá solo.' : 'Ingreso guardado (' + lineas + ' producto' + (lineas > 1 ? 's' : '') + ')');
      location.hash = '#inicio';
    } catch (x) {
      // El borrador queda guardado: se puede reintentar al tener señal.
      mensaje.textContent = x.message;
      boton.disabled = false; boton.textContent = 'Guardar ingreso';
    }
  }

  return { html, init: dibujar };
})();

PANTALLAS.ingreso = Ingreso;

/** Identifica este teléfono en los registros (no es un dato personal). */
function idDispositivo() {
  let id = localStorage.getItem('idDispositivo');
  if (!id) { id = nuevoId(); localStorage.setItem('idDispositivo', id); }
  return id;
}
