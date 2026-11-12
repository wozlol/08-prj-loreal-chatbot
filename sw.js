// Service worker for the L'Oréal Beauty Advisor.
// It keeps a copy of the app files so the app opens even with no internet.
// Chatting still needs internet, because the replies come from OpenAI.
//
// Our own files use "network first", so you always get the newest version when online
// and the saved copy only when offline. That means no version number to bump after edits.
const CACHE = "loreal-advisor-shell";

// The files the app needs to open. Paths are relative so they work in a GitHub Pages folder.
const APP_SHELL = [
  "./",
  "index.html",
  "style.css",
  "script.js",
  "pwa.js",
  "manifest.json",
  "img/loreal-logo.png",
  "img/favicon.ico",
  "img/favicon-32.png",
  "img/apple-touch-icon.png",
  "img/icon-192.png",
  "img/icon-512.png",
];

// ----- Install: save the app files -----
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()), // start working right away
  );
});

// ----- Activate: take over open pages -----
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// ----- Fetch: decide where each request gets its answer -----
self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Only handle plain GET requests. The chat POST to the Worker is never touched.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    // Our own files: network first, saved copy when offline
    event.respondWith(networkFirst(request));
  } else if (
    url.hostname === "fonts.googleapis.com" ||
    url.hostname === "fonts.gstatic.com"
  ) {
    // Fonts and the send icon: use the saved copy and refresh it in the background
    event.respondWith(staleWhileRevalidate(request));
  }
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (error) {
    // ignoreSearch lets index.html?v=2 find the saved page
    const saved = await cache.match(request, { ignoreSearch: true });
    if (saved) return saved;
    if (request.mode === "navigate") return cache.match("index.html");
    return Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const saved = await cache.match(request);
  const refresh = fetch(request)
    .then((fresh) => {
      // Fonts come from another site, so the copy may be "opaque", which is fine to keep
      if (fresh.ok || fresh.type === "opaque") cache.put(request, fresh.clone());
      return fresh;
    })
    .catch(() => saved || Response.error());
  return saved || refresh;
}
