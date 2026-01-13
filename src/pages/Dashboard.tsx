import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { useMachineryContext } from '../context/MachineryContext';
import Card from '../components/ui/Card';
import { Link } from 'react-router-dom';
import {
  Map,
  Tractor,
  Warehouse,
  AlertTriangle,
  Calendar,
  Eye,
  Plus,
  BarChart3,
  Download,
  RefreshCw,
  Wrench,
  Settings as SettingsIcon
} from 'lucide-react';
import Button from '../components/ui/Button';
import { useLanguage } from '../context/LanguageContext';
import PWAInstallPrompt from '../components/ui/PWAInstallPrompt';
import { canInstallPWA } from '../pwa';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { formatDateForDisplay } from '../utils/dateHelpers';

const Dashboard = () => {
  const { areas, operations, products, hasPendingSync, syncData, isOnline } = useAppContext();
  const { machinery, maintenances } = useMachineryContext();
  const { language } = useLanguage();
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const { connectionType } = useNetworkStatus();
  
  // Verificar se o PWA pode ser instalado
  useEffect(() => {
    const checkInstallable = async () => {
      const installable = await canInstallPWA();
      setShowInstallPrompt(installable);
    };
    
    checkInstallable();
  }, []);
  
  // Get recent operations
  const recentOperations = [...operations]
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
    .slice(0, 5);
  
  // Get low stock products
  const lowStockProducts = products.filter(
    (product) => product.quantityInStock <= product.minStockLevel
  );
  
  // Calculate total area by operation type
  const areasByOperation = operations.reduce((acc, operation) => {
    const area = areas.find(a => a.id === operation.areaId);
    if (!area) return acc;
    
    if (!acc[operation.type]) {
      acc[operation.type] = {
        total: 0,
        count: 0
      };
    }
    
    acc[operation.type].total += area.size;
    acc[operation.type].count += 1;
    
    return acc;
  }, {} as Record<string, { total: number; count: number }>);
  
  // Format date
  const formatDate = (date: Date | string) => {
    return formatDateForDisplay(date, language === 'pt' ? 'pt-BR' : 'en-US');
  };
  
  // Get operation type label
  const getOperationTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      gradagem: language === 'pt' ? 'Gradagem' : 'Harrowing',
      subsolagem: language === 'pt' ? 'Subsolagem' : 'Subsoiling',
      plantio: language === 'pt' ? 'Plantio' : 'Planting',
      colheita: language === 'pt' ? 'Colheita' : 'Harvesting',
      dessecacao: language === 'pt' ? 'Dessecação' : 'Desiccation',
      herbicida: language === 'pt' ? 'Herbicida' : 'Herbicide',
      fungicida: language === 'pt' ? 'Fungicida' : 'Fungicide'
    };
    return labels[type] || type;
  };
  
  const handleSyncData = async () => {
    if (!isOnline || !hasPendingSync) return;
    
    try {
      setSyncLoading(true);
      await syncData();
    } catch (error) {
      console.error('Erro ao sincronizar dados:', error);
    } finally {
      setSyncLoading(false);
    }
  };
  
  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center pt-4 lg:pt-0">
        <h1 className="text-2xl font-bold text-gray-900">
          {language === 'pt' ? 'Painel da Fazenda' : 'Farm Dashboard'}
        </h1>
        <div className="text-sm text-gray-500">
          {new Date().toLocaleDateString(language === 'pt' ? 'pt-BR' : 'en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          })}
        </div>
      </div>
      
      {/* PWA Install Prompt */}
      {showInstallPrompt && (
        <PWAInstallPrompt className="mb-6" />
      )}
      
      {/* Sync Notification */}
      {hasPendingSync && isOnline && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 flex items-center justify-between">
          <div className="flex items-center">
            <RefreshCw className="h-5 w-5 text-amber-600 mr-3" />
            <div>
              <h3 className="font-medium text-amber-800">
                {language === 'pt' ? 'Dados pendentes de sincronização' : 'Pending data sync'}
              </h3>
              <p className="text-amber-700 text-sm">
                {language === 'pt'
                  ? 'Existem alterações feitas offline que precisam ser sincronizadas.'
                  : 'There are changes made offline that need to be synced.'}
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            onClick={handleSyncData}
            disabled={syncLoading}
            leftIcon={syncLoading ? <RefreshCw className="animate-spin" size={16} /> : undefined}
          >
            {syncLoading
              ? (language === 'pt' ? 'Sincronizando...' : 'Syncing...')
              : (language === 'pt' ? 'Sincronizar Agora' : 'Sync Now')}
          </Button>
        </div>
      )}
      
      {/* Connection Status */}
      {!isOnline && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <div className="flex items-center">
            <AlertTriangle className="h-5 w-5 text-amber-600 mr-3" />
            <div>
              <h3 className="font-medium text-amber-800">
                {language === 'pt' ? 'Modo Offline' : 'Offline Mode'}
              </h3>
              <p className="text-amber-700 text-sm">
                {language === 'pt'
                  ? 'Você está trabalhando offline. Suas alterações serão sincronizadas quando você estiver online novamente.'
                  : 'You are working offline. Your changes will be synced when you are online again.'}
              </p>
            </div>
          </div>
        </div>
      )}
      
      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <Card.Content className="flex items-center py-6">
            <div className="p-3 bg-green-100 rounded-full mr-4">
              <Map className="w-6 h-6 text-green-700" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">
                {language === 'pt' ? 'Total de Áreas' : 'Total Areas'}
              </p>
              <h2 className="text-3xl font-bold text-gray-900">{areas.length}</h2>
            </div>
            <Link to="/areas" className="ml-auto">
              <Button variant="ghost" size="sm" rightIcon={<Eye size={16} />}>
                {language === 'pt' ? 'Ver' : 'View'}
              </Button>
            </Link>
          </Card.Content>
        </Card>
        
        <Card>
          <Card.Content className="flex items-center py-6">
            <div className="p-3 bg-amber-100 rounded-full mr-4">
              <Tractor className="w-6 h-6 text-amber-700" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">
                {language === 'pt' ? 'Operações' : 'Operations'}
              </p>
              <h2 className="text-3xl font-bold text-gray-900">{operations.length}</h2>
            </div>
            <Link to="/operations" className="ml-auto">
              <Button variant="ghost" size="sm" rightIcon={<Eye size={16} />}>
                {language === 'pt' ? 'Ver' : 'View'}
              </Button>
            </Link>
          </Card.Content>
        </Card>
        
        <Card>
          <Card.Content className="flex items-center py-6">
            <div className="p-3 bg-blue-100 rounded-full mr-4">
              <Warehouse className="w-6 h-6 text-blue-700" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">
                {language === 'pt' ? 'Produtos' : 'Products'}
              </p>
              <h2 className="text-3xl font-bold text-gray-900">{products.length}</h2>
            </div>
            <Link to="/inventory" className="ml-auto">
              <Button variant="ghost" size="sm" rightIcon={<Eye size={16} />}>
                {language === 'pt' ? 'Ver' : 'View'}
              </Button>
            </Link>
          </Card.Content>
        </Card>
        
        <Card>
          <Card.Content className="flex items-center py-6">
            <div className="p-3 bg-purple-100 rounded-full mr-4">
              <Wrench className="w-6 h-6 text-purple-700" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">
                {language === 'pt' ? 'Máquinas' : 'Machinery'}
              </p>
              <h2 className="text-3xl font-bold text-gray-900">{machinery.length}</h2>
            </div>
            <Link to="/machinery" className="ml-auto">
              <Button variant="ghost" size="sm" rightIcon={<Eye size={16} />}>
                {language === 'pt' ? 'Ver' : 'View'}
              </Button>
            </Link>
          </Card.Content>
        </Card>
      </div>
      
      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Operations */}
        <Card>
          <Card.Header className="flex justify-between items-center">
            <div>
              <Card.Title>
                {language === 'pt' ? 'Operações Recentes' : 'Recent Operations'}
              </Card.Title>
              <Card.Description>
                {language === 'pt' ? 'Últimas atividades agrícolas' : 'Latest farming activities'}
              </Card.Description>
            </div>
            <Link to="/operations/new">
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Plus size={16} />}
              >
                {language === 'pt' ? 'Nova Operação' : 'New Operation'}
              </Button>
            </Link>
          </Card.Header>
          <Card.Content>
            {recentOperations.length > 0 ? (
              <div className="divide-y divide-gray-200">
                {recentOperations.map((operation) => {
                  const area = areas.find((a) => a.id === operation.areaId);
                  return (
                    <div 
                      key={operation.id} 
                      className="py-3 flex items-center justify-between"
                    >
                      <div className="flex items-center">
                        <div className="p-2 bg-green-100 rounded-full mr-3">
                          <Calendar className="w-5 h-5 text-green-700" />
                        </div>
                        <div>
                          <h3 className="text-sm font-medium">{operation.description}</h3>
                          <p className="text-xs text-gray-500">
                            {getOperationTypeLabel(operation.type)} • {area?.name || 'Área desconhecida'} • {formatDate(operation.startDate)}
                          </p>
                        </div>
                      </div>
                      <Link to={`/operations/${operation.id}/edit`}>
                        <Button variant="ghost" size="sm">
                          {language === 'pt' ? 'Detalhes' : 'Details'}
                        </Button>
                      </Link>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500">
                <p>
                  {language === 'pt' 
                    ? 'Nenhuma operação registrada ainda.'
                    : 'No operations recorded yet.'}
                </p>
              </div>
            )}
          </Card.Content>
          <Card.Footer>
            <Link 
              to="/operations" 
              className="text-green-700 hover:text-green-800 font-medium text-sm flex items-center"
            >
              {language === 'pt' ? 'Ver todas as operações' : 'View all operations'}
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                className="h-4 w-4 ml-1" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M9 5l7 7-7 7" 
                />
              </svg>
            </Link>
          </Card.Footer>
        </Card>
        
        {/* Low Stock Alert */}
        <Card>
          <Card.Header className="flex justify-between items-center">
            <div>
              <Card.Title>
                {language === 'pt' ? 'Alertas de Estoque' : 'Stock Alerts'}
              </Card.Title>
              <Card.Description>
                {language === 'pt' ? 'Produtos com estoque baixo' : 'Products with low stock'}
              </Card.Description>
            </div>
            <Link to="/inventory/new">
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Plus size={16} />}
              >
                {language === 'pt' ? 'Adicionar Produto' : 'Add Product'}
              </Button>
            </Link>
          </Card.Header>
          <Card.Content>
            {lowStockProducts.length > 0 ? (
              <div className="divide-y divide-gray-200">
                {lowStockProducts.map((product) => (
                  <div 
                    key={product.id} 
                    className="py-3 flex items-center justify-between"
                  >
                    <div className="flex items-center">
                      <div className="p-2 bg-red-100 rounded-full mr-3">
                        <AlertTriangle className="w-5 h-5 text-red-600" />
                      </div>
                      <div>
                        <h3 className="text-sm font-medium">{product.name}</h3>
                        <p className="text-xs text-gray-500">
                          {product.quantityInStock} {product.unit} {language === 'pt' ? 'restantes' : 'remaining'} ({language === 'pt' ? 'Mín' : 'Min'}: {product.minStockLevel})
                        </p>
                      </div>
                    </div>
                    <Link to={`/inventory/${product.id}/edit`}>
                      <Button variant="ghost" size="sm">
                        {language === 'pt' ? 'Repor' : 'Restock'}
                      </Button>
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500">
                <p>
                  {language === 'pt'
                    ? 'Nenhum alerta de estoque baixo no momento.'
                    : 'No low stock alerts at the moment.'}
                </p>
              </div>
            )}
          </Card.Content>
          <Card.Footer>
            <Link 
              to="/inventory" 
              className="text-green-700 hover:text-green-800 font-medium text-sm flex items-center"
            >
              {language === 'pt' ? 'Ver todo o inventário' : 'View all inventory'}
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                className="h-4 w-4 ml-1" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M9 5l7 7-7 7" 
                />
              </svg>
            </Link>
          </Card.Footer>
        </Card>
        
        {/* Farm Stats */}
        <Card>
          <Card.Header>
            <Card.Title className="flex items-center">
              <BarChart3 className="w-5 h-5 mr-2" />
              {language === 'pt' ? 'Estatísticas da Fazenda' : 'Farm Statistics'}
            </Card.Title>
          </Card.Header>
          <Card.Content>
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  {language === 'pt' ? 'Distribuição de Áreas' : 'Area Distribution'}
                </h3>
                <div className="bg-gray-100 rounded-full h-4 overflow-hidden">
                  {areas.length > 0 ? (
                    <div 
                      className="bg-green-600 h-full rounded-full" 
                      style={{ width: '75%' }}
                    ></div>
                  ) : (
                    <div className="bg-gray-300 h-full rounded-full w-full"></div>
                  )}
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>
                    {language === 'pt' ? 'Total: ' : 'Total: '}
                    {areas.reduce((acc, area) => acc + area.size, 0)} 
                    {language === 'pt' ? ' hectares' : ' hectares'}
                  </span>
                  <span>
                    {areas.length} 
                    {language === 'pt' ? ' áreas' : ' areas'}
                  </span>
                </div>
              </div>
              
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  {language === 'pt' ? 'Área por Tipo de Operação' : 'Area by Operation Type'}
                </h3>
                <div className="space-y-2">
                  {Object.entries(areasByOperation).map(([type, data]) => (
                    <div key={type} className="bg-gray-50 p-3 rounded-lg">
                      <div className="flex justify-between items-center">
                        <div>
                          <h4 className="font-medium">{getOperationTypeLabel(type)}</h4>
                          <p className="text-sm text-gray-500">
                            {data.count} {language === 'pt' ? 'operações' : 'operations'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">{data.total.toFixed(2)} ha</p>
                        </div>
                      </div>
                    </div>
                  ))}

                  {Object.keys(areasByOperation).length === 0 && (
                    <div className="text-center py-4 text-gray-500">
                      <p>
                        {language === 'pt'
                          ? 'Nenhuma operação registrada ainda'
                          : 'No operations recorded yet'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Card.Content>
        </Card>
        
        {/* Quick Actions */}
        <Card>
          <Card.Header>
            <Card.Title>
              {language === 'pt' ? 'Ações Rápidas' : 'Quick Actions'}
            </Card.Title>
          </Card.Header>
          <Card.Content>
            <div className="grid grid-cols-2 gap-3">
              <Link to="/areas/new">
                <Button
                  className="w-full justify-start h-auto py-3"
                  variant="outline"
                  leftIcon={<Map size={18} />}
                >
                  <div className="text-left">
                    <div className="font-medium">
                      {language === 'pt' ? 'Nova Área' : 'New Area'}
                    </div>
                    <div className="text-xs text-gray-500">
                      {language === 'pt' 
                        ? 'Registrar nova área de cultivo'
                        : 'Register new farming area'}
                    </div>
                  </div>
                </Button>
              </Link>
              
              <Link to="/operations/new">
                <Button
                  className="w-full justify-start h-auto py-3"
                  variant="outline"
                  leftIcon={<Tractor size={18} />}
                >
                  <div className="text-left">
                    <div className="font-medium">
                      {language === 'pt' ? 'Registrar Operação' : 'Record Operation'}
                    </div>
                    <div className="text-xs text-gray-500">
                      {language === 'pt' 
                        ? 'Adicionar nova atividade'
                        : 'Add new activity'}
                    </div>
                  </div>
                </Button>
              </Link>
              
              <Link to="/inventory/new">
                <Button
                  className="w-full justify-start h-auto py-3"
                  variant="outline"
                  leftIcon={<Warehouse size={18} />}
                >
                  <div className="text-left">
                    <div className="font-medium">
                      {language === 'pt' ? 'Adicionar Produto' : 'Add Product'}
                    </div>
                    <div className="text-xs text-gray-500">
                      {language === 'pt' 
                        ? 'Novo item no inventário'
                        : 'New inventory item'}
                    </div>
                  </div>
                </Button>
              </Link>
              
              <Link to="/machinery/new">
                <Button
                  className="w-full justify-start h-auto py-3"
                  variant="outline"
                  leftIcon={<Wrench size={18} />}
                >
                  <div className="text-left">
                    <div className="font-medium">
                      {language === 'pt' ? 'Nova Máquina' : 'Add Machinery'}
                    </div>
                    <div className="text-xs text-gray-500">
                      {language === 'pt' 
                        ? 'Cadastrar equipamento'
                        : 'Register equipment'}
                    </div>
                  </div>
                </Button>
              </Link>
              
              <Link to="/maintenances/new">
                <Button
                  className="w-full justify-start h-auto py-3"
                  variant="outline"
                  leftIcon={<SettingsIcon size={18} />}
                >
                  <div className="text-left">
                    <div className="font-medium">
                      {language === 'pt' ? 'Nova Manutenção' : 'New Maintenance'}
                    </div>
                    <div className="text-xs text-gray-500">
                      {language === 'pt' 
                        ? 'Registrar manutenção'
                        : 'Record maintenance'}
                    </div>
                  </div>
                </Button>
              </Link>
              
              <Link to="/reports">
                <Button
                  className="w-full justify-start h-auto py-3"
                  variant="outline"
                  leftIcon={<BarChart3 size={18} />}
                >
                  <div className="text-left">
                    <div className="font-medium">
                      {language === 'pt' ? 'Ver Relatórios' : 'View Reports'}
                    </div>
                    <div className="text-xs text-gray-500">
                      {language === 'pt' 
                        ? 'Análise de desempenho'
                        : 'Performance analysis'}
                    </div>
                  </div>
                </Button>
              </Link>
            </div>
          </Card.Content>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;