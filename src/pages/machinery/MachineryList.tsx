import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMachineryContext } from '../../context/MachineryContext';
import { useLanguage } from '../../context/LanguageContext';
import MachineryCard from '../../components/machinery/MachineryCard';
import Button from '../../components/ui/Button';
import { Plus, Filter, Wrench } from 'lucide-react';

const MachineryList = () => {
  const { machinery, deleteMachinery } = useMachineryContext();
  const { language } = useLanguage();
  const [searchTerm, setSearchTerm] = useState('');
  
  // Filtrar máquinas baseado no termo de busca
  const filteredMachinery = machinery.filter((machine) =>
    machine.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (machine.model && machine.model.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (machine.description && machine.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );
  
  const handleDeleteMachinery = (id: string) => {
    if (window.confirm(language === 'pt' 
      ? 'Tem certeza que deseja excluir esta máquina? Todas as manutenções associadas também serão excluídas.'
      : 'Are you sure you want to delete this machinery? All associated maintenances will also be deleted.'
    )) {
      deleteMachinery(id);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6 pt-4 lg:pt-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <Wrench className="w-7 h-7 mr-3 text-green-700" />
            {language === 'pt' ? 'Máquinas Agrícolas' : 'Agricultural Machinery'}
          </h1>
          <p className="text-gray-600">
            {language === 'pt' 
              ? 'Gerencie suas máquinas e equipamentos agrícolas'
              : 'Manage your agricultural machines and equipment'}
          </p>
        </div>
        <Link to="/machinery/new">
          <Button leftIcon={<Plus size={18} />}>
            {language === 'pt' ? 'Nova Máquina' : 'Add New Machinery'}
          </Button>
        </Link>
      </div>
      
      <div className="mb-6">
        <div className="relative">
          <input
            type="text"
            placeholder={language === 'pt'
              ? 'Buscar máquinas por nome, modelo ou descrição...'
              : 'Search machinery by name, model, or description...'}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <div className="absolute left-3 top-2.5 text-gray-400">
            <Filter size={18} />
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredMachinery.length > 0 ? (
          filteredMachinery.map((machine) => (
            <MachineryCard
              key={machine.id}
              machinery={machine}
              onDelete={handleDeleteMachinery}
            />
          ))
        ) : (
          <div className="col-span-3 text-center py-12 bg-gray-50 rounded-lg">
            <Wrench size={48} className="mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {language === 'pt' ? 'Nenhuma máquina encontrada' : 'No machinery found'}
            </h3>
            <p className="text-gray-600 mb-4">
              {searchTerm
                ? language === 'pt'
                  ? `Nenhum resultado encontrado para "${searchTerm}"`
                  : `No results matching "${searchTerm}"`
                : language === 'pt'
                ? "Você ainda não adicionou nenhuma máquina"
                : "You haven't added any machinery yet"}
            </p>
            <Link to="/machinery/new">
              <Button leftIcon={<Plus size={18} />}>
                {language === 'pt' 
                  ? 'Adicionar Primeira Máquina'
                  : 'Add Your First Machinery'}
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default MachineryList;