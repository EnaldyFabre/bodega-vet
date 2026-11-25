/**
 * ============================================================
 *  Bodega API — Servidor de la app Bodega Veterinaria
 *  Versión 2: acceso, catálogo, ingresos, salidas, tutores, lotes, alertas,
 *  adjuntos y exportación a Excel
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
const ID_CARPETA_ADJUNTOS = '1idykcwdbH6SmjpF1Nd8vP68C9NrOBcMH';     // "2. Adjuntos" en el Drive de Matías
const ID_CARPETA_EXPORTACIONES = '1rPv1Q6Dmi9h5dUzWoHuSRa4jn3RJlYul'; // "3. Exportaciones Excel"
const MAX_MB_ADJUNTO = 10;

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

      // Bloque 5
      case 'actualizarLote':   return responder(conBloqueo(() => actualizarLote(validarSesion(datos.token), datos.lote)));

      // Versión 2
      case 'subirAdjunto':     return responder(conBloqueo(() => subirAdjunto(validarSesion(datos.token), datos)));
      case 'adjuntos':         return responder(listarAdjuntos(validarSesion(datos.token), datos.documento_id));
      case 'verAdjunto':       return responder(verAdjunto(validarSesion(datos.token), datos.documento_id, datos.archivo_id));
      case 'borrarAdjunto':    return responder(conBloqueo(() => borrarAdjunto(validarSesion(datos.token), datos.documento_id, datos.archivo_id)));
      case 'exportar':         return responder(exportarExcel(validarSesion(datos.token), datos));
      default:                return responder({ ok: false, error: 'Acción desconocida.' });
    }
  } catch (err) {
    return responder({ ok: false, error: err.message || String(err) });
  }
}

/** Si alguien abre la URL en el navegador, solo confirma que el servidor está vivo (sin datos). */
function doGet() {
  return responder({ ok: true, servicio: 'Bodega API', version: 'version 2.1' });
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
    documentos: Object.keys(documentos).map((k) => documentos[k]).filter((d) => d.id),
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

/**
 * Cambia datos de un lote: completar N° de lote y vencimiento (inventario inicial)
 * o marcar su aviso de vencimiento como revisado.
 */
function actualizarLote(usuario, l) {
  l = l || {};
  const lote = leerHoja('Lotes').find((x) => x.id === l.id);
  if (!lote) throw new Error('No se encontró el lote.');
  const cambios = {};
  if (l.n_lote !== undefined) cambios.n_lote = String(l.n_lote).trim();
  if (l.vencimiento !== undefined) {
    if (!/^\d{4}-\d{2}$/.test(l.vencimiento)) throw new Error('El vencimiento debe tener mes y año.');
    cambios.vencimiento = l.vencimiento;
    if (l.vencimiento !== lote.vencimiento) cambios.alerta_revisada = 'no'; // fecha nueva = aviso nuevo
  }
  if (l.alerta_revisada !== undefined) {
    if (['sí', 'no'].indexOf(l.alerta_revisada) < 0) throw new Error('Valor no válido.');
    cambios.alerta_revisada = l.alerta_revisada;
  }
  actualizarFila('Lotes', l.id, cambios);
  return { ok: true };
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
//  ADJUNTOS (Versión 2)
//  Cada documento (factura, boleta…) tiene su propia subcarpeta dentro de "Adjuntos".
//  Los archivos quedan privados en el Drive de Matías: la app los muestra a través del servidor.
// ============================================================

function carpetaDeDocumento(documentoId, crear) {
  const doc = leerHoja('Documentos').find((d) => d.id === documentoId);
  if (!doc) throw new Error('No se encontró el documento.');
  if (doc.carpeta_adjuntos) {
    try { return DriveApp.getFolderById(doc.carpeta_adjuntos); } catch (e) { /* se borró: se crea otra */ }
  }
  if (!crear) return null;
  const nombre = documentoId + ' - ' + doc.tipo + (doc.n_documento ? ' ' + doc.n_documento : '') + (doc.proveedor ? ' - ' + doc.proveedor : '');
  const carpeta = DriveApp.getFolderById(ID_CARPETA_ADJUNTOS).createFolder(nombre);
  actualizarFila('Documentos', documentoId, { carpeta_adjuntos: carpeta.getId() });
  return carpeta;
}

function subirAdjunto(usuario, d) {
  const tipos = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (tipos.indexOf(d.tipo_mime) < 0) throw new Error('Solo se aceptan fotos (JPG, PNG) o PDF.');
  const bytes = Utilities.base64Decode(d.base64 || '');
  if (!bytes.length) throw new Error('El archivo está vacío.');
  if (bytes.length > MAX_MB_ADJUNTO * 1024 * 1024) throw new Error('El archivo supera ' + MAX_MB_ADJUNTO + ' MB.');

  const carpeta = carpetaDeDocumento(d.documento_id, true);
  const limpio = String(d.nombre || 'adjunto').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
  const archivo = carpeta.createFile(Utilities.newBlob(bytes, d.tipo_mime, limpio));
  archivo.setDescription('Subido por ' + usuario.nombre + ' desde la app Bodega');
  return { ok: true, archivo: { id: archivo.getId(), nombre: archivo.getName() } };
}

function listarAdjuntos(usuario, documentoId) {
  const carpeta = carpetaDeDocumento(documentoId, false);
  const lista = [];
  if (carpeta) {
    const it = carpeta.getFiles();
    while (it.hasNext()) {
      const f = it.next();
      if (f.isTrashed()) continue;
      lista.push({
        id: f.getId(), nombre: f.getName(), tipo_mime: f.getMimeType(),
        kb: Math.round(f.getSize() / 1024),
        fecha: Utilities.formatDate(f.getDateCreated(), 'America/Santiago', "yyyy-MM-dd'T'HH:mm")
      });
    }
  }
  lista.sort((a, b) => a.fecha.localeCompare(b.fecha));
  return { ok: true, adjuntos: lista };
}

/** Solo entrega archivos que estén dentro de la carpeta del documento indicado. */
function archivoDelDocumento(documentoId, archivoId) {
  const carpeta = carpetaDeDocumento(documentoId, false);
  if (!carpeta) throw new Error('Este documento no tiene adjuntos.');
  const archivo = DriveApp.getFileById(archivoId);
  const padres = archivo.getParents();
  while (padres.hasNext()) {
    if (padres.next().getId() === carpeta.getId()) return archivo;
  }
  throw new Error('El archivo no pertenece a este documento.');
}

function verAdjunto(usuario, documentoId, archivoId) {
  const archivo = archivoDelDocumento(documentoId, archivoId);
  return {
    ok: true, nombre: archivo.getName(), tipo_mime: archivo.getMimeType(),
    base64: Utilities.base64Encode(archivo.getBlob().getBytes())
  };
}

function borrarAdjunto(usuario, documentoId, archivoId) {
  archivoDelDocumento(documentoId, archivoId).setTrashed(true); // queda 30 días en la papelera de Drive
  return { ok: true };
}

// ============================================================
//  EXPORTAR A EXCEL (Versión 2)
//  Arma una planilla temporal con el inventario, la convierte a .xlsx y la borra.
// ============================================================

function exportarExcel(usuario, d) {
  const info = obtenerDatos(usuario);
  const productos = {};
  info.productos.forEach((p) => { productos[p.id] = p; });
  const tutores = {};
  info.tutores.forEach((t) => { tutores[t.id] = t; });
  const conTutores = d.incluir_tutores === true;

  // Hoja 1: inventario (stock actual)
  const inventario = [['Tipo', 'Categoría', 'Producto', 'Presentación', 'Se cuenta en', 'Trae c/u', 'Stock (unidades)', 'Stock (presentaciones)', 'Stock mínimo', 'Bajo mínimo']];
  info.productos.filter((p) => p.activo !== 'no').forEach((p) => {
    const stock = info.stock[p.id] || 0;
    const upp = Number(p.unidades_por_presentacion) || 0;
    const min = Number(p.stock_minimo);
    inventario.push([p.tipo, p.categoria, p.nombre, p.presentacion, p.unidad_minima, upp || '',
      stock, upp ? Math.round((stock / upp) * 100) / 100 : '', p.stock_minimo, min > 0 && stock < min ? 'Sí' : '']);
  });

  // Hoja 2: lotes recibidos
  const lotes = [['Producto', 'N° de lote', 'Vencimiento', 'Cantidad (presentaciones)', 'Cantidad (unidades)', 'Documento', 'N° documento', 'Fecha llegada', 'Proveedor', 'Aviso revisado']];
  info.lotes.forEach((l) => {
    const p = productos[l.producto_id] || {};
    lotes.push([p.nombre || l.producto_id, l.n_lote, l.vencimiento, l.cantidad_presentaciones, l.cantidad_unidades,
      l.doc_tipo, l.doc_numero, l.fecha_recepcion, l.proveedor, l.alerta_revisada]);
  });

  // Hoja 3: historial completo de movimientos
  const titulosMov = ['Fecha y hora', 'Tipo', 'Producto', 'Cantidad (unidades)', 'Se cuenta en', 'Usuario', 'Especie', 'Observación'];
  if (conTutores) titulosMov.push('Tutor', 'RUT', 'Teléfono', 'Dirección');
  const movimientos = [titulosMov];
  leerHoja('Movimientos').filter((m) => m.id).forEach((m) => {
    const p = productos[m.producto_id] || {};
    const fila = [m.fecha_hora, m.tipo, p.nombre || m.producto_id, Number(m.cantidad_unidades) || 0, p.unidad_minima, m.usuario, m.especie, m.observacion];
    if (conTutores) {
      const t = tutores[m.tutor_id] || {};
      fila.push(t.nombre || '', t.rut || '', t.telefono || '', t.direccion || '');
    }
    movimientos.push(fila);
  });

  const fecha = Utilities.formatDate(new Date(), 'America/Santiago', 'yyyy-MM-dd');
  const temporal = SpreadsheetApp.create('Exportación Bodega ' + fecha);
  try {
    const hojas = [['Inventario', inventario], ['Lotes', lotes], ['Movimientos', movimientos]];
    hojas.forEach(([nombre, filas], i) => {
      const hoja = i === 0 ? temporal.getSheets()[0].setName(nombre) : temporal.insertSheet(nombre);
      hoja.getRange(1, 1, filas.length, filas[0].length).setValues(filas);
      hoja.getRange(1, 1, 1, filas[0].length).setFontWeight('bold').setBackground('#1D35C9').setFontColor('#FFFFFF');
      hoja.setFrozenRows(1);
      hoja.autoResizeColumns(1, filas[0].length);
    });
    SpreadsheetApp.flush();

    const url = 'https://docs.google.com/spreadsheets/d/' + temporal.getId() + '/export?format=xlsx';
    const respuesta = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } });
    const hora = Utilities.formatDate(new Date(), 'America/Santiago', 'HH.mm');
    const nombre = 'Bodega ' + fecha + ' ' + hora + (conTutores ? ' (con tutores)' : '') + '.xlsx';
    const archivo = respuesta.getBlob().setName(nombre);

    // Copia automática en Drive, carpeta "3. Exportaciones Excel" (sirve de respaldo).
    let guardado = false;
    try {
      DriveApp.getFolderById(ID_CARPETA_EXPORTACIONES).createFile(archivo)
        .setDescription('Generado por ' + usuario.nombre + ' desde la app Bodega');
      guardado = true;
    } catch (e) { /* si falla la copia, igual se entrega el archivo */ }

    return { ok: true, nombre: nombre, guardado: guardado, base64: Utilities.base64Encode(archivo.getBytes()) };
  } finally {
    DriveApp.getFileById(temporal.getId()).setTrashed(true);
  }
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

/**
 * Ejecutar a mano desde el editor (elegir "autorizar" → ▷ Ejecutar) para dar o revisar
 * los permisos del servidor: correo, Drive y conexión externa (Excel).
 * Si todo está bien, el registro de ejecución muestra "Permisos OK".
 */
function autorizar() {
  MailApp.getRemainingDailyQuota();
  DriveApp.getFolderById(ID_CARPETA_ADJUNTOS).getName();
  // Crear y borrar un archivo de prueba: así Google pide el permiso completo de Drive
  // (ver, crear y eliminar), que necesitan los adjuntos y el Excel.
  DriveApp.getFolderById(ID_CARPETA_EXPORTACIONES).createFile('prueba-permisos.txt', 'ok').setTrashed(true);
  SpreadsheetApp.getActive().getName();
  ScriptApp.getOAuthToken();
  UrlFetchApp.fetch('https://www.google.com', { muteHttpExceptions: true });
  Logger.log('Permisos OK');
}
