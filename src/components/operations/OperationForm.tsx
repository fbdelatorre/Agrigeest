import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';
import { Operation, ProductUsage, LotAllocation, ProductLot } from '../../types';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Button from '../ui/Button';
import ProductSearchInput from '../ui/ProductSearchInput';
import { Save, X, Plus, AlertTriangle, Layers } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { dateToInputValue, inputValueToDate, formatDateForDisplay } from '../../utils/dateHelpers';

interface OperationFormProps {
  initialData?: Partial<Operation>;
  onSubmit: (data: Omit<Operation, 'id' | 'createdAt' | 'updatedAt'>) => void;
  isEditing?: boolean;
}

interface FormProductUsage {
  productId: string;
  quantity: string;
  dose: string;
  lotId?: string;
  lotAllocations?: FormLotAllocation[];
  isLegacy: boolean;
}

interface FormLotAllocation {
  lotId: string;
  quantity: string;
}

const OperationForm: React.FC<OperationFormProps> = ({
  initialData = {},
  onSubmit,
  isEditing = false,
}) => {
  const navigate = useNavigate();
  const { areas, products, activeSeason, getLotsByProductId } = useAppContext();
  const { language } = useLanguage();
  const { isOnline } = useNetworkStatus();

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
    productsUsed: (initialData.productsUsed || []).map(usage => {
      const isLegacy = !usage.lotAllocations;
      if (isLegacy) {
        return {
          productId: usage.productId,
          dose: usage.dose?.toString().replace('.', ',') || '0',
          quantity: usage.quantity.toString().replace('.', ','),
          lotId: usage.lotId,
          isLegacy: true,
        };
      }
      return {
        productId: usage.productId,
        dose: usage.dose?.toString().replace('.', ',') || '0',
        quantity: usage.quantity.toString().replace('.', ','),
        lotId: usage.lotId,
        lotAllocations: (usage.lotAllocations || []).map(alloc => ({
          lotId: alloc.lotId || '',
          quantity: alloc.quantity.toString().replace('.', ','),
        })),
        isLegacy: false,
      };
    }),
    notes: initialData.notes || '',
    operationSize: initialData.operationSize?.toString() || initialArea?.size.toString() || '',
    yieldPerHectare: initialData.yieldPerHectare?.toString() || '',
    seedsPerHectare: initialData.seedsPerHectare?.toString() || '',
  });

  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [showNewTypeInput, setShowNewTypeInput] = useState(false);
  const [newOperationType, setNewOperationType] = useState('');
  const [customOperationTypes, setCustomOperationTypes] = useState<string[]>([]);
  const [isOperationSizeEditable, setIsOperationSizeEditable] = useState(false);
  const [fefoChecked, setFefoChecked] = useState<boolean[]>([]);
  const [fefoApplied, setFefoApplied] = useState<boolean[]>([]);
  const [showFefoWarning, setShowFefoWarning] = useState(false);
  const [fefoPendingIndex, setFefoPendingIndex] = useState<number | null>(null);
  const [showFefoReconfirm, setShowFefoReconfirm] = useState(false);
  const [fefoReconfirmIndex, setFefoReconfirmIndex] = useState<number | null>(null);
  const [dontShowFefoWarning, setDontShowFefoWarning] = useState(false);
  const hideFefoWarningStored = typeof localStorage !== 'undefined' && localStorage.getItem('agriGest_hide_fefo_warning') === 'true';

  const formatNumber = (value: string): string => {
    return value.replace(/[^\d,]/g, '');
  };

  const parseNumber = (value: string): number => {
    return Number(value.replace(',', '.'));
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;

    if (name === 'areaId') {
      const selectedArea = areas.find(area => area.id === value);

      setFormData(prev => {
        const newSize = isOperationSizeEditable
          ? parseNumber(prev.operationSize)
          : (selectedArea?.size || parseNumber(prev.operationSize));

        const updatedProducts = prev.productsUsed.map(usage => ({
          ...usage,
          quantity: (parseNumber(usage.dose) * newSize).toString().replace('.', ',')
        }));

        return {
          ...prev,
          [name]: value,
          operationSize: newSize.toString(),
          productsUsed: updatedProducts
        };
      });
    } else if (name === 'operationSize') {
      const newSize = parseNumber(value);
      setFormData(prev => {
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

  const handleProductChange = (index: number, field: string, value: string) => {
    const updatedProducts = [...formData.productsUsed];
    const operationSize = parseNumber(formData.operationSize);

    if (field === 'productId') {
      updatedProducts[index] = {
        ...updatedProducts[index],
        productId: value,
        lotId: '',
        dose: updatedProducts[index]?.dose || '0',
        quantity: updatedProducts[index]?.dose
          ? (parseNumber(updatedProducts[index].dose) * operationSize).toString().replace('.', ',')
          : '0',
        lotAllocations: updatedProducts[index].isLegacy ? undefined : [],
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
    } else if (field === 'lotId') {
      updatedProducts[index] = {
        ...updatedProducts[index],
        lotId: value,
      };
    }

    setFormData((prev) => ({
      ...prev,
      productsUsed: updatedProducts,
    }));
  };

  const convertToAllocations = (index: number) => {
    const updatedProducts = [...formData.productsUsed];
    const usage = updatedProducts[index];
    if (usage.isLegacy) {
      if (usage.lotId) {
        updatedProducts[index] = {
          ...usage,
          isLegacy: false,
          lotAllocations: [{ lotId: usage.lotId, quantity: usage.quantity }],
          lotId: undefined,
        };
      } else {
        updatedProducts[index] = {
          ...usage,
          isLegacy: false,
          lotAllocations: [{ lotId: '', quantity: usage.quantity }],
          lotId: undefined,
        };
      }
    }
    setFormData((prev) => ({ ...prev, productsUsed: updatedProducts }));
  };

  const handleAllocationChange = (productIndex: number, allocIndex: number, field: 'lotId' | 'quantity', value: string) => {
    const updatedProducts = [...formData.productsUsed];
    const allocations = [...(updatedProducts[productIndex].lotAllocations || [])];

    if (field === 'lotId') {
      allocations[allocIndex] = { ...allocations[allocIndex], lotId: value };
    } else if (field === 'quantity') {
      allocations[allocIndex] = { ...allocations[allocIndex], quantity: formatNumber(value) };
    }

    updatedProducts[productIndex] = { ...updatedProducts[productIndex], lotAllocations: allocations };
    setFormData((prev) => ({ ...prev, productsUsed: updatedProducts }));
  };

  const addAllocation = (productIndex: number) => {
    const updatedProducts = [...formData.productsUsed];
    const allocations = [...(updatedProducts[productIndex].lotAllocations || [])];
    allocations.push({ lotId: '', quantity: '0' });
    updatedProducts[productIndex] = { ...updatedProducts[productIndex], lotAllocations: allocations };
    setFormData((prev) => ({ ...prev, productsUsed: updatedProducts }));
  };

  const removeAllocation = (productIndex: number, allocIndex: number) => {
    const updatedProducts = [...formData.productsUsed];
    const allocations = (updatedProducts[productIndex].lotAllocations || []).filter((_, i) => i !== allocIndex);
    updatedProducts[productIndex] = { ...updatedProducts[productIndex], lotAllocations: allocations };
    setFormData((prev) => ({ ...prev, productsUsed: updatedProducts }));
  };

  const addProductUsage = () => {
    setFormData((prev) => ({
      ...prev,
      productsUsed: [
        ...prev.productsUsed,
        { productId: '', quantity: '0', dose: '0', lotAllocations: [], isLegacy: false },
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

  const getDaysUntilExpiration = (date?: Date): number | null => {
    if (!date) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const exp = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffMs = exp.getTime() - today.getTime();
    return Math.round(diffMs / (1000 * 60 * 60 * 24));
  };

  const getExpirationLabel = (date?: Date): string => {
    const days = getDaysUntilExpiration(date);
    if (days === null) return language === 'pt' ? 'sem validade' : 'no expiry';
    if (days < 0) return language === 'pt' ? `vencido há ${Math.abs(days)} dias` : `expired ${Math.abs(days)} days ago`;
    if (days === 0) return language === 'pt' ? 'vence hoje' : 'expires today';
    if (days <= 30) return language === 'pt' ? `vence em ${days} dias` : `expires in ${days} days`;
    return formatDateForDisplay(date, language === 'pt' ? 'pt-BR' : 'en-US');
  };

  const getExpirationDetail = (date?: Date): { label: string; className: string } => {
    const days = getDaysUntilExpiration(date);
    if (days === null) return { label: language === 'pt' ? 'Sem data de validade' : 'No expiration date', className: 'text-gray-500' };
    if (days < 0) return { label: language === 'pt' ? `Vencido há ${Math.abs(days)} dias` : `Expired ${Math.abs(days)} days ago`, className: 'text-danger-600' };
    if (days === 0) return { label: language === 'pt' ? 'Vence hoje' : 'Expires today', className: 'text-warning-600' };
    if (days <= 30) return { label: language === 'pt' ? `Vence em ${days} dias` : `Expires in ${days} days`, className: 'text-warning-600' };
    return { label: formatDateForDisplay(date, language === 'pt' ? 'pt-BR' : 'en-US'), className: 'text-gray-600' };
  };

  const isExpired = (date?: Date): boolean => {
    const days = getDaysUntilExpiration(date);
    return days !== null && days < 0;
  };

  const isExpiringSoon = (date?: Date): boolean => {
    const days = getDaysUntilExpiration(date);
    return days !== null && days >= 0 && days <= 30;
  };

  const sortLotsForDisplay = (lots: ProductLot[]): ProductLot[] => {
    return [...lots].sort((a, b) => {
      const aDays = getDaysUntilExpiration(a.expirationDate);
      const bDays = getDaysUntilExpiration(b.expirationDate);

      const aExpired = aDays !== null && aDays < 0;
      const bExpired = bDays !== null && bDays < 0;
      if (aExpired && !bExpired) return -1;
      if (!aExpired && bExpired) return 1;

      const aNear = aDays !== null && aDays >= 0 && aDays <= 30;
      const bNear = bDays !== null && bDays >= 0 && bDays <= 30;
      if (aNear && !bNear) return -1;
      if (!aNear && bNear) return 1;

      if (aDays !== null && bDays !== null) {
        if (aExpired && bExpired) return bDays - aDays;
        return aDays - bDays;
      }
      if (aDays !== null && bDays === null) return -1;
      if (aDays === null && bDays !== null) return 1;

      return a.lotNumber.localeCompare(b.lotNumber);
    });
  };

  const getSelectableLots = (allLots: ProductLot[], currentLotId?: string): ProductLot[] => {
    return allLots.filter(lot => lot.quantity > 0 || lot.id === currentLotId);
  };

  const getUntrackedAvailable = (productId: string): number => {
    const product = products.find(p => p.id === productId);
    if (!product) return 0;
    const tracked = getLotsByProductId(productId).reduce((sum, l) => sum + l.quantity, 0);
    const untracked = product.quantityInStock - tracked;
    return untracked < 0 ? 0 : untracked;
  };

  const getAllocationsTotal = (usage: FormProductUsage): number => {
    if (!usage.lotAllocations) return 0;
    return usage.lotAllocations.reduce((sum, a) => sum + parseNumber(a.quantity), 0);
  };

  const applyFEFO = (index: number) => {
    const usage = formData.productsUsed[index];
    const product = products.find(p => p.id === usage.productId);
    if (!product) return;

    const needed = parseNumber(usage.quantity);
    if (needed <= 0) return;

    const allLots = getLotsByProductId(product.id);
    const availableLots = allLots.filter(l => l.quantity > 0);

    const sortedLots = [...availableLots].sort((a, b) => {
      const aDays = getDaysUntilExpiration(a.expirationDate);
      const bDays = getDaysUntilExpiration(b.expirationDate);
      if (aDays !== null && bDays !== null) return aDays - bDays;
      if (aDays !== null && bDays === null) return -1;
      if (aDays === null && bDays !== null) return 1;
      return a.lotNumber.localeCompare(b.lotNumber);
    });

    const allocations: FormLotAllocation[] = [];
    let remaining = needed;

    for (const lot of sortedLots) {
      if (remaining <= 0) break;
      const take = Math.min(lot.quantity, remaining);
      allocations.push({ lotId: lot.id, quantity: take.toString().replace('.', ',') });
      remaining -= take;
    }

    if (remaining > 0) {
      const untracked = getUntrackedAvailable(product.id);
      if (untracked > 0) {
        const take = Math.min(untracked, remaining);
        allocations.push({ lotId: '', quantity: take.toString().replace('.', ',') });
        remaining -= take;
      }
    }

    const updatedProducts = [...formData.productsUsed];
    updatedProducts[index] = {
      ...usage,
      lotAllocations: allocations,
    };
    setFormData(prev => ({ ...prev, productsUsed: updatedProducts }));
  };

  const handleFefoToggle = (index: number) => {
    const isChecked = fefoChecked[index] || false;

    if (isChecked) {
      setFefoChecked(prev => { const n = [...prev]; n[index] = false; return n; });
      setFefoApplied(prev => { const n = [...prev]; n[index] = false; return n; });
      return;
    }

    const usage = formData.productsUsed[index];
    if (!usage.productId || usage.isLegacy) return;

    const hasAllocations = (usage.lotAllocations || []).some(a => parseNumber(a.quantity) > 0);

    if (hasAllocations) {
      setShowFefoReconfirm(true);
      setFefoReconfirmIndex(index);
      return;
    }

    if (hideFefoWarningStored) {
      setFefoChecked(prev => { const n = [...prev]; n[index] = true; return n; });
      applyFEFO(index);
      setFefoApplied(prev => { const n = [...prev]; n[index] = true; return n; });
    } else {
      setShowFefoWarning(true);
      setFefoPendingIndex(index);
    }
  };

  const handleFefoWarningContinue = () => {
    const index = fefoPendingIndex;
    if (index === null) return;

    if (dontShowFefoWarning) {
      try { localStorage.setItem('agriGest_hide_fefo_warning', 'true'); } catch { /* ignore */ }
    }

    setFefoChecked(prev => { const n = [...prev]; n[index] = true; return n; });
    applyFEFO(index);
    setFefoApplied(prev => { const n = [...prev]; n[index] = true; return n; });

    setShowFefoWarning(false);
    setFefoPendingIndex(null);
    setDontShowFefoWarning(false);
  };

  const handleFefoWarningCancel = () => {
    setShowFefoWarning(false);
    setFefoPendingIndex(null);
    setDontShowFefoWarning(false);
  };

  const handleFefoReconfirmContinue = () => {
    const index = fefoReconfirmIndex;
    if (index === null) return;

    setFefoChecked(prev => { const n = [...prev]; n[index] = true; return n; });
    applyFEFO(index);
    setFefoApplied(prev => { const n = [...prev]; n[index] = true; return n; });

    setShowFefoReconfirm(false);
    setFefoReconfirmIndex(null);
  };

  const handleFefoReconfirmCancel = () => {
    setShowFefoReconfirm(false);
    setFefoReconfirmIndex(null);
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

      if (!usage.isLegacy && usage.lotAllocations && usage.lotAllocations.length > 0) {
        const allocTotal = getAllocationsTotal(usage);
        const qtyTotal = parseNumber(usage.quantity);
        if (Math.abs(allocTotal - qtyTotal) > 0.000001) {
          newErrors[`allocTotal-${index}`] = language === 'pt'
            ? `Distribuição (${allocTotal}) não corresponde à quantidade (${qtyTotal})`
            : `Distribution (${allocTotal}) does not match quantity (${qtyTotal})`;
        }

        const seenLotIds: string[] = [];
        let nullCount = 0;
        usage.lotAllocations.forEach((alloc, aIdx) => {
          if (parseNumber(alloc.quantity) <= 0) {
            newErrors[`allocQty-${index}-${aIdx}`] = language === 'pt' ? 'Quantidade deve ser maior que 0' : 'Quantity must be greater than 0';
          }
          if (!alloc.lotId) {
            nullCount++;
            if (nullCount > 1) {
              newErrors[`allocLot-${index}-${aIdx}`] = language === 'pt' ? 'Apenas uma origem sem lote' : 'Only one no-lot source';
            }
          } else {
            if (seenLotIds.includes(alloc.lotId)) {
              newErrors[`allocLot-${index}-${aIdx}`] = language === 'pt' ? 'Lote duplicado' : 'Duplicate lot';
            }
            seenLotIds.push(alloc.lotId);
          }
        });
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
      productsUsed: formData.productsUsed.map(usage => {
        if (usage.isLegacy) {
          return {
            productId: usage.productId,
            quantity: parseNumber(usage.quantity),
            dose: parseNumber(usage.dose),
            lotId: usage.lotId,
          };
        }
        return {
          productId: usage.productId,
          quantity: parseNumber(usage.quantity),
          dose: parseNumber(usage.dose),
          lotAllocations: (usage.lotAllocations || []).map(alloc => ({
            lotId: alloc.lotId || null,
            quantity: parseNumber(alloc.quantity),
          })).filter(alloc => alloc.quantity > 0),
        };
      }) as ProductUsage[],
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
              className="text-brand-700 hover:text-brand-800"
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
                  const isChecked = e.target.checked;
                  setIsOperationSizeEditable(isChecked);

                  if (!isChecked) {
                    const selectedArea = areas.find(area => area.id === formData.areaId);
                    if (selectedArea) {
                      const newSize = selectedArea.size;
                      setFormData(prev => ({
                        ...prev,
                        operationSize: newSize.toString(),
                        productsUsed: prev.productsUsed.map(usage => ({
                          ...usage,
                          quantity: (parseNumber(usage.dose) * newSize).toString().replace('.', ',')
                        }))
                      }));
                    }
                  }
                }}
                className="rounded border-gray-300 text-brand-600 shadow-sm focus:border-brand-300 focus:ring focus:ring-brand-200 focus:ring-opacity-50 mr-2"
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
          const availableLots = product ? getLotsByProductId(product.id) : [];

          return (
            <div key={index} className="mb-4 p-4 bg-gray-50 rounded-md">
              <div className="flex items-start space-x-4 mb-3">
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
                    className="text-danger-600 hover:text-danger-700 hover:bg-danger-50"
                  />
                </div>
              </div>

              {product && (
                <p className="text-xs text-gray-500 mb-2">
                  {language === 'pt' ? 'Produto histórico indisponível' : 'Historical product unavailable'}
                </p>
              )}

              {usage.isLegacy ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {language === 'pt' ? 'Lote' : 'Lot'}
                      </label>
                      <select
                        value={usage.lotId || ''}
                        onChange={(e) => handleProductChange(index, 'lotId', e.target.value)}
                        disabled={!product || availableLots.length === 0}
                        className={`w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 ${(!product || availableLots.length === 0) ? 'bg-gray-100 text-gray-400' : ''}`}
                      >
                        <option value="">
                          {availableLots.length === 0
                            ? (language === 'pt' ? 'Sem lotes' : 'No lots')
                            : (language === 'pt' ? 'Selecione um lote' : 'Select a lot')}
                        </option>
                        {sortLotsForDisplay(getSelectableLots(availableLots, usage.lotId)).map(lot => {
                          const expLabel = getExpirationLabel(lot.expirationDate);
                          return (
                            <option key={lot.id} value={lot.id}>
                              {lot.lotNumber} — {lot.quantity} {product?.unit} — {expLabel}
                            </option>
                          );
                        })}
                        {usage.lotId && !availableLots.find(l => l.id === usage.lotId) && (
                          <option value={usage.lotId}>
                            {language === 'pt' ? 'Lote histórico indisponível' : 'Historical lot unavailable'}
                          </option>
                        )}
                      </select>
                      {(() => {
                        if (!usage.lotId) return null;
                        const selectedLot = availableLots.find(l => l.id === usage.lotId);
                        if (!selectedLot) return null;
                        const expDetail = getExpirationDetail(selectedLot.expirationDate);
                        return (
                          <div className="mt-1 text-xs space-y-0.5">
                            <p className="text-gray-600">{language === 'pt' ? 'Lote' : 'Lot'}: {selectedLot.lotNumber}</p>
                            <p className="text-gray-600">{language === 'pt' ? 'Disponível' : 'Available'}: {selectedLot.quantity} {product?.unit}</p>
                            {selectedLot.expirationDate && (
                              <p className="text-gray-600">{language === 'pt' ? 'Validade' : 'Expiry'}: {formatDateForDisplay(selectedLot.expirationDate, language === 'pt' ? 'pt-BR' : 'en-US')}</p>
                            )}
                            <p className={expDetail.className}>{expDetail.label}</p>
                          </div>
                        );
                      })()}
                    </div>
                    <div className="pt-7">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        leftIcon={<Layers size={14} />}
                        onClick={() => convertToAllocations(index)}
                      >
                        {language === 'pt' ? 'Distribuir entre lotes' : 'Split across lots'}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 border-t border-gray-200 pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">
                      {language === 'pt' ? 'Origem do estoque' : 'Stock source'}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      leftIcon={<Plus size={14} />}
                      onClick={() => addAllocation(index)}
                      disabled={!product}
                    >
                      {language === 'pt' ? 'Adicionar origem' : 'Add source'}
                    </Button>
                  </div>

                  {product && !usage.isLegacy && (
                    <div className="flex items-center gap-2 py-1">
                      <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={fefoChecked[index] || false}
                          onChange={() => handleFefoToggle(index)}
                          className="rounded border-gray-300 text-brand-600 shadow-sm focus:border-brand-300 focus:ring focus:ring-brand-200 focus:ring-opacity-50"
                        />
                        {language === 'pt'
                          ? 'Distribuir automaticamente pelos lotes (prioriza os que vencem primeiro)'
                          : 'Auto-distribute across lots (prioritizes soonest expiry)'}
                      </label>
                    </div>
                  )}

                  {fefoApplied[index] && (() => {
                    const total = getAllocationsTotal(usage);
                    const needed = parseNumber(usage.quantity);
                    if (total < needed - 0.000001) {
                      return (
                        <p className="text-xs text-warning-700 bg-warning-50 px-3 py-1.5 rounded">
                          {language === 'pt'
                            ? `Estoque disponível insuficiente para distribuir a quantidade necessária. Distribuído: ${total} de ${needed}`
                            : `Insufficient stock to distribute the required quantity. Distributed: ${total} of ${needed}`}
                        </p>
                      );
                    }
                    return (
                      <p className="text-xs text-brand-600 bg-brand-50 px-3 py-1.5 rounded">
                        {language === 'pt'
                          ? 'Distribuição automática FEFO aplicada. Confira os lotes antes de salvar.'
                          : 'Automatic FEFO distribution applied. Review lots before saving.'}
                      </p>
                    );
                  })()}

                  {(usage.lotAllocations || []).map((alloc, aIdx) => {
                    const allocLot = alloc.lotId ? availableLots.find(l => l.id === alloc.lotId) : null;
                    const isHistoricalLot = alloc.lotId && !allocLot;
                    const isNoLot = !alloc.lotId;

                    return (
                      <div key={aIdx} className="flex items-start gap-2">
                        <div className="flex-1">
                          <select
                            value={alloc.lotId}
                            onChange={(e) => handleAllocationChange(index, aIdx, 'lotId', e.target.value)}
                            disabled={!product}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm"
                          >
                            <option value="">
                              {language === 'pt' ? 'Sem lote' : 'No lot'}
                            </option>
                            {sortLotsForDisplay(getSelectableLots(availableLots, alloc.lotId)).map(lot => {
                              const expLabel = getExpirationLabel(lot.expirationDate);
                              return (
                                <option key={lot.id} value={lot.id}>
                                  {lot.lotNumber} — {lot.quantity} {product?.unit} — {expLabel}
                                </option>
                              );
                            })}
                            {isHistoricalLot && (
                              <option value={alloc.lotId}>
                                {language === 'pt' ? 'Lote histórico indisponível' : 'Historical lot unavailable'}
                              </option>
                            )}
                          </select>
                          {isNoLot && (
                            <div className="mt-1 text-xs space-y-0.5">
                              <p className="text-gray-600">{language === 'pt' ? 'Sem lote identificado' : 'No lot identified'}</p>
                              <p className="text-gray-600">{language === 'pt' ? 'Disponível' : 'Available'}: {getUntrackedAvailable(usage.productId)} {product?.unit || ''}</p>
                            </div>
                          )}
                          {allocLot && (() => {
                            const expDetail = getExpirationDetail(allocLot.expirationDate);
                            return (
                              <div className="mt-1 text-xs space-y-0.5">
                                <p className="text-gray-600">{language === 'pt' ? 'Lote' : 'Lot'}: {allocLot.lotNumber}</p>
                                <p className="text-gray-600">{language === 'pt' ? 'Disponível' : 'Available'}: {allocLot.quantity} {product?.unit || ''}</p>
                                {allocLot.expirationDate && (
                                  <p className="text-gray-600">{language === 'pt' ? 'Validade' : 'Expiry'}: {formatDateForDisplay(allocLot.expirationDate, language === 'pt' ? 'pt-BR' : 'en-US')}</p>
                                )}
                                <p className={expDetail.className}>{expDetail.label}</p>
                              </div>
                            );
                          })()}
                          {isHistoricalLot && (
                            <p className="text-xs text-gray-500 mt-1">
                              {language === 'pt' ? 'Lote histórico indisponível' : 'Historical lot unavailable'}
                            </p>
                          )}
                        </div>

                        <div className="w-32">
                          <Input
                            name={`allocQty-${index}-${aIdx}`}
                            type="text"
                            inputMode="decimal"
                            value={alloc.quantity}
                            onChange={(e) => handleAllocationChange(index, aIdx, 'quantity', e.target.value)}
                            error={errors[`allocQty-${index}-${aIdx}`]}
                            className="text-sm"
                          />
                        </div>

                        <div className="pt-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={language === 'pt' ? 'Remover origem' : 'Remove source'}
                            leftIcon={<X size={14} />}
                            onClick={() => removeAllocation(index, aIdx)}
                            className="text-danger-600 hover:text-danger-700 hover:bg-danger-50"
                          />
                        </div>
                      </div>
                    );
                  })}

                  {(usage.lotAllocations || []).length === 0 && (
                    <p className="text-sm text-gray-500 italic">
                      {language === 'pt'
                        ? 'Nenhuma origem adicionada. Adicione pelo menos uma origem.'
                        : 'No source added. Add at least one source.'}
                    </p>
                  )}

                  {(() => {
                    const total = getAllocationsTotal(usage);
                    const qty = parseNumber(usage.quantity);
                    const diff = total - qty;
                    if (usage.lotAllocations && usage.lotAllocations.length > 0) {
                      if (Math.abs(diff) < 0.000001) {
                        return (
                          <p className="text-sm text-green-600 font-medium">
                            {language === 'pt' ? 'Distribuição completa' : 'Distribution complete'}: {total} / {qty} {product?.unit || ''}
                          </p>
                        );
                      } else if (diff < 0) {
                        return (
                          <p className="text-sm text-orange-600 font-medium">
                            {language === 'pt' ? `Falta distribuir ${Math.abs(diff).toFixed(2)}` : `Missing ${Math.abs(diff).toFixed(2)}`}: {total} / {qty} {product?.unit || ''}
                          </p>
                        );
                      } else {
                        return (
                          <p className="text-sm text-danger-600 font-medium">
                            {language === 'pt' ? `Excede em ${diff.toFixed(2)}` : `Exceeds by ${diff.toFixed(2)}`}: {total} / {qty} {product?.unit || ''}
                          </p>
                        );
                      }
                    }
                    return null;
                  })()}

                  {errors[`allocTotal-${index}`] && (
                    <p className="text-sm text-danger-600">{errors[`allocTotal-${index}`]}</p>
                  )}
                </div>
              )}
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
          className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
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
          disabled={!isOnline}
        >
          {isEditing
            ? (language === 'pt' ? 'Atualizar Operação' : 'Update Operation')
            : (language === 'pt' ? 'Criar Operação' : 'Create Operation')}
        </Button>
      </div>

      {showFefoWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={handleFefoWarningCancel}>
          <div className="bg-white rounded-lg p-6 max-w-md mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle size={24} className="text-warning-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-gray-700">
                {language === 'pt'
                  ? 'A seleção será automática, portanto atente-se a usar produtos com prazo de validade mais curto primeiro.'
                  : 'The selection will be automatic, so please pay attention to using products with shorter expiration dates first.'}
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-600 mb-4">
              <input
                type="checkbox"
                checked={dontShowFefoWarning}
                onChange={(e) => setDontShowFefoWarning(e.target.checked)}
                className="rounded border-gray-300 text-brand-600 shadow-sm focus:border-brand-300 focus:ring focus:ring-brand-200 focus:ring-opacity-50"
              />
              {language === 'pt' ? 'Não exibir novamente este aviso' : "Don't show this warning again"}
            </label>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" size="sm" onClick={handleFefoWarningCancel}>
                {language === 'pt' ? 'Cancelar' : 'Cancel'}
              </Button>
              <Button type="button" size="sm" onClick={handleFefoWarningContinue}>
                {language === 'pt' ? 'Continuar' : 'Continue'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showFefoReconfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={handleFefoReconfirmCancel}>
          <div className="bg-white rounded-lg p-6 max-w-md mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle size={24} className="text-warning-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-gray-700">
                {language === 'pt'
                  ? 'A distribuição automática substituirá a distribuição atual deste produto. Deseja continuar?'
                  : 'Automatic distribution will replace the current distribution for this product. Continue?'}
              </p>
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" size="sm" onClick={handleFefoReconfirmCancel}>
                {language === 'pt' ? 'Cancelar' : 'Cancel'}
              </Button>
              <Button type="button" size="sm" onClick={handleFefoReconfirmContinue}>
                {language === 'pt' ? 'Redistribuir' : 'Redistribute'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
};

export default OperationForm;
