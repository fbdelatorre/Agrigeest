import React, { useState } from 'react';
import { Tractor, Warehouse, LayoutDashboard, Map, PlaneTakeoff, Settings, FileText, Bell, BarChart3, Wrench, StickyNote } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useAppContext } from '../../context/AppContext';
import { supabase } from '../../lib/supabase';
import Button from '../ui/Button';
import Select from '../ui/Select';
import Badge from '../ui/Badge';

interface NavbarProps {
  isOpen: boolean;
  onClose: () => void;
  onSignOut: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ isOpen, onClose, onSignOut }) => {
  const { t, language } = useLanguage();
  const { seasons = [], activeSeason, setActiveSeason } = useAppContext();
  const [loading, setLoading] = useState(false);

  const handleSeasonChange = async (seasonId: string) => {
    if (!seasonId) {
      setActiveSeason(null);
      return;
    }

    setLoading(true);
    try {
      const season = seasons.find(s => s.id === seasonId);
      if (!season) return;

      const { error } = await supabase.rpc('update_season_status', {
        season_id_param: season.id,
        new_status: 'active'
      });

      if (error) throw error;

      setActiveSeason(season);
    } catch (error) {
      console.error('Error updating season status:', error);
      alert(language === 'pt'
        ? 'Erro ao atualizar o status da safra'
        : 'Error updating season status');
    } finally {
      setLoading(false);
    }
  };

  return (
    <nav className={`
      fixed top-0 left-0 h-screen bg-green-800 text-white w-64 shadow-lg z-40
      transform transition-transform duration-300 ease-in-out
      lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      flex flex-col
    `}>
      {/* Header - Fixed at top */}
      <div className="flex-none p-4 border-b border-green-700">
        <div className="flex items-center space-x-2 mb-4">
          <Tractor size={28} />
          <h1 className="text-xl font-bold">AgriGest</h1>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-green-100">
            {language === 'pt' ? 'Safra Atual' : 'Current Season'}
          </label>
          <select
            value={activeSeason?.id || ''}
            onChange={(e) => handleSeasonChange(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-green-600 text-gray-900 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
            disabled={loading}
          >
            <option value="">
              {language === 'pt' ? 'Selecione uma safra' : 'Select a season'}
            </option>
            {Array.isArray(seasons) && seasons.map(season => (
              <option key={season.id} value={season.id}>
                {season.name}
              </option>
            ))}
          </select>
          {!activeSeason && (
            <p className="text-xs text-green-300">
              {language === 'pt'
                ? 'Selecione uma safra para começar'
                : 'Select a season to get started'}
            </p>
          )}
          {activeSeason && (
            <Badge variant="success" className="text-xs">
              {language === 'pt' ? 'Safra Ativa' : 'Active Season'}
            </Badge>
          )}
        </div>
      </div>
      
      {/* Navigation - Scrollable */}
      <div className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-1">
          <NavItem to="/" icon={<LayoutDashboard size={20} />} text={t('dashboard.title')} onClick={onClose} />
          <NavItem to="/areas" icon={<Map size={20} />} text={t('areas.title')} onClick={onClose} />
          <NavItem to="/operations" icon={<PlaneTakeoff size={20} />} text={t('operations.title')} onClick={onClose} />
          <NavItem to="/notifications" icon={<Bell size={20} />} text={t('notifications.title')} onClick={onClose} />
          <NavItem to="/inventory" icon={<Warehouse size={20} />} text={t('inventory.title')} onClick={onClose} />
          <NavItem to="/machinery" icon={<Wrench size={20} />} text={language === 'pt' ? 'Máquinas' : 'Machinery'} onClick={onClose} />
          <NavItem to="/maintenances" icon={<Settings size={20} />} text={language === 'pt' ? 'Manutenções' : 'Maintenances'} onClick={onClose} />
          <NavItem to="/notes" icon={<StickyNote size={20} />} text={language === 'pt' ? 'Anotações' : 'Notes'} onClick={onClose} />
          <NavItem to="/reports" icon={<FileText size={20} />} text={t('reports.title')} onClick={onClose} />
          <NavItem to="/statistics" icon={<BarChart3 size={20} />} text={language === 'pt' ? 'Estatísticas' : 'Statistics'} onClick={onClose} />
          <NavItem to="/settings" icon={<Settings size={20} />} text={t('settings.title')} onClick={onClose} />
        </ul>
      </div>
      
      {/* Footer - Fixed at bottom */}
      <div className="flex-none p-4 border-t border-green-700">
        <Button
          variant="ghost"
          className="w-full justify-start text-white hover:bg-green-700"
          onClick={onSignOut}
        >
          {language === 'pt' ? 'Sair' : 'Sign Out'}
        </Button>
      </div>
    </nav>
  );
};

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  text: string;
  onClick: () => void;
}

const NavItem: React.FC<NavItemProps> = ({ to, icon, text, onClick }) => {
  return (
    <li>
      <NavLink
        to={to}
        onClick={onClick}
        className={({ isActive }) => `
          flex items-center space-x-3 px-4 py-2.5 
          ${isActive ? 'bg-green-700 text-white' : 'text-green-100 hover:bg-green-700/50'}
          transition-colors duration-200
        `}
      >
        <span>{icon}</span>
        <span>{text}</span>
      </NavLink>
    </li>
  );
};

export default Navbar;