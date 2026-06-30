/* PM Manager — Service Worker (offline-first PWA).
   Servido como arquivo real (/sw.js). Blob URL NAO funciona p/ SW em navegadores modernos. */
var SHELL = 'pm-manager-shell-v21';
var DATA  = 'pm-manager-data';
var ASSETS = [
  './',
  './index.html',
  'https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pptxgenjs/3.12.0/pptxgen.bundle.js'
];

self.addEventListener('message', function (e) {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(SHELL).then(function (c) {
    return Promise.all(ASSETS.map(function (u) {
      return c.add(new Request(u, { cache: 'reload' })).catch(function () {});
    }));
  }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    var ks = await caches.keys();
    await Promise.all(ks.filter(function (k) { return k !== SHELL && k !== DATA; })
      .map(function (k) { return caches.delete(k); }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (err) { return; }

  /* Firebase RTDB: network-first; cai no cache se offline. Chave de cache sem ?auth (token rotativo). */
  if (/firebaseio\.com$/.test(url.host)) {
    var ck = req;
    try {
      var u2 = new URL(req.url);
      if (u2.searchParams.has('auth')) { u2.searchParams.delete('auth'); ck = new Request(u2.toString()); }
    } catch (e2) {}
    e.respondWith((async function () {
      try {
        var fresh = await fetch(req);
        if (fresh && fresh.status === 200) { var c = await caches.open(DATA); c.put(ck, fresh.clone()); }
        return fresh;
      } catch (err) {
        var cached = await caches.match(ck);
        if (cached) return cached;
        /* Sem cache p/ este caminho: 504 (NAO 'null'). Assim o app cai no
           cache local (localStorage) em vez de sobrescrever o dado com null. */
        return new Response('null', { status: 504, statusText: 'Offline', headers: { 'Content-Type': 'application/json' } });
      }
    })());
    return;
  }

  /* Navegacao (abrir o app): network-first -> quando online SEMPRE pega a ultima
     versao do index.html; se estiver offline, cai no cache do shell. Isso garante
     que toda atualizacao publicada chegue ao usuario sem limpar cache na mao. */
  if (req.mode === 'navigate') {
    e.respondWith((async function () {
      try {
        var fresh = await fetch(req);
        if (fresh && fresh.status === 200) {
          var c = await caches.open(SHELL);
          c.put('./index.html', fresh.clone());
        }
        return fresh;
      } catch (err) {
        var shell = (await caches.match('./index.html')) || (await caches.match('./'));
        if (shell) return shell;
        return new Response('<h1>Offline</h1><p>Abra o app online uma vez para habilitar o modo offline.</p>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }

  /* Bibliotecas (CDN) e assets do proprio app: cache-first, revalida em 2o plano. */
  if (/cloudflare|cdnjs|jsdelivr|unpkg/.test(url.host) || url.origin === location.origin) {
    e.respondWith((async function () {
      var cache = await caches.open(SHELL);
      var cached = await cache.match(req);
      var net = fetch(req).then(function (r) {
        if (r && r.status === 200) cache.put(req, r.clone());
        return r;
      }).catch(function () { return cached; });
      return cached || net;
    })());
    return;
  }
});
