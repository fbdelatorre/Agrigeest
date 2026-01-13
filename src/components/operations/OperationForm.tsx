import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';
import { Operation, ProductUsage } from '../../types';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Button from '../ui/Button';
import ProductSearchInput from '../ui/ProductSearchInput';
import { Save, X, Plus } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { dateToInputValue, inputValueToDate } from '../../utils/dateHelpers';

interface OperationFormProps {
  initialData?: Partial<Operation>;
  onSubmit: (data: Omit<Operation, 'id' | 'createdAt' | 'updatedAt'>) => void;
  isEditing?: boolean;
}

const OperationForm: React.FC<OperationFormProps> = ({
  initialData = {},
  onSubmit,
  isEditing = false,
}) => {
  const navigate = useNavigate();
  const { areas, products, activeSeason } = useAppContext();
  const { language } = useLanguage();
  
  // Get the initial area to set the operation size
  const initialArea = areas.find(area => area.id === initialData.areaId);
  
  const [formData, setFormData] = useState({
    areaId: initialData.areaId || '',
    type: initialData.type || 'gradagem',
    startDate: initialData.startDate
      ? dateToInputValue(initialData.startDate)
      : dateToInputValue(new Date()),
    endDate: initialData.endDate
      ? dateToInputValue(initialData.endDate)
      : '',
    nextOperationDate: initialData.nextOperationDate
      ? dateToInputValue(initialData.nextOperationDate)
      : '',
    description: initialData.description || '',
    operatedBy: initialData.operatedBy || '',
    productsUsed: (initialData.productsUsed || []).map(usage => ({
      ...usage,
      dose: usage.dose?.toString().replace('.', ',') || '0',
      quantity: usage.quantity.toString().replace('.', ',')
    })),
    notes: initialData.notes || '',
    operationSize: initialData.operationSize?.toString() || initialArea?.size.toString() || '',
    yieldPerHectare: initialData.yieldPerHectare?.toString() || '',
    seedsPerHectare: initialData.seedsPerHectare?.toString() || '',
  });

  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [showNewTypeInput, setShowNewTypeInput] = useState(false);
  const [newOperationType, setNewOperationType] = useState('');
  const [customOperationTypes, setCustomOperationTypes] = useState<string[]>([]);
  const [isOperationSizeEditable, setIsOperationSizeEditable] = useState(isEditing);
  const [wasOperationSizeManuallyEdited, setWasOperationSizeManuallyEdited] = useState(false);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;

    if (name === 'areaId') {
      const selectedArea = areas.find(area => area.id === value);
      const newSize = selectedArea?.size || parseNumber(formData.operationSize);

      setFormData(prev => {
        // Recalculate product quantities based on the new area size
        const updatedProducts = prev.productsUsed.map(usage => ({
          ...usage,
          quantity: (parseNumber(usage.dose) * newSize).toString().replace('.', ',')
        }));

        return {
          ...prev,
          [name]: value,
          ...(wasOperationSizeManuallyEdited ? {} : {
            operationSize: newSize.toString()
          }),
          productsUsed: updatedProducts
        };
      });
    } else if (name === 'operationSize') {
      setWasOperationSizeManuallyEdited(true);
      const newSize = parseNumber(value);
      setFormData(prev => {
        // Update product quantities based on the new operation size
        const updatedProducts = prev.productsUsed.map(usage => ({
          ...usage,
          quantity: (parseNumber(usage.dose) * newSize).toString().replace('.', ',')
        }));

        return {
          ...prev,
          [name]: value,
          productsUsed: updatedProducts
        };
      });
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }

    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const formatNumber = (value: string): string => {
    return value.replace(/[^\d,]/g, '');
  };

  const parseNumber = (value: string): number => {
    return Number(value.replace(',', '.'));
  };

  const handleProductChange = (index: number, field: string, value: string) => {
    const updatedProducts = [...formData.productsUsed];
    const operationSize = parseNumber(formData.operationSize);
    
    if (field === 'productId') {
      updatedProducts[index] = {
        ...updatedProducts[index],
        productId: value,
        dose: updatedProducts[index]?.dose || '0',
        quantity: updatedProducts[index]?.dose
          ? (parseNumber(updatedProducts[index].dose) * operationSize).toString().replace('.', ',')
          : '0'
      };
    } else if (field === 'dose') {
      const formattedValue = formatNumber(value);
      updatedProducts[index] = {
        ...updatedProducts[index],
        dose: formattedValue,
        quantity: (parseNumber(formattedValue) * operationSize).toString().replace('.', ',')
      };
    } else if (field === 'quantity') {
      updatedProducts[index] = {
        ...updatedProducts[index],
        quantity: formatNumber(value)
      };
    }
    
    setFormData((prev) => ({
      ...prev,
      productsUsed: updatedProducts,
    }));
  };

  const addProductUsage = () => {
    setFormData((prev) => ({
      ...prev,
      productsUsed: [
        ...prev.productsUsed,
        { productId: '', quantity: '0', dose: '0' },
      ],
    }));
  };

  const removeProductUsage = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      productsUsed: prev.productsUsed.filter((_, i) => i !== index),
    }));
  };

  const handleAddNewType = () => {
    if (newOperationType.trim()) {
      setCustomOperationTypes(prev => [...prev, newOperationType.trim()]);
      setFormData(prev => ({ ...prev, type: newOperationType.trim() }));
      setNewOperationType('');
      setShowNewTypeInput(false);
    }
  };

  const validate = (): boolean => {
    const newErrors: { [key: string]: string } = {};
    
    if (!formData.areaId) {
      newErrors.areaId = language === 'pt' ? 'Área é obrigatória' : 'Area is required';
    }
    
    if (!formData.startDate) {
      newErrors.startDate = language === 'pt' ? 'Data inicial é obrigatória' : 'Start date is required';
    }
    
    if (!formData.description.trim()) {
      newErrors.description = language === 'pt' ? 'Descrição é obrigatória' : 'Description is required';
    }
    
    if (!formData.operatedBy.trim()) {
      newErrors.operatedBy = language === 'pt' ? 'Operador é obrigatório' : 'Operator is required';
    }

    if (!formData.operationSize.trim()) {
      newErrors.operationSize = language === 'pt' ? 'Tamanho da área é obrigatório' : 'Operation size is required';
    } else {
      const size = parseNumber(formData.operationSize);
      const selectedArea = areas.find(area => area.id === formData.areaId);
      if (selectedArea && size > selectedArea.size) {
        newErrors.operationSize = language === 'pt' 
          ? `Tamanho não pode ser maior que ${selectedArea.size} ${selectedArea.unit}`
          : `Size cannot be larger than ${selectedArea.size} ${selectedArea.unit}`;
      }
      if (size <= 0) {
        newErrors.operationSize = language === 'pt'
          ? 'Tamanho deve ser maior que 0'
          : 'Size must be greater than 0';
      }
    }

    if (formData.type === 'colheita' && !formData.yieldPerHectare?.trim()) {
      newErrors.yieldPerHectare = language === 'pt'
        ? 'Produtividade por hectare é obrigatória'
        : 'Yield per hectare is required';
    }

    if (formData.type === 'plantio' && !formData.seedsPerHectare?.trim()) {
      newErrors.seedsPerHectare = language === 'pt'
        ? 'População de sementes por hectare é obrigatória'
        : 'Seeds per hectare is required';
    }
    
    formData.productsUsed.forEach((usage, index) => {
      if (!usage.productId) {
        newErrors[`productId-${index}`] = language === 'pt' ? 'Produto é obrigatório' : 'Product is required';
      }
      if (parseNumber(usage.quantity.toString()) <= 0) {
        newErrors[`quantity-${index}`] = language === 'pt' ? 'Quantidade deve ser maior que 0' : 'Quantity must be greater than 0';
      }
      if (parseNumber(usage.dose.toString()) < 0) {
        newErrors[`dose-${index}`] = language === 'pt' ? 'Dose não pode ser negativa' : 'Dose cannot be negative';
      }
    });
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) return;

    const submissionData = {
      ...formData,
      startDate: inputValueToDate(formData.startDate),
      endDate: formData.endDate ? inputValueToDate(formData.endDate) : undefined,
      nextOperationDate: formData.nextOperationDate ? inputValueToDate(formData.nextOperationDate) : undefined,
      productsUsed: formData.productsUsed.map(usage => ({
        ...usage,
        quantity: parseNumber(usage.quantity.toString()),
        dose: parseNumber(usage.dose.toString())
      })),
      operationSize: parseNumber(formData.operationSize),
      yieldPerHectare: formData.yieldPerHectare ? parseNumber(formData.yieldPerHectare) : undefined,
      seedsPerHectare: formData.seedsPerHectare ? parseNumber(formData.seedsPerHectare) : undefined,
    };
    
    onSubmit(submissionData);
  };

  const operationTypeOptions = [
    { value: 'gradagem', label: 'Gradagem' },
    { value: 'subsolagem', label: 'Subsolagem' },
    { value: 'plantio', label: 'Plantio' },
    { value: 'colheita', label: 'Colheita' },
    { value: 'dessecacao', label: 'Dessecação' },
    { value: 'herbicida', label: 'Apl. Herbicidas' },
    { value: 'fungicida', label: 'Fungicida' },
    ...customOperationTypes.map(type => ({ value: type, label: type }))
  ];

  const areaOptions = areas.map((area) => ({
    value: area.id,
    label: area.name,
  }));

  const selectedArea = areas.find(area => area.id === formData.areaId);

  // If no active season, show message
  if (!activeSeason) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-lg">
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          {language === 'pt' ? 'Nenhuma safra ativa' : 'No active season'}
        </h3>
        <p className="text-gray-600 mb-4">
          {language === 'pt'
            ? 'Selecione uma safra no menu lateral para registrar operações'
            : 'Select a season from the sidebar to record operations'}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Select
          name="areaId"
          label={language === 'pt' ? 'Área' : 'Area'}
          value={formData.areaId}
          onChange={handleChange}
          options={[
            { 
              value: '', 
              label: language === 'pt' ? 'Selecione uma área' : 'Select an area'
            },
            ...areaOptions
          ]}
          error={errors.areaId}
          required
        />
        
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-700">
              {language === 'pt' ? 'Tipo de Operação' : 'Operation Type'}
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
            <div className="flex gap-2">
              <Input
                name="newOperationType"
                value={newOperationType}
                onChange={(e) => setNewOperationType(e.target.value)}
                placeholder={language === 'pt' ? 'Digite o novo tipo' : 'Enter new type'}
                className="flex-1"
              />
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
                  setNewOperationType('');
                }}
              >
                {language === 'pt' ? 'Cancelar' : 'Cancel'}
              </Button>
            </div>
          ) : (
            <Select
              name="type"
              value={formData.type}
              onChange={handleChange}
              options={operationTypeOptions}
              required
            />
          )}
        </div>
        
        <Input
          name="description"
          label={language === 'pt' ? 'Descrição' : 'Description'}
          value={formData.description}
          onChange={handleChange}
          placeholder={language === 'pt' ? 'ex: Gradagem de preparo' : 'e.g., Preparation harrowing'}
          error={errors.description}
          required
        />
        
        <Input
          name="operatedBy"
          label={language === 'pt' ? 'Operador' : 'Operator'}
          value={formData.operatedBy}
          onChange={handleChange}
          placeholder={language === 'pt' ? 'ex: João Silva' : 'e.g., John Smith'}
          error={errors.operatedBy}
          required
        />
        
        <Input
          name="startDate"
          label={language === 'pt' ? 'Data Inicial' : 'Start Date'}
          type="date"
          value={formData.startDate}
          onChange={handleChange}
          required
          error={errors.startDate}
        />
        
        <Input
          name="endDate"
          label={language === 'pt' ? 'Data Final' : 'End Date'}
          type="date"
          value={formData.endDate}
          onChange={handleChange}
          helperText={language === 'pt' 
            ? 'Deixe em branco se a operação foi concluída em um dia'
            : 'Leave blank if operation was completed in one day'}
        />

        <Input
          name="nextOperationDate"
          label={language === 'pt' ? 'Próxima Aplicação' : 'Next Application'}
          type="date"
          value={formData.nextOperationDate}
          onChange={handleChange}
          helperText={language === 'pt'
            ? 'Data prevista para a próxima aplicação'
            : 'Expected date for next application'}
        />

        <div className="relative">
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-gray-700">
              {language === 'pt' ? 'Tamanho da Área Aplicada' : 'Applied Area Size'}
            </label>
            <label className="flex items-center text-sm">
              <input
                type="checkbox"
                checked={isOperationSizeEditable}
                onChange={(e) => {
                  setIsOperationSizeEditable(e.target.checked);
                  if (!e.target.checked) {
                    setWasOperationSizeManuallyEdited(false);
                  }
                }}
                className="rounded border-gray-300 text-green-600 shadow-sm focus:border-green-300 focus:ring focus:ring-green-200 focus:ring-opacity-50 mr-2"
              />
              {language === 'pt' ? 'Editar tamanho' : 'Edit size'}
            </label>
          </div>
          <Input
            name="operationSize"
            type="text"
            inputMode="decimal"
            value={formData.operationSize}
            onChange={handleChange}
            error={errors.operationSize}
            helperText={selectedArea ? `${selectedArea.unit}` : ''}
            required
            disabled={!isOperationSizeEditable}
            className={!isOperationSizeEditable ? 'bg-gray-100' : ''}
          />
        </div>

        {formData.type === 'colheita' && (
          <Input
            name="yieldPerHectare"
            label={language === 'pt' ? 'Produtividade (kg/ha)' : 'Yield (kg/ha)'}
            type="text"
            inputMode="decimal"
            value={formData.yieldPerHectare}
            onChange={handleChange}
            placeholder={language === 'pt' ? 'ex: 3500' : 'e.g., 3500'}
            error={errors.yieldPerHectare}
            required
          />
        )}

        {formData.type === 'plantio' && (
          <Input
            name="seedsPerHectare"
            label={language === 'pt' ? 'População (sementes/ha)' : 'Population (seeds/ha)'}
            type="text"
            inputMode="decimal"
            value={formData.seedsPerHectare}
            onChange={handleChange}
            placeholder={language === 'pt' ? 'ex: 60000' : 'e.g., 60000'}
            error={errors.seedsPerHectare}
            required
          />
        )}
      </div>
      
      <div className="mt-6">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-medium text-gray-900">
            {language === 'pt' ? 'Produtos Utilizados' : 'Products Used'}
          </h3>
          <Button 
            type="button" 
            variant="secondary" 
            size="sm" 
            leftIcon={<Plus size={16} />} 
            onClick={addProductUsage}
          >
            {language === 'pt' ? 'Adicionar Produto' : 'Add Product'}
          </Button>
        </div>
        
        {formData.productsUsed.length === 0 && (
          <div className="bg-gray-50 p-4 rounded-md text-center text-gray-500">
            {language === 'pt'
              ? 'Nenhum produto adicionado. Clique em "Adicionar Produto" para incluir produtos nesta operação.'
              : 'No products added. Click "Add Product" to include products in this operation.'}
          </div>
        )}
        
        {formData.productsUsed.map((usage, index) => {
          const product = products.find(p => p.id === usage.productId);

          return (
            <div key={index} className="flex items-start space-x-4 mb-4 p-4 bg-gray-50 rounded-md">
              <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                <ProductSearchInput
                  products={products}
                  value={usage.productId}
                  onChange={(productId) => handleProductChange(index, 'productId', productId)}
                  label={language === 'pt' ? 'Produto' : 'Product'}
                  placeholder={language === 'pt' ? 'Buscar produto...' : 'Search product...'}
                  error={errors[`productId-${index}`]}
                  required
                />
                
                <Input
                  name={`dose-${index}`}
                  label={`${language === 'pt' ? 'Dose por' : 'Dose per'} ${selectedArea?.unit || 'hectare'}`}
                  type="text"
                  inputMode="decimal"
                  value={usage.dose?.toString() || '0'}
                  onChange={(e) => handleProductChange(index, 'dose', e.target.value)}
                  helperText={product ? `${language === 'pt' ? 'em' : 'in'} ${product.unit}/${selectedArea?.unit || 'hectare'}` : ''}
                  error={errors[`dose-${index}`]}
                />
                
                <Input
                  name={`quantity-${index}`}
                  label={language === 'pt' ? 'Quantidade Total' : 'Total Quantity'}
                  type="text"
                  inputMode="decimal"
                  value={usage.quantity.toString()}
                  onChange={(e) => handleProductChange(index, 'quantity', e.target.value)}
                  error={errors[`quantity-${index}`]}
                  helperText={product ? product.unit : ''}
                  required
                />
              </div>
              
              <div className="pt-8">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={language === 'pt' ? 'Remover produto' : 'Remove product'}
                  leftIcon={<X size={16} />}
                  onClick={() => removeProductUsage(index)}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                />
              </div>
            </div>
          );
        })}
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {language === 'pt' ? 'Observações' : 'Notes'}
        </label>
        <textarea
          name="notes"
          value={formData.notes}
          onChange={handleChange}
          rows={3}
          className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
          placeholder={language === 'pt'
            ? 'Digite quaisquer observações adicionais sobre esta operação...'
            : 'Enter any additional notes about this operation...'}
        />
      </div>
      
      <div className="flex justify-end space-x-4">
        <Button
          type="button"
          variant="outline"
          leftIcon={<X size={18} />}
          onClick={() => navigate('/operations')}
        >
          {language === 'pt' ? 'Cancelar' : 'Cancel'}
        </Button>
        <Button
          type="submit"
          leftIcon={<Save size={18} />}
        >
          {isEditing 
            ? (language === 'pt' ? 'Atualizar Operação' : 'Update Operation')
            : (language === 'pt' ? 'Criar Operação' : 'Create Operation')}
        </Button>
      </div>
    </form>
  );
};

export default OperationForm;