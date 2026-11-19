import { useRef, useState, type FormEvent } from 'react';
import { mutateBusinessRecord, writeErrorMessage } from '../../lib/businessWrites';
import { useAppContext } from '../../context/AppContext';
import { useFieldSync } from '../../context/FieldSyncContext';
import type { QueueEntry } from '../../lib/fieldQueue';
import Button from './Button';
import Input from './Input';
import Select from './Select';

type Field = { key: string; label: string; type?: 'text' | 'number' | 'date' | 'textarea' | 'datetime-local';
  required?: boolean; min?: number; max?: number; nullable?: boolean; options?: { value: string; label: string }[] };
export const recordFields: Record<string, Field[]> = {
  seasons: [{ key: 'name', label: 'Nome da safra', required: true }, { key: 'start_date', label: 'Data inicial', type: 'date', required: true },
    { key: 'end_date', label: 'Data final', type: 'date', nullable: true }, { key: 'description', label: 'Descrição', type: 'textarea', nullable: true }],
  maintenance_types: [{ key: 'name', label: 'Nome do tipo de manutenção', required: true }, { key: 'description', label: 'Descrição', type: 'textarea', nullable: true }],
  field_rainfall: [{ key: 'observed_on', label: 'Data', type: 'date', required: true },
    { key: 'millimeters', label: 'Chuva acumulada no dia (mm)', type: 'number', min: 0, max: 3000, required: true }],
  field_monitoring_reports: [{ key: 'observed_on', label: 'Data', type: 'date', required: true },
    { key: 'phenological_stage', label: 'Estádio fenológico', required: true }, { key: 'report', label: 'Relatório de monitoramento', type: 'textarea', required: true }],
  field_recommendations: [{ key: 'operation_type', label: 'Tipo de aplicação', required: true,
    options: ['fungicida','inseticida','herbicida','dessecacao','adubacao','pulverizacao'].map(value => ({ value, label: value })) },
    { key: 'instructions', label: 'Orientações', type: 'textarea' }],
  precision_samples: [{ key: 'label', label: 'Nome curto' }, { key: 'lab_code', label: 'Código do laboratório', nullable: true },
    { key: 'collected_at', label: 'Data da coleta', type: 'datetime-local', required: true },
    { key: 'responsible', label: 'Responsável', required: true }, { key: 'laboratory', label: 'Laboratório' },
    { key: 'depth_from_cm', label: 'Profundidade inicial (cm)', type: 'number', min: 0, max: 1000, nullable: true },
    { key: 'depth_to_cm', label: 'Profundidade final (cm)', type: 'number', min: 0, max: 1000, nullable: true },
    { key: 'notes', label: 'Observações', type: 'textarea' }],
  precision_lab_results: [{ key: 'parameter', label: 'Parâmetro', required: true },
    { key: 'value', label: 'Resultado numérico', type: 'number', required: true },
    { key: 'original_value', label: 'Resultado informado', required: true }, { key: 'unit', label: 'Unidade' },
    { key: 'method', label: 'Método' }, { key: 'material', label: 'Material' }],
};

