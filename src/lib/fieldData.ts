import type { SupabaseClient } from '@supabase/supabase-js';
import type { Json } from './database.types';
import { supabase } from './supabase';
import { dateToInputValue } from '../utils/dateHelpers';
import { precisionClient } from './precisionData';
import type { SampleInput } from './precisionTypes';

type FieldScope = { institution_id: string; season_id: string; area_id: string };
type RecordMetadata = { id: string; created_at: string; created_by: string };

export type MonitoringInput = FieldScope & { observed_on: string; phenological_stage: string; report: string };
export type MonitoringReport = MonitoringInput & RecordMetadata;
export type RecommendedProduct = { productId: string; name: string; unit: string; dose: number };
type RecommendationDetails = FieldScope & { report_id: string; operation_type: string; instructions: string };
export type RecommendationInput = RecommendationDetails & { products: Pick<RecommendedProduct, 'productId' | 'dose'>[] };
export type Recommendation = RecommendationDetails & RecordMetadata & {
  products: RecommendedProduct[];
  operation_id: string | null;
  executed_at: string | null;
  executed_by: string | null;
};
export type RainfallInput = FieldScope & { observed_on: string; millimeters: number };
export type RainfallPeriod = 'week' | 'month' | 'season';
type OperationArgs = {
  p_start_date: string;
  p_description: string;
  p_operated_by: string;
  p_end_date: string | null;
  p_next_operation_date: string | null;
  p_notes: string | null;
  p_products_used: Json;
  p_operation_size: number | null;
  p_yield_per_hectare: number | null;
  p_seeds_per_hectare: number | null;
};

type FieldTable<Row, Insert> = { Row: Row; Insert: Insert; Update: never; Relationships: [] };
type FieldDatabase = {
  public: {
    Tables: {
      field_monitoring_reports: FieldTable<MonitoringReport, MonitoringInput>;
      field_recommendations: FieldTable<Recommendation, RecommendationInput>;
      field_rainfall: FieldTable<RainfallInput & RecordMetadata, RainfallInput>;
    };
    Views: Record<never, never>;
    Functions: {
      get_field_rainfall_totals: {
        Args: { p_season_id: string; p_from: string | null; p_to: string };
        Returns: { area_id: string; millimeters: number }[];
      };
      execute_field_recommendation: {
        Args: OperationArgs & { p_recommendation_id: string };
        Returns: Json;
      };
    };
  };
};

// The field tables use the application's existing authenticated Supabase connection.
const fieldClient = supabase as unknown as SupabaseClient<FieldDatabase>;
const REPORT_PAGE_SIZE = 30;

export async function listFieldReports(seasonId: string, areaId: string, page: number, signal: AbortSignal) {
  const first = page * REPORT_PAGE_SIZE;
  const query = fieldClient.from('field_monitoring_reports').select('*', { count: 'exact' })
    .eq('season_id', seasonId)
    .order('observed_on', { ascending: false }).order('created_at', { ascending: false }).order('id')
    .range(first, first + REPORT_PAGE_SIZE - 1).abortSignal(signal);
  if (areaId) query.eq('area_id', areaId);
  const { data: reports, error, count } = await query;
  if (error) throw error;

  if (!reports.length) return { reports, recommendations: [], hasNext: false };
  const { data: recommendations, error: recommendationError } = await fieldClient.from('field_recommendations')
    .select('*').eq('season_id', seasonId).in('report_id', reports.map(report => report.id))
    .order('created_at', { ascending: false }).abortSignal(signal);
  if (recommendationError) throw recommendationError;
  return { reports, recommendations, hasNext: (count ?? 0) > first + reports.length };
}

export async function getFieldRecommendation(id: string, seasonId: string, signal: AbortSignal) {
  const { data, error } = await fieldClient.from('field_recommendations')
    .select('*').eq('id', id).eq('season_id', seasonId).abortSignal(signal).maybeSingle();
  if (error) throw error;
  return data;
}

export type FieldSubmission =
  | { kind: 'report'; record: MonitoringInput & { id: string } }
  | { kind: 'recommendation'; record: RecommendationInput & { id: string } }
  | { kind: 'rainfall'; record: RainfallInput & { id: string } }
  | { kind: 'sample'; record: SampleInput & { id: string } };

export async function syncFieldSubmission(submission: FieldSubmission, userId: string, token: string, signal: AbortSignal) {
  const table = submission.kind === 'report' ? 'field_monitoring_reports'
    : submission.kind === 'recommendation' ? 'field_recommendations' : 'field_rainfall';

  const insert = submission.kind === 'sample' ? precisionClient.from('precision_samples').insert(submission.record)
    : submission.kind === 'report' ? fieldClient.from('field_monitoring_reports').insert(submission.record)
    : submission.kind === 'recommendation' ? fieldClient.from('field_recommendations').insert(submission.record)
    : fieldClient.from('field_rainfall').insert(submission.record);
  const { error, status } = await insert.setHeader('Authorization', 'Bearer ' + token).abortSignal(signal);
  if (!error) return { state: 'sent' } as const;
  if (signal.aborted || status === 0 || status === 401 || status === 408 || status === 429 || status >= 500) {
    return { state: 'retry' } as const;
  }

  // An existing client ID can mean the write succeeded but the response was lost.
  const receiptQuery = submission.kind === 'sample' ? precisionClient.from('precision_samples').select('id') : fieldClient.from(table).select('id');
  const receipt = await receiptQuery
    .eq('id', submission.record.id).eq('created_by', userId)
    .eq('institution_id', submission.record.institution_id).setHeader('Authorization', 'Bearer ' + token).abortSignal(signal).maybeSingle();
  if (receipt.error) return { state: 'retry' } as const;
  if (receipt.data) return { state: 'sent' } as const;
  return { state: 'blocked', reason: error.code === '23505' && submission.kind === 'rainfall'
    ? 'duplicate-rainfall' : 'rejected' } as const;
}

export async function getFieldRainfallTotals(seasonId: string, period: RainfallPeriod, signal: AbortSignal) {
  const today = new Date();
  const start = new Date(today);
  if (period === 'week') start.setDate(today.getDate() - (today.getDay() + 6) % 7);
  if (period === 'month') start.setDate(1);
  const { data, error } = await fieldClient.rpc('get_field_rainfall_totals', {
    p_season_id: seasonId,
    p_from: period === 'season' ? null : dateToInputValue(start),
    p_to: dateToInputValue(today)
  }).abortSignal(signal);
  if (error) throw error;
  return Object.fromEntries(data.map(row => [row.area_id, Number(row.millimeters)]));
}

export async function executeFieldRecommendation(id: string, operation: OperationArgs) {
  const { data, error } = await fieldClient.rpc('execute_field_recommendation', {
    ...operation,
    p_recommendation_id: id
  });
  if (error) throw error;
  return data;
}

export async function listFieldRainfall(seasonId: string, areaId: string, page: number, signal: AbortSignal) {
  const first = page * 30;
  const query = fieldClient.from('field_rainfall').select('*', { count: 'exact' })
    .eq('season_id', seasonId).order('observed_on', { ascending: false })
    .order('created_at', { ascending: false }).order('id').range(first, first + 29).abortSignal(signal);
  if (areaId) query.eq('area_id', areaId);
  const { data, error, count } = await query;
  if (error) throw error;
  return { readings: data, hasNext: (count ?? 0) > first + data.length };
}
