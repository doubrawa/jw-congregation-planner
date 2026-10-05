import { flushSync } from 'react-dom'
import { useApp } from '../app/context'
import { useT } from '../i18n/useT'
import { druckKennzeichen } from './druck'

/**
 * **Drucken für die Pläne ohne Woche** (5.10.2026): Gruppenbesuche,
 * öffentliches Zeugnisgeben und Weitere Pläne (T120).
 *
 * Bis dahin hatten nur das Programm und die Treffpunkte einen Druckknopf. Der
 * Reinigungsplan und die Zeugnis-Schichten gehören aber genauso an den Aushang.
 * Gedruckt wird die Ansicht, wie sie dasteht — ohne Bedienelemente und ohne
 * App-Rahmen (`print.css`), mit einer Kopfzeile, die das Blatt zuordnet:
 * Versammlung und Plan. Ein eigenes Kennzeichen braucht es nicht; die Regeln
 * der Woche gelten (`druckKennzeichen(null)` räumt ein stehengebliebenes ab).
 *
 * `vorbereiten` läuft vor dem Druck und landet sofort im DOM (`flushSync`) —
 * so klappt das Zeugnisgeben alle Wochen auf, bevor der Druckdialog das Blatt
 * aufnimmt, wie beim Monat des Programms.
 */
export function AnsichtDrucken({ titel, vorbereiten }: { titel: string; vorbereiten?: () => void }) {
  const { state } = useApp()
  const { t } = useT()

  const drucken = () => {
    if (vorbereiten) flushSync(vorbereiten)
    druckKennzeichen(null)
    window.print()
  }

  return (
    <>
      {/* Nur im Ausdruck: Tabs und Navigation fehlen dort. */}
      <div className="prog-print-head">
        <span>{state.congregation.name}</span>
        <span>{titel}</span>
      </div>
      <div className="prog-meta-row druck-zeile">
        <button type="button" className="prog-print-btn" onClick={drucken}>
          {t.drucken}
        </button>
      </div>
    </>
  )
}
