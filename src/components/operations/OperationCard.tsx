import React from 'react';
import { Operation, OperationType } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import { Calendar, User, FileText, Pencil, Trash2, Map } from 'lucide-react';
import { Link } from 'react-router-dom';
import Button from '../ui/Button';
import { useAppContext } from '../../context/AppContext';

interface OperationCardProps {
  operation: Operation;
  showAreaName?: boolean;
  onDelete: (id: string) => void;
}

const OperationCard: React.FC<OperationCardProps> = ({
  operation,
  showAreaName = false,
  onDelete,
}) => {
  const { getAreaById, getProductById } = useAppContext();
  const { language } = useLanguage();
  
  const area = getAreaById(operation.areaId);
  
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString(language === 'pt' ? 'pt-BR' : 'en-US');
  };
  
  const getOperationTypeLabel = (type: OperationType): string => {
    if (language === 'pt') {
      const labels = {
        plowing: 'Aração',
        spraying: 'Pulverização',
        planting: 'Plantio',
        harvesting: 'Colheita',
        gradagem: 'Gradagem',
        subsolagem: 'Subsolagem',
        plantio: 'Plantio',
        colheita: 'Colheita',
        dessecacao: 'Dessecação',
        herbicida: 'Herbicida',
        fungicida: 'Fungicida'
      };
      return labels[type] || type;
    }

    const labels = {
      plowing: 'Plowing',
      spraying: 'Spraying',
      planting: 'Planting',
      harvesting: 'Harvesting',
    };
    return labels[type] || type;
  };
  
  const getOperationTypeBadgeVariant = (type: OperationType) => {
    const variants = {
      plowing: 'secondary',
      spraying: 'warning',
      planting: 'primary',
      harvesting: 'success',
    } as const;
    return variants[type];
  };

  const getProductsUsedText = () => {
    if (!operation.productsUsed || !operation.productsUsed.length) {
      return language === 'pt' ? 'Nenhum produto utilizado' : 'No products used';
    }
    
    return (operation.productsUsed || []).map(usage => {
      const product = getProductById(usage.productId);
      return product 
        ? `${usage.quantity} ${product.unit} ${language === 'pt' ? 'de' : 'of'} ${product.name}`
        : language === 'pt' ? 'Produto desconhecido' : 'Unknown product';
    }).join(', ');
  };

  return (
    <Card className="h-full transition-all duration-200 hover:shadow-md">
      <Card.Header>
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant={getOperationTypeBadgeVariant(operation.type)}>
                {getOperationTypeLabel(operation.type)}
              </Badge>
              {showAreaName && area && (
                <span className="text-sm text-gray-600">
                  {language === 'pt' ? 'em' : 'in'} {area.name}
                </span>
              )}
            </div>
            <Card.Title className="mt-2">{operation.description}</Card.Title>
          </div>
          <div className="flex space-x-2">
            <Link to={`/operations/${operation.id}/edit`}>
              <Button
                variant="ghost"
                size="sm"
                aria-label={language === 'pt' ? 'Editar operação' : 'Edit operation'}
                leftIcon={<Pencil size={16} />}
              >
                {language === 'pt' ? 'Editar' : 'Edit'}
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              aria-label={language === 'pt' ? 'Excluir operação' : 'Delete operation'}
              leftIcon={<Trash2 size={16} />}
              onClick={() => onDelete(operation.id)}
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
            <Calendar size={16} className="mr-2" />
            <span>
              {formatDate(operation.startDate)}
              {operation.endDate && operation.endDate.toString() !== operation.startDate.toString() 
                ? ` ${language === 'pt' ? 'até' : 'to'} ${formatDate(operation.endDate)}` 
                : ''}
            </span>
          </div>
          
          <div className="flex items-center text-gray-700">
            <User size={16} className="mr-2" />
            <span>
              {language === 'pt' ? 'Operador: ' : 'Operated by: '}
              {operation.operatedBy}
            </span>
          </div>

          <div className="flex items-center text-gray-700">
            <Map size={16} className="mr-2" />
            <span>
              {language === 'pt' ? 'Área aplicada: ' : 'Applied area: '}
              {operation.operationSize} {area?.unit}
            </span>
          </div>
          
          <div className="mt-2">
            <div className="text-sm font-medium text-gray-700 mb-1">
              {language === 'pt' ? 'Produtos Utilizados:' : 'Products Used:'}
            </div>
            <p className="text-sm text-gray-600">{getProductsUsedText()}</p>
          </div>
          
          {operation.notes && (
            <div className="mt-2">
              <div className="flex items-center text-gray-700">
                <FileText size={16} className="mr-2" />
                <span className="font-medium">
                  {language === 'pt' ? 'Observações:' : 'Notes:'}
                </span>
              </div>
              <p className="text-sm text-gray-600 mt-1">{operation.notes}</p>
            </div>
          )}
        </div>
      </Card.Content>
      <Card.Footer>
        <div className="text-xs text-gray-500">
          {language === 'pt' ? 'Registrado em: ' : 'Recorded on: '}
          {formatDate(operation.createdAt)}
        </div>
      </Card.Footer>
    </Card>
  );
};

export default OperationCard;