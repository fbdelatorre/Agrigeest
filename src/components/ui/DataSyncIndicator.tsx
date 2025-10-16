import React, { useState, useEffect } from 'react';
import { RefreshCw, Check, AlertCircle } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAppContext } from '../../context/AppContext';
import Button from './Button';

type SyncStatus = 'syncing' | 'success' | 'error' | 'idle';

interface DataSyncIndicatorProps {
  className?: string;
}

const DataSyncIndicator: React.FC<DataSyncIndicatorProps> = ({ className = '' }) => {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const { language } = useLanguage();
  const { isOnline, hasPendingSync, syncData } = useAppContext();
  const [isSyncing, setIsSyncing] = useState(false);

  // Observa mudanças no hasPendingSync para atualizar o status
  useEffect(() => {
    if (hasPendingSync && isOnline && !isSyncing) {
      setSyncStatus('idle');
    } else if (!hasPendingSync && lastSynced) {
      setSyncStatus('success');
      
      // Volta para o estado idle após 3 segundos
      const timer = setTimeout(() => {
        setSyncStatus('idle');
      }, 3000);
      
      return () => clearTimeout(timer);
    }
  }, [hasPendingSync, isOnline, isSyncing, lastSynced]);

  // Sincroniza dados quando o aplicativo fica online
  useEffect(() => {
    const handleOnline = () => {
      if (hasPendingSync) {
        handleSyncData();
      }
    };

    window.addEventListener('online', handleOnline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [hasPendingSync]);

  // Escuta eventos de sincronização completa
  useEffect(() => {
    const handleSyncComplete = () => {
      setSyncStatus('success');
      setLastSynced(new Date());
      setIsSyncing(false);
    };
    
    window.addEventListener('sync:complete', handleSyncComplete);
    
    return () => {
      window.removeEventListener('sync:complete', handleSyncComplete);
    };
  }, []);

  const handleSyncData = async () => {
    if (!isOnline || !hasPendingSync || isSyncing) return;
    
    try {
      setIsSyncing(true);
      setSyncStatus('syncing');
      
      await syncData();
      
      setSyncStatus('success');
      setLastSynced(new Date());
    } catch (error) {
      console.error('Erro ao sincronizar dados:', error);
      setSyncStatus('error');
    } finally {
      setIsSyncing(false);
    }
  };

  // Se não estiver sincronizando ou não tiver sincronizado recentemente, não mostra nada
  if (syncStatus === 'idle' && !lastSynced && !hasPendingSync) {
    return null;
  }

  return (
    <div className={`flex items-center justify-between text-sm ${className}`}>
      <div className="flex items-center">
        {syncStatus === 'syncing' && (
          <>
            <RefreshCw size={16} className="mr-1 animate-spin text-amber-600" />
            <span className="text-amber-700">
              {language === 'pt' ? 'Sincronizando dados...' : 'Syncing data...'}
            </span>
          </>
        )}
        
        {syncStatus === 'success' && (
          <>
            <Check size={16} className="mr-1 text-green-600" />
            <span className="text-green-700">
              {language === 'pt' ? 'Dados sincronizados' : 'Data synced'}
            </span>
          </>
        )}
        
        {syncStatus === 'error' && (
          <>
            <AlertCircle size={16} className="mr-1 text-red-600" />
            <span className="text-red-700">
              {language === 'pt' ? 'Erro na sincronização' : 'Sync error'}
            </span>
          </>
        )}
        
        {syncStatus === 'idle' && lastSynced && (
          <span className="text-gray-500 text-xs">
            {language === 'pt' 
              ? `Última sincronização: ${lastSynced.toLocaleTimeString(language === 'pt' ? 'pt-BR' : 'en-US')}`
              : `Last synced: ${lastSynced.toLocaleTimeString(language === 'pt' ? 'pt-BR' : 'en-US')}`}
          </span>
        )}
        
        {syncStatus === 'idle' && hasPendingSync && isOnline && (
          <>
            <AlertCircle size={16} className="mr-1 text-amber-600" />
            <span className="text-amber-700">
              {language === 'pt' ? 'Dados pendentes de sincronização' : 'Pending data sync'}
            </span>
          </>
        )}
        
        {syncStatus === 'idle' && hasPendingSync && !isOnline && (
          <>
            <AlertCircle size={16} className="mr-1 text-amber-600" />
            <span className="text-amber-700">
              {language === 'pt' ? 'Dados offline pendentes' : 'Pending offline data'}
            </span>
          </>
        )}
      </div>
      
      {hasPendingSync && isOnline && syncStatus !== 'syncing' && (
        <Button
          variant="secondary"
          size="sm"
          onClick={handleSyncData}
          leftIcon={<RefreshCw size={16} />}
          className="ml-2"
        >
          {language === 'pt' ? 'Sincronizar' : 'Sync Now'}
        </Button>
      )}
    </div>
  );
};

export default DataSyncIndicator;