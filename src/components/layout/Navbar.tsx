import React, { useState } from 'react';
import {
  Warehouse, LayoutDashboard, Map, MapPinned, PlaneTakeoff,
  Settings, FileText, Bell, BarChart3, Wrench, StickyNote, LogOut, Sprout,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useAppContext } from '../../context/AppContext';
import { supabase } from '../../lib/supabase';

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

  interface NavGroup {
    label: string;
    items: { to: string; icon: React.ReactNode; text: string }[];
  }

  const navGroups: NavGroup[] = [
    {
      label: language === 'pt' ? 'VISÃO GERAL' : 'OVERVIEW',
      items: [
        { to: '/', icon: <LayoutDashboard size={18} />, text: t('dashboard.title') },
        { to: '/farm-map', icon: <MapPinned size={18} />, text: language === 'pt' ? 'Mapa da Fazenda' : 'Farm Map' },
      ],
    },
    {
      label: language === 'pt' ? 'LAVOURA' : 'CROPS',
      items: [
        { to: '/areas', icon: <Map size={18} />, text: t('areas.title') },
        { to: '/operations', icon: <PlaneTakeoff size={18} />, text: t('operations.title') },
        { to: '/inventory', icon: <Warehouse size={18} />, text: t('inventory.title') },
      ],
    },
    {
      label: language === 'pt' ? 'EQUIPAMENTOS' : 'EQUIPMENT',
      items: [
        { to: '/machinery', icon: <Wrench size={18} />, text: language === 'pt' ? 'Máquinas' : 'Machinery' },
        { to: '/maintenances', icon: <Settings size={18} />, text: language === 'pt' ? 'Manutenções' : 'Maintenances' },
      ],
    },
    {
      label: language === 'pt' ? 'GESTÃO' : 'MANAGEMENT',
      items: [
        { to: '/notifications', icon: <Bell size={18} />, text: t('notifications.title') },
        { to: '/notes', icon: <StickyNote size={18} />, text: language === 'pt' ? 'Anotações' : 'Notes' },
        { to: '/reports', icon: <FileText size={18} />, text: t('reports.title') },
        { to: '/statistics', icon: <BarChart3 size={18} />, text: language === 'pt' ? 'Estatísticas' : 'Statistics' },
      ],
    },
    {
      label: language === 'pt' ? 'SISTEMA' : 'SYSTEM',
      items: [
        { to: '/settings', icon: <Settings size={18} />, text: t('settings.title') },
      ],
    },
  ];

  return (
    <nav
      data-sidebar="true"
      style={{
        backgroundColor: '#123D2A',
        height: '100dvh',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
      className={`fixed top-0 left-0 text-white z-50 flex flex-col overflow-y-auto transition-transform duration-200 ease-in-out lg:translate-x-0 lg:w-64 w-[min(85vw,320px)] ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
      >
      {/* Logo / Brand */}
      <div className="flex-none px-5 pt-5 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#1F6B45' }}>
            <Sprout size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white leading-tight">AgriGest</h1>
            <p className="text-[10px] tracking-wider font-medium uppercase" style={{ color: 'rgba(255,255,255,0.60)' }}>
              {language === 'pt' ? 'Gestão Agrícola' : 'Farm Management'}
            </p>
          </div>
        </div>
      </div>

      {/* Season selector */}
      <div className="flex-none px-5 pb-4">
        <div
          className="rounded-lg p-3"
          style={{
            backgroundColor: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.10)',
          }}
        >
          <label
            className="block text-[10px] font-semibold tracking-wider uppercase mb-2"
            style={{ color: 'rgba(255,255,255,0.55)' }}
          >
            {language === 'pt' ? 'Safra Atual' : 'Current Season'}
          </label>
          <select
            value={activeSeason?.id || ''}
            onChange={(e) => handleSeasonChange(e.target.value)}
            className="w-full h-9 px-2.5 text-white text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500 cursor-pointer"
            style={{
              backgroundColor: 'rgba(255,255,255,0.10)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: '#FFFFFF',
            }}
            disabled={loading}
          >
            <option value="" className="bg-white text-gray-900">
              {language === 'pt' ? 'Selecione uma safra' : 'Select a season'}
            </option>
            {Array.isArray(seasons) && seasons.map(season => (
              <option key={season.id} value={season.id} className="bg-white text-gray-900">
                {season.name}
              </option>
            ))}
          </select>
          {activeSeason ? (
            <div className="mt-2">
              <span
                className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-medium"
                style={{
                  backgroundColor: 'rgba(46,139,87,0.25)',
                  color: '#B8E6C8',
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full mr-1.5 inline-block" style={{ backgroundColor: '#6FCF97' }} />
                {language === 'pt' ? 'Safra Ativa' : 'Active'}
              </span>
            </div>
          ) : (
            <p className="text-[10px] mt-2" style={{ color: 'rgba(255,255,255,0.45)' }}>
              {language === 'pt' ? 'Selecione para começar' : 'Select to start'}
            </p>
          )}
        </div>
      </div>

      {/* Navigation - Scrollable */}
      <div className="flex-1 overflow-y-auto sidebar-scroll px-3 pb-2">
        {navGroups.map((group, gi) => (
          <div key={gi} className="mb-4">
            <p
              className="px-3 mb-1.5 text-[10px] font-semibold tracking-wider uppercase"
              style={{ color: 'rgba(255,255,255,0.42)' }}
            >
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <NavItem
                  key={item.to}
                  to={item.to}
                  icon={item.icon}
                  text={item.text}
                  onClick={onClose}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Footer - Logout */}
      <div
        className="flex-none px-3 pb-4 pt-2"
        style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
      >
        <button
          onClick={onSignOut}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors duration-150"
          style={{ color: 'rgba(255,255,255,0.70)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.07)';
            e.currentTarget.style.color = '#FFFFFF';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = 'rgba(255,255,255,0.70)';
          }}
        >
          <LogOut size={18} />
          <span className="font-medium">{language === 'pt' ? 'Sair' : 'Sign Out'}</span>
        </button>
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
        end={to === '/'}
        className={({ isActive }) => {
          if (isActive) {
            return 'relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150 text-white';
          }
          return 'sidebar-nav-item relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-normal transition-colors duration-150';
        }}
        style={({ isActive }) =>
          isActive
            ? { backgroundColor: 'rgba(255,255,255,0.11)', color: '#FFFFFF' }
            : { color: 'rgba(255,255,255,0.76)' }
        }
      >
        {({ isActive }) => (
          <>
            {isActive && (
              <span
                className="absolute left-0 top-1/2 -translate-y-1/2 rounded-full"
                style={{ width: '3px', height: '20px', backgroundColor: '#6FCF97', borderRadius: '0 3px 3px 0' }}
              />
            )}
            <span className="flex-shrink-0" style={{ color: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.65)' }}>
              {icon}
            </span>
            <span className="truncate">{text}</span>
          </>
        )}
      </NavLink>
    </li>
  );
};

export default Navbar;
