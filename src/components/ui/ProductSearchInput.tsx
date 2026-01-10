import React, { useState, useRef, useEffect } from 'react';
import { Product } from '../../types';
import { Search, ChevronDown } from 'lucide-react';

interface ProductSearchInputProps {
  products: Product[];
  value: string;
  onChange: (productId: string) => void;
  label: string;
  placeholder?: string;
  error?: string;
  required?: boolean;
}

const ProductSearchInput: React.FC<ProductSearchInputProps> = ({
  products,
  value,
  onChange,
  label,
  placeholder,
  error,
  required = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedProduct = products.find(p => p.id === value);

  // Filter products based on search term
  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (product.category && product.category.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (product.supplier && product.supplier.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectProduct = (productId: string) => {
    onChange(productId);
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleInputClick = () => {
    setIsOpen(true);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleClear = () => {
    onChange('');
    setSearchTerm('');
    setIsOpen(true);
  };

  return (
    <div className="space-y-2" ref={wrapperRef}>
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <div className="relative">
        <div
          className={`relative flex items-center bg-white border rounded-md shadow-sm cursor-text ${
            error ? 'border-red-500' : 'border-gray-300'
          } ${isOpen ? 'ring-2 ring-green-500 border-green-500' : ''}`}
          onClick={handleInputClick}
        >
          <div className="absolute left-3 text-gray-400">
            <Search size={18} />
          </div>

          <input
            ref={inputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={() => setIsOpen(true)}
            placeholder={selectedProduct ? selectedProduct.name : placeholder}
            className={`w-full pl-10 pr-10 py-2 bg-transparent focus:outline-none ${
              selectedProduct && !searchTerm ? 'text-gray-900' : 'text-gray-700'
            }`}
          />

          {selectedProduct && !searchTerm && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
              className="absolute right-8 text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          )}

          <div className="absolute right-3 text-gray-400">
            <ChevronDown size={18} className={isOpen ? 'transform rotate-180' : ''} />
          </div>
        </div>

        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
            {filteredProducts.length > 0 ? (
              filteredProducts.map((product) => {
                const isLowStock = product.quantityInStock <= product.minStockLevel;
                const isSelected = product.id === value;

                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => handleSelectProduct(product.id)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center justify-between ${
                      isSelected ? 'bg-green-50' : ''
                    }`}
                  >
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{product.name}</div>
                      <div className="text-sm text-gray-500">
                        {product.category}
                        {product.supplier && ` • ${product.supplier}`}
                      </div>
                    </div>
                    <div className="text-right ml-4">
                      <div
                        className={`text-sm font-medium ${
                          isLowStock ? 'text-red-600' : 'text-gray-700'
                        }`}
                      >
                        {product.quantityInStock} {product.unit}
                      </div>
                      <div className="text-xs text-gray-500">
                        {isLowStock ? 'Estoque baixo' : 'Disponível'}
                      </div>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="px-4 py-3 text-sm text-gray-500 text-center">
                {searchTerm
                  ? 'Nenhum produto encontrado'
                  : 'Digite para buscar produtos'}
              </div>
            )}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {selectedProduct && !isOpen && (
        <p className="text-sm text-gray-500">
          Disponível: {selectedProduct.quantityInStock} {selectedProduct.unit}
        </p>
      )}
    </div>
  );
};

export default ProductSearchInput;
