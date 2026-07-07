const CACHE_NAME = 'typing-practice-v3';

const CRITICAL_ASSETS = [
  '/index.html',
  '/style.css',
  '/script.js',
  '/custom-select.js'
];

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('typing-practice-offline', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('pendingScores')) {
        db.createObjectStore('pendingScores', { autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function savePendingScore(data) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pendingScores', 'readwrite');
    tx.objectStore('pendingScores').add(data);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllPendingScores() {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pendingScores', 'readonly');
    const req = tx.objectStore('pendingScores').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function clearPendingScores() {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pendingScores', 'readwrite');
    tx.objectStore('pendingScores').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deletePendingScore(key) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pendingScores', 'readwrite');
    tx.objectStore('pendingScores').delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function syncPendingScores() {
  const entries = await new Promise((resolve, reject) => {
    openIDB().then((db) => {
      const tx = db.transaction('pendingScores', 'readonly');
      const store = tx.objectStore('pendingScores');
      const req = store.openCursor();
      const items = [];
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          items.push({ key: cursor.key, value: cursor.value });
          cursor.continue();
        } else {
          resolve(items);
        }
      };
      req.onerror = () => reject(req.error);
    });
  });

  if (entries.length === 0) return;

  for (const entry of entries) {
    try {
      const res = await fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry.value)
      });
      if (res.ok) {
        await deletePendingScore(entry.key);
      }
    } catch {
    }
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(CRITICAL_ASSETS);
      } catch (e) {
        console.error('SW install failed:', e);
      }
    })()
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method === 'POST' && url.pathname === '/api/leaderboard') {
    event.respondWith(
      fetch(request).catch(async () => {
        let data;
        try {
          data = await request.json();
        } catch {
          data = {};
        }
        await savePendingScore(data);
        return new Response(
          JSON.stringify({ queued: true, message: '离线已保存，上线后自动提交' }),
          { headers: { 'Content-Type': 'application/json' }, status: 202 }
        );
      })
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match('/index.html')))
    );
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    if (request.method !== 'GET') return;

    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    fetch(request).then((response) => {
      if (response.ok) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
      }
      return response;
    }).catch(() => caches.match(request))
  );
});

self.addEventListener('online', () => {
  syncPendingScores();
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SYNC_SCORES') {
    syncPendingScores();
  }
});
