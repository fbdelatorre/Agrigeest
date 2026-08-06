import React, { useState } from 'react';
import { Product, ProductLot } from '../../types';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { Save, X, Plus, Pencil, Trash2, Package, AlertTriangle, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useAppContext } from '../../context/AppContext';
import LotManager from './LotManager';
import { dateToInputValue, inputValueToDate, formatDateForDisplay } from '../../utils/dateHelpers';

export interface PendingLot {
  tempId: string;
  lotNumber: string;
  quantity: string;
  expirationDate: string;
}

interface ProductFormProps {
  initialData?: Partial<Product>;
  onSubmit: (data: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>, pendingLots?: PendingLot[]) => void;
  isEditing?: boolean;
}

interface LotFormData {
  tempId?: string;
  lotNumber: string;
  quantity: string;
  expirationDate: string;
}

const ProductForm: React.FC<ProductFormProps> = ({
  initialData = {},
  onSubmit,
  isEditing = false,
}) => {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const { products, productLots } = useAppContext();

  const [formData, setFormData] = useState({
    name: initialData.name || '',
    category: initialData.category || '',
    unit: initialData.unit || '',
    minStockLevel: initialData.minStockLevel?.toString() || '0',
    price: initialData.price?.toString() || '',
    supplier: initialData.supplier || '',
    description: initialData.description || '',
  });

  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategory, setNewCategory] = useState('');

  // Pending lots for new product creation
  const [pendingLots, setPendingLots] = useState<PendingLot[]>([]);
  const [showLotForm, setShowLotForm] = useState(false);
  const [editingLotTempId, setEditingLotTempId] = useState<string | null>(null);
  const [lotForm, setLotForm] = useState<LotFormData>({ lotNumber: '', quantity: '', expirationDate: '' });
  const [lotErrors, setLotErrors] = useState<Record<string, string>>({});

  const existingCategories = React.useMemo(() => {
    const categories = products
      .map(product => product.category)
      .filter(category => category && category.trim() !== '');
    return [...new Set(categories)].sort();
  }, [products]);

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

  const handleAddNewCategory = () => {
    if (newCategory.trim()) {
      setFormData(prev => ({ ...prev, category: newCategory.trim() }));
      setNewCategory('');
      setShowNewCategoryInput(false);
    }
  };

  // --- Pending lot management (for new product creation) ---

  const isExpiringSoon = (dateStr: string): boolean => {
    if (!dateStr) return false;
    const date = inputValueToDate(dateStr);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 60;
  };

  const isExpired = (dateStr: string): boolean => {
    if (!dateStr) return false;
    const date = inputValueToDate(dateStr);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return date < now;
  };

  const handleAddPendingLot = () => {
    setEditingLotTempId(null);
    setLotForm({ lotNumber: '', quantity: '', expirationDate: '' });
    setLotErrors({});
    setShowLotForm(true);
  };

  const handleEditPendingLot = (lot: PendingLot) => {
    setEditingLotTempId(lot.tempId);
    setLotForm({
      tempId: lot.tempId,
      lotNumber: lot.lotNumber,
      quantity: lot.quantity,
      expirationDate: lot.expirationDate,
    });
    setLotErrors({});
    setShowLotForm(true);
  };

  const handleCancelLotForm = () => {
    setShowLotForm(false);
    setEditingLotTempId(null);
    setLotForm({ lotNumber: '', quantity: '', expirationDate: '' });
    setLotErrors({});
  };

  const validateLot = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!lotForm.lotNumber.trim()) {
      newErrors.lotNumber = language === 'pt' ? 'Número do lote é obrigatório' : 'Lot number is required';
    }
    if (!lotForm.quantity.trim()) {
      newErrors.quantity = language === 'pt' ? 'Quantidade é obrigatória' : 'Quantity is required';
    } else if (isNaN(Number(lotForm.quantity)) || Number(lotForm.quantity) < 0) {
      newErrors.quantity = language === 'pt' ? 'Quantidade deve ser um número não negativo' : 'Quantity must be a non-negative number';
    }
    setLotErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmitPendingLot = () => {
    if (!validateLot()) return;

    if (editingLotTempId) {
      setPendingLots(prev => prev.map(l =>
        l.tempId === editingLotTempId
          ? { ...l, lotNumber: lotForm.lotNumber.trim(), quantity: lotForm.quantity, expirationDate: lotForm.expirationDate }
          : l
      ));
    } else {
      const newLot: PendingLot = {
        tempId: `temp-${Date.now()}`,
        lotNumber: lotForm.lotNumber.trim(),
        quantity: lotForm.quantity,
        expirationDate: lotForm.expirationDate,
      };
      setPendingLots(prev => [newLot, ...prev]);
    }
    handleCancelLotForm();
  };

  const handleDeletePendingLot = (tempId: string) => {
    setPendingLots(prev => prev.filter(l => l.tempId !== tempId));
  };

  const pendingLotsTotal = pendingLots.reduce((sum, l) => sum + Number(l.quantity), 0);

  const validate = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.name.trim()) {
      newErrors.name = language === 'pt' ? 'Nome é obrigatório' : 'Name is required';
    }

    if (!formData.category.trim()) {
      newErrors.category = language === 'pt' ? 'Categoria é obrigatória' : 'Category is required';
    }

    if (!formData.unit.trim()) {
      newErrors.unit = language === 'pt' ? 'Unidade é obrigatória' : 'Unit is required';
    }

    if (!formData.minStockLevel.trim()) {
      newErrors.minStockLevel = language === 'pt' ? 'Nível mínimo de estoque é obrigatório' : 'Minimum stock level is required';
    } else if (isNaN(Number(formData.minStockLevel)) || Number(formData.minStockLevel) < 0) {
      newErrors.minStockLevel = language === 'pt' ? 'Nível mínimo deve ser um número não negativo' : 'Minimum stock level must be a non-negative number';
    }

    if (!formData.price.trim()) {
      newErrors.price = language === 'pt' ? 'Preço é obrigatório' : 'Price is required';
    } else if (isNaN(Number(formData.price)) || Number(formData.price) <= 0) {
      newErrors.price = language === 'pt' ? 'Preço deve ser um número positivo' : 'Price must be a positive number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    const totalFromLots = isEditing && initialData.id
      ? productLots
          .filter(l => l.productId === initialData.id)
          .reduce((sum, l) => sum + l.quantity, 0)
      : pendingLotsTotal;

    onSubmit({
      ...formData,
      quantityInStock: totalFromLots,
      minStockLevel: Number(formData.minStockLevel),
      price: Number(formData.price),
    }, !isEditing ? pendingLots : undefined);
  };

  const categoryOptions = existingCategories.map(category => ({
    value: category,
    label: category
  }));

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Input
          name="name"
          label={language === 'pt' ? 'Nome do Produto' : 'Product Name'}
          value={formData.name}
          onChange={handleChange}
          placeholder={language === 'pt' ? 'ex: Sementes de Milho Premium' : 'e.g., Premium Corn Seeds'}
          error={errors.name}
          required
        />

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-700">
              {language === 'pt' ? 'Categoria' : 'Category'}
            </label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowNewCategoryInput(true)}
              leftIcon={<Plus size={16} />}
              className="text-green-700 hover:text-green-800"
            >
              {language === 'pt' ? 'Nova Categoria' : 'New Category'}
            </Button>
          </div>

          {showNewCategoryInput ? (
            <div className="flex gap-2">
              <Input
                name="newCategory"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder={language === 'pt' ? 'Digite nova categoria' : 'Enter new category'}
                className="flex-1"
              />
              <Button
                type="button"
                onClick={handleAddNewCategory}
                size="sm"
              >
                {language === 'pt' ? 'Adicionar' : 'Add'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowNewCategoryInput(false);
                  setNewCategory('');
                }}
              >
                {language === 'pt' ? 'Cancelar' : 'Cancel'}
              </Button>
            </div>
          ) : (
            <Select
              name="category"
              value={formData.category}
              onChange={handleChange}
              options={[
                {
                  value: '',
                  label: language === 'pt' ? 'Selecione uma categoria' : 'Select a category'
                },
                ...categoryOptions
              ]}
              error={errors.category}
              required
            />
          )}
        </div>

        <Input
          name="unit"
          label={language === 'pt' ? 'Unidade de Medida' : 'Unit of Measurement'}
          value={formData.unit}
          onChange={handleChange}
          placeholder={language === 'pt' ? 'ex: kg, L, saco' : 'e.g., kg, L, bag'}
          error={errors.unit}
          required
        />

        <Input
          name="price"
          label={language === 'pt' ? 'Preço por Unidade' : 'Price per Unit'}
          type="number"
          min="0.01"
          step="0.01"
          value={formData.price}
          onChange={handleChange}
          placeholder={language === 'pt' ? 'ex: 25,99' : 'e.g., 25.99'}
          error={errors.price}
          required
        />

        <Input
          name="minStockLevel"
          label={language === 'pt' ? 'Nível Mínimo de Estoque' : 'Minimum Stock Level'}
          type="number"
          min="0"
          value={formData.minStockLevel}
          onChange={handleChange}
          error={errors.minStockLevel}
          required
        />

        <Input
          name="supplier"
          label={language === 'pt' ? 'Fornecedor (opcional)' : 'Supplier (optional)'}
          value={formData.supplier}
          onChange={handleChange}
          placeholder={language === 'pt' ? 'ex: AgriSeed Ltda.' : 'e.g., AgriSeed Inc.'}
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
          placeholder={language === 'pt' ? 'Digite detalhes adicionais sobre este produto...' : 'Enter any additional details about this product...'}
        />
      </div>

      {/* Lot management section */}
      {isEditing && initialData.id ? (
        <div className="border-t border-gray-200 pt-6">
          <LotManager productId={initialData.id} />
          <p className="text-sm text-gray-500 mt-3">
            {language === 'pt'
              ? 'A quantidade total em estoque é calculada automaticamente pela soma dos lotes.'
              : 'The total stock quantity is automatically calculated from the sum of all lots.'}
          </p>
        </div>
      ) : (
        <div className="border-t border-gray-200 pt-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900 flex items-center">
              <Package size={20} className="mr-2 text-green-700" />
              {language === 'pt' ? 'Lotes do Produto' : 'Product Lots'}
            </h3>
            {!showLotForm && (
              <Button type="button" variant="secondary" size="sm" leftIcon={<Plus size={16} />} onClick={handleAddPendingLot}>
                {language === 'pt' ? 'Adicionar Lote' : 'Add Lot'}
              </Button>
            )}
          </div>

          {showLotForm && (
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input
                  name="lotNumber"
                  label={language === 'pt' ? 'Número do Lote' : 'Lot Number'}
                  value={lotForm.lotNumber}
                  onChange={(e) => setLotForm(prev => ({ ...prev, lotNumber: e.target.value }))}
                  placeholder={language === 'pt' ? 'ex: Lote 001' : 'e.g., Lot 001'}
                  error={lotErrors.lotNumber}
                  required
                />
                <Input
                  name="lotQuantity"
                  label={language === 'pt' ? 'Quantidade' : 'Quantity'}
                  type="number"
                  min="0"
                  step="0.01"
                  value={lotForm.quantity}
                  onChange={(e) => setLotForm(prev => ({ ...prev, quantity: e.target.value }))}
                  error={lotErrors.quantity}
                  required
                />
                <Input
                  name="lotExpiration"
                  label={language === 'pt' ? 'Data de Validade' : 'Expiration Date'}
                  type="date"
                  value={lotForm.expirationDate}
                  onChange={(e) => setLotForm(prev => ({ ...prev, expirationDate: e.target.value }))}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" leftIcon={<X size={16} />} onClick={handleCancelLotForm}>
                  {language === 'pt' ? 'Cancelar' : 'Cancel'}
                </Button>
                <Button type="button" size="sm" leftIcon={<Save size={16} />} onClick={handleSubmitPendingLot}>
                  {editingLotTempId
                    ? (language === 'pt' ? 'Atualizar Lote' : 'Update Lot')
                    : (language === 'pt' ? 'Salvar Lote' : 'Save Lot')}
                </Button>
              </div>
            </div>
          )}

          {pendingLots.length > 0 ? (
            <div className="space-y-2">
              {pendingLots.map(lot => {
                const expired = isExpired(lot.expirationDate);
                const expiringSoon = isExpiringSoon(lot.expirationDate);

                return (
                  <div key={lot.tempId} className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:shadow-sm transition-shadow">
                    <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-2 items-center">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{lot.lotNumber}</div>
                        <div className="text-xs text-gray-500">{language === 'pt' ? 'Lote' : 'Lot'}</div>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">{lot.quantity} {formData.unit}</div>
                        <div className="text-xs text-gray-500">{language === 'pt' ? 'Quantidade' : 'Quantity'}</div>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {lot.expirationDate ? formatDateForDisplay(inputValueToDate(lot.expirationDate), language === 'pt' ? 'pt-BR' : 'en-US') : '—'}
                        </div>
                        <div className="text-xs text-gray-500">{language === 'pt' ? 'Validade' : 'Expiration'}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {expired && (
                          <Badge variant="danger" className="flex items-center gap-1">
                            <AlertTriangle size={12} />
                            {language === 'pt' ? 'Vencido' : 'Expired'}
                          </Badge>
                        )}
                        {!expired && expiringSoon && (
                          <Badge variant="warning" className="flex items-center gap-1">
                            <AlertTriangle size={12} />
                            {language === 'pt' ? 'Vence em breve' : 'Expiring soon'}
                          </Badge>
                        )}
                        {!expired && !expiringSoon && lot.expirationDate && (
                          <Badge variant="success">
                            {language === 'pt' ? 'Válido' : 'Valid'}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-4">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={language === 'pt' ? 'Editar lote' : 'Edit lot'}
                        leftIcon={<Pencil size={14} />}
                        onClick={() => handleEditPendingLot(lot)}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={language === 'pt' ? 'Excluir lote' : 'Delete lot'}
                        leftIcon={<Trash2 size={14} />}
                        onClick={() => handleDeletePendingLot(lot.tempId)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      />
                    </div>
                  </div>
                );
              })}
              <div className="flex justify-end pt-2 border-t border-gray-200">
                <div className="text-sm font-medium text-gray-700">
                  {language === 'pt' ? 'Quantidade Total: ' : 'Total Quantity: '}
                  {pendingLotsTotal} {formData.unit}
                </div>
              </div>
            </div>
          ) : (
            !showLotForm && (
              <div className="text-center py-6 bg-gray-50 rounded-lg text-gray-500">
                <p className="text-sm">
                  {language === 'pt'
                    ? 'Nenhum lote adicionado. Clique em "Adicionar Lote" para incluir lotes com suas quantidades e validades.'
                    : 'No lots added. Click "Add Lot" to include lots with their quantities and expiration dates.'}
                </p>
              </div>
            )
          )}

          <p className="text-sm text-gray-500">
            {language === 'pt'
              ? 'A quantidade total em estoque será calculada automaticamente pela soma dos lotes.'
              : 'The total stock quantity will be automatically calculated from the sum of all lots.'}
          </p>
        </div>
      )}

      <div className="flex justify-end space-x-4">
        <Button
          type="button"
          variant="outline"
          leftIcon={<X size={18} />}
          onClick={() => navigate('/inventory')}
        >
          {language === 'pt' ? 'Cancelar' : 'Cancel'}
        </Button>
        <Button
          type="submit"
          leftIcon={<Save size={18} />}
        >
          {isEditing
            ? (language === 'pt' ? 'Atualizar Produto' : 'Update Product')
            : (language === 'pt' ? 'Criar Produto' : 'Create Product')}
        </Button>
      </div>
    </form>
  );
};

export default ProductForm;
