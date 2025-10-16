import React from 'react';
import { Map, Pencil, Trash2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Area } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { useLanguage } from '../../context/LanguageContext';
import { useAppContext } from '../../context/AppContext';

interface AreaCardProps {
  area: Area;
  onDelete: (id: string) => void;
}

const AreaCard: React.FC<AreaCardProps> = ({ area, onDelete }) => {
  const { language } = useLanguage();
  const { activeSeason } = useAppContext();
  const navigate = useNavigate();

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString(language === 'pt' ? 'pt-BR' : 'en-US');
  };

  const handleAddOperation = () => {
    if (!activeSeason) {
      alert(language === 'pt'
        ? 'Selecione uma safra ativa antes de adicionar uma operação'
        : 'Select an active season before adding an operation');
      return;
    }
    navigate(`/operations/new?areaId=${area.id}`);
  };

  return (
    <Card className="h-full transition-all duration-200 hover:shadow-md">
      <Card.Header>
        <div className="flex justify-between items-start">
          <Card.Title>{area.name}</Card.Title>
          <div className="flex space-x-2">
            <Link to={`/areas/${area.id}/edit`}>
              <Button
                variant="ghost"
                size="sm"
                aria-label={language === 'pt' ? `Editar ${area.name}` : `Edit ${area.name}`}
                leftIcon={<Pencil size={16} />}
              >
                {language === 'pt' ? 'Editar' : 'Edit'}
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              aria-label={language === 'pt' ? `Excluir ${area.name}` : `Delete ${area.name}`}
              leftIcon={<Trash2 size={16} />}
              onClick={() => onDelete(area.id)}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              {language === 'pt' ? 'Excluir' : 'Delete'}
            </Button>
          </div>
        </div>
        <Card.Description>
          {area.size} {area.unit} · {area.location}
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <div className="flex items-center mb-2 text-green-800">
          <Map size={18} className="mr-2" />
          <div>
            <span className="font-medium">
              {language === 'pt' ? 'Cultivo atual: ' : 'Current crop: '}
              {area.current_crop || (language === 'pt' ? 'Nenhum' : 'None')}
            </span>
            {area.cultivar && (
              <p className="text-sm text-gray-600">
                {language === 'pt' ? 'Cultivar: ' : 'Cultivar: '}
                {area.cultivar}
              </p>
            )}
          </div>
        </div>
        <p className="text-gray-600 text-sm mb-3">{area.description}</p>
        <div className="text-xs text-gray-500">
          {language === 'pt' ? 'Criado em: ' : 'Created: '}
          {formatDate(area.createdAt)}
        </div>
      </Card.Content>
      <Card.Footer className="flex justify-between">
        <Link
          to={`/areas/${area.id}`}
          className="text-green-700 hover:text-green-800 font-medium text-sm"
        >
          {language === 'pt' ? 'Ver Detalhes' : 'View Details'}
        </Link>
        <Button
          variant="ghost"
          size="sm"
          className="text-green-700 hover:text-green-800 font-medium"
          onClick={handleAddOperation}
        >
          {language === 'pt' ? 'Adicionar Operação' : 'Add Operation'}
        </Button>
      </Card.Footer>
    </Card>
  );
};

export default AreaCard;