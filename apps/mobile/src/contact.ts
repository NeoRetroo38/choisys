import { useCallback, useEffect, useRef, useState } from 'react';
import * as Clipboard from 'expo-clipboard';

/** Único canal público de contacto por ahora: el teléfono de empresa (decisión del dueño, 8 oct). */
export const CONTACT_PHONE = { value: '+34633693369', label: '+34 633 693 369' } as const;

/** Copies the phone to the clipboard and reports "copied" for a moment, so the tap has visible feedback. */
export function useCopyPhone(): [copied: boolean, copy: () => void] {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const copy = useCallback(() => {
    void Clipboard.setStringAsync(CONTACT_PHONE.value).then(ok => {
      if (ok === false) return;
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    }, () => undefined);
  }, []);
  return [copied, copy];
}
