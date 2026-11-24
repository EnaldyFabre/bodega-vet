/* ============================================================
   Registrar salida — Bloque 4
   Producto → cantidad (sueltos o presentación completa) → ¿a quién se entrega?
   Se descuenta del stock común (no se elige lote).
   ============================================================ */

const Salida = (() => {
  let e = nuevo();

  function nuevo(productoId = null) {
    return {
      id_mov: nuevoId(),          // se mantiene si hay que reintentar, para no duplicar
      producto_id: productoId, texto: '', modo: 'sueltos', cant: '',
      entrega: true, rut: '', nombre: '', direccion: '', telefono: '', especie: '', obs: '',
      confirmarStock: false
    };
  }

  function html(param) {
    if (param && Datos.producto(param) && e.producto_id !== param) e = nuevo(param);
    return `
      ${encabezado('Registrar salida', { volver: param ? '#producto/' + param : '#inicio' })}
      <main class="contenido" id="salida"></main>`;
  }

  function dibujar() {
    const caja = document.getElementById('salida');
    if (!caja) return;
    const p = e.producto_id ? Datos.producto(e.producto_id) : null;
    caja.innerHTML = `
      ${seccionProducto(p)}
      ${p && !Datos.faltanDatos(p) ? seccionCantidad(p) + seccionEntrega() + `
        <label class="formulario-suelto">Observación (opcional)
          <textarea data-campo="obs" rows="2">${escapar(e.obs)}</textarea>
        </label>
        <p id="mensaje-salida" class="mensaje error" role="alert"></p>
        <button type="button" class="boton-principal" id="confirmar-salida">${e.confirmarStock ? 'Registrar igual' : 'Confirmar salida'}</button>
        <p class="ayuda">Se descuenta del stock común. Fecha, hora y usuario se registran solos.</p>` : ''}`;
    conectar();
  }

  function seccionProducto(p) {
    if (!p) {
      return `
        <section class="tarjeta formulario editor">
          <label>Producto<input id="buscar-producto" value="${escapar(e.texto)}" placeholder="Escribe el nombre…" autocomplete="off"></label>
          <div id="sugerencias" class="sugerencias"></div>
        </section>`;
    }
    return `
      <section class="tarjeta formulario">
        <div class="fila-entre"><strong>${escapar(p.nombre)}</strong><button type="button" class="boton-texto" id="cambiar-producto">Cambiar</button></div>
        <span class="detalle">Stock registrado: ${escapar(Datos.textoStock(p))}</span>
        ${Datos.faltanDatos(p) ? `<div class="alerta-amarilla">A este producto le faltan datos (en qué se cuenta y cuántas trae). <a href="#catalogo/${p.id}" class="enlace-texto">Complétalos aquí</a> antes de registrar la salida.</div>` : ''}
      </section>`;
  }

  function seccionCantidad(p) {
    const upp = Number(p.unidades_por_presentacion);
    const total = unidades(p);
    return `
      <section class="tarjeta formulario">
        <p class="titulo-seccion" style="margin:0">Cantidad</p>
        ${upp > 1 ? `
        <div class="pestanas">
          <button type="button" class="${e.modo === 'sueltos' ? 'activa' : ''}" data-modo="sueltos">${escapar(cap(plural(p.unidad_minima, 2)))} sueltos</button>
          <button type="button" class="${e.modo === 'completa' ? 'activa' : ''}" data-modo="completa">${escapar(cap(p.presentacion || 'presentación'))} completa</button>
        </div>` : ''}
        <div class="contador">
          <button type="button" class="redondo" data-sumar="-1" aria-label="Restar">−</button>
          <input data-campo="cant" type="number" inputmode="decimal" min="0" step="any" value="${escapar(e.cant)}" aria-label="Cantidad" class="campo-grande">
          <button type="button" class="redondo" data-sumar="1" aria-label="Sumar">+</button>
        </div>
        <p class="ayuda" id="equivale">${total ? '= ' + escapar(Datos.textoStock(p, total).split(' · ')[0]) : ''}</p>
      </section>`;
  }

  function seccionEntrega() {
    const rutOk = rutValido(e.rut);
    const existente = rutOk ? Datos.tutorPorRut(e.rut) : null;
    return `
      <section class="tarjeta formulario">
        <label class="interruptor">
          <span>¿Se entrega a un tutor?</span>
          <input type="checkbox" id="entrega" ${e.entrega ? 'checked' : ''}>
        </label>
        ${e.entrega ? `
          <label>RUT del tutor<input id="rut" value="${escapar(e.rut)}" placeholder="12.345.678-9" autocomplete="off" inputmode="text"></label>
          ${e.rut && !rutOk && limpiarRut(e.rut).length >= 8 ? '<p class="mensaje error" style="margin:0">El RUT no es válido. Revisa el dígito verificador.</p>' : ''}
          ${rutOk ? `
            <div class="${existente ? 'encontrado' : 'nuevo-tutor'}">${existente ? 'Tutor encontrado · datos completados' : 'Tutor nuevo · completa sus datos'}</div>
            <label>Nombre<input data-campo="nombre" value="${escapar(e.nombre)}" autocomplete="off"></label>
            <label>Dirección<input data-campo="direccion" value="${escapar(e.direccion)}" autocomplete="off"></label>
            <label>Teléfono<input data-campo="telefono" type="tel" value="${escapar(e.telefono)}" autocomplete="off"></label>` : ''}
        ` : '<p class="detalle">Uso interno (sin tutor).</p>'}
        <p class="titulo-seccion" style="margin:4px 0 0">Especie${e.entrega ? '' : ' (opcional)'}</p>
        <div class="dos-botones">
          ${['Perro', 'Gato'].map((s) => `<button type="button" class="opcion ${e.especie === s ? 'activa' : ''}" data-especie="${s}">${s}</button>`).join('')}
        </div>
      </section>`;
  }

  function unidades(p) {
    const n = Number(e.cant) || 0;
    return e.modo === 'completa' ? n * Number(p.unidades_por_presentacion) : n;
  }
  const cap = (t) => String(t || '').charAt(0).toUpperCase() + String(t || '').slice(1);

  // ---------- Acciones ----------
  function conectar() {
    const buscar = document.getElementById('buscar-producto');
    if (buscar) {
      const sugerir = () => {
        e.texto = buscar.value;
        const lista = Datos.buscar(e.texto);
        document.getElementById('sugerencias').innerHTML = lista.map((p) =>
          `<button type="button" class="sugerencia" data-elegir="${p.id}">${escapar(p.nombre)} <span class="detalle">· ${escapar(Datos.textoStock(p))}</span></button>`).join('');
        document.querySelectorAll('[data-elegir]').forEach((b) => b.addEventListener('click', () => {
          e.producto_id = b.dataset.elegir; dibujar();
        }));
      };
      buscar.addEventListener('input', sugerir);
      sugerir();
    }
    const cambiar = document.getElementById('cambiar-producto');
    if (cambiar) cambiar.addEventListener('click', () => { e.producto_id = null; e.cant = ''; e.confirmarStock = false; dibujar(); });

    document.querySelectorAll('[data-modo]').forEach((b) => b.addEventListener('click', () => { e.modo = b.dataset.modo; e.confirmarStock = false; dibujar(); }));
    document.querySelectorAll('[data-campo]').forEach((c) => c.addEventListener('input', () => {
      e[c.dataset.campo] = c.value;
      if (c.dataset.campo === 'cant') { e.confirmarStock = false; mostrarEquivalencia(); }
    }));
    document.querySelectorAll('[data-sumar]').forEach((b) => b.addEventListener('click', () => {
      e.cant = String(Math.max(0, (Number(e.cant) || 0) + Number(b.dataset.sumar)));
      e.confirmarStock = false; dibujar();
    }));
    document.querySelectorAll('[data-especie]').forEach((b) => b.addEventListener('click', () => {
      e.especie = e.especie === b.dataset.especie ? '' : b.dataset.especie; dibujar();
    }));

    const entrega = document.getElementById('entrega');
    if (entrega) entrega.addEventListener('change', () => { e.entrega = entrega.checked; dibujar(); });

    const rut = document.getElementById('rut');
    if (rut) rut.addEventListener('input', () => {
      const antes = rutValido(e.rut);
      e.rut = rut.value;
      const ahora = rutValido(e.rut);
      if (ahora !== antes || limpiarRut(e.rut).length >= 8) {
        if (ahora) {
          e.rut = formatearRut(e.rut);
          const t = Datos.tutorPorRut(e.rut);
          if (t) Object.assign(e, { nombre: t.nombre, direccion: t.direccion, telefono: t.telefono });
        }
        dibujar();
        const siguiente = document.querySelector(ahora ? '[data-campo=nombre]' : '#rut');
        if (siguiente) { siguiente.focus(); if (!ahora) siguiente.setSelectionRange(99, 99); }
      }
    });

    const confirmar = document.getElementById('confirmar-salida');
    if (confirmar) confirmar.addEventListener('click', guardar);
  }

  function mostrarEquivalencia() {
    const p = Datos.producto(e.producto_id);
    const total = unidades(p);
    const caja = document.getElementById('equivale');
    if (caja) caja.textContent = total ? '= ' + Datos.textoStock(p, total).split(' · ')[0] : '';
  }

  async function guardar() {
    const p = Datos.producto(e.producto_id);
    const mensaje = document.getElementById('mensaje-salida');
    const boton = document.getElementById('confirmar-salida');
    const error = (t) => { mensaje.textContent = t; };
    const total = unidades(p);

    if (!(total > 0)) return error('Indica la cantidad que sale.');
    if (e.modo === 'completa' && !Number.isInteger(Number(e.cant))) return error('Las presentaciones completas deben ser un número entero.');
    if (e.entrega) {
      if (!rutValido(e.rut)) return error('Ingresa un RUT válido del tutor.');
      if (!e.nombre.trim()) return error('Falta el nombre del tutor.');
      if (!e.especie) return error('Indica si es perro o gato.');
    }
    if (total > Datos.stock(p.id) && !e.confirmarStock) {
      e.confirmarStock = true;
      boton.textContent = 'Registrar igual';
      return error('El stock registrado es ' + Datos.textoStock(p) + '. Si de verdad salió esa cantidad, toca "Registrar igual" (el stock quedará negativo hasta corregirlo).');
    }

    boton.disabled = true; boton.textContent = 'Guardando…';
    try {
      await llamarServidor('registrarSalida', {
        token: Acceso.sesion().token,
        id_dispositivo: idDispositivo(),
        salida: {
          id_mov: e.id_mov, producto_id: p.id, cantidad_unidades: total,
          tutor: e.entrega ? { rut: e.rut, nombre: e.nombre, direccion: e.direccion, telefono: e.telefono } : null,
          especie: e.especie, observacion: e.obs
        }
      });
      const id = p.id;
      e = nuevo();
      await Datos.actualizar();
      aviso('Salida registrada');
      location.hash = '#producto/' + id;
    } catch (x) {
      error(x.message);
      boton.disabled = false; boton.textContent = 'Confirmar salida';
    }
  }

  return { html, init: dibujar };
})();

PANTALLAS.salida = Salida;
