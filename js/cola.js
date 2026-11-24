/* ============================================================
   Cola sin señal — Bloque 5
   Cuando no hay señal (o falla la conexión), las salidas, ingresos y cambios de lote
   se guardan aquí, en el teléfono, y se suben solos al volver la señal.
   Cada registro lleva su propio identificador, así el servidor nunca lo guarda dos veces.
   ============================================================ */

const Cola = (() => {
  const CLAVE = 'cola';
  const ACCIONES_EN_COLA = ['registrarSalida', 'registrarIngreso', 'actualizarLote'];
  let sincronizando = false;

  function leer() {
    try { return JSON.parse(localStorage.getItem(CLAVE)) || []; } catch (e) { return []; }
  }
  function escribir(lista) {
    localStorage.setItem(CLAVE, JSON.stringify(lista));
    if (typeof actualizarEstado === 'function') actualizarEstado();
  }

  /** Errores de conexión (vale la pena reintentar) vs. errores del servidor (hay que revisar). */
  function esErrorDeConexion(e) {
    return !navigator.onLine || /conectar|señal|Failed to fetch|NetworkError|Load failed/i.test(e.message || '');
  }

  /**
   * Envía una acción. Si hay señal, la manda de inmediato; si no (o falla la conexión),
   * la deja en la cola y la refleja en la app para que el stock se vea al día.
   * Devuelve { enCola: true/false }.
   */
  async function enviar(accion, datos, descripcion) {
    if (!ACCIONES_EN_COLA.includes(accion)) throw new Error('Esta acción no se puede guardar sin señal.');
    if (navigator.onLine) {
      try {
        await llamarServidor(accion, Object.assign({ token: Acceso.sesion().token }, datos));
        return { enCola: false };
      } catch (e) {
        if (!esErrorDeConexion(e)) throw e; // error real (dato inválido): se muestra al usuario
      }
    }
    const lista = leer();
    lista.push({ id: nuevoId(), accion, datos, descripcion: descripcion || accion, creado: new Date().toISOString(), error: '' });
    escribir(lista);
    Datos.aplicarLocal(accion, datos);
    return { enCola: true };
  }

  /** Sube los registros pendientes, en el mismo orden en que se hicieron. */
  async function sincronizar() {
    if (sincronizando || !navigator.onLine || !Acceso.sesion()) return 0;
    let lista = leer().filter((x) => !x.error);
    if (!lista.length) return 0;
    sincronizando = true;
    let subidos = 0;
    try {
      for (const item of lista) {
        try {
          await llamarServidor(item.accion, Object.assign({ token: Acceso.sesion().token }, item.datos));
          escribir(leer().filter((x) => x.id !== item.id));
          subidos++;
        } catch (e) {
          if (esErrorDeConexion(e)) break; // se reintenta más tarde
          // El servidor lo rechazó (ej.: producto eliminado). Queda marcado para revisarlo.
          escribir(leer().map((x) => (x.id === item.id ? Object.assign(x, { error: e.message }) : x)));
        }
      }
    } finally {
      sincronizando = false;
    }
    if (subidos) {
      await Datos.actualizar().catch(() => {});
      aviso(subidos + ' registro' + (subidos > 1 ? 's' : '') + ' subido' + (subidos > 1 ? 's' : '') + ' a la planilla');
    }
    return subidos;
  }

  function quitar(id) { escribir(leer().filter((x) => x.id !== id)); }
  function reintentar(id) {
    escribir(leer().map((x) => (x.id === id ? Object.assign(x, { error: '' }) : x)));
    return sincronizar();
  }

  // Reintenta cada minuto mientras la app está abierta, y al volver la señal.
  setInterval(() => { if (document.visibilityState === 'visible') sincronizar(); }, 60 * 1000);
  window.addEventListener('online', () => sincronizar());

  return { enviar, sincronizar, leer, quitar, reintentar };
})();

/* ---------- Pantalla de registros pendientes: #pendientes ---------- */
PANTALLAS.pendientes = {
  html() {
    const lista = Cola.leer();
    return `
      ${encabezado('Por subir', { volver: '#inicio' })}
      <main class="contenido">
        ${lista.length ? `
          <p class="ayuda izquierda">Estos registros están guardados en este teléfono y se suben solos cuando hay señal (con la app abierta).</p>
          ${lista.map((x) => `
            <div class="tarjeta linea">
              <strong>${escapar(x.descripcion)}</strong>
              <span class="detalle">Anotado ${escapar(textoFecha(x.creado.slice(0, 10)))} ${escapar(new Date(x.creado).toTimeString().slice(0, 5))}</span>
              ${x.error ? `
                <span class="mensaje error" style="margin:4px 0 0">No se pudo subir: ${escapar(x.error)}</span>
                <div class="dos-botones">
                  <button type="button" class="boton-borde" data-reintentar="${x.id}">Reintentar</button>
                  <button type="button" class="boton-borde rojo" data-quitar="${x.id}">Descartar</button>
                </div>` : '<span class="detalle texto-amarillo">Esperando señal…</span>'}
            </div>`).join('')}
          <button type="button" class="boton-principal" id="subir-ahora">Subir ahora</button>`
        : '<p class="vacio">No hay nada pendiente. Todo está subido a la planilla. ✅</p>'}
      </main>`;
  },
  init() {
    const subir = document.getElementById('subir-ahora');
    if (subir) subir.addEventListener('click', async () => {
      subir.disabled = true; subir.textContent = 'Subiendo…';
      const n = await Cola.sincronizar();
      if (!n && !navigator.onLine) aviso('Sin señal. Se subirá apenas haya conexión.', 'error');
      mostrarPantalla();
    });
    document.querySelectorAll('[data-reintentar]').forEach((b) => b.addEventListener('click', async () => {
      await Cola.reintentar(b.dataset.reintentar); mostrarPantalla();
    }));
    document.querySelectorAll('[data-quitar]').forEach((b) => b.addEventListener('click', async () => {
      if (!b.dataset.seguro) { b.dataset.seguro = '1'; b.textContent = '¿Seguro? Toca otra vez'; return; }
      Cola.quitar(b.dataset.quitar);
      await Datos.actualizar().catch(() => {});
      mostrarPantalla();
    }));
  }
};
