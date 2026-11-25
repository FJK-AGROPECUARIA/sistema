// FJK Sistema – funciona sem internet
// - o próprio app (página, ícones, bibliotecas) fica guardado no aparelho
// - toda consulta de dados (GET no banco) guarda a última resposta; sem sinal, usa a guardada
const VERSAO_SW = 'fjk-sw-2';
const DADOS = 'fjk-sw-1-dados'; // cache dos dados do banco: mantido entre versões
const APP = ['./', './index.html', './manifest.json', './fjk-192.png', './fjk-512.png', './apple-touch-icon.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSAO_SW + '-app').then(c => Promise.all(APP.map(u => c.add(new Request(u, {cache:'reload'})).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => !k.startsWith(VERSAO_SW) && k !== DADOS).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// rede primeiro; se falhar (sem sinal), devolve a última cópia guardada
async function redePrimeiro(req, cacheNome, tempo){
  const cache = await caches.open(cacheNome);
  try {
    const ctl = new AbortController(), t = tempo ? setTimeout(() => ctl.abort(), tempo) : null;
    const r = await fetch(req, {signal:ctl.signal}); if (t) clearTimeout(t);
    if (r && r.ok) cache.put(req, r.clone()).catch(() => {});
    return r;
  } catch(err) {
    const c = await cache.match(req, {ignoreVary:true, ignoreSearch:false});
    if (c) return c;
    throw err;
  }
}
// guardado primeiro (bibliotecas de fora): usa a cópia e atualiza por trás
async function guardadoPrimeiro(req, cacheNome){
  const cache = await caches.open(cacheNome), c = await cache.match(req, {ignoreVary:true});
  const rede = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) cache.put(req, r.clone()).catch(() => {}); return r; }).catch(() => null);
  return c || (await rede) || Response.error();
}

self.addEventListener('fetch', e => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== 'GET') return; // gravações vão direto (sem sinal, o app guarda na fila dele)
  // página do app
  if (req.mode === 'navigate' || (u.origin === location.origin && /\/(index\.html)?$/.test(u.pathname))) {
    // pede sempre a versão mais nova da página (sem cópia velha do navegador), para o app já abrir atualizado e não precisar recarregar depois
    const nova = new Request(req.url, {cache:'no-cache', credentials:'same-origin'});
    e.respondWith(redePrimeiro(nova, VERSAO_SW + '-app', 6000).catch(() => caches.match('./index.html', {ignoreSearch:true})));
    return;
  }
  // arquivos do próprio app
  if (u.origin === location.origin) { e.respondWith(redePrimeiro(req, VERSAO_SW + '-app', 6000)); return; }
  // banco de dados (consultas e usuário)
  if (/supabase\.co$/.test(u.hostname) && (u.pathname.startsWith('/rest/v1/') || u.pathname === '/auth/v1/user')) {
    e.respondWith(redePrimeiro(req, DADOS, 15000)); return;
  }
  // bibliotecas (supabase, leaflet)
  if (/unpkg\.com|jsdelivr\.net/.test(u.hostname)) { e.respondWith(guardadoPrimeiro(req, VERSAO_SW + '-app')); return; }
});
