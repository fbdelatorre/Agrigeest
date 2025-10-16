// Nome do cache
const CACHE_NAME = 'agrigest-cache-v2';

// Lista de recursos para armazenar em cache
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/offline.html'
];

// Evento de instalação - armazena recursos em cache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Cache aberto');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// Evento de ativação - limpa caches antigos
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Evento de busca - responde com recursos em cache ou busca na rede
self.addEventListener('fetch', (event) => {
  // Para solicitações de API, tenta a rede primeiro, depois o cache
  if (event.request.url.includes('/api/') || 
      event.request.url.includes('supabase')) {
    
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          return caches.match(event.request)
            .then(response => {
              if (response) {
                return response;
              }
              
              // Se não houver resposta em cache para API, retorna a página offline
              if (event.request.headers.get('accept')?.includes('text/html')) {
                return caches.match('/offline.html');
              }
              
              // Para outras solicitações, retorna um erro JSON
              return new Response(
                JSON.stringify({ 
                  error: 'Você está offline e este recurso não está em cache.' 
                }),
                { 
                  status: 503,
                  headers: { 'Content-Type': 'application/json' }
                }
              );
            });
        })
    );
    return;
  }
  
  // Para outras solicitações, tenta o cache primeiro, depois a rede
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - retorna a resposta do cache
        if (response) {
          return response;
        }

        // Clone da requisição
        const fetchRequest = event.request.clone();

        return fetch(fetchRequest).then(
          (response) => {
            // Verifica se a resposta é válida
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clone da resposta
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });

            return response;
          }
        ).catch(() => {
          // Se falhar ao buscar e for uma solicitação de página, retorna a página offline
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('/offline.html');
          }
        });
      })
  );
});

// Evento de sincronização em segundo plano
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-data') {
    event.waitUntil(syncData());
  }
});

// Função para sincronizar dados
async function syncData() {
  console.log('Sincronizando dados...');
  
  // Obter lista de itens pendentes de sincronização
  const pendingItems = JSON.parse(localStorage.getItem('pendingSync') || '[]');
  
  // Processar cada item pendente
  for (const key of pendingItems) {
    try {
      const storedItem = localStorage.getItem(key);
      if (!storedItem) continue;
      
      const parsedData = JSON.parse(storedItem);
      
      // Aqui você implementaria a lógica para enviar os dados para o servidor
      // Por exemplo, usando fetch para chamar sua API
      
      // Após sincronizar com sucesso, marque como sincronizado
      parsedData.pendingSync = false;
      localStorage.setItem(key, JSON.stringify(parsedData));
      
      // Dispara um evento para notificar que os dados foram sincronizados
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'SYNC_COMPLETE',
            key: key
          });
        });
      });
    } catch (error) {
      console.error(`Erro ao sincronizar ${key}:`, error);
    }
  }
  
  // Limpar a lista de pendências
  localStorage.setItem('pendingSync', '[]');
  
  // Notificar que a sincronização foi concluída
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({
        type: 'ALL_SYNC_COMPLETE'
      });
    });
  });
}

// Evento de notificação push
self.addEventListener('push', (event) => {
  const data = event.data.json();
  
  const options = {
    body: data.body,
    icon: 'https://images.pexels.com/photos/440731/pexels-photo-440731.jpeg?auto=compress&cs=tinysrgb&w=192&h=192&fit=crop&crop=entropy',
    badge: 'https://images.pexels.com/photos/440731/pexels-photo-440731.jpeg?auto=compress&cs=tinysrgb&w=72&h=72&fit=crop&crop=entropy',
    vibrate: [100, 50, 100],
    data: {
      url: data.url
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Evento de clique na notificação
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.notification.data && event.notification.data.url) {
    event.waitUntil(
      clients.openWindow(event.notification.data.url)
    );
  }
});

// Evento de mensagem
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SYNC_REQUEST') {
    syncData();
  }
});