import { useEffect, useState } from 'react'
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
 * So lange steht das Logo still, bevor sich die Plätze füllen: Ist die App bis
 * dahin da, bleibt es beim ruhigen Bild wie bei Android — ein Füllen, das
 * gerade beginnt und abbricht, wäre ein Zucken.
 *
 * Gewartet wird hier und nicht mit einer Verzögerung im CSS: Chrome glättet
 * die Ränder eines Kreises anders, sobald eine `transform`- oder
 * `opacity`-Animation an ihm hängt, auch während ihrer Verzögerung (bis 47/255
 * am Rand, gemessen am 22.10.2026). Hinge sie von Anfang an am Logo, zuckten
 * die Kanten, wenn React das Bild aus `index.html` ablöst.
 */
const FUELLEN_AB_MS = 500

/**
 * **Das Startbild** (19.10.2026, Entwurf „B" der Leinwand) — bis die App etwas
 * zu zeigen hat: solange offen ist, wer angemeldet ist (`sitzungPruefen`), und
 * solange die Daten kommen.
 *
 * Bis dahin wechselte das Bild dreimal: das Bild von Android, eine leere
 * Fläche, die Kopfzeile mit „Lädt …" klein oben, dann Start. Jetzt steht vom
 * ersten Bild an dasselbe da: `index.html` zeichnet es, bevor das Skript
 * geladen ist, und dieses hier löst es Zeichen für Zeichen gleich ab
 * (`tests/startbild-vorab.test.tsx`).
 *
 * Dauert es, füllen sich die Plätze (22.10.2026, im Stil des Clips „Erste
 * Schritte"; bis dahin lief eine Welle durch die Reihen): Der Saal wird blass,
 * dann füllt er sich Reihe für Reihe vom Pult nach hinten (`shell.css`).
 * „Lädt …" hören nur Vorleseprogramme — zu sehen ist es nie, auch ohne
 * Bewegung nicht; der Betreiber wollte das Wort nicht mehr im Startbild.
 */
export function Startbild() {
  const { t } = useT()
  const [fuellen, setFuellen] = useState(false)
  useEffect(() => {
    startbildMelden(true)
    return () => startbildMelden(false)
  }, [])
  useEffect(() => {
    const wecker = setTimeout(() => setFuellen(true), FUELLEN_AB_MS)
    return () => clearTimeout(wecker)
  }, [])
  return (
    <div className={fuellen ? 'startbild startbild-fuellen' : 'startbild'} role="status">
      <Logo gross leerePlaetze breite={STARTBILD_BREITE} className="startbild-logo" />
      <p className="sr-only">{t.laedt}</p>
    </div>
  )
}
