/*
 * Service worker: guarda una copia de la app en el teléfono
 * para que abra y funcione aunque no haya señal.
 *
 * IMPORTANTE: cada vez que publiquemos cambios, subir el número de VERSION.
 * Así los teléfonos descargan la versión nueva.
 */
const VERSION = 'v3-bloque3';
const CACHE = 'bodega-' + VERSION;

// Archivos que forman la app (el "esqueleto" que se guarda en el teléfono)
const ARCHIVOS = [
  './',
  './index.html',
  './css/estilos.css',
  './js/config.js',
  './js/api.js',
  './js/acceso.js',
  './js/base.js',
  './js/datos.js',
  './js/productos.js',
  './js/ingreso.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

// 1) Al instalarse: descarga y guarda todos los archivos de la app.
self.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ARCHIVOS)));
  self.skipWaiting();
});

// 2) Al activarse: borra las copias de versiones anteriores.
self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((nombres) =>
      Promise.all(nombres.filter((n) => n !== CACHE).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

// 3) Cada vez que la app pide un archivo propio: primero usa la copia guardada
//    (rápido y sin señal); si no la tiene, la busca en internet.
//    Las consultas al servidor (Apps Script) NO pasan por aquí: siempre van a internet.
self.addEventListener('fetch', (evento) => {
  const url = new URL(evento.request.url);
  if (evento.request.method !== 'GET' || url.origin !== self.location.origin) return;

  evento.respondWith(
    caches.match(evento.request).then((guardado) => guardado || fetch(evento.request))
  );
});
