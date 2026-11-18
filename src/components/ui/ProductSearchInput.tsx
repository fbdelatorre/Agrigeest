import type { Product } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { formatQuantity } from '../../utils/quantityFormat';
import Select from './Select';

interface ProductSearchInputProps {
  products: Product[];
  value: string;
  onChange: (productId: string) => void;
  label: string;
  placeholder?: string;
  error?: string;
  required?: boolean;
}

export default function ProductSearchInput({ products, value, onChange, label, placeholder, error, required }: ProductSearchInputProps) {
  const { language } = useLanguage();
  const selected = products.find(product => product.id === value);
  const available = language === 'pt' ? 'Disponível' : 'Available';
  return (
    <Select
      label={label}
      value={value}
      placeholder={placeholder}
      error={error}
      required={required}
      helperText={selected ? available + ': ' + formatQuantity(selected.quantityInStock, language) + ' ' + selected.unit : undefined}
      onChange={event => onChange(event.target.value)}
      options={[
        ...(!required && value ? [{ value: '', label: language === 'pt' ? 'Limpar produto' : 'Clear product' }] : []),
        ...products.map(product => ({
          value: product.id,
          label: product.name,
          searchText: [product.category, product.supplier].filter(Boolean).join(' '),
          content: (
            <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
              <div className="min-w-0 break-words">
                <strong className="block">{product.name}</strong>
                <span className="text-xs text-gray-600">{[product.category, product.supplier].filter(Boolean).join(' · ')}</span>
              </div>
              <span className={product.quantityInStock <= product.minStockLevel ? 'shrink-0 text-danger-600' : 'shrink-0 text-gray-700'}>
                {formatQuantity(product.quantityInStock, language)} {product.unit}
              </span>
            </div>
          ),
        })),
      ]}
    />
  );
}
