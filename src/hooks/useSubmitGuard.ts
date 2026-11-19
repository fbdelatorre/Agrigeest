import { useRef, useState } from 'react';
export function useSubmitGuard() {
  const running = useRef(false);
  const [saving, setSaving] = useState(false);
  async function runSubmit(action: () => unknown) {
    if (running.current) return;
    running.current = true; setSaving(true);
    try { await action(); }
    finally { running.current = false; setSaving(false); }
  }
  return { saving, runSubmit };
}
