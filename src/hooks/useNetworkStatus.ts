import { useState, useEffect } from 'react';

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [connectionType, setConnectionType] = useState<string | null>(null);
  const [connectionSpeed, setConnectionSpeed] = useState<string | null>(null);
  const [lastOnlineTime, setLastOnlineTime] = useState<Date | null>(isOnline ? new Date() : null);
  const [lastOfflineTime, setLastOfflineTime] = useState<Date | null>(isOnline ? null : new Date());

  useEffect(() => {
    // Atualiza o estado online/offline
    const handleOnline = () => {
      setIsOnline(true);
      setLastOnlineTime(new Date());
      
      // Dispara um evento personalizado que pode ser capturado por outros componentes
      window.dispatchEvent(new CustomEvent('app:online'));
    };
    
    const handleOffline = () => {
      setIsOnline(false);
      setLastOfflineTime(new Date());
      
      // Dispara um evento personalizado que pode ser capturado por outros componentes
      window.dispatchEvent(new CustomEvent('app:offline'));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Verifica o tipo de conexão, se disponível
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      
      if (connection) {
        // Define o tipo de conexão inicial
        setConnectionType(connection.effectiveType);
        
        // Calcula a velocidade aproximada
        if (connection.downlink) {
          setConnectionSpeed(`${connection.downlink} Mbps`);
        }
        
        // Atualiza quando a conexão muda
        const handleConnectionChange = () => {
          setConnectionType(connection.effectiveType);
          if (connection.downlink) {
            setConnectionSpeed(`${connection.downlink} Mbps`);
          }
        };
        
        connection.addEventListener('change', handleConnectionChange);
        
        return () => {
          connection.removeEventListener('change', handleConnectionChange);
          window.removeEventListener('online', handleOnline);
          window.removeEventListener('offline', handleOffline);
        };
      }
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Função para verificar se a conexão é lenta
  const isSlowConnection = () => {
    if (!connectionType) return false;
    return ['slow-2g', '2g', '3g'].includes(connectionType);
  };

  // Função para obter o tempo desde a última mudança de estado
  const getTimeSinceLastStateChange = () => {
    const now = new Date();
    if (isOnline && lastOnlineTime) {
      return Math.floor((now.getTime() - lastOnlineTime.getTime()) / 1000);
    } else if (!isOnline && lastOfflineTime) {
      return Math.floor((now.getTime() - lastOfflineTime.getTime()) / 1000);
    }
    return 0;
  };

  return {
    isOnline,
    connectionType,
    connectionSpeed,
    isSlowConnection: isSlowConnection(),
    lastOnlineTime,
    lastOfflineTime,
    timeSinceLastStateChange: getTimeSinceLastStateChange()
  };
}