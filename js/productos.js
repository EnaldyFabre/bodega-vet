/* ============================================================
   Productos — Bloque 3
   - Lista de productos (Farmacia / Bodega) con buscador y stock
   - Ficha de un producto (stock, lotes recibidos, últimos movimientos)
   - Formulario para crear o editar un producto del catálogo
   ============================================================ */

/* ---------- Lista de productos: #productos/farmacia o #productos/bodega ---------- */
PANTALLAS.productos = {
  html(tipo) {
    const t = tipo === 'bodega' ? 'Bodega' : 'Farmacia';
    return `
      ${encabezado('Productos')}
      <div class="barra-filtros">
        <div class="pestanas" role="tablist">
          <a href="#productos/farmacia" role="tab" class="${t === 'Farmacia' ? 'activa' : ''}" aria-selected="${t === 'Farmacia'}">Farmacia</a>
          <a href="#productos/bodega" role="tab" class="${t === 'Bodega' ? 'activa bodega' : ''}" aria-selected="${t === 'Bodega'}">Bodega</a>
        </div>
        <label class="buscador">${icono('buscar')}
          <input id="buscar" type="search" placeholder="Buscar producto" aria-label="Buscar producto" autocomplete="off">
        </label>
      </div>
      <main class="contenido lista">
        <div id="lista-productos"></div>
        <a href="#catalogo/nuevo-${t.toLowerCase()}" class="boton-secundario">${icono('mas')} Nuevo producto en ${t}</a>
      </main>
      ${menuInferior('productos')}`;
  },

  init(tipo) {
    const t = tipo === 'bodega' ? 'Bodega' : 'Farmacia';
    const campo = document.getElementById('buscar');
    const dibujar = () => {
      const filtro = normalizar(campo.value);
      const lista = Datos.productos(t).filter((p) => !filtro || normalizar(p.nombre).includes(filtro));
      document.getElementById('lista-productos').innerHTML = lista.length
        ? lista.map(filaProducto).join('')
        : `<p class="vacio">${Datos.hay() ? 'No hay productos que coincidan.' : 'Cargando productos… (necesitas señal la primera vez)'}</p>`;
    };
    campo.addEventListener('input', dibujar);
    dibujar();
  }
};

function filaProducto(p) {
  let etiqueta = '';
  if (Datos.faltanDatos(p)) etiqueta = '<span class="etiqueta gris">Faltan datos</span>';
  else if (Datos.bajoMinimo(p)) etiqueta = '<span class="etiqueta roja">Bajo mínimo</span>';
  return `
    <a href="#producto/${p.id}" class="fila-producto">
      <span>
        <span class="nombre">${escapar(p.nombre)}</span>
        <span class="detalle">${escapar([p.categoria, p.presentacion].filter(Boolean).join(' · '))}</span>
      </span>
      <span class="derecha">
        <span class="cantidad">${escapar(Datos.textoStock(p))}</span>
        ${etiqueta}
      </span>
    </a>`;
}

