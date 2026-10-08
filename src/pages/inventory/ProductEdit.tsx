import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';
import ProductForm from '../../components/products/ProductForm';
import { Product } from '../../types';
import { ArrowLeft } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { supabase } from '../../lib/supabase';

const ProductEdit = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getProductById, updateProduct } = useAppContext();
  const { language } = useLanguage();

  const initialProduct = id ? getProductById(id) : undefined;
  const [currentProduct, setCurrentProduct] = useState<Product | null>(initialProduct ?? null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (!id) {
    navigate('/inventory');
    return null;
  }

  if (!currentProduct) {
    navigate('/inventory');
    return null;
  }

  const refreshProduct = async (): Promise<boolean> => {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) return false;

    const fresh: Product = {
      ...data,
      quantityInStock: Number(data.quantity_in_stock),
      minStockLevel: Number(data.min_stock_level),
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };

    setCurrentProduct(fresh);
    setRefreshKey(prev => prev + 1);
    return true;
  };

  const handleSubmit = async (productData: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await updateProduct(id, productData, currentProduct.updatedAt);
      navigate('/inventory');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('PRODUCT_STALE')) {
        const refreshed = await refreshProduct();
        if (refreshed) {
          setSubmitError(
            language === 'pt'
              ? 'Este produto foi alterado por outro usuário enquanto você estava editando. Os dados atuais foram recarregados. Confira as alterações antes de salvar novamente.'
              : 'This product was changed by another user while you were editing. The current data has been refreshed. Review the changes before saving again.'
          );
        } else {
          setSubmitError(
            language === 'pt'
              ? 'Este produto foi alterado por outro usuário, mas não foi possível recarregar os dados atuais. Por favor, recarregue a página manualmente.'
              : 'This product was changed by another user, but the current data could not be loaded. Please reload the page manually.'
          );
        }
      } else {
        setSubmitError(msg);
      }
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
          {language === 'pt' ? 'Editar Produto' : 'Edit Product'}
        </h1>
        <p className="text-gray-600">
          {language === 'pt' ? `Atualizar detalhes de ${currentProduct.name}` : `Update details for ${currentProduct.name}`}
        </p>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-sm">
        {submitError && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {submitError}
          </div>
        )}
        <ProductForm
          key={refreshKey}
          initialData={currentProduct}
          onSubmit={handleSubmit}
          isEditing={true}
          isSubmitting={isSubmitting}
        />
      </div>
    </div>
  );
};

export default ProductEdit;
