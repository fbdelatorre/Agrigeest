import React from 'react';
import { Product } from '../../types';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import { Package, DollarSign, Pencil, Trash2, AlertTriangle, Layers, Calendar } from 'lucide-react';
import { Link } from 'react-router-dom';
import Button from '../ui/Button';
import { useLanguage } from '../../context/LanguageContext';
import { useAppContext } from '../../context/AppContext';
import { formatDateForDisplay } from '../../utils/dateHelpers';

interface ProductCardProps {
  product: Product;
  onDelete: (id: string) => void;
}

const ProductCard: React.FC<ProductCardProps> = ({ product, onDelete }) => {
  const { language } = useLanguage();
  const { getLotsByProductId } = useAppContext();

  const lots = getLotsByProductId(product.id);

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

  const isExpiringSoon = (date?: Date): boolean => {
    if (!date) return false;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 60;
  };

  const isExpired = (date?: Date): boolean => {
    if (!date) return false;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return date < now;
  };

  const expiringLots = lots.filter(lot => isExpiringSoon(lot.expirationDate) || isExpired(lot.expirationDate));

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

    const variant = categoryStyles[product.category as keyof typeof categoryStyles] || 'default';
    const label = categoryLabels[product.category as keyof typeof categoryLabels] || product.category;

    return (
      <Badge variant={variant}>
        {label}
      </Badge>
    );
  };

  return (
    <Card className="h-full transition-all duration-200 hover:shadow-md">
      <Card.Header>
        <div className="flex justify-between items-start">
          <div>
            <div className="flex flex-wrap gap-2 mb-2">
              {getCategoryBadge()}
              {getLowStockBadge()}
              {expiringLots.length > 0 && (
                <Badge variant="warning" className="flex items-center gap-1">
                  <AlertTriangle size={12} />
                  {expiringLots.length} {language === 'pt' ? 'lote(s) vencendo' : 'lot(s) expiring'}
                </Badge>
              )}
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

          {lots.length > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-200">
              <div className="flex items-center text-sm font-medium text-gray-700 mb-2">
                <Layers size={14} className="mr-1" />
                {language === 'pt' ? 'Lotes' : 'Lots'} ({lots.length})
              </div>
              <div className="space-y-1.5">
                {lots.slice(0, 3).map(lot => {
                  const expired = isExpired(lot.expirationDate);
                  const expiringSoon = isExpiringSoon(lot.expirationDate);
                  return (
                    <div key={lot.id} className="flex items-center justify-between text-xs">
                      <span className="text-gray-600 font-medium">{lot.lotNumber}</span>
                      <span className="text-gray-600">{lot.quantity} {product.unit}</span>
                      <span className={`flex items-center gap-1 ${expired ? 'text-red-600' : expiringSoon ? 'text-orange-600' : 'text-gray-500'}`}>
                        {lot.expirationDate ? (
                          <>
                            <Calendar size={11} />
                            {formatDateForDisplay(lot.expirationDate, language === 'pt' ? 'pt-BR' : 'en-US')}
                          </>
                        ) : '—'}
                      </span>
                    </div>
                  );
                })}
                {lots.length > 3 && (
                  <div className="text-xs text-gray-400 text-center pt-1">
                    +{lots.length - 3} {language === 'pt' ? 'lote(s) adicional(is)' : 'more lot(s)'}
                  </div>
                )}
              </div>
            </div>
          )}

          {lots.length === 0 && (
            <div className="text-sm text-amber-600 flex items-center gap-1 mt-2">
              <AlertTriangle size={14} />
              {language === 'pt' ? 'Nenhum lote cadastrado' : 'No lots registered'}
            </div>
          )}

          {product.description && (
            <p className="text-sm text-gray-600 mt-2">{product.description}</p>
          )}
        </div>
      </Card.Content>
      <Card.Footer>
        <Link to={`/inventory/${product.id}/edit`} className="w-full">
          <Button variant="secondary" size="sm" className="w-full">
            {language === 'pt' ? 'Gerenciar Lotes' : 'Manage Lots'}
          </Button>
        </Link>
      </Card.Footer>
    </Card>
  );
};

export default ProductCard;
