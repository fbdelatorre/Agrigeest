import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useMachineryContext } from '../../context/MachineryContext';
import MachineryForm from '../../components/machinery/MachineryForm';
import { Machinery } from '../../types/machinery';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';

const MachineryCreate = () => {
  const navigate = useNavigate();
  const { addMachinery } = useMachineryContext();
  const { language } = useLanguage();
  
  const handleSubmit = async (machineryData: Omit<Machinery, 'id' | 'createdAt' | 'updatedAt' | 'userId' | 'institutionId'>) => {
    try {
      await addMachinery(machineryData);
      navigate('/machinery');
    } catch (error) {
      console.error('Error creating machinery:', error);
      alert(language === 'pt' 
        ? 'Erro ao criar máquina. Tente novamente.'
        : 'Error creating machinery. Please try again.');
    }
  };

  return (
    <div>
      <div className="mb-6 pt-4 lg:pt-0">
        <Link 
          to="/machinery" 
          className="text-green-700 hover:text-green-800 font-medium text-sm flex items-center"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          {language === 'pt' ? 'Voltar para Máquinas' : 'Back to Machinery'}
        </Link>
      </div>
      
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {language === 'pt' ? 'Adicionar Nova Máquina' : 'Add New Machinery'}
        </h1>
        <p className="text-gray-600">
          {language === 'pt' ? 'Cadastre uma nova máquina agrícola' : 'Register a new agricultural machinery'}
        </p>
      </div>
      
      <div className="bg-white p-6 rounded-lg shadow-sm">
        <MachineryForm onSubmit={handleSubmit} />
      </div>
    </div>
  );
};

export default MachineryCreate;