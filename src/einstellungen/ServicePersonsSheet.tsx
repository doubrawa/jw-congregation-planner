import { useMemo, useRef, useState } from 'react'
import { useApp } from '../app/context'
import { useBackDismiss } from '../components/useBackDismiss'
import { useDialogFocus } from '../components/useDialogFocus'
import { useEscape } from '../components/useEscape'
import { useSwipeDown } from '../components/useSwipeDown'
import { isQualified, listName, personCompare, serviceQualKey } from '../data/helpers'
import { fill, useT } from '../i18n/useT'
import { PrivToggle } from '../personen/PrivToggle'
import '../components/overlays.css'

/**
 * Freigabe-Liste eines Hilfsdienstes: alle Personen, je eine mit Schalter.
 *
 * Wer einen Dienst übernehmen darf, entschied bis dahin allein das
 * Personen-Detail — ein Schalter je Person, also einmal quer durch die
 * Versammlung, bis ein Dienst besetzbar war. Ein **neu angelegter** Dienst
 * beginnt bei null Freigaben; ohne diesen Weg blieb sein Platz Woche für Woche
 * offen, ohne dass die Auto-Zuteilung es sagen konnte (T79).
 *
 * Die Zeilen sind dieselbe `PrivToggle` wie im Personen-Detail — derselbe
 * Schalter, dasselbe Speichern (`updatePerson`), nur nach der anderen Seite
 * aufgezogen: dort eine Person und ihre Bereiche, hier ein Bereich und seine
 * Personen. Ein zweiter Schalter mit eigener Logik wäre früher oder später ein
 * zweites Verhalten.
 *
 * Ohne eigene Wörterbuch-Schlüssel: Titel ist der Dienstname, die Unterzeile
 * setzt sich aus `eigenerBereich` und `personenCount` zusammen.
 */
export function ServicePersonsSheet({ svcKey }: { svcKey: string }) {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  const [suche, setSuche] = useState('')
  const dlg = useRef<HTMLDivElement>(null)
  const close = () => dispatch({ type: 'closeServiceSheet' })
  useDialogFocus(dlg)
  useBackDismiss(true, close)
  useEscape(close)
  useSwipeDown(dlg, close)

  const service = state.services.find((s) => s.key === svcKey)
  const qkey = serviceQualKey(svcKey)
  // Dieselbe Ordnung wie in der Personenliste — wer dort sucht, sucht hier
  // gleich.
  const personen = useMemo(() => [...state.persons].sort(personCompare), [state.persons])
  if (!service) return null

  const query = suche.trim().toLowerCase()
  const gefiltert = personen.filter((p) => !query || listName(p).toLowerCase().includes(query))
  const frei = state.persons.filter((p) => isQualified(p, qkey)).length

  return (
    <>
      <div className="sheet-backdrop" onClick={close} />
      <div
        className="sheet sheet--lang"
        role="dialog"
        aria-modal="true"
        aria-label={tu(service.name)}
        ref={dlg}
      >
        <span className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <div>
            <div className="sheet-title">{tu(service.name)}</div>
            <div className="sheet-sub">
              {t.eigenerBereich} · {fill(t.personenCount, { n: frei })}
            </div>
          </div>
          <button type="button" className="sheet-close" aria-label={t.a11yClose} onClick={close}>
            ✕
          </button>
        </div>
        <input
          type="text"
          className="lang-search"
          placeholder={t.suchen}
          aria-label={t.suchen}
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
        />
        <div className="lang-list svc-persons">
          {gefiltert.map((person) => (
            <PrivToggle
              key={person.id}
              qkey={qkey}
              label={listName(person)}
              person={person}
              update={(patch) => dispatch({ type: 'updatePerson', id: person.id, patch })}
            />
          ))}
        </div>
      </div>
    </>
  )
}
