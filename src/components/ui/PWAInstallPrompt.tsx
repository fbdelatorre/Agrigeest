import React, { useState, useEffect } from 'react';
import { Download, Smartphone, Laptop, Info } from 'lucide-react';
import Button from './Button';
import { canInstallPWA, showInstallPrompt, isPWAInstalled } from '../../pwa';
import { useLanguage } from '../../context/LanguageContext';

interface PWAInstallPromptProps {
  className?: string;
}

const PWAInstallPrompt: React.FC<PWAInstallPromptProps> = ({ className = '' }) => {
  const [isInstallable, setIsInstallable] = useState(false);
  const [isIOSDevice, setIsIOSDevice] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const { language } = useLanguage();

  useEffect(() => {
    // Verifica se é um dispositivo iOS
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOSDevice(isIOS);

    // Verifica se o PWA já está instalado
    if (isPWAInstalled()) {
      setIsInstallable(false);
      return;
    }

    // Verifica se o PWA pode ser instalado
    const checkInstallable = async () => {
      const installable = await canInstallPWA();
      setIsInstallable(installable);
    };
    
    checkInstallable();

    // Configura o listener para o evento personalizado
    const handlePWAInstallable = () => {
      console.log('pwaInstallable event received');
      setIsInstallable(true);
    };
    
    window.addEventListener('pwaInstallable', handlePWAInstallable);

    return () => {
      window.removeEventListener('pwaInstallable', handlePWAInstallable);
    };
  }, []);

  // Se não for instalável ou já estiver instalado, não mostra nada
  if (!isInstallable) {
    return null;
  }

  const handleInstall = async () => {
    if (isIOSDevice) {
      // No iOS, apenas mostra as instruções
      setShowDetails(true);
      return;
    }

    // Em outros dispositivos, mostra o prompt de instalação
    const installed = await showInstallPrompt();
    if (installed) {
      setIsInstallable(false);
    }
  };

  return (
    <div className={`bg-green-50 border border-green-200 rounded-lg p-4 ${className}`}>
      <div className="flex flex-col md:flex-row md:items-start">
        <div className="flex-shrink-0 mb-4 md:mb-0 md:mr-4">
          {isIOSDevice ? (
            <Smartphone className="h-12 w-12 text-green-700" />
          ) : (
            <Laptop className="h-12 w-12 text-green-700" />
          )}
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-medium text-green-800 mb-2">
            {language === 'pt' ? 'Instale o aplicativo AgriGest' : 'Install the AgriGest app'}
          </h3>
          
          <div className="mt-2 text-sm text-green-700">
            {isIOSDevice ? (
              <div>
                <p className="mb-2">
                  {language === 'pt'
                    ? 'Para instalar o AgriGest no seu dispositivo iOS:'
                    : 'To install AgriGest on your iOS device:'}
                </p>
                {showDetails && (
                  <ol className="list-decimal pl-5 space-y-2 mb-3">
                    <li>
                      {language === 'pt'
                        ? 'Toque no ícone de compartilhamento'
                        : 'Tap the share icon'}
                      <span className="inline-block mx-1 px-2 py-1 bg-gray-200 rounded text-gray-700">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M8.59 16.59L13.17 12L8.59 7.41L10 6L16 12L10 18L8.59 16.59Z" fill="currentColor" />
                        </svg>
                      </span>
                    </li>
                    <li>
                      {language === 'pt'
                        ? 'Role para baixo e toque em "Adicionar à Tela de Início"'
                        : 'Scroll down and tap "Add to Home Screen"'}
                    </li>
                    <li>
                      {language === 'pt'
                        ? 'Toque em "Adicionar" no canto superior direito'
                        : 'Tap "Add" in the top right corner'}
                    </li>
                  </ol>
                )}
                <div className="flex justify-center mt-3">
                  <img 
                    src="https://images.pexels.com/photos/440731/pexels-photo-440731.jpeg?auto=compress&cs=tinysrgb&w=300&h=200&fit=crop&crop=entropy" 
                    alt={language === 'pt' ? 'Captura de tela do aplicativo AgriGest' : 'Screenshot of AgriGest app'} 
                    className="rounded-lg border border-green-200 shadow-sm max-w-[200px] h-auto"
                  />
                </div>
              </div>
            ) : (
              <div>
                <p>
                  {language === 'pt'
                    ? 'Instale o AgriGest para acesso rápido e uso offline.'
                    : 'Install AgriGest for quick access and offline use.'}
                </p>
                <div className="flex justify-center mt-3">
                  <img 
                    src="https://images.pexels.com/photos/440731/pexels-photo-440731.jpeg?auto=compress&cs=tinysrgb&w=300&h=200&fit=crop&crop=entropy" 
                    alt={language === 'pt' ? 'Captura de tela do aplicativo AgriGest' : 'Screenshot of AgriGest app'} 
                    className="rounded-lg border border-green-200 shadow-sm max-w-[200px] h-auto"
                  />
                </div>
              </div>
            )}
          </div>
          
          <div className="mt-4 flex flex-wrap gap-2">
            {isIOSDevice ? (
              <Button
                size="sm"
                variant={showDetails ? "outline" : "primary"}
                onClick={() => setShowDetails(!showDetails)}
                leftIcon={<Info size={16} />}
              >
                {showDetails 
                  ? (language === 'pt' ? 'Ocultar Instruções' : 'Hide Instructions')
                  : (language === 'pt' ? 'Mostrar Instruções' : 'Show Instructions')}
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleInstall}
                leftIcon={<Download size={16} />}
              >
                {language === 'pt' ? 'Instalar Aplicativo' : 'Install App'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PWAInstallPrompt;