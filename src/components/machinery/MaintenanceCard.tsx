import React from 'react';
import { MaintenanceWithDetails } from '../../types/machinery';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import { Calendar, User, FileText, Pencil, Trash2, Wrench, Clock, DollarSign } from 'lucide-react';
import { Link } from 'react-router-dom';
import Button from '../ui/Button';
import { useLanguage } from '../../context/LanguageContext';
import { useMachineryContext } from '../../context/MachineryContext';

interface MaintenanceCardProps {
  maintenance: MaintenanceWithDetails;
  onDelete: (id: string) => void;
}

const MaintenanceCard: React.FC<MaintenanceCardProps> = ({
  maintenance,
  onDelete,
}) => {
  const { machinery, maintenanceTypes } = useMachineryContext();
  const { language } = useLanguage();
  
  const machine = machinery.find(m => m.id === maintenance.machineryId);
  const type = maintenanceTypes.find(t => t.id === maintenance.maintenanceTypeId);
  
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString(language === 'pt' ? 'pt-BR' : 'en-US');
  };

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
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="primary">
                {type?.name || (language === 'pt' ? 'Tipo desconhecido' : 'Unknown type')}
              </Badge>
              {machine && (
                <span className="text-sm text-gray-600">
                  {machine.name}
                </span>
              )}
            </div>
            <Card.Title>
              {maintenance.description || type?.name || (language === 'pt' ? 'Manutenção' : 'Maintenance')}
            </Card.Title>
          </div>
          <div className="flex space-x-2">
            <Link to={`/maintenances/${maintenance.id}/edit`}>
              <Button
                variant="ghost"
                size="sm"
                aria-label={language === 'pt' ? 'Editar manutenção' : 'Edit maintenance'}
                leftIcon={<Pencil size={16} />}
              >
                {language === 'pt' ? 'Editar' : 'Edit'}
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              aria-label={language === 'pt' ? 'Excluir manutenção' : 'Delete maintenance'}
              leftIcon={<Trash2 size={16} />}
              onClick={() => onDelete(maintenance.id)}
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
            <span>{formatDate(maintenance.date)}</span>
          </div>

          {maintenance.machineHours && (
            <div className="flex items-center text-gray-700">
              <Clock size={16} className="mr-2" />
              <span>
                {maintenance.machineHours.toLocaleString()} {language === 'pt' ? 'horas' : 'hours'}
              </span>
            </div>
          )}

          {maintenance.cost > 0 && (
            <div className="flex items-center text-gray-700">
              <DollarSign size={16} className="mr-2" />
              <span>{formatCurrency(maintenance.cost)}</span>
            </div>
          )}

          {maintenance.description && maintenance.description !== type?.name && (
            <div className="mt-2 pt-2 border-t border-gray-200">
              <div className="flex items-center text-gray-700 mb-1">
                <Wrench size={16} className="mr-2" />
                <span className="font-medium text-sm">
                  {language === 'pt' ? 'Descrição:' : 'Description:'}
                </span>
              </div>
              <p className="text-sm text-gray-600 ml-6">{maintenance.description}</p>
            </div>
          )}

          {maintenance.materialUsed && (
            <div className="mt-2">
              <div className="text-sm font-medium text-gray-700 mb-1">
                {language === 'pt' ? 'Material Utilizado:' : 'Material Used:'}
              </div>
              <p className="text-sm text-gray-600">{maintenance.materialUsed}</p>
            </div>
          )}

          {maintenance.notes && (
            <div className="mt-2">
              <div className="flex items-center text-gray-700">
                <FileText size={16} className="mr-2" />
                <span className="font-medium text-sm">
                  {language === 'pt' ? 'Observações:' : 'Notes:'}
                </span>
              </div>
              <p className="text-sm text-gray-600 mt-1">{maintenance.notes}</p>
            </div>
          )}
        </div>
      </Card.Content>
      <Card.Footer>
        <div className="text-xs text-gray-500">
          {language === 'pt' ? 'Registrado em: ' : 'Recorded on: '}
          {formatDate(maintenance.createdAt)}
        </div>
      </Card.Footer>
    </Card>
  );
};

export default MaintenanceCard;