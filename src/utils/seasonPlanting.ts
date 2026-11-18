import type { Operation, Product, ProductUsage } from '../types';

export const defaultSeedCrops = ['SOJA', 'MILHO', 'SORGO', 'FEIJÃO', 'ARROZ', 'ALGODÃO', 'BRAQUIÁRIA', 'NABO'];

export function isSeedCategory(category: string | null | undefined) {
  return ['seed', 'seeds', 'semente', 'sementes'].includes(category?.trim().toLowerCase() ?? '');
}

export function snapshotPlantingSeeds(used: ProductUsage[], products: Product[], previous: ProductUsage[] = []) {
  const priorSeeds = new Map(previous.filter(item => item.seedCultivarSnapshot).map(item => [item.productId, item]));
  const productsById = new Map(products.map(product => [product.id, product]));
  return used.map(item => {
    const prior = priorSeeds.get(item.productId);
    if (prior) return { ...item, seedCultivarSnapshot: prior.seedCultivarSnapshot, seedCropSnapshot: prior.seedCropSnapshot };
    const product = productsById.get(item.productId);
    return product && isSeedCategory(product.category) ? {
      ...item,
      seedCultivarSnapshot: item.productNameSnapshot ?? product.name,
      seedCropSnapshot: product.crop,
    } : item;
  });
}

export function plantingsForSeason(operations: Operation[], seasonId: string | undefined) {
  const latest = new Map<string, Operation>();
  if (!seasonId) return latest;
  for (const operation of operations) {
    if (operation.season_id !== seasonId || operation.type !== 'plantio' || operation.status === 'cancelled') continue;
    const previous = latest.get(operation.areaId);
    if (!previous || operation.startDate > previous.startDate ||
      (+operation.startDate === +previous.startDate && (operation.createdAt > previous.createdAt ||
        (+operation.createdAt === +previous.createdAt && operation.id > previous.id)))) {
      latest.set(operation.areaId, operation);
    }
  }
  return latest;
}

export function plantingDetails(planting: Operation | undefined, products: Product[]) {
  if (!planting) return { current_crop: undefined, cultivar: undefined, plantingDate: undefined, plantingPopulation: undefined };
  const seeds = new Map(products.filter(product => isSeedCategory(product.category)).map(product => [product.id, product.name]));
  const distinct = (names: (string | undefined)[]) => [...new Set(names.filter(Boolean))].join(' / ') || undefined;
  return {
    current_crop: distinct(planting.productsUsed.map(item => item.seedCropSnapshot)),
    cultivar: distinct(planting.productsUsed.map(item => item.seedCultivarSnapshot ??
      (seeds.has(item.productId) ? item.productNameSnapshot ?? seeds.get(item.productId) : undefined))),
    plantingDate: planting.startDate,
    plantingPopulation: planting.seedsPerHectare,
  };
}
