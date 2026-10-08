import React, { useState, useRef } from 'react';
import { ProductLot } from '../../types';
import { useAppContext } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Badge from '../ui/Badge';
import { Plus, Pencil, Trash2, X, Save, AlertTriangle, Package, Archive } from 'lucide-react';
import { dateToInputValue, inputValueToDate, formatDateForDisplay } from '../../utils/dateHelpers';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';

interface LotManagerProps {
  productId: string;
}

interface LotFormData {
  id?: string;
  lotNumber: string;
  quantity: string;
  expirationDate: string;
}

const LotManager: React.FC<LotManagerProps> = ({ productId }) => {
  const { getLotsByProductId, addLot, updateLot, deleteLot, getProductById, archiveLot } = useAppContext();
  const { language } = useLanguage();
  const { isOnline } = useNetworkStatus();

  const lots = getLotsByProductId(productId);
  const product = getProductById(productId);
  const totalStock = product?.quantityInStock ?? 0;
  const trackedStock = lots.reduce((sum, lot) => sum + lot.quantity, 0);
  const untrackedStock = totalStock - trackedStock;

  const [showForm, setShowForm] = useState(false);
  const [editingLotId, setEditingLotId] = useState<string | null>(null);
  const [editingOriginalQuantity, setEditingOriginalQuantity] = useState<number | null>(null);
  const [lotForm, setLotForm] = useState<LotFormData>({
    lotNumber: '',
    quantity: '',
    expirationDate: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const [isArchiving, setIsArchiving] = useState(false);

  const handleArchiveLot = async (lotId: string) => {
    if (window.confirm(language === 'pt' ? 'Arquivar este lote? O lote deve estar com quantidade zero. O histórico do ledger será preservado.' : 'Archive this lot? The lot must have zero quantity. Ledger history will be preserved.')) {
      setIsArchiving(true);
      try {
        await archiveLot(lotId);
      } catch (error) {
        const msg = error instanceof Error ? error.message : '';
        if (msg.includes('LOT_NOT_EMPTY')) {
          alert(language === 'pt' ? 'Não é possível arquivar um lote com quantidade maior que zero.' : 'Cannot archive a lot with quantity greater than zero.');
        } else if (msg.includes('LOT_ALREADY_ARCHIVED')) {
          alert(language === 'pt' ? 'Este lote já está arquivado.' : 'This lot is already archived.');
        } else {
          console.error('Error archiving lot:', error);
        }
      } finally {
        setIsArchiving(false);
      }
    }
  };

  const isExpiringSoon = (date?: Date): boolean => {
    if (!date) return false;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 60;
  };

  const isExpired = (date?: Date): boolean => {
    if (!date) return false;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return date < now;
  };

  const handleAddLot = () => {
    setEditingLotId(null);
    setLotForm({ lotNumber: '', quantity: '', expirationDate: '' });
    setErrors({});
    setShowForm(true);
  };

  const handleEditLot = (lot: ProductLot) => {
    setEditingLotId(lot.id);
    setEditingOriginalQuantity(lot.quantity);
    setLotForm({
      id: lot.id,
      lotNumber: lot.lotNumber,
      quantity: lot.quantity.toString(),
      expirationDate: lot.expirationDate ? dateToInputValue(lot.expirationDate) : '',
    });
    setErrors({});
    setShowForm(true);
  };

  const handleCancelForm = () => {
    setShowForm(false);
    setEditingLotId(null);
    setEditingOriginalQuantity(null);
    setLotForm({ lotNumber: '', quantity: '', expirationDate: '' });
    setErrors({});
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    const trimmedNumber = lotForm.lotNumber.trim();
    if (!trimmedNumber) {
      newErrors.lotNumber = language === 'pt' ? 'Número do lote é obrigatório' : 'Lot number is required';
    } else {
      const duplicateLot = lots.find(l => 
        l.lotNumber.trim().toLowerCase() === trimmedNumber.toLowerCase() && l.id !== editingLotId
      );
      if (duplicateLot) {
        newErrors.lotNumber = language === 'pt'
          ? 'Já existe um lote com esse número para este produto.'
          : 'A lot with this number already exists for this product.';
      }
    }
    if (!lotForm.quantity.trim()) {
      newErrors.quantity = language === 'pt' ? 'Quantidade é obrigatória' : 'Quantity is required';
    } else if (isNaN(Number(lotForm.quantity)) || Number(lotForm.quantity) < 0) {
      newErrors.quantity = language === 'pt' ? 'Quantidade deve ser um número não negativo' : 'Quantity must be a non-negative number';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmitLot = async () => {
    if (submittingRef.current) return;
    if (!validate()) return;
    submittingRef.current = true;
    setIsSubmitting(true);

    try {
      const lotData = {
        productId,
        lotNumber: lotForm.lotNumber.trim(),
        quantity: Number(lotForm.quantity),
        expirationDate: lotForm.expirationDate ? inputValueToDate(lotForm.expirationDate) : undefined,
      };

      if (editingLotId) {
        await updateLot(editingLotId, lotData, editingOriginalQuantity ?? undefined);
      } else {
        await addLot(lotData);
      }
      handleCancelForm();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '';
      if (errorMsg.includes('LOT_NUMBER_ALREADY_EXISTS')) {
        setErrors({
          lotNumber: language === 'pt'
            ? 'Já existe um lote com esse número para este produto.'
            : 'A lot with this number already exists for this product.',
        });
      } else if (errorMsg.includes('LOT_QUANTITY_STALE')) {
        setErrors({
          quantity: language === 'pt'
            ? 'O saldo deste lote foi alterado enquanto você estava editando. O estoque foi atualizado. Confira o novo saldo antes de fazer a alteração novamente.'
            : 'This lot balance changed while you were editing. The stock has been refreshed. Review the new balance before making the change again.',
        });
      } else {
        console.error('Error saving lot:', error);
      }
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleDeleteLot = async (lotId: string) => {
    if (window.confirm(language === 'pt' ? 'Tem certeza que deseja excluir este lote?' : 'Are you sure you want to delete this lot?')) {
      try {
        await deleteLot(lotId);
      } catch (error) {
        console.error('Error deleting lot:', error);
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900 flex items-center">
          <Package size={20} className="mr-2 text-brand-700" />
          {language === 'pt' ? 'Lotes do Produto' : 'Product Lots'}
        </h3>
        {!showForm && (
          <Button type="button" variant="secondary" size="sm" leftIcon={<Plus size={16} />} onClick={handleAddLot} disabled={!isOnline}>
            {language === 'pt' ? 'Adicionar Lote' : 'Add Lot'}
          </Button>
        )}
      </div>

      {showForm && (
        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              name="lotNumber"
              label={language === 'pt' ? 'Número do Lote' : 'Lot Number'}
              value={lotForm.lotNumber}
              onChange={(e) => setLotForm(prev => ({ ...prev, lotNumber: e.target.value }))}
              placeholder={language === 'pt' ? 'ex: Lote 001' : 'e.g., Lot 001'}
              error={errors.lotNumber}
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
              error={errors.quantity}
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
            <Button type="button" variant="outline" size="sm" leftIcon={<X size={16} />} onClick={handleCancelForm}>
              {language === 'pt' ? 'Cancelar' : 'Cancel'}
            </Button>
            <Button type="button" size="sm" leftIcon={<Save size={16} />} onClick={handleSubmitLot} disabled={!isOnline || isSubmitting}>
              {editingLotId
                ? (language === 'pt' ? 'Atualizar Lote' : 'Update Lot')
                : (language === 'pt' ? 'Salvar Lote' : 'Save Lot')}
            </Button>
          </div>
        </div>
      )}

      {lots.length > 0 ? (
        <div className="space-y-2">
          {lots.map(lot => {
            const expired = isExpired(lot.expirationDate);
            const expiringSoon = isExpiringSoon(lot.expirationDate);

            return (
              <div key={lot.id} className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:shadow-sm transition-shadow">
                <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-2 items-center">
                  <div>
                    <div className="text-sm font-medium text-gray-900">{lot.lotNumber}</div>
                    <div className="text-xs text-gray-500">{language === 'pt' ? 'Lote' : 'Lot'}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900">{lot.quantity}</div>
                    <div className="text-xs text-gray-500">{language === 'pt' ? 'Quantidade' : 'Quantity'}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {lot.expirationDate ? formatDateForDisplay(lot.expirationDate, language === 'pt' ? 'pt-BR' : 'en-US') : '—'}
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
                    onClick={() => handleEditLot(lot)}
                    disabled={!isOnline}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={language === 'pt' ? 'Excluir lote' : 'Delete lot'}
                    leftIcon={<Trash2 size={14} />}
                    onClick={() => handleDeleteLot(lot.id)}
                    disabled={!isOnline}
                    className="text-danger-600 hover:text-danger-700 hover:bg-danger-50"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={language === 'pt' ? 'Arquivar lote' : 'Archive lot'}
                    leftIcon={<Archive size={14} />}
                    onClick={() => handleArchiveLot(lot.id)}
                    disabled={!isOnline || isArchiving || lot.quantity > 0}
                    title={lot.quantity > 0 ? (language === 'pt' ? 'Lote deve estar zerado para arquivar' : 'Lot must be zero to archive') : ''}
                  />
                </div>
              </div>
            );
          })}
          <div className="flex justify-end pt-2 border-t border-gray-200">
            <div className="text-sm font-medium text-gray-700">
              {language === 'pt' ? 'Em lotes: ' : 'Tracked in lots: '}
              {trackedStock} {product?.unit}
            </div>
          </div>
          {untrackedStock >= 0 ? (
            <div className="flex justify-end">
              <div className="text-sm text-gray-500">
                {language === 'pt' ? 'Sem lote: ' : 'Untracked: '}
                {untrackedStock} {product?.unit}
              </div>
            </div>
          ) : (
            <div className="flex justify-end">
              <div className="text-sm text-amber-600">
                {language === 'pt'
                  ? 'Quantidade em lotes excede o estoque total. Dados históricos precisam de revisão.'
                  : 'Lot quantity exceeds total stock. Historical data needs review.'}
              </div>
            </div>
          )}
          <div className="flex justify-end">
            <div className="text-sm font-medium text-gray-900">
              {language === 'pt' ? 'Estoque total: ' : 'Total stock: '}
              {totalStock} {product?.unit}
            </div>
          </div>
        </div>
      ) : (
        !showForm && (
          <div className="text-center py-6 bg-gray-50 rounded-lg text-gray-500">
            <p className="text-sm">
              {language === 'pt'
                ? 'Nenhum lote cadastrado. Clique em "Adicionar Lote" para começar.'
                : 'No lots registered. Click "Add Lot" to get started.'}
            </p>
          </div>
        )
      )}
    </div>
  );
};

export default LotManager;