/* ---------- Ficha: #producto/P001 ---------- */
PANTALLAS.producto = {
  html(id) {
    const p = Datos.producto(id);
    if (!p) return `${encabezado('Producto', { volver: '#productos' })}<main class="contenido"><p class="vacio">No se encontró el producto.</p></main>${menuInferior('productos')}`;

    const upp = Number(p.unidades_por_presentacion);
    const lotes = Datos.lotesDe(id);
    const movs = Datos.movimientosDe(id);
    const presentacion = upp > 0
      ? `${escapar(p.presentacion || 'Presentación')} de ${upp} ${escapar(plural(p.unidad_minima, upp))}`
      : escapar(p.presentacion || '');

    return `
      ${encabezado(escapar(p.nombre), { volver: '#productos/' + p.tipo.toLowerCase(), subtitulo: escapar(p.tipo + (p.categoria ? ' · ' + p.categoria : '')) })}
      <main class="contenido">
        ${Datos.faltanDatos(p) ? `<div class="tarjeta alerta-amarilla">A este producto le faltan datos (unidad mínima y cuántas trae cada presentación). Complétalos con <strong>Editar datos</strong> o al registrar un ingreso.</div>` : ''}
        <section class="tarjeta resumen">
          <div><p class="etiqueta-dato">Stock actual</p><p class="dato-grande">${escapar(Datos.textoStock(p))}</p></div>
          <div><p class="etiqueta-dato">Stock mínimo</p><p class="dato">${p.stock_minimo !== '' && p.stock_minimo !== undefined ? escapar(p.stock_minimo + ' ' + plural(p.unidad_minima || 'unidad', Number(p.stock_minimo))) : 'Sin definir'}</p>
            ${Datos.bajoMinimo(p) ? '<span class="etiqueta roja">Bajo mínimo</span>' : ''}</div>
          <p class="detalle-presentacion">${presentacion}</p>
        </section>

        <div class="dos-botones">
          <a href="#ingreso/${p.id}" class="boton-principal enlace">Ingresar</a>
          <a href="#salida/${p.id}" class="boton-borde">Retirar</a>
        </div>
        <a href="#catalogo/${p.id}" class="boton-texto centrado">Editar datos del producto</a>

        <p class="titulo-seccion">Lotes recibidos (solo registro)</p>
        ${lotes.length ? lotes.map((l) => `
          <div class="tarjeta lote">
            <div class="fila-entre"><strong>${l.n_lote ? 'Lote ' + escapar(l.n_lote) : 'Lote sin número'}</strong><span>+${escapar(Datos.textoStock(p, Number(l.cantidad_unidades)).split(' · ')[0])}</span></div>
            <span class="detalle">${l.vencimiento ? 'Vence ' + escapar(textoMes(l.vencimiento)) : '<span class="texto-amarillo">Sin fecha de vencimiento</span>'}</span>
            <span class="detalle">${escapar(l.doc_tipo)}${l.doc_numero ? ' ' + escapar(l.doc_numero) : ''}${l.fecha_recepcion ? ' · recibido ' + escapar(textoFecha(l.fecha_recepcion)) : ''}${l.proveedor ? ' · ' + escapar(l.proveedor) : ''}</span>
          </div>`).join('') : '<p class="vacio">Todavía no hay ingresos de este producto.</p>'}

        <p class="titulo-seccion">Últimos movimientos</p>
        ${movs.length ? `<div class="tarjeta">${movs.map((m) => `
          <div class="fila-entre movimiento">
            <span>${m.tipo === 'salida' ? 'Salida' : m.tipo === 'ajuste' ? 'Ajuste' : 'Ingreso'} · ${escapar(m.usuario)} · ${escapar(textoFecha(m.fecha_hora))}</span>
            <strong class="${m.tipo === 'salida' ? 'texto-rojo' : 'texto-azul'}">${m.tipo === 'salida' ? '−' : '+'}${escapar(m.cantidad_unidades)}</strong>
          </div>`).join('')}</div>` : '<p class="vacio">Sin movimientos.</p>'}
      </main>
      ${menuInferior('productos')}`;
  }
};

/* ---------- Formulario de producto: #catalogo/P001, #catalogo/nuevo-farmacia ---------- */
const UNIDADES = ['comprimido', 'tableta', 'cápsula', 'ml', 'ampolla', 'frasco', 'pipeta', 'sobre', 'dosis', 'unidad', 'par', 'kg', 'g'];
const PRESENTACIONES_SUGERIDAS = ['caja', 'frasco', 'atomizador', 'blíster', 'bolsa', 'saco', 'dispensador', 'unidad', 'paquete'];

function camposProducto(p, prefijo = 'cp') {
  return `
    <label>Nombre<input id="${prefijo}-nombre" value="${escapar(p.nombre || '')}" required autocomplete="off"></label>
    <div class="dos-columnas">
      <label>Tipo
        <select id="${prefijo}-tipo">
          <option ${p.tipo !== 'Bodega' ? 'selected' : ''}>Farmacia</option>
          <option ${p.tipo === 'Bodega' ? 'selected' : ''}>Bodega</option>
        </select>
      </label>
      <label>Categoría<input id="${prefijo}-categoria" value="${escapar(p.categoria || '')}" placeholder="Ej.: Inyectable" autocomplete="off"></label>
    </div>
    <label>¿Cómo viene? (presentación)<input id="${prefijo}-presentacion" list="lista-presentaciones" value="${escapar(p.presentacion || '')}" placeholder="caja, frasco, atomizador…" autocomplete="off"></label>
    ${camposContenido(p, prefijo)}
    <datalist id="lista-presentaciones">${PRESENTACIONES_SUGERIDAS.map((u) => `<option value="${u}">`).join('')}</datalist>`;
}

/**
 * Campos que explican el contenido de una presentación, escritos como pregunta:
 * "¿En qué se cuenta?" (comprimido, ml…) y "¿Cuántos trae cada caja?".
 */
