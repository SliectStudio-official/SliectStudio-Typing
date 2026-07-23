const CACHE_NAME = 'typing-practice-v7';

const CRITICAL_ASSETS = [
  '/index.html',
  '/style.css',
  '/script.js',
  '/custom-select.js',
  '/loading-indicator.js?v=2'
];

// 状态检测接口：仅走网络，不缓存，服务器不可达时返回 503 以触发离线提示
const NETWORK_ONLY_API = [
  '/api/version',
  '/api/bootstrap/status'
];

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('typing-practice-offline', 2);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const oldVersion = event.oldVersion;
      if (!db.objectStoreNames.contains('pendingScores')) {
        db.createObjectStore('pendingScores', { autoIncrement: true });
      }
      if (oldVersion < 2 && !db.objectStoreNames.contains('offlineArticles')) {
        const store = db.createObjectStore('offlineArticles', { keyPath: ['id', 'source'] });
        store.createIndex('source', 'source', { unique: false });
        store.createIndex('id', 'id', { unique: false });
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

async function cacheArticle(article, source) {
  if (!article || article.id == null || !source) return;
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offlineArticles', 'readwrite');
    tx.objectStore('offlineArticles').put({ ...article, source, cached_at: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllCachedArticles() {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offlineArticles', 'readonly');
    const req = tx.objectStore('offlineArticles').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function deleteCachedArticle(id, source) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offlineArticles', 'readwrite');
    tx.objectStore('offlineArticles').delete([id, source]);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getCachedBySource(source) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offlineArticles', 'readonly');
    const req = tx.objectStore('offlineArticles').index('source').getAll(source);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function syncGlobalOfflineArticles() {
  let remoteArticles;
  try {
    const res = await fetch('/api/articles/offline', { cache: 'no-cache' });
    if (!res.ok) return;
    remoteArticles = await res.json();
  } catch (e) {
    return;
  }
  const existing = await getCachedBySource('global');
  const newIds = new Set(remoteArticles.map(a => a.id));
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offlineArticles', 'readwrite');
    const store = tx.objectStore('offlineArticles');
    existing.forEach(a => {
      if (!newIds.has(a.id)) store.delete([a.id, 'global']);
    });
    remoteArticles.forEach(a => {
      store.put({ ...a, source: 'global', cached_at: Date.now() });
    });
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
      try { await syncGlobalOfflineArticles(); } catch (e) {}
    })()
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await caches.keys().then((names) =>
        Promise.all(
          names
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      );
      try { await syncGlobalOfflineArticles(); } catch (e) {}
    })()
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

  // 状态检测接口：网络优先且不缓存，失败时返回 503，让 checkServerReachable 正确识别离线
  if (NETWORK_ONLY_API.includes(url.pathname)) {
    event.respondWith(
      fetch(request).catch(() => new Response(
        JSON.stringify({ error: 'offline', message: '服务器不可达' }),
        { headers: { 'Content-Type': 'application/json' }, status: 503 }
      ))
    );
    return;
  }

  // 文章列表离线时不应返回过期的全量缓存，让前端回退到 SW 的离线文章缓存
  if (url.pathname === '/api/articles') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => new Response(
          JSON.stringify({ error: 'offline', message: '离线模式仅显示已启用离线访问的文章' }),
          { headers: { 'Content-Type': 'application/json' }, status: 503 }
        ))
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
  const data = event.data;
  if (!data) return;

  switch (data.type) {
    case 'SYNC_SCORES':
      syncPendingScores();
      break;

    case 'SYNC_OFFLINE_ARTICLES':
      syncGlobalOfflineArticles().catch(() => {});
      break;

    case 'CACHE_ARTICLE': {
      const { article, source } = data;
      if (article && source) {
        cacheArticle(article, source).catch(() => {});
      }
      break;
    }

    case 'DELETE_CACHED_ARTICLE': {
      const { id, source } = data;
      if (id != null && source) {
        deleteCachedArticle(id, source).catch(() => {});
      }
      break;
    }

    case 'GET_CACHED_ARTICLES':
      getAllCachedArticles()
        .then(articles => {
          if (event.ports && event.ports[0]) {
            event.ports[0].postMessage({ success: true, articles });
          }
        })
        .catch(err => {
          if (event.ports && event.ports[0]) {
            event.ports[0].postMessage({ success: false, error: String(err), articles: [] });
          }
        });
      break;
  }
});
