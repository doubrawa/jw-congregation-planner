import { useState } from 'react'
import { useApp } from '../app/context'
import { AbsencePanel } from '../components/AbsencePanel'
import { QUALIFICATION_ORDER, ROLE_ORDER, WT_ROLE_ORDER } from '../data/constants'
import { familyMembers, initials, personCompare, personLabel, serviceQualKey } from '../data/helpers'
import { LOCALES } from '../i18n/langs'
import { fill, useT } from '../i18n/useT'
import { ROLE_KEY } from '../i18n/ui'
import type { Person } from '../data/types'
import { KontoCard } from './KontoCard'
import { PersonTimeline } from './PersonTimeline'
import { privLabel } from './priv-label'
import { PlannerToggle, PrivToggle } from './PrivToggle'

/**
 * Personen-Detail: Stammdaten, Geschlecht/Rolle/Gruppe, die Aufgabenbereich-
 * Toggles (feste Bereiche + je konfiguriertem Hilfsdienst einer), die festen
 * Wachtturm-Rollen samt Planer-Recht, im Produktionsmodus die Konto-Karte.
 */
export function PersonDetail({ person }: { person: Person }) {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  // Zwei-Tipp-Bestaetigung des Loeschens (siehe unten).
  const [loeschArmed, setLoeschArmed] = useState(false)
  const update = (patch: Partial<Person>) =>
    dispatch({ type: 'updatePerson', id: person.id, patch })

  const family = familyMembers(state.persons, person)
  const famIds = new Set([person.id, ...family.map((m) => m.id)])
  const addableFamily = state.persons.filter((p) => !famIds.has(p.id)).sort(personCompare)

  /**
   * Zwei Bereiche statt einem, jeder für sich alphabetisch: Aufgaben und
   * Hilfsdienste sind verschiedene Dinge — die einen kommen aus dem Programm,
   * die anderen aus den Einstellungen der Versammlung —, und in einer Liste
   * aus einem Dutzend Schaltern sucht man nach dem Wort, nicht nach der
   * Programmreihenfolge.
   *
   * Sortiert wird nach der **übersetzten** Beschriftung (wie in der
   * Filterleiste der Liste). Nach dem Schlüssel stünde jede Sprache in
   * deutscher Reihenfolge da. `numeric` hält „Ordner 2" vor „Ordner 10".
   */
  const locale = LOCALES[state.lang]
  const nachLabel = (a: { label: string }, b: { label: string }): number =>
    a.label.localeCompare(b.label, locale, { numeric: true })

  const aufgaben = QUALIFICATION_ORDER.map((key) => ({ key, label: privLabel(t, key) })).sort(
    nachLabel,
  )
  // Je Hilfsdienst ein Bereich; Gruppen-Dienste (Reinigung) rotieren Gruppen
  // statt Personen und haben deshalb keinen.
  const hilfsdienste = state.services
    .filter((service) => !service.groups)
    .map((service) => ({ key: serviceQualKey(service.key), label: tu(service.name) }))
    .sort(nachLabel)

  const fields: Array<[keyof Person & ('fn' | 'ln' | 'dn' | 'tel' | 'mail'), string]> = [
    ['fn', t.vorname],
    ['ln', t.nachname],
    ['dn', t.anzeigename],
    ['tel', t.telefon],
    ['mail', t.emailLbl],
  ]

  return (
    <section className="screen">
      <button
        type="button"
        className="pers-back"
        onClick={() => dispatch({ type: 'selectPerson', id: null })}
      >
        <span className="pers-back-chev" aria-hidden="true">
          ‹
        </span>
        {t.allePersonen.replace(/^[‹›]\s*/, '')}
      </button>

      <div className="pers-detail-head">
        <span className="avatar avatar--tint avatar--54">{initials(person)}</span>
        <div>
          <h1 className="pers-detail-name" dir="auto">{personLabel(person)}</h1>
          <div className="pers-detail-sub">
            {t[ROLE_KEY[person.role]]} · {fill(t.congLabel, { name: state.congregation.name })}
          </div>
        </div>
      </div>

      <div className="panel panel--lead panel--pb16" data-farbe="neutral">
        <h2 className="panel-label">{t.stammdaten}</h2>
        {fields.map(([key, label]) => (
          <div key={key} className="pers-field">
            <label className="field-label" htmlFor={`pers-${key}`}>
              {label}
            </label>
            {/*
              `dir="auto"` statt der Richtung der Oberfläche: Was hier steht,
              gehört einer Person, nicht der App. Ein arabischer Name soll von
              rechts nach links stehen, ein lateinischer von links nach rechts —
              und eine **Telefonnummer** immer von links nach rechts.

              Der letzte Fall ist der, der wirklich falsch aussah: In einer
              rechts-nach-links-Oberfläche zerlegt der Bidi-Algorithmus
              „+49 159 774 21 08" an den Leerzeichen und dreht die Blöcke um —
              angezeigt stand „08 21 774 159 49+". Keine falsche Zeichenkette,
              aber eine falsche Nummer. `auto` nimmt das erste Zeichen mit
              starker Richtung; die Nummer hat keines und läuft deshalb links
              nach rechts.
            */}
            <input
              id={`pers-${key}`}
              className="field-input"
              type="text"
              dir="auto"
              value={person[key] ?? ''}
              onChange={(e) => update({ [key]: e.target.value })}
            />
          </div>
        ))}
        <div className="pers-role-block">
          <div className="field-label">{t.geschlecht}</div>
          <div className="role-chips">
            <button
              type="button"
              className={!person.female ? 'role-chip is-active' : 'role-chip'}
              aria-pressed={!person.female}
              onClick={() => update({ female: false })}
            >
              {t.bruder}
            </button>
            <button
              type="button"
              className={person.female ? 'role-chip is-active' : 'role-chip'}
              aria-pressed={Boolean(person.female)}
              onClick={() => update({ female: true })}
            >
              {t.schwester}
            </button>
          </div>
        </div>
        <div className="pers-role-block">
          <div className="field-label">{t.rolle}</div>
          <div className="role-chips">
            {ROLE_ORDER.map((role) => (
              <button
                key={role}
                type="button"
                className={person.role === role ? 'role-chip is-active' : 'role-chip'}
                aria-pressed={person.role === role}
                onClick={() => update({ role })}
              >
                {t[ROLE_KEY[role]]}
              </button>
            ))}
          </div>
        </div>
        <div className="pers-role-block">
          <label className="field-label" htmlFor="pers-grp">
            {t.gruppeLbl}
          </label>
          <select
            id="pers-grp"
            className="mem-select pers-grp-select"
            value={person.grp ?? ''}
            onChange={(e) => update({ grp: e.target.value || null })}
          >
            <option value="">—</option>
            {state.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {tu(g.name)}
              </option>
            ))}
          </select>
        </div>
        <div className="pers-role-block">
          <div className="field-label">{t.familieLabel}</div>
          {family.length > 0 && (
            <div className="fam-list">
              {family.map((m) => (
                <span key={m.id} className="fam-chip">
                  {personLabel(m)}
                  <button
                    type="button"
                    className="fam-remove"
                    aria-label={t.a11yRemove}
                    onClick={() =>
                      dispatch({ type: 'setFamily', id: person.id, memberId: m.id, add: false })
                    }
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
          <select
            className="mem-select pers-grp-select"
            aria-label={t.familieHinzu}
            value=""
            onChange={(e) => {
              if (e.target.value)
                dispatch({ type: 'setFamily', id: person.id, memberId: e.target.value, add: true })
            }}
          >
            <option value="">{t.familieHinzu}</option>
            {addableFamily.map((p) => (
              <option key={p.id} value={p.id}>
                {personLabel(p)}
              </option>
            ))}
          </select>
          <p className="panel-hint">{t.familieHint}</p>
        </div>
      </div>

      <PersonTimeline person={person} />

      {/*
       * Nur das Eingabe-Formular: Die eingetragenen Zeiträume stehen oben in
       * der Zeitleiste, mit Beginn und Ende als eigene Punkte und der Strecke
       * dazwischen eingefärbt. Eine zweite Liste darunter wiederholte sie nur —
       * und zeigte gerade das nicht, worauf es ankommt: welche Zuteilung in
       * einen Zeitraum fällt.
       */}
      <AbsencePanel personId={person.id} entries={[]} listLabel={t.eintraege} showList={false} />

      <div className="panel panel--pb10" data-farbe="petrol">
        <h2 className="panel-label">{t.aufgabenbereiche}</h2>
        {aufgaben.map(({ key, label }) => (
          <PrivToggle key={key} qkey={key} label={label} person={person} update={update} bruderLabel={t.bruder} />
        ))}
      </div>

      <div className="panel panel--pb10" data-farbe="neutral2">
        <h2 className="panel-label">{t.hilfsdienste}</h2>
        {hilfsdienste.map(({ key, label }) => (
          <PrivToggle key={key} qkey={key} label={label} person={person} update={update} />
        ))}
      </div>

      <div className="panel panel--pb10" data-farbe="acc">
        <h2 className="panel-label">{t.wtRollenLabel}</h2>
        <p className="panel-hint">{t.wtRollenHint}</p>
        {WT_ROLE_ORDER.map((key) => (
          <PrivToggle key={key} qkey={key} label={privLabel(t, key)} person={person} update={update} bruderLabel={t.bruder} />
        ))}
        <PlannerToggle person={person} update={update} />
      </div>

      {state.dataStatus !== 'demo' && <KontoCard person={person} />}

      {/* Zwei-Tipp-Bestätigung wie beim Leeren der Zuteilungen (AutoAssignPanel):
          der erste Tipp bewaffnet den Button und nennt die Folge, erst der
          zweite löscht. Der native window.confirm war der einzige im Projekt —
          er sieht auf jedem Gerät anders aus, ignoriert Theme und Schriftgröße
          und lässt sich nicht übersetzen, wo der Browser es nicht tut. */}
      <button
        type="button"
        className={`pers-delete${loeschArmed ? ' is-armed' : ''}`}
        onClick={() => {
          if (!loeschArmed) {
            setLoeschArmed(true)
            return
          }
          setLoeschArmed(false)
          dispatch({ type: 'removePerson', id: person.id })
        }}
        onBlur={() => setLoeschArmed(false)}
      >
        {loeschArmed ? fill(t.confirmPersonDel, { name: personLabel(person) }) : t.persLoeschen}
      </button>
    </section>
  )
}
