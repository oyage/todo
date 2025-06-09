// Enhanced Service Worker for optimized caching
const CACHE_NAME = 'todo-app-v2.0';
const STATIC_CACHE = 'todo-static-v2.0';
const DYNAMIC_CACHE = 'todo-dynamic-v2.0';
const API_CACHE = 'todo-api-v2.0';

const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://cdn.tailwindcss.com'
];

// APIレスポンスのキャッシュ期間（5分）
const API_CACHE_DURATION = 5 * 60 * 1000;

// Install event - cache resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('SW: Caching static resources');
        return cache.addAll(urlsToCache);
      })
  );
  // 新しいSWをすぐに有効化
  self.skipWaiting();
});

// Fetch event - intelligent caching strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // API requests
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/tasks') || url.pathname.startsWith('/auth/')) {
    event.respondWith(handleApiRequest(request));
  }
  // Static resources
  else if (request.destination === 'document' || request.destination === 'script' || request.destination === 'style') {
    event.respondWith(handleStaticRequest(request));
  }
  // Other resources (images, fonts, etc.)
  else {
    event.respondWith(handleDynamicRequest(request));
  }
});

// API request handler with stale-while-revalidate strategy
async function handleApiRequest(request) {
  const cache = await caches.open(API_CACHE);
  const cachedResponse = await cache.match(request);
  
  const fetchPromise = fetch(request).then(async (response) => {
    if (response.ok) {
      // APIレスポンスをクローンしてキャッシュに保存
      const responseClone = response.clone();
      await cache.put(request, responseClone);
    }
    return response;
  }).catch(() => {
    // ネットワークエラー時は何もしない
    return null;
  });
  
  // キャッシュがあれば即座に返し、バックグラウンドで更新
  if (cachedResponse) {
    const cacheTime = cachedResponse.headers.get('sw-cache-time');
    const isExpired = cacheTime && (Date.now() - parseInt(cacheTime)) > API_CACHE_DURATION;
    
    if (!isExpired) {
      fetchPromise; // バックグラウンドで実行
      return cachedResponse;
    }
  }
  
  // キャッシュがないか期限切れの場合はネットワークから取得
  const networkResponse = await fetchPromise;
  return networkResponse || cachedResponse || new Response('Offline', { status: 503 });
}

// Static resource handler with cache-first strategy
async function handleStaticRequest(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    return cachedResponse;
  }
  
  try {
    const response = await fetch(request);
    if (response.ok) {
      const responseClone = response.clone();
      await cache.put(request, responseClone);
    }
    return response;
  } catch (error) {
    return new Response('Offline', { status: 503 });
  }
}

// Dynamic resource handler with network-first strategy
async function handleDynamicRequest(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      const responseClone = response.clone();
      await cache.put(request, responseClone);
    }
    return response;
  } catch (error) {
    const cache = await caches.open(DYNAMIC_CACHE);
    const cachedResponse = await cache.match(request);
    return cachedResponse || new Response('Offline', { status: 503 });
  }
}

// Activate event - clean up old caches and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // 古いキャッシュの削除
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (![STATIC_CACHE, DYNAMIC_CACHE, API_CACHE].includes(cacheName)) {
              console.log('SW: Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // すべてのクライアントを即座に制御下に置く
      self.clients.claim()
    ])
  );
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  }
});

async function doBackgroundSync() {
  // オフライン時に蓄積されたアクションを実行
  console.log('SW: Performing background sync');
  // 実装は必要に応じて追加
}

// Push notification handler
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: '/icon-192x192.png',
      badge: '/badge-72x72.png',
      data: data.data
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  }
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  event.waitUntil(
    clients.openWindow('/')
  );
});