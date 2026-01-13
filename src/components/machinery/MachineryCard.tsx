import React from 'react';
import { Wrench, Pencil, Trash2, Calendar, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Machinery } from '../../types/machinery';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { useLanguage } from '../../context/LanguageContext';
import { useMachineryContext } from '../../context/MachineryContext';
import { formatDateForDisplay } from '../../utils/dateHelpers';

interface MachineryCardProps {
  machinery: Machinery;
  onDelete: (id: string) => void;
}

const MachineryCard: React.FC<MachineryCardProps> = ({ machinery, onDelete }) => {
  const { language } = useLanguage();
  const { maintenances } = useMachineryContext();

  const formatDate = (date: Date | string) => {
    return formatDateForDisplay(date, language === 'pt' ? 'pt-BR' : 'en-US');
  };

  // Obter manutenções desta máquina
  const machineryMaintenances = maintenances.filter(m => m.machineryId === machinery.id);
  const lastMaintenance = machineryMaintenances
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

  const totalMaintenances = machineryMaintenances.length;
  const totalCost = machineryMaintenances.reduce((sum, m) => sum + m.cost, 0);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(amount);
  };

  return (
    <Card className="h-full transition-all duration-200 hover:shadow-md">
      <Card.Header>
        <div className="flex justify-between items-start">
          <div>
            <Card.Title className="flex items-center">
              <Wrench className="w-5 h-5 mr-2 text-green-700" />
              {machinery.name}
            </Card.Title>
            <div className="flex gap-2 mt-2">
              {machinery.model && (
                <Badge variant="secondary">
                  {machinery.model}
                </Badge>
              )}
              {machinery.year && (
                <Badge variant="default">
                  {machinery.year}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex space-x-2">
            <Link to={`/machinery/${machinery.id}/edit`}>
              <Button
                variant="ghost"
                size="sm"
                aria-label={language === 'pt' ? `Editar ${machinery.name}` : `Edit ${machinery.name}`}
                leftIcon={<Pencil size={16} />}
              >
                {language === 'pt' ? 'Editar' : 'Edit'}
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              aria-label={language === 'pt' ? `Excluir ${machinery.name}` : `Delete ${machinery.name}`}
              leftIcon={<Trash2 size={16} />}
              onClick={() => onDelete(machinery.id)}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              {language === 'pt' ? 'Excluir' : 'Delete'}
            </Button>
          </div>
        </div>
      </Card.Header>
      <Card.Content>
        <div className="space-y-3">
          {machinery.description && (
            <p className="text-gray-600 text-sm">{machinery.description}</p>
          )}
          
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium text-gray-700">
                {language === 'pt' ? 'Manutenções:' : 'Maintenances:'}
              </span>
              <p className="text-gray-600">{totalMaintenances}</p>
            </div>
            <div>
              <span className="font-medium text-gray-700">
                {language === 'pt' ? 'Custo Total:' : 'Total Cost:'}
              </span>
              <p className="text-gray-600">{formatCurrency(totalCost)}</p>
            </div>
          </div>

          {lastMaintenance && (
            <div className="bg-gray-50 p-3 rounded-lg">
              <div className="flex items-center text-gray-700 mb-1">
                <Calendar size={16} className="mr-2" />
                <span className="font-medium text-sm">
                  {language === 'pt' ? 'Última Manutenção:' : 'Last Maintenance:'}
                </span>
              </div>
              <p className="text-sm text-gray-600">
                {formatDate(lastMaintenance.date)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {lastMaintenance.description}
              </p>
            </div>
          )}
          
          <div className="text-xs text-gray-500">
            {language === 'pt' ? 'Cadastrada em: ' : 'Registered: '}
            {formatDate(machinery.createdAt)}
          </div>
        </div>
      </Card.Content>
      <Card.Footer className="flex justify-between">
        <Link
          to={`/machinery/${machinery.id}`}
          className="text-green-700 hover:text-green-800 font-medium text-sm"
        >
          {language === 'pt' ? 'Ver Detalhes' : 'View Details'}
        </Link>
        <Link to={`/maintenances/new?machineryId=${machinery.id}`}>
          <Button
            variant="ghost"
            size="sm"
            className="text-green-700 hover:text-green-800 font-medium"
            leftIcon={<Settings size={16} />}
          >
            {language === 'pt' ? 'Nova Manutenção' : 'New Maintenance'}
          </Button>
        </Link>
      </Card.Footer>
    </Card>
  );
};

export default MachineryCard;