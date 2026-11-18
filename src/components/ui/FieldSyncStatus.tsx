import { useState } from 'react';
import { useFieldSync } from '../../context/FieldSyncContext';
import { useLanguage } from '../../context/LanguageContext';
import type { QueueEntry } from '../../lib/fieldQueue';

export default function FieldSyncStatus({ entry }: { entry?: QueueEntry }) {
  const { retry, discard } = useFieldSync();
  const { language } = useLanguage();
  const [failed, setFailed] = useState(false);
  if (!entry || entry.state === 'sent') return null;
  if (entry.state === 'pending') return <p className="text-xs font-medium text-amber-800">{language === 'pt' ? 'Aguardando sincronização' : 'Waiting to sync'}</p>;
  const act = (action: (record: QueueEntry) => Promise<void>) => {
    setFailed(false);
    void action(entry).catch(() => setFailed(true));
  };
  return (
    <div className="space-y-1 text-xs text-red-800">
      <p role="status">{entry.reason === 'duplicate-rainfall'
        ? (language === 'pt' ? 'Já há uma leitura no servidor para este talhão e data.' : 'The server already has a reading for this field and date.')
        : (language === 'pt' ? 'O servidor recusou este registro. Confira os dados ou as permissões.' : 'The server rejected this record. Check the data or permissions.')}</p>
      <div className="flex gap-3">
        {entry.reason !== 'duplicate-rainfall' && <button type="button" className="underline" onClick={() => act(retry)}>{language === 'pt' ? 'Reenviar' : 'Retry sync'}</button>}
        <button type="button" className="underline" onClick={() => {
          if (window.confirm(language === 'pt' ? 'Descartar este registro local e suas recomendações pendentes?' : 'Discard this local record and its pending recommendations?')) act(discard);
        }}>{language === 'pt' ? 'Descartar registro local' : 'Discard local record'}</button>
      </div>
      {failed && <p role="alert">{language === 'pt' ? 'Não foi possível atualizar este registro local.' : 'Could not update this local record.'}</p>}
    </div>
  );
}
