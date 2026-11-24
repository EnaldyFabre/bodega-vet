/* ============================================================
   Alertas — Bloque 5
   - Lotes por vencer (según la fecha registrada en cada ingreso)
   - Lotes sin fecha de vencimiento (inventario inicial): se completan aquí
   - Productos bajo el mínimo y productos con datos por completar
   ============================================================ */

const DIAS_AVISO_VENCIMIENTO = 60; // avisar con 2 meses de anticipación

const Alertas = (() => {
  /** Días que faltan hasta el último día del mes de vencimiento ("2027-03" → 31/03/2027). */
  function diasHasta(venc) {
    const m = /^(\d{4})-(\d{2})/.exec(venc || '');
    if (!m) return null;
    const fin = new Date(Number(m[1]), Number(m[2]), 0, 23, 59);
    return Math.ceil((fin - new Date()) / 86400000);
  }

  const conStock = (l) => Datos.stock(l.producto_id) > 0 && Datos.producto(l.producto_id);

  function porVencer() {
    return Datos.lotes()
      .filter((l) => l.vencimiento && l.alerta_revisada !== 'sí' && conStock(l) && diasHasta(l.vencimiento) <= DIAS_AVISO_VENCIMIENTO)
      .sort((a, b) => a.vencimiento.localeCompare(b.vencimiento));
  }
  function sinFecha() {
    return Datos.lotes().filter((l) => !l.vencimiento && conStock(l) && Datos.producto(l.producto_id).tipo === 'Farmacia');
  }
  function bajoMinimo() { return Datos.productos().filter((p) => Datos.bajoMinimo(p)); }
  function sinDatos() { return Datos.productos().filter((p) => Datos.faltanDatos(p)); }

  return { diasHasta, porVencer, sinFecha, bajoMinimo, sinDatos };
})();

/* ---------- Pantalla de alertas: #alertas/vencen | sinfecha | minimo | datos ---------- */
PANTALLAS.alertas = {
  html(tipo) {
    const titulos = { vencen: 'Por vencer', sinfecha: 'Sin fecha de vencimiento', minimo: 'Bajo el mínimo', datos: 'Datos por completar' };
    const t = titulos[tipo] ? tipo : 'vencen';
    let cuerpo = '';

    if (t === 'vencen') {
      const lista = Alertas.porVencer();
      cuerpo = `<p class="ayuda izquierda">Lotes que vencen en los próximos ${DIAS_AVISO_VENCIMIENTO} días o ya vencidos, de productos con stock. Revisa en la bodega y márcalos como revisados.</p>` +
        (lista.length ? lista.map((l) => {
          const p = Datos.producto(l.producto_id), dias = Alertas.diasHasta(l.vencimiento);
          return `
            <div class="tarjeta linea">
              <div class="fila-entre"><strong>${escapar(p.nombre)}</strong><span class="etiqueta ${dias < 0 ? 'roja' : 'amarilla'}">${dias < 0 ? 'Vencido' : 'Vence ' + escapar(textoMes(l.vencimiento))}</span></div>
              <span class="detalle">${l.n_lote ? 'Lote ' + escapar(l.n_lote) : 'Lote sin número'} · ingresó ${escapar(Datos.textoStock(p, Number(l.cantidad_unidades)).split(' · ')[0])}${l.doc_tipo ? ' · ' + escapar(l.doc_tipo) : ''}</span>
              ${String(l.id).startsWith('pend-') ? '<span class="detalle texto-amarillo">Se podrá marcar cuando se suba a la planilla.</span>'
                : `<button type="button" class="boton-borde" data-revisado="${l.id}">Marcar como revisado</button>`}
            </div>`;
        }).join('') : '<p class="vacio">No hay lotes por vencer. ✅</p>');
    }

    if (t === 'sinfecha') {
      const lista = Alertas.sinFecha();
      cuerpo = `<p class="ayuda izquierda">Lotes cargados sin fecha (por ejemplo, en el inventario inicial). Mientras no tengan fecha, la app no puede avisar cuándo vencen.</p>` +
        (lista.length ? lista.map((l) => {
          const p = Datos.producto(l.producto_id);
          const pendiente = String(l.id).startsWith('pend-');
          return `
            <form class="tarjeta formulario" data-lote="${l.id}">
              <div class="fila-entre"><strong>${escapar(p.nombre)}</strong><span class="detalle">${escapar(Datos.textoStock(p, Number(l.cantidad_unidades)).split(' · ')[0])}</span></div>
              ${pendiente ? '<span class="detalle texto-amarillo">Se podrá completar cuando se suba a la planilla.</span>' : `
              <div class="dos-columnas">
                <label>N° de lote<input name="n_lote" value="${escapar(l.n_lote || '')}" autocomplete="off"></label>
                <label>Vencimiento<input name="vencimiento" type="month" required></label>
              </div>
              <button type="submit" class="boton-borde">Guardar fecha</button>`}
            </form>`;
        }).join('') : '<p class="vacio">Todos los lotes con stock tienen fecha. ✅</p>');
    }

    if (t === 'minimo' || t === 'datos') {
      const lista = t === 'minimo' ? Alertas.bajoMinimo() : Alertas.sinDatos();
      cuerpo = (t === 'datos' ? '<p class="ayuda izquierda">Les falta indicar en qué se cuenta y cuántas trae cada presentación. Se piden solos al registrar un ingreso, o puedes completarlos desde la ficha.</p>' : '') +
        (lista.length ? lista.map(filaProducto).join('') : '<p class="vacio">Nada por aquí. ✅</p>');
    }

    return `
      ${encabezado(titulos[t], { volver: '#inicio' })}
      <main class="contenido lista">${cuerpo}</main>
      ${menuInferior('inicio')}`;
  },

  init() {
    document.querySelectorAll('[data-revisado]').forEach((b) => b.addEventListener('click', async () => {
      const lote = Datos.lotes().find((l) => l.id === b.dataset.revisado);
      const p = Datos.producto(lote.producto_id);
      b.disabled = true;
      try {
        const r = await Cola.enviar('actualizarLote', { lote: { id: lote.id, alerta_revisada: 'sí' } }, 'Revisado: ' + p.nombre + (lote.n_lote ? ' lote ' + lote.n_lote : ''));
        if (!r.enCola) await Datos.actualizar().catch(() => {});
        aviso('Marcado como revisado');
        mostrarPantalla();
      } catch (e) { aviso(e.message, 'error'); b.disabled = false; }
    }));

    document.querySelectorAll('form[data-lote]').forEach((f) => f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const lote = Datos.lotes().find((l) => l.id === f.dataset.lote);
      const p = Datos.producto(lote.producto_id);
      const cambios = { id: lote.id, n_lote: f.n_lote.value.trim(), vencimiento: f.vencimiento.value, alerta_revisada: 'no' };
      if (!cambios.vencimiento) return aviso('Elige el mes de vencimiento.', 'error');
      const boton = f.querySelector('button');
      boton.disabled = true;
      try {
        const r = await Cola.enviar('actualizarLote', { lote: cambios }, 'Fecha de vencimiento: ' + p.nombre);
        if (!r.enCola) await Datos.actualizar().catch(() => {});
        aviso('Fecha guardada');
        mostrarPantalla();
      } catch (e) { aviso(e.message, 'error'); boton.disabled = false; }
    }));
  }
};
