import React, { useState } from 'react';
import { Product } from '../../types';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import { Package, DollarSign, Pencil, Trash2, AlertTriangle, Plus, Minus } from 'lucide-react';
import { Link } from 'react-router-dom';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { useLanguage } from '../../context/LanguageContext';
import { useAppContext } from '../../context/AppContext';

interface ProductCardProps {
  product: Product;
  onDelete: (id: string) => void;
}

const ProductCard: React.FC<ProductCardProps> = ({ product, onDelete }) => {
  const { language } = useLanguage();
  const { updateProduct } = useAppContext();
  const [showAdjustStock, setShowAdjustStock] = useState(false);
  const [adjustmentQuantity, setAdjustmentQuantity] = useState('0');
  const [adjustmentType, setAdjustmentType] = useState<'add' | 'subtract'>('add');
  const [error, setError] = useState<string | null>(null);
  
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };
  
  const getLowStockBadge = () => {
    if (product.quantityInStock <= product.minStockLevel) {
      return (
        <Badge variant="danger" className="flex items-center gap-1">
          <AlertTriangle size={12} />
          {language === 'pt' ? 'Estoque Baixo' : 'Low Stock'}
        </Badge>
      );
    }
    return null;
  };
  
  const getCategoryBadge = () => {
    const categoryStyles: Record<string, 'primary' | 'secondary' | 'warning' | 'default'> = {
      seed: 'primary',
      fertilizer: 'secondary',
      pesticide: 'warning',
      herbicide: 'warning',
      equipment: 'default',
      other: 'default',
    };
    
    const categoryLabels: Record<string, string> = {
      seed: language === 'pt' ? 'Sementes' : 'Seeds',
      fertilizer: language === 'pt' ? 'Fertilizantes' : 'Fertilizers',
      pesticide: language === 'pt' ? 'Pesticidas' : 'Pesticides',
      herbicide: language === 'pt' ? 'Herbicidas' : 'Herbicides',
      equipment: language === 'pt' ? 'Equipamentos' : 'Equipment',
      other: language === 'pt' ? 'Outros' : 'Other',
    };
    
    // Use default variant for custom categories
    const variant = categoryStyles[product.category as keyof typeof categoryStyles] || 'default';
    
    // Use the category name directly if it's not in the predefined labels
    const label = categoryLabels[product.category as keyof typeof categoryLabels] || product.category;
    
    return (
      <Badge variant={variant}>
        {label}
      </Badge>
    );
  };

  const handleAdjustStock = async () => {
    try {
      setError(null);
      const quantity = Number(adjustmentQuantity);
      
      if (isNaN(quantity) || quantity <= 0) {
        setError(language === 'pt'
          ? 'Quantidade deve ser um número positivo'
          : 'Quantity must be a positive number');
        return;
      }

      const newQuantity = adjustmentType === 'add'
        ? product.quantityInStock + quantity
        : product.quantityInStock - quantity;

      if (newQuantity < 0) {
        setError(language === 'pt'
          ? 'Quantidade final não pode ser negativa'
          : 'Final quantity cannot be negative');
        return;
      }

      await updateProduct(product.id, {
        ...product,
        quantityInStock: newQuantity
      });

      setShowAdjustStock(false);
      setAdjustmentQuantity('0');
      setAdjustmentType('add');
    } catch (error) {
      console.error('Error adjusting stock:', error);
      setError(language === 'pt'
        ? 'Erro ao ajustar estoque'
        : 'Error adjusting stock');
    }
  };

  return (
    <Card className="h-full transition-all duration-200 hover:shadow-md">
      <Card.Header>
        <div className="flex justify-between items-start">
          <div>
            <div className="flex flex-wrap gap-2 mb-2">
              {getCategoryBadge()}
              {getLowStockBadge()}
            </div>
            <Card.Title>{product.name}</Card.Title>
          </div>
          <div className="flex space-x-2">
            <Link to={`/inventory/${product.id}/edit`}>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`${language === 'pt' ? 'Editar' : 'Edit'} ${product.name}`}
                leftIcon={<Pencil size={16} />}
              >
                {language === 'pt' ? 'Editar' : 'Edit'}
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`${language === 'pt' ? 'Excluir' : 'Delete'} ${product.name}`}
              leftIcon={<Trash2 size={16} />}
              onClick={() => onDelete(product.id)}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              {language === 'pt' ? 'Excluir' : 'Delete'}
            </Button>
          </div>
        </div>
      </Card.Header>
      <Card.Content>
        <div className="space-y-3">
          <div className="flex items-center text-gray-700">
            <Package size={16} className="mr-2" />
            <span>
              {product.quantityInStock} {product.unit} {language === 'pt' ? 'em estoque' : 'in stock'}
              {product.minStockLevel > 0 && ` (${language === 'pt' ? 'Mín' : 'Min'}: ${product.minStockLevel})`}
            </span>
          </div>
          
          <div className="flex items-center text-gray-700">
            <DollarSign size={16} className="mr-2" />
            <span>{formatCurrency(product.price)} {language === 'pt' ? 'por' : 'per'} {product.unit}</span>
          </div>
          
          {product.supplier && (
            <div className="text-sm text-gray-600">
              {language === 'pt' ? 'Fornecedor' : 'Supplier'}: {product.supplier}
            </div>
          )}
          
          {product.description && (
            <p className="text-sm text-gray-600 mt-2">{product.description}</p>
          )}
        </div>
      </Card.Content>
      <Card.Footer>
        {showAdjustStock ? (
          <div className="space-y-4 w-full">
            {error && (
              <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
                {error}
              </div>
            )}
            <div className="flex gap-2">
              <Button
                variant={adjustmentType === 'add' ? 'primary' : 'outline'}
                size="sm"
                className="flex-1"
                onClick={() => setAdjustmentType('add')}
                leftIcon={<Plus size={16} />}
              >
                {language === 'pt' ? 'Adicionar' : 'Add'}
              </Button>
              <Button
                variant={adjustmentType === 'subtract' ? 'primary' : 'outline'}
                size="sm"
                className="flex-1"
                onClick={() => setAdjustmentType('subtract')}
                leftIcon={<Minus size={16} />}
              >
                {language === 'pt' ? 'Remover' : 'Remove'}
              </Button>
            </div>
            
            <Input
              type="number"
              min="0"
              step="0.01"
              value={adjustmentQuantity}
              onChange={(e) => setAdjustmentQuantity(e.target.value)}
              placeholder={language === 'pt' ? 'Quantidade' : 'Quantity'}
            />
            
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => {
                  setShowAdjustStock(false);
                  setAdjustmentQuantity('0');
                  setAdjustmentType('add');
                  setError(null);
                }}
              >
                {language === 'pt' ? 'Cancelar' : 'Cancel'}
              </Button>
              <Button
                size="sm"
                className="flex-1"
                onClick={handleAdjustStock}
              >
                {language === 'pt' ? 'Confirmar' : 'Confirm'}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowAdjustStock(true)}
          >
            {language === 'pt' ? 'Ajustar Estoque' : 'Adjust Stock'}
          </Button>
        )}
      </Card.Footer>
    </Card>
  );
};

export default ProductCard;