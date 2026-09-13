import { useEffect, useState } from 'react'
import { isoDay } from '../data/meeting-dates'

/**
 * **Der heutige Kalendertag** („2026-09-08", örtlich) — und ein neuer Render,
 * sobald er wechselt.
 *
 * Wer „vorbei" rechnet, rechnet mit dem Datum. Solange das Ergebnis bei jedem
 * Render neu entsteht, stimmt es mit dem nächsten Render wieder; wird es aber
 * gemerkt (`useMemo`), bleibt es stehen, bis sich eine seiner Abhängigkeiten
 * ändert — und das Datum war keine. Die Planungs-Karte zählte dann am
 * Mittwochmorgen noch die offenen Plätze vom Dienstag, solange niemand etwas an
 * den Wochen änderte. Als Abhängigkeit eingetragen, rechnet sie neu, sobald der
 * Tag ein anderer ist.
 *
 * **Warum es zwei Anlässe braucht.** Eine installierte App bleibt oft über Nacht
 * im Speicher, und im Hintergrund hält das Betriebssystem Zeitgeber an — der zur
 * Mitternacht feuert dann nicht. Beim Zurückkehren (`visibilitychange`) wird
 * deshalb nachgesehen; der Zeitgeber deckt die App ab, die über Mitternacht
 * offen im Vordergrund steht. Ändert sich nichts, bleibt der Zustand gleich und
 * es gibt keinen Render.
 */
export function useKalendertag(): string {
  const [tag, setTag] = useState(() => isoDay(new Date()))

  useEffect(() => {
    const pruefen = (): void => setTag(isoDay(new Date()))
    let zeitgeber: ReturnType<typeof setTimeout> | undefined
    const bisMitternacht = (): void => {
      const jetzt = new Date()
      const morgen = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate() + 1)
      // Eine Sekunde Luft: pünktlich um 0:00:00 läse `new Date()` womöglich noch
      // den alten Tag.
      zeitgeber = setTimeout(() => {
        pruefen()
        bisMitternacht()
      }, morgen.getTime() - jetzt.getTime() + 1000)
    }
    const beimZurueckkehren = (): void => {
      if (document.visibilityState === 'visible') pruefen()
    }
    bisMitternacht()
    document.addEventListener('visibilitychange', beimZurueckkehren)
    return () => {
      clearTimeout(zeitgeber)
      document.removeEventListener('visibilitychange', beimZurueckkehren)
    }
  }, [])

  return tag
}
