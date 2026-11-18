import { useEffect, useMemo, useRef, useState } from 'react';
import type { Area } from '../../types';
import { listLabResults, precisionClient, type LabResult } from '../../lib/precisionData';
import { knownLabUnit, readLabWorkbook, type LabRow } from '../../lib/precisionSpreadsheet';
import { sampleTypes, type Sample } from '../../lib/precisionTypes';
import Button from '../ui/Button';
import Select from '../ui/Select';

function key(row: { parameter: string; value: number | null; unit: string; method: string; material: string }, sample: string) {
  return JSON.stringify([sample, row.parameter, row.value, row.unit, row.method, row.material]);
}

export default function LabImport({ samples, areas, online, onImported }: {
  samples: Sample[]; areas: Area[]; online: boolean; onImported: () => void;
}) {
  const [file, setFile] = useState<{ name: string; base64: string; rows: LabRow[] } | null>(null);
  const [manual, setManual] = useState<Record<string, string>>({});
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [existing, setExisting] = useState<LabResult[]>([]);
  const [checking, setChecking] = useState(false);
  const [page, setPage] = useState(0);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const job = useRef(0);
  const codes = useMemo(() => new Map(samples.map(sample => [sample.code, sample])), [samples]);
  const ids = useMemo(() => new Map(samples.map(sample => [sample.id, sample])), [samples]);
  const sampleOptions = useMemo(() => [{ value: '', label: 'Selecione uma amostra' }, ...samples.map(sample => ({
    value: sample.id, label: sample.label || sample.code, searchText: sample.code + ' ' + areas.find(area => area.id === sample.area_id)?.name,
  }))], [areas, samples]);
  const review = useMemo(() => {
    const seen = new Set(existing.map(result => key(result, result.sample_id)));
    const previousMethods = new Set(existing.map(result => [result.sample_id, result.parameter, result.unit, result.method].join('|')));
    const previousParameters = new Set(existing.map(result => [result.sample_id, result.parameter].join('|')));
    return (file?.rows ?? []).map((row, index) => {
      const code = row.reported_code.trim().toUpperCase();
      const match = manual[code] ? ids.get(manual[code]) : codes.get(code);
      const valid = row.value !== null && !!row.parameter && row.parameter.length <= 150 && row.original_value.length <= 200;
      const signature = match && valid ? key(row, match.id) : '';
      const duplicate = !!signature && seen.has(signature);
      if (signature && !excluded.has(index)) seen.add(signature);
      const differs = match && previousParameters.has([match.id, row.parameter].join('|')) &&
        !previousMethods.has([match.id, row.parameter, row.unit, row.method].join('|'));
      return { row, index, code, match, valid, duplicate, differs, skipped: excluded.has(index) };
    });
  }, [codes, excluded, existing, file, ids, manual]);
  const selection = useMemo(() => [...new Set((file?.rows ?? []).flatMap(row => {
    const code = row.reported_code.trim().toUpperCase();
    const id = manual[code] || codes.get(code)?.id;
    return id ? [id] : [];
  }))], [codes, file, manual]);

  useEffect(() => {
    setExisting([]);
    if (!online || !selection.length) { setChecking(false); return; }
    const abort = new AbortController();
    setChecking(true);
    void listLabResults(selection, abort.signal).then(results => {
      if (!abort.signal.aborted) setExisting(results);
    }).catch(() => { if (!abort.signal.aborted) setMessage('Não foi possível verificar os resultados já salvos. O servidor ainda verifica duplicatas ao importar.'); })
      .finally(() => { if (!abort.signal.aborted) setChecking(false); });
    return () => abort.abort();
  }, [online, selection]);
  const ready = review.filter(item => !item.skipped && !item.duplicate && item.valid && item.match);
  const incomplete = review.filter(item => !item.skipped && (!item.valid || !item.match)).length;

  async function load(chosen?: File) {
    const task = ++job.current;
    setFile(null); setManual({}); setExcluded(new Set()); setPage(0); setMessage('');
    if (!chosen) { setBusy(false); return; }
    setBusy(true);
    try {
      const loaded = await readLabWorkbook(chosen);
      if (task === job.current) setFile({ name: chosen.name, base64: loaded.original, rows: loaded.rows });
    } catch (error) {
      if (task === job.current) setMessage(error instanceof Error ? error.message : 'Falha ao ler o laudo.');
    } finally { if (task === job.current) setBusy(false); }
  }

  async function confirm() {
    if (!file || busy || checking || incomplete || !ready.length || !online) return;
    setBusy(true); setMessage('');
    try {
      const { data, error } = await precisionClient.rpc('import_precision_lab', {
        p_filename: file.name, p_file: file.base64,
        p_results: ready.map(({ row, match, code }) => ({ ...row, sample_id: match!.id, manually_matched: !!manual[code] })),
      });
      if (error) throw error;
      setMessage(data.saved ? `${data.saved} resultados guardados nos talhões das amostras.` : 'Os resultados deste arquivo já estão registrados.');
      setFile(null);
      onImported();
    } catch {
      setMessage('O servidor recusou a importação. Confira a conexão e os vínculos das amostras. O arquivo permanece disponível para nova tentativa nesta tela.');
    } finally { setBusy(false); }
  }

  return <section className="space-y-4 rounded-lg border bg-white p-4">
    <h2 className="text-lg font-semibold">Importação de Laudos</h2>
    <label className="block text-sm font-medium">Arquivo Excel ou CSV
      <input type="file" accept=".xlsx,.csv" className="mt-1 block max-w-full text-sm" disabled={busy}
        onChange={event => { const chosen = event.target.files?.[0]; event.target.value = ''; void load(chosen); }} />
    </label>
    {!online && <p role="status" className="text-sm">Conecte-se para confirmar e guardar o laudo na fazenda.</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
    {file && <>
      <p className="text-sm">{file.name} · {ready.length} prontos · {incomplete} para conferir{checking ? ' · verificando histórico…' : ''}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[790px] text-left text-sm">
          <thead><tr>{['Amostra e talhão', 'Parâmetro', 'Resultado original', 'Unidade e método', 'Conferência'].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead>
          <tbody>{review.slice(page * 25, (page + 1) * 25).map(({ row, index, code, match, valid, duplicate, differs, skipped }) =>
            <tr className="border-t align-top" key={index}>
              <td className="p-2">
                <span className="break-all">{row.reported_code}</span><br />
                {match && <span>{areas.find(area => area.id === match.area_id)?.name} · {sampleTypes[match.sample_type]}</span>}
                {!codes.has(code) && !skipped && <Select aria-label={`Vincular ${row.reported_code}`} value={manual[code] ?? ''}
                  options={sampleOptions} onChange={event => setManual(current => ({ ...current, [code]: event.target.value }))} />}
              </td>
              <td className="p-2">{row.parameter}<br /><small>{row.source}</small></td>
              <td className="p-2">{row.original_value || '—'}</td>
              <td className="p-2">{row.unit ? knownLabUnit(row.unit) ? row.unit : 'Unidade a conferir · ' + row.unit : 'Unidade ausente'}
                {row.method && <><br />{row.method}</>}{row.material && <><br />{row.material}</>}</td>
              <td className="p-2">
                {duplicate ? 'Já registrado ou repetido no arquivo' : !match ? 'Amostra sem correspondência'
                  : !valid ? 'Resultado inválido ou não numérico' : differs ? 'Unidade ou método difere do histórico'
                    : manual[code] ? 'Vínculo manual' : 'Código localizado'}
                <label className="mt-1 block"><input type="checkbox" className="mr-1" checked={skipped} onChange={event => {
                  const skip = event.target.checked;
                  setExcluded(current => { const next = new Set(current); if (skip) next.add(index); else next.delete(index); return next; });
                }} /> Ignorar linha</label>
              </td>
            </tr>)}</tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</Button>
        <Button variant="outline" size="sm" disabled={(page + 1) * 25 >= review.length} onClick={() => setPage(page + 1)}>Próxima</Button>
        <Button disabled={!online || busy || checking || !!incomplete || !ready.length} onClick={() => void confirm()}>Confirmar importação</Button>
      </div>
    </>}
  </section>;
}
