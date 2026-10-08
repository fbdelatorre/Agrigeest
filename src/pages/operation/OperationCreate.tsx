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
  const areaIdParam = searchParams.get('areaId');
  const { addOperation, activeSeason, areas, operations } = useAppContext();
  const { language } = useLanguage();

  const operationToCopy = copyId ? operations.find(op => op.id === copyId) : undefined;
  const initialArea = areaIdParam ? areas.find(a => a.id === areaIdParam) : undefined;
  
  const handleSubmit = async (operationData: Omit<Operation, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      await addOperation(operationData);
      navigate('/operations');
    } catch (error: any) {
      console.error('Error creating operation:', error);

      const msg = error.message || '';
      const isPt = language === 'pt';

      if (msg.includes('INSUFFICIENT_UNTRACKED_STOCK')) {
        alert(isPt
          ? 'Estoque sem lote insuficiente. Selecione um lote com saldo disponível ou ajuste a quantidade.'
          : 'Insufficient untracked stock. Select a lot with available balance or adjust the quantity.');
      } else if (msg.includes('INSUFFICIENT_PRODUCT_STOCK') || msg.includes('INSUFFICIENT_LOT_STOCK')) {
        alert(isPt
          ? 'Estoque insuficiente! Verifique a quantidade disponível dos produtos e tente novamente.'
          : 'Insufficient stock! Check the available quantity of products and try again.');
      } else if (msg.includes('AUTH_REQUIRED') || msg.includes('PROFILE_NOT_FOUND') || msg.includes('PROFILE_NO_INSTITUTION')) {
        alert(isPt
          ? 'Erro de autenticação. Faça login novamente.'
          : 'Authentication error. Please log in again.');
      } else if (msg.includes('AREA_NOT_FOUND_OR_FORBIDDEN')) {
        alert(isPt
          ? 'Área não encontrada ou não pertence à sua instituição.'
          : 'Area not found or does not belong to your institution.');
      } else if (msg.includes('SEASON_NOT_FOUND_OR_FORBIDDEN')) {
        alert(isPt
          ? 'Safra não encontrada ou não pertence à sua instituição.'
          : 'Season not found or does not belong to your institution.');
      } else if (msg.includes('PRODUCT_NOT_FOUND_OR_FORBIDDEN')) {
        alert(isPt
          ? 'Um dos produtos não foi encontrado ou não pertence à sua instituição.'
          : 'One of the products was not found or does not belong to your institution.');
      } else if (msg.includes('LOT_NOT_FOUND_OR_MISMATCH')) {
        alert(isPt
          ? 'Lote não encontrado ou não corresponde ao produto informado.'
          : 'Lot not found or does not match the specified product.');
      } else if (msg.includes('LOT_ALLOCATIONS_TOTAL_MISMATCH')) {
        alert(isPt
          ? 'A soma das origens não corresponde à quantidade total do produto.'
          : 'The sum of lot sources does not match the product total quantity.');
      } else if (msg.includes('DUPLICATE_LOT_ALLOCATION')) {
        alert(isPt
          ? 'Um lote foi selecionado mais de uma vez para o mesmo produto.'
          : 'A lot was selected more than once for the same product.');
      } else if (msg.includes('INVALID_PRODUCTS_USED')) {
        alert(isPt
          ? 'Dados de produtos inválidos. Verifique as quantidades e tente novamente.'
          : 'Invalid product data. Check quantities and try again.');
      } else {
        alert(isPt
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
            className="text-brand-700 hover:text-brand-800 font-medium text-sm flex items-center"
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
            className="inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-brand-700 hover:bg-brand-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500"
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
          className="text-brand-700 hover:text-brand-800 font-medium text-sm flex items-center"
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
            initialData={initialArea ? { areaId: initialArea.id, operationSize: initialArea.size } as Partial<Operation> : operationToCopy}
          />
        </div>
      )}
    </div>
  );
};

export default OperationCreate;