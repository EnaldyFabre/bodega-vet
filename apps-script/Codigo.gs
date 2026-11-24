/**
 * ============================================================
 *  Bodega API — Servidor de la app Bodega Veterinaria
 *  Bloque 2: acceso con código por correo + sesiones
 *
 *  Se pega en: planilla "App Bodega - Base de datos" → Extensiones → Apps Script
 *  Reemplaza por completo al código de prueba.
 * ============================================================
 */

// ---------- Ajustes ----------
const MINUTOS_CODIGO = 10;        // cuánto dura un código enviado por correo
const MAX_INTENTOS_CODIGO = 5;    // intentos para escribir bien el código
const SEGUNDOS_ENTRE_CODIGOS = 60; // espera mínima para pedir otro código
const DIAS_SESION = 180;          // cuánto dura una sesión en un teléfono

/**
 * Entrada principal: la app envía {accion: "...", ...datos} y aquí se decide qué hacer.
 */
function doPost(e) {
  try {
    const datos = JSON.parse(e.postData.contents || '{}');

    switch (datos.accion) {
      case 'solicitarCodigo': return responder(solicitarCodigo(datos.correo));
      case 'verificarCodigo': return responder(verificarCodigo(datos.correo, datos.codigo));
      case 'sesion':          return responder({ ok: true, usuario: validarSesion(datos.token) });
      case 'cerrarSesion':    return responder(cerrarSesion(datos.token));
      default:                return responder({ ok: false, error: 'Acción desconocida.' });
    }
  } catch (err) {
    return responder({ ok: false, error: err.message || String(err) });
  }
}

/** Si alguien abre la URL en el navegador, solo confirma que el servidor está vivo (sin datos). */
function doGet() {
  return responder({ ok: true, servicio: 'Bodega API', version: 'bloque 2' });
}

// ============================================================
//  ACCESO
// ============================================================

/** Paso 1: la persona escribe su correo; si está en la hoja Usuarios, se le envía un código. */
function solicitarCodigo(correo) {
  correo = normalizarCorreo(correo);
  const usuario = buscarUsuario(correo);

  // Misma respuesta exista o no el correo, para no revelar quién está registrado.
  const respuesta = { ok: true, mensaje: 'Si el correo está registrado, te llegará un código en unos segundos.' };
  if (!usuario) return respuesta;

  const cache = CacheService.getScriptCache();
  if (cache.get('espera_' + correo)) {
    return { ok: false, error: 'Ya enviamos un código hace poco. Espera un minuto y vuelve a intentar.' };
  }

  const codigo = String(Math.floor(100000 + Math.random() * 900000)); // 6 dígitos
  cache.put('codigo_' + correo, JSON.stringify({ codigo: codigo, intentos: 0 }), MINUTOS_CODIGO * 60);
  cache.put('espera_' + correo, '1', SEGUNDOS_ENTRE_CODIGOS);

  MailApp.sendEmail({
    to: correo,
    name: 'Bodega Veterinaria',
    subject: 'Tu código para entrar a Bodega Veterinaria: ' + codigo,
    body:
      'Hola ' + usuario.nombre + ',\n\n' +
      'Tu código para activar la app en tu teléfono es: ' + codigo + '\n\n' +
      'Vence en ' + MINUTOS_CODIGO + ' minutos. Si no lo pediste tú, ignora este correo.\n'
  });

  return respuesta;
}

/** Paso 2: la persona escribe el código. Si es correcto, se crea una sesión para su teléfono. */
function verificarCodigo(correo, codigo) {
  correo = normalizarCorreo(correo);
  const cache = CacheService.getScriptCache();
  const guardado = cache.get('codigo_' + correo);
  if (!guardado) return { ok: false, error: 'El código venció o no existe. Pide uno nuevo.' };

  const info = JSON.parse(guardado);
  if (info.intentos >= MAX_INTENTOS_CODIGO) {
    cache.remove('codigo_' + correo);
    return { ok: false, error: 'Demasiados intentos. Pide un código nuevo.' };
  }

  if (String(codigo).trim() !== info.codigo) {
    info.intentos++;
    cache.put('codigo_' + correo, JSON.stringify(info), MINUTOS_CODIGO * 60);
    return { ok: false, error: 'Código incorrecto. Te quedan ' + (MAX_INTENTOS_CODIGO - info.intentos) + ' intentos.' };
  }

  // Código correcto: se borra (sirve una sola vez) y se crea la sesión.
  cache.remove('codigo_' + correo);
  const usuario = buscarUsuario(correo);
  if (!usuario) return { ok: false, error: 'Este correo ya no está autorizado.' };

  const token = Utilities.getUuid() + Utilities.getUuid(); // llave larga e imposible de adivinar
  PropertiesService.getScriptProperties().setProperty(
    'ses_' + hash(token),
    JSON.stringify({ correo: correo, creada: Date.now() })
  );

  return { ok: true, token: token, usuario: usuario };
}

/**
 * Revisa que la llave (token) de un teléfono sea válida y que la persona siga en la hoja Usuarios.
 * Todas las acciones con datos (bloques 3, 4 y 5) pasarán primero por aquí.
 */
function validarSesion(token) {
  if (!token) throw new Error('SESION_INVALIDA');
  const props = PropertiesService.getScriptProperties();
  const clave = 'ses_' + hash(token);
  const guardada = props.getProperty(clave);
  if (!guardada) throw new Error('SESION_INVALIDA');

  const sesion = JSON.parse(guardada);
  if (Date.now() - sesion.creada > DIAS_SESION * 24 * 60 * 60 * 1000) {
    props.deleteProperty(clave);
    throw new Error('SESION_INVALIDA');
  }

  // Si alguien fue borrado de la hoja Usuarios, pierde el acceso de inmediato.
  const usuario = buscarUsuario(sesion.correo);
  if (!usuario) {
    props.deleteProperty(clave);
    throw new Error('SESION_INVALIDA');
  }
  return usuario;
}

function cerrarSesion(token) {
  if (token) PropertiesService.getScriptProperties().deleteProperty('ses_' + hash(token));
  return { ok: true };
}

// ============================================================
//  AYUDANTES
// ============================================================

/** Busca un correo en la hoja Usuarios. Devuelve {id, nombre, correo, rol} o null. */
function buscarUsuario(correo) {
  const filas = SpreadsheetApp.getActive().getSheetByName('Usuarios').getDataRange().getValues();
  const titulos = filas[0];
  const col = (nombre) => titulos.indexOf(nombre);

  for (let i = 1; i < filas.length; i++) {
    if (normalizarCorreo(filas[i][col('correo')]) === correo) {
      return {
        id: filas[i][col('id')],
        nombre: filas[i][col('nombre')],
        correo: correo,
        rol: filas[i][col('rol')]
      };
    }
  }
  return null;
}

function normalizarCorreo(correo) {
  return String(correo || '').trim().toLowerCase();
}

/** Convierte un texto en una "huella" (SHA-256). Así las llaves nunca se guardan tal cual. */
function hash(texto) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, texto);
  return bytes.map((b) => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

/** Entrega la respuesta en formato JSON, que es lo que entiende la app. */
function responder(datos) {
  return ContentService.createTextOutput(JSON.stringify(datos))
    .setMimeType(ContentService.MimeType.JSON);
}
