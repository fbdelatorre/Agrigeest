import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useLanguage } from '../context/LanguageContext';
import Card from '../components/ui/Card';
import Select from '../components/ui/Select';
import Badge from '../components/ui/Badge';
import { BarChart3, Map, Calendar, Package, Filter } from 'lucide-react';

const Statistics = () => {
  const { areas, operations, products, activeSeason } = useAppContext();
  const { language } = useLanguage();
  const [dateFilter, setDateFilter] = useState('all'); // 'all', 'week', 'month', 'season'
  
  // Calculate date range based on filter
  const getDateRange = () => {
    const today = new Date();
    let startDate = new Date(0); // Beginning of time
    
    if (dateFilter === 'week') {
      // Get the start of the current week (Sunday)
      startDate = new Date(today);
      startDate.setDate(today.getDate() - today.getDay());
      startDate.setHours(0, 0, 0, 0);
    } else if (dateFilter === 'month') {
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
    } else if (dateFilter === 'season' && activeSeason) {
      startDate = new Date(activeSeason.start_date);
    }
    
    return { startDate, endDate: today };
  };
  
  const { startDate, endDate } = getDateRange();
  
  // Filter operations by date range
  const filteredOperations = operations.filter(op => {
    const opDate = new Date(op.startDate);
    return opDate >= startDate && opDate <= endDate;
  });
  
  // Calculate statistics
  const stats = {
    totalArea: areas.reduce((acc, area) => acc + area.size, 0),
    operationsByType: {} as Record<string, { count: number; area: number }>,
    productUsage: {} as Record<string, { quantity: number; totalCost: number }>,
    areasWithoutOperations: areas.filter(area => 
      !operations.some(op => op.areaId === area.id)
    ).length,
    lowStockProducts: products.filter(p => p.quantityInStock <= p.minStockLevel).length,
  };
  
  // Calculate operations by type
  filteredOperations.forEach(operation => {
    const area = areas.find(a => a.id === operation.areaId);
    if (!area) return;
    
    if (!stats.operationsByType[operation.type]) {
      stats.operationsByType[operation.type] = { count: 0, area: 0 };
    }
    stats.operationsByType[operation.type].count++;
    stats.operationsByType[operation.type].area += area.size;
  });
  
  // Calculate product usage
  filteredOperations.forEach(operation => {
    operation.productsUsed.forEach(usage => {
      const product = products.find(p => p.id === usage.productId);
      if (!product) return;
      
      if (!stats.productUsage[product.id]) {
        stats.productUsage[product.id] = { 
          quantity: 0, 
          totalCost: 0 
        };
      }
      
      stats.productUsage[product.id].quantity += usage.quantity;
      stats.productUsage[product.id].totalCost += usage.quantity * product.price;
    });
  });
  
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
  
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(amount);
  };
  
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString(language === 'pt' ? 'pt-BR' : 'en-US');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center pt-4 lg:pt-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {language === 'pt' ? 'Estatísticas' : 'Statistics'}
          </h1>
          <p className="text-gray-600">
            {language === 'pt'
              ? 'Análise detalhada das operações e recursos da fazenda'
              : 'Detailed analysis of farm operations and resources'}
          </p>
        </div>
        
        <Select
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          options={[
            { value: 'all', label: language === 'pt' ? 'Todo período' : 'All time' },
            { value: 'week', label: language === 'pt' ? 'Esta semana' : 'This week' },
            { value: 'month', label: language === 'pt' ? 'Este mês' : 'This month' },
            { value: 'season', label: language === 'pt' ? 'Safra atual' : 'Current season' },
          ]}
          className="w-48"
        />
      </div>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <Card.Content className="flex items-center py-6">
            <div className="p-3 bg-green-100 rounded-full mr-4">
              <Map className="w-6 h-6 text-green-700" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">
                {language === 'pt' ? 'Área Total' : 'Total Area'}
              </p>
              <h2 className="text-3xl font-bold text-gray-900">
                {stats.totalArea.toFixed(1)}
              </h2>
              <p className="text-sm text-gray-500">hectares</p>
            </div>
          </Card.Content>
        </Card>
        
        <Card>
          <Card.Content className="flex items-center py-6">
            <div className="p-3 bg-amber-100 rounded-full mr-4">
              <Calendar className="w-6 h-6 text-amber-700" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">
                {language === 'pt' ? 'Operações' : 'Operations'}
              </p>
              <h2 className="text-3xl font-bold text-gray-900">
                {filteredOperations.length}
              </h2>
              <p className="text-sm text-gray-500">
                {language === 'pt' ? 'no período' : 'in period'}
              </p>
            </div>
          </Card.Content>
        </Card>
        
        <Card>
          <Card.Content className="flex items-center py-6">
            <div className="p-3 bg-red-100 rounded-full mr-4">
              <Map className="w-6 h-6 text-red-700" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">
                {language === 'pt' ? 'Áreas sem Operações' : 'Areas without Operations'}
              </p>
              <h2 className="text-3xl font-bold text-gray-900">
                {stats.areasWithoutOperations}
              </h2>
              <p className="text-sm text-gray-500">
                {language === 'pt' ? 'áreas' : 'areas'}
              </p>
            </div>
          </Card.Content>
        </Card>
        
        <Card>
          <Card.Content className="flex items-center py-6">
            <div className="p-3 bg-orange-100 rounded-full mr-4">
              <Package className="w-6 h-6 text-orange-700" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">
                {language === 'pt' ? 'Produtos em Baixa' : 'Low Stock Products'}
              </p>
              <h2 className="text-3xl font-bold text-gray-900">
                {stats.lowStockProducts}
              </h2>
              <p className="text-sm text-gray-500">
                {language === 'pt' ? 'produtos' : 'products'}
              </p>
            </div>
          </Card.Content>
        </Card>
      </div>
      
      {/* Operations by Type */}
      <Card>
        <Card.Header>
          <Card.Title className="flex items-center">
            <BarChart3 className="w-5 h-5 mr-2" />
            {language === 'pt' ? 'Operações por Tipo' : 'Operations by Type'}
          </Card.Title>
          <Card.Description>
            {language === 'pt'
              ? `${formatDate(startDate)} - ${formatDate(endDate)}`
              : `${formatDate(startDate)} - ${formatDate(endDate)}`}
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <div className="space-y-4">
            {Object.entries(stats.operationsByType).map(([type, data]) => (
              <div key={type} className="bg-gray-50 p-4 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      {getOperationTypeLabel(type)}
                    </Badge>
                    <span className="text-sm text-gray-500">
                      {data.count} {language === 'pt' ? 'operações' : 'operations'}
                    </span>
                  </div>
                  <span className="font-medium">
                    {data.area.toFixed(1)} ha
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-green-600 h-2 rounded-full"
                    style={{ 
                      width: `${(data.area / stats.totalArea * 100).toFixed(1)}%` 
                    }}
                  />
                </div>
              </div>
            ))}

            {Object.keys(stats.operationsByType).length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <p>
                  {language === 'pt'
                    ? 'Nenhuma operação registrada no período'
                    : 'No operations recorded in the period'}
                </p>
              </div>
            )}
          </div>
        </Card.Content>
      </Card>
      
      {/* Product Usage */}
      <Card>
        <Card.Header>
          <Card.Title className="flex items-center">
            <Package className="w-5 h-5 mr-2" />
            {language === 'pt' ? 'Uso de Produtos' : 'Product Usage'}
          </Card.Title>
        </Card.Header>
        <Card.Content>
          <div className="space-y-4">
            {Object.entries(stats.productUsage).map(([productId, usage]) => {
              const product = products.find(p => p.id === productId);
              if (!product) return null;
              
              return (
                <div key={productId} className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-medium">{product.name}</h3>
                      <p className="text-sm text-gray-500">
                        {usage.quantity} {product.unit} {language === 'pt' ? 'utilizados' : 'used'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{formatCurrency(usage.totalCost)}</p>
                      <p className="text-sm text-gray-500">
                        {formatCurrency(product.price)}/{product.unit}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}

            {Object.keys(stats.productUsage).length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <p>
                  {language === 'pt'
                    ? 'Nenhum produto utilizado no período'
                    : 'No products used in the period'}
                </p>
              </div>
            )}
          </div>
        </Card.Content>
      </Card>
    </div>
  );
};

export default Statistics;