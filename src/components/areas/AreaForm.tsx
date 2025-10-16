import React, { useState, useEffect } from 'react';
import { Area, AreaUnit } from '../../types';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Button from '../ui/Button';
import { Save, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';

interface AreaFormProps {
  initialData?: Partial<Area>;
  onSubmit: (data: Omit<Area, 'id' | 'createdAt' | 'updatedAt'>) => void;
  isEditing?: boolean;
}

const AreaForm: React.FC<AreaFormProps> = ({
  initialData = {},
  onSubmit,
  isEditing = false,
}) => {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const [formData, setFormData] = useState({
    name: initialData.name || '',
    size: initialData.size?.toString() || '',
    unit: initialData.unit || 'hectare' as AreaUnit,
    location: initialData.location || '',
    description: initialData.description || '',
    current_crop: initialData.current_crop || '',
    cultivar: initialData.cultivar || '',
  });

  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    
    // Clear error for the field being edited
    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const validate = (): boolean => {
    const newErrors: { [key: string]: string } = {};
    
    if (!formData.name.trim()) {
      newErrors.name = language === 'pt' ? 'Nome é obrigatório' : 'Name is required';
    }
    
    if (!formData.size) {
      newErrors.size = language === 'pt' ? 'Tamanho é obrigatório' : 'Size is required';
    } else if (isNaN(Number(formData.size)) || Number(formData.size) <= 0) {
      newErrors.size = language === 'pt' ? 'Tamanho deve ser um número positivo' : 'Size must be a positive number';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) return;
    
    onSubmit({
      ...formData,
      size: Number(formData.size),
    });
  };

  const unitOptions = [
    { value: 'hectare', label: 'Hectare' },
    { value: 'acre', label: 'Acre' },
    { value: 'squareMeter', label: language === 'pt' ? 'Metro Quadrado' : 'Square Meter' },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Input
          name="name"
          label={language === 'pt' ? 'Nome da Área' : 'Area Name'}
          value={formData.name}
          onChange={handleChange}
          placeholder={language === 'pt' ? 'ex: Campo Norte' : 'e.g., North Field'}
          error={errors.name}
          required
        />
        
        <div className="grid grid-cols-2 gap-4">
          <Input
            name="size"
            label={language === 'pt' ? 'Tamanho' : 'Size'}
            type="number"
            value={formData.size}
            onChange={handleChange}
            placeholder={language === 'pt' ? 'ex: 150' : 'e.g., 150'}
            error={errors.size}
            required
          />
          
          <Select
            name="unit"
            label={language === 'pt' ? 'Unidade' : 'Unit'}
            value={formData.unit}
            onChange={handleChange}
            options={unitOptions}
            required
          />
        </div>
        
        <Input
          name="location"
          label={language === 'pt' ? 'Localização (opcional)' : 'Location (optional)'}
          value={formData.location}
          onChange={handleChange}
          placeholder={language === 'pt' ? 'ex: Setor Norte' : 'e.g., North sector'}
        />
        
        <Input
          name="current_crop"
          label={language === 'pt' ? 'Cultivo Atual (opcional)' : 'Current Crop (optional)'}
          value={formData.current_crop}
          onChange={handleChange}
          placeholder={language === 'pt' ? 'ex: Milho' : 'e.g., Corn'}
        />

        <Input
          name="cultivar"
          label={language === 'pt' ? 'Cultivar Plantada (opcional)' : 'Planted Cultivar (optional)'}
          value={formData.cultivar}
          onChange={handleChange}
          placeholder={language === 'pt' ? 'ex: DKB 390' : 'e.g., DKB 390'}
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {language === 'pt' ? 'Descrição (opcional)' : 'Description (optional)'}
        </label>
        <textarea
          name="description"
          value={formData.description}
          onChange={handleChange}
          rows={3}
          className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
          placeholder={language === 'pt' 
            ? 'Digite detalhes adicionais sobre esta área...'
            : 'Enter any additional details about this area...'}
        />
      </div>
      
      <div className="flex justify-end space-x-4">
        <Button
          type="button"
          variant="outline"
          leftIcon={<X size={18} />}
          onClick={() => navigate('/areas')}
        >
          {language === 'pt' ? 'Cancelar' : 'Cancel'}
        </Button>
        <Button
          type="submit"
          leftIcon={<Save size={18} />}
        >
          {isEditing 
            ? (language === 'pt' ? 'Atualizar Área' : 'Update Area')
            : (language === 'pt' ? 'Criar Área' : 'Create Area')}
        </Button>
      </div>
    </form>
  );
};

export default AreaForm;