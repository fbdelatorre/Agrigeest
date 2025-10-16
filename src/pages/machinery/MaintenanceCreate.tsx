import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useMachineryContext } from '../../context/MachineryContext';
import MaintenanceForm from '../../components/machinery/MaintenanceForm';
import { Maintenance } from '../../types/machinery';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';

const MaintenanceCreate = () => {
  const navigate = useNavigate();
  const { addMaintenance, machinery } = useMachineryContext();
  const { language } = useLanguage();
  
  const handleSubmit = async (maintenanceData: Omit<Maintenance, 'id' | 'createdAt' | 'updatedAt' | 'userId' | 'institutionId'>) => {
    try {
      await addMaintenance(maintenanceData);
      navigate('/maintenances');
    } catch (error) {
      console.error('Error creating maintenance:', error);
      alert(language === 'pt' 
        ? 'Erro ao criar manutenção. Tente novamente.'
        : 'Error creating maintenance. Please try again.');
    }
  };

  // Se não há máquinas cadastradas, mostrar mensagem
  if (machinery.length === 0) {
    return (
      <div>
        <div className="mb-6 pt-4 lg:pt-0">
          <Link 
            to="/maintenances"
            className="text-green-700 hover:text-green-800 font-medium text-sm flex items-center"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            {language === 'pt' ? 'Voltar para Manutenções' : 'Back to Maintenances'}
          </Link>
        </div>
        
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {language === 'pt' ? 'Nenhuma máquina cadastrada' : 'No machinery registered'}
          </h3>
          <p className="text-gray-600 mb-4">
            {language === 'pt'
              ? 'Você precisa cadastrar uma máquina antes de registrar manutenções'
              : 'You need to register machinery before recording maintenances'}
          </p>
          <Link 
            to="/machinery/new"
            className="inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-700 hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
          >
            {language === 'pt' ? 'Cadastrar Máquina' : 'Register Machinery'}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 pt-4 lg:pt-0">
        <Link 
          to="/maintenances"
          className="text-green-700 hover:text-green-800 font-medium text-sm flex items-center"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          {language === 'pt' ? 'Voltar para Manutenções' : 'Back to Maintenances'}
        </Link>
      </div>
      
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {language === 'pt' ? 'Nova Manutenção' : 'New Maintenance'}
        </h1>
        <p className="text-gray-600">
          {language === 'pt' 
            ? 'Registre uma nova manutenção de máquina'
            : 'Record a new machinery maintenance'}
        </p>
      </div>
      
      <div className="bg-white p-6 rounded-lg shadow-sm">
        <MaintenanceForm onSubmit={handleSubmit} />
      </div>
    </div>
  );
};

export default MaintenanceCreate;