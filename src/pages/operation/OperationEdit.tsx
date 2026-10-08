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
  
  const handleSubmit = async (operationData: Omit<Operation, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      await updateOperation(id, operationData);
      navigate('/operations');
    } catch (error: any) {
      console.error('Error updating operation:', error);

      const msg = error?.message || '';
      const isPt = language === 'pt';

      const errorMessages: Record<string, { pt: string; en: string }> = {
        AUTH_REQUIRED: { pt: 'Você precisa estar autenticado.', en: 'You must be authenticated.' },
        PROFILE_NOT_FOUND: { pt: 'Perfil de usuário não encontrado.', en: 'User profile not found.' },
        PROFILE_NO_INSTITUTION: { pt: 'Você não pertence a uma instituição.', en: 'You do not belong to an institution.' },
        OPERATION_NOT_FOUND_OR_FORBIDDEN: { pt: 'Operação não encontrada ou acesso negado.', en: 'Operation not found or access denied.' },
        AREA_NOT_FOUND_OR_FORBIDDEN: { pt: 'Área não encontrada ou acesso negado.', en: 'Area not found or access denied.' },
        SEASON_NOT_FOUND_OR_FORBIDDEN: { pt: 'Safra não encontrada ou acesso negado.', en: 'Season not found or access denied.' },
        PRODUCT_NOT_FOUND_OR_FORBIDDEN: { pt: 'Produto não encontrado ou acesso negado.', en: 'Product not found or access denied.' },
        LOT_NOT_FOUND_OR_MISMATCH: { pt: 'Lote não encontrado ou não corresponde ao produto.', en: 'Lot not found or does not match the product.' },
        INSUFFICIENT_PRODUCT_STOCK: { pt: 'Estoque insuficiente! Verifique a quantidade disponível dos produtos e tente novamente.', en: 'Insufficient stock! Check the available quantity of products and try again.' },
        INSUFFICIENT_UNTRACKED_STOCK: { pt: 'Estoque sem lote insuficiente. Selecione um lote com saldo disponível ou ajuste a quantidade.', en: 'Insufficient untracked stock. Select a lot with available balance or adjust the quantity.' },
        INSUFFICIENT_LOT_STOCK: { pt: 'Estoque insuficiente no lote! Verifique a quantidade disponível.', en: 'Insufficient lot stock! Check the available quantity.' },
        INVALID_PRODUCTS_USED: { pt: 'Dados de produtos inválidos. Verifique as informações e tente novamente.', en: 'Invalid product data. Check the information and try again.' },
        HISTORICAL_PRODUCT_UNAVAILABLE: { pt: 'Não é possível alterar a quantidade de um produto que já foi excluído do cadastro.', en: 'Cannot change the quantity of a product that has been removed from the catalog.' },
        HISTORICAL_LOT_UNAVAILABLE: { pt: 'Não é possível alterar a quantidade de um lote que já foi excluído.', en: 'Cannot change the quantity of a lot that has been removed.' },
        LOT_ALLOCATIONS_TOTAL_MISMATCH: { pt: 'A soma das origens não corresponde à quantidade total do produto.', en: 'The sum of lot sources does not match the product total quantity.' },
        DUPLICATE_LOT_ALLOCATION: { pt: 'Um lote foi selecionado mais de uma vez para o mesmo produto.', en: 'A lot was selected more than once for the same product.' },
      };

      const matched = Object.keys(errorMessages).find(key => msg.includes(key));
      if (matched) {
        alert(isPt ? errorMessages[matched].pt : errorMessages[matched].en);
      } else {
        alert(isPt
          ? 'Erro ao atualizar operação. Tente novamente.'
          : 'Error updating operation. Please try again.');
      }
    }
  };

  if (!activeSeason) {
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
          className="text-brand-700 hover:text-brand-800 font-medium text-sm flex items-center"
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