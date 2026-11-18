import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { dateToInputValue } from '../../utils/dateHelpers';
import { useOfflineStorage } from '../../hooks/useOfflineStorage';
import PrecisionMap, { type IndexImage, type MapField, type MapSample, type MapZone } from '../farmMap/PrecisionMap';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import { vegetationColors, type VegetationIndex } from '../../../supabase/functions/precision-sentinel/processing';

type Scene = { date: string; time: string; sceneCloud: number; scene: string };
type Inspection = {
  scene: Scene; index: VegetationIndex; resolution: number; imagery: IndexImage | null;
  covered: number; valid: number; cloudPercent: number | null; validFieldPercent?: number | null;
  statistics: { mean: number; min: number; max: number; deviation: number; histogram: { lowEdge: number; highEdge: number; count: number }[] } | null;
};
const initialRange = () => {
  const end = new Date(), start = new Date(end);
  start.setDate(start.getDate() - 30);
  return [dateToInputValue(start), dateToInputValue(end)];
};
const format = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 3 });

async function requestSentinel<T>(body: object) {
  const { data, error } = await supabase.functions.invoke<T>('precision-sentinel', { body: JSON.stringify(body) });
  if (!error && data) return data;
  if (error && 'context' in error && error.context instanceof Response) {
    const result = await error.context.json().catch(() => null);
    if (typeof result?.error === 'string') throw new Error(result.error);
  }
  throw new Error('Serviço Sentinel‑2 indisponível. Verifique a conexão ou a configuração no servidor.');
}

export default function SatellitePanel(props: {
  area: string; fields: MapField[]; points: MapSample[]; zones: MapZone[]; online: boolean; basemap: boolean; showBoundaries: boolean; onSample: (id: string) => void;
}) {
  return <SatelliteQuery key={props.area} {...props} />;
}

