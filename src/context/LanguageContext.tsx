import React, { createContext, useContext, useState, ReactNode } from 'react';

type Language = 'en' | 'pt';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const translations = {
  en: {
    // Common
    'common.view': 'View',
    'common.edit': 'Edit',
    'common.delete': 'Delete',
    'common.cancel': 'Cancel',
    'common.save': 'Save',
    'common.add': 'Add',
    'common.search': 'Search',
    'common.filter': 'Filter',
    'common.all': 'All',
    'common.details': 'Details',
    'common.notes': 'Notes',
    'common.created': 'Created',
    'common.updated': 'Updated',
    'common.actions': 'Actions',
    'common.back': 'Back',
    'common.noData': 'No data available',
    'common.loading': 'Loading...',
    'common.success': 'Success',
    'common.error': 'Error',
    'common.confirm': 'Confirm',
    'common.clear': 'Clear',
    'common.clearFilters': 'Clear filters',
    'common.name': 'Name',
    'common.description': 'Description',
    'common.date': 'Date',
    'common.status': 'Status',
    'common.type': 'Type',
    'common.category': 'Category',
    'common.quantity': 'Quantity',
    'common.price': 'Price',
    'common.unit': 'Unit',
    'common.supplier': 'Supplier',
    'common.location': 'Location',
    'common.size': 'Size',
    'common.crop': 'Crop',
    'common.operator': 'Operator',
    'common.products': 'Products',
    'common.addNew': 'Add New',
    'common.update': 'Update',
    'common.create': 'Create',
    'common.appDescription': 'Farm Management',

    // Dashboard
    'dashboard.title': 'Farm Dashboard',
    'dashboard.totalAreas': 'Total Areas',
    'dashboard.operations': 'Operations',
    'dashboard.products': 'Products',
    'dashboard.recentOperations': 'Recent Operations',
    'dashboard.inventoryAlerts': 'Inventory Alerts',
    'dashboard.farmStatistics': 'Farm Statistics',
    'dashboard.quickActions': 'Quick Actions',
    'dashboard.addArea': 'Add New Area',
    'dashboard.logOperation': 'Log Operation',
    'dashboard.addProduct': 'Add Product',
    'dashboard.viewReports': 'View Reports',
    'dashboard.lowStock': 'Low Stock',
    'dashboard.areaDistribution': 'Area Distribution',
    'dashboard.operationsThisMonth': 'Operations This Month',
    
    // Areas
    'areas.title': 'Farming Areas',
    'areas.subtitle': 'Manage your farming areas and fields',
    'areas.add': 'Add New Area',
    'areas.edit': 'Edit Area',
    'areas.details': 'Area Details',
    'areas.search': 'Search areas by name, location, or crop...',
    'areas.name': 'Area Name',
    'areas.size': 'Size',
    'areas.location': 'Location',
    'areas.currentCrop': 'Current Crop',
    'areas.description': 'Description',
    'areas.noAreas': 'No areas found',
    'areas.confirmDelete': 'Are you sure you want to delete this area?',
    'areas.addFirstArea': 'Add Your First Area',
    'areas.operationOverview': 'Operation Overview',
    'areas.lastOperations': 'Last Operations',
    
    // Operations
    'operations.title': 'Operations',
    'operations.subtitle': 'Manage and track all farming activities',
    'operations.add': 'Add New Operation',
    'operations.edit': 'Edit Operation',
    'operations.search': 'Search operations...',
    'operations.type': 'Operation Type',
    'operations.allTypes': 'All Operation Types',
    'operations.area': 'Area',
    'operations.allAreas': 'All Areas',
    'operations.date': 'Date',
    'operations.startDate': 'Start Date',
    'operations.endDate': 'End Date',
    'operations.nextDate': 'Next Application',
    'operations.nextDateHelp': 'Expected date for next application',
    'operations.operator': 'Operator',
    'operations.description': 'Description',
    'operations.products': 'Products Used',
    'operations.notes': 'Notes',
    'operations.noOperations': 'No operations found',
    'operations.confirmDelete': 'Are you sure you want to delete this operation?',
    'operations.addFirstOperation': 'Add Your First Operation',
    'operations.addNewType': 'Add New Type',
    'operations.typeNew': 'New Type',
    'operations.typeEnter': 'Enter new type',
    
    // Operation Types
    'operationType.plowing': 'Plowing',
    'operationType.spraying': 'Spraying',
    'operationType.planting': 'Planting',
    'operationType.harvesting': 'Harvesting',
    'operationType.gradagem': 'Gradagem',
    'operationType.subsolagem': 'Subsolagem',
    'operationType.plantio': 'Plantio',
    'operationType.colheita': 'Colheita',
    'operationType.dessecacao': 'Dessecação',
    'operationType.herbicida': 'Herbicida',
    'operationType.fungicida': 'Fungicida',
    
    // Inventory
    'inventory.title': 'Stock',
    'inventory.subtitle': 'Manage your farm products and supplies',
    'inventory.add': 'Add New Product',
    'inventory.edit': 'Edit Product',
    'inventory.search': 'Search products...',
    'inventory.category': 'Category',
    'inventory.allCategories': 'All Categories',
    'inventory.stockLevel': 'Stock Level',
    'inventory.lowStock': 'Low Stock',
    'inventory.normalStock': 'Normal Stock',
    'inventory.quantity': 'Quantity',
    'inventory.minLevel': 'Minimum Level',
    'inventory.price': 'Price',
    'inventory.supplier': 'Supplier',
    'inventory.noProducts': 'No products found',
    'inventory.confirmDelete': 'Are you sure you want to delete this product?',
    'inventory.addFirstProduct': 'Add Your First Product',
    
    // Product Categories
    'productCategory.seed': 'Seeds',
    'productCategory.fertilizer': 'Fertilizers',
    'productCategory.pesticide': 'Pesticides',
    'productCategory.herbicide': 'Herbicides',
    'productCategory.equipment': 'Equipment',
    'productCategory.other': 'Other',
    
    // Reports
    'reports.title': 'Reports & Analytics',
    'reports.subtitle': 'View insights and statistics about your farm operations',
    'reports.period': 'Time Period',
    'reports.allTime': 'All Time',
    'reports.currentMonth': 'Current Month',
    'reports.lastMonth': 'Last Month',
    'reports.last3Months': 'Last 3 Months',
    'reports.operationSummary': 'Operation Summary Report',
    'reports.areaActivity': 'Area Activity',
    'reports.productUsage': 'Product Usage',
    'reports.operationsOverview': 'Operations Overview',
    'reports.topProducts': 'Top Products Used',
    
    // Settings
    'settings.title': 'Settings',
    'settings.subtitle': 'Customize your application preferences',
    'settings.language': 'Language',
    'settings.language.en': 'English',
    'settings.language.pt': 'Portuguese',
    'settings.save': 'Save Changes',
    'settings.theme': 'Theme',
    'settings.notifications': 'Notifications',

    // Notifications
    'notifications.title': 'Notifications',
  },
  pt: {
    // Common
    'common.view': 'Visualizar',
    'common.edit': 'Editar',
    'common.delete': 'Excluir',
    'common.cancel': 'Cancelar',
    'common.save': 'Salvar',
    'common.add': 'Adicionar',
    'common.search': 'Buscar',
    'common.filter': 'Filtrar',
    'common.all': 'Todos',
    'common.details': 'Detalhes',
    'common.notes': 'Observações',
    'common.created': 'Criado',
    'common.updated': 'Atualizado',
    'common.actions': 'Ações',
    'common.back': 'Voltar',
    'common.noData': 'Nenhum dado disponível',
    'common.loading': 'Carregando...',
    'common.success': 'Sucesso',
    'common.error': 'Erro',
    'common.confirm': 'Confirmar',
    'common.clear': 'Limpar',
    'common.clearFilters': 'Limpar filtros',
    'common.name': 'Nome',
    'common.description': 'Descrição',
    'common.date': 'Data',
    'common.status': 'Status',
    'common.type': 'Tipo',
    'common.category': 'Categoria',
    'common.quantity': 'Quantidade',
    'common.price': 'Preço',
    'common.unit': 'Unidade',
    'common.supplier': 'Fornecedor',
    'common.location': 'Localização',
    'common.size': 'Tamanho',
    'common.crop': 'Cultivo',
    'common.operator': 'Operador',
    'common.products': 'Produtos',
    'common.addNew': 'Adicionar Novo',
    'common.update': 'Atualizar',
    'common.create': 'Criar',
    'common.appDescription': 'Gestão Agrícola',

    // Dashboard
    'dashboard.title': 'Painel da Fazenda',
    'dashboard.totalAreas': 'Total de Áreas',
    'dashboard.operations': 'Operações',
    'dashboard.products': 'Produtos',
    'dashboard.recentOperations': 'Operações Recentes',
    'dashboard.inventoryAlerts': 'Alertas de Estoque',
    'dashboard.farmStatistics': 'Estatísticas da Fazenda',
    'dashboard.quickActions': 'Ações Rápidas',
    'dashboard.addArea': 'Adicionar Nova Área',
    'dashboard.logOperation': 'Registrar Operação',
    'dashboard.addProduct': 'Adicionar Produto',
    'dashboard.viewReports': 'Ver Relatórios',
    'dashboard.lowStock': 'Estoque Baixo',
    'dashboard.areaDistribution': 'Distribuição de Áreas',
    'dashboard.operationsThisMonth': 'Operações Este Mês',
    
    // Areas
    'areas.title': 'Áreas de Cultivo',
    'areas.subtitle': 'Gerencie suas áreas e campos de cultivo',
    'areas.add': 'Adicionar Nova Área',
    'areas.edit': 'Editar Área',
    'areas.details': 'Detalhes da Área',
    'areas.search': 'Buscar áreas por nome, localização ou cultivo...',
    'areas.name': 'Nome da Área',
    'areas.size': 'Tamanho',
    'areas.location': 'Localização',
    'areas.currentCrop': 'Cultivo Atual',
    'areas.description': 'Descrição',
    'areas.noAreas': 'Nenhuma área encontrada',
    'areas.confirmDelete': 'Tem certeza que deseja excluir esta área?',
    'areas.addFirstArea': 'Adicionar Primeira Área',
    'areas.operationOverview': 'Visão Geral das Operações',
    'areas.lastOperations': 'Últimas Operações',
    
    // Operations
    'operations.title': 'Operações',
    'operations.subtitle': 'Gerencie e acompanhe todas as atividades agrícolas',
    'operations.add': 'Nova Operação',
    'operations.edit': 'Editar Operação',
    'operations.search': 'Buscar operações...',
    'operations.type': 'Tipo de Operação',
    'operations.allTypes': 'Todos os Tipos',
    'operations.area': 'Área',
    'operations.allAreas': 'Todas as Áreas',
    'operations.date': 'Data',
    'operations.startDate': 'Data Inicial',
    'operations.endDate': 'Data Final',
    'operations.nextDate': 'Próxima Aplicação',
    'operations.nextDateHelp': 'Data prevista para a próxima aplicação',
    'operations.operator': 'Operador',
    'operations.description': 'Descrição',
    'operations.products': 'Produtos Utilizados',
    'operations.notes': 'Observações',
    'operations.noOperations': 'Nenhuma operação encontrada',
    'operations.confirmDelete': 'Tem certeza que deseja excluir esta operação?',
    'operations.addFirstOperation': 'Adicionar Primeira Operação',
    'operations.addNewType': 'Adicionar Novo Tipo',
    'operations.typeNew': 'Novo Tipo',
    'operations.typeEnter': 'Digite o novo tipo',
    
    // Operation Types
    'operationType.plowing': 'Aração',
    'operationType.spraying': 'Pulverização',
    'operationType.planting': 'Plantio',
    'operationType.harvesting': 'Colheita',
    'operationType.gradagem': 'Gradagem',
    'operationType.subsolagem': 'Subsolagem',
    'operationType.plantio': 'Plantio',
    'operationType.colheita': 'Colheita',
    'operationType.dessecacao': 'Dessecação',
    'operationType.herbicida': 'Herbicida',
    'operationType.fungicida': 'Fungicida',
    
    // Inventory
    'inventory.title': 'Estoque',
    'inventory.subtitle': 'Gerencie seus produtos e suprimentos agrícolas',
    'inventory.add': 'Adicionar Novo Produto',
    'inventory.edit': 'Editar Produto',
    'inventory.search': 'Buscar produtos...',
    'inventory.category': 'Categoria',
    'inventory.allCategories': 'Todas as Categorias',
    'inventory.stockLevel': 'Nível de Estoque',
    'inventory.lowStock': 'Estoque Baixo',
    'inventory.normalStock': 'Estoque Normal',
    'inventory.quantity': 'Quantidade',
    'inventory.minLevel': 'Nível Mínimo',
    'inventory.price': 'Preço',
    'inventory.supplier': 'Fornecedor',
    'inventory.noProducts': 'Nenhum produto encontrado',
    'inventory.confirmDelete': 'Tem certeza que deseja excluir este produto?',
    'inventory.addFirstProduct': 'Adicionar Primeiro Produto',
    
    // Product Categories
    'productCategory.seed': 'Sementes',
    'productCategory.fertilizer': 'Fertilizantes',
    'productCategory.pesticide': 'Pesticidas',
    'productCategory.herbicide': 'Herbicidas',
    'productCategory.equipment': 'Equipamentos',
    'productCategory.other': 'Outros',
    
    // Reports
    'reports.title': 'Relatórios e Análises',
    'reports.subtitle': 'Visualize insights e estatísticas sobre suas operações',
    'reports.period': 'Período',
    'reports.allTime': 'Todo o Período',
    'reports.currentMonth': 'Mês Atual',
    'reports.lastMonth': 'Mês Anterior',
    'reports.last3Months': 'Últimos 3 Meses',
    'reports.operationSummary': 'Relatório Resumido de Operações',
    'reports.areaActivity': 'Atividade por Área',
    'reports.productUsage': 'Uso de Produtos',
    'reports.operationsOverview': 'Visão Geral das Operações',
    'reports.topProducts': 'Produtos Mais Utilizados',
    
    // Settings
    'settings.title': 'Configurações',
    'settings.subtitle': 'Personalize suas preferências do aplicativo',
    'settings.language': 'Idioma',
    'settings.language.en': 'Inglês',
    'settings.language.pt': 'Português',
    'settings.save': 'Salvar Alterações',
    'settings.theme': 'Tema',
    'settings.notifications': 'Notificações',

    // Notifications
    'notifications.title': 'Notificações',
  }
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

interface LanguageProviderProps {
  children: ReactNode;
}

export const LanguageProvider: React.FC<LanguageProviderProps> = ({ children }) => {
  const [language, setLanguage] = useState<Language>('pt');
  
  const t = (key: string): string => {
    return translations[language][key as keyof typeof translations[typeof language]] || key;
  };
  
  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};