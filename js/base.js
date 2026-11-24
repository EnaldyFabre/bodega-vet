/* ============================================================
   Piezas que comparten todas las pantallas:
   íconos, encabezado, menú inferior y el registro de pantallas.
   ============================================================ */

/** Aquí cada archivo agrega sus pantallas. Ej.: PANTALLAS.productos = { html(), init() } */
const PANTALLAS = {};

/* ---------- Íconos (dibujos simples de líneas) ---------- */
const ICONOS = {
  inicio: '<path d="M3 10l9-6 9 6v10H3z"/>',
  productos: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  tutores: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  historial: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  farmacia: '<rect x="3" y="9" width="18" height="6" rx="3" transform="rotate(-45 12 12)"/><path d="M9.5 9.5l5 5"/>',
  bodega: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  salida: '<path d="M12 5v14M5 12l7 7 7-7"/>',
  ingreso: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  nube: '<path d="M7 18a5 5 0 0 1-.6-9.96A6 6 0 0 1 18 9a4 4 0 0 1 0 9z"/>',
  volver: '<path d="M15 5l-7 7 7 7"/>',
  buscar: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  mas: '<path d="M12 5v14M5 12h14"/>'
};
function icono(nombre, clase = '') {
  return `<svg class="icono ${clase}" viewBox="0 0 24 24" aria-hidden="true">${ICONOS[nombre]}</svg>`;
}

/* ---------- Estado de conexión ---------- */
function registrosPendientes() {
  try { return (JSON.parse(localStorage.getItem('cola') || '[]')).length; } catch (e) { return 0; }
}
function etiquetaEstado() {
  const pendientes = registrosPendientes();
  if (!navigator.onLine) {
    return `<span class="estado sin-senal">${icono('nube')} Sin señal${pendientes ? ' · ' + pendientes + ' por subir' : ''}</span>`;
  }
  if (pendientes) return `<span class="estado pendiente">${icono('nube')} ${pendientes} por subir</span>`;
  return `<span class="estado ok">${icono('nube')} Al día</span>`;
}

/* ---------- Encabezado y menú ---------- */
function encabezado(titulo, opciones = {}) {
  const volver = opciones.volver
    ? `<a href="${opciones.volver}" class="boton-volver" aria-label="Volver">${icono('volver')}</a>` : '';
  return `
    <header class="encabezado">
      <div class="encabezado-titulo">
        ${volver}
        <div>
          <p class="sub">${opciones.subtitulo || 'Bodega Veterinaria'}</p>
          <h1>${titulo}</h1>
        </div>
      </div>
      <div id="estado">${etiquetaEstado()}</div>
    </header>`;
}

function menuInferior(activo) {
  const items = [['inicio', 'Inicio'], ['productos', 'Productos'], ['tutores', 'Tutores'], ['historial', 'Historial']];
  return `
    <nav class="menu" aria-label="Menú principal">
      ${items.map(([id, texto]) => `
        <a href="#${id}" class="${id === activo ? 'activo' : ''}" ${id === activo ? 'aria-current="page"' : ''}>
          ${icono(id)}${texto}
        </a>`).join('')}
    </nav>`;
}

function enConstruccion(titulo, menuActivo, mensaje) {
  return `
    ${encabezado(titulo)}
    <main class="contenido">
      <div class="en-construccion"><strong>En construcción</strong>${mensaje}</div>
    </main>
    ${menuInferior(menuActivo)}`;
}

/** Muestra un mensaje breve abajo de la pantalla (ej.: "Ingreso guardado"). */
function aviso(texto, tipo = 'ok') {
  let caja = document.getElementById('aviso-flotante');
  if (!caja) {
    caja = document.createElement('div');
    caja.id = 'aviso-flotante';
    caja.setAttribute('role', 'status');
    document.body.appendChild(caja);
  }
  caja.textContent = texto;
  caja.className = 'aviso-flotante ' + tipo + ' visible';
  clearTimeout(caja._t);
  caja._t = setTimeout(() => caja.classList.remove('visible'), 3500);
}
