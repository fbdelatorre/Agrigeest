// Funções auxiliares para o PWA

// Verifica se o aplicativo está instalado
export function isPWAInstalled(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || 
         (window.navigator as any).standalone === true;
}

// Verifica se o aplicativo pode ser instalado
export async function canInstallPWA(): Promise<boolean> {
  if (isPWAInstalled()) {
    return false;
  }
  
  // Verifica se o deferredPrompt está disponível
  if (deferredPrompt) {
    return true;
  }
  
  // Verificação para iOS
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  
  return isIOS && isSafari && !isPWAInstalled();
}

// Armazena o evento de instalação
let deferredPrompt: any = null;

// Configura o listener para o evento beforeinstallprompt
export function setupInstallPrompt(): void {
  console.log('Setting up install prompt listener');
  
  window.addEventListener('beforeinstallprompt', (e) => {
    // Previne o comportamento padrão
    e.preventDefault();
    
    console.log('beforeinstallprompt event fired');
    
    // Armazena o evento para uso posterior
    deferredPrompt = e;
    
    // Dispara um evento personalizado que pode ser capturado pelos componentes React
    window.dispatchEvent(new CustomEvent('pwaInstallable'));
  });
  
  // Listener para o evento appinstalled
  window.addEventListener('appinstalled', () => {
    console.log('PWA was installed');
    deferredPrompt = null;
    
    // Registra a instalação (pode ser usado para analytics)
    if ('ga' in window) {
      // @ts-ignore
      window.ga('send', 'event', 'pwa', 'installed');
    }
  });
}

// Mostra o prompt de instalação
export async function showInstallPrompt(): Promise<boolean> {
  if (!deferredPrompt) {
    console.log('No installation prompt available');
    return false;
  }
  
  console.log('Showing install prompt');
  
  // Mostra o prompt de instalação
  deferredPrompt.prompt();
  
  // Aguarda a escolha do usuário
  const { outcome } = await deferredPrompt.userChoice;
  console.log(`User choice: ${outcome}`);
  
  // Limpa a referência
  deferredPrompt = null;
  
  // Retorna true se o usuário aceitou a instalação
  return outcome === 'accepted';
}

// Verifica se o aplicativo está online
export function isOnline(): boolean {
  return navigator.onLine;
}

// Configura listeners para mudanças no estado da conexão
export function setupConnectionListeners(
  onOnline: () => void,
  onOffline: () => void
): () => void {
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  
  // Retorna uma função para remover os listeners
  return () => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
  };
}

// Verifica se há atualizações do Service Worker
export function checkForUpdates(): void {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(registration => {
      registration.update();
    });
  }
}

// Configura notificações push
export async function setupPushNotifications(): Promise<boolean> {
  if (!('Notification' in window)) {
    console.log('Este navegador não suporta notificações');
    return false;
  }
  
  if (Notification.permission === 'granted') {
    return true;
  }
  
  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }
  
  return false;
}

// Envia uma notificação
export function sendNotification(
  title: string,
  options: NotificationOptions = {}
): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }
  
  // Configurações padrão
  const defaultOptions: NotificationOptions = {
    icon: 'https://images.pexels.com/photos/440731/pexels-photo-440731.jpeg?auto=compress&cs=tinysrgb&w=192&h=192&fit=crop&crop=entropy',
    badge: 'https://images.pexels.com/photos/440731/pexels-photo-440731.jpeg?auto=compress&cs=tinysrgb&w=72&h=72&fit=crop&crop=entropy',
    vibrate: [100, 50, 100]
  };
  
  // Mescla as opções
  const notificationOptions = { ...defaultOptions, ...options };
  
  // Cria a notificação
  new Notification(title, notificationOptions);
}