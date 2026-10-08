import { ProductUsage, Product, Operation, Area } from '../types';

export type CostSource = 'snapshot' | 'fallback' | 'unknown';

export interface UsageCostResult {
  cost: number;
  source: CostSource;
  productName: string;
  unit: string;
}

export interface OperationCostResult {
  knownCost: number;
  hasUnknownCost: boolean;
  hasEstimatedCost: boolean;
  perUsage: UsageCostResult[];
}

export function calculateUsageCost(
  usage: ProductUsage,
  getProductById: (id: string) => Product | undefined
): UsageCostResult {
  const product = getProductById(usage.productId);

  if (
    usage.unitPriceSnapshot !== undefined &&
    usage.unitPriceSnapshot !== null &&
    !isNaN(usage.unitPriceSnapshot)
  ) {
    return {
      cost: usage.quantity * usage.unitPriceSnapshot,
      source: 'snapshot',
      productName: usage.productNameSnapshot || product?.name || (product ? product.name : 'Produto removido'),
      unit: usage.unitSnapshot || product?.unit || '',
    };
  }

  if (product) {
    return {
      cost: usage.quantity * product.price,
      source: 'fallback',
      productName: product.name,
      unit: product.unit,
    };
  }

  return {
    cost: 0,
    source: 'unknown',
    productName: usage.productNameSnapshot || 'Produto removido',
    unit: usage.unitSnapshot || '',
  };
}

export function calculateOperationCost(
  operation: Operation,
  getProductById: (id: string) => Product | undefined
): OperationCostResult {
  const perUsage: UsageCostResult[] = [];
  let knownCost = 0;
  let hasUnknownCost = false;
  let hasEstimatedCost = false;

  if (operation.productsUsed && operation.productsUsed.length > 0) {
    for (const usage of operation.productsUsed) {
      const result = calculateUsageCost(usage, getProductById);
      perUsage.push(result);

      if (result.source === 'unknown') {
        hasUnknownCost = true;
      } else if (result.source === 'fallback') {
        hasEstimatedCost = true;
        knownCost += result.cost;
      } else {
        knownCost += result.cost;
      }
    }
  }

  return { knownCost, hasUnknownCost, hasEstimatedCost, perUsage };
}

export function getEffectiveArea(operation: Operation, area?: Area): number {
  if (operation.operationSize > 0) return operation.operationSize;
  return area?.size || 0;
}

export function calculateCostPerHectare(
  operation: Operation,
  area: Area | undefined,
  getProductById: (id: string) => Product | undefined
): { costPerHectare: number; hasUnknownCost: boolean; hasEstimatedCost: boolean } {
  const { knownCost, hasUnknownCost, hasEstimatedCost } = calculateOperationCost(operation, getProductById);
  const effectiveArea = getEffectiveArea(operation, area);
  const costPerHectare = effectiveArea > 0 ? knownCost / effectiveArea : 0;
  return { costPerHectare, hasUnknownCost, hasEstimatedCost };
}
