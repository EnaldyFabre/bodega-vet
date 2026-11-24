/* ============================================================
   Comunicación con el servidor (Apps Script)
   Todas las pantallas usan llamarServidor('accion', {datos}).
   ============================================================ */

async function llamarServidor(accion, datos = {}) {
  if (!navigator.onLine) {
    throw new Error('Sin señal. Esta acción necesita internet.');
  }

  let respuesta;
  try {
    respuesta = await fetch(API_URL, {
      method: 'POST',
      // "text/plain" evita un bloqueo de seguridad del navegador con Apps Script.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ accion, ...datos })
    });
  } catch (e) {
    throw new Error('No se pudo conectar con el servidor. Revisa la señal e intenta otra vez.');
  }

  const resultado = await respuesta.json();

  // Si el servidor dice que la sesión ya no vale (por ejemplo, borraron al usuario), se cierra aquí.
  if (!resultado.ok && resultado.error === 'SESION_INVALIDA') {
    Acceso.olvidarTelefono();
    location.hash = '';
    location.reload();
    throw new Error('Tu sesión terminó. Vuelve a entrar con tu correo.');
  }
  if (!resultado.ok) throw new Error(resultado.error || 'Error desconocido del servidor.');
  return resultado;
}
