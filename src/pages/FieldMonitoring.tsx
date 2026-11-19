import { useFieldSync } from '../context/FieldSyncContext';
import { useFieldPage } from '../hooks/useFieldPage';
import FieldSyncStatus from '../components/ui/FieldSyncStatus';
import RecordActions from '../components/ui/RecordActions';
import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Plus, X } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useLanguage } from '../context/LanguageContext';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import {
  listFieldReports, type MonitoringReport
} from '../lib/fieldData';
import { dateToInputValue, formatDateForDisplay } from '../utils/dateHelpers';

const panel = 'rounded-xl border border-gray-200 bg-white p-4 sm:p-6';
const textarea = 'block w-full rounded-lg border border-gray-300 p-3 text-sm';
const linkStyle = 'inline-flex rounded-lg bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-800';
const emptyData: Awaited<ReturnType<typeof listFieldReports>> = { reports: [], recommendations: [], hasNext: false };
const newProduct = () => ({ key: crypto.randomUUID(), productId: '', dose: '' });

export default function FieldMonitoring() {
  const { activeSeason, profile } = useAppContext();
  const { language } = useLanguage();
  if (!activeSeason || !profile?.institutionId) {
    return <p className={panel}>{language === 'pt' ? 'Selecione uma safra para acessar o monitoramento.' : 'Select a season to access field monitoring.'}</p>;
  }
  return <SeasonMonitoring key={activeSeason.id} season={activeSeason} institutionId={profile.institutionId} />;
}

