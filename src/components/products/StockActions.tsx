import React, { useState, useRef, useEffect } from 'react';
import { Product, ProductLot } from '../../types';
import { useAppContext } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { X, PackagePlus, Scale } from 'lucide-react';

interface StockActionsProps {
  product: Product;
  mode: 'stock-in' | 'adjust';
  onClose: () => void;
}

const StockActions: React.FC<StockActionsProps> = ({ product, mode, onClose }) => {
  const { getLotsByProductId, addInventoryStock, adjustInventoryStock } = useAppContext();
  const { language } = useLanguage();
  const { isOnline } = useNetworkStatus();

  const lots = getLotsByProductId(product.id);
  const trackedStock = lots.reduce((sum, lot) => sum + lot.quantity, 0);
  const untrackedStock = product.quantityInStock - trackedStock;

  const [quantity, setQuantity] = useState('');
  const [selectedLotId, setSelectedLotId] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const idempotencyRef = useRef<string>('');

  useEffect(() => {
    idempotencyRef.current = crypto.randomUUID();
  }, []);

  const isAdjust = mode === 'adjust';
  const isAdmin = isAdjust;

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    if (!isOnline) return;

    setError(null);

    const qty = Number(quantity);
    if (!quantity.trim() || isNaN(qty)) {
      setError(language === 'pt' ? 'Quantidade é obrigatória' : 'Quantity is required');
      return;
    }

    if (isAdjust) {
      if (!reason.trim()) {
        setError(language === 'pt' ? 'Motivo é obrigatório para ajuste' : 'Reason is required for adjustment');
        return;
      }
      if (qty < 0) {
        setError(language === 'pt' ? 'Quantidade não pode ser negativa' : 'Quantity cannot be negative');
        return;
      }
    } else {
      if (qty <= 0) {
        setError(language === 'pt' ? 'Quantidade deve ser maior que zero' : 'Quantity must be greater than zero');
        return;
      }
    }

    submittingRef.current = true;
    setIsSubmitting(true);

    try {
      const lotId = selectedLotId || null;

      if (isAdjust) {
        await adjustInventoryStock(
          product.id,
          qty,
          reason.trim(),
          idempotencyRef.current,
          lotId,
          notes.trim() || null
        );
      } else {
        await addInventoryStock(
          product.id,
          qty,
          idempotencyRef.current,
          lotId,
          reason.trim() || null,
          notes.trim() || null,
          unitCost.trim() ? Number(unitCost) : null
        );
      }

      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('IDEMPOTENT')) {
        onClose();
        return;
      }
      if (msg.includes('ADMIN_REQUIRED')) {
        setError(language === 'pt' ? 'Apenas administradores podem ajustar estoque.' : 'Only admins can adjust inventory.');
      } else if (msg.includes('LOT_ARCHIVED')) {
        setError(language === 'pt' ? 'Este lote está arquivado.' : 'This lot is archived.');
      } else if (msg.includes('LOT_QUANTITY_EXCEEDS_PRODUCT_STOCK')) {
        setError(language === 'pt' ? 'A quantidade excede o estoque do produto.' : 'Quantity exceeds product stock.');
      } else if (msg.includes('NEGATIVE_STOCK_NOT_ALLOWED')) {
        setError(language === 'pt' ? 'Não é possível deixar o estoque negativo.' : 'Cannot result in negative stock.');
      } else {
        setError(msg);
      }
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const title = isAdjust
    ? (language === 'pt' ? 'Ajustar Inventário' : 'Adjust Inventory')
    : (language === 'pt' ? 'Entrada de Estoque' : 'Stock Entry');

  const quantityLabel = isAdjust
    ? (language === 'pt' ? 'Quantidade Física Contada' : 'Counted Physical Quantity')
    : (language === 'pt' ? 'Quantidade' : 'Quantity');

  const currentDisplay = selectedLotId
    ? `${lots.find(l => l.id === selectedLotId)?.quantity ?? 0} ${product.unit}`
    : `${untrackedStock} ${product.unit}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            {isAdjust ? <Scale size={20} className="text-brand-600" /> : <PackagePlus size={20} className="text-brand-600" />}
            {title}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
          <div className="font-medium text-gray-900">{product.name}</div>
          <div className="mt-1">
            {language === 'pt' ? 'Estoque atual' : 'Current stock'}: {product.quantityInStock} {product.unit}
          </div>
          {selectedLotId && (
            <div className="mt-0.5">
              {language === 'pt' ? 'Saldo atual do lote' : 'Current lot balance'}: {currentDisplay}
            </div>
          )}
          {!selectedLotId && (
            <div className="mt-0.5">
              {language === 'pt' ? 'Estoque sem lote' : 'Untracked stock'}: {currentDisplay}
            </div>
          )}
        </div>

        <div className="space-y-3">
          {lots.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {language === 'pt' ? 'Lote (opcional)' : 'Lot (optional)'}
              </label>
              <select
                className="w-full h-10 px-3 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                value={selectedLotId}
                onChange={(e) => setSelectedLotId(e.target.value)}
              >
                <option value="">{language === 'pt' ? 'Sem lote (estoque geral)' : 'No lot (untracked)'}</option>
                {lots.map(lot => (
                  <option key={lot.id} value={lot.id}>
                    {lot.lotNumber} ({lot.quantity} {product.unit})
                  </option>
                ))}
              </select>
            </div>
          )}

          <Input
            name="quantity"
            label={quantityLabel}
            type="number"
            min="0"
            step="0.01"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder={isAdjust ? '0' : '0'}
            error={error || undefined}
          />

          <Input
            name="reason"
            label={isAdjust
              ? (language === 'pt' ? 'Motivo (obrigatório)' : 'Reason (required)')
              : (language === 'pt' ? 'Motivo / Observação' : 'Reason / Note')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={language === 'pt' ? 'ex: Compra, Doação, Contagem física...' : 'e.g., Purchase, Donation, Physical count...'}
          />

          <Input
            name="notes"
            label={language === 'pt' ? 'Notas adicionais' : 'Additional notes'}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          {!isAdjust && (
            <Input
              name="unitCost"
              label={language === 'pt' ? 'Custo unitário (opcional)' : 'Unit cost (optional)'}
              type="number"
              min="0"
              step="0.01"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
            />
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
            {language === 'pt' ? 'Cancelar' : 'Cancel'}
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={!isOnline || isSubmitting} isLoading={isSubmitting}>
            {isAdjust
              ? (language === 'pt' ? 'Aplicar Ajuste' : 'Apply Adjustment')
              : (language === 'pt' ? 'Registrar Entrada' : 'Register Entry')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default StockActions;
