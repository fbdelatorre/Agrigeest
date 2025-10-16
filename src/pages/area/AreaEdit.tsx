import React from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';
import AreaForm from '../../components/areas/AreaForm';
import { Area } from '../../types';
import { ArrowLeft } from 'lucide-react';

const AreaEdit = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getAreaById, updateArea } = useAppContext();
  
  if (!id) {
    navigate('/areas');
    return null;
  }
  
  const area = getAreaById(id);
  
  if (!area) {
    navigate('/areas');
    return null;
  }
  
  const handleSubmit = (areaData: Omit<Area, 'id' | 'createdAt' | 'updatedAt'>) => {
    updateArea(id, areaData);
    navigate(`/areas/${id}`);
  };

  return (
    <div>
      <div className="mb-6 pt-4 lg:pt-0">
        <Link 
          to={`/areas/${id}`} 
          className="text-green-700 hover:text-green-800 font-medium text-sm flex items-center"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Area Details
        </Link>
      </div>
      
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Edit Area</h1>
        <p className="text-gray-600">Update details for {area.name}</p>
      </div>
      
      <div className="bg-white p-6 rounded-lg shadow-sm">
        <AreaForm
          initialData={area}
          onSubmit={handleSubmit}
          isEditing={true}
        />
      </div>
    </div>
  );
};

export default AreaEdit;