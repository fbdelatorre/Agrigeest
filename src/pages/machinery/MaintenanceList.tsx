import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMachineryContext } from '../../context/MachineryContext';
import { useLanguage } from '../../context/LanguageContext';
import MaintenanceCard from '../../components/machinery/MaintenanceCard';
import Button from '../../components/ui/Button';
import Select from '../../components/ui/Select';
import { Plus, Filter, Settings, Calendar } from 'lucide-react';

const MaintenanceList = () => {
  const { maintenances, machinery, maintenanceTypes, deleteMaintenance } = useMachineryContext();
  const { language } = useLanguage();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMachinery, setFilterMachinery] = useState('');
  const [filterType, setFilterType] = useState('');
  const [sortOrder, setSortOrder] = useState('desc');
  
  // Filtrar manutenções
  const filteredMaintenances = maintenances.filter((maintenance) => {
    const machine = machinery.find(m => m.id === maintenance.machineryId);
    const type = maintenanceTypes.find(t => t.id === maintenance.maintenanceTypeId);

    const matchesSearch =
      (maintenance.description && maintenance.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (maintenance.materialUsed && maintenance.materialUsed.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (machine && machine.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (type && type.name.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesMachinery = filterMachinery ? maintenance.machineryId === filterMachinery : true;
    const matchesType = filterType ? maintenance.maintenanceTypeId === filterType : true;

    return matchesSearch && matchesMachinery && matchesType;
  });
  
  // Ordenar manutenções
  const sortedMaintenances = [...filteredMaintenances].sort((a, b) => {
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
  });
  
  const handleDeleteMaintenance = (id: string) => {
    if (window.confirm(language === 'pt'
      ? 'Tem certeza que deseja excluir esta manutenção?'
      : 'Are you sure you want to delete this maintenance?'
    )) {
      deleteMaintenance(id);
    }
  };
  
  const handleClearFilters = () => {
    setSearchTerm('');
    setFilterMachinery('');
    setFilterType('');
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(amount);
  };

  const totalCost = sortedMaintenances.reduce((sum, maintenance) => sum + maintenance.cost, 0);

  return (
    <div>
      <div className="flex justify-between items-center mb-6 pt-4 lg:pt-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <Settings className="w-7 h-7 mr-3 text-green-700" />
            {language === 'pt' ? 'Manutenções' : 'Maintenances'}
          </h1>
          <p className="text-gray-600">
            {language === 'pt' 
              ? 'Registre e acompanhe as manutenções das suas máquinas'
              : 'Record and track your machinery maintenances'}
          </p>
        </div>
        <div className="flex gap-3">
          <Link to="/machinery">
            <Button variant="secondary" leftIcon={<Settings size={18} />}>
              {language === 'pt' ? 'Gerenciar Máquinas' : 'Manage Machinery'}
            </Button>
          </Link>
          <Link to="/maintenances/new">
            <Button leftIcon={<Plus size={18} />}>
              {language === 'pt' ? 'Nova Manutenção' : 'New Maintenance'}
            </Button>
          </Link>
        </div>
      </div>

      {/* Resumo de custos */}
      {sortedMaintenances.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-green-800">
                {language === 'pt' ? 'Resumo de Custos' : 'Cost Summary'}
              </h3>
              <p className="text-green-700 text-sm">
                {language === 'pt'
                  ? `Total gasto em manutenções: ${formatCurrency(totalCost)}`
                  : `Total spent on maintenances: ${formatCurrency(totalCost)}`}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-green-800">{formatCurrency(totalCost)}</p>
              <p className="text-sm text-green-600">
                {sortedMaintenances.length} {language === 'pt' ? 'manutenções' : 'maintenances'}
              </p>
            </div>
          </div>
        </div>
      )}
      
      <div className="bg-white p-4 rounded-lg shadow-sm mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div className="relative md:col-span-2">
            <input
              type="text"
              placeholder={language === 'pt'
                ? 'Buscar manutenções...'
                : 'Search maintenances...'}
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
            name="machinery"
            value={filterMachinery}
            onChange={(e) => setFilterMachinery(e.target.value)}
            options={[
              { 
                value: '', 
                label: language === 'pt' ? 'Todas as Máquinas' : 'All Machinery'
              },
              ...machinery.map((machine) => ({
                value: machine.id,
                label: machine.name,
              }))
            ]}
          />
          
          <Select
            label=""
            name="type"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            options={[
              { 
                value: '', 
                label: language === 'pt' ? 'Todos os Tipos' : 'All Types'
              },
              ...maintenanceTypes.map((type) => ({
                value: type.id,
                label: type.name,
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
              <Calendar size={16} className="mr-1" />
              {language === 'pt' ? 'Data ' : 'Date '}
              {sortOrder === 'desc' 
                ? (language === 'pt' ? 'Mais Recentes' : 'Newest First')
                : (language === 'pt' ? 'Mais Antigas' : 'Oldest First')}
            </button>
          </div>
          
          {(searchTerm || filterMachinery || filterType) && (
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
        {sortedMaintenances.length > 0 ? (
          sortedMaintenances.map((maintenance) => (
            <MaintenanceCard
              key={maintenance.id}
              maintenance={maintenance}
              onDelete={handleDeleteMaintenance}
            />
          ))
        ) : (
          <div className="col-span-2 text-center py-12 bg-gray-50 rounded-lg">
            <Settings size={48} className="mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {language === 'pt' ? 'Nenhuma manutenção encontrada' : 'No maintenances found'}
            </h3>
            <p className="text-gray-600 mb-4">
              {searchTerm || filterMachinery || filterType
                ? language === 'pt'
                  ? 'Nenhum resultado encontrado para os filtros atuais'
                  : 'No results match your current filters'
                : language === 'pt'
                ? 'Você ainda não registrou nenhuma manutenção'
                : "You haven't recorded any maintenances yet"}
            </p>
            {searchTerm || filterMachinery || filterType ? (
              <Button onClick={handleClearFilters}>
                {language === 'pt' ? 'Limpar Filtros' : 'Clear Filters'}
              </Button>
            ) : (
              <Link to="/maintenances/new">
                <Button leftIcon={<Plus size={18} />}>
                  {language === 'pt'
                    ? 'Registrar Primeira Manutenção'
                    : 'Record First Maintenance'}
                </Button>
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MaintenanceList;