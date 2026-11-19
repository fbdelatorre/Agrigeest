import { useContext, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { useFieldSync } from '../context/FieldSyncContext';
import { useFieldPage } from '../hooks/useFieldPage';
import { OfflineScope, readOfflineValue, writeOfflineValue } from '../hooks/useOfflineStorage';
import { getSamplePhoto, listLabResults, listSamples, listSamplingZones, precisionClient, type LabResult } from '../lib/precisionData';
import { sampleCode, sampleColors, sampleStatuses, sampleTypes, type Sample } from '../lib/precisionTypes';
import { parseAreaBoundary } from '../utils/farmMap/areaBoundary';
import { dateToInputValue } from '../utils/dateHelpers';
import { locateSample } from '../utils/farmMap/sampleLocation';
import { precisionQrId, readPrecisionQr } from '../utils/precisionQr';
import PrecisionMap, { type MapField, type MapSample } from '../components/farmMap/PrecisionMap';
import SampleForm from '../components/precision/SampleForm';
import LabImport from '../components/precision/LabImport';
import SatellitePanel from '../components/precision/SatellitePanel';
import RecordActions from '../components/ui/RecordActions';
import { mutateBusinessRecord } from '../lib/businessWrites';
import ZoneEditor, { zoneFeatures } from '../components/precision/ZoneEditor';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import FieldSyncStatus from '../components/ui/FieldSyncStatus';

const tabs = { samples: 'Coleta de Amostras', lab: 'Importação de Laudos', map: 'Mapas de Análises',
  satellite: 'Monitoramento por Satélite', history: 'Histórico e Comparações', zones: 'Zonas de Amostragem' };
const emptyResults: LabResult[] = [];
const depthLabel = (sample: Sample) => sample.depth_from_cm === null ? '' : `${sample.depth_from_cm}–${sample.depth_to_cm} cm`;
const labSeries = (result: LabResult) => JSON.stringify([result.parameter, result.unit, result.method, result.material]);
const metricLabel = (result: LabResult) => [result.parameter, result.unit || 'unidade ausente', result.method || 'método ausente', result.material].filter(Boolean).join(' · ');

async function downloadLabel(sample: Sample, institution: string, area: string) {
  const [{ default: qr }, { jsPDF }] = await Promise.all([import('qrcode'), import('jspdf')]);
  const configured = import.meta.env.VITE_PUBLIC_APP_URL;
  const isBrowser = import.meta.env.MODE !== 'native' && window.location.protocol === 'https:';
  const link = configured || (isBrowser ? window.location.origin : '');
  let identifier = 'agrigest:amostra:' + sample.id;
  if (link && /^https:\/\//i.test(link)) {
    const target = new URL('precision', link.endsWith('/') ? link : link + '/');
    target.searchParams.set('sample', sample.id);
    identifier = target.href;
  }
  const image = await qr.toDataURL(identifier, { margin: 2, width: 300 });
  const pdf = new jsPDF({ unit: 'mm', format: [115, 64], orientation: 'landscape' });
  pdf.setFontSize(11);
  const lines = [sample.label, sample.lab_code || sample.code, institution, area, new Date(sample.collected_at).toLocaleDateString('pt-BR'),
    [sampleTypes[sample.sample_type], depthLabel(sample)].filter(Boolean).join(' · ')].filter(Boolean);
  pdf.text(lines.flatMap(line => pdf.splitTextToSize(line, 67)), 5, 10);
  pdf.addImage(image, 'PNG', 77, 8, 32, 32);
  pdf.save(sample.code + '.pdf');
}

async function downloadReport(id: string) {
  const { data, error } = await precisionClient.from('precision_lab_imports').select('filename,file_base64').eq('id', id).single();
  if (error) throw error;
  const bytes = Uint8Array.from(atob(data.file_base64), character => character.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = data.filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function PrecisionAgriculture() {
  const { areas, activeSeason, seasons, profile, isOnline } = useAppContext();
  const sync = useFieldSync();
  const scope = useContext(OfflineScope);
  const [params, setParams] = useSearchParams();
  const requestedTab = params.get('tab') as keyof typeof tabs | null;
  const tab = requestedTab && Object.prototype.hasOwnProperty.call(tabs, requestedTab) ? requestedTab : 'samples';
  const [filterSeason, setFilterSeason] = useState<string | undefined>(params.has('sample') ? '' : undefined);
  const season = filterSeason ?? activeSeason?.id ?? '';
  const [area, setArea] = useState(params.get('area') ?? '');
  const [formOpen, setFormOpen] = useState(false);
  const [selected, setSelected] = useState(params.get('sample') ?? '');
  const [message, setMessage] = useState('');
  const [sampleSearch, setSampleSearch] = useState(params.get('sample') ?? '');
  const [revision, setRevision] = useState(0);
  const [layers, setLayers] = useState({ boundaries: true, zones: true, soil: true, foliar: true, nematodes: true, basemap: false, results: true });
  const [type, setType] = useState('');
  const [depth, setDepth] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [metric, setMetric] = useState('');
  const [pointColor, setPointColor] = useState('#b33f4b');
  const [photoSnapshot, setPhotoSnapshot] = useState<{ id: string; image: string | null }>();
  const rows = useFieldPage('precision-samples', tab === 'lab' ? '' : season, '', 0, isOnline, sync.revision + revision, listSamples);
  const zoneRows = useFieldPage('precision-zones', '', '', 0, isOnline, revision, listSamplingZones);
  const zones = zoneRows.data ?? [];
  const zoneLayer = layers.zones ? zoneFeatures(zones.filter(zone => (!area || zone.area_id === area) && (!season || zone.season_id === season))) : [];
  const fields = useMemo(() => areas.flatMap((item): MapField[] => {
    const geometry = parseAreaBoundary(item.geometry);
    return geometry ? [{ type: 'Feature', geometry, properties: { id: item.id, name: item.name } }] : [];
  }), [areas]);
  const entries = useMemo(() => sync.entries.filter(entry => entry.kind === 'sample'), [sync.entries]);
  const samples = useMemo(() => {
    const values = new Map((rows.data ?? []).map(sample => [sample.id, sample]));
    if (tab !== 'lab') {
      for (const { record, id, createdAt, userId } of entries) {
        if ((!season || record.season_id === season) && !values.has(id))
          values.set(id, { ...record, code: sampleCode(id), status: 'collected', created_at: createdAt, created_by: userId });
      }
    }
    return [...values.values()].sort((a, b) => b.collected_at.localeCompare(a.collected_at));
  }, [entries, rows.data, season, tab]);
  const resultKey = `agrigest:v2:precision-results:${scope}:${season}:${area}`;
  const [resultSnapshot, setResultSnapshot] = useState<{ key: string; values: LabResult[] }>();
  const results = resultSnapshot?.key === resultKey ? resultSnapshot.values : emptyResults;
  useEffect(() => {
    if (tab === 'lab' || !scope) return;
    const ids = (rows.data ?? []).filter(sample => !area || sample.area_id === area).map(sample => sample.id);
    const controller = new AbortController();
    setResultSnapshot(old => old?.key === resultKey ? old : { key: resultKey, values: readOfflineValue(resultKey, []) });
    if (isOnline && ids.length) void listLabResults(ids, controller.signal).then(values => {
      if (!controller.signal.aborted) {
        writeOfflineValue(resultKey, values);
        setResultSnapshot({ key: resultKey, values });
      }
    }).catch(() => { if (!controller.signal.aborted) setMessage('Não foi possível atualizar os resultados laboratoriais.'); });
    return () => controller.abort();
  }, [area, isOnline, resultKey, rows.data, scope, tab]);

  const visible = samples.filter(sample => {
    const date = dateToInputValue(new Date(sample.collected_at));
    return (!area || sample.area_id === area) && (!type || sample.sample_type === type) &&
      (!depth || depthLabel(sample) === depth) && (!from || date >= from) && (!to || date <= to);
  });
  const metrics = new Map(results.map(result => [labSeries(result), metricLabel(result)]));
  const metricValues = results.filter(result => labSeries(result) === metric && visible.some(sample => sample.id === result.sample_id));
  const bounds = metricValues.reduce(([min, max], result) => [Math.min(min, result.value), Math.max(max, result.value)], [Infinity, -Infinity]);
  const matching = new Map<string, LabResult[]>();
  for (const result of metricValues) matching.set(result.sample_id, [...(matching.get(result.sample_id) ?? []), result]);
  const points = visible.flatMap((sample): MapSample[] => {
    if (!layers[sample.sample_type]) return [];
    const values = matching.get(sample.id);
    const value = values?.length === 1 ? values[0].value : undefined;
    if (layers.results && metric && !values) return [];
    const fraction = value === undefined ? 0 : bounds[0] === bounds[1] ? 1 : (value - bounds[0]) / (bounds[1] - bounds[0]);
    const rgb = [1, 3, 5].map(offset => parseInt(pointColor.slice(offset, offset + 2), 16));
    const scaledColor = `rgba(${rgb.join(',')},${0.45 + 0.55 * fraction})`;
    return [{
      type: 'Feature', geometry: { type: 'Point', coordinates: [sample.longitude, sample.latitude] },
      properties: { id: sample.id, color: layers.results && metric ? values?.length === 1 ? scaledColor : '#777777' : sampleColors[sample.sample_type] ?? '#777',
        composite: sample.sample_mode === 'composite' },
    }];
  });
  const selectedSample = visible.find(sample => sample.id === selected) ?? samples.find(sample => sample.id === selected);
  const localPhoto = selectedSample?.photo || entries.find(entry => entry.id === selected)?.record.photo;
  const remotePhoto = photoSnapshot?.id === selected ? photoSnapshot.image : null;
  const serverSample = rows.data?.some(sample => sample.id === selected);
  useEffect(() => {
    if (!selected || localPhoto || !isOnline || !serverSample) return;
    const controller = new AbortController();
    void getSamplePhoto(selected, controller.signal).then(image => {
      if (!controller.signal.aborted) setPhotoSnapshot({ id: selected, image });
    }).catch(() => {});
    return () => controller.abort();
  }, [isOnline, localPhoto, selected, serverSample]);
  const fieldOptions = [{ value: '', label: 'Fazenda inteira' }, ...areas.map(item => ({ value: item.id, label: item.name }))];
  const foundSamples = visible.filter(sample => {
    const search = (precisionQrId(sampleSearch) ?? sampleSearch.trim()).toUpperCase();
    return !search || [sample.id, sample.code, sample.lab_code ?? '', sample.label, areas.find(item => item.id === sample.area_id)?.name ?? '']
      .some(value => value.toUpperCase().includes(search));
  });

  function show(next: keyof typeof tabs) {
    const search = new URLSearchParams(params);
    search.set('tab', next);
    setParams(search);
    setMessage('');
  }

  async function updateSample(sample: Sample, changes: Partial<Pick<Sample, 'status' | 'label' | 'zone_id'>>) {
    try {
      const updated = await mutateBusinessRecord<object>('precision_samples', sample, 'update', changes);
      await sync.forget(sample.id, updated);
      setRevision(old => old + 1);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível atualizar a amostra.'); }
  }

  const sampleZone = selectedSample && zones.find(zone => zone.id === selectedSample.zone_id);
  const eligibleZones = selectedSample ? zones.filter(zone => zone.area_id === selectedSample.area_id && zone.season_id === selectedSample.season_id &&
    locateSample([selectedSample.longitude, selectedSample.latitude], [{ id: zone.id, geometry: zone.geometry }], null).matches.length) : [];

  const detail = selectedSample && <article className="space-y-2 rounded-lg border bg-white p-4">
    <div className="flex flex-wrap justify-between gap-2">
      <h3 className="break-all font-semibold">{selectedSample.label || selectedSample.code}</h3>
      <Button size="sm" variant="outline" onClick={() => setSelected('')}>Fechar detalhe</Button>
    </div>
    <p className="text-sm">{areas.find(item => item.id === selectedSample.area_id)?.name} · {sampleTypes[selectedSample.sample_type]} {depthLabel(selectedSample)} · {new Date(selectedSample.collected_at).toLocaleString('pt-BR')}</p>
    <p className="text-sm font-medium break-all">{selectedSample.lab_code || selectedSample.code}</p>
    <p className="text-sm">Responsável {selectedSample.responsible}{selectedSample.laboratory ? ' · ' + selectedSample.laboratory : ''}</p>
    {(sampleZone || selectedSample.details.zone) && <p className="text-sm">Zona de amostragem {sampleZone?.name || selectedSample.details.zone}</p>}
    <p className="text-sm">Ponto central {selectedSample.latitude.toFixed(6)}, {selectedSample.longitude.toFixed(6)} · {selectedSample.subsample_count} subamostra(s)</p>
    {selectedSample.notes && <p className="break-words text-sm">{selectedSample.notes}</p>}
    {(localPhoto || remotePhoto) && <img src={localPhoto || remotePhoto || undefined} alt="Fotografia da coleta" className="max-h-60 rounded object-contain" />}
    {results.some(result => result.sample_id === selected) && <ul className="divide-y text-sm">
      {results.filter(result => result.sample_id === selected).map(result => <li key={result.id} className="py-1">
        <strong>{result.parameter}</strong> · {result.original_value} {result.unit} {result.method && '· ' + result.method} {result.material && '· ' + result.material}
        {result.original_parameter && result.original_parameter !== result.parameter && <span className="ml-2 text-xs">Cabeçalho original: {result.original_parameter}</span>}
        {isOnline && <button type="button" className="ml-2 text-brand-700 underline"
          onClick={() => void downloadReport(result.import_id).catch(() => setMessage('Não foi possível baixar o laudo.'))}>Baixar laudo original</button>}
        <RecordActions table="precision_lab_results" record={result} onSaved={() => setRevision(old => old + 1)} />
      </li>)}
    </ul>}
    <Button variant="outline" onClick={() => void downloadLabel(selectedSample, profile?.institution ?? '', areas.find(item => item.id === selectedSample.area_id)?.name ?? '')
      .catch(() => setMessage('Não foi possível gerar a etiqueta.'))}>Baixar etiqueta PDF com QR</Button>
    <RecordActions key={selectedSample.id} table="precision_samples" record={selectedSample} queued={entries.find(entry => entry.id === selectedSample.id)} onSaved={() => setRevision(old => old + 1)} />
    {isOnline && rows.data?.some(sample => sample.id === selected) && <>
      {(eligibleZones.length > 0 || selectedSample.zone_id) && <Select label="Vincular zona" value={selectedSample.zone_id ?? ''}
        options={[{ value: '', label: 'Sem zona' }, ...eligibleZones.map(zone => ({ value: zone.id, label: zone.name }))]}
        onChange={event => void updateSample(selectedSample, { zone_id: event.target.value || null })} />}
      <Select label="Status" value={selectedSample.status} options={Object.entries(sampleStatuses).map(([value, label]) => ({ value, label }))}
        onChange={event => void updateSample(selectedSample, { status: event.target.value as Sample['status'] })} />
      <form key={selectedSample.id} className="flex flex-wrap items-end gap-2" onSubmit={event => {
        event.preventDefault();
        const label = String(new FormData(event.currentTarget).get('label') ?? '').trim();
        void updateSample(selectedSample, { label });
      }}>
        <Input label="Nome curto" name="label" defaultValue={selectedSample.label} maxLength={100} />
        <Button variant="outline" type="submit">Atualizar nome</Button>
      </form>
    </>}
  </article>;

  return <div className="space-y-4">
    <nav aria-label="Agricultura de Precisão" className="flex flex-wrap gap-2">
      {Object.entries(tabs).map(([key, title]) => <Button key={key} size="sm" aria-current={tab === key ? 'page' : undefined}
        variant={tab === key ? 'primary' : 'outline'} onClick={() => show(key as keyof typeof tabs)}>{title}</Button>)}
    </nav>
    {(rows.failed || sync.localError) && <p role="status" className="rounded bg-amber-50 p-3 text-sm">
      {sync.localError ? 'Não foi possível ler a fila local de coletas.' : 'Não foi possível carregar as amostras do servidor. Os registros locais continuam disponíveis.'}
    </p>}
    {message && <p role="status" className="rounded bg-green-50 p-3 text-sm">{message}</p>}
    {tab === 'lab' ? <LabImport samples={samples} areas={areas} online={isOnline} onImported={() => setRevision(old => old + 1)} /> : <>
      <div className="grid gap-3 rounded-lg border bg-white p-3 sm:grid-cols-2">
        <Select label="Vista do mapa e dos registros" value={area} options={fieldOptions} onChange={event => { setArea(event.target.value); setSelected(''); }} />
        <Select label="Safra dos registros" value={season} onChange={event => { setFilterSeason(event.target.value); setSelected(''); }}
          options={[{ value: '', label: 'Todas as safras e coletas sem safra' }, ...seasons.map(item => ({ value: item.id, label: item.name }))]} />
      </div>
      {tab === 'samples' && <>
        <div className="flex flex-wrap items-end gap-3">
          <Button onClick={() => setFormOpen(!formOpen)}>{formOpen ? 'Fechar nova coleta' : 'Nova coleta'}</Button>
          <Input label="Buscar amostra" placeholder="Código, QR copiado, nome ou talhão" value={sampleSearch} onChange={event => setSampleSearch(event.target.value)} />
          <label className="cursor-pointer rounded-md border bg-white px-3 py-2 text-sm font-medium text-brand-700">
            Ler foto do QR
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              setMessage('Lendo a etiqueta…');
              void readPrecisionQr(file).then(id => {
                setFilterSeason(''); setArea(''); setSampleSearch(id); setSelected(id); setMessage('');
              }).catch(error => setMessage(error instanceof Error ? error.message : 'Não foi possível ler a etiqueta.'));
            }} />
          </label>
        </div>
        {formOpen && <SampleForm fields={fields} zones={zones} initialArea={area} onSaved={() => { setFormOpen(false); setMessage('Coleta guardada neste dispositivo. A sincronização é automática.'); }} />}
        {detail}
        <div className="grid gap-2 sm:grid-cols-2">
          {foundSamples.map(sample => <article key={sample.id} className="rounded-lg border bg-white p-3">
            <button type="button" className="break-all text-left font-semibold text-brand-700 underline" onClick={() => setSelected(sample.id)}>{sample.label || sample.lab_code || sample.code}</button>
            <p className="text-sm">{areas.find(item => item.id === sample.area_id)?.name} · {sampleTypes[sample.sample_type]} · {depthLabel(sample) || sampleStatuses[sample.status]}</p>
            <FieldSyncStatus entry={entries.find(entry => entry.id === sample.id)} />
          </article>)}
          {!foundSamples.length && <p className="text-sm">{rows.loading ? 'Carregando amostras…' : 'Nenhuma amostra encontrada.'}</p>}
        </div>
      </>}
      {tab === 'zones' && <ZoneEditor key={area + ':' + season} institutionId={profile?.institutionId ?? ''}
        area={area} season={season} fields={fields} zones={zones} online={isOnline} onSaved={() => setRevision(old => old + 1)} />}
      {(tab === 'map' || tab === 'satellite' || tab === 'history') && <>
        <div className="grid gap-3 rounded-lg border bg-white p-3 sm:grid-cols-3">
          <Select label="Tipo de análise" value={type} onChange={event => setType(event.target.value)}
            options={[{ value: '', label: 'Todos' }, ...Object.entries(sampleTypes).map(([value, label]) => ({ value, label }))]} />
          <Select label="Profundidade" value={depth} onChange={event => setDepth(event.target.value)}
            options={[{ value: '', label: 'Todas' }, ...[...new Set(samples.map(depthLabel).filter(Boolean))].map(label => ({ value: label, label }))]} />
          <Select label="Parâmetro, unidade e método" value={metric} onChange={event => setMetric(event.target.value)}
            options={[{ value: '', label: 'Todos os pontos de coleta' }, ...[...metrics].map(([value, label]) => ({ value, label }))]} />
          <Input label="Coletas desde" type="date" value={from} onChange={event => setFrom(event.target.value)} />
          <Input label="Coletas até" type="date" value={to} onChange={event => setTo(event.target.value)} />
          {metric && <Input label="Cor do parâmetro" type="color" value={pointColor} onChange={event => setPointColor(event.target.value)} />}
        </div>
        <fieldset className="flex flex-wrap gap-3 text-sm">
          <legend className="font-semibold">Camadas</legend>
          {Object.entries({ boundaries: 'Limites', zones: 'Zonas', soil: 'Solo', foliar: 'Foliar', nematodes: 'Nematoides', basemap: 'Imagem de fundo', results: 'Resultado temático' }).map(([key, label]) => {
            const name = key as keyof typeof layers;
            return <label key={key}><input type="checkbox" className="mr-1" checked={layers[name]}
              onChange={event => setLayers(old => ({ ...old, [key]: event.target.checked }))} />{label}</label>;
          })}
        </fieldset>
        {tab === 'satellite' || tab === 'history' ? <SatellitePanel key={tab} historyOnly={tab === 'history'} area={area} fields={fields} points={points} zones={zoneLayer} basemap={layers.basemap && isOnline}
          showBoundaries={layers.boundaries} online={isOnline} onSample={setSelected} />
          : <PrecisionMap fields={fields} focus={area} points={points} zones={zoneLayer} basemap={layers.basemap && isOnline} showBoundaries={layers.boundaries} onSample={setSelected} />}
        <Link to={'/farm-map?samples=yes' + (area ? '&area=' + encodeURIComponent(area) : '')}
          className="text-sm text-brand-700 underline">Abrir mapa de operações e pluviometria</Link>
        {metric && metricValues.length > 0 && <p className="text-sm">Escala do parâmetro {bounds[0]} a {bounds[1]} · Cinza indica mais de um resultado na amostra.</p>}
        <Select label="Consultar ponto de coleta" value={selected} onChange={event => setSelected(event.target.value)}
          options={[{ value: '', label: 'Selecione um ponto' }, ...visible.map(sample => ({ value: sample.id, label: sample.label || sample.lab_code || sample.code, searchText: sample.code + ' ' + (sample.lab_code ?? '') }))]} />
        {detail}
        {tab === 'history' && <div className="space-y-1 rounded-lg border bg-white p-4">
          <h2 className="font-semibold">Resultados por coleta</h2>
          {!metric ? <p className="text-sm">Escolha um parâmetro, unidade e método para comparar.</p> : !metricValues.length ? <p className="text-sm">Sem resultados para os filtros selecionados.</p>
            : metricValues.map(result => {
              const sample = visible.find(item => item.id === result.sample_id)!;
              return <button key={result.id} className="block py-1 text-left text-sm text-brand-700 underline" onClick={() => setSelected(sample.id)}>
                {new Date(sample.collected_at).toLocaleDateString('pt-BR')} · {areas.find(item => item.id === sample.area_id)?.name} · {depthLabel(sample)} · {result.original_value} {result.unit}
              </button>;
            })}
        </div>}
      </>}
    </>}
  </div>;
}
