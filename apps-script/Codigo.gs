/**
 * ============================================================
 *  Bodega API — Servidor de la app Bodega Veterinaria
 *  Bloques 2, 3 y 4: acceso, catálogo, ingresos, salidas y tutores
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

      // Bloque 3 (todas exigen una sesión válida)
      case 'datos':            return responder(obtenerDatos(validarSesion(datos.token)));
      case 'guardarProducto':  return responder(conBloqueo(() => guardarProducto(validarSesion(datos.token), datos.producto)));
      case 'registrarIngreso': return responder(conBloqueo(() => registrarIngreso(validarSesion(datos.token), datos)));

      // Bloque 4
      case 'registrarSalida':  return responder(conBloqueo(() => registrarSalida(validarSesion(datos.token), datos)));
      case 'guardarTutor':     return responder(conBloqueo(() => guardarTutor(validarSesion(datos.token), datos.tutor)));
      default:                return responder({ ok: false, error: 'Acción desconocida.' });
    }
  } catch (err) {
    return responder({ ok: false, error: err.message || String(err) });
  }
}

/** Si alguien abre la URL en el navegador, solo confirma que el servidor está vivo (sin datos). */
function doGet() {
  return responder({ ok: true, servicio: 'Bodega API', version: 'bloque 4' });
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
//  CATÁLOGO, STOCK E INGRESOS (Bloque 3)
// ============================================================

/** Entrega a la app todo lo que necesita mostrar: productos, stock, lotes y últimos movimientos. */
function obtenerDatos(usuario) {
  const productos = leerHoja('Productos').filter((p) => p.id);
  const documentos = {};
  leerHoja('Documentos').forEach((d) => { documentos[d.id] = d; });

  const lotes = leerHoja('Lotes').filter((l) => l.id).map((l) => {
    const d = documentos[l.documento_id] || {};
    return Object.assign(l, {
      doc_tipo: d.tipo || '', doc_numero: d.n_documento || '',
      fecha_recepcion: d.fecha_recepcion || '', proveedor: d.proveedor || ''
    });
  });

  // Stock = suma de ingresos − salidas (+/− ajustes), en unidades mínimas.
  const movimientos = leerHoja('Movimientos').filter((m) => m.id);
  const stock = {};
  movimientos.forEach((m) => {
    const cantidad = Number(m.cantidad_unidades) || 0;
    const signo = m.tipo === 'salida' ? -1 : 1; // en "ajuste" la cantidad ya viene con su signo
    stock[m.producto_id] = (stock[m.producto_id] || 0) + signo * cantidad;
  });

  return {
    ok: true,
    usuario: usuario,
    productos: productos,
    lotes: lotes,
    stock: stock,
    movimientos: movimientos.slice(-500), // los últimos 500, para fichas e historial
    tutores: leerHoja('Tutores').filter((t) => t.id),
    actualizado: new Date().toISOString()
  };
}

/** Crea un producto nuevo o actualiza uno existente (si trae id). */
function guardarProducto(usuario, p) {
  p = p || {};
  const nombre = String(p.nombre || '').trim();
  if (!nombre) throw new Error('El producto necesita un nombre.');
  if (['Farmacia', 'Bodega'].indexOf(p.tipo) < 0) throw new Error('El tipo debe ser Farmacia o Bodega.');

  const datos = {
    nombre: nombre,
    tipo: p.tipo,
    categoria: String(p.categoria || '').trim(),
    presentacion: String(p.presentacion || '').trim(),
    unidad_minima: String(p.unidad_minima || '').trim(),
    unidades_por_presentacion: numeroOVacio(p.unidades_por_presentacion),
    stock_minimo: numeroOVacio(p.stock_minimo),
    activo: p.activo === false || p.activo === 'no' ? 'no' : 'sí'
  };

  if (datos.unidad_minima && /^[\d.,\s]+$/.test(datos.unidad_minima)) {
    throw new Error('"En qué se cuenta" debe ser una palabra (ej.: comprimido), no un número.');
  }

  const productos = leerHoja('Productos').filter((x) => x.id);
  const repetido = productos.find((x) => x.nombre.toLowerCase() === nombre.toLowerCase() && x.id !== p.id);
  if (repetido) throw new Error('Ya existe un producto llamado "' + repetido.nombre + '".');

  if (p.id) {
    if (!productos.find((x) => x.id === p.id)) throw new Error('No se encontró el producto.');
    actualizarFila('Productos', p.id, datos);
    return { ok: true, producto: Object.assign({ id: p.id }, datos) };
  }

  datos.id = siguienteId(productos, 'P', 3);
  agregarFila('Productos', datos);
  return { ok: true, producto: datos };
}

/**
 * Registra un ingreso: un documento (factura, boleta, sin documento o inventario inicial)
 * con una o varias líneas de productos. Cada línea crea un lote y un movimiento de ingreso.
 */
function registrarIngreso(usuario, d) {
  const doc = d.documento || {};
  const lineas = d.lineas || [];
  const tipos = ['Factura', 'Boleta', 'Sin documento', 'Inventario inicial'];
  if (tipos.indexOf(doc.tipo) < 0) throw new Error('Tipo de documento no válido.');
  if (!lineas.length) throw new Error('Agrega al menos un producto.');
  const esInventario = doc.tipo === 'Inventario inicial';

  // Evita duplicados: si una línea ya se guardó antes (mismo id), se salta.
  const yaGuardados = {};
  leerHoja('Movimientos').forEach((m) => { yaGuardados[m.id] = true; });
  const nuevas = lineas.filter((l) => l.id_mov && !yaGuardados[l.id_mov]);
  if (!nuevas.length) return { ok: true, repetido: true, guardadas: 0 };

  // Revisa todas las líneas ANTES de escribir nada.
  const productos = {};
  leerHoja('Productos').forEach((p) => { productos[p.id] = p; });
  nuevas.forEach((l, i) => {
    const p = productos[l.producto_id];
    if (!p) throw new Error('Línea ' + (i + 1) + ': producto no encontrado.');
    if (l.completar) Object.assign(p, l.completar);
    if (!p.unidad_minima || /^[\d.,\s]+$/.test(String(p.unidad_minima))) {
      throw new Error(p.nombre + ': falta indicar en qué se cuenta (comprimido, ml…), como palabra.');
    }
    const upp = Number(p.unidades_por_presentacion);
    if (!(upp > 0)) throw new Error(p.nombre + ': falta indicar cuántas unidades trae cada ' + (p.presentacion || 'presentación') + '.');
    l.total = (Number(l.cantidad_presentaciones) || 0) * upp + (Number(l.unidades_sueltas) || 0);
    if (!(l.total > 0)) throw new Error(p.nombre + ': la cantidad debe ser mayor a cero.');
    if (p.tipo === 'Farmacia' && !esInventario && (!l.n_lote || !l.vencimiento)) {
      throw new Error(p.nombre + ': el N° de lote y el vencimiento son obligatorios en Farmacia.');
    }
  });

  // Documento: el inventario inicial usa siempre el mismo (D0001); los demás crean uno nuevo.
  const documentos = leerHoja('Documentos').filter((x) => x.id);
  let documentoId;
  const ahora = new Date();
  if (esInventario) {
    const inv = documentos.find((x) => x.tipo === 'Inventario inicial');
    if (!inv) throw new Error('No se encontró el documento de Inventario inicial en la planilla.');
    documentoId = inv.id;
  } else {
    documentoId = siguienteId(documentos, 'D', 4);
    agregarFila('Documentos', {
      id: documentoId,
      tipo: doc.tipo,
      n_documento: String(doc.n_documento || '').trim(),
      fecha_recepcion: String(doc.fecha_recepcion || '').trim(),
      proveedor: String(doc.proveedor || '').trim(),
      ingresado_por: usuario.nombre,
      fecha_hora_registro: ahora
    });
  }

  // Líneas: completa datos faltantes del producto, crea el lote y el movimiento.
  let lotes = leerHoja('Lotes').filter((x) => x.id);
  nuevas.forEach((l) => {
    if (l.completar) {
      actualizarFila('Productos', l.producto_id, {
        unidad_minima: String(l.completar.unidad_minima || '').trim(),
        unidades_por_presentacion: numeroOVacio(l.completar.unidades_por_presentacion),
        stock_minimo: numeroOVacio(l.completar.stock_minimo)
      });
    }
    const loteId = siguienteId(lotes, 'L', 5);
    const lote = {
      id: loteId,
      documento_id: documentoId,
      producto_id: l.producto_id,
      cantidad_presentaciones: Number(l.cantidad_presentaciones) || 0,
      cantidad_unidades: l.total,
      n_lote: String(l.n_lote || '').trim(),
      vencimiento: String(l.vencimiento || '').trim(),
      alerta_revisada: 'no'
    };
    agregarFila('Lotes', lote);
    lotes = lotes.concat([lote]);

    agregarFila('Movimientos', {
      id: l.id_mov,
      fecha_hora: ahora,
      producto_id: l.producto_id,
      lote_id: loteId,
      tipo: 'ingreso',
      cantidad_unidades: l.total,
      usuario: usuario.nombre,
      observacion: String(l.observacion || '').trim(),
      id_dispositivo: String(d.id_dispositivo || '')
    });
  });

  return { ok: true, documento_id: documentoId, guardadas: nuevas.length };
}

// ============================================================
//  SALIDAS Y TUTORES (Bloque 4)
// ============================================================

/** Registra una salida (descuenta del stock común) y, si corresponde, a quién se entregó. */
function registrarSalida(usuario, d) {
  const s = d.salida || {};
  if (!s.id_mov) throw new Error('Falta el identificador del registro.');

  // Evita duplicados si el teléfono reintenta.
  const repetido = leerHoja('Movimientos').some((m) => m.id === s.id_mov);
  if (repetido) return { ok: true, repetido: true };

  const producto = leerHoja('Productos').find((p) => p.id === s.producto_id);
  if (!producto) throw new Error('Producto no encontrado.');
  const cantidad = Number(s.cantidad_unidades);
  if (!(cantidad > 0)) throw new Error('La cantidad debe ser mayor a cero.');
  if (s.especie && ['Perro', 'Gato'].indexOf(s.especie) < 0) throw new Error('Especie no válida.');

  let tutorId = '';
  if (s.tutor && s.tutor.rut) tutorId = guardarTutor(usuario, s.tutor).tutor.id;

  agregarFila('Movimientos', {
    id: s.id_mov,
    fecha_hora: new Date(),
    producto_id: producto.id,
    lote_id: '',
    tipo: 'salida',
    cantidad_unidades: cantidad,
    usuario: usuario.nombre,
    tutor_id: tutorId,
    especie: s.especie || '',
    observacion: String(s.observacion || '').trim(),
    id_dispositivo: String(d.id_dispositivo || '')
  });

  return { ok: true, tutor_id: tutorId };
}

/** Crea un tutor nuevo o actualiza sus datos (se busca por RUT). */
function guardarTutor(usuario, t) {
  t = t || {};
  const rut = limpiarRut(t.rut);
  if (!rutValido(rut)) throw new Error('El RUT ' + (t.rut || '') + ' no es válido.');
  const nombre = String(t.nombre || '').trim();
  if (!nombre) throw new Error('Falta el nombre del tutor.');

  const datos = {
    rut: formatearRut(rut),
    nombre: nombre,
    direccion: String(t.direccion || '').trim(),
    telefono: String(t.telefono || '').trim()
  };

  const tutores = leerHoja('Tutores').filter((x) => x.id);
  const existente = tutores.find((x) => limpiarRut(x.rut) === rut);
  if (existente) {
    actualizarFila('Tutores', existente.id, datos);
    return { ok: true, tutor: Object.assign({}, existente, datos) };
  }

  datos.id = siguienteId(tutores, 'T', 5);
  datos.fecha_registro = new Date();
  datos.registrado_por = usuario.nombre;
  agregarFila('Tutores', datos);
  return { ok: true, tutor: datos };
}

/** "12.345.678-5" → "123456785" (sin puntos ni guion, K mayúscula) */
function limpiarRut(rut) {
  return String(rut || '').replace(/[^0-9kK]/g, '').toUpperCase();
}

/** Revisa el dígito verificador (módulo 11). */
function rutValido(rut) {
  if (!/^\d{7,8}[0-9K]$/.test(rut)) return false;
  const cuerpo = rut.slice(0, -1);
  let suma = 0, factor = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  const dv = resto === 11 ? '0' : resto === 10 ? 'K' : String(resto);
  return dv === rut.slice(-1);
}

/** "123456785" → "12.345.678-5" */
function formatearRut(rut) {
  const cuerpo = rut.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return cuerpo + '-' + rut.slice(-1);
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

// Columnas que se guardan como texto (para que la planilla no las convierta en fechas o números).
const COLUMNAS_TEXTO = ['id', 'n_lote', 'vencimiento', 'n_documento', 'fecha_recepcion', 'rut', 'telefono',
  'producto_id', 'documento_id', 'lote_id', 'tutor_id'];

/** Lee una hoja completa y la entrega como lista de objetos {columna: valor}. */
function leerHoja(nombre) {
  const filas = SpreadsheetApp.getActive().getSheetByName(nombre).getDataRange().getValues();
  const titulos = filas.shift();
  return filas.map((fila) => {
    const obj = {};
    titulos.forEach((t, i) => {
      let v = fila[i];
      if (v instanceof Date) v = Utilities.formatDate(v, 'America/Santiago', "yyyy-MM-dd'T'HH:mm");
      obj[t] = v;
      if (COLUMNAS_TEXTO.indexOf(t) >= 0 && v !== '') obj[t] = String(v);
    });
    return obj;
  });
}

/** Agrega una fila al final de una hoja, ubicando cada dato bajo su columna. */
function agregarFila(nombre, obj) {
  const hoja = SpreadsheetApp.getActive().getSheetByName(nombre);
  const titulos = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
  const fila = hoja.getLastRow() + 1;
  titulos.forEach((t, i) => {
    if (COLUMNAS_TEXTO.indexOf(t) >= 0) hoja.getRange(fila, i + 1).setNumberFormat('@');
  });
  hoja.getRange(fila, 1, 1, titulos.length).setValues([titulos.map((t) => (obj[t] === undefined ? '' : obj[t]))]);
}

/** Cambia algunas columnas de la fila cuyo id coincide. */
function actualizarFila(nombre, id, cambios) {
  const hoja = SpreadsheetApp.getActive().getSheetByName(nombre);
  const datos = hoja.getDataRange().getValues();
  const titulos = datos[0];
  for (let r = 1; r < datos.length; r++) {
    if (String(datos[r][0]) === String(id)) {
      Object.keys(cambios).forEach((c) => {
        const col = titulos.indexOf(c);
        if (col < 0) return;
        const celda = hoja.getRange(r + 1, col + 1);
        if (COLUMNAS_TEXTO.indexOf(c) >= 0) celda.setNumberFormat('@');
        celda.setValue(cambios[c]);
      });
      return;
    }
  }
  throw new Error('No se encontró ' + id + ' en ' + nombre + '.');
}

/** Siguiente id correlativo: P040, D0002, L00001… */
function siguienteId(lista, prefijo, digitos) {
  let max = 0;
  lista.forEach((x) => {
    const n = parseInt(String(x.id).replace(prefijo, ''), 10);
    if (n > max) max = n;
  });
  return prefijo + String(max + 1).padStart(digitos, '0');
}

function numeroOVacio(v) {
  return v === '' || v === null || v === undefined || isNaN(Number(v)) ? '' : Number(v);
}

/** Evita que dos teléfonos escriban al mismo tiempo y se pisen. */
function conBloqueo(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
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
