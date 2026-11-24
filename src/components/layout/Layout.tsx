import { useFieldSync } from '../../context/FieldSyncContext';
import React, { useState, useEffect } from 'react';
import Navbar from './Navbar';
import Topbar from './Topbar';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Menu, X, WifiOff, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAppContext } from '../../context/AppContext';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useLanguage } from '../../context/LanguageContext';
import { useLegacyOfflineData } from '../../hooks/useLegacyOfflineData';
import JoinInstitution from '../auth/JoinInstitution';
import {OperationalPilotNotices} from '../../features/licensing/OperationalPilotGate';

const Layout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);
  const { profile } = useAppContext();
  const { isOnline } = useNetworkStatus();
  const { language } = useLanguage();
  const fieldSync = useFieldSync();
  const pending = fieldSync.entries.filter(entry => entry.state === 'pending').length;
  const blocked = fieldSync.entries.filter(entry => entry.state === 'blocked').length;
  const legacyData = useLegacyOfflineData();

  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsSidebarOpen(false);
    };
    if (isSidebarOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isSidebarOpen]);

  const handleSignOut = async () => {
    setSignOutFailed(false);
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
      navigate('/login', { replace: true });
    } catch (error) {
      console.error('Sign out error:', error);
      setSignOutFailed(true);
    }
  };

  // If user is authenticated but has no institution, show the join institution screen
  if (profile && !profile.institutionId) {
    return <JoinInstitution />;
  }

  return (
    <div className="min-h-screen bg-[#F5F7F5]">
      {/* Mobile top bar */}
      <div
        className="lg:hidden fixed top-0 left-0 right-0 z-50 px-4 flex items-center justify-between shadow-sm"
        style={{
          backgroundColor: '#123D2A',
          height: 'calc(3.5rem + env(safe-area-inset-top))',
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
        <button
          className="p-2 -ml-2 text-white rounded-lg transition-colors"
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          aria-label="Toggle menu"
        >
          {isSidebarOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
        <div className="text-white text-center flex-1">
          <h1 className="text-sm font-semibold truncate">AgriGest — {profile?.institution || ''}</h1>
        </div>
        <button
          className="p-2 -mr-2 text-white rounded-lg transition-colors"
          onClick={handleSignOut}
          aria-label={language === 'pt' ? 'Sair' : 'Sign Out'}
        >
          <span className="text-xs font-medium">{language === 'pt' ? 'Sair' : 'Sair'}</span>
        </button>
      </div>

      {/* Backdrop for mobile */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <Navbar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} onSignOut={handleSignOut} />

      {/* Main content */}
      <div className="lg:ml-64 min-h-screen flex flex-col">
        <Topbar />
        <main
          className="flex-1 px-4 lg:px-6 py-4 lg:py-6 pb-20 pt-[calc(3.5rem+env(safe-area-inset-top))] lg:pt-6"
        >
          <div className="max-w-[1600px] mx-auto">
            <OperationalPilotNotices/>
            {!isOnline && (
              <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center gap-2">
                <WifiOff size={18} className="text-amber-600 flex-shrink-0" />
                <span className="text-sm text-amber-800 font-medium">
                  {language === 'pt'
                    ? 'Sem conexão. Você pode registrar chuvas, monitoramentos e recomendações neste dispositivo.'
                    : 'No connection. You can record rainfall, reports, and recommendations on this device.'}
                </span>
              </div>
            )}
            {(pending > 0 || blocked > 0 || fieldSync.localError) && (
              <p role="status" className="mb-4 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-900">
                {fieldSync.localError
                  ? (language === 'pt' ? 'Não foi possível ler os registros locais neste dispositivo.' : 'Could not read local records on this device.')
                  : (language === 'pt' ? `${pending} aguardando sincronização · ${blocked} precisam de atenção` :
                    `${pending} waiting to sync · ${blocked} need attention`)}
              </p>
            )}
            {isOnline && legacyData.hasLegacyData && (
              <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-center gap-2">
                <AlertTriangle size={18} className="text-blue-600 flex-shrink-0" />
                <span className="text-sm text-blue-800 font-medium">
                  {language === 'pt'
                    ? 'Existem alterações antigas feitas offline neste dispositivo que ainda não foram enviadas. Elas foram preservadas para evitar perda de dados.'
                    : 'There are old offline changes on this device that have not been sent. They have been preserved to avoid data loss.'}
                </span>
              </div>
            )}
            {signOutFailed && (
              <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-red-800">
                {language === 'pt'
                  ? 'Não foi possível encerrar a sessão. Verifique a conexão e tente novamente.'
                  : 'Could not sign out. Check your connection and try again.'}
              </p>
            )}
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
