import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';
import OperationForm from '../../components/operations/OperationForm';
import { Operation } from '../../types';
import { ArrowLeft } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { getFieldRecommendation, type Recommendation } from '../../lib/fieldData';

const OperationCreate = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const copyId = searchParams.get('copy');
  const areaIdParam = searchParams.get('areaId');
  const recommendationId = searchParams.get('recommendation');
  const { addOperation, activeSeason, areas, operations, isOnline } = useAppContext();
  const { language } = useLanguage();
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [recommendationError, setRecommendationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const seasonId = activeSeason?.id;
  const isPt = language === 'pt';

  useEffect(() => {
    if (!recommendationId || !seasonId || !isOnline) return;
    const controller = new AbortController();
    setRecommendation(null);
    setRecommendationError(null);
    void getFieldRecommendation(recommendationId, seasonId, controller.signal)
      .then(result => {
        if (controller.signal.aborted) return;
        if (result && !result.operation_id) setRecommendation(result);
        else setRecommendationError(isPt
          ? 'Recomendação indisponível na safra selecionada ou já realizada.'
          : 'Recommendation unavailable in the selected season or already performed.');
      })
      .catch(() => {
        if (!controller.signal.aborted) setRecommendationError(isPt ? 'Não foi possível carregar a recomendação.' : 'Could not load the recommendation.');
      });
    return () => controller.abort();
  }, [isOnline, isPt, recommendationId, seasonId]);


  const operationToCopy = copyId ? operations.find(op => op.id === copyId) : undefined;
  const initialArea = areaIdParam ? areas.find(a => a.id === areaIdParam) : undefined;
  
  const handleSubmit = async (operationData: Omit<Operation, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (submittingRef.current || (recommendationId && (!recommendation || recommendation.season_id !== seasonId))) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await addOperation(operationData, recommendationId ?? undefined);
      navigate(recommendationId ? '/monitoring' : '/operations');
    } catch (error) {
      console.error('Error creating operation:', error);

      const msg = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';

      if (msg.includes('RECOMMENDATION_ALREADY_EXECUTED')) {
        alert(isPt ? 'Esta recomendação já foi realizada.' : 'This recommendation was already performed.');
        navigate('/monitoring');
      } else if (msg.includes('OPERATION_DATES_OUT_OF_ORDER')) {
        alert(isPt ? 'A data final deve ser igual ou posterior à data inicial.' : 'The end date must be on or after the start date.');
      } else if (msg.includes('INSUFFICIENT_UNTRACKED_STOCK')) {
        alert(isPt
          ? 'Estoque sem lote insuficiente. Selecione um lote com saldo disponível ou ajuste a quantidade.'
          : 'Insufficient untracked stock. Select a lot with available balance or adjust the quantity.');
      } else if (msg.includes('INSUFFICIENT_PRODUCT_STOCK') || msg.includes('INSUFFICIENT_LOT_STOCK')) {
        alert(isPt
          ? 'Estoque insuficiente! Verifique a quantidade disponível dos produtos e tente novamente.'
          : 'Insufficient stock! Check the available quantity of products and try again.');
      } else if (msg.includes('AUTH_REQUIRED') || msg.includes('PROFILE_NOT_FOUND') || msg.includes('PROFILE_NO_INSTITUTION')) {
        alert(isPt
          ? 'Erro de autenticação. Faça login novamente.'
          : 'Authentication error. Please log in again.');
      } else if (msg.includes('AREA_NOT_FOUND_OR_FORBIDDEN')) {
        alert(isPt
          ? 'Área não encontrada ou não pertence à sua instituição.'
          : 'Area not found or does not belong to your institution.');
      } else if (msg.includes('SEASON_NOT_FOUND_OR_FORBIDDEN')) {
        alert(isPt
          ? 'Safra não encontrada ou não pertence à sua instituição.'
          : 'Season not found or does not belong to your institution.');
      } else if (msg.includes('PRODUCT_NOT_FOUND_OR_FORBIDDEN')) {
        alert(isPt
          ? 'Um dos produtos não foi encontrado ou não pertence à sua instituição.'
          : 'One of the products was not found or does not belong to your institution.');
      } else if (msg.includes('LOT_NOT_FOUND_OR_MISMATCH')) {
        alert(isPt
          ? 'Lote não encontrado ou não corresponde ao produto informado.'
          : 'Lot not found or does not match the specified product.');
      } else if (msg.includes('LOT_ALLOCATIONS_TOTAL_MISMATCH')) {
        alert(isPt
          ? 'A soma das origens não corresponde à quantidade total do produto.'
          : 'The sum of lot sources does not match the product total quantity.');
      } else if (msg.includes('DUPLICATE_LOT_ALLOCATION')) {
        alert(isPt
          ? 'Um lote foi selecionado mais de uma vez para o mesmo produto.'
          : 'A lot was selected more than once for the same product.');
      } else if (msg.includes('INVALID_PRODUCTS_USED')) {
        alert(isPt
          ? 'Dados de produtos inválidos. Verifique as quantidades e tente novamente.'
          : 'Invalid product data. Check quantities and try again.');
      } else {
        alert(isPt
          ? msg || 'Erro ao criar operação. Tente novamente.'
          : 'Error creating operation. Please try again.');
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  if (recommendationId) {
    const selected = recommendation?.id === recommendationId && recommendation.season_id === seasonId
      ? recommendation : null;
    const area = selected ? areas.find(item => item.id === selected.area_id) : null;
    return (
      <div className="space-y-4">
        <Link className="font-medium text-brand-700 underline" to="/monitoring">{isPt ? 'Voltar ao monitoramento' : 'Back to monitoring'}</Link>
        <h1 className="text-2xl font-bold">{isPt ? 'Realizar operação recomendada' : 'Perform recommended operation'}</h1>
        {!isOnline ? <p role="status">{isPt ? 'Conecte-se para realizar a operação.' : 'Connect to perform the operation.'}</p>
          : recommendationError ? <p role="alert">{recommendationError}</p>
          : !seasonId ? <p>{isPt ? 'Selecione a safra da recomendação.' : 'Select the recommendation season.'}</p>
          : !selected ? <p role="status">{isPt ? 'Carregando recomendação…' : 'Loading recommendation…'}</p>
          : !area ? <p role="status">{isPt ? 'Talhão indisponível.' : 'Field unavailable.'}</p>
          : (
            <div className="rounded-lg bg-white p-4 shadow-sm">
              <OperationForm key={selected.id} onSubmit={handleSubmit} lockAreaAndType submitting={submitting} initialData={{
                areaId: area.id,
                type: selected.operation_type,
                operationSize: area.size,
                description: selected.instructions || (isPt ? 'Aplicação recomendada' : 'Recommended application'),
                productsUsed: selected.products.map(product => ({
                  productId: product.productId, dose: product.dose, quantity: product.dose * area.size, lotAllocations: []
                }))
              }} />
            </div>
          )}
      </div>
    );
  }

  // If no areas exist, show message to create an area first
  if (areas.length === 0) {
    return (
      <div>
        <div className="mb-6 pt-4 lg:pt-0">
          <Link 
            to="/operations"
            className="text-brand-700 hover:text-brand-800 font-medium text-sm flex items-center"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            {language === 'pt' ? 'Voltar para Operações' : 'Back to Operations'}
          </Link>
        </div>
        
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {language === 'pt' ? 'Nenhuma área cadastrada' : 'No areas registered'}
          </h3>
          <p className="text-gray-600 mb-4">
            {language === 'pt'
              ? 'Você precisa cadastrar uma área antes de registrar operações'
              : 'You need to register an area before recording operations'}
          </p>
          <Link 
            to="/areas/new"
            className="inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-brand-700 hover:bg-brand-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500"
          >
            {language === 'pt' ? 'Cadastrar Área' : 'Register Area'}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 pt-4 lg:pt-0">
        <Link 
          to="/operations"
          className="text-brand-700 hover:text-brand-800 font-medium text-sm flex items-center"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          {language === 'pt' ? 'Voltar para Operações' : 'Back to Operations'}
        </Link>
      </div>
      
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {operationToCopy
            ? (language === 'pt' ? 'Copiar Operação' : 'Copy Operation')
            : (language === 'pt' ? 'Nova Operação' : 'New Operation')}
        </h1>
        <p className="text-gray-600">
          {operationToCopy
            ? (language === 'pt'
                ? 'Revise e ajuste os dados da operação copiada'
                : 'Review and adjust the copied operation data')
            : (language === 'pt'
                ? 'Registre uma nova atividade agrícola'
                : 'Record a new farming activity')}
        </p>
      </div>

      {!activeSeason ? (
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
      ) : (
        <div className="bg-white p-6 rounded-lg shadow-sm">
          <OperationForm
            onSubmit={handleSubmit}
            submitting={submitting}
            initialData={initialArea ? { areaId: initialArea.id, operationSize: initialArea.size } as Partial<Operation> : operationToCopy}
          />
        </div>
      )}
    </div>
  );
};

export default OperationCreate;
