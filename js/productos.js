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
const UNIDADES_SUGERIDAS = ['comprimido', 'ml', 'ampolla', 'frasco', 'sobre', 'pipeta', 'dosis', 'tableta', 'unidad', 'par', 'kg'];
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
    <div class="dos-columnas">
      <label>Presentación<input id="${prefijo}-presentacion" list="lista-presentaciones" value="${escapar(p.presentacion || '')}" placeholder="caja, frasco…" autocomplete="off"></label>
      <label>Unidad mínima<input id="${prefijo}-unidad" list="lista-unidades" value="${escapar(p.unidad_minima || '')}" placeholder="comprimido, ml…" autocomplete="off"></label>
    </div>
    <div class="dos-columnas">
      <label>¿Cuántas trae cada presentación?<input id="${prefijo}-upp" type="number" inputmode="decimal" min="0" step="any" value="${escapar(p.unidades_por_presentacion ?? '')}"></label>
      <label>Stock mínimo (en unidad mínima)<input id="${prefijo}-minimo" type="number" inputmode="decimal" min="0" step="any" value="${escapar(p.stock_minimo ?? '')}"></label>
    </div>
    <datalist id="lista-unidades">${UNIDADES_SUGERIDAS.map((u) => `<option value="${u}">`).join('')}</datalist>
    <datalist id="lista-presentaciones">${PRESENTACIONES_SUGERIDAS.map((u) => `<option value="${u}">`).join('')}</datalist>`;
}

function leerCamposProducto(prefijo = 'cp') {
  const v = (c) => document.getElementById(prefijo + '-' + c).value.trim();
  return {
    nombre: v('nombre'), tipo: v('tipo'), categoria: v('categoria'), presentacion: v('presentacion'),
    unidad_minima: v('unidad'), unidades_por_presentacion: v('upp'), stock_minimo: v('minimo')
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
          <p class="ayuda">Ej.: caja de 30 comprimidos → presentación "caja", unidad mínima "comprimido", trae 30.</p>
          <button class="boton-principal" type="submit">Guardar</button>
          <p id="mensaje-form" class="mensaje error" role="alert"></p>
        </form>
      </main>`;
  },

  init(param) {
    const nuevo = !param || param.startsWith('nuevo');
    document.getElementById('form-producto').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const boton = ev.target.querySelector('button');
      const producto = leerCamposProducto();
      if (!nuevo) producto.id = param;
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
