/* ============================================================
   Comunicación con el servidor (Apps Script)
   Todas las pantallas usan llamarServidor('accion', {datos}).
   ============================================================ */

async function llamarServidor(accion, datos = {}) {
  if (!navigator.onLine) {
    throw new Error('Sin señal. Esta acción necesita internet.');
  }

  // Con señal muy débil la conexión puede quedar "colgada": a los 20 segundos se corta
  // y el registro pasa a la cola sin señal.
  const control = new AbortController();
  const limite = setTimeout(() => control.abort(), 20000);
  let respuesta, resultado;
  try {
    respuesta = await fetch(API_URL, {
      method: 'POST',
      // "text/plain" evita un bloqueo de seguridad del navegador con Apps Script.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ accion, ...datos }),
      signal: control.signal
    });
    resultado = await respuesta.json();
  } catch (e) {
    throw new Error('No se pudo conectar con el servidor. Revisa la señal e intenta otra vez.');
  } finally {
    clearTimeout(limite);
  }

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