function camposContenido(p, prefijo, presentacion) {
  const unidad = p.unidad_minima || '';
  const conocida = UNIDADES.includes(unidad);
  const pres = presentacion || 'presentación';
  return `
    <label>¿En qué se cuenta al sacar? (la unidad más chica)
      <select id="${prefijo}-unidad-sel">
        <option value="">Elegir…</option>
        ${UNIDADES.map((u) => `<option value="${u}" ${u === unidad ? 'selected' : ''}>${u}</option>`).join('')}
        <option value="otra" ${unidad && !conocida ? 'selected' : ''}>Otra…</option>
      </select>
    </label>
    <input id="${prefijo}-unidad-otra" class="${unidad && !conocida ? '' : 'oculto-total'}" value="${conocida ? '' : escapar(unidad)}" placeholder="Escribe la unidad (ej.: óvulo)" aria-label="Otra unidad" autocomplete="off">
    <div class="dos-columnas">
      <label>¿Cuántas trae cada ${escapar(pres)}?<input id="${prefijo}-upp" type="number" inputmode="decimal" min="0" step="any" value="${escapar(p.unidades_por_presentacion ?? '')}" placeholder="Ej.: 30"></label>
      <label>Avisar si quedan menos de (opcional)<input id="${prefijo}-minimo" type="number" inputmode="decimal" min="0" step="any" value="${escapar(p.stock_minimo ?? '')}" placeholder="Ej.: 20"></label>
    </div>
    <p class="ayuda izquierda">Ej.: caja de 30 comprimidos → se cuenta en <strong>comprimido</strong> y trae <strong>30</strong>. Frasco de 100 ml → <strong>ml</strong> y <strong>100</strong>.</p>`;
}

/** Muestra el campo "Otra…" solo cuando se elige esa opción. */
function conectarContenido(prefijo) {
  const sel = document.getElementById(prefijo + '-unidad-sel');
  const otra = document.getElementById(prefijo + '-unidad-otra');
  if (!sel) return;
  sel.addEventListener('change', () => {
    otra.classList.toggle('oculto-total', sel.value !== 'otra');
    if (sel.value === 'otra') otra.focus();
  });
}

function leerUnidad(prefijo) {
  const sel = document.getElementById(prefijo + '-unidad-sel').value;
  return sel === 'otra' ? document.getElementById(prefijo + '-unidad-otra').value.trim() : sel;
}

/** Revisa que la unidad sea una palabra (no un número) y que la cantidad que trae sea mayor a cero. */
function errorContenido(unidad, upp, presentacion) {
  if (!unidad) return 'Elige en qué se cuenta (comprimido, ml, ampolla…).';
  if (/^[\d.,\s]+$/.test(unidad)) return '"En qué se cuenta" debe ser una palabra (ej.: comprimido), no un número.';
  if (!(Number(upp) > 0)) return 'Indica cuántas trae cada ' + (presentacion || 'presentación') + '.';
  return '';
}

function leerCamposProducto(prefijo = 'cp') {
  const v = (c) => document.getElementById(prefijo + '-' + c).value.trim();
  return {
    nombre: v('nombre'), tipo: v('tipo'), categoria: v('categoria'), presentacion: v('presentacion'),
    unidad_minima: leerUnidad(prefijo), unidades_por_presentacion: v('upp'), stock_minimo: v('minimo')
  };
}

PANTALLAS.catalogo = {
  html(param) {
    const nuevo = !param || param.startsWith('nuevo');
    const p = nuevo ? { tipo: param === 'nuevo-bodega' ? 'Bodega' : 'Farmacia' } : (Datos.producto(param) || {});
    const volver = nuevo ? '#productos/' + p.tipo.toLowerCase() : '#producto/' + param;
    return `
      ${encabezado(nuevo ? 'Nuevo producto' : 'Editar producto', { volver })}
      <main class="contenido">
        <form id="form-producto" class="formulario">
          ${camposProducto(p)}
          <button class="boton-principal" type="submit">Guardar</button>
          <p id="mensaje-form" class="mensaje error" role="alert"></p>
        </form>
      </main>`;
  },

  init(param) {
    const nuevo = !param || param.startsWith('nuevo');
    conectarContenido('cp');
    document.getElementById('form-producto').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const boton = ev.target.querySelector('button[type=submit]');
      const producto = leerCamposProducto();
      if (!nuevo) producto.id = param;
      // Los datos de contenido son opcionales al crear, pero si se llenan deben tener sentido.
      if (producto.unidad_minima || producto.unidades_por_presentacion) {
        const error = errorContenido(producto.unidad_minima, producto.unidades_por_presentacion, producto.presentacion);
        if (error) { document.getElementById('mensaje-form').textContent = error; return; }
      }
      boton.disabled = true; boton.textContent = 'Guardando…';
      try {
        const r = await llamarServidor('guardarProducto', { token: Acceso.sesion().token, producto });
        await Datos.actualizar();
        aviso('Producto guardado');
        location.hash = '#producto/' + r.producto.id;
      } catch (e) {
        document.getElementById('mensaje-form').textContent = e.message;
        boton.disabled = false; boton.textContent = 'Guardar';
      }
    });
  }
};
