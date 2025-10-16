import React from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';
import OperationCard from '../../components/operations/OperationCard';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { ArrowLeft, Pencil, Map, Plus, Calendar, Trash2, FileDown, DollarSign } from 'lucide-react';
import Badge from '../../components/ui/Badge';
import { jsPDF } from 'jspdf';
import { useLanguage } from '../../context/LanguageContext';

const AreaDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getAreaById, getOperationsByAreaId, deleteArea, deleteOperation, activeSeason, getProductById } = useAppContext();
  const { language } = useLanguage();
  
  if (!id) {
    navigate('/areas');
    return null;
  }
  
  const area = getAreaById(id);
  
  if (!area) {
    navigate('/areas');
    return null;
  }
  
  const operations = getOperationsByAreaId(id);
  
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString(language === 'pt' ? 'pt-BR' : 'en-US');
  };
  
  const handleDeleteArea = () => {
    if (window.confirm(language === 'pt'
      ? 'Tem certeza que deseja excluir esta área? Todas as operações associadas permanecerão, mas não estarão mais vinculadas a esta área.'
      : 'Are you sure you want to delete this area? All associated operations will remain but will no longer be linked to this area.'
    )) {
      deleteArea(id);
      navigate('/areas');
    }
  };
  
  const handleDeleteOperation = (operationId: string) => {
    if (window.confirm(language === 'pt'
      ? 'Tem certeza que deseja excluir esta operação?'
      : 'Are you sure you want to delete this operation?'
    )) {
      deleteOperation(operationId);
    }
  };

  const getOperationTypeLabel = (type: string) => {
    if (language === 'pt') {
      const labels: Record<string, string> = {
        gradagem: 'Gradagem',
        subsolagem: 'Subsolagem',
        plantio: 'Plantio',
        colheita: 'Colheita',
        dessecacao: 'Dessecação',
        herbicida: 'Herbicida',
        fungicida: 'Fungicida'
      };
      return labels[type] || type;
    }
    
    const labels: Record<string, string> = {
      gradagem: 'Harrowing',
      subsolagem: 'Subsoiling',
      plantio: 'Planting',
      colheita: 'Harvesting',
      dessecacao: 'Desiccation',
      herbicida: 'Herbicide',
      fungicida: 'Fungicide'
    };
    return labels[type] || type;
  };

  const getOperationBadgeVariant = (type: string): 'primary' | 'secondary' | 'warning' | 'success' => {
    const variants: Record<string, 'primary' | 'secondary' | 'warning' | 'success'> = {
      gradagem: 'secondary',
      subsolagem: 'secondary',
      plantio: 'primary',
      colheita: 'success',
      dessecacao: 'warning',
      herbicida: 'warning',
      fungicida: 'warning'
    };
    return variants[type] || 'secondary';
  };

  // Get latest planting and harvest data
  const latestPlanting = operations
    .filter(op => op.type === 'plantio')
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())[0];

  const latestHarvest = operations
    .filter(op => op.type === 'colheita')
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())[0];

  // Calculate total spent and cost per hectare
  const calculateCosts = () => {
    let totalSpent = 0;
    
    operations.forEach(operation => {
      if (operation.productsUsed && operation.productsUsed.length > 0) {
        operation.productsUsed.forEach(usage => {
          const product = getProductById(usage.productId);
          if (product) {
            totalSpent += usage.quantity * product.price;
          }
        });
      }
    });
    
    const costPerUnit = area.size > 0 ? totalSpent / area.size : 0;
    
    return { totalSpent, costPerUnit };
  };
  
  const { totalSpent, costPerUnit } = calculateCosts();
  
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const generatePDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const margin = 20;
    let yPos = margin;

    doc.setFillColor(45, 94, 64);
    doc.rect(0, 0, pageWidth, 15, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text(area.name, pageWidth / 2, yPos - 9, { align: 'center' });

    yPos = 30;
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);

    doc.setFillColor(240, 249, 241);
    doc.rect(0, yPos - 10, pageWidth, 50, 'F');

    const detailsStartX = margin + 5;
    const columnWidth = (pageWidth - (margin * 2)) / 3;

    doc.setFont('helvetica', 'bold');
    doc.text(language === 'pt' ? 'Área:' : 'Area:', detailsStartX, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(`${area.size} ${area.unit}`, detailsStartX, yPos + 5);

    doc.setFont('helvetica', 'bold');
    doc.text(language === 'pt' ? 'Cultura:' : 'Crop:', detailsStartX + columnWidth, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(area.current_crop || (language === 'pt' ? 'Não definida' : 'Not defined'), detailsStartX + columnWidth, yPos + 5);

    doc.setFont('helvetica', 'bold');
    doc.text('Cultivar:', detailsStartX + (columnWidth * 2), yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(area.cultivar || (language === 'pt' ? 'Não definido' : 'Not defined'), detailsStartX + (columnWidth * 2), yPos + 5);

    // Add planting and harvest data
    yPos += 15;
    if (latestPlanting) {
      doc.setFont('helvetica', 'bold');
      doc.text(language === 'pt' ? 'População:' : 'Population:', detailsStartX, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(
        latestPlanting.seedsPerHectare 
          ? `${latestPlanting.seedsPerHectare.toLocaleString()} ${language === 'pt' ? 'sementes/ha' : 'seeds/ha'}`
          : language === 'pt' ? 'Não informada' : 'Not informed',
        detailsStartX, 
        yPos + 5
      );
    }

    if (latestHarvest) {
      doc.setFont('helvetica', 'bold');
      doc.text(language === 'pt' ? 'Produtividade:' : 'Yield:', detailsStartX + columnWidth, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(
        latestHarvest.yieldPerHectare 
          ? `${latestHarvest.yieldPerHectare.toLocaleString()} kg/ha`
          : language === 'pt' ? 'Não informada' : 'Not informed',
        detailsStartX + columnWidth,
        yPos + 5
      );
    }

    // Add cost information
    yPos += 15;
    doc.setFont('helvetica', 'bold');
    doc.text(language === 'pt' ? 'Total gasto:' : 'Total spent:', detailsStartX, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(formatCurrency(totalSpent), detailsStartX, yPos + 5);

    doc.setFont('helvetica', 'bold');
    doc.text(language === 'pt' ? `Custo por ${area.unit}:` : `Cost per ${area.unit}:`, detailsStartX + columnWidth, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(formatCurrency(costPerUnit), detailsStartX + columnWidth, yPos + 5);

    // Add description if available
    if (area.description) {
      yPos += 15;
      doc.setFont('helvetica', 'bold');
      doc.text(language === 'pt' ? 'Descrição:' : 'Description:', detailsStartX, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(area.description, detailsStartX, yPos + 5, { maxWidth: pageWidth - (margin * 2) });
      yPos += 10 + (Math.ceil(doc.getTextDimensions(area.description, { maxWidth: pageWidth - (margin * 2) }).h / 5));
    } else {
      yPos += 20;
    }

    if (operations.length > 0) {
      yPos += 5;
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(45, 94, 64);
      doc.text(language === 'pt' ? `Operações${activeSeason ? ` (${activeSeason.name})` : ''}` : `Operations${activeSeason ? ` (${activeSeason.name})` : ''}`, margin, yPos);
      yPos += 15;

      const columns = language === 'pt' 
        ? ['Data', 'Tipo', 'Descrição', 'Área', 'Produto', 'Dose']
        : ['Date', 'Type', 'Description', 'Area', 'Product', 'Dose'];
      const columnWidths = [25, 25, 45, 25, 35, 25];
      const startX = margin;
      let currentX = startX;

      doc.setFillColor(45, 94, 64);
      doc.rect(margin, yPos - 8, pageWidth - (margin * 2), 10, 'F');

      doc.setFontSize(10);
      doc.setTextColor(255, 255, 255);
      columns.forEach((column, index) => {
        doc.text(column, currentX, yPos);
        currentX += columnWidths[index];
      });
      yPos += 10;

      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
      let rowCount = 0;

      operations
        .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
        .forEach((operation) => {
          if (rowCount % 2 === 0) {
            doc.setFillColor(248, 250, 252);
            doc.rect(margin, yPos - 8, pageWidth - (margin * 2), 10, 'F');
          }
          rowCount++;

          if (yPos > pageHeight - 20) {
            doc.addPage();
            yPos = margin;
            
            doc.setFillColor(45, 94, 64);
            doc.rect(margin, yPos - 8, pageWidth - (margin * 2), 10, 'F');
            
            currentX = startX;
            doc.setTextColor(255, 255, 255);
            doc.setFont('helvetica', 'bold');
            columns.forEach((column, index) => {
              doc.text(column, currentX, yPos);
              currentX += columnWidths[index];
            });
            doc.setTextColor(0, 0, 0);
            doc.setFont('helvetica', 'normal');
            yPos += 10;
          }

          if (operation.productsUsed.length > 0) {
            operation.productsUsed.forEach((usage, index) => {
              currentX = startX;
              const product = getProductById(usage.productId);
              
              if (index === 0) {
                doc.text(formatDate(operation.startDate), currentX, yPos);
                currentX += columnWidths[0];
                
                doc.text(operation.type, currentX, yPos);
                currentX += columnWidths[1];
                
                doc.text(operation.description, currentX, yPos, { maxWidth: columnWidths[2] });
                currentX += columnWidths[2];
                
                doc.text(`${operation.operationSize} ${area.unit}`, currentX, yPos);
                currentX += columnWidths[3];
              } else {
                currentX += columnWidths[0] + columnWidths[1] + columnWidths[2] + columnWidths[3];
              }
              
              doc.text(product?.name || (language === 'pt' ? 'Desconhecido' : 'Unknown'), currentX, yPos);
              currentX += columnWidths[4];
              
              doc.text(`${usage.dose} ${product?.unit}/${area.unit}`, currentX, yPos);
              
              yPos += 10;
            });
          } else {
            currentX = startX;
            doc.text(formatDate(operation.startDate), currentX, yPos);
            currentX += columnWidths[0];
            
            doc.text(operation.type, currentX, yPos);
            currentX += columnWidths[1];
            
            doc.text(operation.description, currentX, yPos, { maxWidth: columnWidths[2] });
            currentX += columnWidths[2];
            
            doc.text(`${operation.operationSize} ${area.unit}`, currentX, yPos);
            
            yPos += 10;
          }
        });
    } else {
      doc.setFontSize(12);
      doc.text(
        language === 'pt' 
          ? 'Nenhuma operação registrada para esta área.'
          : 'No operations recorded for this area.',
        margin,
        yPos
      );
    }

    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(10);
      doc.setTextColor(128, 128, 128);
      doc.text(
        language === 'pt' 
          ? `Página ${i} de ${pageCount}`
          : `Page ${i} of ${pageCount}`,
        pageWidth / 2,
        pageHeight - 10,
        { align: 'center' }
      );
    }

    doc.save(`area-report-${area.name.toLowerCase().replace(/\s+/g, '-')}.pdf`);
  };

  return (
    <div>
      <div className="mb-6 pt-4 lg:pt-0">
        <Link 
          to="/areas" 
          className="text-green-700 hover:text-green-800 font-medium text-sm flex items-center"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          {language === 'pt' ? 'Voltar para Áreas' : 'Back to Areas'}
        </Link>
      </div>
      
      <div className="flex flex-col md:flex-row justify-between md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{area.name}</h1>
          <p className="text-gray-600">
            {area.size} {area.unit} · {area.location}
          </p>
        </div>
        <div className="flex space-x-3">
          <Button
            variant="secondary"
            leftIcon={<FileDown size={18} />}
            onClick={generatePDF}
          >
            {language === 'pt' ? 'Exportar PDF' : 'Export PDF'}
          </Button>
          <Link to={`/operations/new?areaId=${area.id}`}>
            <Button
              variant="secondary"
              leftIcon={<Plus size={18} />}
            >
              {language === 'pt' ? 'Nova Operação' : 'Add Operation'}
            </Button>
          </Link>
          <Link to={`/areas/${area.id}/edit`}>
            <Button
              leftIcon={<Pencil size={18} />}
            >
              {language === 'pt' ? 'Editar' : 'Edit'}
            </Button>
          </Link>
          <Button
            variant="outline"
            className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
            leftIcon={<Trash2 size={18} />}
            onClick={handleDeleteArea}
          >
            {language === 'pt' ? 'Excluir' : 'Delete'}
          </Button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <Card className="lg:col-span-1">
          <Card.Header>
            <Card.Title className="flex items-center">
              <Map className="w-5 h-5 mr-2" />
              {language === 'pt' ? 'Detalhes da Área' : 'Area Details'}
            </Card.Title>
          </Card.Header>
          <Card.Content className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-gray-500">
                {language === 'pt' ? 'Cultivo Atual' : 'Current Crop'}
              </h3>
              <p className="font-medium text-gray-900">{area.current_crop || (language === 'pt' ? 'Nenhum' : 'None')}</p>
              {area.cultivar && (
                <p className="text-sm text-gray-600">
                  Cultivar: {area.cultivar}
                </p>
              )}
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500">
                {language === 'pt' ? 'Tamanho' : 'Size'}
              </h3>
              <p className="font-medium text-gray-900">
                {area.size} {area.unit}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500">
                {language === 'pt' ? 'Localização' : 'Location'}
              </h3>
              <p className="font-medium text-gray-900">{area.location}</p>
            </div>
            {latestPlanting && (
              <div>
                <h3 className="text-sm font-medium text-gray-500">
                  {language === 'pt' ? 'População' : 'Population'}
                </h3>
                <p className="font-medium text-gray-900">
                  {latestPlanting.seedsPerHectare?.toLocaleString()} {language === 'pt' ? 'sementes/ha' : 'seeds/ha'}
                </p>
                <p className="text-sm text-gray-600">
                  {language === 'pt' ? 'Data do plantio: ' : 'Planting date: '}
                  {formatDate(latestPlanting.startDate)}
                </p>
              </div>
            )}
            {latestHarvest && (
              <div>
                <h3 className="text-sm font-medium text-gray-500">
                  {language === 'pt' ? 'Produtividade' : 'Yield'}
                </h3>
                <p className="font-medium text-gray-900">
                  {latestHarvest.yieldPerHectare?.toLocaleString()} kg/ha
                </p>
                <p className="text-sm text-gray-600">
                  {language === 'pt' ? 'Data da colheita: ' : 'Harvest date: '}
                  {formatDate(latestHarvest.startDate)}
                </p>
              </div>
            )}
            <div className="border-t border-gray-200 pt-4">
              <h3 className="text-sm font-medium text-gray-500 flex items-center">
                <DollarSign className="w-4 h-4 mr-1" />
                {language === 'pt' ? 'Custos' : 'Costs'}
              </h3>
              <div className="mt-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">
                    {language === 'pt' ? 'Total gasto:' : 'Total spent:'}
                  </span>
                  <span className="font-medium text-gray-900">
                    {formatCurrency(totalSpent)}
                  </span>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-sm text-gray-600">
                    {language === 'pt' ? `Custo por ${area.unit}:` : `Cost per ${area.unit}:`}
                  </span>
                  <span className="font-medium text-gray-900">
                    {formatCurrency(costPerUnit)}
                  </span>
                </div>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500">
                {language === 'pt' ? 'Descrição' : 'Description'}
              </h3>
              <p className="text-gray-900">{area.description || (language === 'pt' ? 'Sem descrição.' : 'No description provided.')}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500">
                {language === 'pt' ? 'Criado em' : 'Created'}
              </h3>
              <p className="text-gray-900">{formatDate(area.createdAt)}</p>
            </div>
          </Card.Content>
        </Card>
        
        <Card className="lg:col-span-2">
          <Card.Header>
            <Card.Title className="flex items-center">
              <Calendar className="w-5 h-5 mr-2" />
              {language === 'pt' ? 'Visão Geral das Operações' : 'Operation Overview'}
            </Card.Title>
          </Card.Header>
          <Card.Content>
            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">
                {language === 'pt' ? 'Tipos de Operação' : 'Operation Types'}
              </h3>
              <div className="flex flex-wrap gap-2">
                {['gradagem', 'subsolagem', 'plantio', 'colheita', 'dessecacao', 'herbicida', 'fungicida'].map((type) => {
                  const count = operations.filter((op) => op.type === type).length;
                  
                  return (
                    <Badge key={type} variant={getOperationBadgeVariant(type)}>
                      {getOperationTypeLabel(type)}: {count}
                    </Badge>
                  );
                })}
              </div>
            </div>
            
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">
                {language === 'pt' ? 'Últimas 5 Operações' : 'Last 5 Operations'}
              </h3>
              {operations.length > 0 ? (
                <div className="space-y-2">
                  {operations
                    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
                    .slice(0, 5)
                    .map((operation) => (
                      <div 
                        key={operation.id} 
                        className="py-2 border-b border-gray-200 last:border-b-0"
                      >
                        <div className="flex justify-between">
                          <div>
                            <Badge variant={getOperationBadgeVariant(operation.type)}>
                              {getOperationTypeLabel(operation.type)}
                            </Badge>
                            <h4 className="text-sm font-medium mt-1">{operation.description}</h4>
                            <p className="text-xs text-gray-500">
                              {formatDate(operation.startDate)} • {operation.operatedBy}
                            </p>
                          </div>
                          <Link to={`/operations/${operation.id}`}>
                            <Button variant="ghost" size="sm">
                              {language === 'pt' ? 'Detalhes' : 'Details'}
                            </Button>
                          </Link>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="text-center py-4 text-gray-500 bg-gray-50 rounded-lg">
                  <p>
                    {language === 'pt'
                      ? 'Nenhuma operação registrada para esta área ainda.'
                      : 'No operations recorded for this area yet.'}
                  </p>
                  <Link 
                    to={`/operations/new?areaId=${area.id}`}
                    className="text-green-700 hover:text-green-800 font-medium text-sm mt-2 inline-block"
                  >
                    {language === 'pt' ? 'Adicionar uma operação' : 'Add an operation'}
                  </Link>
                </div>
              )}
            </div>
          </Card.Content>
          <Card.Footer>
            <Link 
              to={`/operations/new?areaId=${area.id}`} 
              className="text-green-700 hover:text-green-800 font-medium text-sm flex items-center"
            >
              <Plus size={16} className="mr-1" />
              {language === 'pt' ? 'Nova Operação' : 'Add New Operation'}
            </Link>
          </Card.Footer>
        </Card>
      </div>
      
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">
          {language === 'pt' ? 'Todas as Operações' : 'All Operations'}
        </h2>
        
        {operations.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {operations
              .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
              .map((operation) => (
                <OperationCard
                  key={operation.id}
                  operation={operation}
                  onDelete={handleDeleteOperation}
                />
              ))}
          </div>
        ) : (
          <div className="text-center py-10 bg-gray-50 rounded-lg">
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {language === 'pt' ? 'Nenhuma operação ainda' : 'No operations yet'}
            </h3>
            <p className="text-gray-600 mb-4">
              {language === 'pt'
                ? 'Comece a registrar operações para esta área para manter um histórico detalhado.'
                : 'Start tracking operations for this area to maintain a detailed history.'}
            </p>
            <Link to={`/operations/new?areaId=${area.id}`}>
              <Button leftIcon={<Plus size={18} />}>
                {language === 'pt' ? 'Adicionar Primeira Operação' : 'Add First Operation'}
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default AreaDetail;