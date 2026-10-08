import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';

const Topbar: React.FC = () => {
  const location = useLocation();
  const { profile, activeSeason } = useAppContext();
  const { language } = useLanguage();

  const getPageTitle = (pathname: string): { title: string; subtitle: string } => {
    if (pathname === '/') return { title: language === 'pt' ? 'Painel da Fazenda' : 'Farm Dashboard', subtitle: language === 'pt' ? 'Visão geral da propriedade' : 'Property overview' };
    if (pathname.startsWith('/areas')) return { title: language === 'pt' ? 'Áreas de Cultivo' : 'Cultivation Areas', subtitle: language === 'pt' ? 'Gestão de áreas' : 'Area management' };
    if (pathname.startsWith('/farm-map')) return { title: language === 'pt' ? 'Mapa da Fazenda' : 'Farm Map', subtitle: language === 'pt' ? 'Visão cartográfica' : 'Cartographic view' };
    if (pathname.startsWith('/operations')) return { title: language === 'pt' ? 'Operações' : 'Operations', subtitle: language === 'pt' ? 'Atividades agrícolas' : 'Farming activities' };
    if (pathname.startsWith('/inventory')) return { title: language === 'pt' ? 'Estoque' : 'Inventory', subtitle: language === 'pt' ? 'Produtos e insumos' : 'Products and supplies' };
    if (pathname.startsWith('/machinery')) return { title: language === 'pt' ? 'Máquinas' : 'Machinery', subtitle: language === 'pt' ? 'Equipamentos agrícolas' : 'Agricultural equipment' };
    if (pathname.startsWith('/maintenances')) return { title: language === 'pt' ? 'Manutenções' : 'Maintenances', subtitle: language === 'pt' ? 'Histórico de manutenções' : 'Maintenance history' };
    if (pathname.startsWith('/notes')) return { title: language === 'pt' ? 'Anotações' : 'Notes', subtitle: language === 'pt' ? 'Notas e registros' : 'Notes and records' };
    if (pathname.startsWith('/notifications')) return { title: language === 'pt' ? 'Notificações' : 'Notifications', subtitle: language === 'pt' ? 'Alertas e avisos' : 'Alerts and notices' };
    if (pathname.startsWith('/reports')) return { title: language === 'pt' ? 'Relatórios e Análises' : 'Reports & Analysis', subtitle: language === 'pt' ? 'Análise de desempenho' : 'Performance analysis' };
    if (pathname.startsWith('/statistics')) return { title: language === 'pt' ? 'Estatísticas' : 'Statistics', subtitle: language === 'pt' ? 'Indicadores agrícolas' : 'Agricultural indicators' };
    if (pathname.startsWith('/settings')) return { title: language === 'pt' ? 'Configurações' : 'Settings', subtitle: language === 'pt' ? 'Preferências do sistema' : 'System preferences' };
    return { title: 'AgriGest', subtitle: '' };
  };

  const { title, subtitle } = getPageTitle(location.pathname);
  const today = new Date().toLocaleDateString(language === 'pt' ? 'pt-BR' : 'en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <header className="sticky top-0 z-10 bg-white border-b" style={{ borderColor: '#E3E8E4' }}>
      <div className="flex items-center justify-between px-5 lg:px-6 h-16">
        {/* Left: page title */}
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold text-gray-900 truncate leading-tight">{title}</h1>
          {subtitle && <p className="text-[13px] text-gray-500 truncate mt-0.5">{subtitle}</p>}
        </div>

        {/* Right: date, notifications, profile */}
        <div className="flex items-center gap-3 lg:gap-4 flex-shrink-0">
          <div className="hidden md:block text-right leading-tight">
            <p className="text-[13px] font-medium text-gray-600 capitalize">{today}</p>
            {activeSeason && (
              <p className="text-[12px] text-brand-600 mt-0.5">{activeSeason.name}</p>
            )}
          </div>

          <Link
            to="/notifications"
            className="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            aria-label={language === 'pt' ? 'Notificações' : 'Notifications'}
          >
            <Bell size={20} />
          </Link>

          {profile && (
            <div className="hidden sm:flex items-center gap-2.5 pl-3 border-l border-gray-200">
              <div className="w-8 h-8 rounded-full bg-brand-600 text-white flex items-center justify-center text-xs font-semibold">
                {profile.firstName?.charAt(0)?.toUpperCase() || 'U'}
              </div>
              <div className="text-right leading-tight">
                <p className="text-[13px] font-semibold text-gray-700 truncate max-w-[120px]">
                  {profile.firstName} {profile.lastName}
                </p>
                <p className="text-[12px] text-gray-500 truncate max-w-[120px]">
                  {profile.institution}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Topbar;
