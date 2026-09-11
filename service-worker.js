// Takvimim - Service Worker
// Uygulamayı "Ana Ekrana Ekle" ile açıldığında çevrimdışı da çalışır hale
// getirir. Statik ikon/manifest dosyaları cache-first sunulur; HTML sayfası
// ise network-first sunulur (bkz. aşağıdaki not) böylece index.html'e
// yapılan güncellemeler CACHE_VERSION hiç değişmese bile bir sonraki
// açılışta görünür.

const CACHE_VERSION = 'takvimim-v0';
const CORE_ASSETS = [
  './manifest.json',
  './icons/favicon.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];
// index.html, çevrimdışı ilk açılış için ayrıca (install sırasında)
// önbelleğe alınır, ama runtime'da ASLA cache-first sunulmaz - bkz. fetch.
const OFFLINE_FALLBACK = './index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll([...CORE_ASSETS, OFFLINE_FALLBACK]))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

const isNavigationRequest = (request) => (
  request.mode === 'navigate' ||
  (request.method === 'GET' && (request.headers.get('accept') || '').includes('text/html'))
);

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // ---- HTML sayfa istekleri: network-first ----
  // Eskiden bu istekler de cache-first idi; bu yüzden index.html'i
  // değiştirip CACHE_VERSION'ı bump'lamayı unuttuğunda (ya da service
  // worker script'i hiç değişmediği için tarayıcı yeni bir kurulumu hiç
  // tetiklemediğinde) kullanıcı hep eski sürümü görüyor ve önbelleği elle
  // temizlemek zorunda kalıyordu. Artık her sayfa açılışında önce ağdan
  // taze bir kopya isteniyor; yalnızca ağ yoksa (çevrimdışıyken) en son
  // başarıyla alınmış kopyaya (veya install sırasında kaydedilen ilk
  // kopyaya) düşülüyor.
  if (isNavigationRequest(event.request)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => (
          caches.match(event.request).then((cached) => cached || caches.match(OFFLINE_FALLBACK))
        ))
    );
    return;
  }

  // ---- Diğer statik dosyalar (ikonlar, manifest, fontlar): cache-first ----
  // Bunlar sık değişmediği için önbellekten hızlıca sunmak güvenli;
  // içerikleri değiştiğinde CACHE_VERSION'ı bump'lamak yeterli olur.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => undefined);
    })
  );
});
