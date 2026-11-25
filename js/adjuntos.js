/* ============================================================
   Documentos y adjuntos — Versión 2
   - #documentos: lista de compras (facturas, boletas, inventario inicial…)
   - #documento/D0002: detalle, productos que trajo y sus adjuntos (fotos o PDF)
   Las fotos se achican en el teléfono antes de subirlas (más rápido con poca señal).
   Los archivos quedan privados en el Drive de Matías; la app los muestra a través del servidor.
   ============================================================ */

const Adjuntos = (() => {
  const LADO_MAXIMO = 1800;   // píxeles del lado más largo de la foto
  const CALIDAD = 0.75;       // calidad JPEG (0 a 1)
  const MAX_MB = 10;

  function leerComoBase64(blob) {
    return new Promise((ok, mal) => {
      const lector = new FileReader();
      lector.onload = () => ok(String(lector.result).split(',')[1]);
      lector.onerror = () => mal(new Error('No se pudo leer el archivo.'));
      lector.readAsDataURL(blob);
    });
  }

  /** Achica una foto a un tamaño razonable y la convierte a JPEG. */
  function achicarFoto(archivo) {
    return new Promise((ok, mal) => {
      const img = new Image();
      const url = URL.createObjectURL(archivo);
      img.onload = () => {
        const escala = Math.min(1, LADO_MAXIMO / Math.max(img.width, img.height));
        const lienzo = document.createElement('canvas');
        lienzo.width = Math.round(img.width * escala);
        lienzo.height = Math.round(img.height * escala);
        lienzo.getContext('2d').drawImage(img, 0, 0, lienzo.width, lienzo.height);
        URL.revokeObjectURL(url);
        lienzo.toBlob((b) => (b ? ok(b) : mal(new Error('No se pudo procesar la foto.'))), 'image/jpeg', CALIDAD);
      };
      img.onerror = () => { URL.revokeObjectURL(url); mal(new Error('El archivo no es una foto válida.')); };
      img.src = url;
    });
  }

  /** Prepara y sube un archivo (foto o PDF) al documento indicado. */
  async function subir(documentoId, archivo) {
    if (!navigator.onLine) throw new Error('Subir adjuntos necesita señal.');
    let blob = archivo, tipo = archivo.type, nombre = archivo.name || 'adjunto';
    if (tipo.startsWith('image/')) {
      blob = await achicarFoto(archivo);
      tipo = 'image/jpeg';
      nombre = nombre.replace(/\.[^.]+$/, '') + '.jpg';
    } else if (tipo !== 'application/pdf') {
      throw new Error('Solo se aceptan fotos o PDF.');
    }
    if (blob.size > MAX_MB * 1024 * 1024) throw new Error('El archivo supera ' + MAX_MB + ' MB.');
    return llamarServidor('subirAdjunto', {
      token: Acceso.sesion().token, documento_id: documentoId,
      nombre, tipo_mime: tipo, base64: await leerComoBase64(blob)
    });
  }

  /** Convierte base64 en un archivo del teléfono. */
  function aArchivo(base64, tipo, nombre) {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    return new File([bytes], nombre, { type: tipo });
  }

  /**
   * Entrega un archivo a la persona: con el menú "Compartir" del teléfono
   * (guardar en Archivos, WhatsApp, correo…) o, si no existe, como descarga.
   */
  async function entregar(archivo) {
    if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
      try { await navigator.share({ files: [archivo], title: archivo.name }); return; } catch (e) {
        if (e.name === 'AbortError') return; // la persona cerró el menú
      }
    }
    const url = URL.createObjectURL(archivo);
    const a = document.createElement('a');
    a.href = url; a.download = archivo.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  /** Muestra una foto en pantalla completa, o entrega el PDF para abrirlo. */
  async function ver(documentoId, adjunto, boton) {
    const texto = boton.textContent;
    boton.disabled = true; boton.textContent = 'Abriendo…';
    try {
      const r = await llamarServidor('verAdjunto', { token: Acceso.sesion().token, documento_id: documentoId, archivo_id: adjunto.id });
      // Se muestra en una capa; el botón "Guardar / abrir" usa un toque nuevo (el teléfono lo exige para compartir).
      const imagen = r.tipo_mime.startsWith('image/');
      const capa = document.createElement('div');
      capa.className = 'visor';
      capa.innerHTML = `${imagen ? `<img alt="${escapar(r.nombre)}" src="data:${r.tipo_mime};base64,${r.base64}">`
          : `<p class="visor-texto">📄 ${escapar(r.nombre)}<br>Toca "Abrir / guardar" para verlo.</p>`}
        <div class="visor-botones"><button type="button" class="boton-borde" id="visor-guardar">${imagen ? 'Guardar / compartir' : 'Abrir / guardar'}</button>
        <button type="button" class="boton-principal" id="visor-cerrar">Cerrar</button></div>`;
      document.body.appendChild(capa);
      capa.querySelector('#visor-cerrar').addEventListener('click', () => capa.remove());
      capa.querySelector('#visor-guardar').addEventListener('click', () => entregar(aArchivo(r.base64, r.tipo_mime, r.nombre)));
    } catch (e) {
      aviso(e.message, 'error');
    } finally {
      boton.disabled = false; boton.textContent = texto;
    }
  }

  return { subir, ver, entregar, aArchivo };
})();

