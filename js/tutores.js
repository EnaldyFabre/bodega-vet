/* ============================================================
   Tutores e Historial — Bloque 4
   - #tutores: buscar tutores por RUT o nombre
   - #tutor/T00001: corregir datos y ver sus entregas
   - #historial: todos los movimientos, con filtros
   ============================================================ */

/** Ej.: "4 comprimidos" */
function cantidadTexto(productoId, n) {
  const p = Datos.producto(productoId);
  const num = Number(n) || 0;
  return num + ' ' + plural((p && p.unidad_minima) || 'unidad', num);
}

/* ---------- Lista de tutores ---------- */
PANTALLAS.tutores = {
  html() {
    return `
      ${encabezado('Tutores')}
      <div class="barra-filtros">
        <label class="buscador">${icono('buscar')}
          <input id="buscar" type="search" placeholder="Buscar por RUT o nombre" aria-label="Buscar tutor" autocomplete="off">
        </label>
      </div>
      <main class="contenido lista"><div id="lista-tutores"></div>
        <p class="ayuda">Los tutores se crean al registrar una salida. Datos privados: solo los ven ustedes tres.</p>
      </main>
      ${menuInferior('tutores')}`;
  },
  init() {
    const campo = document.getElementById('buscar');
    const entregas = {};
    Datos.movimientos().forEach((m) => { if (m.tutor_id) entregas[m.tutor_id] = (entregas[m.tutor_id] || 0) + 1; });
    const dibujar = () => {
      const t = normalizar(campo.value), r = limpiarRut(campo.value);
      const lista = Datos.tutores().filter((x) => !t || normalizar(x.nombre).includes(t) || (r && limpiarRut(x.rut).includes(r)));
      document.getElementById('lista-tutores').innerHTML = lista.length ? lista.map((x) => `
        <a href="#tutor/${x.id}" class="fila-producto">
          <span><span class="nombre">${escapar(x.nombre)}</span>
            <span class="detalle">RUT ${escapar(x.rut)}${x.telefono ? ' · ' + escapar(x.telefono) : ''}</span>
            ${x.direccion ? `<span class="detalle">${escapar(x.direccion)}</span>` : ''}</span>
          <span class="derecha"><span class="detalle">${entregas[x.id] || 0} entrega${entregas[x.id] === 1 ? '' : 's'}</span></span>
        </a>`).join('') : `<p class="vacio">${Datos.tutores().length ? 'No hay tutores que coincidan.' : 'Todavía no hay tutores registrados.'}</p>`;
    };
    campo.addEventListener('input', dibujar);
    dibujar();
  }
};

/* ---------- Ficha de tutor ---------- */
PANTALLAS.tutor = {
  html(id) {
    const t = Datos.tutor(id);
    if (!t) return `${encabezado('Tutor', { volver: '#tutores' })}<main class="contenido"><p class="vacio">No se encontró el tutor.</p></main>${menuInferior('tutores')}`;
    const entregas = Datos.movimientos().filter((m) => m.tutor_id === id);
    return `
      ${encabezado(escapar(t.nombre), { volver: '#tutores', subtitulo: 'RUT ' + escapar(t.rut) })}
      <main class="contenido">
        <form id="form-tutor" class="tarjeta formulario">
          <label>Nombre<input id="t-nombre" value="${escapar(t.nombre)}" required autocomplete="off"></label>
          <label>Dirección<input id="t-direccion" value="${escapar(t.direccion)}" autocomplete="off"></label>
          <label>Teléfono<input id="t-telefono" type="tel" value="${escapar(t.telefono)}" autocomplete="off"></label>
          <button class="boton-principal" type="submit">Guardar cambios</button>
          <p id="mensaje-tutor" class="mensaje error" role="alert"></p>
        </form>
        <p class="titulo-seccion">Entregas (${entregas.length})</p>
        ${entregas.length ? `<div class="tarjeta">${entregas.map((m) => {
          const p = Datos.producto(m.producto_id);
          return `<div class="fila-entre movimiento">
            <span><strong>${escapar(p ? p.nombre : m.producto_id)}</strong><span class="detalle">${escapar(textoFecha(m.fecha_hora))} · ${escapar(m.especie || '')} · ${escapar(m.usuario)}</span></span>
            <span class="texto-rojo">${escapar(cantidadTexto(m.producto_id, m.cantidad_unidades))}</span></div>`;
        }).join('')}</div>` : '<p class="vacio">Sin entregas registradas.</p>'}
      </main>
      ${menuInferior('tutores')}`;
  },
  init(id) {
    const form = document.getElementById('form-tutor');
    if (!form) return;
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const boton = form.querySelector('button');
      const t = Datos.tutor(id);
      boton.disabled = true; boton.textContent = 'Guardando…';
      try {
        await llamarServidor('guardarTutor', {
          token: Acceso.sesion().token,
          tutor: { rut: t.rut, nombre: document.getElementById('t-nombre').value, direccion: document.getElementById('t-direccion').value, telefono: document.getElementById('t-telefono').value }
        });
        await Datos.actualizar();
        aviso('Datos del tutor guardados');
        mostrarPantalla();
      } catch (e) {
        document.getElementById('mensaje-tutor').textContent = e.message;
        boton.disabled = false; boton.textContent = 'Guardar cambios';
      }
    });
  }
};

