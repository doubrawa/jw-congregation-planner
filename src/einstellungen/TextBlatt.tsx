import { createPortal } from 'react-dom'
import { Sheet } from '../components/Sheet'
import { useT } from '../i18n/useT'

/**
 * **Ein Wort der Versammlung** — ihr Name oder die Anschrift des
 * Königreichssaals (T121, Zeilen in `GEinstellungen`): ein Feld, das sofort
 * gilt wie bisher im Panel, und „Fertig". Was darin steht, gehört der
 * Versammlung und steht in seiner eigenen Richtung (`dir="auto"`).
 */
export function TextBlatt({
  titel,
  wert,
  onWert,
  onClose,
}: {
  titel: string
  wert: string
  onWert: (wert: string) => void
  onClose: () => void
}) {
  const { t } = useT()
  return createPortal(
    <Sheet label={titel} title={titel} onClose={onClose}>
      <div className="sheet-inhalt blatt-felder">
        <input
          className="feld"
          type="text"
          dir="auto"
          autoComplete="off"
          aria-label={titel}
          value={wert}
          onChange={(e) => onWert(e.target.value)}
        />
      </div>
      <div className="sheet-fuss-ende">
        <button type="button" className="knopf-haupt" onClick={onClose}>
          {t.fertig}
        </button>
      </div>
    </Sheet>,
    document.body,
  )
}