/** Botones para tomar una foto o elegir un archivo. */
function botonesAdjuntar(id) {
  return `
    <div class="dos-botones">
      <label class="boton-borde">📷 Tomar foto<input type="file" accept="image/*" capture="environment" class="oculto" data-adjuntar="${id}"></label>
      <label class="boton-borde">📎 Foto o PDF<input type="file" accept="image/*,application/pdf" multiple class="oculto" data-adjuntar="${id}"></label>
    </div>`;
}

/* ---------- Lista de documentos: #documentos ---------- */
PANTALLAS.documentos = {
  html() {
    const docs = Datos.documentos();
    return `
      ${encabezado('Documentos de compra', { volver: '#inicio' })}
      <main class="contenido lista">
        ${docs.length ? docs.map((d) => {
          const n = Datos.lotes().filter((l) => l.documento_id === d.id).length;
          return `
            <a href="#documento/${d.id}" class="fila-producto">
              <span><span class="nombre">${escapar(d.tipo)}${d.n_documento && d.tipo !== 'Inventario inicial' ? ' ' + escapar(d.n_documento) : ''}</span>
                <span class="detalle">${escapar([textoFecha(d.fecha_recepcion), d.proveedor].filter(Boolean).join(' · '))}</span></span>
              <span class="derecha"><span class="detalle">${n} producto${n === 1 ? '' : 's'}</span>
                ${d.carpeta_adjuntos ? '<span class="etiqueta gris">📎 adjuntos</span>' : ''}</span>
            </a>`;
        }).join('') : '<p class="vacio">Todavía no hay documentos.</p>'}
      </main>
      ${menuInferior('inicio')}`;
  }
};

/* ---------- Detalle de un documento: #documento/D0002 ---------- */
PANTALLAS.documento = {
  html(id) {
    const d = Datos.documento(id);
    if (!d) return `${encabezado('Documento', { volver: '#documentos' })}<main class="contenido"><p class="vacio">No se encontró el documento. Si lo registraste sin señal, aparecerá cuando se suba.</p></main>`;
    const lotes = Datos.lotes().filter((l) => l.documento_id === id);
    return `
      ${encabezado(escapar(d.tipo + (d.n_documento && d.tipo !== 'Inventario inicial' ? ' ' + d.n_documento : '')), { volver: '#documentos' })}
      <main class="contenido">
        <section class="tarjeta">
          ${d.proveedor ? `<p class="dato" style="margin:0">${escapar(d.proveedor)}</p>` : ''}
          <span class="detalle">${d.fecha_recepcion ? 'Llegó el ' + escapar(textoFecha(d.fecha_recepcion)) + ' · ' : ''}Registrado por ${escapar(d.ingresado_por)}</span>
        </section>

        <p class="titulo-seccion">Productos (${lotes.length})</p>
        ${lotes.map((l) => {
          const p = Datos.producto(l.producto_id) || { nombre: l.producto_id };
          return `<a href="#producto/${l.producto_id}" class="tarjeta linea">
            <strong>${escapar(p.nombre)}</strong>
            <span class="detalle">${escapar(Datos.textoStock(p, Number(l.cantidad_unidades)).split(' · ')[0])}${l.n_lote ? ' · lote ' + escapar(l.n_lote) : ''}${l.vencimiento ? ' · vence ' + escapar(textoMes(l.vencimiento)) : ''}</span>
          </a>`;
        }).join('') || '<p class="vacio">Sin productos.</p>'}

        <p class="titulo-seccion">Adjuntos (factura, cotización, receta…)</p>
        <div id="lista-adjuntos"><p class="vacio">${navigator.onLine ? 'Cargando…' : 'Ver los adjuntos necesita señal.'}</p></div>
        ${botonesAdjuntar(id)}
        <p id="estado-subida" class="ayuda"></p>
      </main>
      ${menuInferior('inicio')}`;
  },

  async init(id) {
    if (!Datos.documento(id)) return;
    const caja = document.getElementById('lista-adjuntos');

    const cargar = async () => {
      if (!navigator.onLine) return;
      try {
        const r = await llamarServidor('adjuntos', { token: Acceso.sesion().token, documento_id: id });
        caja.innerHTML = r.adjuntos.length ? r.adjuntos.map((a, i) => `
          <div class="tarjeta fila-entre adjunto">
            <span><strong>${a.tipo_mime === 'application/pdf' ? '📄' : '🖼️'} ${escapar(a.nombre)}</strong><span class="detalle">${escapar(textoFecha(a.fecha))} · ${a.kb} KB</span></span>
            <span class="acciones-adjunto">
              <button type="button" class="boton-texto" data-ver="${i}">Ver</button>
              <button type="button" class="boton-texto texto-rojo" data-borrar="${i}">Quitar</button>
            </span>
          </div>`).join('') : '<p class="vacio">Sin adjuntos todavía.</p>';
        caja.querySelectorAll('[data-ver]').forEach((b) => b.addEventListener('click', () => Adjuntos.ver(id, r.adjuntos[b.dataset.ver], b)));
        caja.querySelectorAll('[data-borrar]').forEach((b) => b.addEventListener('click', async () => {
          if (!b.dataset.seguro) { b.dataset.seguro = '1'; b.textContent = '¿Seguro?'; return; }
          b.disabled = true;
          try {
            await llamarServidor('borrarAdjunto', { token: Acceso.sesion().token, documento_id: id, archivo_id: r.adjuntos[b.dataset.borrar].id });
            aviso('Adjunto quitado (queda 30 días en la papelera de Drive)');
            cargar();
          } catch (e) { aviso(e.message, 'error'); b.disabled = false; }
        }));
      } catch (e) {
        caja.innerHTML = `<p class="mensaje error">${escapar(e.message)}</p>`;
      }
    };

    document.querySelectorAll('[data-adjuntar]').forEach((input) => input.addEventListener('change', async () => {
      const estado = document.getElementById('estado-subida');
      const archivos = Array.from(input.files);
      input.value = '';
      for (let i = 0; i < archivos.length; i++) {
        estado.textContent = `Subiendo ${i + 1} de ${archivos.length}…`;
        try { await Adjuntos.subir(id, archivos[i]); } catch (e) { aviso(e.message, 'error'); }
      }
      estado.textContent = '';
      await Datos.actualizar().catch(() => {});
      cargar();
      if (archivos.length) aviso('Adjunto' + (archivos.length > 1 ? 's' : '') + ' subido' + (archivos.length > 1 ? 's' : ''));
    }));

    cargar();
  }
};