/* ---------- Historial: #historial, #historial/salidas, #historial/ingresos ---------- */
PANTALLAS.historial = {
  html(filtro) {
    const f = ['ingresos', 'salidas'].includes(filtro) ? filtro : 'todos';
    const opcion = (id, texto) => `<a href="#historial/${id}" class="${f === id ? 'activa' : ''}">${texto}</a>`;
    return `
      ${encabezado('Historial')}
      <div class="barra-filtros">
        <div class="pestanas tres">${opcion('todos', 'Todos')}${opcion('ingresos', 'Ingresos')}${opcion('salidas', 'Salidas')}</div>
        <label class="buscador">${icono('buscar')}
          <input id="buscar" type="search" placeholder="Producto, tutor o usuario" aria-label="Buscar en el historial" autocomplete="off">
        </label>
      </div>
      <main class="contenido lista"><div id="lista-historial"></div></main>
      ${menuInferior('historial')}`;
  },
  init(filtro) {
    const f = ['ingresos', 'salidas'].includes(filtro) ? filtro : 'todos';
    const campo = document.getElementById('buscar');
    const dibujar = () => {
      const texto = normalizar(campo.value);
      const filas = Datos.movimientos().filter((m) => {
        if (f === 'ingresos' && m.tipo !== 'ingreso') return false;
        if (f === 'salidas' && m.tipo !== 'salida') return false;
        if (!texto) return true;
        const p = Datos.producto(m.producto_id), t = m.tutor_id ? Datos.tutor(m.tutor_id) : null;
        return [p && p.nombre, t && t.nombre, m.usuario].some((x) => normalizar(x).includes(texto));
      }).slice(0, 200);

      let fecha = '';
      document.getElementById('lista-historial').innerHTML = filas.length ? filas.map((m) => {
        const p = Datos.producto(m.producto_id), t = m.tutor_id ? Datos.tutor(m.tutor_id) : null;
        const dia = textoFecha(m.fecha_hora);
        const titulo = dia !== fecha ? `<p class="titulo-seccion">${escapar(dia)}</p>` : '';
        fecha = dia;
        const salida = m.tipo === 'salida';
        const detalle = [salida ? 'Salida' : m.tipo === 'ajuste' ? 'Ajuste' : 'Ingreso', m.usuario, textoHora(m.fecha_hora), m.especie, t && t.nombre].filter(Boolean).join(' · ');
        return `${titulo}
          <a href="#producto/${m.producto_id}" class="fila-producto">
            <span><span class="nombre">${escapar(p ? p.nombre : m.producto_id)}</span><span class="detalle">${escapar(detalle)}</span></span>
            <span class="derecha"><span class="cantidad ${salida ? 'texto-rojo' : 'texto-azul'}">${salida ? '−' : '+'}${escapar(cantidadTexto(m.producto_id, m.cantidad_unidades))}</span></span>
          </a>`;
      }).join('') : '<p class="vacio">No hay movimientos que mostrar.</p>';
    };
    campo.addEventListener('input', dibujar);
    dibujar();
  }
};
