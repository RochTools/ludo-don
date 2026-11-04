const VERSION = 'ludo-v15';
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/main.js', 'js/config.js', 'js/engine.js', 'js/ai.js', 'js/audio.js',
  'js/ui.js', 'js/game.js', 'js/strings.js',
  'assets/board/board.webp',
  'assets/backgrounds/bg-blue.webp',
  'assets/pieces/green.png', 'assets/pieces/red.png', 'assets/pieces/blue.png', 'assets/pieces/yellow.png',
  'assets/sounds/dice.mp3', 'assets/sounds/move.mp3', 'assets/sounds/kill.mp3',
  'assets/sounds/win.mp3', 'assets/sounds/game-over.mp3',
  'assets/icons/icon-192.png', 'assets/icons/icon-512.png', 'assets/icons/maskable-512.png',
  'assets/icons/apple-touch-icon.png', 'assets/icons/favicon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    })).catch(() => (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))
  );
});
