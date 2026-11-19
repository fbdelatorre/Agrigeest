import { useRef, useState, type FormEvent } from 'react';
import type { SamplingZone, SamplingZoneInput } from '../../lib/precisionData';
import { precisionClient } from '../../lib/precisionData';
import { locateSample, type SamplePoint } from '../../utils/farmMap/sampleLocation';
import PrecisionMap, { type MapField, type MapZone } from '../farmMap/PrecisionMap';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import RecordActions from '../ui/RecordActions';

export const zoneFeatures = (zones: SamplingZone[]): MapZone[] => zones.map(zone => ({
  type: 'Feature', geometry: zone.geometry, properties: { id: zone.id, name: zone.name },
}));

export default function ZoneEditor({ institutionId, area, season, fields, zones, online, onSaved }: {
  institutionId: string; area: string; season: string; fields: MapField[]; zones: SamplingZone[];
  online: boolean; onSaved: () => void;
}) {
  const [selected, setSelected] = useState('');
  const [vertices, setVertices] = useState<SamplePoint[]>([]);
  const [busy, setBusy] = useState(false);
  const writing = useRef(false);
  const editingVersion = useRef<string>();
  const [name, setName] = useState('');
  const [campaign, setCampaign] = useState('');
  const [message, setMessage] = useState('');
  const field = fields.find(item => item.properties.id === area);
  const current = zones.find(zone => zone.id === selected);
  const visible = zones.filter(zone => zone.area_id === area && zone.season_id === (season || null));

  function edit(id: string) {
    setSelected(id);
    setMessage('');
    const zone = visible.find(item => item.id === id);
    editingVersion.current = zone?.updated_at;
    setName(zone?.name ?? '');
    setCampaign(zone?.campaign ?? '');
    setVertices(zone ? zone.geometry.coordinates[0].slice(0, -1).map(([x, y]) => [x, y]) : []);
  }

  function add(point: SamplePoint) {
    if (!field || busy || !online) return;
    if (!locateSample(point, [{ id: area, geometry: field.geometry }], null).matches.length) {
      setMessage('Marque os vértices dentro do talhão selecionado.');
      return;
    }
    if (vertices.length >= 150) { setMessage('A zona pode ter até 150 vértices.'); return; }
    setMessage('');
    setVertices(previous => [...previous, point]);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!field || vertices.length < 3 || !institutionId || !online || writing.current || (selected && !current)) return;
    if (!name.trim()) { setMessage('Informe o nome da zona.'); return; }
    const fieldsToSave: Pick<SamplingZoneInput, 'name' | 'campaign' | 'geometry'> = {
      name: name.trim(), campaign: campaign.trim(), geometry: { type: 'Polygon', coordinates: [[...vertices, vertices[0]]] },
    };
    writing.current = true;
    setBusy(true); setMessage('');
    try {
      const query = current
        ? precisionClient.from('precision_zones').update(fieldsToSave).eq('id', current.id).eq('updated_at', editingVersion.current ?? current.updated_at)
        : precisionClient.from('precision_zones').insert({ ...fieldsToSave, institution_id: institutionId, area_id: area, season_id: season || null });
      const { data, error } = await query.select('id,updated_at').maybeSingle();
      if (error) throw error;
      if (!data) { setMessage('Outra pessoa alterou esta zona. Recarregue para conferir a versão atual.'); onSaved(); return; }
      setSelected(data.id);
      editingVersion.current = data.updated_at;
      setMessage('Zona salva e vinculada ao talhão.');
      onSaved();
    } catch (error) {
      const text = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
      setMessage(text.includes('ZONE_WOULD_EXCLUDE_SAMPLE') ? 'O novo limite deixaria uma amostra vinculada fora da zona.'
        : text.includes('ZONE_OUTSIDE_FIELD_OR_INVALID') ? 'O desenho cruza o limite do talhão ou forma um polígono inválido.'
          : 'Não foi possível salvar a zona. Confira o desenho e a conexão.');
    } finally { writing.current = false; setBusy(false); }
  }

  return <section className="space-y-3 rounded-lg border bg-white p-4">
    <h2 className="font-semibold">Zonas de amostragem</h2>
    {!field ? <p className="text-sm">Selecione um talhão com limite cadastrado.</p> : <>
      {!online && <p className="text-sm">Conecte-se para salvar ou editar zonas.</p>}
      <Select label="Zona para editar" value={selected} disabled={busy} onChange={event => edit(event.target.value)}
        options={[{ value: '', label: 'Nova zona' }, ...visible.map(zone => ({ value: zone.id, label: zone.name }))]} />
      <p className="text-sm">Toque no mapa para desenhar o contorno dentro do talhão.</p>
      <PrecisionMap fields={fields} focus={area} points={[]} zones={zoneFeatures(visible)} draft={vertices} onPoint={add} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm">{vertices.length} vértices</span>
        <Button variant="outline" size="sm" disabled={!vertices.length || busy} onClick={() => setVertices(previous => previous.slice(0, -1))}>Desfazer último ponto</Button>
        <Button variant="outline" size="sm" disabled={!vertices.length || busy} onClick={() => setVertices([])}>Redesenhar</Button>
      </div>
      <form onSubmit={save} className="grid gap-2 sm:grid-cols-2">
        <Input label="Nome da zona" value={name} onChange={event => setName(event.target.value)} maxLength={120} required />
        <Input label="Campanha de coleta" value={campaign} onChange={event => setCampaign(event.target.value)} list="precision-campaigns" maxLength={120} />
        <datalist id="precision-campaigns">{[...new Set(zones.map(zone => zone.campaign).filter(Boolean))].map(name => <option key={name} value={name} />)}</datalist>
        <Button type="submit" disabled={vertices.length < 3 || !online || busy || (!!selected && !current)}>Salvar zona</Button>
      </form>
      {current && <RecordActions table="precision_zones" record={current} fields={[]} onSaved={() => { edit(''); onSaved(); }} />}
    </>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>;
}
