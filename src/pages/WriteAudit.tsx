import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { correctStockEntry, writeErrorMessage } from '../lib/businessWrites';
import { useAppContext } from '../context/AppContext';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';

const client = supabase as unknown as SupabaseClient;
type Movement = { id: string; product_id: string; lot_id: string | null; lot_number_snapshot: string | null;
  movement_type: string; source_type: string; quantity: number; unit_snapshot: string; created_at: string; reason: string | null; operation_id: string | null };
type AuditReport = { stock_discrepancies: { id: string; name: string; total: number; lots: number; ledger: number }[];
  legacy_nested_operations: { id: string; description: string; area_id: string }[] };
type AuditEvent = { id: string; occurred_at: string; table_name: string; action: string; before_data: object | null; after_data: object | null };
const tableNames: Record<string, string> = { operations: 'Operações', products: 'Produtos', product_lots: 'Lotes', areas: 'Áreas',
  seasons: 'Safras', machinery: 'Máquinas', maintenances: 'Manutenções', maintenance_types: 'Tipos de manutenção', notes: 'Anotações',
  field_rainfall: 'Pluviometria', field_monitoring_reports: 'Monitoramentos', field_recommendations: 'Recomendações',
  precision_samples: 'Coletas', precision_zones: 'Zonas', precision_lab_results: 'Resultados laboratoriais', precision_lab_imports: 'Laudos' };

