const CACHE="five-e-session-tracker-web-preview-3";
const ASSETS=[
  "./","./index.html","./styles.css","./app.js","./public-data.js",
  "./rest-rules.js","./effects-rules.js","./armor-class.js",
  "./manifest.webmanifest","./icon.svg","./icon-180.png","./icon-192.png","./icon-512.png","./LEGAL.html"
];
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener("activate",event=>event.waitUntil(Promise.all([
  self.clients.claim(),
  caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE&&key.startsWith("five-e-session-tracker-")).map(key=>caches.delete(key))))
])));
self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET") return;
  event.respondWith(fetch(event.request).then(response=>{
    const copy=response.clone();
    caches.open(CACHE).then(cache=>cache.put(event.request,copy));
    return response;
  }).catch(()=>caches.match(event.request).then(cached=>cached||caches.match("./index.html"))));
});
