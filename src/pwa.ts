interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: InstallPromptEvent | null = null;
let installed = false;

export function isPWAInstalled(): boolean {
  const browser = navigator as Navigator & { standalone?: boolean };
  return installed || window.matchMedia('(display-mode: standalone)').matches || browser.standalone === true;
}

export function isIOSDevice(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function canInstallPWA(): boolean {
  return import.meta.env.MODE !== 'native' &&
    !isPWAInstalled() &&
    (deferredPrompt !== null || (isIOSDevice() && /Safari/i.test(navigator.userAgent)));
}

function notifyInstallabilityChanged() {
  window.dispatchEvent(new Event('pwaInstallabilityChanged'));
}

export function setupInstallPrompt(): void {
  if (import.meta.env.MODE === 'native') return;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
    notifyInstallabilityChanged();
  });

  window.addEventListener('appinstalled', () => {
    installed = true;
    deferredPrompt = null;
    notifyInstallabilityChanged();
  });
}

export async function showInstallPrompt(): Promise<void> {
  const prompt = deferredPrompt;
  if (!prompt) return;

  deferredPrompt = null;
  try {
    await prompt.prompt();
    installed = (await prompt.userChoice).outcome === 'accepted';
  } catch (error) {
    console.error('Não foi possível abrir o instalador do AgriGest:', error);
  } finally {
    notifyInstallabilityChanged();
  }
}
