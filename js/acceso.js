/* ============================================================
   Acceso a la app — Bloque 2
   1) Primera vez en un teléfono: correo → código por correo → crear PIN.
   2) Después: solo PIN (funciona sin señal).
   El PIN nunca sale del teléfono: se guarda como "huella" (hash), no el número.
   ============================================================ */

const Acceso = (() => {
  const MINUTOS_BLOQUEO = 10;  // si la app queda sin usar este tiempo, pide el PIN de nuevo
  const MAX_INTENTOS_PIN = 5;  // al quinto PIN malo, hay que volver a validar con el correo

  let correoEnCurso = '';     // correo escrito en el paso 1, mientras se espera el código
  let sesionNueva = null;     // sesión recibida en el paso 2, antes de crear el PIN

  // ---------- Lo que queda guardado en el teléfono ----------
  const guardar = (clave, valor) => localStorage.setItem(clave, JSON.stringify(valor));
  const leer = (clave) => {
    try { return JSON.parse(localStorage.getItem(clave)); } catch (e) { return null; }
  };

  function sesion() { return leer('sesion'); }        // {token, usuario}
  function usuario() { return (sesion() || {}).usuario || null; }

  function olvidarTelefono() {
    // Borra la sesión y la copia de datos de este teléfono.
    ['sesion', 'pinHash', 'intentosPin', 'datos', 'borradorIngreso', 'borradorAdjuntos', 'borradorSalida', 'ultimaPantalla'].forEach((c) => localStorage.removeItem(c));
    sessionStorage.removeItem('desbloqueado');
  }

  // ---------- Bloqueo por inactividad ----------
  function estaDesbloqueado() {
    const desde = Number(sessionStorage.getItem('desbloqueado') || 0);
    return desde && Date.now() - desde < MINUTOS_BLOQUEO * 60 * 1000;
  }
  function marcarActividad() {
    if (estaDesbloqueado()) sessionStorage.setItem('desbloqueado', String(Date.now()));
  }
  ['click', 'keydown', 'touchstart'].forEach((ev) => document.addEventListener(ev, marcarActividad, { passive: true }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && sesion() && !estaDesbloqueado()) mostrarPin();
  });

  // ---------- Huella del PIN ----------
  async function huella(texto) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
    return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  const huellaPin = (pin, correo) => huella('bodega:' + correo + ':' + pin);

  // ---------- Dibujo de pantallas ----------
  function pantalla(titulo, subtitulo, cuerpo) {
    document.getElementById('app').innerHTML = `
      <main class="acceso">
        <div class="logo-acceso" aria-hidden="true">B</div>
        <h1>${titulo}</h1>
        <p class="sub-acceso">${subtitulo}</p>
        <div class="franja" aria-hidden="true"><span></span><span></span></div>
        ${cuerpo}
        <p id="mensaje" class="mensaje" role="alert"></p>
      </main>`;
    const primerCampo = document.querySelector('.acceso input');
    if (primerCampo) primerCampo.focus();
  }

  function mensaje(texto, tipo = 'error') {
    const caja = document.getElementById('mensaje');
    if (caja) { caja.textContent = texto; caja.className = 'mensaje ' + tipo; }
  }

  function ocupado(boton, si, texto) {
    boton.disabled = si;
    if (texto) boton.textContent = texto;
  }

  // ---------- Paso 1: correo ----------
  function mostrarCorreo() {
    pantalla('Bodega Veterinaria', 'Activa la app en este teléfono', `
      <form id="form-correo" class="form-acceso">
        <label for="correo">Tu correo</label>
        <input id="correo" type="email" autocomplete="email" required placeholder="nombre@correo.cl">
        <button class="boton-principal" type="submit">Enviarme un código</button>
        <p class="ayuda">Te enviaremos un código de 6 dígitos. Necesitas señal solo esta vez.</p>
      </form>`);

    document.getElementById('form-correo').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const boton = ev.target.querySelector('button');
      correoEnCurso = document.getElementById('correo').value.trim().toLowerCase();
      ocupado(boton, true, 'Enviando…');
      try {
        await llamarServidor('solicitarCodigo', { correo: correoEnCurso });
        mostrarCodigo();
      } catch (e) {
        mensaje(e.message);
        ocupado(boton, false, 'Enviarme un código');
      }
    });
  }

  // ---------- Paso 2: código ----------
  function mostrarCodigo() {
    pantalla('Revisa tu correo', `Si <strong>${escapar(correoEnCurso)}</strong> está autorizado, te llegó un código. Revisa también la carpeta de spam.`, `
      <form id="form-codigo" class="form-acceso">
        <label for="codigo">Código de 6 dígitos</label>
        <input id="codigo" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required class="campo-grande">
        <button class="boton-principal" type="submit">Verificar</button>
        <button class="boton-texto" type="button" id="otro-correo">Usar otro correo o pedir otro código</button>
      </form>`);

    document.getElementById('otro-correo').addEventListener('click', mostrarCorreo);
    document.getElementById('form-codigo').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const boton = ev.target.querySelector('.boton-principal');
      ocupado(boton, true, 'Verificando…');
      try {
        const r = await llamarServidor('verificarCodigo', {
          correo: correoEnCurso,
          codigo: document.getElementById('codigo').value
        });
        sesionNueva = { token: r.token, usuario: r.usuario };
        mostrarCrearPin();
      } catch (e) {
        mensaje(e.message);
        ocupado(boton, false, 'Verificar');
      }
    });
  }

  // ---------- Paso 3: crear PIN ----------
  function mostrarCrearPin() {
    pantalla(`Hola, ${escapar(sesionNueva.usuario.nombre)}`, 'Crea un PIN de 4 dígitos para entrar desde ahora, también sin señal.', `
      <form id="form-crear-pin" class="form-acceso">
        <label for="pin1">Nuevo PIN</label>
        <input id="pin1" type="password" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" required class="campo-grande" autocomplete="new-password">
        <label for="pin2">Repite el PIN</label>
        <input id="pin2" type="password" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" required class="campo-grande" autocomplete="new-password">
        <button class="boton-principal" type="submit">Guardar PIN</button>
      </form>`);

    document.getElementById('form-crear-pin').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const pin1 = document.getElementById('pin1').value;
      const pin2 = document.getElementById('pin2').value;
      if (!/^\d{4}$/.test(pin1)) return mensaje('El PIN debe tener 4 números.');
      if (pin1 !== pin2) return mensaje('Los PIN no coinciden.');
      if (/^(\d)\1{3}$/.test(pin1) || pin1 === '1234') return mensaje('Ese PIN es muy fácil de adivinar. Elige otro.');

      guardar('sesion', sesionNueva);
      guardar('pinHash', await huellaPin(pin1, sesionNueva.usuario.correo));
      guardar('intentosPin', 0);
      sesionNueva = null;
      entrar();
    });
  }

  // ---------- Uso diario: PIN ----------
  function mostrarPin() {
    const u = usuario();
    pantalla(`Hola, ${escapar(u.nombre)}`, 'Ingresa tu PIN', `
      <form id="form-pin" class="form-acceso">
        <label for="pin" class="oculto">PIN</label>
        <input id="pin" type="password" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" required class="campo-grande" autocomplete="current-password">
        <button class="boton-principal" type="submit">Entrar</button>
        <button class="boton-texto" type="button" id="olvide">Olvidé mi PIN</button>
      </form>`);

    const campo = document.getElementById('pin');
    // Entra solo al escribir el cuarto número, sin tener que tocar el botón.
    campo.addEventListener('input', () => { if (campo.value.length === 4) revisarPin(); });
    document.getElementById('form-pin').addEventListener('submit', (ev) => { ev.preventDefault(); revisarPin(); });
    document.getElementById('olvide').addEventListener('click', () => {
      if (confirmarReinicio()) { olvidarTelefono(); mostrarCorreo(); }
    });
  }

  async function revisarPin() {
    const campo = document.getElementById('pin');
    const correcto = (await huellaPin(campo.value, usuario().correo)) === leer('pinHash');
    if (correcto) {
      guardar('intentosPin', 0);
      return entrar();
    }
    const intentos = (leer('intentosPin') || 0) + 1;
    guardar('intentosPin', intentos);
    campo.value = '';
    if (intentos >= MAX_INTENTOS_PIN) {
      olvidarTelefono();
      mostrarCorreo();
      return mensaje('Demasiados intentos. Vuelve a activar la app con tu correo.');
    }
    mensaje(`PIN incorrecto. Te quedan ${MAX_INTENTOS_PIN - intentos} intentos.`);
  }

  function confirmarReinicio() {
    // Se usa un mensaje en la misma pantalla (no una ventana emergente) para que funcione igual en iPhone.
    const caja = document.getElementById('mensaje');
    if (caja && caja.dataset.confirmar === '1') return true;
    if (caja) {
      caja.dataset.confirmar = '1';
      mensaje('Para crear un PIN nuevo tendrás que validar tu correo otra vez (necesitas señal). Toca "Olvidé mi PIN" de nuevo para seguir.', 'info');
    }
    return false;
  }

  // ---------- Entrar y salir ----------
  function entrar() {
    sessionStorage.setItem('desbloqueado', String(Date.now()));
    iniciarApp();
  }

  async function cerrarSesion() {
    const s = sesion();
    try { if (s && navigator.onLine) await llamarServidor('cerrarSesion', { token: s.token }); } catch (e) { /* sin problema */ }
    olvidarTelefono();
    location.hash = '';
    mostrarCorreo();
  }

  /** Punto de partida: decide qué pantalla de acceso mostrar, o abre la app. */
  function comenzar() {
    if (!sesion() || !leer('pinHash')) return mostrarCorreo();
    if (!estaDesbloqueado()) return mostrarPin();
    iniciarApp();
  }

  return { comenzar, usuario, sesion, cerrarSesion, olvidarTelefono };
})();

/** Evita que un texto con símbolos raros se interprete como código. */
function escapar(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