function SeasonMonitoring({ season, institutionId }: {
  season: { id: string; name: string };
  institutionId: string;
}) {
  const { areas, products, isOnline } = useAppContext();
  const sync = useFieldSync();
  const { language } = useLanguage();
  const t = (pt: string, en: string) => language === 'pt' ? pt : en;
  const [filterArea, setFilterArea] = useState('');
  const [page, setPage] = useState(0);
  const [reload, setReload] = useState(0);

  const [entry, setEntry] = useState(false);
  const [target, setTarget] = useState<MonitoringReport | null>(null);
  const [items, setItems] = useState<ReturnType<typeof newProduct>[]>([]);
  const [saving, setSaving] = useState(false);
  const writing = useRef(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const today = dateToInputValue(new Date());
  const doseFormat = new Intl.NumberFormat(language === 'pt' ? 'pt-BR' : 'en-US', { maximumFractionDigits: 8 });

  const { data: remote, loading, failed: loadError } = useFieldPage(
    'monitoring', season.id, filterArea, page, isOnline, reload + sync.revision, listFieldReports
  );
  const saved = remote ?? emptyData;
  const local = sync.entries.filter(record => record.record.season_id === season.id &&
    (!filterArea || record.record.area_id === filterArea));
  const byId = new Map(local.map(record => [record.id, record]));
  const reports = [...saved.reports];
  const recommendations = [...saved.recommendations];
  for (const record of local) {
    const metadata = { id: record.id, created_at: record.createdAt, created_by: record.userId };
    if (record.kind === 'report' && page === 0 && (!isOnline || record.state !== 'sent' || !remote) &&
        !reports.some(report => report.id === record.id)) {
      reports.push({ ...record.record, ...metadata });
    }
    if (record.kind === 'recommendation' && (!isOnline || record.state !== 'sent' || !remote) && reports.some(report => report.id === record.record.report_id) &&
        !recommendations.some(recommendation => recommendation.id === record.id)) {
      recommendations.push({ ...record.record, ...metadata, operation_id: null, executed_at: null, executed_by: null });
    }
  }
  reports.sort((a, b) => b.observed_on.localeCompare(a.observed_on) || b.created_at.localeCompare(a.created_at));

  const close = () => { setEntry(false); setTarget(null); };
  const openEntry = () => { setMessage(null); setTarget(null); setEntry(true); };
  const openRecommendation = (report: MonitoringReport) => {
    setMessage(null);
    setEntry(false);
    setTarget(report);
    setItems([newProduct()]);
    window.scrollTo(0, 0);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (writing.current || saving) return;
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? '').trim();
    const scope = { institution_id: institutionId, season_id: season.id, area_id: target?.area_id ?? value('area') };
    writing.current = true;
    setSaving(true);
    setMessage(null);
    try {
      if (target) {
        const selected = items.map(item => ({ productId: item.productId, dose: Number(item.dose.trim().replace(',', '.')) }));
        if (selected.some(item => !item.productId || !Number.isFinite(item.dose) || item.dose <= 0 || item.dose > 1000000) ||
            new Set(selected.map(item => item.productId)).size !== selected.length) {
          setMessage({ error: true, text: t('Informe uma dose positiva para cada produto e selecione cada produto uma única vez.', 'Enter a positive rate for each product and select each product once.') });
          return;
        }
        const recommended = selected.flatMap(item => {
          const product = products.find(candidate => candidate.id === item.productId);
          return product ? [{ ...item, name: product.name, unit: product.unit }] : [];
        });
        if (recommended.length !== selected.length) throw new Error('Product missing locally');
        await sync.enqueue({ kind: 'recommendation', record: { ...scope, report_id: target.id,
          operation_type: value('type'), instructions: value('instructions'), products: recommended } });
      } else {
        await sync.enqueue({ kind: 'report', record: { ...scope, observed_on: value('date'),
          phenological_stage: value('stage'), report: value('report') } });
        setPage(0);
        if (filterArea && filterArea !== scope.area_id) setFilterArea('');
      }
      setMessage({ error: false, text: t('Registro salvo neste dispositivo.', 'Record saved on this device.') });
      close();
      setReload(value => value + 1);
    } catch (error) {
      console.error('Error saving field data:', error);
      setMessage({ error: true, text: t('Não foi possível salvar no dispositivo. Tente novamente.', 'Could not save on this device. Try again.') });
    } finally {
      writing.current = false;
      setSaving(false);
    }
  };

  const areaOptions = areas.map(area => ({ value: area.id, label: area.name }));
  const productOptions = products.map(product => ({ value: product.id, label: product.name }));
  const areaName = (id: string) => areas.find(area => area.id === id)?.name ?? t('Talhão indisponível', 'Field unavailable');

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('Monitoramento e recomendações', 'Monitoring and recommendations')}</h1>
          <p className="text-sm text-gray-600">{season.name}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className={linkStyle} to="/rainfall">{t('Pluviometria', 'Rainfall')}</Link>
          <Button type="button" leftIcon={<Plus size={18} />} disabled={!areas.length || saving} onClick={openEntry}>{t('Novo monitoramento', 'New monitoring report')}</Button>
        </div>
      </header>

      {message && <p role={message.error ? 'alert' : 'status'} className={message.error ? 'text-red-800' : 'text-brand-700'}>{message.text}</p>}
      {(entry || target) && (
        <form className={panel + ' space-y-4'} onSubmit={submit} key={target?.id ?? 'report'}>
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-lg font-semibold">{target ? t('Nova recomendação', 'New recommendation') : t('Novo monitoramento', 'New monitoring report')}</h2>
            <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={close} aria-label={t('Fechar formulário', 'Close form')}><X size={18} /></Button>
          </div>
          {target ? (
            <>
              <p className="text-sm text-gray-600">{areaName(target.area_id)} · {formatDateForDisplay(target.observed_on, language)}</p>
              <Select name="type" label={t('Tipo de aplicação', 'Application type')} required options={[
                { value: 'fungicida', label: t('Fungicida', 'Fungicide') },
                { value: 'inseticida', label: t('Inseticida', 'Insecticide') },
                { value: 'herbicida', label: t('Herbicida', 'Herbicide') },
                { value: 'dessecacao', label: t('Dessecação', 'Desiccation') },
                { value: 'adubacao', label: t('Adubação', 'Fertilization') },
                { value: 'pulverizacao', label: t('Pulverização', 'Spraying') }
              ]} />
              {items.map((item, index) => {
                const unit = products.find(product => product.id === item.productId)?.unit;
                const sizeUnit = ({ hectare: 'ha', acre: 'ac', squareMeter: 'm²' } as const)[areas.find(area => area.id === target.area_id)?.unit ?? 'hectare'];
                const updateItem = (update: Partial<typeof item>) => setItems(previous => previous.map(row => row.key === item.key ? { ...row, ...update } : row));
                return (
                  <div key={item.key} className="flex flex-wrap items-end gap-2">
                    <div className="min-w-40 flex-1">
                      <Select label={t('Produto', 'Product') + ' ' + (index + 1)} value={item.productId} required
                        placeholder={t('Selecione o produto', 'Select a product')} options={productOptions}
                        onChange={event => updateItem({ productId: event.target.value })} />
                    </div>
                    <div className="w-40">
                      <Input label={t('Dose', 'Rate') + (unit ? ' (' + unit + '/' + sizeUnit + ')' : '')} value={item.dose}
                        inputMode="decimal" required onChange={event => updateItem({ dose: event.target.value })} />
                    </div>
                    <Button type="button" variant="ghost" size="sm" disabled={items.length === 1} onClick={() => setItems(previous => previous.filter(row => row.key !== item.key))}
                      aria-label={t('Remover produto', 'Remove product') + ' ' + (index + 1)}><X size={16} /></Button>
                  </div>
                );
              })}
              <Button type="button" variant="outline" size="sm" disabled={items.length >= 50} onClick={() => setItems(previous => [...previous, newProduct()])}>{t('Adicionar produto', 'Add product')}</Button>
              <label className="block space-y-1 text-sm font-medium">{t('Orientações', 'Instructions')}<textarea name="instructions" className={textarea} rows={3} maxLength={12000} /></label>
            </>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Select name="area" label={t('Talhão', 'Field')} required defaultValue={filterArea}
                  placeholder={t('Selecione um talhão', 'Select a field')} options={areaOptions} />
                <Input name="date" label={t('Data', 'Date')} type="date" required defaultValue={today} max={today} />
              </div>
              <Input name="stage" label={t('Estádio fenológico', 'Growth stage')} placeholder="V4, R1..." required maxLength={120} />
              <label className="block space-y-1 text-sm font-medium">{t('Relatório de monitoramento', 'Monitoring report')}<textarea name="report" className={textarea} rows={5} required maxLength={12000} /></label>
            </>
          )}
          <Button type="submit" disabled={saving}>{saving ? t('Salvando…', 'Saving…') : t('Salvar', 'Save')}</Button>
        </form>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-full sm:w-64">
          <Select label={t('Filtrar por talhão', 'Filter by field')} value={filterArea}
            options={[{ value: '', label: t('Todos os talhões', 'All fields') }, ...areaOptions]}
            onChange={event => { setFilterArea(event.target.value); setPage(0); }} />
        </div>
        <Link className="text-sm font-medium text-brand-700 underline" to="/farm-map?layer=rainfall">{t('Ver chuvas no mapa', 'View rainfall on map')}</Link>
      </div>
      {!isOnline && <p className="text-sm text-gray-600">{t('Você pode registrar monitoramentos e recomendações. A sincronização ocorre quando a conexão voltar.', 'You can record reports and recommendations. Sync resumes when the connection returns.')}</p>}
      {isOnline && loading && <p role="status">{t('Carregando monitoramentos…', 'Loading reports…')}</p>}
      {isOnline && loadError && <p role="alert">{t('Não foi possível carregar os monitoramentos.', 'Could not load reports.')} <button className="underline" onClick={() => setReload(value => value + 1)}>{t('Tentar novamente', 'Retry')}</button></p>}
      {!loading && !loadError && !reports.length && <p className={panel}>{t('Nenhum monitoramento para este filtro.', 'No reports match this filter.')}</p>}
      {reports.map(report => (
        <article className={panel + ' space-y-3'} key={report.id}>
          <header className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-2 font-semibold"><ClipboardList size={18} />{areaName(report.area_id)}</h2>
              <p className="text-sm text-gray-600">{formatDateForDisplay(report.observed_on, language)} · {report.phenological_stage}</p>
            </div>
            <Button type="button" variant="outline" size="sm" disabled={!products.length || saving || byId.get(report.id)?.state === 'blocked'}
              onClick={() => openRecommendation(report)}>{t('Recomendar aplicação', 'Recommend application')}</Button>
          </header>
          <p className="whitespace-pre-wrap break-words text-sm">{report.report}</p>
          <FieldSyncStatus entry={byId.get(report.id)} />
          <RecordActions table="field_monitoring_reports" record={report} queued={byId.get(report.id)} onSaved={() => setReload(value => value + 1)} />
          {recommendations.filter(recommendation => recommendation.report_id === report.id).map(recommendation => (
            <section className="space-y-2 rounded-lg bg-brand-50 p-3 text-sm" key={recommendation.id}>
              <h3 className="font-semibold capitalize">{t('Recomendação', 'Recommendation')} · {recommendation.operation_type}</h3>
              <ul className="list-disc pl-5">
                {recommendation.products.map(product => (
                  <li key={product.productId}>{product.name} · {doseFormat.format(product.dose)} {product.unit}/{
                    ({ hectare: 'ha', acre: 'ac', squareMeter: 'm²' } as const)[areas.find(area => area.id === report.area_id)?.unit ?? 'hectare']
                  }</li>
                ))}
              </ul>
              {recommendation.instructions && <p className="whitespace-pre-wrap break-words">{recommendation.instructions}</p>}
              <FieldSyncStatus entry={byId.get(recommendation.id)} />
              <RecordActions table="field_recommendations" record={recommendation} queued={byId.get(recommendation.id)} locked={!!recommendation.executed_at} onSaved={() => setReload(value => value + 1)} />
              {recommendation.executed_at ? (
                <p className="font-medium text-brand-800">{t('Operação registrada em', 'Operation recorded on')} {formatDateForDisplay(new Date(recommendation.executed_at), language)}</p>
              ) : isOnline && (!byId.has(recommendation.id) || byId.get(recommendation.id)?.state === 'sent') && (
                <Link className={linkStyle} to={'/operations/new?recommendation=' + recommendation.id}>{t('Realizar operação', 'Perform operation')}</Link>
              )}
            </section>
          ))}
        </article>
      ))}
      {isOnline && (page > 0 || saved.hasNext) && (
        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={page === 0 || loading} onClick={() => setPage(page - 1)}>{t('Anterior', 'Previous')}</Button>
          <Button type="button" variant="outline" disabled={!saved.hasNext || loading} onClick={() => setPage(page + 1)}>{t('Próxima', 'Next')}</Button>
        </div>
      )}
    </div>
  );
}
