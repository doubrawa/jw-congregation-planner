import { useState } from 'react'
import { useApp } from '../app/context'
import { QUALIFICATION_ORDER, WT_ROLE_ORDER } from '../data/constants'
import { initials, roleLabel } from '../data/helpers'
import { fill, useT } from '../i18n/useT'
import { PRIV_KEY, ROLE_KEY } from '../i18n/ui'
import type { Person, QualificationKey, Role } from '../data/types'
import './personen.css'

const ROLE_ORDER: readonly Role[] = ['aeltester', 'dienstamtgehilfe', 'verkuendiger']

const EMPTY_PRIV: Person['priv'] = {
  vorsitz: false,
  vortrag: false,
  gebet: false,
  lesen: false,
  schulung: false,
  studium: false,
  mikrofon: false,
  ton: false,
  ordner: false,
}

/**
 * Personen (Screen 5, nur Planer): Liste mit Live-Suche und Detail mit
 * Stammdaten, Rollen-Chips und den 9 Aufgabenbereich-Toggles.
 */
export function PersonenScreen() {
  const { state } = useApp()
  const selected = state.persons.find((p) => p.id === state.selectedPersonId)
  return selected ? <PersonDetail person={selected} /> : <PersonList />
}

function PersonList() {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  const [search, setSearch] = useState('')

  const query = search.trim().toLowerCase()
  const filtered = state.persons.filter(
    (p) => !query || `${p.fn} ${p.ln}`.toLowerCase().includes(query),
  )

  const addPerson = () => {
    dispatch({
      type: 'addPerson',
      person: {
        id: crypto.randomUUID(),
        fn: '',
        ln: '',
        role: 'verkuendiger',
        tel: '',
        mail: '',
        absent: [],
        priv: { ...EMPTY_PRIV },
      },
    })
  }

  return (
    <section className="screen">
      <div className="screen-head">
        <h1 className="screen-title">{t.personen}</h1>
        <span className="screen-head-note">{fill(t.personenCount, { n: state.persons.length })}</span>
      </div>

      <input
        type="text"
        className="pers-search"
        placeholder={t.suchen}
        aria-label={t.suchen}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <button type="button" className="btn-outline pers-add" onClick={addPerson}>
        {t.neuePerson}
      </button>

      <div className="pers-list">
        {filtered.map((person) => (
          <button
            key={person.id}
            type="button"
            className="pers-row"
            onClick={() => dispatch({ type: 'selectPerson', id: person.id })}
          >
            <span className="avatar avatar--tint avatar--40">{initials(person)}</span>
            <span>
              <span className="pers-name">{`${person.fn} ${person.ln}`.trim() || '—'}</span>
              <span className="pers-sub">
                {tu(roleLabel(person))} ·{' '}
                {fill(t.aufgabenbereicheN, { n: Object.values(person.priv).filter(Boolean).length })}
              </span>
            </span>
            <span className="pers-chevron">›</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function PersonDetail({ person }: { person: Person }) {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  const update = (patch: Partial<Person>) =>
    dispatch({ type: 'updatePerson', id: person.id, patch })

  const fields: Array<[keyof Person & ('fn' | 'ln' | 'tel' | 'mail'), string]> = [
    ['fn', t.vorname],
    ['ln', t.nachname],
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
          <h1 className="pers-detail-name">{`${person.fn} ${person.ln}`.trim() || '—'}</h1>
          <div className="pers-detail-sub">
            {tu(roleLabel(person))} · {fill(t.congLabel, { name: state.congregation.name })}
          </div>
        </div>
      </div>

      <div className="panel panel--lead panel--pb16" data-farbe="neutral">
        <div className="panel-label">{t.stammdaten}</div>
        {fields.map(([key, label]) => (
          <div key={key} className="pers-field">
            <label className="field-label" htmlFor={`pers-${key}`}>
              {label}
            </label>
            <input
              id={`pers-${key}`}
              className="field-input"
              type="text"
              value={person[key]}
              onChange={(e) => update({ [key]: e.target.value })}
            />
          </div>
        ))}
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
      </div>

      <div className="panel panel--pb10" data-farbe="petrol">
        <div className="panel-label">{t.aufgabenbereiche}</div>
        {QUALIFICATION_ORDER.map((key) => (
          <PrivToggle key={key} qkey={key} person={person} update={update} />
        ))}
      </div>

      <div className="panel panel--pb10" data-farbe="gold">
        <div className="panel-label">{t.wtRollenLabel}</div>
        <p className="panel-hint">{t.wtRollenHint}</p>
        {WT_ROLE_ORDER.map((key) => (
          <PrivToggle key={key} qkey={key} person={person} update={update} />
        ))}
      </div>

      <button
        type="button"
        className="btn-primary pers-save"
        onClick={() => dispatch({ type: 'savePerson' })}
      >
        {t.speichern}
      </button>
    </section>
  )
}

/** Einzelner Aufgabenbereich-/Rollen-Schalter im Personen-Detail. */
function PrivToggle({
  qkey,
  person,
  update,
}: {
  qkey: QualificationKey
  person: Person
  update: (patch: Partial<Person>) => void
}) {
  const { t } = useT()
  const on = Boolean(person.priv[qkey])
  return (
    <div className="priv-row">
      <span className="priv-label">{t[PRIV_KEY[qkey]]}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={t[PRIV_KEY[qkey]]}
        className={on ? 'switch is-on' : 'switch'}
        onClick={() => update({ priv: { ...person.priv, [qkey]: !on } })}
      >
        <span className="switch-knob" />
      </button>
    </div>
  )
}