/* ---------- Exportar a Excel: #exportar ---------- */
PANTALLAS.exportar = {
  html() {
    return `
      ${encabezado('Exportar a Excel', { volver: '#inicio' })}
      <main class="contenido">
        <section class="tarjeta formulario">
          <p style="margin:0">Se genera un archivo Excel con tres hojas:</p>
          <ul class="lista-simple">
            <li><strong>Inventario:</strong> stock actual de cada producto.</li>
            <li><strong>Lotes:</strong> lo recibido, con lote, vencimiento, documento y proveedor.</li>
            <li><strong>Movimientos:</strong> historial completo de ingresos y salidas.</li>
          </ul>
          <label class="interruptor"><span>Incluir datos de tutores (nombre, RUT, teléfono, dirección)</span><input type="checkbox" id="con-tutores"></label>
          <p class="ayuda izquierda">Sin esa opción, el archivo no tiene datos personales y se puede compartir con más tranquilidad. Si la activas, guárdalo solo en lugares privados.</p>
          <button type="button" class="boton-principal" id="exportar">Generar Excel</button>
          <button type="button" class="boton-borde oculto-total" id="guardar-excel">Guardar / compartir el Excel</button>
          <p id="mensaje-exportar" class="mensaje error" role="alert"></p>
        </section>
        <p class="ayuda">Sirve también como respaldo: conviene exportarlo una vez al mes.</p>
      </main>
      ${menuInferior('inicio')}`;
  },
  init() {
    document.getElementById('exportar').addEventListener('click', async (ev) => {
      const boton = ev.target;
      boton.disabled = true; boton.textContent = 'Generando… (puede tardar unos segundos)';
      try {
        const r = await llamarServidor('exportar', { token: Acceso.sesion().token, incluir_tutores: document.getElementById('con-tutores').checked });
        const archivo = Adjuntos.aArchivo(r.base64, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', r.nombre);
        const guardar = document.getElementById('guardar-excel');
        guardar.textContent = 'Guardar / compartir: ' + r.nombre;
        guardar.classList.remove('oculto-total');
        guardar.onclick = () => Adjuntos.entregar(archivo);
        aviso('Excel listo. Toca el botón para guardarlo o compartirlo.');
      } catch (e) {
        document.getElementById('mensaje-exportar').textContent = e.message;
      } finally {
        boton.disabled = false; boton.textContent = 'Generar Excel';
      }
    });
  }
};
