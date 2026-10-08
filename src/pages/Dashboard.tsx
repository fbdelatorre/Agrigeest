import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { useMachineryContext } from '../context/MachineryContext';
import { Link } from 'react-router-dom';
import {
  Map as MapIcon, MapPinned, Tractor, Package, Wrench,
  AlertTriangle, WifiOff, CheckCircle,
  Plus, BarChart3, Settings as SettingsIcon,
  Sprout, ChevronRight, Calendar, FileText,
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import PWAInstallPrompt from '../components/ui/PWAInstallPrompt';
import { canInstallPWA } from '../pwa';
import { formatDateForDisplay } from '../utils/dateHelpers';
import StatCard from '../components/ui/StatCard';
import FarmMapPreview from '../components/dashboard/FarmMapPreview';

const Dashboard = () => {
  const { areas, operations, products, isOnline, activeSeason } = useAppContext();
  const { machinery } = useMachineryContext();
  const { language } = useLanguage();
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);

  useEffect(() => {
    const checkInstallable = async () => {
      const installable = await canInstallPWA();
      setShowInstallPrompt(installable);
    };
    checkInstallable();
  }, []);

  const isPt = language === 'pt';

  // Calculations
  const totalArea = useMemo(() => areas.reduce((acc, a) => acc + a.size, 0), [areas]);
  const lowStockProducts = useMemo(
    () => products.filter((p) => p.quantityInStock <= p.minStockLevel),
    [products]
  );
  const recentOperations = useMemo(
    () => [...operations].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()).slice(0, 5),
    [operations]
  );

  // Operations by month (last 6 months with data)
  const operationsByMonth = useMemo(() => {
    if (!operations.length) return [];
    const monthMap = new Map<string, number>();
    operations.forEach((op) => {
      const d = new Date(op.startDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthMap.set(key, (monthMap.get(key) || 0) + 1);
    });
    const entries = Array.from(monthMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    return entries.slice(-6).map(([key, count]) => {
      const [yr, mo] = key.split('-');
      const monthName = new Date(parseInt(yr), parseInt(mo) - 1).toLocaleDateString(isPt ? 'pt-BR' : 'en-US', { month: 'short' });
      return { label: monthName, count };
    });
  }, [operations, isPt]);

  const maxMonthCount = operationsByMonth.length > 0 ? Math.max(...operationsByMonth.map((m) => m.count)) : 1;

  // Operations by category
  const operationsByCategory = useMemo(() => {
    if (!operations.length) return [];
    const catMap = new Map<string, number>();
    operations.forEach((op) => {
      catMap.set(op.type, (catMap.get(op.type) || 0) + 1);
    });
    return Array.from(catMap.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  }, [operations]);

  const maxCategoryCount = operationsByCategory.length > 0 ? Math.max(...operationsByCategory.map((c) => c.count)) : 1;

  const getOperationTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      gradagem: isPt ? 'Gradagem' : 'Harrowing',
      subsolagem: isPt ? 'Subsolagem' : 'Subsoiling',
      plantio: isPt ? 'Plantio' : 'Planting',
      colheita: isPt ? 'Colheita' : 'Harvesting',
      dessecacao: isPt ? 'Dessecação' : 'Desiccation',
      herbicida: isPt ? 'Herbicida' : 'Herbicide',
      fungicida: isPt ? 'Fungicida' : 'Fungicide',
      inseticida: isPt ? 'Inseticida' : 'Insecticide',
      adubacao: isPt ? 'Adubação' : 'Fertilization',
      pulverizacao: isPt ? 'Pulverização' : 'Spraying',
    };
    return labels[type] || type;
  };

  const formatDate = (date: Date | string) => formatDateForDisplay(date, isPt ? 'pt-BR' : 'en-US');

  // Empty state: no season selected
  if (!activeSeason) {
    return (
      <div className="space-y-6">
        {showInstallPrompt && <PWAInstallPrompt className="mb-4" />}
        <div className="flex flex-col items-center justify-center py-20 px-4">
          <div className="w-16 h-16 rounded-2xl bg-brand-100 flex items-center justify-center mb-4">
            <Sprout size={32} className="text-brand-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">
            {isPt ? 'Nenhuma safra selecionada' : 'No season selected'}
          </h2>
          <p className="text-sm text-gray-500 text-center max-w-md">
            {isPt
              ? 'Selecione uma safra na barra lateral para visualizar os dados da propriedade.'
              : 'Select a season in the sidebar to view property data.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {showInstallPrompt && <PWAInstallPrompt className="mb-2" />}

      {!isOnline && (
        <div className="bg-warning-50 border border-warning-100 rounded-xl p-3.5 flex items-center gap-3">
          <WifiOff className="h-5 w-5 text-warning-600 flex-shrink-0" />
          <div>
            <h3 className="text-sm font-medium text-warning-700">
              {isPt ? 'Modo Somente Leitura' : 'Read-Only Mode'}
            </h3>
            <p className="text-xs text-warning-600 mt-0.5">
              {isPt
                ? 'Sem conexão. O AgriGest está em modo somente leitura. As alterações estarão disponíveis quando a conexão for restabelecida.'
                : 'No connection. AgriGest is in read-only mode. Changes will be available when the connection is restored.'}
            </p>
          </div>
        </div>
      )}

      {/* ===== LINE 1: Stat Cards ===== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title={isPt ? 'Área Total' : 'Total Area'}
          value={totalArea > 0 ? `${totalArea.toLocaleString(isPt ? 'pt-BR' : 'en-US')} ha` : '0 ha'}
          subtitle={`${areas.length} ${isPt ? 'áreas cadastradas' : 'areas registered'}`}
          icon={<MapPinned size={20} />}
          variant="brand"
          to="/areas"
        />
        <StatCard
          title={isPt ? 'Operações' : 'Operations'}
          value={operations.length}
          subtitle={isPt ? 'nesta safra' : 'this season'}
          icon={<Tractor size={20} />}
          variant="amber"
          to="/operations"
        />
        <StatCard
          title={isPt ? 'Estoque' : 'Inventory'}
          value={products.length}
          subtitle={
            lowStockProducts.length > 0
              ? `${lowStockProducts.length} ${isPt ? 'com estoque baixo' : 'low stock'}`
              : (isPt ? 'Estoque regular' : 'Stock regular')
          }
          icon={<Package size={20} />}
          variant={lowStockProducts.length > 0 ? 'danger' : 'info'}
          to="/inventory"
          alert={lowStockProducts.length > 0}
        />
        <StatCard
          title={isPt ? 'Máquinas' : 'Machinery'}
          value={machinery.length}
          subtitle={isPt ? 'máquinas cadastradas' : 'machines registered'}
          icon={<Wrench size={20} />}
          variant="purple"
          to="/machinery"
        />
      </div>

      {/* ===== LINE 2: Map + Attention Panel ===== */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-4">
        {/* Mini Map */}
        <div className="relative h-[360px] lg:h-[400px] xl:h-[420px]">
          <FarmMapPreview />
        </div>

        {/* Attention Panel */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-card p-5">
          <h3 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <AlertTriangle size={18} className="text-warning-600" />
            {isPt ? 'Atenção' : 'Attention'}
          </h3>

          <div className="space-y-3">
            {/* Low stock */}
            {lowStockProducts.length > 0 && (
              <Link
                to="/inventory"
                className="flex items-center gap-3 p-3 rounded-xl bg-danger-50 border border-danger-100 hover:bg-danger-100/60 transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-danger-100 flex items-center justify-center flex-shrink-0">
                  <Package size={18} className="text-danger-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-danger-700">
                    {isPt ? 'Estoque baixo' : 'Low stock'}
                  </p>
                  <p className="text-xs text-danger-600">
                    {lowStockProducts.length} {isPt ? 'produtos precisam de atenção' : 'products need attention'}
                  </p>
                </div>
                <ChevronRight size={16} className="text-danger-400 flex-shrink-0" />
              </Link>
            )}

            {/* Offline */}
            {!isOnline && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-warning-50 border border-warning-100">
                <div className="w-9 h-9 rounded-lg bg-warning-100 flex items-center justify-center flex-shrink-0">
                  <WifiOff size={18} className="text-warning-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-warning-700">
                    {isPt ? 'Modo Somente Leitura' : 'Read-Only Mode'}
                  </p>
                  <p className="text-xs text-warning-600">
                    {isPt ? 'Sem conexão com a internet' : 'No internet connection'}
                  </p>
                </div>
              </div>
            )}

            {/* All clear */}
            {lowStockProducts.length === 0 && isOnline && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-success-50 border border-success-100">
                <div className="w-9 h-9 rounded-lg bg-success-100 flex items-center justify-center flex-shrink-0">
                  <CheckCircle size={18} className="text-success-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-success-700">
                    {isPt ? 'Tudo certo' : 'All clear'}
                  </p>
                  <p className="text-xs text-success-600">
                    {isPt ? 'Nenhum alerta crítico' : 'No critical alerts'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Quick stock summary inside attention */}
          {lowStockProducts.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs font-medium text-gray-500 mb-2">
                {isPt ? 'Produtos com estoque baixo' : 'Low stock products'}
              </p>
              <div className="space-y-2">
                {lowStockProducts.slice(0, 3).map((p) => (
                  <Link
                    key={p.id}
                    to={`/inventory/${p.id}/edit`}
                    className="flex items-center justify-between text-xs hover:bg-gray-50 rounded-md px-2 py-1.5 transition-colors"
                  >
                    <span className="font-medium text-gray-700 truncate">{p.name}</span>
                    <span className="text-danger-600 font-medium flex-shrink-0 ml-2">
                      {p.quantityInStock} / {p.minStockLevel} {p.unit}
                    </span>
                  </Link>
                ))}
                {lowStockProducts.length > 3 && (
                  <Link
                    to="/inventory"
                    className="block text-xs text-brand-600 hover:text-brand-700 font-medium px-2 py-1"
                  >
                    {isPt ? `+${lowStockProducts.length - 3} mais` : `+${lowStockProducts.length - 3} more`}
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ===== LINE 3: Recent Operations + Stock ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-4">
        {/* Recent Operations */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-gray-800">
                {isPt ? 'Operações Recentes' : 'Recent Operations'}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {isPt ? 'Últimas atividades da safra' : 'Latest season activities'}
              </p>
            </div>
            <Link
              to="/operations/new"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-100 text-brand-700 rounded-lg text-xs font-medium hover:bg-brand-200 transition-colors"
            >
              <Plus size={14} />
              {isPt ? 'Nova Operação' : 'New Operation'}
            </Link>
          </div>

          <div className="px-5 py-3">
            {recentOperations.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {recentOperations.map((op) => {
                  const area = areas.find((a) => a.id === op.areaId);
                  return (
                    <Link
                      key={op.id}
                      to={`/operations/${op.id}/edit`}
                      className="flex items-center gap-3 py-3 hover:bg-gray-50 -mx-2 px-2 rounded-lg transition-colors"
                    >
                      <div className="w-9 h-9 rounded-lg bg-brand-100 flex items-center justify-center flex-shrink-0">
                        <Calendar size={16} className="text-brand-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {op.description || getOperationTypeLabel(op.type)}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {getOperationTypeLabel(op.type)} · {area?.name || (isPt ? 'Área desconhecida' : 'Unknown area')}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs font-medium text-gray-600">{formatDate(op.startDate)}</p>
                        {op.operationSize > 0 && (
                          <p className="text-xs text-gray-400 mt-0.5">{op.operationSize} ha</p>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-10">
                <Tractor size={32} className="text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">
                  {isPt ? 'Você ainda não registrou operações nesta safra.' : 'No operations recorded this season.'}
                </p>
              </div>
            )}
          </div>

          {recentOperations.length > 0 && (
            <div className="px-5 py-3 border-t border-gray-200 bg-gray-50">
              <Link
                to="/operations"
                className="text-xs font-medium text-brand-600 hover:text-brand-700 flex items-center gap-1"
              >
                {isPt ? 'Ver todas as operações' : 'View all operations'}
                <ChevronRight size={14} />
              </Link>
            </div>
          )}
        </div>

        {/* Stock Summary */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-gray-800">
                {isPt ? 'Estoque' : 'Inventory'}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {isPt ? 'Produtos com atenção' : 'Products needing attention'}
              </p>
            </div>
            <Link
              to="/inventory/new"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-100 text-brand-700 rounded-lg text-xs font-medium hover:bg-brand-200 transition-colors"
            >
              <Plus size={14} />
              {isPt ? 'Adicionar' : 'Add'}
            </Link>
          </div>

          <div className="px-5 py-3">
            {lowStockProducts.length > 0 ? (
              <div className="space-y-3">
                {lowStockProducts.slice(0, 5).map((p) => {
                  const pct = p.minStockLevel > 0
                    ? Math.min(100, Math.round((p.quantityInStock / p.minStockLevel) * 100))
                    : 100;
                  return (
                    <Link
                      key={p.id}
                      to={`/inventory/${p.id}/edit`}
                      className="block hover:bg-gray-50 -mx-2 px-2 py-2 rounded-lg transition-colors"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium text-gray-700 truncate">{p.name}</span>
                        <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
                          {p.quantityInStock} / {p.minStockLevel} {p.unit}
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            pct < 50 ? 'bg-danger-500' : pct < 100 ? 'bg-warning-500' : 'bg-success-500'
                          }`}
                          style={{ width: `${Math.max(5, pct)}%` }}
                        />
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <CheckCircle size={28} className="text-success-500 mx-auto mb-2" />
                <p className="text-sm text-gray-500">
                  {isPt ? 'Todos os produtos com estoque adequado.' : 'All products adequately stocked.'}
                </p>
              </div>
            )}
          </div>

          <div className="px-5 py-3 border-t border-gray-200 bg-gray-50">
            <Link
              to="/inventory"
              className="text-xs font-medium text-brand-600 hover:text-brand-700 flex items-center gap-1"
            >
              {isPt ? 'Ver estoque completo' : 'View full inventory'}
              <ChevronRight size={14} />
            </Link>
          </div>
        </div>
      </div>

      {/* ===== LINE 4: Season Activity ===== */}
      {operations.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-card p-5">
          <h3 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <BarChart3 size={18} className="text-brand-600" />
            {isPt ? 'Atividade da Safra' : 'Season Activity'}
          </h3>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
            {/* Operations by Month - bar chart */}
            <div>
              <p className="text-xs font-medium text-gray-500 mb-4">
                {isPt ? 'Operações por mês' : 'Operations by month'}
              </p>
              {operationsByMonth.length > 0 ? (
                <div className="flex items-end justify-between gap-2 h-[140px]">
                  {operationsByMonth.map((m, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-2">
                      <span className="text-xs font-medium text-gray-600">{m.count}</span>
                      <div className="w-full flex items-end justify-center" style={{ height: '90px' }}>
                        <div
                          className="w-full max-w-[36px] bg-brand-500 rounded-t-md transition-all duration-200 hover:bg-brand-600"
                          style={{ height: `${(m.count / maxMonthCount) * 90}px` }}
                          title={`${m.label}: ${m.count}`}
                        />
                      </div>
                      <span className="text-[10px] text-gray-500 capitalize">{m.label}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 py-8 text-center">
                  {isPt ? 'Sem dados suficientes' : 'Not enough data'}
                </p>
              )}
            </div>

            {/* Operations by Category - horizontal bars */}
            <div>
              <p className="text-xs font-medium text-gray-500 mb-4">
                {isPt ? 'Operações por categoria' : 'Operations by category'}
              </p>
              {operationsByCategory.length > 0 ? (
                <div className="space-y-2.5">
                  {operationsByCategory.slice(0, 6).map((c, i) => (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-gray-700">{getOperationTypeLabel(c.type)}</span>
                        <span className="text-xs text-gray-500">{c.count}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-brand-500 rounded-full transition-all duration-200"
                          style={{ width: `${(c.count / maxCategoryCount) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 py-8 text-center">
                  {isPt ? 'Sem dados suficientes' : 'Not enough data'}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== LINE 5: Quick Actions ===== */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-card p-5">
        <h3 className="text-base font-semibold text-gray-800 mb-4">
          {isPt ? 'Ações Rápidas' : 'Quick Actions'}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <QuickAction
            to="/areas/new"
            icon={<MapIcon size={18} />}
            title={isPt ? 'Nova Área' : 'New Area'}
            desc={isPt ? 'Registrar área de cultivo' : 'Register cultivation area'}
          />
          <QuickAction
            to="/operations/new"
            icon={<Tractor size={18} />}
            title={isPt ? 'Registrar Operação' : 'Record Operation'}
            desc={isPt ? 'Adicionar atividade' : 'Add new activity'}
          />
          <QuickAction
            to="/inventory/new"
            icon={<Package size={18} />}
            title={isPt ? 'Adicionar Produto' : 'Add Product'}
            desc={isPt ? 'Novo item no estoque' : 'New inventory item'}
          />
          <QuickAction
            to="/machinery/new"
            icon={<Wrench size={18} />}
            title={isPt ? 'Nova Máquina' : 'Add Machinery'}
            desc={isPt ? 'Cadastrar equipamento' : 'Register equipment'}
          />
          <QuickAction
            to="/maintenances/new"
            icon={<SettingsIcon size={18} />}
            title={isPt ? 'Nova Manutenção' : 'New Maintenance'}
            desc={isPt ? 'Registrar manutenção' : 'Record maintenance'}
          />
          <QuickAction
            to="/reports"
            icon={<FileText size={18} />}
            title={isPt ? 'Ver Relatórios' : 'View Reports'}
            desc={isPt ? 'Análise de desempenho' : 'Performance analysis'}
          />
        </div>
      </div>

      {/* Empty states for areas */}
      {areas.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-card p-8 text-center">
          <MapIcon size={32} className="text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">
            {isPt ? 'Nenhuma área cadastrada.' : 'No areas registered.'}
          </p>
          <Link
            to="/areas/new"
            className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 bg-brand-100 text-brand-700 rounded-lg text-xs font-medium hover:bg-brand-200 transition-colors"
          >
            <Plus size={14} />
            {isPt ? 'Cadastrar primeira área' : 'Register first area'}
          </Link>
        </div>
      )}
    </div>
  );
};

interface QuickActionProps {
  to: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
}

const QuickAction: React.FC<QuickActionProps> = ({ to, icon, title, desc }) => {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 p-3.5 rounded-xl border border-gray-200 hover:border-brand-300 hover:bg-brand-50/30 transition-all duration-150 group"
    >
      <div className="w-9 h-9 rounded-lg bg-gray-100 group-hover:bg-brand-100 flex items-center justify-center flex-shrink-0 transition-colors">
        <span className="text-gray-500 group-hover:text-brand-600 transition-colors">{icon}</span>
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-800">{title}</p>
        <p className="text-xs text-gray-500 truncate">{desc}</p>
      </div>
    </Link>
  );
};

export default Dashboard;
