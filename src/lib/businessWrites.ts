import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';
const client = supabase as unknown as SupabaseClient;

// Keep the same key after a lost acknowledgement, including a page reload.
export async function requestKey(body: object) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('AUTH_REQUIRED');
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
  const storageKey = 'agrigest-write:' + session.user.id + ':' + digest;
  let id = sessionStorage.getItem(storageKey);
  if (!id) { id = crypto.randomUUID(); sessionStorage.setItem(storageKey, id); }
  return { id, acknowledge: () => sessionStorage.removeItem(storageKey) };
}

export async function auditedStockRpc<T = unknown>(method: string, args: object): Promise<{ data: T; error: null }> {
  const body = { p_method: method, p_args: args };
  const key = await requestKey(body);
  const { data, error } = await client.rpc('stock_write_request', { ...body, p_request_id: key.id });
  if (error) throw new Error(writeErrorMessage(error));
  key.acknowledge();
  return { data: data as T, error: null };
}

export async function correctStockEntry(id: string, quantity: number, reason: string) {
  const body = { p_movement_id: id, p_quantity: quantity, p_reason: reason };
  const key = await requestKey(body);
  const { error } = await client.rpc('correct_stock_entry', { ...body, p_request_id: key.id });
  if (error) throw new Error(writeErrorMessage(error));
  key.acknowledge();
}

export function writeErrorMessage(error: unknown): string {
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error);
  if (/^(Outra pessoa|Esta operação antiga|Saldo sem lote|Estoque insuficiente|Este registro|Este produto|A unidade|Já existe|Registro indisponível|Não foi possível|Este lote|O lote)/.test(message)) return message;
  if (/RECORD_CONFLICT|40001|STALE|Cannot coerce.*single|JSON object requested/.test(message)) return 'Outra pessoa alterou este registro. Atualize a página e confira os dados antes de salvar novamente.';
  if (/LICENSE_OR_ROLE_FORBIDS_OPERATION|ACTIVE_LICENSE_REQUIRED/.test(message)) return 'Esta ação exige função permitida, licença ativa e instalação autorizada. Atualize as permissões na parte superior do aplicativo; nenhum lançamento foi alterado.';
  if (/FARM_SCOPE_MISMATCH|RECEIPT_FARM_SCOPE_MISMATCH|FARM_ACCESS_REQUIRED/.test(message)) return 'Este lançamento pertence a outra fazenda ou seu acesso foi encerrado. Confira a conta e a fazenda antes de tentar novamente.';
  if (/LEGACY_STOCK_REVIEW_REQUIRED/.test(message)) return 'Esta operação antiga tem uma distribuição de estoque que precisa de conferência. Nenhum saldo foi alterado. Consulte a auditoria antes de editar ou cancelar.';
  if (/INSUFFICIENT_UNTRACKED/.test(message)) return 'Saldo sem lote insuficiente. Selecione os lotes que serão utilizados.';
  if (/INSUFFICIENT_(PRODUCT|LOT)_STOCK/.test(message)) return 'Estoque insuficiente. Atualize os saldos e confira a distribuição entre lotes.';
  if (/RECOMMENDATION_ALREADY_EXECUTED|OPERATION_ALREADY_CANCELLED/.test(message)) return 'Este registro já foi realizado ou cancelado. Confira o histórico da operação vinculada.';
  if (/RECORD_HAS_DEPENDENCIES|foreign key|23503/.test(message)) return 'Este registro possui histórico vinculado. Remova ou corrija os vínculos antes de excluir; nenhum dado foi apagado.';
  if (/PRODUCT_HAS_STOCK/.test(message)) return 'Este produto ainda tem estoque. Confira o saldo e o histórico antes de excluir.';
  if (/LOT_HAS_LEDGER_HISTORY/.test(message)) return 'Este lote possui movimentações e não pode ser apagado. Arquive-o quando o saldo estiver zerado.';
  if (/LOT_NOT_EMPTY/.test(message)) return 'O lote precisa estar zerado para ser arquivado. Confira os lançamentos antes de ajustar o saldo.';
  if (/LOT_ARCHIVED/.test(message)) return 'Este lote está arquivado. Atualize o estoque e escolha um lote ativo.';
  if (/PRODUCT_UNIT_HAS_HISTORY/.test(message)) return 'A unidade não pode mudar em um produto com estoque ou histórico de uso. Cadastre outro produto para a nova unidade.';
  if (/23505|duplicate key/.test(message)) return 'Já existe um registro com essa identificação, talhão ou data. Confira antes de salvar.';
  if (/NOT_FOUND_OR_FORBIDDEN|AUTH_REQUIRED|42501/.test(message)) return 'Registro indisponível ou sem permissão. Atualize a página e confira sua sessão.';
  if (/FUTURE_OBSERVATION|INVALID_|check constraint|OUT_OF_ORDER|EXCEEDS_AREA/.test(message)) return 'Confira as datas, os valores e o tamanho da área. Nenhuma alteração foi salva.';
  return 'Não foi possível confirmar o salvamento. Confira a conexão e tente novamente; a mesma tentativa não será gravada duas vezes.';
}

export async function mutateBusinessRecord<T>(table: string, record: object, action: 'update' | 'delete', changes: object = {}): Promise<T> {
  const row = record as Record<string, unknown>;
  const expected = row.updated_at ? { updated_at: row.updated_at } : Object.fromEntries(
    Object.entries(row).filter(([key, value]) => !['photo', 'file_base64'].includes(key) && value !== undefined));
  const body = { p_table: table, p_id: row.id, p_action: action, p_expected: expected, p_changes: changes };
  const key = await requestKey(body);
  const { data, error } = await client.rpc('mutate_business_record', { ...body, p_request_id: key.id });
  if (error) throw new Error(writeErrorMessage(error));
  key.acknowledge();
  return data as T;
}

export async function writeOperationRequest<T>(action: 'create' | 'update' | 'cancel', payload: object): Promise<T> {
  const body = { p_action: action, p_payload: payload };
  const key = await requestKey(body);
  const { data, error } = await client.rpc('write_operation_request', { ...body, p_request_id: key.id });
  if (error) throw new Error(writeErrorMessage(error));
  key.acknowledge();
  return data as T;
}

export type StoredDates = { created_at: string; updated_at: string; user_id: string | null; institution_id: string };
export async function insertBusinessRecord<T>(table: string, payload: object): Promise<{ data: T; error: null }> {
  const key = await requestKey({ table, insert: payload });
  const { data, error } = await client.from(table).insert({ ...payload, id: key.id }).select().single();
  if (!error) { key.acknowledge(); return { data: data as T, error: null }; }
  // The UUID was allocated for this payload, scoped to the authenticated user.
  // A receipt read recovers only this insertion, never a row matched by its name.
  const receipt = await client.from(table).select().eq('id', key.id).single();
  if (receipt.error) throw new Error(writeErrorMessage(error));
  key.acknowledge();
  return { data: receipt.data as T, error: null };
}
