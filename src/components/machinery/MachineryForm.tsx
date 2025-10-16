import React, { useState } from 'react';
import { Machinery } from '../../types/machinery';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { Save, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';

interface MachineryFormProps {
  initialData?: Partial<Machinery>;
  onSubmit: (data: Omit<Machinery, 'id' | 'createdAt' | 'updatedAt' | 'userId' | 'institutionId'>) => void;
  isEditing?: boolean;
}

const MachineryForm: React.FC<MachineryFormProps> = ({
  initialData = {},
  onSubmit,
  isEditing = false,
}) => {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const [formData, setFormData] = useState({
    name: initialData.name || '',
    description: initialData.description || '',
    model: initialData.model || '',
    year: initialData.year?.toString() || '',
  });

  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    
    // Limpar erro do campo sendo editado
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
    
    if (formData.year && (isNaN(Number(formData.year)) || Number(formData.year) < 1900 || Number(formData.year) > new Date().getFullYear() + 1)) {
      newErrors.year = language === 'pt' ? 'Ano deve ser válido' : 'Year must be valid';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) return;
    
    onSubmit({
      ...formData,
      year: formData.year ? Number(formData.year) : undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Input
          name="name"
          label={language === 'pt' ? 'Nome da Máquina' : 'Machinery Name'}
          value={formData.name}
          onChange={handleChange}
          placeholder={language === 'pt' ? 'ex: Trator John Deere' : 'e.g., John Deere Tractor'}
          error={errors.name}
          required
        />
        
        <Input
          name="model"
          label={language === 'pt' ? 'Modelo (opcional)' : 'Model (optional)'}
          value={formData.model}
          onChange={handleChange}
          placeholder={language === 'pt' ? 'ex: 6110J' : 'e.g., 6110J'}
        />
        
        <Input
          name="year"
          label={language === 'pt' ? 'Ano (opcional)' : 'Year (optional)'}
          type="number"
          min="1900"
          max={new Date().getFullYear() + 1}
          value={formData.year}
          onChange={handleChange}
          placeholder={language === 'pt' ? 'ex: 2020' : 'e.g., 2020'}
          error={errors.year}
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
            ? 'Digite detalhes adicionais sobre esta máquina...'
            : 'Enter any additional details about this machinery...'}
        />
      </div>
      
      <div className="flex justify-end space-x-4">
        <Button
          type="button"
          variant="outline"
          leftIcon={<X size={18} />}
          onClick={() => navigate('/machinery')}
        >
          {language === 'pt' ? 'Cancelar' : 'Cancel'}
        </Button>
        <Button
          type="submit"
          leftIcon={<Save size={18} />}
        >
          {isEditing 
            ? (language === 'pt' ? 'Atualizar Máquina' : 'Update Machinery')
            : (language === 'pt' ? 'Criar Máquina' : 'Create Machinery')}
        </Button>
      </div>
    </form>
  );
};

export default MachineryForm;