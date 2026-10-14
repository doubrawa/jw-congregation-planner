import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../app/context'
import { BlattFeld } from '../bausteine/BlattFeld'
import { Sheet } from '../components/Sheet'
import { useT } from '../i18n/useT'

/**
 * **Hilfsdienst hinzufügen** (T121): ein Name, dann „Hinzufügen" — wie in den
 * übrigen Blättern, die etwas Neues anlegen. Bis zur Phase 6c stand dafür ein
 * Feld unter der Liste, das einen leeren Namen erst nach dem Tipp mit einem
 * Hinweis abwies; hier geht der Knopf erst mit einem Namen.
 *
 * Ein neuer Dienst beginnt mit einem Platz je Zusammenkunft und als eigener
 * Aufgabenbereich ohne Freigaben. Deshalb öffnet sich danach gleich sein Blatt:
 * Dort steht, wer ihn übernehmen darf — sonst bliebe sein Platz offen (T79).
 */
export function HilfsdienstNeuBlatt({ onClose }: { onClose: () => void }) {
  const { dispatch } = useApp()
  const { t } = useT()
  const [name, setName] = useState('')
  const bereit = name.trim() !== ''

  const hinzufuegen = () => {
    if (!bereit) return
    const key = `svc-${crypto.randomUUID()}`
    dispatch({ type: 'addService', service: { key, name: name.trim(), count: 1, groups: false } })
    onClose()
    dispatch({ type: 'openServiceSheet', key })
  }

  return createPortal(
    <Sheet label={t.hilfsdienstHinzu} title={t.hilfsdienstHinzu} onClose={onClose}>
      <form
        className="sheet-formular"
        onSubmit={(e) => {
          e.preventDefault()
          hinzufuegen()
        }}
      >
        <div className="sheet-inhalt blatt-felder">
          <BlattFeld marke={t.nameLbl}>
            <input
              className="feld"
              type="text"
              dir="auto"
              autoComplete="off"
              placeholder={t.neuerDienstPh}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </BlattFeld>
        </div>
        <div className="sheet-fuss">
          <button type="submit" className="knopf-haupt" disabled={!bereit}>
            {t.hinzufuegenKnopf}
          </button>
          <button type="button" className="knopf-leise" onClick={onClose}>
            {t.abbrechen}
          </button>
        </div>
      </form>
    </Sheet>,
    document.body,
  )
}
