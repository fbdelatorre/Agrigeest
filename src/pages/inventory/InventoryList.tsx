import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import ProductCard from '../../components/products/ProductCard';
import Button from '../../components/ui/Button';
import { Plus, Filter, AlertTriangle } from 'lucide-react';
import Select from '../../components/ui/Select';

const InventoryList = () => {
  const { products, deleteProduct, productLots } = useAppContext();
  const { language } = useLanguage();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStock, setFilterStock] = useState('');
  const [sortBy, setSortBy] = useState('name');

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

  // Products that have lots expiring within 60 days or already expired
  const productsExpiringSoon = useMemo(() => {
    return products.filter(product => {
      const lots = productLots.filter(l => l.productId === product.id);
      return lots.some(lot => isExpiringSoon(lot.expirationDate) || isExpired(lot.expirationDate));
    });
  }, [products, productLots]);

  const uniqueCategories = useMemo(() => {
    const categories = products
      .map(product => product.category)
      .filter(category => category && category.trim() !== '');
    return [...new Set(categories)].sort();
  }, [products]);

  const filteredProducts = products.filter((product) => {
    const matchesSearch =
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (product.supplier && product.supplier.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesCategory = filterCategory ? product.category === filterCategory : true;

    const matchesStock =
      filterStock === 'low'
        ? product.quantityInStock <= product.minStockLevel
        : filterStock === 'normal'
        ? product.quantityInStock > product.minStockLevel
        : filterStock === 'expiring'
        ? productsExpiringSoon.some(p => p.id === product.id)
        : true;

    return matchesSearch && matchesCategory && matchesStock;
  });

  const sortedProducts = [...filteredProducts].sort((a, b) => {
    if (sortBy === 'name') {
      return a.name.localeCompare(b.name);
    } else if (sortBy === 'stock-asc') {
      return a.quantityInStock - b.quantityInStock;
    } else if (sortBy === 'stock-desc') {
      return b.quantityInStock - a.quantityInStock;
    } else if (sortBy === 'price-asc') {
      return a.price - b.price;
    } else {
      return b.price - a.price;
    }
  });

  const handleDeleteProduct = (id: string) => {
    if (window.confirm(language === 'pt'
      ? 'Tem certeza que deseja excluir este produto? Todos os lotes serão excluídos também.'
      : 'Are you sure you want to delete this product? All lots will be deleted as well.'
    )) {
      deleteProduct(id);
    }
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setFilterCategory('');
    setFilterStock('');
  };

  const lowStockCount = products.filter(
    (product) => product.quantityInStock <= product.minStockLevel
  ).length;

  return (
    <div>
      <div className="flex justify-between items-center mb-6 pt-4 lg:pt-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {language === 'pt' ? 'Estoque' : 'Inventory'}
          </h1>
          <p className="text-gray-600">
            {language === 'pt'
              ? 'Gerencie seus produtos, lotes e validades'
              : 'Manage your products, lots and expiration dates'}
          </p>
        </div>
        <Link to="/inventory/new">
          <Button leftIcon={<Plus size={18} />}>
            {language === 'pt' ? 'Adicionar Produto' : 'Add New Product'}
          </Button>
        </Link>
      </div>

      {lowStockCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 flex items-start">
          <div className="p-2 bg-red-100 rounded-full mr-3">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 className="font-medium text-red-800">
              {language === 'pt' ? 'Alerta de Estoque Baixo' : 'Low Stock Alert'}
            </h3>
            <p className="text-red-700 text-sm">
              {language === 'pt'
                ? `${lowStockCount} ${lowStockCount === 1 ? 'produto está' : 'produtos estão'} abaixo do nível mínimo.`
                : `${lowStockCount} ${lowStockCount === 1 ? 'product is' : 'products are'} below the minimum stock level.`}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto text-red-600 border-red-200 hover:bg-red-50"
            onClick={() => setFilterStock('low')}
          >
            {language === 'pt' ? 'Ver Estoque Baixo' : 'View Low Stock'}
          </Button>
        </div>
      )}

      {productsExpiringSoon.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6 flex items-start">
          <div className="p-2 bg-orange-100 rounded-full mr-3">
            <AlertTriangle className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h3 className="font-medium text-orange-800">
              {language === 'pt' ? 'Alerta de Validade Próxima' : 'Expiring Soon Alert'}
            </h3>
            <p className="text-orange-700 text-sm">
              {language === 'pt'
                ? `${productsExpiringSoon.length} ${productsExpiringSoon.length === 1 ? 'produto tem lotes' : 'produtos têm lotes'} vencendo em até 60 dias.`
                : `${productsExpiringSoon.length} ${productsExpiringSoon.length === 1 ? 'product has lots' : 'products have lots'} expiring within 60 days.`}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto text-orange-600 border-orange-200 hover:bg-orange-50"
            onClick={() => setFilterStock('expiring')}
          >
            {language === 'pt' ? 'Ver Vencendo' : 'View Expiring'}
          </Button>
        </div>
      )}

      <div className="bg-white p-4 rounded-lg shadow-sm mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div className="relative md:col-span-2">
            <input
              type="text"
              placeholder={language === 'pt'
                ? 'Buscar produtos...'
                : 'Search products...'}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <div className="absolute left-3 top-2.5 text-gray-400">
              <Filter size={18} />
            </div>
          </div>

          <Select
            label=""
            name="category"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            options={[
              {
                value: '',
                label: language === 'pt' ? 'Todas as Categorias' : 'All Categories'
              },
              ...uniqueCategories.map(category => ({
                value: category,
                label: category
              }))
            ]}
          />

          <Select
            label=""
            name="stock"
            value={filterStock}
            onChange={(e) => setFilterStock(e.target.value)}
            options={[
              { value: '', label: language === 'pt' ? 'Todos os Níveis' : 'All Stock Levels' },
              { value: 'low', label: language === 'pt' ? 'Estoque Baixo' : 'Low Stock' },
              { value: 'normal', label: language === 'pt' ? 'Estoque Normal' : 'Normal Stock' },
              { value: 'expiring', label: language === 'pt' ? 'Vencendo em 60 dias' : 'Expiring in 60 days' },
            ]}
          />
        </div>

        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <span className="text-sm text-gray-600 mr-2">
              {language === 'pt' ? 'Ordenar por:' : 'Sort by:'}
            </span>
            <Select
              name="sortBy"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              options={[
                { value: 'name', label: language === 'pt' ? 'Nome (A-Z)' : 'Name (A-Z)' },
                { value: 'stock-asc', label: language === 'pt' ? 'Estoque (Menor-Maior)' : 'Stock (Low to High)' },
                { value: 'stock-desc', label: language === 'pt' ? 'Estoque (Maior-Menor)' : 'Stock (High to Low)' },
                { value: 'price-asc', label: language === 'pt' ? 'Preço (Menor-Maior)' : 'Price (Low to High)' },
                { value: 'price-desc', label: language === 'pt' ? 'Preço (Maior-Menor)' : 'Price (High to Low)' },
              ]}
              className="border-none text-sm font-medium text-gray-700 h-8 pl-0 pr-8 py-0 bg-transparent"
            />
          </div>

          {(searchTerm || filterCategory || filterStock) && (
            <button
              className="text-sm text-gray-600 hover:text-gray-900"
              onClick={handleClearFilters}
            >
              {language === 'pt' ? 'Limpar filtros' : 'Clear filters'}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sortedProducts.length > 0 ? (
          sortedProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onDelete={handleDeleteProduct}
            />
          ))
        ) : (
          <div className="col-span-3 text-center py-12 bg-gray-50 rounded-lg">
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {language === 'pt' ? 'Nenhum produto encontrado' : 'No products found'}
            </h3>
            <p className="text-gray-600 mb-4">
              {searchTerm || filterCategory || filterStock
                ? language === 'pt'
                  ? 'Nenhum resultado encontrado para os filtros atuais'
                  : 'No results match your current filters'
                : language === 'pt'
                ? 'Você ainda não adicionou nenhum produto ao seu estoque'
                : "You haven't added any products to your inventory yet"}
            </p>
            {searchTerm || filterCategory || filterStock ? (
              <Button onClick={handleClearFilters}>
                {language === 'pt' ? 'Limpar Filtros' : 'Clear Filters'}
              </Button>
            ) : (
              <Link to="/inventory/new">
                <Button leftIcon={<Plus size={18} />}>
                  {language === 'pt'
                    ? 'Adicionar Primeiro Produto'
                    : 'Add Your First Product'}
                </Button>
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default InventoryList;
