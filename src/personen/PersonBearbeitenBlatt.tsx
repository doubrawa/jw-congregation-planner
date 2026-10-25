import { useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../app/context'
import { BlattFeld } from '../bausteine/BlattFeld'
import { Wahl } from '../bausteine/Wahl'
import { EntfernenKnopf } from '../components/EntfernenKnopf'
import { Sheet } from '../components/Sheet'
import { ROLE_ORDER } from '../data/constants'
import { familyMembers, isNameless, namensDublette, personCompare, personLabel } from '../data/helpers'
import type { Person, Role } from '../data/types'
import { ROLE_KEY } from '../i18n/ui'
import { fill, useT } from '../i18n/useT'

/**
 * **Person bearbeiten** (T121, der Stift bei der Person): Name, E-Mail,
 * Geschlecht, Gruppe, Rolle und Familie. Eine Telefonnummer stand bis zum
 * 25.10.2026 dabei — gebraucht hat sie niemand, gezeigt wurde sie nirgends.
 *
 * **Der Name gilt erst beim Schließen** — und nur, wenn er geht. Bis zur Phase
 * 6b schrieb jeder Tastendruck den Namen in Zustand und Wochen; dafür brauchte
 * es das Anhalten beim Speichern (`persist.ts`) und den Rücksprung beim
 * Verlassen (`dubletteVerwerfen`), und wer beide Felder leerte und ging, dem
 * verwarf die App die Person samt Zeile in der Datenbank. Jetzt bleibt der Name
 * im Blatt, bis es zugeht: eindeutig und nicht leer, dann wird er übernommen;
 * sonst bleibt der alte, und ein Hinweis sagt, warum. Alles Übrige gilt sofort,
 * wie in den anderen Blättern — auch die Gruppe: Wer sie wechselt, ist in der
 * alten nicht mehr Aufseher oder Gehilfe, und das steht vorher unter dem Feld.
 */
export function PersonBearbeitenBlatt({ person, onClose }: { person: Person; onClose: () => void }) {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  const [fn, setFn] = useState(person.fn)
  const [ln, setLn] = useState(person.ln)
  const fehlerId = useId()
  const amtHinweisId = useId()
  const update = (patch: Partial<Person>) => dispatch({ type: 'updatePerson', id: person.id, patch })

  const name = { id: person.id, fn: fn.trim(), ln: ln.trim() }
  // Dieselbe Regel wie beim Anlegen und in der Datenbank (`persons_name_eindeutig`, T110).
  const dublette = namensDublette(state.persons, name)
  const leer = isNameless(name)

  const schliessen = () => {
    if (name.fn !== person.fn || name.ln !== person.ln) {
      if (dublette) dispatch({ type: 'showToast', text: fill(t.toastNameNichtGeaendert, { name: personLabel(dublette) }) })
      else if (leer) dispatch({ type: 'showToast', text: t.toastNameLeer })
      else update({ fn: name.fn, ln: name.ln })
    }
    onClose()
  }

  const eigeneGruppe = state.groups.find((g) => g.id === person.grp)
  const amtHinweis =
    eigeneGruppe?.overseerId === person.id
      ? t.gruppeWechselAufseher
      : eigeneGruppe?.assistantId === person.id
        ? t.gruppeWechselGehilfe
        : null

  const familie = familyMembers(state.persons, person)
  const imHaushalt = new Set([person.id, ...familie.map((m) => m.id)])
  const hinzufuegbar = state.persons.filter((p) => !imHaushalt.has(p.id)).sort((a, b) => personCompare(a, b, state.lang))

  const namensFeld = (id: string, marke: string, wert: string, setzen: (v: string) => void) => (
    <BlattFeld marke={marke}>
      {/* `dir="auto"`: Was hier steht, gehört der Person, nicht der App — ein
          arabischer Name steht von rechts nach links, ein lateinischer von
          links nach rechts. */}
      <input
        id={id}
        className="feld"
        type="text"
        dir="auto"
        autoComplete="off"
        value={wert}
        aria-invalid={dublette || leer ? true : undefined}
        aria-describedby={dublette || leer ? fehlerId : undefined}
        onChange={(e) => setzen(e.target.value)}
      />
    </BlattFeld>
  )

  return createPortal(
    <Sheet variante="lang" label={t.personBearbeiten} title={t.personBearbeiten} onClose={schliessen}>
      <div className="sheet-inhalt blatt-felder">
        {namensFeld('pers-fn', t.vorname, fn, setFn)}
        {namensFeld('pers-ln', t.nachname, ln, setLn)}
        {(dublette || leer) && (
          /* Direkt unter den Namen, auf die er sich bezieht. `role="alert"` liest
             ein Vorleseprogramm vor, sobald er erscheint. */
          <p id={fehlerId} className="feld-fehler" role="alert" dir="auto">
            {dublette ? fill(t.nameDoppelt, { name: personLabel(dublette) }) : t.toastNameLeer}
          </p>
        )}
        <BlattFeld marke={t.emailLbl}>
          <input
            id="pers-mail"
            className="feld"
            type="email"
            dir="auto"
            autoComplete="off"
            value={person.mail ?? ''}
            onChange={(e) => update({ mail: e.target.value })}
          />
        </BlattFeld>
        {/* Keine `BlattFeld`: Ein `<label>` um die Knöpfe drückte beim Tipp auf
            die Marke den ersten davon. */}
        <div className="blatt-feld">
          <span className="feld-marke">{t.geschlecht}</span>
          <Wahl
            label={t.geschlecht}
            optionen={[
              { wert: 'm', text: t.bruder },
              { wert: 'w', text: t.schwester },
            ]}
            wert={person.female ? 'w' : 'm'}
            onWahl={(g) => update({ female: g === 'w' })}
          />
        </div>
        {state.groups.length > 0 && (
          <BlattFeld marke={t.gruppeLbl}>
            <select
              id="pers-grp"
              className="feld-wahl"
              value={person.grp ?? ''}
              aria-describedby={amtHinweis ? amtHinweisId : undefined}
              onChange={(e) => update({ grp: e.target.value || null })}
            >
              <option value="">—</option>
              {state.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {tu(g.name)}
                </option>
              ))}
            </select>
          </BlattFeld>
        )}
        {/* Vorher sagen, was ein Wechsel mitnimmt: das Amt in dieser Gruppe (`aemterBeenden`). */}
        {amtHinweis && (
          <p id={amtHinweisId} className="klein-text">
            {amtHinweis}
          </p>
        )}
        <BlattFeld marke={t.rolle}>
          <select
            id="pers-rolle"
            className="feld-wahl"
            value={person.role}
            onChange={(e) => update({ role: e.target.value as Role })}
          >
            {ROLE_ORDER.map((r) => (
              <option key={r} value={r}>
                {t[ROLE_KEY[r]]}
              </option>
            ))}
          </select>
        </BlattFeld>
        <div className="blatt-feld">
          <span className="feld-marke">{t.familieLabel}</span>
          {familie.length > 0 && (
            <div className="person-familie">
              {familie.map((m) => (
                <span key={m.id} className="person-familie-chip" dir="auto">
                  {personLabel(m)}
                  <EntfernenKnopf
                    className="person-familie-weg"
                    frage={t.entfernenSicher}
                    onEntfernen={() => dispatch({ type: 'setFamily', id: person.id, memberId: m.id, add: false })}
                  />
                </span>
              ))}
            </div>
          )}
          <select
            className="feld-wahl"
            aria-label={t.familieHinzu}
            value=""
            onChange={(e) => {
              if (e.target.value) dispatch({ type: 'setFamily', id: person.id, memberId: e.target.value, add: true })
            }}
          >
            <option value="">{t.familieHinzu}</option>
            {hinzufuegbar.map((p) => (
              <option key={p.id} value={p.id}>
                {personLabel(p)}
              </option>
            ))}
          </select>
          <p className="klein-text">{t.familieHint}</p>
        </div>
      </div>
      <div className="sheet-fuss-ende">
        <button type="button" className="knopf-haupt" onClick={schliessen}>
          {t.fertig}
        </button>
      </div>
    </Sheet>,
    document.body,
  )
}