export default function WriteAudit({ stockOnly = false }: { stockOnly?: boolean }) {
  const { profile, products, isOnline, reloadInventory } = useAppContext();
  const [params, setParams] = useSearchParams();
  const product = params.get('product') ?? '';
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [reversed, setReversed] = useState<string[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [report, setReport] = useState<AuditReport>();
  const [selected, setSelected] = useState<Movement>();
  const [cancelling, setCancelling] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!isOnline) return;
    const controller = new AbortController();
    setLoading(true);
    void (async () => {
      if (stockOnly) {
        const query = client.from('inventory_movements').select('*').order('created_at', { ascending: false }).order('id')
          .range(page * 50, page * 50 + 49).abortSignal(controller.signal);
        if (product) query.eq('product_id', product);
        const { data, error } = await query;
        if (error) throw error;
        const rows = data as Movement[];
        const reversals = rows.length ? await client.from('inventory_movements').select('reversal_of')
          .in('reversal_of', rows.map(row => row.id)).abortSignal(controller.signal) : { data: [], error: null };
        if (reversals.error) throw reversals.error;
        if (controller.signal.aborted) return;
        setMovements(rows); setReversed((reversals.data ?? []).map(row => row.reversal_of as string));
      } else if (profile?.isAdmin) {
        const [diagnosis, history] = await Promise.all([
          client.rpc('get_write_audit_report').abortSignal(controller.signal),
          client.from('record_audit_events').select('*').order('occurred_at', { ascending: false }).order('id')
            .range(page * 50, page * 50 + 49).abortSignal(controller.signal),
        ]);
        if (diagnosis.error) throw diagnosis.error;
        if (history.error) throw history.error;
        if (controller.signal.aborted) return;
        setReport(diagnosis.data as AuditReport); setEvents(history.data as AuditEvent[]);
      }
    })().catch(error => { if (!controller.signal.aborted) setMessage(writeErrorMessage(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [isOnline, page, product, profile?.isAdmin, revision, stockOnly]);
  async function correct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || running.current || !isOnline) return;
    const form = new FormData(event.currentTarget);
    const quantity = Number(form.get('quantity'));
    if (!Number.isFinite(quantity)) return;
    const reason = String(form.get('reason') ?? '').trim();
    if (!window.confirm(`Confirmar a correção de ${selected.quantity} para ${quantity} ${selected.unit_snapshot}? O saldo atual mudará em ${quantity - selected.quantity} ${selected.unit_snapshot}.`)) return;
    running.current = true; setBusy(true); setMessage('');
    try {
      await correctStockEntry(selected.id, quantity, reason);
      await reloadInventory();
      setSelected(undefined); setRevision(value => value + 1);
      setMessage('Correção registrada. A entrada original e o estorno foram preservados no histórico. Atualize o estoque para conferir os novos saldos.');
    } catch (error) { setMessage(error instanceof Error ? error.message : writeErrorMessage(error)); }
    finally { running.current = false; setBusy(false); }
  }
  const date = (value: string) => new Date(value).toLocaleString('pt-BR');
  return <div className="space-y-4">
    <h1 className="text-2xl font-bold">{stockOnly ? 'Histórico e correções de estoque' : 'Auditoria de lançamentos'}</h1>
    <div className="flex flex-wrap gap-3"><Link to="/inventory" className="text-brand-700 underline">Voltar ao estoque</Link>
      <Link to={stockOnly ? '/audit' : '/inventory/history'} className="text-brand-700 underline">{stockOnly ? 'Auditoria geral' : 'Histórico de estoque'}</Link>
      <Button variant="outline" disabled={!isOnline || busy || loading} onClick={() => setRevision(value => value + 1)}>Atualizar</Button></div>
    {!isOnline && <p>Conecte-se para consultar o histórico e corrigir lançamentos.</p>}
    {message && <p role="status">{message}</p>}
    {loading && <p role="status">Carregando…</p>}
    {stockOnly ? <>
      <p>Entradas e ajustes podem ser corrigidos ou estornados. O registro original é mantido. Consumos de operações são corrigidos na própria operação. Estoque já utilizado não pode ser apagado.</p>
      <Select label="Produto do histórico" value={product} options={[{ value: '', label: 'Todos os produtos' }, ...products.map(item => ({ value: item.id, label: item.name }))]}
        onChange={event => { setParams(event.target.value ? { product: event.target.value } : {}); setPage(0); setSelected(undefined); }} />
      {selected && <form key={selected.id + String(cancelling)} onSubmit={correct} className="space-y-3 rounded border bg-white p-4" aria-label="Corrigir lançamento de estoque">
        <p>Corrigindo {products.find(item => item.id === selected.product_id)?.name} · {date(selected.created_at)} · {selected.quantity} {selected.unit_snapshot}</p>
        <Input label="Quantidade corrigida (zero para estornar)" name="quantity" type="number" step="any" min={selected.movement_type === 'STOCK_IN' ? 0 : undefined} defaultValue={cancelling ? 0 : selected.quantity} readOnly={cancelling} required disabled={busy} />
        <Input label="Motivo da correção" name="reason" minLength={3} maxLength={1000} required disabled={busy} />
        <div className="flex gap-2"><Button type="submit" disabled={busy}>Confirmar correção</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setSelected(undefined)}>Cancelar</Button></div>
      </form>}
      <ul className="space-y-3">{movements.map(movement => {
        const corrected = reversed.includes(movement.id);
        const editable = !corrected && ['manual','receipt'].includes(movement.source_type) &&
          (movement.movement_type === 'STOCK_IN' || (profile?.isAdmin && ['ADJUSTMENT_IN','ADJUSTMENT_OUT'].includes(movement.movement_type)));
        return <li key={movement.id} className="space-y-2 rounded border bg-white p-3">
          <p className="font-medium">{products.find(item => item.id === movement.product_id)?.name ?? 'Produto'} · {movement.quantity} {movement.unit_snapshot}</p>
          <p>{date(movement.created_at)} · {({ STOCK_IN: 'Entrada', REVERSAL: 'Estorno', OPERATION_CONSUMPTION: 'Consumo de operação',
            ADJUSTMENT_IN: 'Ajuste de entrada', ADJUSTMENT_OUT: 'Ajuste de saída', LOT_CLASSIFICATION: 'Classificação de lote', OPENING_BALANCE: 'Saldo de abertura' } as Record<string,string>)[movement.movement_type]}
            {movement.lot_number_snapshot && ' · Lote ' + movement.lot_number_snapshot}{corrected && ' · Corrigido/estornado'}</p>
          {movement.reason && <p>{movement.reason}</p>}
          {editable && <div className="flex gap-2"><Button size="sm" variant="outline" disabled={!isOnline || busy} onClick={() => { setCancelling(false); setSelected(movement); }}>Editar</Button>
            <Button size="sm" variant="outline" disabled={!isOnline || busy} onClick={() => { setCancelling(true); setSelected(movement); }}>Excluir / estornar</Button></div>}
          {movement.operation_id && <Link className="text-brand-700 underline" to={'/operations/' + movement.operation_id + '/edit'}>Ver operação vinculada</Link>}
        </li>;
      })}</ul>
    </> : !profile?.isAdmin ? <p>A auditoria geral está disponível para administradores da instituição.</p> : <>
      <p>Conferência de leitura: nenhum saldo é recalculado automaticamente. O histórico começa na publicação desta versão.</p>
      {report && <section className="space-y-2 rounded border bg-white p-4">
        <h2 className="font-semibold">Saldos que precisam de conferência</h2>
        {!report.stock_discrepancies.length && <p>Nenhuma divergência de saldo encontrada.</p>}
        {report.stock_discrepancies.map(item => <p key={item.id}><Link className="text-brand-700 underline" to={'/inventory/history?product=' + item.id}>{item.name}</Link>
          {' · Total ' + item.total + ' · Lotes ' + item.lots + ' · Histórico físico ' + item.ledger}</p>)}
        <h2 className="font-semibold">Operações antigas com distribuição a conferir</h2>
        {!report.legacy_nested_operations.length && <p>Nenhuma operação ambígua encontrada.</p>}
        {report.legacy_nested_operations.map(item => <p key={item.id}>{item.description} · {item.id}</p>)}
      </section>}
      <h2 className="font-semibold">Histórico de alterações</h2>
      <ul className="space-y-2">{events.map(event => <li key={event.id} className="rounded border bg-white p-3">
        {date(event.occurred_at)} · {tableNames[event.table_name] ?? event.table_name} · {({ INSERT: 'Criação', UPDATE: 'Edição', DELETE: 'Exclusão' } as Record<string,string>)[event.action]}
        <details><summary>Conferir registro anterior e posterior</summary><pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify({ anterior: event.before_data, posterior: event.after_data }, null, 2)}</pre></details>
      </li>)}</ul>
    </>}
    <div className="flex gap-2"><Button variant="outline" disabled={page === 0 || loading || busy} onClick={() => setPage(value => value - 1)}>Anterior</Button>
      <Button variant="outline" disabled={(stockOnly ? movements : events).length < 50 || loading || busy} onClick={() => setPage(value => value + 1)}>Próxima</Button></div>
  </div>;
}
