export const standardParameters = [
  'pH', 'Fósforo', 'Potássio', 'Cálcio', 'Magnésio', 'Alumínio', 'H+Al', 'Matéria orgânica', 'Carbono', 'Nitrogênio',
  'Enxofre', 'Boro', 'Zinco', 'Cobre', 'Ferro', 'Manganês', 'CTC', 'Saturação por bases', 'Saturação por alumínio',
  'Pratylenchus', 'Meloidogyne', 'Heterodera', 'Rotylenchulus',
];

export function interpretLabels(content: unknown, count: number) {
  if (typeof content !== 'string' || content.length > 12000) return [];
  const parsed = JSON.parse(content);
  if (!Array.isArray(parsed?.suggestions)) return [];
  const mapping = new Map<number, string>();
  for (const item of parsed.suggestions) {
    if (Number.isInteger(item?.index) && item.index >= 0 && item.index < count && standardParameters.includes(item.parameter)) {
      mapping.set(item.index, item.parameter);
    }
  }
  return Array.from(mapping, ([index, parameter]) => ({ index, parameter }));
}
