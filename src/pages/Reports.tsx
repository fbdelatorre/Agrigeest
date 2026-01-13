import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import Card from '../components/ui/Card';
import Select from '../components/ui/Select';
import Badge from '../components/ui/Badge';
import { FileText, Calendar, Filter } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { formatDateForDisplay } from '../utils/dateHelpers';

const Reports = () => {
  const { areas, operations } = useAppContext();
  const { language } = useLanguage();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('');
  
  // Get all unique operation types
  const operationTypes = Array.from(new Set(operations.map(op => op.type)));
  
  // Get the latest operation and planting date for each area
  const areaOperations = areas.map(area => {
    const areaOps = operations
      .filter(op => op.areaId === area.id)
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
    
    const plantingOperation = operations
      .filter(op => op.areaId === area.id && op.type === 'plantio')
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())[0];
    
    return {
      area,
      lastOperation: areaOps[0] || null,
      plantingDate: plantingOperation?.startDate || null
    };
  });
  
  // Filter areas based on search and operation type
  const filteredOperations = areaOperations.filter(({ area, lastOperation }) => {
    const matchesSearch = 
      area.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (area.currentCrop && area.currentCrop.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesType = !selectedType || (lastOperation && lastOperation.type === selectedType);
    
    return matchesSearch && matchesType;
  });
  
  // Format date
  const formatDate = (date: Date | string | null) => {
    if (!date) return '-';
    return formatDateForDisplay(date, 'pt-BR');
  };
  
  // Get operation type label
  const getOperationTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      gradagem: 'Gradagem',
      subsolagem: 'Subsolagem',
      plantio: 'Plantio',
      colheita: 'Colheita',
      dessecacao: 'Dessecação',
      herbicida: 'Apl. Herbicidas',
      fungicida: 'Fungicida'
    };
    return labels[type] || type;
  };
  
  // Get badge variant for operation type
  const getOperationBadgeVariant = (type: string) => {
    const variants: Record<string, 'primary' | 'secondary' | 'warning' | 'success'> = {
      gradagem: 'secondary',
      subsolagem: 'secondary',
      plantio: 'primary',
      colheita: 'success',
      dessecacao: 'warning',
      herbicida: 'warning',
      fungicida: 'warning'
    };
    return variants[type] || 'default';
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6 pt-4 lg:pt-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Relatório de Operações</h1>
          <p className="text-gray-600">Visualize o histórico de operações por área</p>
        </div>
      </div>
      
      <Card>
        <Card.Header className="bg-green-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <FileText className="w-5 h-5 mr-2 text-green-700" />
              <Card.Title>
                Status das Áreas
              </Card.Title>
            </div>
            <div className="flex gap-4">
              <div className="relative w-64">
                <input
                  type="text"
                  placeholder="Buscar área ou cultivo..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <div className="absolute left-3 top-2.5 text-gray-400">
                  <Filter size={18} />
                </div>
              </div>
              <Select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                options={[
                  { value: '', label: 'Todos os tipos' },
                  ...operationTypes.map(type => ({
                    value: type,
                    label: getOperationTypeLabel(type)
                  }))
                ]}
                className="w-48"
              />
            </div>
          </div>
        </Card.Header>
        <Card.Content>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Área</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Cultivo Atual</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Data de Plantio</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Tamanho</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Última Operação</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredOperations.map(({ area, lastOperation, plantingDate }) => (
                  <tr key={area.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4">
                      <div className="font-medium text-gray-900">{area.name}</div>
                    </td>
                    <td className="px-4 py-4 text-gray-500">
                      {area.current_crop || '-'}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center text-gray-500">
                        <Calendar size={16} className="mr-2" />
                        {formatDate(plantingDate)}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-gray-500">
                      {area.size} {area.unit}
                    </td>
                    <td className="px-4 py-4">
                      {lastOperation ? (
                        <div className="space-y-1">
                          <Badge variant={getOperationBadgeVariant(lastOperation.type)}>
                            {getOperationTypeLabel(lastOperation.type)}
                          </Badge>
                          <div className="text-sm text-gray-500">
                            {lastOperation.description}
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400">Nenhuma operação registrada</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {lastOperation ? (
                        <div className="flex items-center text-gray-500">
                          <Calendar size={16} className="mr-2" />
                          {formatDate(lastOperation.startDate)}
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {filteredOperations.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <p>Nenhuma área encontrada</p>
              </div>
            )}
          </div>
        </Card.Content>
      </Card>
    </div>
  );
};

export default Reports;