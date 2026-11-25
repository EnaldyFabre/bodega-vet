/* ============================================================
   App Bodega Veterinaria — arranque y navegación
   - Pantalla de Inicio
   - Cambia de pantalla según la dirección (#inicio, #productos/farmacia, #producto/P001…)
   - Actualiza los datos al abrir la app y al recuperar la señal
   - Avisa cuando hay una versión nueva de la app
   ============================================================ */

const VERSION_APP = '2.1 (versión 2)';

/* ---------- Inicio ---------- */
PANTALLAS.inicio = {
  html() {
    const nombre = escapar((Acceso.usuario() || {}).nombre || '');
    const farmacia = Datos.productos('Farmacia').length;
    const bodega = Datos.productos('Bodega').length;
    // Avisos: cada uno lleva a su lista (#alertas/...)
    const vencen = Alertas.porVencer();
    const sinFecha = Alertas.sinFecha().length;
    const bajos = Alertas.bajoMinimo().length;
    const sinDatos = Alertas.sinDatos().length;
    const fila = (destino, n, color, texto, detalle = '') => `
      <a href="#alertas/${destino}" class="aviso enlace-aviso">
        <span class="numero ${color}">${n}</span>
        <span>${texto}${detalle ? `<span class="detalle">${detalle}</span>` : ''}</span>
      </a>`;
    const primero = vencen[0] ? Datos.producto(vencen[0].producto_id) : null;

    const avisos = [];
    if (vencen.length) avisos.push(fila('vencen', vencen.length, 'amarillo', 'lote' + (vencen.length > 1 ? 's' : '') + ' por vencer',
      escapar(primero.nombre + (vencen[0].n_lote ? ' · lote ' + vencen[0].n_lote : '') + ' · vence ' + textoMes(vencen[0].vencimiento))));
    if (bajos) avisos.push(fila('minimo', bajos, 'rojo', 'producto' + (bajos > 1 ? 's' : '') + ' bajo el stock mínimo'));
    if (sinFecha) avisos.push(fila('sinfecha', sinFecha, 'amarillo', 'lote' + (sinFecha > 1 ? 's' : '') + ' sin fecha de vencimiento'));
    if (sinDatos) avisos.push(fila('datos', sinDatos, 'gris', 'producto' + (sinDatos > 1 ? 's' : '') + ' con datos por completar'));

    return `
      ${encabezado('Hola, ' + nombre)}
      <main class="contenido">
        <section class="tarjeta">
          <p class="titulo-seccion" style="margin:0 0 10px">Avisos</p>
          ${avisos.length ? avisos.join('') : `<p class="vacio">${Datos.hay() ? 'Sin avisos por ahora.' : 'Cargando datos… (necesitas señal la primera vez)'}</p>`}
        </section>

        <div class="modulos">
          <a href="#productos/farmacia" class="modulo farmacia">
            ${icono('farmacia', 'grande')}
            <span><span class="nombre">Farmacia</span><span class="detalle">${farmacia} producto${farmacia === 1 ? '' : 's'}</span></span>
          </a>
          <a href="#productos/bodega" class="modulo bodega">
            ${icono('bodega', 'grande')}
            <span><span class="nombre">Bodega</span><span class="detalle">${bodega} insumo${bodega === 1 ? '' : 's'}</span></span>
          </a>
        </div>

        <p class="titulo-seccion">Acciones rápidas</p>
        <a href="#salida" class="accion">${icono('salida')} Registrar salida</a>
        <a href="#ingreso" class="accion">${icono('ingreso')} Registrar ingreso${localStorage.getItem('borradorIngreso') ? ' <span class="etiqueta gris">borrador</span>' : ''}</a>

        <p class="titulo-seccion">Más</p>
        <div class="dos-botones">
          <a href="#documentos" class="boton-borde">Documentos de compra</a>
          <a href="#exportar" class="boton-borde">Exportar a Excel</a>
        </div>

        <p class="pie-version">Versión ${VERSION_APP}${Datos.actualizado() ? ' · datos al ' + escapar(textoFecha(Datos.actualizado())) : ''}</p>
        <button class="boton-texto centrado" id="cerrar-sesion" type="button">Cerrar sesión en este teléfono</button>
      </main>
      ${menuInferior('inicio')}`;
  },
  init() {
    document.getElementById('cerrar-sesion').addEventListener('click', () => { Datos.olvidar(); Acceso.cerrarSesion(); });
  }
};

