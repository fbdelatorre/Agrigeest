export const FLOAT_NOISE_THRESHOLD = 1e-5;

const roundUpToCents = (value: number): number => {
  if (Math.abs(value) < FLOAT_NOISE_THRESHOLD) return 0;
  const withoutNoise = Math.round(value * 1e6) / 1e6;
  return Math.ceil(Math.round(withoutNoise * 100 * 1e6) / 1e6) / 100;
};

export const formatQuantity = (value: number, language: 'pt' | 'en' = 'pt'): string => {
  return roundUpToCents(value).toLocaleString(language === 'pt' ? 'pt-BR' : 'en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};
