import React from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';
import OperationForm from '../../components/operations/OperationForm';
import { Operation } from '../../types';
import { ArrowLeft } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

const OperationCreate = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const copyId = searchParams.get('copy');
  const { addOperation, activeSeason, areas, operations } = useAppContext();
  const { language } = useLanguage();

  const operationToCopy = copyId ? operations.find(op => op.id === copyId) : undefined;
  
  const handleSubmit = async (operationData: Omit<Operation, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      await addOperation(operationData);
      navigate('/operations');
    } catch (error: any) {
      console.error('Error creating operation:', error);

      // Check if it's a stock error
      if (error.message?.includes('Insufficient product quantity')) {
        alert(language === 'pt'
          ? 'Estoque insuficiente! Verifique a quantidade disponível dos produtos e tente novamente.'
          : 'Insufficient stock! Check the available quantity of products and try again.');
      } else {
        alert(language === 'pt'
          ? 'Erro ao criar operação. Tente novamente.'
          : 'Error creating operation. Please try again.');
      }
    }
  };

  // If no areas exist, show message to create an area first
  if (areas.length === 0) {
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
            {language === 'pt' ? 'Nenhuma área cadastrada' : 'No areas registered'}
          </h3>
          <p className="text-gray-600 mb-4">
            {language === 'pt'
              ? 'Você precisa cadastrar uma área antes de registrar operações'
              : 'You need to register an area before recording operations'}
          </p>
          <Link 
            to="/areas/new"
            className="inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-700 hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
          >
            {language === 'pt' ? 'Cadastrar Área' : 'Register Area'}
          </Link>
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
          {operationToCopy
            ? (language === 'pt' ? 'Copiar Operação' : 'Copy Operation')
            : (language === 'pt' ? 'Nova Operação' : 'New Operation')}
        </h1>
        <p className="text-gray-600">
          {operationToCopy
            ? (language === 'pt'
                ? 'Revise e ajuste os dados da operação copiada'
                : 'Review and adjust the copied operation data')
            : (language === 'pt'
                ? 'Registre uma nova atividade agrícola'
                : 'Record a new farming activity')}
        </p>
      </div>

      {!activeSeason ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {language === 'pt' ? 'Nenhuma safra ativa' : 'No active season'}
          </h3>
          <p className="text-gray-600 mb-4">
            {language === 'pt'
              ? 'Selecione uma safra no menu lateral para registrar operações'
              : 'Select a season from the sidebar to record operations'}
          </p>
        </div>
      ) : (
        <div className="bg-white p-6 rounded-lg shadow-sm">
          <OperationForm
            onSubmit={handleSubmit}
            initialData={operationToCopy}
          />
        </div>
      )}
    </div>
  );
};

export default OperationCreate;