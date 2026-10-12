import { useRef, type ReactNode } from 'react'
import { Zeichen } from '../bausteine/Zeichen'
import { useBackDismiss } from './useBackDismiss'
import { useDialogFocus } from './useDialogFocus'
import { useEscape } from './useEscape'
import { useSwipeDown } from './useSwipeDown'
import { useT } from '../i18n/useT'
import './overlays.css'

/**
 * **Die Hülle eines Blatts** (mobil von unten, am Schreibtisch zentriert):
 * Schleier, Griff, Kopf mit Überschrift und Schließen-Knopf — und die vier
 * Wege, es wieder loszuwerden: ✕, Schleier, Zurück-Taste, Escape (am Handy
 * dazu das Herunterwischen).
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
 */

/**
 * Ganze Klassennamen statt `sheet--${variante}`: Ein zusammengesetzter Name
 * steht nirgends im Quelltext, eine Textsuche findet ihn nicht, und die
 * zugehörigen CSS-Regeln gelten irgendwann als tot (T70 — genau so lagen
 * einmal zwei Wochen übereinander). `klassennamen.test.ts` wacht darüber.
 */
const SHEET_KLASSE = {
  normal: 'sheet',
  lang: 'sheet sheet--lang',
  oben: 'sheet sheet--oben',
} as const

export function Sheet({
  label,
  title,
  sub,
  eyebrow,
  variante = 'normal',
  schliessen = true,
  onClose,
  children,
}: {
  /** Was ein Vorleseprogramm ansagt — meist derselbe Text wie `title`. */
  label: string
  title: ReactNode
  /** Zweite Zeile unter der Überschrift (Anzahl, Datum, Hinweis). */
  sub?: ReactNode
  /** Kleine Zeile **über** der Überschrift (das Formular-Kürzel „S-89", die Aufgabe). */
  eyebrow?: ReactNode
  /**
   * `lang`: eine lange Liste, das Blatt nimmt die Höhe, die es bekommt.
   * `oben`: liegt über einem anderen Blatt (S-89 über dem Zuteilen, Absagen
   * über dem Blatt beim Öffnen) — siehe die Ebenen in tokens.css.
   */
  variante?: keyof typeof SHEET_KLASSE
  /**
   * Ohne ✕ im Kopf — für ein Blatt, das seinen Ausgang selbst unten anbietet
   * („Später"). Schleier, Zurück und Escape schließen es trotzdem.
   */
  schliessen?: boolean
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
        className={variante === 'oben' ? 'sheet-backdrop sheet-backdrop--oben' : 'sheet-backdrop'}
        onClick={onClose}
      />
      <div className={SHEET_KLASSE[variante]} role="dialog" aria-modal="true" aria-label={label} ref={dlg}>
        <span className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <div className="sheet-kopf">
            {eyebrow}
            <h2 className="sheet-title">{title}</h2>
            {sub !== undefined && <div className="sheet-sub">{sub}</div>}
          </div>
          {schliessen && (
            <button type="button" className="rund-knopf rund-knopf--feld" aria-label={t.a11yClose} onClick={onClose}>
              <Zeichen name="kreuz" />
            </button>
          )}
        </div>
        {children}
      </div>
    </>
  )
}
