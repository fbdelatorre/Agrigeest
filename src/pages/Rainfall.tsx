import { useFieldSync } from '../context/FieldSyncContext';
import { useFieldPage } from '../hooks/useFieldPage';
import FieldSyncStatus from '../components/ui/FieldSyncStatus';
import RecordActions from '../components/ui/RecordActions';
import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { useLanguage } from '../context/LanguageContext';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import { listFieldRainfall } from '../lib/fieldData';
import { dateToInputValue, formatDateForDisplay } from '../utils/dateHelpers';

export default function Rainfall() {
  const { activeSeason, profile } = useAppContext();
  const { language } = useLanguage();
  if (!activeSeason || !profile?.institutionId) {
    return <p>{language === 'pt' ? 'Selecione uma safra para registrar a pluviometria.' : 'Select a season to record rainfall.'}</p>;
  }
  return <SeasonRainfall key={activeSeason.id} season={activeSeason} institutionId={profile.institutionId} />;
}

function SeasonRainfall({ season, institutionId }: { season: { id: string; name: string }; institutionId: string }) {
  const { areas, isOnline } = useAppContext();
  const sync = useFieldSync();
  const { language } = useLanguage();
  const t = (pt: string, en: string) => language === 'pt' ? pt : en;
  const [areaId, setAreaId] = useState('');
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const writing = useRef(false);
  const [message, setMessage] = useState<{ failed: boolean; text: string } | null>(null);
  const today = dateToInputValue(new Date());
  const options = areas.map(area => ({ value: area.id, label: area.name }));

  const { data: result, failed, loading } = useFieldPage(
    'rainfall', season.id, filter, page, isOnline, revision + sync.revision, listFieldRainfall
  );
  const local = sync.entries.flatMap(record => record.kind === 'rainfall' && record.record.season_id === season.id ? [record] : []);
  const byId = new Map(local.map(record => [record.id, record]));
  const readings = [...result?.readings ?? []];
  for (const item of local) {
    if (page === 0 && (!filter || item.record.area_id === filter) && (!isOnline || item.state !== 'sent' || !result) &&
        !readings.some(reading => reading.id === item.id)) {
      readings.push({ ...item.record, created_at: item.createdAt, created_by: item.userId });
    }
  }
  readings.sort((a, b) => b.observed_on.localeCompare(a.observed_on) || b.created_at.localeCompare(a.created_at));

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (writing.current || saving || !areaId) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const millimeters = Number(String(fields.get('millimeters') ?? '').replace(',', '.'));
    if (!Number.isFinite(millimeters) || millimeters < 0 || millimeters > 3000) {
      setMessage({ failed: true, text: t('Informe um valor de 0 a 3.000 mm.', 'Enter a value from 0 to 3,000 mm.') });
      return;
    }
    writing.current = true;
    setSaving(true);
    setMessage(null);
    try {
      const observedOn = String(fields.get('date'));
      if (local.some(item => item.record.area_id === areaId && item.record.observed_on === observedOn)) {
        setMessage({ failed: true, text: t('Já existe uma leitura local para esse talhão e data.', 'A local reading already exists for this field and date.') });
        return;
      }
      await sync.enqueue({ kind: 'rainfall', record: { institution_id: institutionId, season_id: season.id,
        area_id: areaId, observed_on: observedOn, millimeters } });
      form.reset();
      setFilter(areaId);
      setPage(0);
      setRevision(previous => previous + 1);
      setMessage({ failed: false, text: t('Chuva salva neste dispositivo.', 'Rainfall saved on this device.') });
    } catch {
      setMessage({ failed: true, text: t('Não foi possível salvar no dispositivo. Tente novamente.', 'Could not save on this device. Try again.') });
    } finally {
      writing.current = false;
      setSaving(false);
    }
  };

  const number = new Intl.NumberFormat(language === 'pt' ? 'pt-BR' : 'en-US', { maximumFractionDigits: 2 });
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold">{t('Pluviometria', 'Rainfall')}</h1><p className="text-sm text-gray-600">{season.name}</p></div>
        <Link className="font-medium text-brand-700 underline" to="/farm-map?layer=rainfall">{t('Ver chuvas no mapa', 'View rainfall on map')}</Link>
      </header>
      {message && <p role={message.failed ? 'alert' : 'status'}>{message.text}</p>}
      <form className="space-y-4 rounded-xl border border-gray-200 bg-white p-4" onSubmit={save}>
        <h2 className="text-lg font-semibold">{t('Registrar chuva', 'Record rainfall')}</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <Select label={t('Talhão', 'Field')} placeholder={t('Selecione um talhão', 'Select a field')}
            options={options} value={areaId} onChange={event => setAreaId(event.target.value)} required />
          <Input name="date" type="date" label={t('Data', 'Date')} defaultValue={today} max={today} required />
          <Input name="millimeters" type="number" label={t('Chuva acumulada no dia (mm)', 'Daily rainfall (mm)')}
            min={0} max={3000} step="0.01" required />
        </div>
        <Button type="submit" disabled={saving || !areas.length}>{t('Salvar', 'Save')}</Button>
      </form>
      <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-lg font-semibold">{t('Leituras da safra', 'Season readings')}</h2>
        <div className="sm:max-w-72"><Select label={t('Filtrar por talhão', 'Filter by field')}
          options={[{ value: '', label: t('Todos os talhões', 'All fields') }, ...options]} value={filter}
          onChange={event => { setFilter(event.target.value); setPage(0); }} /></div>
        {!isOnline && <p className="text-sm text-gray-600">{t('As leituras salvas neste dispositivo serão enviadas ao voltar a conexão.', 'Readings saved on this device will be sent once the connection returns.')}</p>}
        {failed && <p role="alert">{t('Não foi possível atualizar as leituras.', 'Could not refresh the readings.')} <button className="underline" onClick={() => setRevision(previous => previous + 1)}>{t('Tentar novamente', 'Retry')}</button></p>}
        {loading && !readings.length && <p role="status">{t('Carregando…', 'Loading…')}</p>}
        {readings.length ? <ul className="divide-y divide-gray-100">
          {readings.map(reading => <li className="flex items-center justify-between gap-3 py-2" key={reading.id}>
            <div>{areas.find(area => area.id === reading.area_id)?.name ?? t('Talhão indisponível', 'Field unavailable')}
              <span className="block text-sm text-gray-500">{formatDateForDisplay(reading.observed_on, language)}</span>
              <FieldSyncStatus entry={byId.get(reading.id)} />
              <RecordActions table="field_rainfall" record={reading} queued={byId.get(reading.id)} onSaved={() => setRevision(previous => previous + 1)} />
            </div>
            <strong>{number.format(reading.millimeters)} mm</strong>
          </li>)}
        </ul> : !loading && <p>{t('Nenhuma leitura neste filtro.', 'No readings match this filter.')}</p>}
        {isOnline && (page > 0 || result?.hasNext) && <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={!result || page === 0} onClick={() => setPage(page - 1)}>{t('Anterior', 'Previous')}</Button>
          <Button type="button" variant="outline" disabled={!result?.hasNext} onClick={() => setPage(page + 1)}>{t('Próxima', 'Next')}</Button>
        </div>}
      </section>
    </div>
  );
}
