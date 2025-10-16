import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';
import ProductForm from '../../components/products/ProductForm';
import { Product } from '../../types';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';

const ProductCreate = () => {
  const navigate = useNavigate();
  const { addProduct } = useAppContext();
  const { language } = useLanguage();
  
  const handleSubmit = (productData: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) => {
    addProduct(productData);
    navigate('/inventory');
  };

  return (
    <div>
      <div className="mb-6 pt-4 lg:pt-0">
        <Link 
          to="/inventory" 
          className="text-green-700 hover:text-green-800 font-medium text-sm flex items-center"
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
        <ProductForm onSubmit={handleSubmit} />
      </div>
    </div>
  );
};

export default ProductCreate;