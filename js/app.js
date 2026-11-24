/* ============================================================
   App Bodega Veterinaria — Bloques 1 y 2: estructura base y acceso
   - Dibuja las pantallas (por ahora, Inicio completo y el resto "en construcción")
   - Cambia de pantalla según la dirección (#inicio, #productos, etc.)
   - Muestra si hay señal y cuántos registros faltan por subir
   - Registra el "service worker" para que la app funcione sin señal
   ============================================================ */

const VERSION_APP = '0.2 (bloque 2)';

/* ---------- 1. Íconos (dibujos simples de líneas) ---------- */
const ICONOS = {
  inicio: '<path d="M3 10l9-6 9 6v10H3z"/>',
  productos: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  tutores: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  historial: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  farmacia: '<rect x="3" y="9" width="18" height="6" rx="3" transform="rotate(-45 12 12)"/><path d="M9.5 9.5l5 5"/>',
  bodega: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  salida: '<path d="M12 5v14M5 12l7 7 7-7"/>',
  ingreso: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  nube: '<path d="M7 18a5 5 0 0 1-.6-9.96A6 6 0 0 1 18 9a4 4 0 0 1 0 9z"/>'
};
function icono(nombre, clase = '') {
  return `<svg class="icono ${clase}" viewBox="0 0 24 24" aria-hidden="true">${ICONOS[nombre]}</svg>`;
}

/* ---------- 2. Estado de conexión y registros pendientes ---------- */
// Cuántos registros esperan subirse. En el bloque 5 esto vendrá de la cola real.
function registrosPendientes() {
  try {
    const cola = JSON.parse(localStorage.getItem('cola') || '[]');
    return cola.length;
  } catch (e) {
    return 0;
  }
}

function etiquetaEstado() {
  const pendientes = registrosPendientes();
  if (!navigator.onLine) {
    return `<span class="estado sin-senal">${icono('nube')} Sin señal${pendientes ? ' · ' + pendientes + ' por subir' : ''}</span>`;
  }
  if (pendientes) {
    return `<span class="estado pendiente">${icono('nube')} ${pendientes} por subir</span>`;
  }
  return `<span class="estado ok">${icono('nube')} Al día</span>`;
}

/* ---------- 3. Partes que se repiten: encabezado y menú inferior ---------- */
function encabezado(titulo, subtitulo = 'Bodega Veterinaria') {
  return `
    <header class="encabezado">
      <div>
        <p class="sub">${subtitulo}</p>
        <h1>${titulo}</h1>
      </div>
      <div id="estado">${etiquetaEstado()}</div>
    </header>`;
}

function menuInferior(activo) {
  const items = [
    ['inicio', 'Inicio'], ['productos', 'Productos'], ['tutores', 'Tutores'], ['historial', 'Historial']
  ];
  return `
    <nav class="menu" aria-label="Menú principal">
      ${items.map(([id, texto]) => `
        <a href="#${id}" class="${id === activo ? 'activo' : ''}" ${id === activo ? 'aria-current="page"' : ''}>
          ${icono(id)}${texto}
        </a>`).join('')}
    </nav>`;
}

/* ---------- 4. Pantallas ---------- */
const PANTALLAS = {
  inicio() {
    return `
      ${encabezado('Hola, ' + escapar((Acceso.usuario() || {}).nombre || ''))}
      <main class="contenido">
        <section class="tarjeta">
          <p class="titulo-seccion" style="margin:0 0 10px">Avisos</p>
          <p class="vacio">Sin avisos por ahora. Aquí aparecerán los lotes por vencer y los productos bajo el mínimo.</p>
        </section>

        <div class="modulos">
          <a href="#productos/farmacia" class="modulo farmacia">
            ${icono('farmacia', 'grande')}
            <span><span class="nombre">Farmacia</span><span class="detalle">Fármacos</span></span>
          </a>
          <a href="#productos/bodega" class="modulo bodega">
            ${icono('bodega', 'grande')}
            <span><span class="nombre">Bodega</span><span class="detalle">Insumos</span></span>
          </a>
        </div>

        <p class="titulo-seccion">Acciones rápidas</p>
        <a href="#salida" class="accion">${icono('salida')} Registrar salida</a>
        <a href="#ingreso" class="accion">${icono('ingreso')} Registrar ingreso</a>

        <p class="pie-version">Versión ${VERSION_APP}</p>
        <button class="boton-texto" id="cerrar-sesion" type="button">Cerrar sesión en este teléfono</button>
      </main>
      ${menuInferior('inicio')}`;
  },

  productos(tipo) {
    const titulo = tipo === 'bodega' ? 'Bodega' : tipo === 'farmacia' ? 'Farmacia' : 'Productos';
    return enConstruccion(titulo, 'productos', 'La lista de productos llega en el bloque 3.');
  },
  salida()   { return enConstruccion('Registrar salida', 'inicio', 'Llega en el bloque 4.'); },
  ingreso()  { return enConstruccion('Registrar ingreso', 'inicio', 'Llega en el bloque 3.'); },
  tutores()  { return enConstruccion('Tutores', 'tutores', 'Llega en el bloque 4.'); },
  historial(){ return enConstruccion('Historial', 'historial', 'Llega en el bloque 4.'); }
};

function enConstruccion(titulo, menuActivo, mensaje) {
  return `
    ${encabezado(titulo)}
    <main class="contenido">
      <div class="en-construccion"><strong>En construcción</strong>${mensaje}</div>
    </main>
    ${menuInferior(menuActivo)}`;
}

/* ---------- 5. Navegación: muestra la pantalla según la dirección ---------- */
// Ejemplos: "#inicio" → Inicio; "#productos/farmacia" → Productos de Farmacia
function mostrarPantalla() {
  const [nombre, detalle] = (location.hash.replace('#', '') || 'inicio').split('/');
  const pantalla = PANTALLAS[nombre] || PANTALLAS.inicio;
  document.getElementById('app').innerHTML = pantalla(detalle);
  window.scrollTo(0, 0);

  const salir = document.getElementById('cerrar-sesion');
  if (salir) salir.addEventListener('click', Acceso.cerrarSesion);
}

/* La llama acceso.js cuando la persona ya entró con su PIN. */
function iniciarApp() {
  mostrarPantalla();
}

// Actualiza solo la etiqueta de estado cuando se pierde o vuelve la señal
function actualizarEstado() {
  const caja = document.getElementById('estado');
  if (caja) caja.innerHTML = etiquetaEstado();
}

// Solo cambia de pantalla si la app está desbloqueada (si no, se queda en la pantalla del PIN).
window.addEventListener('hashchange', () => { if (document.querySelector('.menu')) mostrarPantalla(); });
window.addEventListener('online', actualizarEstado);
window.addEventListener('offline', actualizarEstado);

// Al abrir la app, primero se revisa el acceso (correo/código/PIN).
Acceso.comenzar();

/* ---------- 6. Funcionamiento sin señal ---------- */
// Registra el service worker (sw.js), que guarda la app en el teléfono.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((error) => {
      console.error('No se pudo activar el modo sin señal:', error);
    });
  });
}
