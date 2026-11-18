export const sampleTypes = { soil: 'Solo', foliar: 'Foliar', nematodes: 'Nematoides' } as const;
export const sampleColors = { soil: '#a1491a', foliar: '#087344', nematodes: '#6b45af' } as const;
export const sampleStatuses = {
  collected: 'Coletada', sent: 'Enviada ao laboratório', awaiting: 'Aguardando resultado',
  received: 'Resultado recebido', checked: 'Resultado conferido',
} as const;

export type SampleInput = {
  label: string;
  institution_id: string;
  area_id: string;
  season_id: string | null;
  collected_at: string;
  sample_type: keyof typeof sampleTypes;
  longitude: number;
  latitude: number;
  accuracy_m: number | null;
  point_source: 'gps' | 'map' | 'manual';
  sample_mode: 'individual' | 'composite';
  subsample_count: number;
  depth_from_cm: number | null;
  depth_to_cm: number | null;
  responsible: string;
  laboratory: string;
  notes: string;
  details: Record<string, string>;
  photo: string | null;
};
export type Sample = SampleInput & {
  id: string;
  code: string;
  status: keyof typeof sampleStatuses;
  created_at: string;
  created_by: string | null;
};

export function sampleCode(id: string) {
  return 'AG-' + id.replace(/-/g, '').toUpperCase();
}
