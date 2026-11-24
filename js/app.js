/* ============================================================
   App Bodega Veterinaria — arranque y navegación
   - Pantalla de Inicio
   - Cambia de pantalla según la dirección (#inicio, #productos/farmacia, #producto/P001…)
   - Actualiza los datos al abrir la app y al recuperar la señal
   - Avisa cuando hay una versión nueva de la app
   ============================================================ */

const VERSION_APP = '0.3.1 (bloque 3)';

/* ---------- Inicio ---------- */
PANTALLAS.inicio = {
  html() {
    const nombre = escapar((Acceso.usuario() || {}).nombre || '');
    const farmacia = Datos.productos('Farmacia').length;
    const bodega = Datos.productos('Bodega').length;
    const bajos = Datos.productos().filter((p) => Datos.bajoMinimo(p)).length;
    const sinDatos = Datos.productos().filter((p) => Datos.faltanDatos(p)).length;

    const avisos = [];
    if (bajos) avisos.push(`<div class="aviso"><span class="numero rojo">${bajos}</span><span>producto${bajos > 1 ? 's' : ''} bajo el stock mínimo</span></div>`);
    if (sinDatos) avisos.push(`<div class="aviso"><span class="numero amarillo">${sinDatos}</span><span>producto${sinDatos > 1 ? 's' : ''} con datos por completar (se piden al ingresarlos)</span></div>`);

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

        <p class="pie-version">Versión ${VERSION_APP}${Datos.actualizado() ? ' · datos al ' + escapar(textoFecha(Datos.actualizado())) : ''}</p>
        <button class="boton-texto centrado" id="cerrar-sesion" type="button">Cerrar sesión en este teléfono</button>
      </main>
      ${menuInferior('inicio')}`;
  },
  init() {
    document.getElementById('cerrar-sesion').addEventListener('click', () => { Datos.olvidar(); Acceso.cerrarSesion(); });
  }
};

/* ---------- Pantallas de los próximos bloques ---------- */
PANTALLAS.salida = () => enConstruccion('Registrar salida', 'inicio', 'Llega en el bloque 4.');
PANTALLAS.tutores = () => enConstruccion('Tutores', 'tutores', 'Llega en el bloque 4.');
PANTALLAS.historial = () => enConstruccion('Historial', 'historial', 'Llega en el bloque 4.');

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
const PANTALLAS_DE_LECTURA = ['inicio', 'productos', 'producto'];

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
  mostrarPantalla();
  refrescarDatos();
}

function actualizarEstado() {
  const caja = document.getElementById('estado');
  if (caja) caja.innerHTML = etiquetaEstado();
}

// Solo cambia de pantalla si la app está desbloqueada (si no, se queda en la pantalla del PIN).
window.addEventListener('hashchange', () => { if (document.querySelector('.encabezado')) mostrarPantalla(); });
window.addEventListener('online', () => { actualizarEstado(); if (Acceso.sesion()) refrescarDatos(); });
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
