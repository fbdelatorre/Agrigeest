import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMachineryContext } from '../../context/MachineryContext';
import MachineryForm from '../../components/machinery/MachineryForm';
import { Machinery } from '../../types/machinery';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';

const MachineryEdit = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getMachineryById, updateMachinery } = useMachineryContext();
  const { language } = useLanguage();
  const [machinery, setMachinery] = useState<Machinery | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      const foundMachinery = getMachineryById(id);
      if (foundMachinery) {
        setMachinery(foundMachinery);
      } else {
        alert(language === 'pt'
          ? 'Máquina não encontrada'
          : 'Machinery not found');
        navigate('/machinery');
      }
    }
    setLoading(false);
  }, [id, getMachineryById, navigate, language]);

  const handleSubmit = async (machineryData: Omit<Machinery, 'id' | 'createdAt' | 'updatedAt' | 'userId' | 'institutionId'>) => {
    if (!id) return;

    try {
      await updateMachinery(id, machineryData);
      navigate('/machinery');
    } catch (error) {
      console.error('Error updating machinery:', error);
      alert(language === 'pt'
        ? 'Erro ao atualizar máquina. Tente novamente.'
        : 'Error updating machinery. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-600">
          {language === 'pt' ? 'Carregando...' : 'Loading...'}
        </div>
      </div>
    );
  }

  if (!machinery) {
    return null;
  }

  return (
    <div>
      <div className="mb-6 pt-4 lg:pt-0">
        <Link
          to="/machinery"
          className="text-green-700 hover:text-green-800 font-medium text-sm flex items-center"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          {language === 'pt' ? 'Voltar para Máquinas' : 'Back to Machinery'}
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {language === 'pt' ? 'Editar Máquina' : 'Edit Machinery'}
        </h1>
        <p className="text-gray-600">
          {language === 'pt' ? 'Atualize as informações da máquina' : 'Update machinery information'}
        </p>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-sm">
        <MachineryForm
          initialData={machinery}
          onSubmit={handleSubmit}
          isEditing={true}
        />
      </div>
    </div>
  );
};

export default MachineryEdit;
