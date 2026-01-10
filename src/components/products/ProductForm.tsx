import React, { useState, useEffect } from 'react';
import { Product, ProductCategory } from '../../types';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Button from '../ui/Button';
import { Save, X, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useAppContext } from '../../context/AppContext';

interface ProductFormProps {
  initialData?: Partial<Product>;
  onSubmit: (data: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) => void;
  isEditing?: boolean;
}

const ProductForm: React.FC<ProductFormProps> = ({
  initialData = {},
  onSubmit,
  isEditing = false,
}) => {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const { products } = useAppContext();

  const [formData, setFormData] = useState({
    name: initialData.name || '',
    category: initialData.category || '',
    unit: initialData.unit || '',
    quantityInStock: initialData.quantityInStock?.toString() || '0',
    minStockLevel: initialData.minStockLevel?.toString() || '0',
    price: initialData.price?.toString() || '',
    supplier: initialData.supplier || '',
    description: initialData.description || '',
  });

  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategory, setNewCategory] = useState('');

  // Get unique categories from existing products
  const existingCategories = React.useMemo(() => {
    const categories = products
      .map(product => product.category)
      .filter(category => category && category.trim() !== '');
    return [...new Set(categories)].sort();
  }, [products]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    
    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const handleAddNewCategory = () => {
    if (newCategory.trim()) {
      // Update form data with new category
      setFormData(prev => ({ ...prev, category: newCategory.trim() }));

      // Reset input and hide form
      setNewCategory('');
      setShowNewCategoryInput(false);
    }
  };

  const validate = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.name.trim()) {
      newErrors.name = language === 'pt' ? 'Nome é obrigatório' : 'Name is required';
    }

    if (!formData.category.trim()) {
      newErrors.category = language === 'pt' ? 'Categoria é obrigatória' : 'Category is required';
    }

    if (!formData.unit.trim()) {
      newErrors.unit = language === 'pt' ? 'Unidade é obrigatória' : 'Unit is required';
    }
    
    if (!formData.quantityInStock.trim()) {
      newErrors.quantityInStock = language === 'pt' ? 'Quantidade é obrigatória' : 'Quantity is required';
    } else if (isNaN(Number(formData.quantityInStock)) || Number(formData.quantityInStock) < 0) {
      newErrors.quantityInStock = language === 'pt' ? 'Quantidade deve ser um número não negativo' : 'Quantity must be a non-negative number';
    }
    
    if (!formData.minStockLevel.trim()) {
      newErrors.minStockLevel = language === 'pt' ? 'Nível mínimo de estoque é obrigatório' : 'Minimum stock level is required';
    } else if (isNaN(Number(formData.minStockLevel)) || Number(formData.minStockLevel) < 0) {
      newErrors.minStockLevel = language === 'pt' ? 'Nível mínimo deve ser um número não negativo' : 'Minimum stock level must be a non-negative number';
    }
    
    if (!formData.price.trim()) {
      newErrors.price = language === 'pt' ? 'Preço é obrigatório' : 'Price is required';
    } else if (isNaN(Number(formData.price)) || Number(formData.price) <= 0) {
      newErrors.price = language === 'pt' ? 'Preço deve ser um número positivo' : 'Price must be a positive number';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) return;
    
    onSubmit({
      ...formData,
      quantityInStock: Number(formData.quantityInStock),
      minStockLevel: Number(formData.minStockLevel),
      price: Number(formData.price),
    });
  };

  // Use existing categories from products in database
  const categoryOptions = existingCategories.map(category => ({
    value: category,
    label: category
  }));

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Input
          name="name"
          label={language === 'pt' ? 'Nome do Produto' : 'Product Name'}
          value={formData.name}
          onChange={handleChange}
          placeholder={language === 'pt' ? 'ex: Sementes de Milho Premium' : 'e.g., Premium Corn Seeds'}
          error={errors.name}
          required
        />
        
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-700">
              {language === 'pt' ? 'Categoria' : 'Category'}
            </label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowNewCategoryInput(true)}
              leftIcon={<Plus size={16} />}
              className="text-green-700 hover:text-green-800"
            >
              {language === 'pt' ? 'Nova Categoria' : 'New Category'}
            </Button>
          </div>
          
          {showNewCategoryInput ? (
            <div className="flex gap-2">
              <Input
                name="newCategory"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder={language === 'pt' ? 'Digite nova categoria' : 'Enter new category'}
                className="flex-1"
              />
              <Button
                type="button"
                onClick={handleAddNewCategory}
                size="sm"
              >
                {language === 'pt' ? 'Adicionar' : 'Add'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowNewCategoryInput(false);
                  setNewCategory('');
                }}
              >
                {language === 'pt' ? 'Cancelar' : 'Cancel'}
              </Button>
            </div>
          ) : (
            <Select
              name="category"
              value={formData.category}
              onChange={handleChange}
              options={[
                {
                  value: '',
                  label: language === 'pt' ? 'Selecione uma categoria' : 'Select a category'
                },
                ...categoryOptions
              ]}
              error={errors.category}
              required
            />
          )}
        </div>
        
        <Input
          name="unit"
          label={language === 'pt' ? 'Unidade de Medida' : 'Unit of Measurement'}
          value={formData.unit}
          onChange={handleChange}
          placeholder={language === 'pt' ? 'ex: kg, L, saco' : 'e.g., kg, L, bag'}
          error={errors.unit}
          required
        />
        
        <Input
          name="price"
          label={language === 'pt' ? 'Preço por Unidade' : 'Price per Unit'}
          type="number"
          min="0.01"
          step="0.01"
          value={formData.price}
          onChange={handleChange}
          placeholder={language === 'pt' ? 'ex: 25,99' : 'e.g., 25.99'}
          error={errors.price}
          required
        />
        
        <Input
          name="quantityInStock"
          label={language === 'pt' ? 'Quantidade em Estoque' : 'Quantity in Stock'}
          type="number"
          min="0"
          value={formData.quantityInStock}
          onChange={handleChange}
          error={errors.quantityInStock}
          required
        />
        
        <Input
          name="minStockLevel"
          label={language === 'pt' ? 'Nível Mínimo de Estoque' : 'Minimum Stock Level'}
          type="number"
          min="0"
          value={formData.minStockLevel}
          onChange={handleChange}
          error={errors.minStockLevel}
          required
        />
        
        <Input
          name="supplier"
          label={language === 'pt' ? 'Fornecedor (opcional)' : 'Supplier (optional)'}
          value={formData.supplier}
          onChange={handleChange}
          placeholder={language === 'pt' ? 'ex: AgriSeed Ltda.' : 'e.g., AgriSeed Inc.'}
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {language === 'pt' ? 'Descrição (opcional)' : 'Description (optional)'}
        </label>
        <textarea
          name="description"
          value={formData.description}
          onChange={handleChange}
          rows={3}
          className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
          placeholder={language === 'pt' ? 'Digite detalhes adicionais sobre este produto...' : 'Enter any additional details about this product...'}
        />
      </div>
      
      <div className="flex justify-end space-x-4">
        <Button
          type="button"
          variant="outline"
          leftIcon={<X size={18} />}
          onClick={() => navigate('/inventory')}
        >
          {language === 'pt' ? 'Cancelar' : 'Cancel'}
        </Button>
        <Button
          type="submit"
          leftIcon={<Save size={18} />}
        >
          {isEditing 
            ? (language === 'pt' ? 'Atualizar Produto' : 'Update Product')
            : (language === 'pt' ? 'Criar Produto' : 'Create Product')}
        </Button>
      </div>
    </form>
  );
};

export default ProductForm;