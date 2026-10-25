import { useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../app/context'
import { BlattFeld } from '../bausteine/BlattFeld'
import { Wahl } from '../bausteine/Wahl'
import { Sheet } from '../components/Sheet'
import { ROLE_ORDER } from '../data/constants'
import { emptyQualifications, namensDublette, personLabel } from '../data/helpers'
import type { Role } from '../data/types'
import { ROLE_KEY } from '../i18n/ui'
import { fill, useT } from '../i18n/useT'

type Geschlecht = 'm' | 'w'

/**
 * **Person anlegen** (T121, Entwurf `GPersonNeu`): Name, E-Mail (freiwillig),
 * Geschlecht, Gruppe und Rolle — erst „Hinzufügen" legt sie an und öffnet sie.
 * Aufgabenbereiche und Rechte stehen danach bei der Person.
 *
 * Bis dahin legte „Neue Person" sofort eine leere an, die selbst speicherte:
 * Wer es sich anders überlegte, hatte eine namenlose Person in der Liste.
 *
 * Vor- und Nachname getrennt statt eines Felds „Name" wie im Entwurf: Die App
 * sortiert und sucht nach dem Nachnamen, und „Maria de la Cruz" teilt keine
 * Regel richtig auf. Der Link zum Anmelden kommt mit Phase 8.
 */
export function PersonAnlegenBlatt({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  const [fn, setFn] = useState('')
  const [ln, setLn] = useState('')
  const [mail, setMail] = useState('')
  const [geschlecht, setGeschlecht] = useState<Geschlecht>('m')
  const [grp, setGrp] = useState('')
  const [role, setRole] = useState<Role>('verkuendiger')
  const fehlerId = useId()

  const name = { id: '', fn: fn.trim(), ln: ln.trim() }
  // Dieselbe Regel wie im Detail und in der Datenbank (`persons_name_eindeutig`, T110).
  const dublette = namensDublette(state.persons, name)
  const bereit = (name.fn !== '' || name.ln !== '') && dublette === undefined

  const anlegen = () => {
    if (!bereit) return
    dispatch({
      type: 'addPerson',
      person: {
        ...name,
        id: crypto.randomUUID(),
        mail: mail.trim(),
        female: geschlecht === 'w',
        grp: grp || null,
        role,
        priv: emptyQualifications(),
      },
    })
    onClose()
  }

  const namensFeld = (marke: string, wert: string, setzen: (v: string) => void) => (
    <BlattFeld marke={marke}>
      <input
        className="feld"
        type="text"
        dir="auto"
        autoComplete="off"
        value={wert}
        aria-invalid={dublette ? true : undefined}
        aria-describedby={dublette ? fehlerId : undefined}
        onChange={(e) => setzen(e.target.value)}
      />
    </BlattFeld>
  )

  return createPortal(
    <Sheet label={t.personAnlegen} title={t.personAnlegen} onClose={onClose}>
      <form
        className="sheet-formular"
        onSubmit={(e) => {
          e.preventDefault()
          anlegen()
        }}
      >
        <div className="sheet-inhalt blatt-felder">
          {namensFeld(t.vorname, fn, setFn)}
          {namensFeld(t.nachname, ln, setLn)}
          {dublette && (
            <p id={fehlerId} className="feld-fehler" role="alert" dir="auto">
              {fill(t.nameDoppelt, { name: personLabel(dublette) })}
            </p>
          )}
          <BlattFeld marke={t.emailFreiwillig}>
            <input
              className="feld"
              type="email"
              dir="auto"
              autoComplete="off"
              value={mail}
              onChange={(e) => setMail(e.target.value)}
            />
          </BlattFeld>
          {/* Keine `BlattFeld`: Ein `<label>` um die Knöpfe drückte beim Tipp
              auf die Marke den ersten davon. */}
          <div className="blatt-feld">
            <span className="feld-marke">{t.geschlecht}</span>
            <Wahl
              label={t.geschlecht}
              optionen={[
                { wert: 'm', text: t.bruder },
                { wert: 'w', text: t.schwester },
              ]}
              wert={geschlecht}
              onWahl={setGeschlecht}
            />
          </div>
          {state.groups.length > 0 && (
            <BlattFeld marke={t.gruppeLbl}>
              <select className="feld-wahl" value={grp} onChange={(e) => setGrp(e.target.value)}>
                <option value="">—</option>
                {state.groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {tu(g.name)}
                  </option>
                ))}
              </select>
            </BlattFeld>
          )}
          <BlattFeld marke={t.rolle}>
            <select className="feld-wahl" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLE_ORDER.map((r) => (
                <option key={r} value={r}>
                  {t[ROLE_KEY[r]]}
                </option>
              ))}
            </select>
          </BlattFeld>
          <p className="klein-text">{t.personAnlegenHinweis}</p>
        </div>
        <div className="sheet-fuss">
          {/* „Hinzufügen" wie in den übrigen Blättern, die etwas Neues anlegen
              (Treffpunkt, Gruppenbesuch). */}
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