function SatelliteQuery({ area, fields, points, zones, online, basemap, showBoundaries, onSample }: {
  area: string; fields: MapField[]; points: MapSample[]; zones: MapZone[]; online: boolean; basemap: boolean; showBoundaries: boolean; onSample: (id: string) => void;
}) {
  const [[from, to], setRange] = useState(initialRange);
  const [clouds, setClouds] = useState(20);
  const [index, setIndex] = useState<VegetationIndex>('NDVI');
  const [catalog, setCatalog] = useState<{ dates: Scene[]; limited: boolean; clouds: number }>();
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(true);
  const [message, setMessage] = useState('');
  const [inspection, setInspection] = useState<Inspection[]>([]);
  const [history, setHistory] = useOfflineStorage<Inspection[]>('precision-sentinel:' + area, []);
  const available = fields.some(field => field.properties.id === area);
  const activeCatalog = catalog?.clouds === clouds ? catalog : undefined;
  const dateOptions = [{ value: '', label: 'Selecione uma aquisição' }, ...(activeCatalog?.dates ?? []).map(date => ({
    value: date.time, label: `${date.date.split('-').reverse().join('/')} ${date.time.slice(11, 16)} UTC · ${format(date.sceneCloud)}% na cena`,
  }))];

  async function search() {
    setBusy(true); setMessage(''); setInspection([]); setCatalog(undefined);
    try {
      const result = await requestSentinel<{ dates: Scene[]; limited: boolean }>({ action: 'catalog', area, from, to, clouds });
      setCatalog({ ...result, clouds });
      setFirst(result.dates[0]?.time ?? '');
      setSecond('');
      if (!result.dates.length) setMessage('Nenhuma aquisição Sentinel‑2 atende aos filtros.');
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }

  async function load() {
    if (!first || first === second) return;
    setBusy(true); setMessage('');
    try {
      const results = await Promise.all([first, second].filter(Boolean).map(time =>
        requestSentinel<Inspection>({ action: 'inspect', area, time, clouds, index })));
      setInspection(results);
      setHistory(previous => [...new Map([...previous, ...results.map(result => ({ ...result, imagery: null }))]
        .map(result => [result.index + result.scene.time, result])).values()]
        .sort((a, b) => a.scene.time.localeCompare(b.scene.time)).slice(-100));
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }

  return <section className="space-y-3">
    <div className="space-y-3 rounded-lg border bg-white p-3">
      {!available && <p className="text-sm">{area ? 'Cadastre o limite do talhão para consultar o Sentinel‑2.' : 'Selecione um talhão para consultar o Sentinel‑2.'}</p>}
      {available && <>
        <div className="grid gap-3 sm:grid-cols-3">
          <Input label="Imagens desde" type="date" value={from} disabled={busy} onChange={event => { setRange([event.target.value, to]); setCatalog(undefined); }} />
          <Input label="Imagens até" type="date" value={to} disabled={busy} onChange={event => { setRange([from, event.target.value]); setCatalog(undefined); }} />
          <Input label="Máximo de nuvens na cena (%)" type="number" min={0} max={100} value={Number.isFinite(clouds) ? clouds : ''} disabled={busy}
            onChange={event => setClouds(event.target.value === '' ? NaN : Number(event.target.value))} />
        </div>
        <Button onClick={() => void search()} disabled={!online || busy || !from || !to || !Number.isInteger(clouds) || clouds < 0 || clouds > 100}>Buscar datas</Button>
        {!online && <p className="text-sm">Conecte-se à internet para buscar imagens Sentinel‑2.</p>}
        {activeCatalog?.limited && <p className="text-sm">A consulta retornou a primeira página de cenas. Reduza o intervalo para ver mais datas.</p>}
        {activeCatalog && activeCatalog.dates.length > 0 && <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Select label="Aquisição principal" value={first} options={dateOptions} disabled={busy} onChange={event => setFirst(event.target.value)} />
            <Select label="Comparar com" value={second} options={dateOptions} disabled={busy} onChange={event => setSecond(event.target.value)} />
            <Select label="Índice" value={index} options={['NDVI', 'GNDVI'].map(value => ({ value, label: value }))} disabled={busy}
              onChange={event => setIndex(event.target.value as VegetationIndex)} />
          </div>
          <Button onClick={() => void load()} disabled={!online || busy || !first || first === second}>Exibir índice</Button>
        </>}
      </>}
      {busy && <p role="status" className="text-sm">Consultando Sentinel‑2…</p>}
      {message && <p role="status" className="text-sm">{message}</p>}
    </div>
    {inspection.length > 0 && <div className="flex flex-wrap items-center gap-3 text-sm">
      <label><input type="checkbox" className="mr-1" checked={visible} onChange={event => setVisible(event.target.checked)} /> Camada {inspection[0].index}</label>
      <span>−1</span>
      <span className="flex overflow-hidden rounded">{vegetationColors.map(color => <span key={color} className="h-3 w-7" style={{ backgroundColor: color }} />)}</span>
      <span>+1</span>
    </div>}
    {!inspection.length ? <PrecisionMap fields={fields} points={points} zones={zones} focus={area} basemap={basemap} showBoundaries={showBoundaries} onSample={onSample} />
      : <div className={inspection.length > 1 ? 'grid gap-3 xl:grid-cols-2' : 'space-y-3'}>
        {inspection.map(result => <div key={result.scene.time} className="space-y-2">
          <h3 className="text-sm font-semibold">{result.index} · {result.scene.time.replace('T', ' ').slice(0, 19)} UTC · 10 m</h3>
          <PrecisionMap fields={fields} points={points} zones={zones} focus={area} basemap={basemap} showBoundaries={showBoundaries} onSample={onSample}
            imagery={visible ? result.imagery ?? undefined : undefined} />
          <p className="text-sm">Nuvens na cena {format(result.scene.sceneCloud)}% · Nuvens e sombras na parte observada do talhão {result.cloudPercent === null ? 'indisponível' : format(result.cloudPercent) + '%'} · Pixels válidos {result.valid}{result.covered ? ` de ${result.covered} observados` : ''}{typeof result.validFieldPercent === 'number' ? ` · ${format(result.validFieldPercent)}% da grade do talhão` : ''}</p>
          {result.statistics ? <>
            <p className="text-sm">Média {format(result.statistics.mean)} · Mínimo {format(result.statistics.min)} · Máximo {format(result.statistics.max)} · Desvio {format(result.statistics.deviation)}</p>
            <details className="text-sm"><summary>Distribuição por faixa</summary><ul>
              {result.statistics.histogram.map(bin => <li key={bin.lowEdge}>{format(bin.lowEdge)} a {format(bin.highEdge)} · {bin.count} pixels</li>)}
            </ul></details>
          </> : <p className="text-sm">A aquisição não tem pixels válidos para o talhão.</p>}
        </div>)}
      </div>}
    {inspection.length === 2 && inspection[0].statistics && inspection[1].statistics && <p className="text-sm">
      Diferença entre médias (segunda menos primeira) {format(inspection[1].statistics.mean - inspection[0].statistics.mean)}
    </p>}
    {history.length > 0 && <details className="rounded border bg-white p-3 text-sm">
      <summary>Histórico de índices neste dispositivo</summary>
      <ul className="mt-2 space-y-2">{history.filter(result => result.index === index).map(result =>
        <li key={result.scene.time + result.index} className="grid grid-cols-[6rem,1fr,4rem] items-center gap-2">
          <span>{result.scene.date}</span>
          {result.statistics
            ? <meter className="w-full" min={-1} max={1} value={result.statistics.mean} aria-label={`Média de ${index} em ${result.scene.date}`} />
            : <span>Sem pixels válidos</span>}
          <span className="text-right">{result.statistics ? format(result.statistics.mean) : '—'}</span>
        </li>)}</ul>
    </details>}
  </section>;
}
