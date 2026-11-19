import { writeErrorMessage } from '../../lib/businessWrites';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';
import AreaForm from '../../components/areas/AreaForm';
import { Area } from '../../types';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

const AreaCreate = () => {
  const navigate = useNavigate();
  const { addArea } = useAppContext();
  
  const handleSubmit = async (areaData: Omit<Area, 'id' | 'createdAt' | 'updatedAt'>) => {
    try { await addArea(areaData); navigate('/areas'); }
    catch (error) { alert(writeErrorMessage(error)); }
  };

  return (
    <div>
      <div className="mb-6 pt-4 lg:pt-0">
        <Link 
          to="/areas" 
          className="text-brand-700 hover:text-brand-800 font-medium text-sm flex items-center"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Areas
        </Link>
      </div>
      
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Add New Area</h1>
        <p className="text-gray-600">Register a new farming area with details</p>
      </div>
      
      <div className="bg-white p-6 rounded-lg shadow-sm">
        <AreaForm onSubmit={handleSubmit} />
      </div>
    </div>
  );
};

export default AreaCreate;