export default function RecordActions({ table, record, onSaved, queued, locked = false, hideDelete = false, fields = recordFields[table] ?? [] }: {
  table: string; record: object; onSaved: () => void; queued?: QueueEntry; locked?: boolean; hideDelete?: boolean; fields?: Field[];
}) {
  const { isOnline, products } = useAppContext();
  const sync = useFieldSync();
  const row = record as Record<string, unknown>;
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const editBaseline = useRef(record);
  const [message, setMessage] = useState('');
  const [items, setItems] = useState(() => (row.products as { productId: string; dose: number }[] ?? [])
    .map(item => ({ productId: item.productId, dose: String(item.dose) })));
  const ready = isOnline && (!queued || queued.state === 'sent') && !locked;
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || running.current) return;
    const form = new FormData(event.currentTarget);
    const changes: Record<string, unknown> = {};
    for (const field of fields) {
      const value = String(form.get(field.key) ?? '').trim();
      changes[field.key] = !value && field.nullable ? null : field.type === 'number' ? Number(value.replace(',', '.'))
        : field.type === 'datetime-local' ? new Date(value).toISOString() : value;
    }
    if (table === 'field_recommendations') {
      if (!items.length || items.some(item => !item.productId || !Number.isFinite(Number(item.dose)) || Number(item.dose) <= 0)
        || new Set(items.map(item => item.productId)).size !== items.length) {
        setMessage('Selecione cada produto uma única vez e informe uma dose positiva.'); return;
      }
      changes.products = items.map(item => ({ productId: item.productId, dose: Number(item.dose) }));
    }
    await perform('update', changes);
  }
  async function perform(action: 'update' | 'delete', changes = {}) {
    if (!ready || running.current) return;
    if (action === 'delete' && !window.confirm('Excluir este registro? Se houver vínculos, a exclusão será bloqueada para preservar o histórico.')) return;
    running.current = true; setBusy(true); setMessage('');
    try {
      const updated = await mutateBusinessRecord<object>(table, action === 'update' ? editBaseline.current : record, action, changes);
      await sync.forget(String(row.id), action === 'update' ? updated : undefined);
      setEditing(false); onSaved();
    } catch (error) { setMessage(error instanceof Error ? error.message : writeErrorMessage(error)); }
    finally { running.current = false; setBusy(false); }
  }
  function initial(field: Field) {
    const value = row[field.key];
    if (value == null) return '';
    if (field.type === 'datetime-local') {
      const date = new Date(String(value));
      return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    }
    return String(value);
  }
  return <div className="space-y-2 text-sm">
    <div className="flex flex-wrap gap-2">
      {fields.length > 0 && <Button size="sm" variant="outline" disabled={!ready || busy} onClick={() => {
        setMessage('');
        editBaseline.current = record;
        setItems((row.products as { productId: string; dose: number }[] ?? []).map(item => ({ productId: item.productId, dose: String(item.dose) })));
        setEditing(!editing);
      }}>Editar</Button>}
      {!hideDelete && <Button size="sm" variant="outline" disabled={!ready || busy} onClick={() => void perform('delete')}>Excluir</Button>}
    </div>
    {locked && <p>Recomendação já realizada: edite ou cancele a operação vinculada para corrigir o consumo. O histórico da recomendação é preservado.</p>}
    {!locked && !ready && <p>Conecte-se e aguarde a sincronização para editar ou excluir este registro.</p>}
    {message && <p role="alert">{message}</p>}
    {editing && <form onSubmit={save} className="space-y-3 rounded border bg-white p-3" aria-label="Editar registro">
      {fields.map(field => field.options ? <Select key={field.key} name={field.key} label={field.label} options={field.options}
        defaultValue={initial(field)} required={field.required} disabled={busy} />
        : field.type === 'textarea' ? <label key={field.key} className="block">{field.label}<textarea className="block w-full rounded border p-2"
          name={field.key} defaultValue={initial(field)} required={field.required} disabled={busy} maxLength={12000} /></label>
          : <Input key={field.key} name={field.key} label={field.label} type={field.type ?? 'text'} defaultValue={initial(field)}
            min={field.min} max={field.max} step={field.type === 'number' ? 'any' : undefined} required={field.required} disabled={busy} />)}
      {table === 'field_recommendations' && <div className="space-y-2">
        <p>Produtos e doses por unidade de área do talhão. Salvar a recomendação não desconta estoque.</p>
        {items.map((item, i) => <div key={i} className="flex flex-wrap items-end gap-2">
          <Select label="Produto" value={item.productId} disabled={busy} required options={products.map(product => ({ value: product.id, label: product.name }))}
            onChange={event => setItems(previous => previous.map((value, n) => n === i ? { ...value, productId: event.target.value } : value))} />
          <Input label="Dose" type="number" step="any" min="0.00000001" value={item.dose} required disabled={busy}
            onChange={event => setItems(previous => previous.map((value, n) => n === i ? { ...value, dose: event.target.value } : value))} />
          <Button type="button" variant="outline" disabled={busy} onClick={() => setItems(previous => previous.filter((_, n) => n !== i))}>Remover produto</Button>
        </div>)}
        <Button type="button" variant="outline" disabled={busy || items.length >= 50} onClick={() => setItems(previous => [...previous, { productId: '', dose: '' }])}>Adicionar produto</Button>
      </div>}
      {table === 'precision_lab_results' && <p>O arquivo original do laboratório é mantido; a correção fica no histórico de alterações.</p>}
      <div className="flex gap-2"><Button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar alterações'}</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => setEditing(false)}>Cancelar</Button></div>
    </form>}
  </div>;
}
