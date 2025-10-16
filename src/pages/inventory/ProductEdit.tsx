import React from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';
import ProductForm from '../../components/products/ProductForm';
import { Product } from '../../types';
import { ArrowLeft } from 'lucide-react';

const ProductEdit = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getProductById, updateProduct } = useAppContext();
  
  if (!id) {
    navigate('/inventory');
    return null;
  }
  
  const product = getProductById(id);
  
  if (!product) {
    navigate('/inventory');
    return null;
  }
  
  const handleSubmit = (productData: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) => {
    updateProduct(id, productData);
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
          Back to Inventory
        </Link>
      </div>
      
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Edit Product</h1>
        <p className="text-gray-600">Update details for {product.name}</p>
      </div>
      
      <div className="bg-white p-6 rounded-lg shadow-sm">
        <ProductForm
          initialData={product}
          onSubmit={handleSubmit}
          isEditing={true}
        />
      </div>
    </div>
  );
};

export default ProductEdit;