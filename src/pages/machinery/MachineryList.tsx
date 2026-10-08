import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMachineryContext } from '../../context/MachineryContext';
import { useLanguage } from '../../context/LanguageContext';
import MachineryCard from '../../components/machinery/MachineryCard';
import Button from '../../components/ui/Button';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { Plus, Filter, Wrench } from 'lucide-react';

const MachineryList = () => {
  const { machinery, deleteMachinery, maintenances } = useMachineryContext();
  const { language } = useLanguage();
  const { isOnline } = useNetworkStatus();
  const [searchTerm, setSearchTerm] = useState('');
  
  // Filtrar máquinas baseado no termo de busca
  const filteredMachinery = machinery.filter((machine) =>
    machine.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (machine.model && machine.model.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (machine.description && machine.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );
  
  const handleDeleteMachinery = async (id: string) => {
    const machineMaintenances = maintenances.filter(m => m.machineryId === id);
    if (machineMaintenances.length > 0) {
      alert(language === 'pt'
        ? `Esta máquina possui ${machineMaintenances.length} manutenção(ões) registrada(s) e não pode ser excluída porque faz parte do histórico de manutenção.`
        : `This machine has ${machineMaintenances.length} maintenance(s) registered and cannot be deleted because it is part of the maintenance history.`
      );
      return;
    }
    if (window.confirm(language === 'pt'
      ? 'Tem certeza que deseja excluir esta máquina?'
      : 'Are you sure you want to delete this machinery?'
    )) {
      try {
        await deleteMachinery(id);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes('23503') || msg.includes('restrict') || msg.includes('RESTRICT') || msg.includes('depende')) {
          alert(language === 'pt'
            ? 'Não é possível excluir esta máquina porque existem dados dependentes (manutenções vinculadas).'
            : 'Cannot delete this machine because there are dependent data (linked maintenances).'
          );
        } else {
          alert(language === 'pt' ? 'Erro ao excluir máquina.' : 'Error deleting machinery.');
        }
      }
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6 pt-4 lg:pt-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <Wrench className="w-7 h-7 mr-3 text-brand-700" />
            {language === 'pt' ? 'Máquinas Agrícolas' : 'Agricultural Machinery'}
          </h1>
          <p className="text-gray-600">
            {language === 'pt' 
              ? 'Gerencie suas máquinas e equipamentos agrícolas'
              : 'Manage your agricultural machines and equipment'}
          </p>
        </div>
        {isOnline && (
          <Link to="/machinery/new">
            <Button leftIcon={<Plus size={18} />}>
              {language === 'pt' ? 'Nova Máquina' : 'Add New Machinery'}
            </Button>
          </Link>
        )}
      </div>
      
      <div className="mb-6">
        <div className="relative">
          <input
            type="text"
            placeholder={language === 'pt'
              ? 'Buscar máquinas por nome, modelo ou descrição...'
              : 'Search machinery by name, model, or description...'}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
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
            {isOnline && (
              <Link to="/machinery/new">
                <Button leftIcon={<Plus size={18} />}>
                  {language === 'pt' 
                    ? 'Adicionar Primeira Máquina'
                    : 'Add Your First Machinery'}
                </Button>
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MachineryList;