import React from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';
import OperationForm from '../../components/operations/OperationForm';
import { Operation } from '../../types';
import { ArrowLeft } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

const OperationEdit = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { operations, updateOperation, activeSeason } = useAppContext();
  const { language } = useLanguage();
  
  if (!id) {
    navigate('/operations');
    return null;
  }
  
  const operation = operations.find((op) => op.id === id);
  
  if (!operation) {
    navigate('/operations');
    return null;
  }
  
  const handleSubmit = (operationData: Omit<Operation, 'id' | 'createdAt' | 'updatedAt'>) => {
    updateOperation(id, operationData);
    navigate('/operations');
  };

  if (!activeSeason) {
    return (
      <div>
        <div className="mb-6 pt-4 lg:pt-0">
          <Link 
            to="/operations" 
            className="text-green-700 hover:text-green-800 font-medium text-sm flex items-center"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            {language === 'pt' ? 'Voltar para Operações' : 'Back to Operations'}
          </Link>
        </div>
        
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {language === 'pt' ? 'Nenhuma safra ativa' : 'No active season'}
          </h3>
          <p className="text-gray-600 mb-4">
            {language === 'pt'
              ? 'Selecione uma safra no menu lateral para editar operações'
              : 'Select a season from the sidebar to edit operations'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 pt-4 lg:pt-0">
        <Link 
          to="/operations" 
          className="text-green-700 hover:text-green-800 font-medium text-sm flex items-center"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
        {language === 'pt' ? 'Voltar para Operações' : 'Back to Operations'}
        </Link>
      </div>
      
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {language === 'pt' ? 'Editar Operação' : 'Edit Operation'}
        </h1>
        <p className="text-gray-600">
          {language === 'pt'
            ? 'Atualize os detalhes desta operação'
            : 'Update details for this operation'}
        </p>
      </div>
      
      <div className="bg-white p-6 rounded-lg shadow-sm">
        <OperationForm
          initialData={operation}
          onSubmit={handleSubmit}
          isEditing={true}
        />
      </div>
    </div>
  );
};

export default OperationEdit;