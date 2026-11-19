import type { ProductUsage } from '../types';

// Several persisted lines can be sources of the same product. Reopen them as
// one application rate, so changing area size cannot multiply that rate.
export function groupOperationUsage(items: ProductUsage[], size: number): ProductUsage[] {
  const groups = new Map<string, ProductUsage[]>();
  for (const item of items) {
    const key = JSON.stringify([item.productId,item.unitPriceSnapshot,item.unitSnapshot,item.seedCropSnapshot,item.seedCultivarSnapshot]);
    groups.set(key, [...groups.get(key) ?? [], item]);
  }
  return [...groups.values()].map(lines => {
    if (lines.length === 1) return { ...lines[0], dose: size > 0 ? lines[0].quantity / size : lines[0].dose };
    const quantity = lines.reduce((sum, item) => sum + item.quantity, 0);
    const allocations = new Map<string, number>();
    for (const line of lines) for (const source of line.lotAllocations ?? [{ lotId: line.lotId ?? null, quantity: line.quantity }]) {
      const id = source.lotId ?? '';
      allocations.set(id, (allocations.get(id) ?? 0) + source.quantity);
    }
    return { ...lines[0], lotId: undefined, quantity, dose: size > 0 ? quantity / size : lines.reduce((sum, item) => sum + (item.dose ?? 0), 0),
      lotAllocations: [...allocations].map(([lotId, amount]) => ({ lotId: lotId || null, quantity: amount })) };
  });
}
