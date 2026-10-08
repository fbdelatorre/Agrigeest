import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';
import ProductForm, { PendingLot } from '../../components/products/ProductForm';
import { Product } from '../../types';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { inputValueToDate } from '../../utils/dateHelpers';

const ProductCreate = () => {
  const navigate = useNavigate();
  const { addProduct } = useAppContext();
  const { language } = useLanguage();
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (
    productData: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>,
    pendingLots?: PendingLot[],
    untrackedQuantity?: number
  ) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const formattedLots = pendingLots?.map(l => ({
        lotNumber: l.lotNumber,
        quantity: Number(l.quantity),
        expirationDate: l.expirationDate ? inputValueToDate(l.expirationDate) : undefined,
      }));
      await addProduct(productData, formattedLots, untrackedQuantity);
      navigate('/inventory');
    } catch (error) {
      const rawMsg = error instanceof Error ? error.message : String(error);
      const msg = rawMsg.includes('LOT_NUMBER_ALREADY_EXISTS')
        ? (language === 'pt'
            ? 'Já existe um lote com esse número para este produto.'
            : 'A lot with this number already exists for this product.')
        : rawMsg;
      setSubmitError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <div className="mb-6 pt-4 lg:pt-0">
        <Link 
          to="/inventory" 
          className="text-brand-700 hover:text-brand-800 font-medium text-sm flex items-center"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          {language === 'pt' ? 'Voltar para Estoque' : 'Back to Inventory'}
        </Link>
      </div>
      
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {language === 'pt' ? 'Adicionar Novo Produto' : 'Add New Product'}
        </h1>
        <p className="text-gray-600">
          {language === 'pt' ? 'Adicione um novo produto ao seu estoque' : 'Add a new product to your inventory'}
        </p>
      </div>
      
      <div className="bg-white p-6 rounded-lg shadow-sm">
        {submitError && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {submitError}
          </div>
        )}
        <ProductForm onSubmit={handleSubmit} isSubmitting={isSubmitting} />
      </div>
    </div>
  );
};

export default ProductCreate;