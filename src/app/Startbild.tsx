import { useEffect } from 'react'
import { Logo } from '../bausteine/Logo'
import { useT } from '../i18n/useT'
import { startbildMelden } from './darstellung'

/**
 * So breit zeigt Android das Logo beim Start der installierten App: 170 dp
 * über den Ausschnitt, gemessen am 19.10.2026 auf dem Handy des Betreibers.
 * Gleich groß und an derselben Stelle geht das Bild von Android ohne Sprung in
 * dieses über.
 */
const STARTBILD_BREITE = 170

/**
 * **Das Startbild** (19.10.2026, Entwurf „B · Welle durch die Reihen" der
 * Leinwand) — bis die App etwas zu zeigen hat: solange offen ist, wer
 * angemeldet ist (`sitzungPruefen`), und solange die Daten kommen.
 *
 * Bis dahin wechselte das Bild dreimal: das Bild von Android, eine leere
 * Fläche, die Kopfzeile mit „Lädt …" klein oben, dann Start. Jetzt steht vom
 * ersten Bild an dasselbe da: `index.html` zeichnet es, bevor das Skript
 * geladen ist, und dieses hier löst es Zeichen für Zeichen gleich ab
 * (`tests/startbild-vorab.test.tsx`). Dauert es, läuft eine Welle vom Pult
 * durch die Reihen (`shell.css`); ohne Bewegung steht stattdessen „Lädt …"
 * darunter. Vorleseprogramme hören das Wort immer.
 */
export function Startbild() {
  const { t } = useT()
  useEffect(() => {
    startbildMelden(true)
    return () => startbildMelden(false)
  }, [])
  return (
    <div className="startbild startbild-welle" role="status">
      <Logo gross breite={STARTBILD_BREITE} className="startbild-logo" />
      <p className="startbild-text sr-only">{t.laedt}</p>
    </div>
  )
}
