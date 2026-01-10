import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMachineryContext } from '../../context/MachineryContext';
import { Maintenance } from '../../types/machinery';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Button from '../ui/Button';
import { Save, X, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';

interface MaintenanceFormProps {
  initialData?: Partial<Maintenance>;
  onSubmit: (data: Omit<Maintenance, 'id' | 'createdAt' | 'updatedAt' | 'userId' | 'institutionId'>) => void;
  isEditing?: boolean;
}

const MaintenanceForm: React.FC<MaintenanceFormProps> = ({
  initialData = {},
  onSubmit,
  isEditing = false,
}) => {
  const navigate = useNavigate();
  const { machinery, maintenanceTypes, addMaintenanceType } = useMachineryContext();
  const { language } = useLanguage();
  const [searchParams] = useSearchParams();
  
  const [formData, setFormData] = useState({
    machineryId: initialData.machineryId || searchParams.get('machineryId') || '',
    maintenanceTypeId: initialData.maintenanceTypeId || '',
    description: initialData.description || '',
    materialUsed: initialData.materialUsed || '',
    date: initialData.date
      ? new Date(initialData.date).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0],
    machineHours: initialData.machineHours?.toString() || '',
    cost: initialData.cost?.toString() || '0',
    notes: initialData.notes || '',
  });

  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [showNewTypeInput, setShowNewTypeInput] = useState(false);
  const [newMaintenanceType, setNewMaintenanceType] = useState('');
  const [newTypeDescription, setNewTypeDescription] = useState('');

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    
    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const handleAddNewType = async () => {
    if (newMaintenanceType.trim()) {
      try {
        const newType = await addMaintenanceType({
          name: newMaintenanceType.trim(),
          description: newTypeDescription.trim() || undefined
        });
        
        setFormData(prev => ({ ...prev, maintenanceTypeId: newType.id }));
        setNewMaintenanceType('');
        setNewTypeDescription('');
        setShowNewTypeInput(false);
      } catch (error) {
        console.error('Error adding maintenance type:', error);
        alert(language === 'pt'
          ? 'Erro ao adicionar tipo de manutenção'
          : 'Error adding maintenance type');
      }
    }
  };

  const validate = (): boolean => {
    const newErrors: { [key: string]: string } = {};
    
    if (!formData.machineryId) {
      newErrors.machineryId = language === 'pt' ? 'Máquina é obrigatória' : 'Machinery is required';
    }
    
    if (!formData.maintenanceTypeId) {
      newErrors.maintenanceTypeId = language === 'pt' ? 'Tipo de manutenção é obrigatório' : 'Maintenance type is required';
    }

    if (!formData.date) {
      newErrors.date = language === 'pt' ? 'Data é obrigatória' : 'Date is required';
    }
    
    if (formData.machineHours && (isNaN(Number(formData.machineHours)) || Number(formData.machineHours) < 0)) {
      newErrors.machineHours = language === 'pt' ? 'Horas da máquina deve ser um número válido' : 'Machine hours must be a valid number';
    }
    
    if (formData.cost && (isNaN(Number(formData.cost)) || Number(formData.cost) < 0)) {
      newErrors.cost = language === 'pt' ? 'Custo deve ser um número válido' : 'Cost must be a valid number';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    onSubmit({
      machineryId: formData.machineryId,
      maintenanceTypeId: formData.maintenanceTypeId,
      description: formData.description || undefined,
      materialUsed: formData.materialUsed || undefined,
      date: new Date(formData.date),
      machineHours: formData.machineHours ? Number(formData.machineHours) : undefined,
      cost: Number(formData.cost),
      notes: formData.notes || undefined,
    });
  };

  const machineryOptions = machinery.map((machine) => ({
    value: machine.id,
    label: `${machine.name}${machine.model ? ` (${machine.model})` : ''}`,
  }));

  const maintenanceTypeOptions = maintenanceTypes.map((type) => ({
    value: type.id,
    label: type.name,
  }));

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Select
          name="machineryId"
          label={language === 'pt' ? 'Máquina' : 'Machinery'}
          value={formData.machineryId}
          onChange={handleChange}
          options={[
            { 
              value: '', 
              label: language === 'pt' ? 'Selecione uma máquina' : 'Select machinery'
            },
            ...machineryOptions
          ]}
          error={errors.machineryId}
          required
        />
        
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-700">
              {language === 'pt' ? 'Tipo de Manutenção' : 'Maintenance Type'}
            </label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowNewTypeInput(true)}
              leftIcon={<Plus size={16} />}
              className="text-green-700 hover:text-green-800"
            >
              {language === 'pt' ? 'Novo Tipo' : 'New Type'}
            </Button>
          </div>
          
          {showNewTypeInput ? (
            <div className="space-y-3 p-3 bg-gray-50 rounded-lg">
              <Input
                name="newMaintenanceType"
                label={language === 'pt' ? 'Nome do Tipo' : 'Type Name'}
                value={newMaintenanceType}
                onChange={(e) => setNewMaintenanceType(e.target.value)}
                placeholder={language === 'pt' ? 'ex: Troca de óleo do motor' : 'e.g., Engine oil change'}
                required
              />
              <Input
                name="newTypeDescription"
                label={language === 'pt' ? 'Descrição (opcional)' : 'Description (optional)'}
                value={newTypeDescription}
                onChange={(e) => setNewTypeDescription(e.target.value)}
                placeholder={language === 'pt' ? 'Descrição do tipo de manutenção' : 'Maintenance type description'}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={handleAddNewType}
                  size="sm"
                >
                  {language === 'pt' ? 'Adicionar' : 'Add'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowNewTypeInput(false);
                    setNewMaintenanceType('');
                    setNewTypeDescription('');
                  }}
                >
                  {language === 'pt' ? 'Cancelar' : 'Cancel'}
                </Button>
              </div>
            </div>
          ) : (
            <Select
              name="maintenanceTypeId"
              value={formData.maintenanceTypeId}
              onChange={handleChange}
              options={[
                { 
                  value: '', 
                  label: language === 'pt' ? 'Selecione o tipo' : 'Select type'
                },
                ...maintenanceTypeOptions
              ]}
              error={errors.maintenanceTypeId}
              required
            />
          )}
        </div>

        <Input
          name="date"
          label={language === 'pt' ? 'Data da Manutenção' : 'Maintenance Date'}
          type="date"
          value={formData.date}
          onChange={handleChange}
          required
          error={errors.date}
        />
        
        <Input
          name="machineHours"
          label={language === 'pt' ? 'Horas da Máquina (opcional)' : 'Machine Hours (optional)'}
          type="number"
          min="0"
          step="0.1"
          value={formData.machineHours}
          onChange={handleChange}
          placeholder={language === 'pt' ? 'ex: 1250.5' : 'e.g., 1250.5'}
          error={errors.machineHours}
        />
        
        <Input
          name="cost"
          label={language === 'pt' ? 'Custo (R$)' : 'Cost (R$)'}
          type="number"
          min="0"
          step="0.01"
          value={formData.cost}
          onChange={handleChange}
          placeholder={language === 'pt' ? 'ex: 150.00' : 'e.g., 150.00'}
          error={errors.cost}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {language === 'pt' ? 'Descrição' : 'Description'}
        </label>
        <textarea
          name="description"
          value={formData.description}
          onChange={handleChange}
          rows={3}
          className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
          placeholder={language === 'pt'
            ? 'Descreva a manutenção realizada...'
            : 'Describe the maintenance performed...'}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {language === 'pt' ? 'Material Utilizado (opcional)' : 'Material Used (optional)'}
        </label>
        <textarea
          name="materialUsed"
          value={formData.materialUsed}
          onChange={handleChange}
          rows={2}
          className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
          placeholder={language === 'pt'
            ? 'ex: Óleo 15W40, Filtro de óleo, Parafusos'
            : 'e.g., 15W40 Oil, Oil filter, Bolts'}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {language === 'pt' ? 'Observações (opcional)' : 'Notes (optional)'}
        </label>
        <textarea
          name="notes"
          value={formData.notes}
          onChange={handleChange}
          rows={2}
          className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
          placeholder={language === 'pt'
            ? 'Digite observações adicionais sobre esta manutenção...'
            : 'Enter any additional notes about this maintenance...'}
        />
      </div>
      
      <div className="flex justify-end space-x-4">
        <Button
          type="button"
          variant="outline"
          leftIcon={<X size={18} />}
          onClick={() => navigate('/maintenances')}
        >
          {language === 'pt' ? 'Cancelar' : 'Cancel'}
        </Button>
        <Button
          type="submit"
          leftIcon={<Save size={18} />}
        >
          {isEditing 
            ? (language === 'pt' ? 'Atualizar Manutenção' : 'Update Maintenance')
            : (language === 'pt' ? 'Registrar Manutenção' : 'Record Maintenance')}
        </Button>
      </div>
    </form>
  );
};

export default MaintenanceForm;