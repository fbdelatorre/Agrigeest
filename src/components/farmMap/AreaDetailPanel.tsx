import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import { AreaMapSummary } from '../../types/farmMap';
import {
  getDaysSince,
  getDaysUntil,
  formatDateBR,
} from '../../utils/farmMap/farmMapHelpers';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import {
  X, Plus, Clock, Sprout, FlaskConical, Bug, Leaf, Calendar,
  AlertTriangle, ChevronRight, History, MapPin, User, Package,
} from 'lucide-react';
import { Operation } from '../../types';

interface AreaDetailPanelProps {
  summary: AreaMapSummary;
  onClose: () => void;
}

const AreaDetailPanel: React.FC<AreaDetailPanelProps> = ({ summary, onClose }) => {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const { operations, products, activeSeason } = useAppContext();
  const [showHistory, setShowHistory] = useState(false);

  const areaOperations = useMemo(() => {
    return operations
      .filter(op => op.areaId === summary.areaId)
      .sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
  }, [operations, summary.areaId]);

  const recentOperations = areaOperations.slice(0, 5);

  const lastOperation = areaOperations[0];

  const lastOpProducts = useMemo(() => {
    if (!lastOperation || !lastOperation.productsUsed) return [];
    return lastOperation.productsUsed.map(usage => {
      const product = products.find(p => p.id === usage.productId);
      return {
        name: product?.name || 'Produto desconhecido',
        quantity: usage.quantity,
        dose: usage.dose,
        unit: product?.unit || '',
      };
    });
  }, [lastOperation, products]);

  const daysSinceFungicide = getDaysSince(summary.lastFungicideDate);
  const daysSinceInsecticide = getDaysSince(summary.lastInsecticideDate);
  const daysSinceHerbicide = getDaysSince(summary.lastHerbicideDate);
  const daysUntilNext = getDaysUntil(summary.nextOperationDate);

  const handleRegisterOperation = () => {
    navigate(`/operations/new?areaId=${summary.areaId}`);
  };

  const handleViewAreaDetail = () => {
    navigate(`/areas/${summary.areaId}`);
  };

  const getAlertStatus = (): { type: 'danger' | 'warning' | 'info' | 'ok'; message: string } | null => {
    if (daysUntilNext !== null) {
      if (daysUntilNext < 0) {
        return {
          type: 'danger',
          message: language === 'pt'
            ? `Aplicacao atrasada ha ${Math.abs(daysUntilNext)} dia(s)`
            : `Application overdue by ${Math.abs(daysUntilNext)} day(s)`,
        };
      }
      if (daysUntilNext <= 3) {
        return {
          type: 'warning',
          message: language === 'pt'
            ? `Proxima aplicacao em ${daysUntilNext} dia(s)`
            : `Next application in ${daysUntilNext} day(s)`,
        };
      }
    }

    if (daysSinceFungicide !== null && daysSinceFungicide > 18) {
      return {
        type: 'warning',
        message: language === 'pt'
          ? `Fungicida: ultima aplicacao ha ${daysSinceFungicide} dias`
          : `Fungicide: last applied ${daysSinceFungicide} days ago`,
      };
    }

    return null;
  };

  const alert = getAlertStatus();

  const renderLastOpRow = (
    icon: React.ReactNode,
    label: string,
    dateStr: string | null,
  ) => {
    const days = getDaysSince(dateStr);
    return (
      <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
        <div className="flex items-center gap-2">
          <span className="text-gray-400">{icon}</span>
          <span className="text-sm font-medium text-gray-700">{label}</span>
        </div>
        <div className="text-right">
          {dateStr ? (
            <>
              <div className="text-sm text-gray-900">{formatDateBR(dateStr)}</div>
              <div className="text-xs text-gray-500">
                {days !== null && (
                  language === 'pt' ? `${days} dias atras` : `${days} days ago`
                )}
              </div>
            </>
          ) : (
            <span className="text-xs text-gray-400 italic">
              {language === 'pt' ? 'Nunca registrado' : 'Never registered'}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white shadow-xl flex flex-col h-full max-h-full">
      {/* Header */}
      <div className="flex-none p-4 border-b border-gray-200 bg-green-800 text-white">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <MapPin size={24} />
            <div>
              <h2 className="text-lg font-bold">{summary.areaName}</h2>
              <p className="text-sm text-green-100">
                {summary.areaSize} {summary.areaUnit}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-green-700">
            <X size={20} />
          </button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-1.5">
            <Sprout size={16} className="text-green-200" />
            <span className="text-green-100">{language === 'pt' ? 'Cultura:' : 'Crop:'}</span>
            <span className="font-medium">{summary.currentCrop || '--'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <FlaskConical size={16} className="text-green-200" />
            <span className="text-green-100">{language === 'pt' ? 'Cultivar:' : 'Cultivar:'}</span>
            <span className="font-medium">{summary.cultivar || '--'}</span>
          </div>
        </div>
        {activeSeason && (
          <div className="mt-1 text-xs text-green-200">
            {language === 'pt' ? 'Safra:' : 'Season:'} {activeSeason.name}
          </div>
        )}
      </div>

      {/* Alert */}
      {alert && (
        <div className={`flex-none px-4 py-2 flex items-center gap-2 text-sm ${
          alert.type === 'danger' ? 'bg-red-50 text-red-700 border-b border-red-200' :
          alert.type === 'warning' ? 'bg-yellow-50 text-yellow-800 border-b border-yellow-200' :
          'bg-blue-50 text-blue-700 border-b border-blue-200'
        }`}>
          <AlertTriangle size={16} />
          <span>{alert.message}</span>
        </div>
      )}

      {/* Content - scrollable */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Last operations summary */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
            <Clock size={16} className="text-green-700" />
            {language === 'pt' ? 'Ultimas operacoes' : 'Recent operations'}
          </h3>
          <div className="bg-gray-50 rounded-lg p-3">
            {renderLastOpRow(
              <FlaskConical size={16} />,
              language === 'pt' ? 'Fungicida' : 'Fungicide',
              summary.lastFungicideDate,
            )}
            {renderLastOpRow(
              <Bug size={16} />,
              language === 'pt' ? 'Inseticida' : 'Insecticide',
              summary.lastInsecticideDate,
            )}
            {renderLastOpRow(
              <Leaf size={16} />,
              language === 'pt' ? 'Herbicida' : 'Herbicide',
              summary.lastHerbicideDate,
            )}
            {renderLastOpRow(
              <Sprout size={16} />,
              language === 'pt' ? 'Desseccao' : 'Desiccation',
              summary.lastDessecacaoDate,
            )}
            {renderLastOpRow(
              <Calendar size={16} />,
              language === 'pt' ? 'Ultima operacao geral' : 'Last operation overall',
              summary.lastOperationDate,
            )}
          </div>
        </div>

        {/* Last operation details */}
        {lastOperation && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              {language === 'pt' ? 'Ultima operacao registrada' : 'Last registered operation'}
            </h3>
            <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
              <div className="font-medium text-gray-900">{lastOperation.description || lastOperation.type}</div>
              <div className="text-sm text-gray-600">{formatDateBR(lastOperation.startDate.toISOString())}</div>
              {lastOperation.operatedBy && (
                <div className="flex items-center gap-1.5 text-sm text-gray-600">
                  <User size={14} />
                  {lastOperation.operatedBy}
                </div>
              )}
              {lastOpProducts.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 text-sm text-gray-600 mb-1">
                    <Package size={14} />
                    {language === 'pt' ? 'Produtos:' : 'Products:'}
                  </div>
                  <div className="flex flex-wrap gap-1.5 ml-5">
                    {lastOpProducts.map((p, i) => (
                      <Badge key={i} variant="default" className="text-xs">
                        {p.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* History view */}
        {showHistory && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              {language === 'pt' ? 'Historico completo' : 'Full history'}
            </h3>
            <div className="space-y-2">
              {areaOperations.map((op: Operation) => (
                <button
                  key={op.id}
                  onClick={() => navigate(`/operations/${op.id}/edit`)}
                  className="w-full text-left bg-white border border-gray-200 rounded-lg p-3 hover:border-green-400 hover:bg-green-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-gray-900 capitalize">{op.type}</div>
                      <div className="text-xs text-gray-500">{formatDateBR(op.startDate.toISOString())}</div>
                      {op.description && (
                        <div className="text-xs text-gray-600 mt-0.5">{op.description}</div>
                      )}
                    </div>
                    <ChevronRight size={16} className="text-gray-400" />
                  </div>
                </button>
              ))}
              {areaOperations.length === 0 && (
                <div className="text-sm text-gray-500 text-center py-4">
                  {language === 'pt' ? 'Nenhuma operacao registrada' : 'No operations registered'}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer - actions */}
      <div className="flex-none p-4 border-t border-gray-200 space-y-2">
        <Button
          onClick={handleRegisterOperation}
          className="w-full"
          leftIcon={<Plus size={18} />}
        >
          {language === 'pt' ? 'Registrar Operacao' : 'Register Operation'}
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowHistory(!showHistory)}
            leftIcon={<History size={16} />}
          >
            {showHistory
              ? (language === 'pt' ? 'Ocultar Historico' : 'Hide History')
              : (language === 'pt' ? 'Ver Historico' : 'View History')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleViewAreaDetail}
            leftIcon={<MapPin size={16} />}
          >
            {language === 'pt' ? 'Detalhes' : 'Details'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AreaDetailPanel;
