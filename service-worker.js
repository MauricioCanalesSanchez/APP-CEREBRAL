/* =========================================================================
   App Salud Cerebral — Service Worker
   Estrategia: cache-first para los archivos de la app (shell), de modo
   que el cuestionario y el cálculo de riesgo funcionen sin conexión.
   Los datos del paciente viven en localStorage, no aquí.
   ========================================================================= */

const CACHE_NAME = "salud-cerebral-v1";

const ARCHIVOS_APP = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./calculo.js",
  "./manifest.json",
  "./offline.html"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ARCHIVOS_APP))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((nombres) =>
      Promise.all(
        nombres
          .filter((nombre) => nombre !== CACHE_NAME)
          .map((nombre) => caches.delete(nombre))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((respuestaCache) => {
      if (respuestaCache) return respuestaCache;

      return fetch(event.request)
        .then((respuestaRed) => {
          // Guardar copia en caché para la próxima vez sin conexión
          const copia = respuestaRed.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, copia);
          });
          return respuestaRed;
        })
        .catch(() => caches.match("./offline.html"));
    })
  );
});
