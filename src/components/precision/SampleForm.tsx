import { useContext, useMemo, useRef, useState, type FormEvent } from 'react';
import { Crosshair } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { useFieldSync } from '../../context/FieldSyncContext';
import { OfflineScope, readOfflineValue, writeOfflineValue } from '../../hooks/useOfflineStorage';
import { sampleTypes, type SampleInput } from '../../lib/precisionTypes';
import { dateToInputValue } from '../../utils/dateHelpers';
import { locateSample, type SamplePoint } from '../../utils/farmMap/sampleLocation';
import PrecisionMap, { type MapField } from '../farmMap/PrecisionMap';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';

async function photoData(file: File) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 12000000) throw new Error('Foto inválida. Use JPG, PNG ou WebP de até 12 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Não foi possível processar a fotografia.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/jpeg', 0.72);
    if (data.length > 450000 || !data.startsWith('data:image/jpeg;base64,')) throw new Error('A fotografia ultrapassa o limite local.');
    return data;
  } finally { bitmap.close(); }
}

export default function SampleForm({ fields, initialArea, onSaved }: { fields: MapField[]; initialArea: string; onSaved: () => void }) {
  const { areas, activeSeason, seasons, profile } = useAppContext();
  const sync = useFieldSync();
  const scope = useContext(OfflineScope);
  const laboratoryKey = 'agrigest:v2:precision-lab:' + scope;
  const [type, setType] = useState<SampleInput['sample_type']>('soil');
  const [areaId, setArea] = useState(initialArea || (areas.length === 1 ? areas[0].id : ''));
  const [seasonId, setSeason] = useState(activeSeason?.id ?? '');
  const [point, setPoint] = useState<SamplePoint | null>(null);
  const [source, setSource] = useState<SampleInput['point_source']>('manual');
  const [coordinates, setCoordinates] = useState(['', '']);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [depth, setDepth] = useState('0-20');
  const [composite, setComposite] = useState(true);
  const [mapOpen, setMapOpen] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const writing = useRef(false);
  const [error, setError] = useState('');
  const area = seasonId === activeSeason?.id ? areas.find(candidate => candidate.id === areaId) : undefined;
  const boundaries = useMemo(() => fields.map(field => ({ id: field.properties.id, geometry: field.geometry })), [fields]);
  const match = point && locateSample(point, boundaries, accuracy);
  const confirmLocation = match && (match.uncertain || !match.matches.includes(areaId));
  const now = useMemo(() => {
    const date = new Date();
    return dateToInputValue(date) + 'T' + date.toTimeString().slice(0, 5);
  }, []);

  function pickPoint(value: SamplePoint, origin: SampleInput['point_source'], estimated: number | null) {
    setError('');
    setPoint(value);
    setCoordinates(value.map(item => String(Number(item.toFixed(7)))));
    setSource(origin);
    setAccuracy(estimated);
    setConfirmed(false);
    const match = locateSample(value, boundaries, estimated);
    if (match.matches.length === 1) setArea(match.matches[0]);
  }

  function useGps() {
    if (!navigator.geolocation) { setError('GPS indisponível. Marque o ponto no mapa ou informe as coordenadas.'); return; }
    setGpsBusy(true);
    setError('');
    navigator.geolocation.getCurrentPosition(position => {
      setGpsBusy(false);
      pickPoint([position.coords.longitude, position.coords.latitude], 'gps', Math.round(position.coords.accuracy));
    }, () => {
      setGpsBusy(false);
      setError('Não foi possível obter a localização. Confira a permissão de GPS ou marque o ponto no mapa.');
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (writing.current || !profile?.institutionId) return;
    const form = new FormData(event.currentTarget);
    const read = (key: string) => String(form.get(key) ?? '').trim();
    const time = new Date(read('time'));
    const from = depth === 'custom' ? Number(read('from')) : Number(depth.split('-')[0]);
    const to = depth === 'custom' ? Number(read('to')) : Number(depth.split('-')[1]);
    const hasDepth = type !== 'foliar' && depth !== 'none';
    const count = composite ? Number(read('count')) : 1;
    if (!point || !areaId || !read('responsible') || !Number.isFinite(+time) || (confirmLocation && !confirmed)) {
      setError('Confirme o talhão, o ponto central, a data e o responsável.');
      return;
    }
    if ((hasDepth && (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to <= from || to > 1000)) ||
        (composite && (!Number.isInteger(count) || count < 2 || count > 1000))) {
      setError('Confira a profundidade e a quantidade de subamostras.');
      return;
    }
    writing.current = true;
    setSaving(true);
    setError('');
    try {
      const file = form.get('photo');
      const details = Object.fromEntries(
        ['culture', 'cultivar', 'stage', 'plant_part', 'plant_count', 'material', 'condition', 'patches', 'symptoms', 'sampling_system', 'zone']
          .flatMap(key => read(key) ? [[key, read(key)]] : []));
      await sync.enqueue({ kind: 'sample', record: {
        label: read('label'), institution_id: profile.institutionId, area_id: areaId, season_id: seasonId || null,
        collected_at: time.toISOString(), sample_type: type, longitude: point[0], latitude: point[1], accuracy_m: accuracy,
        point_source: source, sample_mode: composite ? 'composite' : 'individual', subsample_count: count,
        depth_from_cm: hasDepth ? from : null, depth_to_cm: hasDepth ? to : null,
        responsible: read('responsible'), laboratory: read('laboratory'), notes: read('notes'), details,
        photo: file instanceof File && file.size ? await photoData(file) : null,
      } });
      if (scope) writeOfflineValue(laboratoryKey, read('laboratory'));
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a coleta neste dispositivo.');
    } finally {
      writing.current = false;
      setSaving(false);
    }
  }

  return <form onSubmit={save} className="space-y-4 rounded-lg border bg-white p-4">
    <h2 className="text-lg font-semibold">Nova coleta</h2>
    <div className="flex flex-wrap gap-2">
      <Button type="button" leftIcon={<Crosshair size={18} />} disabled={gpsBusy} onClick={useGps}>{gpsBusy ? 'Localizando…' : 'Usar meu GPS'}</Button>
      <Button type="button" variant="outline" onClick={() => setMapOpen(!mapOpen)}>{mapOpen ? 'Fechar mapa' : 'Marcar no mapa'}</Button>
    </div>
    {mapOpen && <PrecisionMap fields={fields} focus="" points={point ? [{
      type: 'Feature', geometry: { type: 'Point', coordinates: point }, properties: { id: 'current', color: '#dc5b27' },
    }] : []} onPoint={value => pickPoint(value, 'map', null)} />}
    <details>
      <summary className="cursor-pointer text-sm font-medium">Informar coordenadas manualmente</summary>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {['Longitude', 'Latitude'].map((label, index) => <Input key={label} label={label} inputMode="decimal"
          value={coordinates[index]} onChange={event => setCoordinates(old => old.map((value, i) => i === index ? event.target.value : value))} />)}
        <Button type="button" variant="outline" onClick={() => {
          const [lng, lat] = coordinates.map(value => value.trim() ? Number(value.replace(',', '.')) : NaN);
          if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) {
            setError('Informe longitude e latitude válidas.');
            return;
          }
          pickPoint([lng, lat], 'manual', null);
        }}>Usar coordenadas</Button>
      </div>
    </details>
    {point && <p className="text-sm">Ponto central {point[1].toFixed(6)}, {point[0].toFixed(6)}{accuracy === null ? '' : ` · precisão de ±${accuracy} m`}</p>}
    <div className="grid gap-3 sm:grid-cols-2">
      <Input label="Propriedade" value={profile?.institution ?? ''} readOnly />
      <Select label="Talhão" required value={areaId} onChange={event => { setArea(event.target.value); setConfirmed(false); }}
        options={[{ value: '', label: 'Selecione o talhão' }, ...areas.map(item => ({ value: item.id, label: item.name }))]} />
      <Select label="Safra" value={seasonId} onChange={event => setSeason(event.target.value)}
        options={[{ value: '', label: 'Sem safra' }, ...seasons.map(item => ({ value: item.id, label: item.name }))]} />
      <Select label="Tipo de análise" value={type} options={Object.entries(sampleTypes).map(([value, label]) => ({ value, label }))}
        onChange={event => {
          const value = event.target.value as SampleInput['sample_type'];
          setType(value); setComposite(value === 'soil'); setDepth(value === 'soil' ? '0-20' : 'none');
        }} />
      <Input name="time" label="Data e hora da coleta" type="datetime-local" defaultValue={now} required />
      <Input name="responsible" label="Responsável" defaultValue={[profile?.firstName, profile?.lastName].filter(Boolean).join(' ')} maxLength={160} required />
    </div>
    {confirmLocation && <label className="block rounded bg-amber-50 p-3 text-sm">
      <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mr-2" />
      {match?.matches.length ? 'Ponto próximo à divisa, talhão divergente ou GPS impreciso. Confirmo o talhão selecionado.'
        : 'Ponto fora dos limites cadastrados. Confirmo o talhão selecionado manualmente.'}
    </label>}
    <div className="grid gap-3 sm:grid-cols-2">
      <Select label="Modo de amostragem" value={composite ? 'composite' : 'individual'} onChange={event => setComposite(event.target.value === 'composite')}
        options={[{ value: 'individual', label: 'Individual' }, { value: 'composite', label: 'Composta' }]} />
      {composite && <Input name="count" label="Quantidade de subamostras" type="number" min={2} max={1000} defaultValue={5} required />}
      {type !== 'foliar' && <Select label="Profundidade" value={depth} onChange={event => setDepth(event.target.value)}
        options={[{ value: '0-10', label: '0–10 cm' }, { value: '0-20', label: '0–20 cm' }, { value: '20-40', label: '20–40 cm' },
          { value: 'custom', label: 'Personalizada' }, { value: 'none', label: 'Sem profundidade' }]} />}
      {type !== 'foliar' && depth === 'custom' && <>
        <Input name="from" label="De (cm)" type="number" min={0} max={1000} step="any" required />
        <Input name="to" label="Até (cm)" type="number" min={1} max={1000} step="any" required />
      </>}
      {type === 'soil' && <Input name="sampling_system" label="Sistema de amostragem" maxLength={160} />}
      {type !== 'soil' && <Input key={'crop-' + areaId + seasonId + type} name="culture" label="Cultura" defaultValue={area?.current_crop ?? ''} maxLength={160} />}
      {type === 'foliar' && <>
        <Input key={'cultivar-' + areaId + seasonId} name="cultivar" label="Cultivar ou híbrido" defaultValue={area?.cultivar ?? ''} maxLength={160} />
        <Input name="stage" label="Estádio fenológico" maxLength={160} />
        <Input name="plant_part" label="Parte da planta" maxLength={160} />
        <Input name="plant_count" label="Quantidade de plantas ou folhas" type="number" min={1} />
      </>}
      {type === 'nematodes' && <>
        <Select name="material" label="Material coletado" options={['Solo', 'Raízes', 'Solo e raízes'].map(item => ({ value: item, label: item }))} />
        <Input name="condition" label="Condição observada" maxLength={200} />
        <Select name="patches" label="Reboleiras" options={['Não informado', 'Sim', 'Não'].map(item => ({ value: item, label: item }))} />
        <Input name="symptoms" label="Sintomas" maxLength={250} />
      </>}
    </div>
    <details>
      <summary className="cursor-pointer text-sm font-medium">Laboratório, etiqueta e observações</summary>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <Input name="laboratory" label="Laboratório de destino" defaultValue={scope ? readOfflineValue(laboratoryKey, '') : ''} maxLength={160} />
        <Input name="label" label="Nome curto da amostra" maxLength={100} />
        <Input name="zone" label="Nome da zona de amostragem" maxLength={120} />
        <Input name="photo" label="Fotografia" type="file" accept="image/jpeg,image/png,image/webp" />
        <label className="sm:col-span-2 text-sm">Observações
          <textarea name="notes" maxLength={4000} className="mt-1 block w-full rounded border p-2" rows={2} />
        </label>
      </div>
    </details>
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    <Button type="submit" disabled={saving}>{saving ? 'Salvando…' : 'Salvar coleta'}</Button>
  </form>;
}
