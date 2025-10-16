import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import ProductCard from '../../components/products/ProductCard';
import Button from '../../components/ui/Button';
import { Plus, Filter, AlertTriangle } from 'lucide-react';
import Select from '../../components/ui/Select';
import Badge from '../../components/ui/Badge';

const InventoryList = () => {
  const { products, deleteProduct } = useAppContext();
  const { language } = useLanguage();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStock, setFilterStock] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  
  // Load custom categories from localStorage
  useEffect(() => {
    try {
      const savedCategories = localStorage.getItem('customProductCategories');
      if (savedCategories) {
        const parsedCategories = JSON.parse(savedCategories);
        if (Array.isArray(parsedCategories)) {
          setCustomCategories(parsedCategories);
        }
      }
    } catch (error) {
      console.error('Error parsing custom categories:', error);
    }
  }, []);
  
  // Filter products
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
        : true;
    
    return matchesSearch && matchesCategory && matchesStock;
  });
  
  // Sort products
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
      ? 'Tem certeza que deseja excluir este produto?'
      : 'Are you sure you want to delete this product?'
    )) {
      deleteProduct(id);
    }
  };
  
  const handleClearFilters = () => {
    setSearchTerm('');
    setFilterCategory('');
    setFilterStock('');
  };
  
  // Count low stock items
  const lowStockCount = products.filter(
    (product) => product.quantityInStock <= product.minStockLevel
  ).length;

  // Get all unique categories from products and custom categories
  const allCategories = [...new Set([
    ...products.map(product => product.category),
    ...customCategories
  ])];

  return (
    <div>
      <div className="flex justify-between items-center mb-6 pt-4 lg:pt-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {language === 'pt' ? 'Estoque' : 'Inventory'}
          </h1>
          <p className="text-gray-600">
            {language === 'pt'
              ? 'Gerencie seus produtos e suprimentos agrícolas'
              : 'Manage your farm products and supplies'}
          </p>
        </div>
        <Link to="/inventory/new">
          <Button leftIcon={<Plus size={18} />}>
            {language === 'pt' ? 'Adicionar Produto' : 'Add New Product'}
          </Button>
        </Link>
      </div>
      
      {lowStockCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-start">
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
          <Link to="?stock=low" className="ml-auto">
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => setFilterStock('low')}
            >
              {language === 'pt' ? 'Ver Estoque Baixo' : 'View Low Stock'}
            </Button>
          </Link>
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
              { 
                value: 'seed', 
                label: language === 'pt' ? 'Sementes' : 'Seeds'
              },
              { 
                value: 'fertilizer', 
                label: language === 'pt' ? 'Fertilizantes' : 'Fertilizers'
              },
              { 
                value: 'pesticide', 
                label: language === 'pt' ? 'Pesticidas' : 'Pesticides'
              },
              { 
                value: 'herbicide', 
                label: language === 'pt' ? 'Herbicidas' : 'Herbicides'
              },
              { 
                value: 'equipment', 
                label: language === 'pt' ? 'Equipamentos' : 'Equipment'
              },
              { 
                value: 'other', 
                label: language === 'pt' ? 'Outros' : 'Other'
              },
              ...customCategories.map(category => ({
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
              { 
                value: '', 
                label: language === 'pt' ? 'Todos os Níveis' : 'All Stock Levels'
              },
              { 
                value: 'low', 
                label: language === 'pt' ? 'Estoque Baixo' : 'Low Stock'
              },
              { 
                value: 'normal', 
                label: language === 'pt' ? 'Estoque Normal' : 'Normal Stock'
              },
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
                { 
                  value: 'name', 
                  label: language === 'pt' ? 'Nome (A-Z)' : 'Name (A-Z)'
                },
                { 
                  value: 'stock-asc', 
                  label: language === 'pt' ? 'Estoque (Menor-Maior)' : 'Stock (Low to High)'
                },
                { 
                  value: 'stock-desc', 
                  label: language === 'pt' ? 'Estoque (Maior-Menor)' : 'Stock (High to Low)'
                },
                { 
                  value: 'price-asc', 
                  label: language === 'pt' ? 'Preço (Menor-Maior)' : 'Price (Low to High)'
                },
                { 
                  value: 'price-desc', 
                  label: language === 'pt' ? 'Preço (Maior-Menor)' : 'Price (High to Low)'
                },
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