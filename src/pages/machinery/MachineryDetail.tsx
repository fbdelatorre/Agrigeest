import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useMachineryContext } from '../../context/MachineryContext';
import { useLanguage } from '../../context/LanguageContext';
import { Machinery, Maintenance } from '../../types/machinery';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import MaintenanceCard from '../../components/machinery/MaintenanceCard';
import { ArrowLeft, Wrench, Pencil, Trash2, Calendar, DollarSign, Plus, Clock } from 'lucide-react';
import { formatDateForDisplay } from '../../utils/dateHelpers';

const MachineryDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const { getMachineryById, getMaintenancesByMachineryId, deleteMachinery } = useMachineryContext();
  const [machinery, setMachinery] = useState<Machinery | null>(null);
  const [maintenances, setMaintenances] = useState<Maintenance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      const foundMachinery = getMachineryById(id);
      if (foundMachinery) {
        setMachinery(foundMachinery);
        const machineryMaintenances = getMaintenancesByMachineryId(id);
        setMaintenances(machineryMaintenances);
      } else {
        alert(language === 'pt'
          ? 'Máquina não encontrada'
          : 'Machinery not found');
        navigate('/machinery');
      }
    }
    setLoading(false);
  }, [id, getMachineryById, getMaintenancesByMachineryId, navigate, language]);

  const handleDelete = async () => {
    if (!id || !machinery) return;

    if (window.confirm(language === 'pt'
      ? `Tem certeza que deseja excluir "${machinery.name}"? Todas as manutenções associadas também serão excluídas.`
      : `Are you sure you want to delete "${machinery.name}"? All associated maintenances will also be deleted.`
    )) {
      try {
        await deleteMachinery(id);
        navigate('/machinery');
      } catch (error) {
        console.error('Error deleting machinery:', error);
        alert(language === 'pt'
          ? 'Erro ao excluir máquina. Tente novamente.'
          : 'Error deleting machinery. Please try again.');
      }
    }
  };

  const formatDate = (date: Date | string) => {
    return formatDateForDisplay(date, language === 'pt' ? 'pt-BR' : 'en-US');
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(amount);
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

  const totalMaintenances = maintenances.length;
  const totalCost = maintenances.reduce((sum, m) => sum + m.cost, 0);
  const lastMaintenance = maintenances.length > 0 ? maintenances[0] : null;

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

      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <div className="flex justify-between items-start mb-6">
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900 flex items-center mb-2">
              <Wrench className="w-8 h-8 mr-3 text-green-700" />
              {machinery.name}
            </h1>
            <div className="flex gap-2 mt-2">
              {machinery.model && (
                <Badge variant="secondary">
                  {language === 'pt' ? 'Modelo: ' : 'Model: '}{machinery.model}
                </Badge>
              )}
              {machinery.year && (
                <Badge variant="default">
                  {language === 'pt' ? 'Ano: ' : 'Year: '}{machinery.year}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex space-x-2">
            <Link to={`/machinery/${machinery.id}/edit`}>
              <Button
                variant="outline"
                leftIcon={<Pencil size={18} />}
              >
                {language === 'pt' ? 'Editar' : 'Edit'}
              </Button>
            </Link>
            <Button
              variant="outline"
              leftIcon={<Trash2 size={18} />}
              onClick={handleDelete}
              className="text-red-600 hover:text-red-700 hover:border-red-600"
            >
              {language === 'pt' ? 'Excluir' : 'Delete'}
            </Button>
          </div>
        </div>

        {machinery.description && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-2">
              {language === 'pt' ? 'Descrição' : 'Description'}
            </h3>
            <p className="text-gray-600">{machinery.description}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-green-50 border-green-200">
            <Card.Content className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-green-700">
                    {language === 'pt' ? 'Total de Manutenções' : 'Total Maintenances'}
                  </p>
                  <p className="text-3xl font-bold text-green-900 mt-1">
                    {totalMaintenances}
                  </p>
                </div>
                <Wrench className="w-10 h-10 text-green-600 opacity-50" />
              </div>
            </Card.Content>
          </Card>

          <Card className="bg-blue-50 border-blue-200">
            <Card.Content className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-blue-700">
                    {language === 'pt' ? 'Custo Total' : 'Total Cost'}
                  </p>
                  <p className="text-3xl font-bold text-blue-900 mt-1">
                    {formatCurrency(totalCost)}
                  </p>
                </div>
                <DollarSign className="w-10 h-10 text-blue-600 opacity-50" />
              </div>
            </Card.Content>
          </Card>

          <Card className="bg-amber-50 border-amber-200">
            <Card.Content className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-amber-700">
                    {language === 'pt' ? 'Última Manutenção' : 'Last Maintenance'}
                  </p>
                  {lastMaintenance ? (
                    <p className="text-lg font-bold text-amber-900 mt-1">
                      {formatDate(lastMaintenance.date)}
                    </p>
                  ) : (
                    <p className="text-lg font-medium text-amber-600 mt-1">
                      {language === 'pt' ? 'Nenhuma' : 'None'}
                    </p>
                  )}
                </div>
                <Calendar className="w-10 h-10 text-amber-600 opacity-50" />
              </div>
            </Card.Content>
          </Card>
        </div>

        <div className="mt-4 text-xs text-gray-500">
          {language === 'pt' ? 'Cadastrada em: ' : 'Registered: '}
          {formatDate(machinery.createdAt)}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900 flex items-center">
            <Clock className="w-6 h-6 mr-2 text-green-700" />
            {language === 'pt' ? 'Histórico de Manutenções' : 'Maintenance History'}
          </h2>
          <Link to={`/maintenances/new?machineryId=${machinery.id}`}>
            <Button leftIcon={<Plus size={18} />}>
              {language === 'pt' ? 'Nova Manutenção' : 'New Maintenance'}
            </Button>
          </Link>
        </div>

        {maintenances.length > 0 ? (
          <div className="space-y-4">
            {maintenances.map((maintenance) => (
              <MaintenanceCard
                key={maintenance.id}
                maintenance={maintenance}
                showMachinery={false}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <Clock size={48} className="mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {language === 'pt' ? 'Nenhuma manutenção registrada' : 'No maintenances recorded'}
            </h3>
            <p className="text-gray-600 mb-4">
              {language === 'pt'
                ? 'Esta máquina ainda não possui histórico de manutenções'
                : 'This machinery has no maintenance history yet'}
            </p>
            <Link to={`/maintenances/new?machineryId=${machinery.id}`}>
              <Button leftIcon={<Plus size={18} />}>
                {language === 'pt' ? 'Adicionar Primeira Manutenção' : 'Add First Maintenance'}
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default MachineryDetail;
