import { useState } from 'react';
import { useFieldSync } from '../../context/FieldSyncContext';
import { useLanguage } from '../../context/LanguageContext';
import type { QueueEntry } from '../../lib/fieldQueue';
import Input from './Input';
import Button from './Button';

export default function FieldSyncStatus({ entry }: { entry?: QueueEntry }) {
  const { retry, discard } = useFieldSync();
  const { language } = useLanguage();
  const [failed, setFailed] = useState(false);
  const [newCode, setNewCode] = useState('');
  if (!entry || entry.state === 'sent') return null;
  if (entry.state === 'pending') return <p role="status" className={'rounded-lg border p-2 text-sm font-semibold '+(entry.holdReason==='authorization'?'border-red-300 bg-red-50 text-red-800':'border-amber-300 bg-amber-50 text-amber-900')}>{language==='pt'?'NÃO ENVIADO — '+(entry.holdReason==='authorization'?'acesso bloqueado. Regularize a licença, função ou autorização do aparelho. O registro está salvo neste dispositivo.':entry.holdReason==='parent'?'aguardando o envio do monitoramento vinculado.':entry.holdReason==='connection'?'sem confirmação do servidor. Salvo neste dispositivo.':'aguardando sincronização. Salvo neste dispositivo.'):'NOT SENT — saved on this device; waiting for synchronization.'}</p>;
  const act = (action: (record: QueueEntry) => Promise<void>) => {
    setFailed(false);
    void action(entry).catch(() => setFailed(true));
  };
  return (
    <div className="space-y-1 text-xs text-red-800">
      <p className="rounded-lg border border-red-300 bg-red-50 p-2 font-semibold">{language==='pt'?'NÃO ENVIADO — o servidor recusou este registro. Ele continua salvo neste aparelho.':'NOT SENT — rejected by the server; saved on this device.'}</p>
      <p role="status">{entry.reason === 'duplicate-rainfall'
        ? (language === 'pt' ? 'Já há uma leitura no servidor para este talhão e data.' : 'The server already has a reading for this field and date.')
        : entry.reason === 'duplicate-sample'
          ? (language === 'pt' ? 'O código já existe nesta propriedade. Informe outro para reenviar.' : 'This code already exists. Enter another code to retry.')
          : (language === 'pt' ? 'O servidor recusou este registro. Confira os dados ou as permissões.' : 'The server rejected this record. Check the data or permissions.')}</p>
      {entry.reason === 'duplicate-sample' && entry.kind === 'sample' && <div className="flex flex-wrap items-end gap-2">
        <Input label={language === 'pt' ? 'Novo código' : 'New code'} value={newCode} maxLength={48}
          onChange={event => setNewCode(event.target.value.toUpperCase())} />
        <Button size="sm" type="button" disabled={!/^[A-Z0-9][A-Z0-9._/-]{0,47}$/.test(newCode) || /^AG-[0-9A-F]{32}$/.test(newCode)}
          onClick={() => act(() => retry({ ...entry, record: { ...entry.record, lab_code: newCode } }))}>
          {language === 'pt' ? 'Corrigir e reenviar' : 'Correct and retry'}
        </Button>
      </div>}
      <div className="flex gap-3">
        {entry.reason === 'rejected' && <button type="button" className="underline" onClick={() => act(retry)}>{language === 'pt' ? 'Reenviar' : 'Retry sync'}</button>}
        {entry.reason === 'rejected' && entry.kind === 'sample' && entry.record.zone_id &&
          <button type="button" className="underline" onClick={() => act(() => retry({ ...entry, record: { ...entry.record, zone_id: null } }))}>
            {language === 'pt' ? 'Reenviar sem zona' : 'Retry without zone'}
          </button>}
        <button type="button" className="underline" onClick={() => {
          if (window.confirm(language === 'pt' ? 'Descartar este registro local e suas recomendações pendentes?' : 'Discard this local record and its pending recommendations?')) act(discard);
        }}>{language === 'pt' ? 'Descartar registro local' : 'Discard local record'}</button>
      </div>
      {failed && <p role="alert">{language === 'pt' ? 'Não foi possível atualizar este registro local.' : 'Could not update this local record.'}</p>}
    </div>
  );
}
