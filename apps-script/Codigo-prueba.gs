/**
 * Bodega API - PRUEBA (Etapa 2)
 * Solo sirve para comprobar que la app podrá leer y escribir en la planilla.
 * Se reemplazará por el código real en la Versión 1.
 */

// Se ejecuta cuando alguien abre la dirección (URL) de la aplicación web.
function doGet(e) {
  // Lee qué acción se pidió en la dirección (?accion=...). Si no viene ninguna, usa "ping".
  var accion = (e && e.parameter && e.parameter.accion) || 'ping';

  try {
    // PRUEBA 1: leer. Devuelve los nombres de las hojas de la planilla.
    if (accion === 'ping') {
      var hojas = SpreadsheetApp.getActive().getSheets().map(function (h) {
        return h.getName();
      });
      return responder({ ok: true, mensaje: 'Conexión correcta', hojas: hojas, hora: new Date().toISOString() });
    }

    // PRUEBA 2: escribir. Agrega una fila en una hoja "Prueba" (la crea si no existe).
    if (accion === 'prueba_escritura') {
      var ss = SpreadsheetApp.getActive();
      var hoja = ss.getSheetByName('Prueba') || ss.insertSheet('Prueba');
      if (hoja.getLastRow() === 0) hoja.appendRow(['fecha_hora', 'mensaje']);
      hoja.appendRow([new Date(), 'Escritura de prueba desde la web']);
      return responder({ ok: true, mensaje: 'Fila escrita en la hoja Prueba', filas: hoja.getLastRow() - 1 });
    }

    return responder({ ok: false, error: 'Acción desconocida: ' + accion });
  } catch (err) {
    // Si algo falla, devuelve el error en vez de romperse.
    return responder({ ok: false, error: String(err) });
  }
}

// Convierte la respuesta a formato JSON, el "idioma" que entenderá la app.
function responder(datos) {
  return ContentService
    .createTextOutput(JSON.stringify(datos))
    .setMimeType(ContentService.MimeType.JSON);
}
