import React, { useState, useEffect } from 'react';
import Navbar from './Navbar';
import { Outlet, useNavigate } from 'react-router-dom';
import { Menu } from 'lucide-react';
import Button from '../ui/Button';
import { supabase } from '../../lib/supabase';
import { useAppContext } from '../../context/AppContext';
import DataSyncIndicator from '../ui/DataSyncIndicator';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';

const Layout: React.FC = () => {
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { profile } = useAppContext();
  const { isOnline } = useNetworkStatus();

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Sign out error:', error);
    } finally {
      // Always navigate to login, even if sign out fails
      navigate('/login');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Mobile menu button */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-20 bg-green-800 px-4 py-3 flex items-center justify-between">
        <Button
          variant="ghost"
          className="text-white hover:bg-green-700"
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          aria-label="Toggle menu"
        >
          <Menu size={24} />
        </Button>
        <div className="text-white text-center flex-1 mr-10">
          <h1 className="text-lg font-bold truncate">AgriGest - {profile?.institution || ''}</h1>
        </div>
        <Button
          variant="ghost"
          className="text-white hover:bg-green-700"
          onClick={handleSignOut}
        >
          Sign Out
        </Button>
      </div>

      {/* Backdrop for mobile */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <Navbar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} onSignOut={handleSignOut} />

      {/* Main content */}
      <main className="lg:ml-64 pt-16 lg:pt-0 p-4 lg:p-6 pb-20">
        {/* Sync indicator */}
        {isOnline && <DataSyncIndicator className="mb-4" />}
        
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;