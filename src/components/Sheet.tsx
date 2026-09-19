import { useRef, type ReactNode } from 'react'
import { useBackDismiss } from './useBackDismiss'
import { useDialogFocus } from './useDialogFocus'
import { useEscape } from './useEscape'
import { useSwipeDown } from './useSwipeDown'
import { useT } from '../i18n/useT'
import './overlays.css'

/**
 * **Die Hülle eines Blatts** (mobil von unten, am Schreibtisch zentriert):
 * Hintergrund, Griff, Kopfzeile mit Überschrift und Schließen-Knopf — und die
 * vier Wege, es wieder loszuwerden: ✕, Hintergrund, Zurück-Taste, Escape.
 *
 * Sie stand viermal ausgeschrieben da (Zuteilen, Sprache, Hilfsdienst-Personen,
 * S-89), jede Abschrift mit denselben vier Hooks und denselben Zuschreibungen
 * für die Bedienbarkeit (`role="dialog"`, `aria-modal`, `aria-label`, der Griff
 * als `aria-hidden`). Und sie waren bereits uneinheitlich: Zwei riefen
 * `useEscape(() => dispatch(…))` statt `useEscape(close)` — derselbe Effekt,
 * zweimal geschrieben.
 *
 * Wer eine Regel ändert (etwa: Escape schließt nur das oberste Blatt), ändert
 * sie hier einmal statt an vier Stellen — und übersieht keine.
 *
 * **Nicht für `MyTaskSheet`**: Das Aufgaben-Blatt trägt eine eigene Hülle
 * (`confirm-modal`), weil es über dem Zuteilungs-Blatt liegt und sich nicht
 * herunterziehen lässt.
 */
/**
 * Ganze Klassennamen statt `sheet--${variante}`: Ein zusammengesetzter Name
 * steht nirgends im Quelltext, eine Textsuche findet ihn nicht, und die
 * zugehörigen CSS-Regeln gelten irgendwann als tot (T70 — genau so lagen
 * einmal zwei Wochen übereinander). `klassennamen.test.ts` wacht darüber.
 */
const SHEET_KLASSE = {
  lang: 'sheet sheet--lang',
  s89: 'sheet sheet--s89',
} as const

export function Sheet({
  label,
  title,
  sub,
  eyebrow,
  variante,
  onClose,
  children,
}: {
  /** Was ein Vorleseprogramm ansagt — meist derselbe Text wie `title`. */
  label: string
  title: ReactNode
  /** Zweite Zeile unter der Überschrift (Anzahl, Datum, Hinweis). */
  sub?: ReactNode
  /** Kleine Zeile **über** der Überschrift (das Formular-Kürzel „S-89"). */
  eyebrow?: ReactNode
  /** Zusatzklasse für Breite und Höhe: `lang` (lange Liste), `s89` (Formular). */
  variante?: 'lang' | 's89'
  onClose: () => void
  children: ReactNode
}) {
  const { t } = useT()
  const dlg = useRef<HTMLDivElement>(null)
  useDialogFocus(dlg)
  useBackDismiss(true, onClose)
  useEscape(onClose)
  useSwipeDown(dlg, onClose)

  return (
    <>
      <div
        className={variante === 's89' ? 'sheet-backdrop sheet-backdrop--s89' : 'sheet-backdrop'}
        onClick={onClose}
      />
      <div
        className={variante ? SHEET_KLASSE[variante] : 'sheet'}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        ref={dlg}
      >
        <span className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <div>
            {eyebrow}
            <div className="sheet-title">{title}</div>
            {sub !== undefined && <div className="sheet-sub">{sub}</div>}
          </div>
          <button type="button" className="sheet-close" aria-label={t.a11yClose} onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </>
  )
}
