import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import AreaCard from '../../components/areas/AreaCard';
import Button from '../../components/ui/Button';
import { Plus, Filter } from 'lucide-react';

const AreasList = () => {
  const { areas, deleteArea } = useAppContext();
  const { language } = useLanguage();
  const [searchTerm, setSearchTerm] = useState('');
  
  // Filter areas based on search term
  const filteredAreas = areas.filter((area) =>
    area.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    area.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (area.currentCrop && area.currentCrop.toLowerCase().includes(searchTerm.toLowerCase()))
  );
  
  const handleDeleteArea = (id: string) => {
    if (window.confirm(language === 'pt' 
      ? 'Tem certeza que deseja excluir esta área? Todas as operações associadas permanecerão, mas não estarão mais vinculadas a esta área.'
      : 'Are you sure you want to delete this area? All associated operations will remain but will no longer be linked to this area.'
    )) {
      deleteArea(id);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6 pt-4 lg:pt-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {language === 'pt' ? 'Áreas de Cultivo' : 'Farming Areas'}
          </h1>
          <p className="text-gray-600">
            {language === 'pt' 
              ? 'Gerencie suas áreas e campos de cultivo'
              : 'Manage your farming areas and fields'}
          </p>
        </div>
        <Link to="/areas/new">
          <Button leftIcon={<Plus size={18} />}>
            {language === 'pt' ? 'Nova Área' : 'Add New Area'}
          </Button>
        </Link>
      </div>
      
      <div className="mb-6">
        <div className="relative">
          <input
            type="text"
            placeholder={language === 'pt'
              ? 'Buscar áreas por nome, localização ou cultivo...'
              : 'Search areas by name, location, or crop...'}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <div className="absolute left-3 top-2.5 text-gray-400">
            <Filter size={18} />
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredAreas.length > 0 ? (
          filteredAreas.map((area) => (
            <AreaCard
              key={area.id}
              area={area}
              onDelete={handleDeleteArea}
            />
          ))
        ) : (
          <div className="col-span-3 text-center py-12 bg-gray-50 rounded-lg">
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {language === 'pt' ? 'Nenhuma área encontrada' : 'No areas found'}
            </h3>
            <p className="text-gray-600 mb-4">
              {searchTerm
                ? language === 'pt'
                  ? `Nenhum resultado encontrado para "${searchTerm}"`
                  : `No results matching "${searchTerm}"`
                : language === 'pt'
                ? "Você ainda não adicionou nenhuma área de cultivo"
                : "You haven't added any farming areas yet"}
            </p>
            <Link to="/areas/new">
              <Button leftIcon={<Plus size={18} />}>
                {language === 'pt' 
                  ? 'Adicionar Primeira Área'
                  : 'Add Your First Area'}
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default AreasList;