/* ---------- Navegación ---------- */
// Ej.: "#producto/P001" → pantalla "producto" con detalle "P001"
function pantallaActual() {
  const [nombre, ...resto] = (location.hash.replace('#', '') || 'inicio').split('/');
  return { nombre: PANTALLAS[nombre] ? nombre : 'inicio', detalle: resto.join('/') };
}

function mostrarPantalla() {
  const { nombre, detalle } = pantallaActual();
  const def = PANTALLAS[nombre];
  const html = typeof def === 'function' ? def(detalle) : def.html(detalle);
  document.getElementById('app').innerHTML = html;
  if (def.init) def.init(detalle);
  window.scrollTo(0, 0);
}

/* Pantallas que se pueden redibujar al llegar datos nuevos sin perder lo que se está escribiendo */
const PANTALLAS_DE_LECTURA = ['inicio', 'productos', 'producto', 'tutores', 'historial', 'alertas', 'pendientes', 'documentos'];

async function refrescarDatos() {
  try {
    const cambio = await Datos.actualizar();
    if (cambio && document.querySelector('.encabezado') && PANTALLAS_DE_LECTURA.includes(pantallaActual().nombre)) {
      const busqueda = document.getElementById('buscar');
      const texto = busqueda ? busqueda.value : '';
      mostrarPantalla();
      const nueva = document.getElementById('buscar');
      if (nueva && texto) { nueva.value = texto; nueva.dispatchEvent(new Event('input')); }
    }
  } catch (e) {
    console.warn('No se pudieron actualizar los datos:', e.message);
  }
}

/* La llama acceso.js cuando la persona ya entró con su PIN. */
function iniciarApp() {
  // Si Android cerró la app (por ejemplo, al abrir la cámara), vuelve a la pantalla en que estaba.
  if (!location.hash) {
    try {
      const u = JSON.parse(localStorage.getItem('ultimaPantalla') || 'null');
      if (u && Date.now() - u.t < 30 * 60 * 1000 && /^#(ingreso|salida|documento)/.test(u.hash)) {
        history.replaceState(null, '', u.hash);
      }
    } catch (e) { /* sin problema */ }
  }
  mostrarPantalla();
  // Primero sube lo pendiente (si hay señal) y luego trae los datos al día.
  Cola.sincronizar().finally(refrescarDatos);
}

function actualizarEstado() {
  const caja = document.getElementById('estado');
  if (caja) caja.innerHTML = etiquetaEstado();
}

// Solo cambia de pantalla si la app está desbloqueada (si no, se queda en la pantalla del PIN).
window.addEventListener('hashchange', () => {
  localStorage.setItem('ultimaPantalla', JSON.stringify({ hash: location.hash, t: Date.now() }));
  if (document.querySelector('.encabezado')) mostrarPantalla();
});
window.addEventListener('online', () => { actualizarEstado(); if (Acceso.sesion()) Cola.sincronizar().finally(refrescarDatos); });
window.addEventListener('offline', actualizarEstado);

// Al abrir la app, primero se revisa el acceso (correo/código/PIN).
Acceso.comenzar();

/* ---------- Funcionamiento sin señal y aviso de versión nueva ---------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Si al abrir ya había una versión funcionando, lo que se instale después es una actualización.
    const habiaVersion = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const nuevo = reg.installing;
        nuevo.addEventListener('statechange', () => {
          // Si ya había una versión funcionando, avisamos que llegó otra.
          if (nuevo.state === 'activated' && habiaVersion) mostrarAvisoVersion();
        });
      });
    }).catch((error) => console.error('No se pudo activar el modo sin señal:', error));
  });
}

function mostrarAvisoVersion() {
  if (document.getElementById('aviso-version')) return;
  const barra = document.createElement('button');
  barra.id = 'aviso-version';
  barra.className = 'aviso-version';
  barra.type = 'button';
  barra.textContent = 'Hay una versión nueva de la app · Toca para actualizar';
  barra.addEventListener('click', () => location.reload());
  document.body.appendChild(barra);
}
