import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Json } from './database.types';
import type { Sample, SampleInput } from './precisionTypes';
import type { Polygon } from 'geojson';

export type LabResult = {
  id: string; sample_id: string; import_id: string; parameter: string; value: number;
  created_by: string | null; created_at: string;
  original_value: string; unit: string; method: string; source: string; reported_code: string;
  material: string; manually_matched: boolean;
  original_parameter?: string | null;
};
export type SamplingZoneInput = {
  institution_id: string; area_id: string; season_id: string | null; name: string; campaign: string; geometry: Polygon;
};
export type SamplingZone = SamplingZoneInput & { id: string; updated_at: string };
type ReadTable<T> = { Row: T; Insert: never; Update: never; Relationships: [] };
type PrecisionDb = { public: {
  Tables: {
    precision_samples: { Row: Sample; Insert: SampleInput & { id: string };
      Update: Partial<Pick<Sample, 'label' | 'status' | 'zone_id'>>; Relationships: [] };
    precision_lab_results: ReadTable<LabResult>;
    precision_lab_imports: ReadTable<{ id: string; filename: string; file_base64: string }>;
    precision_zones: { Row: SamplingZone; Insert: SamplingZoneInput;
      Update: Pick<SamplingZoneInput, 'name' | 'campaign' | 'geometry'>; Relationships: [] };
  };
  Views: Record<never, never>;
  Functions: {
    import_precision_lab: {
      Args: { p_filename: string; p_file: string; p_results: Json };
      Returns: { import_id: string; saved: number };
    };
  };
} };
export const precisionClient = supabase as unknown as SupabaseClient<PrecisionDb>;
const sampleColumns = 'id,code,lab_code,zone_id,label,institution_id,area_id,season_id,collected_at,sample_type,status,longitude,latitude,accuracy_m,point_source,sample_mode,subsample_count,depth_from_cm,depth_to_cm,responsible,laboratory,notes,details,created_at,created_by';

export async function listSamplingZones(season: string, area: string, _page: number, signal: AbortSignal) {
  const zones: SamplingZone[] = [];
  for (let first = 0; ; first += 250) {
    const query = precisionClient.from('precision_zones').select('*').order('name').order('id')
      .range(first, first + 249).abortSignal(signal);
    if (season) query.eq('season_id', season);
    if (area) query.eq('area_id', area);
    const { data, error } = await query;
    if (error) throw error;
    zones.push(...data);
    if (data.length < 250) return zones;
  }
}

export async function listSamples(season: string, area: string, _page: number, signal: AbortSignal) {
  const samples: Sample[] = [];
  for (let first = 0; ; first += 250) {
    const query = precisionClient.from('precision_samples').select(sampleColumns).order('collected_at', { ascending: false })
      .order('id').range(first, first + 249).abortSignal(signal);
    if (season) query.eq('season_id', season);
    if (area) query.eq('area_id', area);
    const { data, error } = await query;
    if (error) throw error;
    samples.push(...data.map(sample => ({ ...sample, photo: null })));
    if (data.length < 250) return samples;
  }
}

export async function getSamplePhoto(id: string, signal: AbortSignal) {
  const { data, error } = await precisionClient.from('precision_samples').select('photo').eq('id', id).abortSignal(signal).single();
  if (error) throw error;
  return data.photo;
}

export async function listLabResults(samples: string[], signal: AbortSignal) {
  const results: LabResult[] = [];
  for (let offset = 0; offset < samples.length; offset += 50) {
    for (let first = 0; ; first += 250) {
      const { data, error } = await precisionClient.from('precision_lab_results').select('*')
        .in('sample_id', samples.slice(offset, offset + 50)).order('id')
        .range(first, first + 249).abortSignal(signal);
      if (error) throw error;
      results.push(...data);
      if (data.length < 250) break;
    }
  }
  return results;
}

export async function listMapSamples(season: string, area: string, _page: number, signal: AbortSignal) {
  const samples: Pick<Sample, 'id' | 'area_id' | 'longitude' | 'latitude' | 'sample_type' | 'sample_mode'>[] = [];
  for (let first = 0; ; first += 250) {
    const query = precisionClient.from('precision_samples').select('id,area_id,longitude,latitude,sample_type,sample_mode')
      .eq('season_id', season).order('id').range(first, first + 249).abortSignal(signal);
    if (area) query.eq('area_id', area);
    const { data, error } = await query;
    if (error) throw error;
    samples.push(...data);
    if (data.length < 250) return samples;
  }
}
