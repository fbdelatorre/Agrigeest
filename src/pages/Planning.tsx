import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import Input from '../components/ui/Input';
import { Calendar, Map, Plus, Save, X, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';

const Planning = () => {
  const { areas, operations, addOperation } = useAppContext();
  const [selectedArea, setSelectedArea] = useState('');
  const [selectedOperation, setSelectedOperation] = useState('');
  const [plannedDate, setPlannedDate] = useState('');
  const [description, setDescription] = useState('');
  const [operator, setOperator] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Get all unique operation types
  const operationTypes = Array.from(new Set(operations.map(op => op.type))).map(type => ({
    value: type,
    label: getOperationTypeLabel(type)
  }));

  const getOperationTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      gradagem: 'Gradagem',
      subsolagem: 'Subsolagem',
      plantio: 'Plantio',
      colheita: 'Colheita',
      dessecacao: 'Dessecação',
      herbicida: 'Apl. Herbicidas',
      fungicida: 'Fungicida'
    };
    return labels[type] || type;
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!selectedArea) newErrors.area = 'Selecione uma área';
    if (!selectedOperation) newErrors.operation = 'Selecione o tipo de operação';
    if (!plannedDate) newErrors.date = 'Selecione a data planejada';
    if (!description.trim()) newErrors.description = 'Digite uma descrição';
    if (!operator.trim()) newErrors.operator = 'Digite o nome do operador';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) return;

    const newOperation = {
      areaId: selectedArea,
      type: selectedOperation,
      startDate: new Date(),
      nextOperationDate: new Date(plannedDate),
      description,
      operatedBy: operator,
      productsUsed: [],
      notes: `Operação planejada para ${formatDate(plannedDate)}`
    };

    addOperation(newOperation);
    
    setShowForm(false);
    setSelectedArea('');
    setSelectedOperation('');
    setPlannedDate('');
    setDescription('');
    setOperator('');
    setErrors({});
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcomingOperations = operations
    .filter(op => op.nextOperationDate && new Date(op.nextOperationDate) >= today)
    .sort((a, b) => new Date(a.nextOperationDate!).getTime() - new Date(b.nextOperationDate!).getTime());

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Planejamento de Operações</h1>
          <p className="text-gray-600">Planeje suas futuras operações agrícolas</p>
        </div>
        <Button
          onClick={() => setShowForm(true)}
          leftIcon={<Plus size={18} />}
        >
          Planejar Operação
        </Button>
      </div>

      {showForm && (
        <Card className="mb-6">
          <Card.Header>
            <Card.Title>Nova Operação Planejada</Card.Title>
          </Card.Header>
          <Card.Content>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Select
                  label="Área"
                  value={selectedArea}
                  onChange={(e) => setSelectedArea(e.target.value)}
                  options={[
                    { value: '', label: 'Selecione uma área' },
                    ...areas.map(area => ({
                      value: area.id,
                      label: area.name
                    }))
                  ]}
                  error={errors.area}
                  required
                />

                <Select
                  label="Tipo de Operação"
                  value={selectedOperation}
                  onChange={(e) => setSelectedOperation(e.target.value)}
                  options={[
                    { value: '', label: 'Selecione o tipo' },
                    ...operationTypes
                  ]}
                  error={errors.operation}
                  required
                />

                <Input
                  type="date"
                  label="Data Planejada"
                  value={plannedDate}
                  onChange={(e) => setPlannedDate(e.target.value)}
                  error={errors.date}
                  required
                />

                <Input
                  label="Operador"
                  value={operator}
                  onChange={(e) => setOperator(e.target.value)}
                  placeholder="Nome do operador responsável"
                  error={errors.operator}
                  required
                />

                <div className="md:col-span-2">
                  <Input
                    label="Descrição"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Descreva a operação planejada"
                    error={errors.description}
                    required
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowForm(false);
                    setErrors({});
                  }}
                  leftIcon={<X size={18} />}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  leftIcon={<Save size={18} />}
                >
                  Salvar Planejamento
                </Button>
              </div>
            </form>
          </Card.Content>
        </Card>
      )}

      <Card>
        <Card.Header>
          <div className="flex items-center">
            <Calendar className="w-5 h-5 mr-2 text-green-700" />
            <Card.Title>Operações Planejadas</Card.Title>
          </div>
        </Card.Header>
        <Card.Content>
          <div className="space-y-4">
            {upcomingOperations.map(operation => {
              const area = areas.find(a => a.id === operation.areaId);
              const isToday = new Date(operation.nextOperationDate!).toDateString() === today.toDateString();
              
              return (
                <div 
                  key={operation.id}
                  className={`p-4 rounded-lg border ${
                    isToday 
                      ? 'bg-yellow-50 border-yellow-200' 
                      : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        {isToday && (
                          <div className="flex items-center text-yellow-700 bg-yellow-100 px-2 py-1 rounded-full text-xs font-medium">
                            <AlertTriangle size={14} className="mr-1" />
                            Hoje
                          </div>
                        )}
                        <span className="text-sm font-medium text-gray-500">
                          {formatDate(operation.nextOperationDate!.toString())}
                        </span>
                        {area && (
                          <div className="flex items-center text-gray-600">
                            <Map size={16} className="mr-1" />
                            {area.name}
                          </div>
                        )}
                      </div>
                      <h3 className="font-medium text-gray-900">
                        {operation.description}
                      </h3>
                      <div className="text-sm text-gray-600 mt-1 space-y-1">
                        <p>Tipo: {getOperationTypeLabel(operation.type)}</p>
                        <p>Operador: {operation.operatedBy}</p>
                      </div>
                    </div>
                    <Link to={`/operations/new?areaId=${operation.areaId}`}>
                      <Button 
                        size="sm"
                        variant={isToday ? 'primary' : 'secondary'}
                      >
                        Registrar Operação
                      </Button>
                    </Link>
                  </div>
                </div>
              );
            })}

            {upcomingOperations.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <p>Não há operações planejadas.</p>
                <Button
                  variant="ghost"
                  className="mt-2"
                  onClick={() => setShowForm(true)}
                >
                  Planejar Nova Operação
                </Button>
              </div>
            )}
          </div>
        </Card.Content>
      </Card>
    </div>
  );
};

export default Planning;