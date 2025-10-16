import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import OperationCard from '../../components/operations/OperationCard';
import Button from '../../components/ui/Button';
import { Plus, Filter, ChevronDown } from 'lucide-react';
import Select from '../../components/ui/Select';

const OperationsList = () => {
  const navigate = useNavigate();
  const { operations, areas, deleteOperation, activeSeason } = useAppContext();
  const { language } = useLanguage();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterArea, setFilterArea] = useState('');
  const [sortOrder, setSortOrder] = useState('desc');
  
  // Get all unique operation types from actual operations
  const operationTypes = Array.from(new Set(operations.map(op => op.type))).sort();
  
  // Filter operations
  const filteredOperations = operations.filter((operation) => {
    const matchesSearch = 
      operation.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      operation.operatedBy.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = filterType ? operation.type === filterType : true;
    const matchesArea = filterArea ? operation.areaId === filterArea : true;
    
    return matchesSearch && matchesType && matchesArea;
  });
  
  // Sort operations
  const sortedOperations = [...filteredOperations].sort((a, b) => {
    const dateA = new Date(a.startDate).getTime();
    const dateB = new Date(b.startDate).getTime();
    return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
  });
  
  const handleDeleteOperation = (id: string) => {
    if (window.confirm(language === 'pt'
      ? 'Tem certeza que deseja excluir esta operação?'
      : 'Are you sure you want to delete this operation?'
    )) {
      deleteOperation(id);
    }
  };
  
  const handleClearFilters = () => {
    setSearchTerm('');
    setFilterType('');
    setFilterArea('');
  };

  const handleAddOperation = () => {
    if (!activeSeason) {
      alert(language === 'pt'
        ? 'Selecione uma safra ativa antes de adicionar uma operação'
        : 'Select an active season before adding an operation');
      return;
    }
    navigate('/operations/new');
  };

  const getOperationTypeLabel = (type: string) => {
    if (language === 'pt') {
      const labels: Record<string, string> = {
        gradagem: 'Gradagem',
        subsolagem: 'Subsolagem',
        plantio: 'Plantio',
        colheita: 'Colheita',
        dessecacao: 'Dessecação',
        herbicida: 'Herbicida',
        fungicida: 'Fungicida'
      };
      return labels[type] || type;
    }
    
    const labels: Record<string, string> = {
      gradagem: 'Harrowing',
      subsolagem: 'Subsoiling',
      plantio: 'Planting',
      colheita: 'Harvesting',
      dessecacao: 'Desiccation',
      herbicida: 'Herbicide',
      fungicida: 'Fungicide'
    };
    return labels[type] || type;
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6 pt-4 lg:pt-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {language === 'pt' ? 'Operações' : 'Operations'}
          </h1>
          <p className="text-gray-600">
            {language === 'pt'
              ? 'Gerencie e acompanhe todas as atividades agrícolas'
              : 'Manage and track all farming activities'}
          </p>
        </div>
        <Button 
          leftIcon={<Plus size={18} />}
          onClick={handleAddOperation}
        >
          {language === 'pt' ? 'Nova Operação' : 'New Operation'}
        </Button>
      </div>
      
      {!activeSeason ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {language === 'pt' ? 'Nenhuma safra selecionada' : 'No season selected'}
          </h3>
          <p className="text-gray-600 mb-4">
            {language === 'pt'
              ? 'Selecione uma safra no menu lateral para visualizar as operações'
              : 'Select a season from the sidebar to view operations'}
          </p>
        </div>
      ) : (
        <>
          <div className="bg-white p-4 rounded-lg shadow-sm mb-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <div className="relative md:col-span-2">
                <input
                  type="text"
                  placeholder={language === 'pt'
                    ? 'Buscar operações...'
                    : 'Search operations...'}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <div className="absolute left-3 top-2.5 text-gray-400">
                  <Filter size={18} />
                </div>
              </div>
              
              <Select
                label=""
                name="type"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                options={[
                  { 
                    value: '', 
                    label: language === 'pt' ? 'Todos os Tipos' : 'All Operation Types'
                  },
                  ...operationTypes.map(type => ({
                    value: type,
                    label: getOperationTypeLabel(type)
                  }))
                ]}
              />
              
              <Select
                label=""
                name="area"
                value={filterArea}
                onChange={(e) => setFilterArea(e.target.value)}
                options={[
                  { 
                    value: '', 
                    label: language === 'pt' ? 'Todas as Áreas' : 'All Areas'
                  },
                  ...areas.map((area) => ({
                    value: area.id,
                    label: area.name,
                  }))
                ]}
              />
            </div>
            
            <div className="flex justify-between items-center">
              <div className="flex items-center">
                <span className="text-sm text-gray-600 mr-2">
                  {language === 'pt' ? 'Ordenar:' : 'Sort:'}
                </span>
                <button
                  className="flex items-center text-sm font-medium text-gray-700 hover:text-green-600"
                  onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
                >
                  {language === 'pt' ? 'Data ' : 'Date '}
                  {sortOrder === 'desc' 
                    ? (language === 'pt' ? 'Mais Recentes' : 'Newest First')
                    : (language === 'pt' ? 'Mais Antigas' : 'Oldest First')}
                  <ChevronDown 
                    size={16} 
                    className={`ml-1 transform transition-transform ${
                      sortOrder === 'asc' ? 'rotate-180' : ''
                    }`} 
                  />
                </button>
              </div>
              
              {(searchTerm || filterType || filterArea) && (
                <button
                  className="text-sm text-gray-600 hover:text-gray-900"
                  onClick={handleClearFilters}
                >
                  {language === 'pt' ? 'Limpar filtros' : 'Clear filters'}
                </button>
              )}
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {sortedOperations.length > 0 ? (
              sortedOperations.map((operation) => (
                <OperationCard
                  key={operation.id}
                  operation={operation}
                  showAreaName={true}
                  onDelete={handleDeleteOperation}
                />
              ))
            ) : (
              <div className="col-span-2 text-center py-12 bg-gray-50 rounded-lg">
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {language === 'pt' ? 'Nenhuma operação encontrada' : 'No operations found'}
                </h3>
                <p className="text-gray-600 mb-4">
                  {searchTerm || filterType || filterArea
                    ? language === 'pt'
                      ? 'Nenhum resultado encontrado para os filtros atuais'
                      : 'No results match your current filters'
                    : language === 'pt'
                    ? 'Você ainda não registrou nenhuma operação'
                    : "You haven't recorded any operations yet"}
                </p>
                {searchTerm || filterType || filterArea ? (
                  <Button onClick={handleClearFilters}>
                    {language === 'pt' ? 'Limpar Filtros' : 'Clear Filters'}
                  </Button>
                ) : (
                  <Button 
                    leftIcon={<Plus size={18} />}
                    onClick={handleAddOperation}
                  >
                    {language === 'pt'
                      ? 'Registrar Primeira Operação'
                      : 'Record First Operation'}
                  </Button>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default OperationsList;