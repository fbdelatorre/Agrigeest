import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import { Calendar, Map, AlertTriangle, Clock, Package } from 'lucide-react';
import { Link } from 'react-router-dom';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import { useLanguage } from '../context/LanguageContext';
import { formatDateForDisplay } from '../utils/dateHelpers';

const Notifications = () => {
  const { operations, areas, activeSeason, products, productLots, getProductById } = useAppContext();
  const { language } = useLanguage();
  const [dateFilter, setDateFilter] = useState('week');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  const getFilterDates = () => {
    const today = new Date();
    const start = new Date(today);
    const end = new Date(today);

    switch (dateFilter) {
      case 'week':
        start.setDate(today.getDate() - today.getDay());
        end.setDate(start.getDate() + 6);
        break;
      case 'month':
        start.setDate(1);
        end.setMonth(start.getMonth() + 1, 0);
        break;
      case 'custom':
        if (customStartDate && customEndDate) {
          return {
            start: new Date(customStartDate),
            end: new Date(customEndDate)
          };
        }
        break;
    }

    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    return { start, end };
  };

  const { start: startDate, end: endDate } = getFilterDates();

  const filteredOperations = operations
    .filter(operation => {
      if (!operation.nextOperationDate || !activeSeason) return false;
      if (operation.season_id !== activeSeason.id) return false;

      const hasNewerOperation = operations.some(op =>
        op.areaId === operation.areaId &&
        op.type === operation.type &&
        new Date(op.startDate) > new Date(operation.startDate) &&
        new Date(op.startDate) <= new Date(operation.nextOperationDate)
      );

      const nextDate = new Date(operation.nextOperationDate);
      return nextDate >= startDate &&
             nextDate <= endDate &&
             !hasNewerOperation;
    })
    .sort((a, b) => new Date(a.nextOperationDate!).getTime() - new Date(b.nextOperationDate!).getTime());

  const operationsByDay = filteredOperations.reduce((acc, operation) => {
    const date = new Date(operation.nextOperationDate!).toDateString();
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push({
      ...operation,
      area: areas.find(area => area.id === operation.areaId)
    });
    return acc;
  }, {} as Record<string, Array<typeof filteredOperations[0] & { area: typeof areas[0] | undefined }>>);

  const formatDate = (date: Date | string) => {
    return formatDateForDisplay(date, language === 'pt' ? 'pt-BR' : 'en-US');
  };

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

  const isToday = (date: Date) => {
    return date.toDateString() === new Date().toDateString();
  };

  // --- Expiry warnings ---
  const isExpired = (date?: Date): boolean => {
    if (!date) return false;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return date < now;
  };

  const isExpiringSoon = (date?: Date): boolean => {
    if (!date) return false;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 60;
  };

  const getDaysUntilExpiry = (date?: Date): number | null => {
    if (!date) return null;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return Math.floor((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  };

  const expiringLots = useMemo(() => {
    return productLots
      .filter(lot => isExpired(lot.expirationDate) || isExpiringSoon(lot.expirationDate))
      .map(lot => {
        const product = getProductById(lot.productId);
        const days = getDaysUntilExpiry(lot.expirationDate);
        return { ...lot, product, days };
      })
      .filter(lot => lot.product)
      .sort((a, b) => {
        if (!a.expirationDate) return 1;
        if (!b.expirationDate) return -1;
        return a.expirationDate.getTime() - b.expirationDate.getTime();
      });
  }, [productLots, products]);

  const expiredCount = expiringLots.filter(l => l.days !== null && l.days < 0).length;
  const expiringSoonCount = expiringLots.filter(l => l.days !== null && l.days >= 0).length;

  if (!activeSeason) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-lg pt-4 lg:pt-0">
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          {language === 'pt' ? 'Nenhuma safra ativa' : 'No active season'}
        </h3>
        <p className="text-gray-600 mb-4">
          {language === 'pt'
            ? 'Selecione uma safra no menu lateral para ver as operações planejadas'
            : 'Select a season from the sidebar to view planned operations'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="mb-6 pt-4 lg:pt-0">
        <h1 className="text-2xl font-bold text-gray-900">
          {language === 'pt' ? 'Notificações' : 'Notifications'}
        </h1>
        <p className="text-gray-600">
          {language === 'pt'
            ? `Operações programadas para ${formatDate(startDate)} - ${formatDate(endDate)}`
            : `Operations scheduled for ${formatDate(startDate)} - ${formatDate(endDate)}`}
        </p>
      </div>

      {/* Expiry Warnings Section */}
      {expiringLots.length > 0 && (
        <Card>
          <Card.Header>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <AlertTriangle className="w-5 h-5 mr-2 text-orange-600" />
                <Card.Title>
                  {language === 'pt' ? 'Avisos de Validade' : 'Expiration Warnings'}
                </Card.Title>
              </div>
              <div className="flex items-center gap-2">
                {expiredCount > 0 && (
                  <Badge variant="danger">
                    {expiredCount} {language === 'pt' ? 'vencido(s)' : 'expired'}
                  </Badge>
                )}
                {expiringSoonCount > 0 && (
                  <Badge variant="warning">
                    {expiringSoonCount} {language === 'pt' ? 'vencendo' : 'expiring'}
                  </Badge>
                )}
              </div>
            </div>
          </Card.Header>
          <Card.Content>
            <div className="space-y-2">
              {expiringLots.map((lot) => {
                const expired = lot.days !== null && lot.days < 0;
                const days = lot.days;
                return (
                  <div
                    key={lot.id}
                    className={`p-3 rounded-lg border flex items-center justify-between ${
                      expired
                        ? 'bg-red-50 border-red-200'
                        : 'bg-orange-50 border-orange-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full ${expired ? 'bg-red-100' : 'bg-orange-100'}`}>
                        <Package className={`w-4 h-4 ${expired ? 'text-red-600' : 'text-orange-600'}`} />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">
                          {lot.product!.name}
                        </div>
                        <div className="text-sm text-gray-600">
                          {language === 'pt' ? 'Lote' : 'Lot'}: {lot.lotNumber} • {lot.quantity} {lot.product!.unit}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-medium ${expired ? 'text-red-700' : 'text-orange-700'}`}>
                        {lot.expirationDate ? formatDate(lot.expirationDate) : '—'}
                      </div>
                      <div className={`text-xs ${expired ? 'text-red-600' : 'text-orange-600'} flex items-center justify-end gap-1`}>
                        <Clock size={12} />
                        {expired
                          ? (language === 'pt' ? `Vencido há ${Math.abs(days!)} dia(s)` : `Expired ${Math.abs(days!)} day(s) ago`)
                          : days === 0
                          ? (language === 'pt' ? 'Vence hoje' : 'Expires today')
                          : (language === 'pt' ? `Vence em ${days} dia(s)` : `Expires in ${days} day(s)`)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 pt-3 border-t border-gray-200">
              <Link to="/inventory">
                <Button variant="secondary" size="sm">
                  {language === 'pt' ? 'Gerenciar Estoque' : 'Manage Inventory'}
                </Button>
              </Link>
            </div>
          </Card.Content>
        </Card>
      )}

      {/* Planned Operations Section */}
      <Card>
        <Card.Header>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center">
              <Calendar className="w-5 h-5 mr-2 text-green-700" />
              <Card.Title>
                {language === 'pt' ? 'Operações Planejadas' : 'Planned Operations'}
              </Card.Title>
            </div>

            <div className="flex items-center gap-4">
              <Select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                options={[
                  { value: 'week', label: language === 'pt' ? 'Esta Semana' : 'This Week' },
                  { value: 'month', label: language === 'pt' ? 'Este Mês' : 'This Month' },
                  { value: 'custom', label: language === 'pt' ? 'Período Personalizado' : 'Custom Period' }
                ]}
                className="w-48"
              />

              {dateFilter === 'custom' && (
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-md"
                  />
                  <span>{language === 'pt' ? 'até' : 'to'}</span>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              )}

              <Link to="/operations/new">
                <Button size="sm">
                  {language === 'pt' ? 'Nova Operação' : 'New Operation'}
                </Button>
              </Link>
            </div>
          </div>
        </Card.Header>
        <Card.Content>
          <div className="space-y-4">
            {Object.entries(operationsByDay).map(([date, dayOperations]) => (
              <div key={date} className="space-y-4">
                <h3 className="font-medium text-gray-700 border-b pb-2">
                  {formatDate(new Date(date))}
                </h3>
                <div className="space-y-4">
                  {dayOperations.map(operation => (
                    <div
                      key={operation.id}
                      className={`p-4 rounded-lg border ${
                        isToday(new Date(date))
                          ? 'bg-yellow-50 border-yellow-200'
                          : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            {isToday(new Date(date)) && (
                              <div className="flex items-center text-yellow-700 bg-yellow-100 px-2 py-1 rounded-full text-xs font-medium">
                                <AlertTriangle size={14} className="mr-1" />
                                {language === 'pt' ? 'Hoje' : 'Today'}
                              </div>
                            )}
                            <Badge
                              variant={isToday(new Date(date)) ? 'warning' : 'default'}
                            >
                              {getOperationTypeLabel(operation.type)}
                            </Badge>
                            {operation.area && (
                              <div className="flex items-center text-gray-600">
                                <Map size={16} className="mr-1" />
                                {operation.area.name}
                              </div>
                            )}
                          </div>
                          <h3 className="font-medium text-gray-900">
                            {operation.description}
                          </h3>
                          <div className="text-sm text-gray-600 mt-1">
                            <p>{language === 'pt' ? 'Operador: ' : 'Operator: '}{operation.operatedBy}</p>
                          </div>
                        </div>
                        <Link to={`/operations/new?areaId=${operation.areaId}`}>
                          <Button
                            size="sm"
                            variant={isToday(new Date(date)) ? 'primary' : 'secondary'}
                          >
                            {language === 'pt' ? 'Registrar Operação' : 'Record Operation'}
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {Object.keys(operationsByDay).length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <AlertTriangle size={32} className="mx-auto mb-2 text-gray-400" />
                <p>
                  {language === 'pt'
                    ? 'Não há operações programadas para este período.'
                    : 'No operations scheduled for this period.'}
                </p>
                <Link to="/operations/new" className="mt-4 inline-block">
                  <Button size="sm">
                    {language === 'pt' ? 'Planejar Nova Operação' : 'Plan New Operation'}
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </Card.Content>
      </Card>
    </div>
  );
};

export default Notifications;
