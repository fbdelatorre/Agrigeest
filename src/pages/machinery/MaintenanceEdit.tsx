import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMachineryContext } from '../../context/MachineryContext';
import MaintenanceForm from '../../components/machinery/MaintenanceForm';
import { Maintenance } from '../../types/machinery';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';

const MaintenanceEdit = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { maintenances, updateMaintenance } = useMachineryContext();
  const { language } = useLanguage();
  const [maintenance, setMaintenance] = useState<Maintenance | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      const found = maintenances.find(m => m.id === id);
      setMaintenance(found || null);
      setLoading(false);
    }
  }, [id, maintenances]);

  const handleSubmit = async (maintenanceData: Omit<Maintenance, 'id' | 'createdAt' | 'updatedAt' | 'userId' | 'institutionId'>) => {
    if (!id) return;

    try {
      await updateMaintenance(id, maintenanceData);
      navigate('/maintenances');
    } catch (error) {
      console.error('Error updating maintenance:', error);
      alert(language === 'pt'
        ? 'Erro ao atualizar manutenção. Tente novamente.'
        : 'Error updating maintenance. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-600">
          {language === 'pt' ? 'Carregando...' : 'Loading...'}
        </div>
      </div>
    );
  }

  if (!maintenance) {
    return (
      <div>
        <div className="mb-6 pt-4 lg:pt-0">
          <Link
            to="/maintenances"
            className="text-green-700 hover:text-green-800 font-medium text-sm flex items-center"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            {language === 'pt' ? 'Voltar para Manutenções' : 'Back to Maintenances'}
          </Link>
        </div>

        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {language === 'pt' ? 'Manutenção não encontrada' : 'Maintenance not found'}
          </h3>
          <p className="text-gray-600 mb-4">
            {language === 'pt'
              ? 'A manutenção que você está tentando editar não foi encontrada.'
              : 'The maintenance you are trying to edit was not found.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 pt-4 lg:pt-0">
        <Link
          to="/maintenances"
          className="text-green-700 hover:text-green-800 font-medium text-sm flex items-center"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          {language === 'pt' ? 'Voltar para Manutenções' : 'Back to Maintenances'}
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {language === 'pt' ? 'Editar Manutenção' : 'Edit Maintenance'}
        </h1>
        <p className="text-gray-600">
          {language === 'pt'
            ? 'Atualize as informações da manutenção'
            : 'Update the maintenance information'}
        </p>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-sm">
        <MaintenanceForm
          initialData={maintenance}
          onSubmit={handleSubmit}
          isEditing={true}
        />
      </div>
    </div>
  );
};

export default MaintenanceEdit;
