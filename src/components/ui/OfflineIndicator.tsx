import React, { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';
import { isOnline, setupConnectionListeners } from '../../pwa';
import { useLanguage } from '../../context/LanguageContext';

const OfflineIndicator: React.FC = () => {
  const [offline, setOffline] = useState(!isOnline());
  const { language } = useLanguage();

  useEffect(() => {
    const handleOnline = () => setOffline(false);
    const handleOffline = () => setOffline(true);
    
    // Configura os listeners e obtém a função de limpeza
    const cleanup = setupConnectionListeners(handleOnline, handleOffline);
    
    // Limpa os listeners quando o componente é desmontado
    return cleanup;
  }, []);

  if (!offline) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-amber-100 text-amber-800 px-4 py-2 flex items-center justify-center z-50">
      <WifiOff size={16} className="mr-2" />
      <span className="text-sm font-medium">
        {language === 'pt'
          ? 'Você está offline. Algumas funcionalidades podem estar limitadas.'
          : 'You are offline. Some features may be limited.'}
      </span>
    </div>
  );
};

export default OfflineIndicator;